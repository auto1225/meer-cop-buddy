/**
 * 사진 전송 시스템
 * 
 * 보안 이벤트 발생 시 촬영된 사진을 Supabase Broadcast 채널을 통해
 * 스마트폰으로 즉시 전송합니다.
 * 
 * - 온라인: Broadcast로 즉시 전송
 * - 오프라인: IndexedDB 큐에 저장 → 네트워크 복구 시 자동 재전송
 * - 사진은 2장씩 묶어 전송 (메시지 크기 제한 대응)
 */

import { supabaseShared } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

const PHOTOS_PER_CHUNK = 2; // 한 메시지당 사진 수
const CHUNK_DELAY_MS = 300; // 청크 간 전송 간격
const PENDING_QUEUE_KEY = "meercop_pending_photos";
const MAX_PENDING = 5; // 최대 대기 큐 수

export interface PhotoTransmission {
  id: string;
  device_id: string;
  device_name?: string;
  event_type: string;
  photos: string[]; // base64 JPEG data URLs
  change_percent?: number;
  latitude?: number;
  longitude?: number;
  location_source?: string;
  auto_streaming?: boolean;
  batch_id?: string;      // 동일 이벤트의 여러 전송을 묶는 배치 ID
  batch_total?: number;   // 배치 내 총 전송 시퀀스 수
  created_at: string;
}

interface PendingTransmission extends PhotoTransmission {
  retry_count: number;
}

// ============ Offline Queue (localStorage) ============

function getPendingQueue(): PendingTransmission[] {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingQueue(queue: PendingTransmission[]): void {
  try {
    // 최대 개수 유지
    const trimmed = queue.slice(-MAX_PENDING);
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error("[PhotoTx] Failed to save pending queue:", e);
  }
}

function addToPendingQueue(tx: PhotoTransmission): void {
  const queue = getPendingQueue();
  queue.push({ ...tx, retry_count: 0 });
  savePendingQueue(queue);
  console.log("[PhotoTx] Added to pending queue:", tx.id);
}

function removeFromPendingQueue(id: string): void {
  const queue = getPendingQueue().filter(item => item.id !== id);
  savePendingQueue(queue);
}

// ============ Broadcast Transmission ============

/**
 * 사진을 청크로 나눠 Broadcast 전송
 * 
 * 전송 프로토콜:
 * 1. "photo_alert_start" - 전송 시작 (메타데이터)
 * 2. "photo_alert_chunk" - 사진 청크 (2장씩)
 * 3. "photo_alert_end" - 전송 완료
 */
async function sendViaChannel(
  channel: RealtimeChannel,
  tx: PhotoTransmission
): Promise<boolean> {
  try {
    // 1. 전송 시작 알림 (6-1: device_name 포함)
    const startResult = await channel.send({
      type: "broadcast",
      event: "photo_alert_start",
      payload: {
        id: tx.id,
        device_id: tx.device_id,
        device_name: tx.device_name,
        event_type: tx.event_type,
        total_photos: tx.photos.length,
        change_percent: tx.change_percent,
        batch_id: tx.batch_id,
        batch_total: tx.batch_total,
        created_at: tx.created_at,
      },
    });

    if (startResult !== "ok") {
      console.error("[PhotoTx] Failed to send start:", startResult);
      return false;
    }

    // 2. 사진을 청크로 나눠 전송
    const chunks: string[][] = [];
    for (let i = 0; i < tx.photos.length; i += PHOTOS_PER_CHUNK) {
      chunks.push(tx.photos.slice(i, i + PHOTOS_PER_CHUNK));
    }

    for (let i = 0; i < chunks.length; i++) {
      // 청크 간 딜레이
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));
      }

      const chunkResult = await channel.send({
        type: "broadcast",
        event: "photo_alert_chunk",
        payload: {
          id: tx.id,
          chunk_index: i,
          total_chunks: chunks.length,
          photos: chunks[i],
        },
      });

      if (chunkResult !== "ok") {
        console.error(`[PhotoTx] Failed to send chunk ${i}:`, chunkResult);
        return false;
      }

      console.log(`[PhotoTx] Sent chunk ${i + 1}/${chunks.length}`);
    }

    // 3. 전송 완료 알림 (6-3: location_source 포함)
    await channel.send({
      type: "broadcast",
      event: "photo_alert_end",
      payload: {
        id: tx.id,
        total_photos: tx.photos.length,
        latitude: tx.latitude,
        longitude: tx.longitude,
        location_source: tx.location_source,
        auto_streaming: tx.auto_streaming ?? false,
      },
    });

    console.log("[PhotoTx] ✅ All photos sent successfully:", tx.id);
    return true;
  } catch (error) {
    console.error("[PhotoTx] Send error:", error);
    return false;
  }
}

