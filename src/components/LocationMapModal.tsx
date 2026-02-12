import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseShared } from "@/lib/supabase";

interface LocationMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId?: string;
}

export function LocationMapModal({ isOpen, onClose, deviceId }: LocationMapModalProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const saveLocationToDB = useCallback(async (lat: number, lng: number) => {
    if (!deviceId) return;
    try {
      await supabaseShared
        .from("devices")
        .update({
          latitude: lat,
          longitude: lng,
          location_updated_at: new Date().toISOString(),
        } as Record<string, unknown>)
        .eq("id", deviceId);
      console.log("[Location] Saved to DB:", lat, lng);
    } catch (err) {
      console.error("[Location] Failed to save:", err);
    }
  }, [deviceId]);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("이 기기에서는 위치 서비스를 지원하지 않습니다.");
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });
        saveLocationToDB(latitude, longitude);
        setIsLoading(false);
      },
      (err) => {
        console.error("[Location] Error:", err);
        setError("위치 정보를 가져올 수 없습니다. 위치 권한을 허용해주세요.");
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [isOpen, saveLocationToDB]);

  // Initialize map when coords are ready
  useEffect(() => {
    if (!isOpen || !coords || !mapRef.current) return;

    // Cleanup previous map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapRef.current).setView([coords.lat, coords.lng], 16);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap',
    }).addTo(map);

    // Custom icon
    const icon = L.divIcon({
      className: "custom-marker",
      html: `<div style="
        width: 24px; height: 24px; 
        background: hsl(0, 72%, 51%); 
        border: 3px solid white; 
        border-radius: 50%; 
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    markerRef.current = L.marker([coords.lat, coords.lng], { icon }).addTo(map);
    markerRef.current.bindPopup("📍 현재 노트북 위치").openPopup();

    // Force map to recalculate size
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, coords]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-[90%] max-w-md overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            <span className="font-bold text-sm">노트북 위치</span>
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

        {/* Map Container */}
        <div className="relative w-full h-64">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted z-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <span className="text-sm text-muted-foreground font-medium">위치를 가져오는 중...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted z-10 px-4">
              <MapPin className="h-8 w-8 text-destructive mb-2" />
              <span className="text-sm text-destructive font-medium text-center">{error}</span>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />
        </div>

        {/* Footer */}
        {coords && (
          <div className="px-4 py-2 bg-muted/50 text-xs text-muted-foreground text-center">
            위도: {coords.lat.toFixed(6)} | 경도: {coords.lng.toFixed(6)}
          </div>
        )}
      </div>
    </div>
  );
}
