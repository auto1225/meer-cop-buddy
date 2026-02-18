/**
 * ChannelManager 싱글톤 (§2-4)
 * 
 * Supabase Realtime 채널의 중복 구독을 방지하고
 * 일괄 정리(cleanup)를 지원합니다.
 */
import { supabaseShared } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

class ChannelManager {
  private channels = new Map<string, RealtimeChannel>();

  /**
   * 이름으로 채널을 가져오거나 새로 생성합니다.
   * 이미 존재하면 기존 채널을 반환합니다.
   */
  getOrCreate(name: string, opts?: Parameters<typeof supabaseShared.channel>[1]): RealtimeChannel {
    const existing = this.channels.get(name);
    if (existing) return existing;

    // 혹시 Supabase 내부에 같은 토픽이 남아있으면 제거
    const stale = supabaseShared
      .getChannels()
      .find((ch) => ch.topic === `realtime:${name}`);
    if (stale) {
      supabaseShared.removeChannel(stale);
    }

    const ch = supabaseShared.channel(name, opts);
    this.channels.set(name, ch);
    return ch;
  }

  /**
   * 이름으로 채널 조회 (없으면 undefined)
   */
  get(name: string): RealtimeChannel | undefined {
    return this.channels.get(name);
  }

  /**
   * 채널 제거 및 구독 해제
   */
  remove(name: string): void {
    const ch = this.channels.get(name);
    if (ch) {
      supabaseShared.removeChannel(ch);
      this.channels.delete(name);
    }
  }

  /**
   * 모든 채널 일괄 제거
   */
  removeAll(): void {
    this.channels.forEach((ch) => supabaseShared.removeChannel(ch));
    this.channels.clear();
  }

  /**
   * 현재 관리 중인 채널 수
   */
  get size(): number {
    return this.channels.size;
  }
}

export const channelManager = new ChannelManager();
