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

  const fetchSmartphoneLocation = useCallback(async () => {
    if (!smartphoneDeviceId) {
      setError("연결된 스마트폰이 없습니다.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabaseShared
        .from("devices")
        .select("latitude, longitude, location_updated_at, device_name")
        .eq("id", smartphoneDeviceId)
        .single();

      if (fetchError) throw fetchError;

      if (data?.device_name) setDeviceName(data.device_name);

      if (data?.latitude && data?.longitude) {
        setCoords({ lat: data.latitude, lng: data.longitude });
        setUpdatedAt(data.location_updated_at);
      } else {
        setError("스마트폰의 위치 정보가 아직 등록되지 않았습니다.\n스마트폰 앱에서 위치 업데이트를 실행해주세요.");
      }
    } catch (err) {
      console.error("[Location] Failed to fetch smartphone location:", err);
      setError("스마트폰 위치 정보를 가져오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [smartphoneDeviceId]);

  useEffect(() => {
    if (!isOpen) return;
    fetchSmartphoneLocation();
  }, [isOpen, fetchSmartphoneLocation]);

  // Initialize map when coords are ready
  useEffect(() => {
    if (!isOpen || !coords || !mapRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current).setView([coords.lat, coords.lng], 16);
    mapInstanceRef.current = map;

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

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, coords, deviceName]);

  if (!isOpen) return null;

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "방금 전";
    if (diffMin < 60) return `${diffMin}분 전`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}시간 전`;
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[90%] max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl">
        {/* Header - Glassmorphism */}
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
              onClick={fetchSmartphoneLocation}
            >
              <RefreshCw className="h-3.5 w-3.5" />
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

        {/* Map Container */}
        <div className="relative w-full h-64">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/5 backdrop-blur-sm z-10">
              <Loader2 className="h-8 w-8 animate-spin text-accent mb-2" />
              <span className="text-sm text-white/80 font-bold">스마트폰 위치를 가져오는 중...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/5 backdrop-blur-sm z-10 px-6">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-3">
                <MapPin className="h-6 w-6 text-white/60" />
              </div>
              <span className="text-sm text-white/80 font-bold text-center whitespace-pre-line">{error}</span>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />
        </div>

        {/* Footer - Glassmorphism */}
        {coords && (
          <div className="px-4 py-2.5 border-t border-white/10 text-center space-y-1">
            <p className="text-xs text-white/70 font-bold">
              위도: {coords.lat.toFixed(6)} | 경도: {coords.lng.toFixed(6)}
            </p>
            <p className="text-[10px] text-white/40 font-semibold">
              📡 스마트폰 GPS 기반 위치 정보입니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