// ============ Photo Transmitter Class ============

export class PhotoTransmitter {
  private channel: RealtimeChannel | null = null;
  private deviceId: string;
  private userId: string;
  private isConnected = false;
  private onlineHandler: (() => void) | null = null;

  constructor(deviceId: string, userId?: string) {
    this.deviceId = deviceId;
    this.userId = userId || deviceId;
    this.setupChannel();
    this.setupOnlineListener();
  }

  private setupChannel(): void {
    // 기존 채널 확인 (싱글톤)
    const channelName = `user-photos-${this.userId}`;
    const existing = supabaseShared.getChannels().find(
      ch => ch.topic === `realtime:${channelName}`
    );

    if (existing) {
      this.channel = existing;
      this.isConnected = true;
      console.log("[PhotoTx] Reusing existing channel");
      return;
    }

    this.channel = supabaseShared.channel(channelName);
    this.channel.subscribe((status) => {
      console.log("[PhotoTx] Channel status:", status);
      if (status === "SUBSCRIBED") {
        this.isConnected = true;
        // 연결 시 대기 큐 재전송
        this.flushPendingQueue();
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        this.isConnected = false;
      }
    });
  }

  private setupOnlineListener(): void {
    this.onlineHandler = () => {
      console.log("[PhotoTx] Network back online, flushing queue...");
      // 채널이 아직 연결 안됐으면 재설정
      if (!this.isConnected) {
        this.setupChannel();
      }
      // 약간의 딜레이 후 큐 전송 (네트워크 안정화 대기)
      setTimeout(() => this.flushPendingQueue(), 2000);
    };
    window.addEventListener("online", this.onlineHandler);
  }

  /**
   * 사진 전송 (핵심 메서드)
   * 
   * 1. IndexedDB에 항상 백업 저장 (호출자가 처리)
   * 2. 온라인이면 Broadcast 전송
   * 3. 오프라인이면 큐에 저장
   */
  async transmit(tx: PhotoTransmission): Promise<boolean> {
    // 온라인 + 채널 연결 시 즉시 전송
    if (navigator.onLine && this.isConnected && this.channel) {
      const success = await sendViaChannel(this.channel, tx);
      if (success) {
        return true;
      }
      // 전송 실패 → 큐에 저장
      console.log("[PhotoTx] Direct send failed, queuing...");
    }

    // 오프라인이거나 전송 실패 → 큐에 저장
    addToPendingQueue(tx);
    return false;
  }

  /** 대기 큐의 미전송 사진들을 재전송 */
  private async flushPendingQueue(): Promise<void> {
    if (!this.isConnected || !this.channel) return;

    const queue = getPendingQueue();
    if (queue.length === 0) return;

    console.log(`[PhotoTx] Flushing ${queue.length} pending transmissions...`);

    for (const pending of queue) {
      const success = await sendViaChannel(this.channel, pending);
      if (success) {
        removeFromPendingQueue(pending.id);
      } else {
        // 실패하면 나머지도 중단
        console.log("[PhotoTx] Flush stopped due to send failure");
        break;
      }
      // 항목 간 딜레이
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /** 정리 */
  destroy(): void {
    if (this.onlineHandler) {
      window.removeEventListener("online", this.onlineHandler);
    }
    if (this.channel) {
      supabaseShared.removeChannel(this.channel);
    }
    this.channel = null;
    this.isConnected = false;
  }
}
