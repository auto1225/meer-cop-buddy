import { useEffect, useState } from "react";
import { X, Wifi, Loader2, Globe, Signal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseShared } from "@/lib/supabase";

interface NetworkInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId?: string;
}

interface NetworkInfo {
  type: string;
  downlink: number | null;
  rtt: number | null;
  effectiveType: string;
  ip: string | null;
  online: boolean;
}

export function NetworkInfoModal({ isOpen, onClose, deviceId }: NetworkInfoModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const gatherNetworkInfo = async () => {
      setIsLoading(true);

      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

      let ip: string | null = null;
      try {
        const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        ip = data.ip;
      } catch {
        // IP fetch failed
      }

      const info: NetworkInfo = {
        type: connection?.type || "unknown",
        downlink: connection?.downlink ?? null,
        rtt: connection?.rtt ?? null,
        effectiveType: connection?.effectiveType || "unknown",
        ip,
        online: navigator.onLine,
      };

      setNetworkInfo(info);
      setIsLoading(false);

      // Save to DB
      if (deviceId) {
        try {
          await supabaseShared
            .from("devices")
            .update({
              ip_address: ip,
              is_network_connected: navigator.onLine,
              metadata: {
                network_info: {
                  type: info.type,
                  downlink: info.downlink,
                  rtt: info.rtt,
                  effective_type: info.effectiveType,
                  updated_at: new Date().toISOString(),
                },
                network_info_requested: null,
              },
            } as Record<string, unknown>)
            .eq("id", deviceId);
          console.log("[NetworkInfo] Saved to DB");
        } catch (err) {
          console.error("[NetworkInfo] Failed to save:", err);
        }
      }
    };

    gatherNetworkInfo();
  }, [isOpen, deviceId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[90%] max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/15">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
              <Wifi className="h-4 w-4 text-accent" />
            </div>
            <span className="font-extrabold text-sm text-white drop-shadow">네트워크 정보</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/70 hover:bg-white/15 rounded-lg"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-accent mb-2" />
              <span className="text-sm text-white/70 font-bold">네트워크 정보를 가져오는 중...</span>
            </div>
          ) : networkInfo ? (
            <div className="space-y-2">
              {/* Online Status */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/10 border border-white/10">
                <div className={`w-3 h-3 rounded-full ${networkInfo.online ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" : "bg-red-400"}`} />
                <div>
                  <p className="text-[10px] text-white/50 font-semibold">연결 상태</p>
                  <p className="text-sm font-bold text-white">{networkInfo.online ? "온라인" : "오프라인"}</p>
                </div>
              </div>

              {/* IP Address */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/10 border border-white/10">
                <Globe className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-[10px] text-white/50 font-semibold">IP 주소</p>
                  <p className="text-sm font-bold text-white font-mono">{networkInfo.ip || "확인 불가"}</p>
                </div>
              </div>

              {/* Connection Type */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/10 border border-white/10">
                <Signal className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-[10px] text-white/50 font-semibold">연결 유형</p>
                  <p className="text-sm font-bold text-white">{networkInfo.type === "unknown" ? "알 수 없음" : networkInfo.type}</p>
                </div>
              </div>

              {/* Speed Info */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-white/10 border border-white/10 text-center">
                  <p className="text-[10px] text-white/50 font-semibold">속도</p>
                  <p className="text-sm font-bold text-white">
                    {networkInfo.downlink !== null ? `${networkInfo.downlink} Mbps` : "—"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/10 border border-white/10 text-center">
                  <p className="text-[10px] text-white/50 font-semibold">지연시간 (RTT)</p>
                  <p className="text-sm font-bold text-white">
                    {networkInfo.rtt !== null ? `${networkInfo.rtt} ms` : "—"}
                  </p>
                </div>
              </div>

              {/* Effective Type */}
              <div className="p-3 rounded-xl bg-white/10 border border-white/10 text-center">
                <p className="text-[10px] text-white/50 font-semibold">유효 연결 등급</p>
                <p className="text-sm font-bold text-white uppercase">{networkInfo.effectiveType}</p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/10 text-center">
          <p className="text-[10px] text-white/40 font-semibold">
            📡 브라우저 Network Information API 기반
          </p>
        </div>
      </div>
    </div>
  );
}
