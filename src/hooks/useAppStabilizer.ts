import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseShared } from "@/lib/supabase";
import { channelManager } from "@/lib/channelManager";

/**
 * 앱 안정화 훅
 * 1. 포그라운드 복귀 시 DB 상태 재확인 (stale 쿼리 invalidate)
 * 2. Realtime 채널 건강성 체크 및 자동 복구
 * 3. 10분마다 오래된 쿼리 캐시 정리
 */
export function useAppStabilizer() {
  const queryClient = useQueryClient();
  const lastFocusRef = useRef(Date.now());

  // 1. 포그라운드 복귀 시 상태 재확인
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) return;

      const elapsed = Date.now() - lastFocusRef.current;
      lastFocusRef.current = Date.now();

      // 30초 이상 백그라운드였으면 모든 쿼리 invalidate
      if (elapsed > 30_000) {
        console.log(`[AppStabilizer] ☀️ Foreground after ${Math.round(elapsed / 1000)}s → invalidating queries`);
        queryClient.invalidateQueries();
      }

      // Realtime 채널 건강성 체크
      checkChannelHealth();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [queryClient]);

  // 2. 10분마다 오래된 쿼리 캐시 정리
  useEffect(() => {
    const interval = setInterval(() => {
      const removed = queryClient.getQueryCache().findAll({
        predicate: (query) => {
          const staleTime = Date.now() - (query.state.dataUpdatedAt || 0);
          return staleTime > 10 * 60 * 1000; // 10분 이상 된 캐시
        },
      });

      if (removed.length > 0) {
        removed.forEach((q) => queryClient.removeQueries({ queryKey: q.queryKey }));
        console.log(`[AppStabilizer] 🧹 Removed ${removed.length} stale query caches`);
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [queryClient]);
}

/** Realtime 채널 연결 상태 확인 및 자동 복구 */
function checkChannelHealth() {
  const channels = supabaseShared.getChannels();
  let unhealthy = 0;

  channels.forEach((ch) => {
    // @ts-ignore - internal state
    const state = ch.state;
    if (state === "closed" || state === "errored") {
      unhealthy++;
      console.warn(`[AppStabilizer] ⚠️ Unhealthy channel: ${ch.topic} (${state})`);
      // channelManager를 통해 관리되는 채널은 자동 재연결 로직이 있으므로
      // 여기서는 경고만 남김 (강제 재구독은 각 훅의 책임)
    }
  });

  if (unhealthy === 0 && channels.length > 0) {
    console.log(`[AppStabilizer] ✅ All ${channels.length} channels healthy`);
  }
}
