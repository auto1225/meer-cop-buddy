import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, MapPin, Loader2, Smartphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseShared } from "@/lib/supabase";

interface LocationMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  smartphoneDeviceId?: string;
}

export function LocationMapModal({ isOpen, onClose, smartphoneDeviceId }: LocationMapModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>("스마트폰");
  const [locationSource, setLocationSource] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabaseShared.channel> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationReceivedRef = useRef(false);
  const mapInitializedRef = useRef(false);

  // Reverse geocode coordinates to address
  const fetchAddress = useCallback(async (lat: number, lng: number) => {
    setAddressLoading(true);
    setAddress(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ko&zoom=18`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data = await res.json();
      if (data.display_name) {
        setAddress(data.display_name);
      }
    } catch {
      console.warn("[LocationMap] Reverse geocoding failed");
    }
    setAddressLoading(false);
  }, []);

  // Send locate request to smartphone and wait for response
  const requestSmartphoneLocation = useCallback(async () => {
    if (!smartphoneDeviceId) {
      setError("연결된 스마트폰이 없습니다.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCoords(null);
    locationReceivedRef.current = false;
    mapInitializedRef.current = false;

    try {
      // First get device name
      const { data: deviceData } = await supabaseShared
        .from("devices")
        .select("device_name, latitude, longitude, location_updated_at, metadata")
        .eq("id", smartphoneDeviceId)
        .single();

      if (deviceData?.device_name) setDeviceName(deviceData.device_name);

      // Write locate_requested timestamp to smartphone's metadata
      const existingMeta = (deviceData?.metadata as Record<string, unknown>) || {};
      const requestTimestamp = new Date().toISOString();

      await supabaseShared
        .from("devices")
        .update({
          metadata: { ...existingMeta, locate_requested: requestTimestamp },
        } as Record<string, unknown>)
        .eq("id", smartphoneDeviceId);

      console.log("[LocationMap] Sent locate request to smartphone:", requestTimestamp);

      // Subscribe to smartphone's location updates
      if (channelRef.current) {
        supabaseShared.removeChannel(channelRef.current);
      }

      const channel = supabaseShared
        .channel(`smartphone-locate-${smartphoneDeviceId}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "devices",
            filter: `id=eq.${smartphoneDeviceId}`,
          },
          (payload) => {
            // Ignore if we already got the location
            if (locationReceivedRef.current) return;

            const updated = payload.new as Record<string, unknown>;
            const meta = updated.metadata as Record<string, unknown> | null;

            // Check if locate_requested was cleared (smartphone responded)
            if (meta && !meta.locate_requested && updated.latitude && updated.longitude) {
              const lat = updated.latitude as number;
              const lng = updated.longitude as number;
              locationReceivedRef.current = true;
              setCoords({ lat, lng });
              setUpdatedAt(updated.location_updated_at as string);
              setLocationSource((meta.location_source as string) || null);
              setIsLoading(false);
              fetchAddress(lat, lng);

              // Clear timeout
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
              }

              // Unsubscribe — we have what we need
              if (channelRef.current) {
                supabaseShared.removeChannel(channelRef.current);
                channelRef.current = null;
              }
            }
          }
        )
        .subscribe();

      channelRef.current = channel;

      // Timeout: if no response in 20 seconds, show last known location or error
      timeoutRef.current = setTimeout(() => {
        if (deviceData?.latitude && deviceData?.longitude) {
          const meta = (deviceData?.metadata as Record<string, unknown>) || {};
          setCoords({ lat: deviceData.latitude, lng: deviceData.longitude });
          setUpdatedAt(deviceData.location_updated_at);
          setLocationSource((meta.location_source as string) || null);
          fetchAddress(deviceData.latitude, deviceData.longitude);
          setError("스마트폰이 응답하지 않아 마지막 저장된 위치를 표시합니다.");
        } else {
          setError("스마트폰이 위치 요청에 응답하지 않습니다.\n스마트폰 앱이 실행 중인지 확인해주세요.");
        }
        setIsLoading(false);
      }, 20000);

    } catch (err) {
      console.error("[LocationMap] Error:", err);
      setError("위치 요청 중 오류가 발생했습니다.");
      setIsLoading(false);
    }
  }, [smartphoneDeviceId]);

  // Trigger on open
  useEffect(() => {
    if (!isOpen) return;
    requestSmartphoneLocation();

    return () => {
      if (channelRef.current) {
        supabaseShared.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isOpen, requestSmartphoneLocation]);

  // Initialize map — only once when coords first arrive
  useEffect(() => {
    if (!isOpen || !coords || !mapRef.current) return;

    // If map already initialized for this session, just update marker
    if (mapInitializedRef.current && mapInstanceRef.current) {
      if (markerRef.current) {
        markerRef.current.setLatLng([coords.lat, coords.lng]);
      }
      mapInstanceRef.current.setView([coords.lat, coords.lng], 16);
      return;
    }

    // First time — create the map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current).setView([coords.lat, coords.lng], 16);
    mapInstanceRef.current = map;
    mapInitializedRef.current = true;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap',
    }).addTo(map);

    const icon = L.divIcon({
      className: "custom-marker",
      html: `<div style="
        width: 28px; height: 28px; 
        background: linear-gradient(135deg, #E8F84A, #c4d63e); 
        border: 3px solid white; 
        border-radius: 50%; 
        box-shadow: 0 2px 12px rgba(232,248,74,0.5);
        display: flex; align-items: center; justify-content: center;
      "><svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#1e3a5f' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><rect x='5' y='2' width='14' height='20' rx='2' ry='2'/><line x1='12' y1='18' x2='12' y2='18'/></svg></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    markerRef.current = L.marker([coords.lat, coords.lng], { icon }).addTo(map);
    markerRef.current.bindPopup(`📱 ${deviceName} 위치`).openPopup();

    setTimeout(() => map.invalidateSize(), 100);
  }, [isOpen, coords, deviceName]);

  // Cleanup map on close
  useEffect(() => {
    if (!isOpen && mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      mapInitializedRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return "방금 전";
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}시간 전`;
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[90%] max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/15">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
              <Smartphone className="h-4 w-4 text-accent" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-white drop-shadow">{deviceName} 위치</span>
              {updatedAt && (
                <p className="text-[10px] text-white/60 font-semibold">업데이트: {formatTime(updatedAt)}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/70 hover:bg-white/15 rounded-lg"
              onClick={requestSmartphoneLocation}
              disabled={isLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/70 hover:bg-white/15 rounded-lg"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Map */}
        <div className="relative w-full h-64">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/5 backdrop-blur-sm z-10">
              <Loader2 className="h-8 w-8 animate-spin text-accent mb-2" />
              <span className="text-sm text-white/80 font-bold">스마트폰에 위치 요청 중...</span>
              <span className="text-[10px] text-white/50 mt-1">스마트폰이 응답할 때까지 대기합니다</span>
            </div>
          )}
          {error && !isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/5 backdrop-blur-sm z-10 px-6">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-3">
                <MapPin className="h-6 w-6 text-white/60" />
              </div>
              <span className="text-sm text-white/80 font-bold text-center whitespace-pre-line">{error}</span>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />
        </div>

        {/* Footer */}
        {coords && (
          <div className="px-4 py-2.5 border-t border-white/10 space-y-1.5">
            {/* Address */}
            <div className="text-center">
              {addressLoading ? (
                <p className="text-[11px] text-white/50 font-semibold">📍 주소 확인 중...</p>
              ) : address ? (
                <p className="text-[11px] text-white/80 font-bold leading-tight">📍 {address}</p>
              ) : null}
            </div>

            <p className="text-xs text-white/70 font-bold text-center">
              위도: {coords.lat.toFixed(6)} | 경도: {coords.lng.toFixed(6)}
            </p>
            <p className="text-[10px] font-semibold text-center">
              {locationSource === "wifi" ? (
                <span className="text-orange-300">
                  📶 Wi-Fi 기반 추정 위치 — 실제 위치와 수백 미터~수 킬로미터 오차가 있을 수 있습니다
                </span>
              ) : locationSource === "ip" ? (
                <span className="text-orange-300">
                  🌐 IP 기반 추정 위치 — 실제 위치와 수 킬로미터 이상 차이가 날 수 있습니다
                </span>
              ) : locationSource === "gps" ? (
                <span className="text-accent">📡 GPS 기반 실시간 위치 정보</span>
              ) : (
                <span className="text-white/40">📡 위치 정보</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
