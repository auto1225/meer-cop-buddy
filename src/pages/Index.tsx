import React, { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAlarmSoundsForDB } from "@/lib/alarmSounds";
import { LaptopHeader } from "@/components/LaptopHeader";
import { LaptopStatusIcons } from "@/components/LaptopStatusIcons";
import { LaptopMascotSection } from "@/components/LaptopMascotSection";
import { DeviceNameBadge } from "@/components/DeviceNameBadge";
import { ResizableContainer } from "@/components/ResizableContainer";
import { SideMenu } from "@/components/SideMenu";
import { CameraModal } from "@/components/CameraModal";
import { AlertOverlay } from "@/components/AlertOverlay";
import { SensorSettingsPanel } from "@/components/SensorSettingsPanel";
import { PinKeypad } from "@/components/PinKeypad";
import { LocationMapModal } from "@/components/LocationMapModal";
import { NetworkInfoModal } from "@/components/NetworkInfoModal";
import { AutoBroadcaster } from "@/components/AutoBroadcaster";
import { PermissionGateModal } from "@/components/PermissionGateModal";
import { CamouflageOverlay } from "@/components/CamouflageOverlay";
import { PwaInstallPopup } from "@/components/PwaInstallPopup";
import { useDevices } from "@/hooks/useDevices";
import { useAuth } from "@/hooks/useAuth";
import { getSavedAuth } from "@/lib/serialAuth";
import { useDeviceStatus } from "@/hooks/useDeviceStatus";
import { useSecuritySurveillance, SecurityEvent, SensorToggles } from "@/hooks/useSecuritySurveillance";
import { useAlerts } from "@/hooks/useAlerts";
import { saveAlertPhotos } from "@/lib/localPhotoStorage";
import { addActivityLog } from "@/lib/localActivityLogs";
import { PhotoTransmitter, PhotoTransmission } from "@/lib/photoTransmitter";
import { useCameraDetection } from "@/hooks/useCameraDetection";
import { useAlarmSystem } from "@/hooks/useAlarmSystem";
import { useStealRecovery, markAlertActive, markAlertCleared } from "@/hooks/useStealRecovery";
import { useLocationResponder } from "@/hooks/useLocationResponder";
import { useNetworkInfoResponder } from "@/hooks/useNetworkInfoResponder";
import { channelManager } from "@/lib/channelManager";
import { fetchDeviceViaEdge, updateDeviceViaEdge } from "@/lib/deviceApi";
import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
import { setSharedDeviceId } from "@/lib/sharedDeviceIdMap";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useAppStabilizer } from "@/hooks/useAppStabilizer";
import { I18nProvider, type Lang } from "@/lib/i18n";
import { getSelectedBackground } from "@/components/BackgroundSettings";
import mainBg from "@/assets/main-bg.png";

interface IndexProps {
  onExpired?: () => void;
}

