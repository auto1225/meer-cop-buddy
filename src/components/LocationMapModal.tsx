import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { X, MapPin, Loader2, Smartphone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
import { fetchDevicesViaEdge, updateDeviceViaEdge } from "@/lib/deviceApi";
import { getSavedAuth } from "@/lib/serialAuth";
import { useTranslation } from "@/lib/i18n";

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
  const [deviceName, setDeviceName] = useState<string>("Smartphone");
  const [locationSource, setLocationSource] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationReceivedRef = useRef(false);
  const mapInitializedRef = useRef(false);
  const { t } = useTranslation();

  // ── 공유 DB 직접 호출 헬퍼 (검증된 방식 복구) ──
  const sharedFetch = useCallback(async (fnName: string, body: Record<string, unknown>) => {
    const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${fnName} failed: ${res.status}`);
    return res.json();
  }, []);

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

  // Send locate request to smartphone via BOTH local and shared DBs
  const requestSmartphoneLocation = useCallback(async () => {
    if (!smartphoneDeviceId) {
      setError(t("location.noSmartphone"));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setCoords(null);
    locationReceivedRef.current = false;
    mapInitializedRef.current = false;

    try {
      const savedAuth = getSavedAuth();
      const userId = savedAuth?.user_id;

      // ── 1) 공유 DB에서 스마트폰 기기 조회 ──
      let sharedDevice: any = null;
      let sharedDeviceId = smartphoneDeviceId;
      if (userId) {
        try {
          const data = await sharedFetch("get-devices", { user_id: userId });
          const devices = data.devices || data || [];
          sharedDevice = devices.find((d: any) => d.device_type === "smartphone");
          if (sharedDevice) {
            sharedDeviceId = sharedDevice.id;
            if (sharedDevice.device_name) setDeviceName(sharedDevice.device_name);
          }
        } catch (e) {
          console.warn("[LocationMap] Shared DB get-devices failed:", e);
        }
      }

      // ── 2) 로컬 DB에서도 스마트폰 기기 조회 ──
      let localDevice: any = null;
      let localDeviceId = smartphoneDeviceId;
      if (userId) {
        try {
          const localDevices = await fetchDevicesViaEdge(userId);
          localDevice = localDevices.find((d: any) => d.device_type === "smartphone");
          if (localDevice) {
            localDeviceId = localDevice.id;
            if (localDevice.device_name && !sharedDevice) setDeviceName(localDevice.device_name);
          }
        } catch (e) {
          console.warn("[LocationMap] Local DB get-devices failed:", e);
        }
      }

      const requestTimestamp = new Date().toISOString();

      // ── 3) 이중 쓰기: 양쪽 DB에 locate_requested 기록 ──
      // 공유 DB
      const sharedMeta = (sharedDevice?.metadata as Record<string, unknown>) || {};
      sharedFetch("update-device", {
        device_id: sharedDeviceId,
        updates: { metadata: { ...sharedMeta, locate_requested: requestTimestamp } },
      }).catch(e => console.warn("[LocationMap] Shared locate_requested write failed:", e));

      // 로컬 DB
      const localMeta = (localDevice?.metadata as Record<string, unknown>) || {};
      updateDeviceViaEdge(localDeviceId, {
        metadata: { ...localMeta, locate_requested: requestTimestamp },
      }).catch(e => console.warn("[LocationMap] Local locate_requested write failed:", e));

      console.log("[LocationMap] Sent locate request to BOTH DBs:", requestTimestamp, 
        "shared:", sharedDeviceId, "local:", localDeviceId);

      // ── 4) 이중 폴링: 양쪽 DB에서 응답 대기 ──
      // Track initial coordinates to detect changes
      const initialLat = sharedDevice?.latitude || localDevice?.latitude || null;
      const initialLng = sharedDevice?.longitude || localDevice?.longitude || null;
      const initialLocUpdatedAt = sharedDevice?.location_updated_at || localDevice?.location_updated_at || null;

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        if (locationReceivedRef.current || !userId) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          return;
        }

        // Helper: check if device has a NEW location response
        const hasNewLocation = (device: any): boolean => {
          if (!device?.latitude || !device?.longitude) return false;
          const meta = device.metadata as Record<string, unknown> | null;
          
          // Case 1: locate_requested was cleared AND has coordinates
          if (meta && !meta.locate_requested) return true;
          
          // Case 2: coordinates changed since request
          if (device.latitude !== initialLat || device.longitude !== initialLng) return true;
          
          // Case 3: location_updated_at is newer than our request
          if (device.location_updated_at && device.location_updated_at > requestTimestamp) return true;
          
          return false;
        };

        const acceptLocation = (device: any, source: string) => {
          const meta = (device.metadata as Record<string, unknown>) || {};
          locationReceivedRef.current = true;
          setCoords({ lat: device.latitude, lng: device.longitude });
          setUpdatedAt(device.location_updated_at || null);
          setLocationSource((meta.location_source as string) || null);
          setIsLoading(false);
          fetchAddress(device.latitude, device.longitude);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
          console.log(`[LocationMap] ✅ Location received from ${source}`);
        };

        // 공유 DB 폴링
        try {
          const data = await sharedFetch("get-devices", { user_id: userId });
          const devices = data.devices || data || [];
          const updated = devices.find((d: any) => d.id === sharedDeviceId);
          if (updated && hasNewLocation(updated)) {
            acceptLocation(updated, "SHARED DB");
            return;
          }
        } catch { /* silent */ }

        // 로컬 DB 폴링
        try {
          const localDevices = await fetchDevicesViaEdge(userId);
          const updated = localDevices.find((d: any) => d.id === localDeviceId);
          if (updated && hasNewLocation(updated)) {
            acceptLocation(updated, "LOCAL DB");
            return;
          }
        } catch { /* silent */ }
      }, 2000);

      // 20초 타임아웃: 마지막 알려진 위치 표시
      timeoutRef.current = setTimeout(() => {
        const fallbackDevice = sharedDevice || localDevice;
        if (fallbackDevice?.latitude && fallbackDevice?.longitude) {
          const meta = (fallbackDevice?.metadata as Record<string, unknown>) || {};
          setCoords({ lat: fallbackDevice.latitude, lng: fallbackDevice.longitude });
          setUpdatedAt(fallbackDevice.location_updated_at || null);
          setLocationSource((meta.location_source as string) || null);
          fetchAddress(fallbackDevice.latitude, fallbackDevice.longitude);
          setError(t("location.lastKnown"));
        } else {
          setError(t("location.noResponse"));
        }
        setIsLoading(false);
      }, 20000);

    } catch (err) {
      console.error("[LocationMap] Error:", err);
      setError(t("location.error"));
      setIsLoading(false);
    }
  }, [smartphoneDeviceId, t, sharedFetch, fetchAddress]);

  useEffect(() => {
    if (!isOpen) return;
    requestSmartphoneLocation();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isOpen, requestSmartphoneLocation]);

  useEffect(() => {
    if (!isOpen || !coords || !mapRef.current) return;

    if (mapInitializedRef.current && mapInstanceRef.current) {
      if (markerRef.current) {
        markerRef.current.setLatLng([coords.lat, coords.lng]);
      }
      mapInstanceRef.current.setView([coords.lat, coords.lng], 16);
      return;
    }

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
    markerRef.current.bindPopup(`📱 ${deviceName} ${t("location.popup")}`).openPopup();

    setTimeout(() => map.invalidateSize(), 100);
  }, [isOpen, coords, deviceName, t]);

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
    if (diffMin < 1) return t("location.justNow");
    if (diffMin < 60) return `${diffMin}${t("location.minutesAgo")}`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}${t("location.hoursAgo")}`;
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
              <span className="font-extrabold text-sm text-white drop-shadow">{deviceName} {t("location.title")}</span>
              {updatedAt && (
                <p className="text-[10px] text-white/60 font-semibold">{t("location.update")}: {formatTime(updatedAt)}</p>
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
              <span className="text-sm text-white/80 font-bold">{t("location.requesting")}</span>
              <span className="text-[10px] text-white/50 mt-1">{t("location.waiting")}</span>
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
            <div className="text-center">
              {addressLoading ? (
                <p className="text-[11px] text-white/50 font-semibold">{t("location.addressLoading")}</p>
              ) : address ? (
                <p className="text-[11px] text-white/80 font-bold leading-tight">📍 {address}</p>
              ) : null}
            </div>

            <p className="text-xs text-white/70 font-bold text-center">
              {t("location.latitude")}: {coords.lat.toFixed(6)} | {t("location.longitude")}: {coords.lng.toFixed(6)}
            </p>
            <p className="text-[10px] font-semibold text-center">
              {locationSource === "wifi" ? (
                <span className="text-orange-300">{t("location.wifiWarning")}</span>
              ) : locationSource === "ip" ? (
                <span className="text-orange-300">{t("location.ipWarning")}</span>
              ) : locationSource === "gps" ? (
                <span className="text-accent">{t("location.gpsInfo")}</span>
              ) : (
                <span className="text-white/40">{t("location.info")}</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
