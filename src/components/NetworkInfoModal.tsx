import { useEffect, useRef, useState } from "react";
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-[90%] max-w-md overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            <span className="font-bold text-sm">네트워크 정보</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary-foreground hover:bg-white/20"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <span className="text-sm text-muted-foreground font-medium">네트워크 정보를 가져오는 중...</span>
            </div>
          ) : networkInfo ? (
            <div className="space-y-3">
              {/* Online Status */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <div className={`w-3 h-3 rounded-full ${networkInfo.online ? "bg-green-500" : "bg-destructive"}`} />
                <div>
                  <p className="text-xs text-muted-foreground">연결 상태</p>
                  <p className="text-sm font-bold">{networkInfo.online ? "온라인" : "오프라인"}</p>
                </div>
              </div>

              {/* IP Address */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Globe className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">IP 주소</p>
                  <p className="text-sm font-bold font-mono">{networkInfo.ip || "확인 불가"}</p>
                </div>
              </div>

              {/* Connection Type */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <Signal className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">연결 유형</p>
                  <p className="text-sm font-bold">{networkInfo.type === "unknown" ? "알 수 없음" : networkInfo.type}</p>
                </div>
              </div>

              {/* Speed Info */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">속도</p>
                  <p className="text-sm font-bold">
                    {networkInfo.downlink !== null ? `${networkInfo.downlink} Mbps` : "—"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">지연시간 (RTT)</p>
                  <p className="text-sm font-bold">
                    {networkInfo.rtt !== null ? `${networkInfo.rtt} ms` : "—"}
                  </p>
                </div>
              </div>

              {/* Effective Type */}
              <div className="p-3 rounded-xl bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground">유효 연결 등급</p>
                <p className="text-sm font-bold uppercase">{networkInfo.effectiveType}</p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-muted/50 text-[10px] text-muted-foreground text-center opacity-70">
          📡 브라우저 Network Information API 기반으로, 실제 속도와 차이가 있을 수 있습니다.
        </div>
      </div>
    </div>
  );
}