const Index = ({ onExpired }: IndexProps) => {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading, isExpired, planType, remainingDays } = useAuth();
  const savedAuth = getSavedAuth();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [backgroundSetting, setBackgroundSetting] = useState(() => getSelectedBackground());
  const [alarmVolume, setAlarmVolume] = useState(() => {
    const saved = localStorage.getItem('meercop-alarm-volume');
    return saved ? parseInt(saved, 10) : 20;
  });
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(() => {
    // Persist device selection across reloads
    return localStorage.getItem('meercop-current-device-id') || null;
  });
  const deviceIdLockedRef = useRef(false); // Once user selects or initial match is done, lock it
  const [currentEventType, setCurrentEventType] = useState<string | undefined>();
  const [sharedDeviceIdState, setSharedDeviceIdState] = useState<string | null>(null);
  const [duplicateNameAlert, setDuplicateNameAlert] = useState<string | null>(null);
  const { devices, refetch } = useDevices(savedAuth?.user_id);
  
  // Debug: log device fetch results
  useEffect(() => {
    console.log("[Index] 🔍 Devices loaded:", devices.length, 
      "userId:", savedAuth?.user_id,
      "savedDeviceId:", savedAuth?.device_id,
      "devices:", devices.map(d => ({ id: d.id, type: d.device_type, status: d.status, name: d.device_name }))
    );
  }, [devices]);

  // Resolve shared DB device ID for WebRTC signaling
  useEffect(() => {
    if (!currentDeviceId || !savedAuth?.user_id) return;
    const resolve = async () => {
      try {
        // Get local device info for matching
        const localDevice = await fetchDeviceViaEdge(currentDeviceId, savedAuth.user_id).catch(() => null);
        const localName = localDevice?.device_name || localDevice?.name;
        const localType = localDevice?.device_type || "laptop";
        const localCompositeId = localDevice?.device_id;

        const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/get-devices`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
          body: JSON.stringify({ user_id: savedAuth.user_id }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const devices = data.devices || data || [];

        const isComputerType = (t: string) => ["laptop", "desktop", "notebook"].includes(t);

        // 매칭 우선순위: device_id → serial_key(metadata) → 이름+타입 → 단일컴퓨터 → ID직접
        const mySerialKey = savedAuth?.serial_key;
        const match =
          devices.find((d: any) => localCompositeId && d.device_id === localCompositeId) ||
          devices.find((d: any) => mySerialKey && d.metadata?.serial_key === mySerialKey) ||
          devices.find((d: any) => localName && (d.device_name === localName || d.name === localName) && isComputerType(d.device_type) && isComputerType(localType)) ||
          devices.find((d: any) => localName && (d.device_name === localName || d.name === localName)) ||
          devices.find((d: any) => {
            const computers = devices.filter((dd: any) => isComputerType(dd.device_type));
            return computers.length === 1 && isComputerType(d.device_type) && isComputerType(localType);
          }) ||
          devices.find((d: any) => d.id === currentDeviceId);
        
        console.log("[Index] 🔍 Shared DB match attempt:", {
          localCompositeId, mySerialKey, localName, localType,
          sharedDevices: devices.map((d: any) => ({ id: d.id, device_id: d.device_id, name: d.name || d.device_name, type: d.device_type, serial: d.metadata?.serial_key })),
          matchResult: match?.id
        });

        if (match?.id) {
          setSharedDeviceId(currentDeviceId, match.id); // 전역 매핑 등록
          setSharedDeviceIdState(match.id);
          console.log(`[Index] 🔑 Shared signaling device ID: ${match.id} (local: ${currentDeviceId})`);
        }
      } catch (e) {
        console.warn("[Index] Failed to resolve shared device ID:", e);
      }
    };
    resolve();
    // Re-resolve periodically in case registration was delayed
    const timer = setInterval(resolve, 30000);
    return () => clearInterval(timer);
  }, [currentDeviceId, savedAuth?.user_id]);

  // Get the current device (this laptop) - use savedAuth.device_id to match correctly
  const currentDevice = currentDeviceId 
    ? devices.find(d => d.id === currentDeviceId) 
    : undefined;

  // Debug: log currentDevice resolution
  useEffect(() => {
    console.log("[Index] 🖥️ currentDeviceId:", currentDeviceId, "→ currentDevice:", currentDevice?.id, currentDevice?.device_name);
  }, [currentDeviceId, currentDevice]);

  // Sync deviceType when currentDevice loads/changes
  useEffect(() => {
    if (currentDevice?.device_type) {
      setDeviceType(currentDevice.device_type);
    }
  }, [currentDevice?.device_type]);

  // Detect smartphone online status from devices list
  // device_type enum: laptop | desktop | smartphone | tablet
  const smartphoneDevice = devices.find(d => d.device_type === 'smartphone');
  const smartphoneOnline = smartphoneDevice?.status === 'online';
  
  console.log("[Index] 📱 smartphoneDevice:", smartphoneDevice?.id, "status:", smartphoneDevice?.status, "online:", smartphoneOnline);
  
  // 시리얼 만료 시 로그아웃 처리
  useEffect(() => {
    if (isExpired && onExpired) {
      console.warn("[Index] 시리얼 만료됨. 재인증 필요.");
      toast({
        title: "시리얼 만료",
        description: "사용 기간이 만료되었습니다. 웹사이트에서 플랜을 갱신해주세요.",
        variant: "destructive",
      });
      setTimeout(() => onExpired(), 2000);
    }
  }, [isExpired, onExpired, toast]);

  const { isNetworkConnected, isCameraAvailable } = useDeviceStatus(currentDevice?.id, isAuthenticated, savedAuth?.user_id);

  // Camera detection - auto-sync to DB
  useCameraDetection({ deviceId: currentDevice?.id });
  // Location responder - reacts to metadata.locate_requested (no independent polling)
  const currentMeta = currentDevice?.metadata as Record<string, unknown> | null;
  useLocationResponder(currentDevice?.id, currentMeta);
  // Network info responder - reacts to metadata.network_info_requested (no independent polling)
  useNetworkInfoResponder(currentDevice?.id, currentMeta);
  // Alerts system - broadcasts alerts to smartphone via Presence
  const { triggerAlert, dismissedBySmartphone, stopAlert } = useAlerts(currentDevice?.id, savedAuth?.user_id);
  const triggerAlertRef = useRef(triggerAlert);
  triggerAlertRef.current = triggerAlert;
  // PIN for alarm dismissal (default: 1234, will be set from smartphone)
  const [alarmPin, setAlarmPin] = useState(() => localStorage.getItem('meercop-alarm-pin') || "1234");
  const [requirePcPin, setRequirePcPin] = useState(true); // require_pc_pin from metadata
  const [showPinKeypad, setShowPinKeypad] = useState(false);
  const [isCamouflageMode, setIsCamouflageMode] = useState(false);
  const [mascotVisible, setMascotVisible] = useState(() => {
    const saved = localStorage.getItem('meercop-mascot-visible');
    return saved !== 'false';
  });
  // Sensor toggles from smartphone metadata
  const [sensorToggles, setSensorToggles] = useState<SensorToggles>({
    cameraMotion: false, lid: false, keyboard: false, mouse: false, power: false, microphone: false, usb: false, screenTouch: false,
  });
  const [motionThreshold, setMotionThreshold] = useState(15);
  const [mouseSensitivityPx, setMouseSensitivityPx] = useState(30); // default: normal (≈3cm)
  // Device type from smartphone settings (laptop | desktop | tablet)
  const [deviceType, setDeviceType] = useState<string>(() => currentDevice?.device_type || "laptop");
  // Language setting from smartphone (supports 17 languages)
  const [appLanguage, setAppLanguage] = useState<string>(() => {
    return localStorage.getItem('meercop-language') || "en";
  });
  // Guard: prevent metadata useEffect from reverting broadcast-applied settings
  const broadcastOverrideUntilRef = useRef<number>(0);
  // Alarm system
  const { 
    isAlarmEnabled, 
    isAlarming, 
    availableSounds,
    selectedSoundId,
    setSelectedSoundId,
    toggleAlarmEnabled, 
    startAlarm, 
    stopAlarm,
    previewSound,
  } = useAlarmSystem({ volumePercent: alarmVolume });

  // Photo transmitter - manages broadcast + offline queue
  const transmitterRef = useRef<PhotoTransmitter | null>(null);
  
  useEffect(() => {
    if (currentDevice?.id) {
      transmitterRef.current = new PhotoTransmitter(currentDevice.id, savedAuth?.user_id);
    }
    return () => {
      transmitterRef.current?.destroy();
      transmitterRef.current = null;
    };
  }, [currentDevice?.id]);

  // Security event handler - use ref to avoid recreating callback
  const startAlarmRef = useRef(startAlarm);
  startAlarmRef.current = startAlarm;

  const isAlertActiveRef = useRef(false);

  const handleSecurityEvent = useCallback(async (event: SecurityEvent) => {
    // 감시 OFF 상태에서는 경보 발생 금지 (위장모드에서 센서만 유지하는 경우 포함)
    if (!isMonitoring) {
      console.log("[Security] ⏭️ Monitoring is OFF — ignoring event:", event.type);
      return;
    }
    // 이미 경보 중이면 중복 전송 방지
    if (isAlertActiveRef.current) {
      console.log("[Security] ⏭️ Alert already active — ignoring duplicate:", event.type);
      return;
    }
    isAlertActiveRef.current = true;

    console.log("[Security] Event detected:", event.type, "Photos:", event.photos.length, 
      event.changePercent ? `Change: ${event.changePercent.toFixed(1)}%` : "");
    
    // ── Phase 0: 즉시 실행 (UI 반응성) ──
    // 위장 모드 자동 해제 → 경보 화면이 보이도록
    setIsCamouflageMode(false);
    setCurrentEventType(event.type);
    startAlarmRef.current();

    const alertMessage = event.type === "camera_motion"
      ? `Camera motion (${event.changePercent?.toFixed(1)}%)`
      : `${event.type} event detected`;

    // localStorage에 경보 상태 영속 저장 (도난 복구용)
    markAlertActive(`alert_${event.type}`, alertMessage);

    // ── Phase 1: GPS 위치 확인 (fail-safe) ──
    let alertCoords: { latitude: number; longitude: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 5000, maximumAge: 0,
        });
      });
      alertCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      console.log("[Security] GPS unavailable at alert time");
    }

    // ── Phase 2: DB 업데이트 (GPS 결과 반영) ──
    if (currentDevice?.id) {
      try {
        const dbUpdate: Record<string, unknown> = {
          is_streaming_requested: true,
          metadata: { last_location_source: "alert_triggered", camouflage_mode: false },
        };
        if (alertCoords) {
          dbUpdate.latitude = alertCoords.latitude;
          dbUpdate.longitude = alertCoords.longitude;
          dbUpdate.location_updated_at = new Date().toISOString();
        }
        await updateDeviceViaEdge(currentDevice.id, dbUpdate);
      } catch (e) {
        console.error("[Security] Failed to update device location:", e);
      }
    }

    // ── Phase 3: 알림 + 사진 전송 (독립적, 병렬 OK) ──
    const alertId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const parallelTasks: Promise<unknown>[] = [];

    // 3-1. 스마트폰 경보 알림 전송
    parallelTasks.push(
      Promise.resolve(triggerAlertRef.current(`alert_${event.type}`, {
        alert_type: event.type,
        change_percent: event.changePercent,
        photo_count: event.photos.length,
        message: alertMessage,
        latitude: alertCoords?.latitude,
        longitude: alertCoords?.longitude,
        auto_streaming: true,
      }))
    );

    // 3-2. IndexedDB 로컬 백업 저장
    if (event.photos.length > 0 && currentDevice?.id) {
      parallelTasks.push(
        saveAlertPhotos({
          id: alertId,
          device_id: currentDevice.id,
          event_type: event.type,
          photos: event.photos,
          created_at: now,
        }).catch(e => console.error("[Security] Failed to save local photos:", e))
      );

      // 3-3. 스마트폰으로 사진 전송 (Broadcast + 오프라인 큐)
      const transmission: PhotoTransmission = {
        id: alertId,
        device_id: currentDevice.id,
        device_name: currentDevice.device_name,
        event_type: event.type,
        photos: event.photos,
        change_percent: event.changePercent,
        latitude: alertCoords?.latitude,
        longitude: alertCoords?.longitude,
        location_source: alertCoords ? "gps" : undefined,
        auto_streaming: true,
        batch_id: alertId,   // 단일 이벤트 = 단일 배치
        batch_total: 1,
        created_at: now,
      };
      
      parallelTasks.push(
        (transmitterRef.current?.transmit(transmission) ?? Promise.resolve(false)).then(sent => {
          console.log(`[Security] Photo transmission ${sent ? "✅ sent" : "📥 queued"}`);
        }).catch(e => console.error("[Security] Photo transmission error:", e))
      );
    }

    // 3-4. 활동 로그 기록
    if (currentDevice?.id) {
      parallelTasks.push(
        Promise.resolve(addActivityLog(currentDevice.id, `alert_${event.type}`, {
          alert_type: event.type,
          photo_count: event.photos.length,
          change_percent: event.changePercent,
          alert_id: alertId,
          message: alertMessage,
        }))
      );
    }

    // 모든 병렬 태스크 완료 대기 (하나가 실패해도 나머지 계속)
    const results = await Promise.allSettled(parallelTasks);
    const failures = results.filter(r => r.status === "rejected");
    if (failures.length > 0) {
      console.warn(`[Security] ${failures.length}/${results.length} tasks failed`);
    }
  }, [currentDevice?.id, isMonitoring]);

  // Security surveillance
  const { 
    isActive: isSurveillanceActive,
    startSurveillance, 
    stopSurveillance 
  } = useSecuritySurveillance({
    onEventDetected: handleSecurityEvent,
    bufferDuration: 10,
    captureInterval: 1000,
    mouseSensitivity: mouseSensitivityPx,
    motionThreshold,
    sensorToggles,
  });

  // Handle alarm dismiss (from PIN keypad success)
  const handleAlarmDismiss = useCallback(() => {
    stopAlarm();
    stopAlert();
    setCurrentEventType(undefined);
    setShowPinKeypad(false);
    markAlertCleared(); // 도난 복구 상태 해제
    isAlertActiveRef.current = false; // 다음 감지 허용
  }, [stopAlarm, stopAlert]);

  // When AlertOverlay dismiss is clicked, show PIN keypad or dismiss directly
  const handleAlarmDismissRequest = useCallback(() => {
    if (requirePcPin) {
      setShowPinKeypad(true);
    } else {
      // require_pc_pin이 false면 비밀번호 없이 바로 해제
      handleAlarmDismiss();
    }
  }, [requirePcPin, handleAlarmDismiss]);

  // Listen for smartphone dismissal via Presence
  useEffect(() => {
    if (dismissedBySmartphone) {
      console.log("[Index] Alarm dismissed by smartphone");
      stopAlarm();
      setCurrentEventType(undefined);
      setShowPinKeypad(false);
      markAlertCleared(); // 스마트폰 해제 → 도난 복구 비활성화
      isAlertActiveRef.current = false; // 다음 감지 허용
    }
  }, [dismissedBySmartphone, stopAlarm]);

  // 도난 복구 시스템
  useStealRecovery({
    deviceId: currentDevice?.id,
    userId: savedAuth?.user_id,
    isAlarming,
    onRecoveryTriggered: () => {
      console.log("[Index] 🔄 Steal recovery triggered — alarm re-activated");
      startAlarm();
    },
    onAlarmRestore: (state) => {
      console.log("[Index] 🔄 Browser restarted — restoring alarm from stolen state:", state.alertEventType);
      setCurrentEventType(state.alertEventType);
      isAlertActiveRef.current = true;
      startAlarm();
    },
  });

  // Listen for settings changes from smartphone via metadata
  useEffect(() => {
    if (!currentDevice?.id) return;

    // ✅ 브로드캐스트가 최근에 설정을 적용했으면 DB 메타데이터로 덮어쓰기 방지
    if (Date.now() < broadcastOverrideUntilRef.current) {
      console.log("[Index] ⏭️ Skipping metadata re-apply (broadcast override active)");
      return;
    }

    const meta = (currentDevice?.metadata as Record<string, unknown> | null) || null;
    console.log("[Index] 📋 Current metadata from DB:", JSON.stringify(meta));

    const sensorSettings = (meta?.sensorSettings || meta?.sensor_settings) as {
      camera?: boolean;
      lidClosed?: boolean;
      microphone?: boolean;
      keyboard?: boolean;
      mouse?: boolean;
      usb?: boolean;
      power?: boolean;
      screenTouch?: boolean;
      screen_touch?: boolean;
    } | undefined;

    const motionSensitivity = (meta?.motionSensitivity || meta?.motion_sensitivity) as string | undefined;
    const mouseSensitivity = (meta?.mouseSensitivity || meta?.mouse_sensitivity) as string | undefined;
    const alarmPinFromMeta = (meta?.alarm_pin || meta?.alarmPin) as string | undefined;
    const alarmSoundFromMeta = (meta?.alarm_sound_id || meta?.alarmSoundId) as string | undefined;
    const requirePcPinFromMeta = (meta?.require_pc_pin ?? meta?.requirePcPin) as boolean | undefined;
    const camouflageFromMeta = (meta?.camouflage_mode ?? meta?.camouflageMode) as boolean | undefined;
    const mascotFromMeta = (meta?.mascot_visible ?? meta?.mascotVisible) as boolean | undefined;
    const languageFromMeta = (meta?.language || meta?.lang) as string | undefined;

    if (alarmPinFromMeta) {
      setAlarmPin(alarmPinFromMeta);
      localStorage.setItem("meercop-alarm-pin", alarmPinFromMeta);
      console.log("[Index] ✅ alarm_pin applied:", alarmPinFromMeta);
    }

    if (alarmSoundFromMeta) {
      // 로컬에서 이미 다른 값으로 변경했으면 DB 값으로 덮어쓰지 않음
      const localSoundId = localStorage.getItem('meercop-alarm-sound');
      if (!localSoundId || localSoundId === alarmSoundFromMeta) {
        setSelectedSoundId(alarmSoundFromMeta);
        localStorage.setItem("meercop-alarm-sound", alarmSoundFromMeta);
        console.log("[Index] ✅ alarm_sound_id applied:", alarmSoundFromMeta);
      } else {
        console.log("[Index] ⏭️ Skipping alarm_sound_id from metadata (local override:", localSoundId, ")");
      }
    }

    if (requirePcPinFromMeta !== undefined) {
      setRequirePcPin(requirePcPinFromMeta);
      console.log("[Index] ✅ require_pc_pin applied:", requirePcPinFromMeta);
    }

    if (camouflageFromMeta !== undefined) {
      setIsCamouflageMode(camouflageFromMeta);
      console.log("[Index] ✅ camouflage_mode applied:", camouflageFromMeta);
    }

    if (mascotFromMeta !== undefined) {
      setMascotVisible(mascotFromMeta);
      localStorage.setItem('meercop-mascot-visible', String(mascotFromMeta));
      console.log("[Index] ✅ mascot_visible applied:", mascotFromMeta);
    }

    if (languageFromMeta) {
      setAppLanguage(languageFromMeta);
      localStorage.setItem("meercop-language", languageFromMeta);
      console.log("[Index] ✅ language applied from DB:", languageFromMeta);
    }

    if (sensorSettings) {
      setSensorToggles({
        cameraMotion: sensorSettings.camera ?? true,
        lid: sensorSettings.lidClosed ?? true,
        keyboard: sensorSettings.keyboard ?? true,
        mouse: sensorSettings.mouse ?? true,
        power: sensorSettings.power ?? true,
        microphone: sensorSettings.microphone ?? false,
        usb: sensorSettings.usb ?? false,
        screenTouch: (savedAuth?.capabilities?.sensor_touch !== false) && (sensorSettings.screenTouch ?? sensorSettings.screen_touch ?? true),
      });
      console.log("[Index] ✅ sensorSettings applied:", sensorSettings);
    }

    if (motionSensitivity) {
      const sensitivityMap: Record<string, number> = {
        sensitive: 10,
        normal: 50,
        insensitive: 80,
      };
      const threshold = sensitivityMap[motionSensitivity] ?? 15;
      setMotionThreshold(threshold);
      console.log("[Index] ✅ motionSensitivity applied:", motionSensitivity, "→", threshold);
    }

    if (mouseSensitivity) {
      const mouseMap: Record<string, number> = {
        sensitive: 5,
        normal: 30,
        insensitive: 100,
      };
      const px = mouseMap[mouseSensitivity] ?? 30;
      setMouseSensitivityPx(px);
      console.log("[Index] ✅ mouseSensitivity applied:", mouseSensitivity, "→", px, "px");
    }
  }, [currentDevice?.metadata, currentDevice?.id, setSelectedSoundId]);

  // No redirect needed - App.tsx handles auth gate

  // Set initial device - match by savedAuth, allow correction if wrong
  // ★ Once locked, only re-evaluate if the selected device disappears from the list
  useEffect(() => {
    if (devices.length === 0) return;

    // If already locked and the current device still exists in the list, do nothing
    if (deviceIdLockedRef.current && currentDeviceId) {
      const stillExists = devices.some(d => d.id === currentDeviceId);
      if (stillExists) return; // ← 핵심: 기기가 목록에 있으면 절대 변경하지 않음
      console.log("[Index] ⚠️ Current device no longer in list, re-resolving...");
      deviceIdLockedRef.current = false;
    }
    
    // Determine the correct device ID (priority order)
    let correctDeviceId: string | null = null;

    // 0. Check localStorage persisted selection first
    const persisted = localStorage.getItem('meercop-current-device-id');
    if (persisted) {
      const found = devices.find(d => d.id === persisted);
      if (found) correctDeviceId = found.id;
    }
    
    // 1. Match by UUID (id or device_id)
    if (!correctDeviceId && savedAuth?.device_id) {
      const myDevice = devices.find(d => d.id === savedAuth.device_id) 
        || devices.find(d => d.device_id === savedAuth.device_id);
      if (myDevice) {
        correctDeviceId = myDevice.id;
      }
    }
    
    // 2. Match by device_name from localStorage
    if (!correctDeviceId && savedAuth?.device_name) {
      const byName = devices.find(d => 
        d.device_name === savedAuth.device_name && 
        (d.device_type === 'laptop' || d.device_type === 'desktop' || d.device_type === 'notebook')
      );
      if (byName) {
        correctDeviceId = byName.id;
        console.log("[Index] 📛 Matched device by name:", savedAuth.device_name, "→", byName.id);
        // Auto-correct savedAuth.device_id
        savedAuth.device_id = byName.id;
        localStorage.setItem("meercop_serial_auth", JSON.stringify(savedAuth));
      }
    }
    
    // 3. Fallback: find laptop/desktop/notebook type device ONLY (never smartphone)
    if (!correctDeviceId) {
      const computerDevice = devices.find(d => 
        d.device_type === 'laptop' || d.device_type === 'desktop' || d.device_type === 'notebook'
      );
      if (computerDevice) {
        correctDeviceId = computerDevice.id;
      } else {
        // Absolute last resort — but avoid smartphones
        const nonPhone = devices.find(d => d.device_type !== 'smartphone');
        correctDeviceId = nonPhone?.id || devices[0]?.id || null;
      }
    }
    
    // Set or correct if wrong
    if (correctDeviceId && currentDeviceId !== correctDeviceId) {
      console.log("[Index] ✅ Setting currentDeviceId:", correctDeviceId, 
        "(was:", currentDeviceId, ") savedAuth:", savedAuth?.device_id);
      setCurrentDeviceId(correctDeviceId);
      localStorage.setItem('meercop-current-device-id', correctDeviceId);
      deviceIdLockedRef.current = true;
    } else if (correctDeviceId && currentDeviceId === correctDeviceId) {
      deviceIdLockedRef.current = true; // Already correct, lock
    }
  }, [devices, savedAuth?.device_id]);  // ★ currentDeviceId removed from deps to prevent loops

  // Sync alarm sounds list to DB metadata via Edge Function
  useEffect(() => {
    if (!currentDevice?.id || !savedAuth?.user_id) return;
    const syncAlarmSounds = async () => {
      try {
        await updateDeviceViaEdge(currentDevice.id, {
          metadata: { available_alarm_sounds: getAlarmSoundsForDB() },
        });
        console.log("[Index] ✅ Alarm sounds list synced to DB");
      } catch (e) {
        console.error("[Index] Failed to sync alarm sounds to DB:", e);
      }
    };
    syncAlarmSounds();
  }, [currentDevice?.id, savedAuth?.user_id]);

  // ── Single Source of Truth: DB의 is_monitoring을 그대로 반영 ──
  // Broadcast는 refetch 트리거 역할만 하고, 실제 상태는 DB만 따른다.
  useEffect(() => {
    if (!currentDevice) return;
    const mon = (currentDevice as unknown as Record<string, unknown>).is_monitoring;
    if (mon === undefined) return;
    const val = mon === true;
    setIsMonitoring(prev => {
      if (prev !== val) console.log("[Index] 📡 Monitoring from DB:", val);
      return val;
    });
  }, [currentDevice]);

  // 스마트폰 online/offline 변경 시 즉시 DB 재조회 (Presence LEAVE → DB 최신 상태 반영)
  const prevSmartphoneOnlineRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (prevSmartphoneOnlineRef.current !== undefined && prevSmartphoneOnlineRef.current !== smartphoneOnline) {
      console.log("[Index] 📱 Smartphone online changed:", smartphoneOnline, "→ refetching devices");
      refetch();
    }
    prevSmartphoneOnlineRef.current = smartphoneOnline;
  }, [smartphoneOnline, refetch]);

  // Subscribe to broadcast commands from smartphone (instant, no polling)
  // 🔑 핵심 규칙: userId 기반 단일 채널 사용 → ID 불일치 문제 근본 해결
  useEffect(() => {
    if (!currentDevice?.id || !savedAuth?.user_id) return;

    const channelNames = Array.from(
      new Set([
        // ✅ 통합 채널 (userId 기반 - 절대 불일치 없음)
        `user-commands-${savedAuth.user_id}`,
        // ⬇️ 하위 호환: 기존 스마트폰 앱이 device-commands를 아직 사용할 수 있음
        `device-commands-${currentDevice.id}`,
        `device-commands-${sharedDeviceIdState || currentDevice.id}`,
      ])
    );

    console.log("[Index] 🔌 Subscribing to broadcast channels:", channelNames);

    const channels = channelNames.map((name) => channelManager.getOrCreate(name));

    // ✅ 기기 필터링 헬퍼: user-commands 채널은 모든 기기가 공유하므로
    // payload의 device_id가 자신의 기기와 일치하는지 확인
    const isForThisDevice = (p: Record<string, unknown> | undefined, channelName: string): boolean => {
      // device-commands-${deviceId} 채널은 이미 기기 특정이므로 항상 통과
      if (channelName.startsWith('device-commands-')) return true;
      
      // user-commands 채널: device_id 필수
      if (!p) return false;
      const targetId = (p.device_id || p.target_device_id) as string | undefined;
      const mySerial = savedAuth?.serial_key;
      const targetSerial = p.serial_key as string | undefined;
      const myIds = [currentDevice?.id, sharedDeviceIdState].filter(Boolean);
      
      console.log("[Index] 🔍 isForThisDevice check:", {
        targetId, targetSerial, myIds, mySerial, sharedDeviceIdState,
        channel: channelName,
      });
      
      // serial_key 매칭 (가장 신뢰할 수 있는 식별자)
      if (targetSerial && mySerial) return targetSerial === mySerial;
      
      if (!targetId) {
        console.log("[Index] ⏭️ No device_id/serial_key in payload, ignoring on user-commands channel");
        return false;
      }
      return myIds.includes(targetId);
    };

    const bindHandlers = (channel: ReturnType<typeof channelManager.getOrCreate>) => {
      const chName = channel.topic.replace('realtime:', '');
      // monitoring_toggle: payload에서 즉시 상태 적용 + 로컬 DB 동기화
      channel.on('broadcast', { event: 'monitoring_toggle' }, (payload) => {
        const p = payload.payload as Record<string, unknown> | undefined;
        if (!isForThisDevice(p, chName)) {
          console.log("[Index] ⏭️ monitoring_toggle for different device, ignoring");
          return;
        }
        const enable = p?.is_monitoring;
        console.log("[Index] 📲 Broadcast monitoring_toggle received:", enable, p);

        // ✅ 브로드캐스트 가드 — refetch 시 DB의 stale 값이 위장모드 등 다른 상태를 덮어쓰지 못하게 함
        broadcastOverrideUntilRef.current = Date.now() + 10000;

        if (enable !== undefined) {
          setIsMonitoring(enable as boolean);
          // 로컬 DB에도 동기화
          if (currentDevice?.id) {
            updateDeviceViaEdge(currentDevice.id, { is_monitoring: enable }).catch(err =>
              console.warn("[Index] ⚠️ Failed to sync monitoring to local DB:", err)
            );
          }
        }
        refetch();
      });

      channel.on('broadcast', { event: 'settings_updated' }, (payload) => {
        const pRaw = payload.payload as Record<string, unknown> | undefined;
        if (!isForThisDevice(pRaw, chName)) {
          console.log("[Index] ⏭️ settings_updated for different device, ignoring");
          return;
        }
        console.log("[Index] 📲 Broadcast settings_updated received:", payload.payload);
        // ✅ 브로드캐스트 가드 활성화 — 10초간 metadata useEffect의 덮어쓰기 방지
        broadcastOverrideUntilRef.current = Date.now() + 10000;

        const payloadObj = (payload.payload && typeof payload.payload === "object")
          ? (payload.payload as Record<string, unknown>)
          : {};
        const settingsRaw = (payloadObj.settings && typeof payloadObj.settings === "object")
          ? (payloadObj.settings as Record<string, unknown>)
          : payloadObj;

        if (!settingsRaw || Object.keys(settingsRaw).length === 0) {
          console.warn("[Index] ⚠️ settings_updated payload is empty");
          return;
        }

        const sensorSettings = (settingsRaw.sensorSettings || settingsRaw.sensor_settings) as {
          camera?: boolean;
          lidClosed?: boolean;
          microphone?: boolean;
          keyboard?: boolean;
          mouse?: boolean;
          usb?: boolean;
          power?: boolean;
          screenTouch?: boolean;
          screen_touch?: boolean;
        } | undefined;
        const motionSensitivity = (settingsRaw.motionSensitivity || settingsRaw.motion_sensitivity) as string | undefined;
        const mouseSensitivity = (settingsRaw.mouseSensitivity || settingsRaw.mouse_sensitivity) as string | undefined;
        const alarmPinFromSettings = (settingsRaw.alarm_pin || settingsRaw.alarmPin) as string | undefined;
        const alarmPinHashFromSettings = (settingsRaw.alarm_pin_hash || settingsRaw.alarmPinHash) as string | undefined;
        const alarmSoundFromSettings = (settingsRaw.alarm_sound_id || settingsRaw.alarmSoundId) as string | undefined;
        const requirePcPinFromSettings = (settingsRaw.require_pc_pin ?? settingsRaw.requirePcPin) as boolean | undefined;
        const camouflageFromSettings = (settingsRaw.camouflage_mode ?? settingsRaw.camouflageMode) as boolean | undefined;
        const languageFromSettings = (settingsRaw.language || settingsRaw.lang) as string | undefined;
        const deviceTypeFromSettings = (settingsRaw.device_type || settingsRaw.deviceType) as string | undefined;

        if (sensorSettings) {
          setSensorToggles({
            cameraMotion: sensorSettings.camera ?? true,
            lid: sensorSettings.lidClosed ?? true,
            keyboard: sensorSettings.keyboard ?? true,
            mouse: sensorSettings.mouse ?? true,
            power: sensorSettings.power ?? true,
            microphone: sensorSettings.microphone ?? false,
            usb: sensorSettings.usb ?? false,
            screenTouch: (savedAuth?.capabilities?.sensor_touch !== false) && (sensorSettings.screenTouch ?? sensorSettings.screen_touch ?? true),
          });
        }

        if (motionSensitivity) {
          const sensitivityMap: Record<string, number> = { sensitive: 10, normal: 50, insensitive: 80 };
          setMotionThreshold(sensitivityMap[motionSensitivity] ?? 15);
        }

        if (mouseSensitivity) {
          const mouseMap: Record<string, number> = { sensitive: 5, normal: 30, insensitive: 100 };
          setMouseSensitivityPx(mouseMap[mouseSensitivity] ?? 30);
        }

        if (alarmPinFromSettings) {
          setAlarmPin(alarmPinFromSettings);
          localStorage.setItem("meercop-alarm-pin", alarmPinFromSettings);
        }

        if (alarmSoundFromSettings) {
          setSelectedSoundId(alarmSoundFromSettings);
          localStorage.setItem("meercop-alarm-sound", alarmSoundFromSettings);
        }

        if (requirePcPinFromSettings !== undefined) {
          setRequirePcPin(requirePcPinFromSettings);
        }

        if (camouflageFromSettings !== undefined) {
          setIsCamouflageMode(camouflageFromSettings);
        }

        if (languageFromSettings) {
          setAppLanguage(languageFromSettings);
          localStorage.setItem("meercop-language", languageFromSettings);
          console.log("[Index] ✅ Language updated via broadcast:", languageFromSettings);
        }

        if (deviceTypeFromSettings) {
          setDeviceType(deviceTypeFromSettings);
          console.log("[Index] ✅ Device type updated via broadcast:", deviceTypeFromSettings);
        }

        // ✅ 로컬 DB metadata에도 설정 영속 저장 (새로고침 후에도 유지)
        if (currentDevice?.id) {
          const metadataPatch: Record<string, unknown> = {};

          if (sensorSettings) metadataPatch.sensorSettings = sensorSettings;
          if (motionSensitivity) metadataPatch.motionSensitivity = motionSensitivity;
          if (mouseSensitivity) metadataPatch.mouseSensitivity = mouseSensitivity;
          if (alarmPinFromSettings) metadataPatch.alarm_pin = alarmPinFromSettings;
          if (alarmSoundFromSettings) metadataPatch.alarm_sound_id = alarmSoundFromSettings;
          if (requirePcPinFromSettings !== undefined) metadataPatch.require_pc_pin = requirePcPinFromSettings;
          if (camouflageFromSettings !== undefined) metadataPatch.camouflage_mode = camouflageFromSettings;
          if (languageFromSettings) metadataPatch.language = languageFromSettings;

          const updatePayload: Record<string, unknown> = { metadata: metadataPatch };
          if (deviceTypeFromSettings) {
            updatePayload.device_type = deviceTypeFromSettings;
          }

          updateDeviceViaEdge(currentDevice.id, updatePayload)
            .then(() => console.log("[Index] ✅ Settings persisted to local DB metadata"))
            .catch((e) => console.warn("[Index] ⚠️ Failed to persist settings to local DB:", e));
        }

        // ⚠️ refetch 제거: DB 업데이트가 비동기적이므로 즉시 refetch하면 
        // 아직 반영되지 않은 이전 값을 읽어 깜빡임 발생
      });

      channel.on('broadcast', { event: 'remote_alarm_off' }, (payload) => {
        const p = payload.payload as Record<string, unknown> | undefined;
        if (!isForThisDevice(p, chName)) {
          console.log("[Index] ⏭️ remote_alarm_off for different device, ignoring");
          return;
        }
        console.log("[Index] 📲 Broadcast remote_alarm_off received");
        stopAlarm();
        setCurrentEventType(undefined);
        setShowPinKeypad(false);
        markAlertCleared();
      });

      // ✅ 통합 명령 채널: alarm_dismiss (스마트폰 broadcastCommand 경유)
      channel.on('broadcast', { event: 'alarm_dismiss' }, (payload) => {
        const targetDeviceId = payload?.payload?.device_id;
        // 다른 기기 대상이면 무시
        if (targetDeviceId && targetDeviceId !== currentDevice?.id && targetDeviceId !== sharedDeviceIdState) {
          console.log("[Index] ⏭️ alarm_dismiss for different device:", targetDeviceId);
          return;
        }
        console.log("[Index] 📲 Broadcast alarm_dismiss received via user-commands");
        stopAlarm();
        setCurrentEventType(undefined);
        setShowPinKeypad(false);
        markAlertCleared();
        isAlertActiveRef.current = false; // ✅ 다음 감지 허용
      });

      channel.on('broadcast', { event: 'camouflage_toggle' }, (payload) => {
        const raw = payload.payload as Record<string, unknown> | undefined;
        if (!isForThisDevice(raw, chName)) {
          console.log("[Index] ⏭️ camouflage_toggle for different device, ignoring");
          return;
        }
        const camouflageRaw = raw?.camouflage_mode ?? raw?.camouflageMode;

        // ✅ payload에 명시적 boolean이 있을 때만 반영 (기본값 false로 강제 해제 금지)
        if (typeof camouflageRaw !== "boolean") {
          console.warn("[Index] ⚠️ Ignoring malformed camouflage_toggle payload:", payload.payload);
          return;
        }

        // ✅ DB metadata 재적용으로 즉시 덮어쓰이는 현상 방지
        broadcastOverrideUntilRef.current = Date.now() + 10000;

        console.log("[Index] 📲 Broadcast camouflage_toggle received:", camouflageRaw);
        setIsCamouflageMode(camouflageRaw);

        // ✅ 로컬 DB에도 즉시 반영하여 monitoring 토글/재조회 시 상태 불일치 방지
        if (currentDevice?.id) {
          updateDeviceViaEdge(currentDevice.id, {
            metadata: { camouflage_mode: camouflageRaw },
          })
            .then(() => console.log("[Index] ✅ camouflage_mode persisted to local DB:" , camouflageRaw))
            .catch((e) => console.warn("[Index] ⚠️ Failed to persist camouflage_mode to local DB:", e));
        }
      });

      // 잠금 명령: PIN 입력 화면을 표시하여 기기 잠금
      channel.on('broadcast', { event: 'lock_command' }, (payload) => {
        const p = payload.payload as Record<string, unknown> | undefined;
        if (!isForThisDevice(p, chName)) {
          console.log("[Index] ⏭️ lock_command for different device, ignoring");
          return;
        }
        console.log("[Index] 🔒 Broadcast lock_command received:", payload);
        setShowPinKeypad(true);
        setIsCamouflageMode(true);
        toast({
          title: appLanguage === "en" ? "🔒 Device Locked" : "🔒 기기 잠금",
          description: appLanguage === "en" ? "Remote lock activated from smartphone." : "스마트폰에서 원격 잠금이 활성화되었습니다.",
        });
      });

      // 마스코트 보기/숨기기 원격 제어
      channel.on('broadcast', { event: 'mascot_toggle' }, (payload) => {
        const p = payload.payload as Record<string, unknown> | undefined;
        if (!isForThisDevice(p, chName)) {
          console.log("[Index] ⏭️ mascot_toggle for different device, ignoring");
          return;
        }
        const visible = p?.mascot_visible;
        if (typeof visible !== "boolean") {
          console.warn("[Index] ⚠️ Ignoring malformed mascot_toggle payload:", payload.payload);
          return;
        }
        console.log("[Index] 📲 Broadcast mascot_toggle received:", visible);
        setMascotVisible(visible);
        localStorage.setItem('meercop-mascot-visible', String(visible));

        // DB metadata에도 영속 저장
        if (currentDevice?.id) {
          updateDeviceViaEdge(currentDevice.id, {
            metadata: { mascot_visible: visible },
          })
            .then(() => console.log("[Index] ✅ mascot_visible persisted to DB:", visible))
            .catch((e) => console.warn("[Index] ⚠️ Failed to persist mascot_visible:", e));
        }
      });

      // 메시지 명령: 토스트 알림으로 메시지 표시
      channel.on('broadcast', { event: 'message_command' }, (payload) => {
        const p = payload.payload as Record<string, unknown> | undefined;
        if (!isForThisDevice(p, chName)) {
          console.log("[Index] ⏭️ message_command for different device, ignoring");
          return;
        }
        const message = (p?.message || (appLanguage === "en" ? "Message received." : "메시지가 도착했습니다.")) as string;
        const title = (p?.title || (appLanguage === "en" ? "📩 Remote Message" : "📩 원격 메시지")) as string;
        console.log("[Index] 💬 Broadcast message_command received:", message);
        toast({
          title,
          description: message,
          duration: 10000,
        });
      });

      channel.subscribe((status) => {
        console.log("[Index] 📡 device-commands channel status:", status, "topic:", channel.topic);
      });
    };

    channels.forEach(bindHandlers);

    return () => {
      channelNames.forEach((name) => channelManager.remove(name));
    };
  }, [currentDevice?.id, sharedDeviceIdState, refetch, stopAlarm, toast, appLanguage, setSelectedSoundId]);

  // Start/stop surveillance based on monitoring state from DB
  const startSurveillanceRef = useRef(startSurveillance);
  startSurveillanceRef.current = startSurveillance;
  const stopSurveillanceRef = useRef(stopSurveillance);
  stopSurveillanceRef.current = stopSurveillance;

  useEffect(() => {
    // 위장 모드 중에는 감시를 절대 중지하지 않음 (감시 유지 필수)
    const shouldBeActive = isMonitoring || isCamouflageMode;
    if (shouldBeActive && !isSurveillanceActive) {
      console.log("[Index] Starting surveillance", isMonitoring ? "(monitoring)" : "(camouflage mode)");
      isAlertActiveRef.current = false;
      startSurveillanceRef.current();
    } else if (!shouldBeActive && isSurveillanceActive) {
      console.log("[Index] Stopping surveillance");
      stopSurveillanceRef.current();
      isAlertActiveRef.current = false;
    }
  }, [isMonitoring, isSurveillanceActive, isCamouflageMode]);

  const handleDeviceSelect = useCallback((deviceId: string) => {
    setCurrentDeviceId(deviceId);
    localStorage.setItem('meercop-current-device-id', deviceId);
    deviceIdLockedRef.current = true;
    console.log("[Index] 🔒 Device manually selected & locked:", deviceId);
  }, []);

  // Wake Lock: 감시 중 화면 꺼짐 방지
  useWakeLock(isMonitoring);
  // App Stabilizer: 포그라운드 복귀 시 DB 재확인 + 캐시 정리
  useAppStabilizer();

  // 경보 중 브라우저 닫기 방지 (beforeunload 확인창)
  useEffect(() => {
    if (!isAlarming) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 크롬 등 최신 브라우저에서 확인창 표시를 위해 필요
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isAlarming]);

  // Show loading while checking auth - ALL HOOKS MUST BE ABOVE THIS LINE
  if (authLoading) {
    return (
      <div className="min-h-screen sky-background flex items-center justify-center">
        <div className="text-white text-lg">{appLanguage === "en" ? "Loading..." : "로딩 중..."}</div>
      </div>
    );
  }

  return (
    <I18nProvider initialLang={appLanguage as Lang}>
    {/* Permission Gate Modal */}
    <PermissionGateModal />
    {/* Camouflage Overlay - OUTSIDE ResizableContainer to cover entire viewport */}
    <CamouflageOverlay isActive={isCamouflageMode} />
    {/* PWA Install Popup */}
    <PwaInstallPopup />
    <ResizableContainer
      initialWidth={300}
      initialHeight={520}
      minWidth={200}
      minHeight={347}
      maxWidth={700}
      maxHeight={1200}
      baseWidth={300}
      baseHeight={520}
    >
       <div 
        className="w-full h-full flex flex-col relative overflow-hidden"
        style={
          backgroundSetting.value === "__default__"
            ? {
                backgroundImage: `url(${mainBg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center bottom',
              }
            : backgroundSetting.value.startsWith("data:")
              ? {
                  backgroundImage: `url(${backgroundSetting.value})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : {
                  background: backgroundSetting.value,
                }
        }
      >

        {/* Auto Broadcaster - listens for streaming requests from smartphone */}
        <AutoBroadcaster deviceId={currentDevice?.id} userId={savedAuth?.user_id} sharedDeviceId={sharedDeviceIdState || undefined} />

        {/* Alert Overlay - shows when alarm is triggered */}
        <AlertOverlay
          isActive={isAlarming}
          onDismiss={handleAlarmDismissRequest}
          eventType={currentEventType}
        />

        {/* PIN Keypad - shows when user tries to dismiss alarm from laptop */}
        <PinKeypad
          isOpen={showPinKeypad && isAlarming}
          correctPin={alarmPin}
          deviceId={currentDevice?.id}
          metadata={currentDevice?.metadata as { alarm_pin_hash?: string; alarm_pin?: string } | null}
          onSuccess={handleAlarmDismiss}
          onClose={() => setShowPinKeypad(false)}
        />

        {/* Side Menu */}
        <SideMenu
          isOpen={isSideMenuOpen}
          onClose={() => setIsSideMenuOpen(false)}
        />

        {/* Header */}
        <LaptopHeader 
          onMenuClick={() => setIsSideMenuOpen(true)}
          soundEnabled={isAlarmEnabled}
          onSoundToggle={toggleAlarmEnabled}
        />

        {/* Duplicate Name Alert Banner */}
        {duplicateNameAlert && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl bg-destructive/90 backdrop-blur-sm px-3 py-2 shadow-lg border border-destructive animate-fade-in">
            <AlertTriangle className="h-4 w-4 text-white shrink-0" />
            <span className="text-white text-[11px] font-bold flex-1">{duplicateNameAlert}</span>
            <button onClick={() => setDuplicateNameAlert(null)} className="p-0.5 rounded-full hover:bg-white/20 transition-colors">
              <X className="h-3 w-3 text-white/80" />
            </button>
          </div>
        )}

        {/* Device Name Badge */}
        <DeviceNameBadge 
          deviceName={currentDevice?.name || currentDevice?.device_name || savedAuth?.device_name || "Laptop1"}
          deviceId={currentDevice?.id}
          onNameChanged={() => { setDuplicateNameAlert(null); refetch(); }}
          onDuplicateName={(msg) => setDuplicateNameAlert(msg)}
        />

        {/* Status Icons - Real device status */}
        <LaptopStatusIcons
          smartphoneStatus={smartphoneOnline}
          networkStatus={isNetworkConnected}
          cameraStatus={isCameraAvailable}
          onCameraClick={() => setIsCameraModalOpen(true)}
          onSmartphoneClick={() => setIsLocationModalOpen(true)}
          onNetworkClick={() => setIsNetworkModalOpen(true)}
          onSettingsClick={() => setIsSettingsPanelOpen(true)}
        />

        {/* Sensor Settings Panel */}
        <SensorSettingsPanel
          isOpen={isSettingsPanelOpen}
          onClose={() => setIsSettingsPanelOpen(false)}
          sensorToggles={sensorToggles}
          alarmVolume={alarmVolume}
          onAlarmVolumeChange={(v) => {
            setAlarmVolume(v);
            localStorage.setItem('meercop-alarm-volume', String(v));
          }}
          isMonitoring={isMonitoring}
          deviceType={deviceType}
          capabilities={savedAuth?.capabilities}
          availableSounds={availableSounds}
          selectedSoundId={selectedSoundId}
          onSoundChange={(id) => {
            setSelectedSoundId(id);
            localStorage.setItem('meercop-alarm-sound', id);
            // DB 메타데이터에도 즉시 저장하여 덮어쓰기 방지
            if (currentDevice?.id) {
              updateDeviceViaEdge(currentDevice.id, {
                metadata: { alarm_sound_id: id },
              }).catch(e => console.error("[Index] Failed to save alarm sound:", e));
            }
          }}
          onPreviewSound={previewSound}
          appLanguage={appLanguage}
          onLanguageChange={(lang) => {
            setAppLanguage(lang);
            localStorage.setItem('meercop-language', lang);
            // DB metadata에도 저장
            if (currentDevice?.id) {
              updateDeviceViaEdge(currentDevice.id, {
                metadata: { language: lang },
              }).catch(e => console.error("[Index] Failed to save language:", e));
            }
          }}
          onBackgroundChange={(bg) => setBackgroundSetting(bg)}
          mascotVisible={mascotVisible}
          onMascotToggle={(visible) => {
            setMascotVisible(visible);
            localStorage.setItem('meercop-mascot-visible', String(visible));
            if (currentDevice?.id) {
              updateDeviceViaEdge(currentDevice.id, {
                metadata: { mascot_visible: visible },
              }).catch(() => {});
            }
          }}
        />

        {/* Camera Modal */}
        <CameraModal
          isOpen={isCameraModalOpen}
          onClose={() => setIsCameraModalOpen(false)}
          deviceId={currentDevice?.id}
          signalingDeviceId={sharedDeviceIdState || currentDevice?.id}
        />

        {/* Location Map Modal */}
        <LocationMapModal
          isOpen={isLocationModalOpen}
          onClose={() => setIsLocationModalOpen(false)}
          smartphoneDeviceId={smartphoneDevice?.id}
        />

        {/* Network Info Modal */}
        <NetworkInfoModal
          isOpen={isNetworkModalOpen}
          onClose={() => setIsNetworkModalOpen(false)}
          deviceId={currentDevice?.id}
        />

        {/* Mascot Section with Speech Bubble */}
        <LaptopMascotSection 
          isMonitoring={isMonitoring} 
          isAlarming={isAlarming}
          mascotVisible={mascotVisible}
          onMascotToggle={(visible) => {
            setMascotVisible(visible);
            localStorage.setItem('meercop-mascot-visible', String(visible));
            // DB metadata에도 저장
            if (currentDevice?.id) {
              updateDeviceViaEdge(currentDevice.id, {
                metadata: { mascot_visible: visible },
              }).catch(() => {});
            }
          }}
        />

      </div>
    </ResizableContainer>
    </I18nProvider>
  );
};

export default Index;
