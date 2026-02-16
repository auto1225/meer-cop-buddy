import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { CamouflageOverlay } from "@/components/CamouflageOverlay";
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
import { supabaseShared } from "@/lib/supabase";
import { fetchDeviceViaEdge, updateDeviceViaEdge } from "@/lib/deviceApi";
import mainBg from "@/assets/main-bg.png";

const Index = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const savedAuth = getSavedAuth();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [alarmVolume, setAlarmVolume] = useState(() => {
    const saved = localStorage.getItem('meercop-alarm-volume');
    return saved ? parseInt(saved, 10) : 50;
  });
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [currentEventType, setCurrentEventType] = useState<string | undefined>();
  const { devices, refetch } = useDevices(savedAuth?.user_id);
  
  // Debug: log device fetch results
  useEffect(() => {
    console.log("[Index] 🔍 Devices loaded:", devices.length, 
      "userId:", savedAuth?.user_id,
      "savedDeviceId:", savedAuth?.device_id,
      "devices:", devices.map(d => ({ id: d.id, type: d.device_type, status: d.status, name: d.device_name }))
    );
  }, [devices]);

  // Get the current device (this laptop) - use savedAuth.device_id to match correctly
  const currentDevice = currentDeviceId 
    ? devices.find(d => d.id === currentDeviceId) 
    : undefined;

  // Debug: log currentDevice resolution
  useEffect(() => {
    console.log("[Index] 🖥️ currentDeviceId:", currentDeviceId, "→ currentDevice:", currentDevice?.id, currentDevice?.device_name);
  }, [currentDeviceId, currentDevice]);

  // Detect smartphone online status from devices list
  // device_type enum: laptop | desktop | smartphone | tablet
  const smartphoneDevice = devices.find(d => d.device_type === 'smartphone');
  const smartphoneOnline = smartphoneDevice
    ? (smartphoneDevice.status === 'online' || smartphoneDevice.is_monitoring === true)
    : false;
  
  console.log("[Index] 📱 smartphoneDevice:", smartphoneDevice?.id, "status:", smartphoneDevice?.status, "online:", smartphoneOnline);
  
  const { isNetworkConnected, isCameraAvailable, setCameraAvailable } = useDeviceStatus(currentDevice?.id, isAuthenticated, savedAuth?.user_id);

  // Camera detection - auto-sync to DB
  useCameraDetection({ deviceId: currentDevice?.id });
  // Location responder - reacts to metadata.locate_requested (no independent polling)
  const currentMeta = currentDevice?.metadata as Record<string, unknown> | null;
  useLocationResponder(currentDevice?.id, currentMeta);
  // Network info responder - reacts to metadata.network_info_requested (no independent polling)
  useNetworkInfoResponder(currentDevice?.id, currentMeta);
  // Alerts system - broadcasts alerts to smartphone via Presence
  const { triggerAlert, dismissedBySmartphone } = useAlerts(currentDevice?.id, savedAuth?.user_id);
  const triggerAlertRef = useRef(triggerAlert);
  triggerAlertRef.current = triggerAlert;
  // PIN for alarm dismissal (default: 1234, will be set from smartphone)
  const [alarmPin, setAlarmPin] = useState(() => localStorage.getItem('meercop-alarm-pin') || "1234");
  const [requirePcPin, setRequirePcPin] = useState(true); // require_pc_pin from metadata
  const [showPinKeypad, setShowPinKeypad] = useState(false);
  const [isCamouflageMode, setIsCamouflageMode] = useState(false);
  // Sensor toggles from smartphone metadata
  const [sensorToggles, setSensorToggles] = useState<SensorToggles>({
    cameraMotion: true, lid: true, keyboard: true, mouse: true, power: true, microphone: false, usb: false,
  });
  const [motionThreshold, setMotionThreshold] = useState(15);
  const [mouseSensitivityPx, setMouseSensitivityPx] = useState(30); // default: normal (≈3cm)
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

  const handleSecurityEvent = useCallback(async (event: SecurityEvent) => {
    console.log("[Security] Event detected:", event.type, "Photos:", event.photos.length, 
      event.changePercent ? `Change: ${event.changePercent.toFixed(1)}%` : "");
    setCurrentEventType(event.type);
    startAlarmRef.current();

    const alertMessage = event.type === "camera_motion"
      ? `카메라 모션 감지 (변화율: ${event.changePercent?.toFixed(1)}%)`
      : `${event.type} 이벤트 감지됨`;

    // localStorage에 경보 상태 영속 저장 (도난 복구용)
    markAlertActive(`alert_${event.type}`, alertMessage);

    // GPS 위치 확인 (경보 시점)
    let alertCoords: { latitude: number; longitude: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 5000, maximumAge: 0,
        });
      });
      alertCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      
      // DB에 위치 업데이트 via Edge Function
      if (currentDevice?.id) {
        try {
          const device = await fetchDeviceViaEdge(currentDevice.id, savedAuth?.user_id || "");
          const existingMeta = (device?.metadata as Record<string, unknown>) || {};
          await updateDeviceViaEdge(currentDevice.id, {
            latitude: alertCoords.latitude,
            longitude: alertCoords.longitude,
            location_updated_at: new Date().toISOString(),
            is_streaming_requested: true,
            metadata: { ...existingMeta, last_location_source: "alert_triggered" },
          });
        } catch (e) {
          console.error("[Security] Failed to update device location:", e);
        }
      }
    } catch {
      console.log("[Security] GPS unavailable at alert time");
    }

    // 스마트폰에 경보 알림 전송 (위치 + 스트리밍 포함)
    triggerAlertRef.current(`alert_${event.type}`, {
      alert_type: event.type,
      change_percent: event.changePercent,
      photo_count: event.photos.length,
      message: alertMessage,
      latitude: alertCoords?.latitude,
      longitude: alertCoords?.longitude,
      auto_streaming: true,
    });

    const alertId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    if (event.photos.length > 0 && currentDevice?.id) {
      // 1. IndexedDB에 로컬 백업 저장
      saveAlertPhotos({
        id: alertId,
        device_id: currentDevice.id,
        event_type: event.type,
        photos: event.photos,
        created_at: now,
      });

      // 2. 스마트폰으로 사진 전송 (Broadcast + 오프라인 큐)
      const transmission: PhotoTransmission = {
        id: alertId,
        device_id: currentDevice.id,
        event_type: event.type,
        photos: event.photos,
        change_percent: event.changePercent,
        latitude: alertCoords?.latitude,
        longitude: alertCoords?.longitude,
        auto_streaming: true,
        created_at: now,
      };
      
      transmitterRef.current?.transmit(transmission).then(sent => {
        console.log(`[Security] Photo transmission ${sent ? "✅ sent" : "📥 queued"}`);
      });
    }

    // 활동 로그에 메타데이터만 기록 (사진 제외)
    if (currentDevice?.id) {
      addActivityLog(currentDevice.id, `alert_${event.type}`, {
        alert_type: event.type,
        photo_count: event.photos.length,
        change_percent: event.changePercent,
        alert_id: alertId,
        message: event.type === "camera_motion"
          ? `카메라 모션 감지 (변화율: ${event.changePercent?.toFixed(1)}%)`
          : `${event.type} 이벤트 감지됨`,
      });
    }
  }, [currentDevice?.id]);

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
    setCurrentEventType(undefined);
    setShowPinKeypad(false);
    markAlertCleared(); // 도난 복구 상태 해제
  }, [stopAlarm]);

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
  });

  // Listen for settings changes from smartphone via metadata
  useEffect(() => {
    if (!currentDevice?.id) return;
    const meta = currentDevice?.metadata as {
      alarm_pin?: string;
      alarm_sound_id?: string;
      require_pc_pin?: boolean;
      camouflage_mode?: boolean;
      sensorSettings?: {
        camera?: boolean;
        lidClosed?: boolean;
        microphone?: boolean;
        keyboard?: boolean;
        mouse?: boolean;
        usb?: boolean;
        power?: boolean;
      };
      motionSensitivity?: string;
      mouseSensitivity?: string;
    } | null;

    console.log("[Index] 📋 Current metadata from DB:", JSON.stringify(meta));

    if (meta?.alarm_pin) {
      setAlarmPin(meta.alarm_pin);
      localStorage.setItem('meercop-alarm-pin', meta.alarm_pin);
      console.log("[Index] ✅ alarm_pin applied:", meta.alarm_pin);
    }

    if (meta?.require_pc_pin !== undefined) {
      setRequirePcPin(meta.require_pc_pin);
      console.log("[Index] ✅ require_pc_pin applied:", meta.require_pc_pin);
    }

    if (meta?.camouflage_mode !== undefined) {
      setIsCamouflageMode(meta.camouflage_mode);
      console.log("[Index] ✅ camouflage_mode applied:", meta.camouflage_mode);
    }

    // alarm_sound_id는 컴퓨터 자체 localStorage에서 관리 (DB 동기화하지 않음)

    if (meta?.sensorSettings) {
      const s = meta.sensorSettings;
      setSensorToggles({
        cameraMotion: s.camera ?? true,
        lid: s.lidClosed ?? true,
        keyboard: s.keyboard ?? true,
        mouse: s.mouse ?? true,
        power: s.power ?? true,
        microphone: s.microphone ?? false,
        usb: s.usb ?? false,
      });
      console.log("[Index] ✅ sensorSettings applied:", s);
    }

    if (meta?.motionSensitivity) {
      const sensitivityMap: Record<string, number> = {
        sensitive: 10,
        normal: 50,
        insensitive: 80,
      };
      const threshold = sensitivityMap[meta.motionSensitivity] ?? 15;
      setMotionThreshold(threshold);
      console.log("[Index] ✅ motionSensitivity applied:", meta.motionSensitivity, "→", threshold);
    }

    if (meta?.mouseSensitivity) {
      // 0.2초 내 이동 거리 임계값 (px): 민감 5px(≈0.5cm), 보통 30px(≈3cm), 둔감 100px(≈10cm)
      const mouseMap: Record<string, number> = {
        sensitive: 5,
        normal: 30,
        insensitive: 100,
      };
      const px = mouseMap[meta.mouseSensitivity] ?? 30;
      setMouseSensitivityPx(px);
      console.log("[Index] ✅ mouseSensitivity applied:", meta.mouseSensitivity, "→", px, "px");
    }
  }, [currentDevice?.metadata, currentDevice?.id]);

  // No redirect needed - App.tsx handles auth gate

  // Set initial device - match by savedAuth, allow correction if wrong
  useEffect(() => {
    if (devices.length === 0) return;
    
    // Determine the correct device ID (priority order)
    let correctDeviceId: string | null = null;
    
    // 1. Match by UUID (id or device_id)
    if (savedAuth?.device_id) {
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
    
    // 3. Fallback: find laptop/desktop/notebook type device
    if (!correctDeviceId) {
      const laptopDevice = devices.find(d => 
        d.device_type === 'laptop' || d.device_type === 'desktop' || d.device_type === 'notebook'
      );
      correctDeviceId = laptopDevice?.id || devices[0].id;
    }
    
    // Set or correct if wrong
    if (currentDeviceId !== correctDeviceId) {
      console.log("[Index] ✅ Setting currentDeviceId:", correctDeviceId, 
        "(was:", currentDeviceId, ") savedAuth:", savedAuth?.device_id);
      setCurrentDeviceId(correctDeviceId);
    }
  }, [devices, currentDeviceId, savedAuth?.device_id]);

  // Sync alarm sounds list to DB metadata via Edge Function
  useEffect(() => {
    if (!currentDevice?.id || !savedAuth?.user_id) return;
    const syncAlarmSounds = async () => {
      try {
        const device = await fetchDeviceViaEdge(currentDevice.id, savedAuth.user_id);
        const existingMeta = (device?.metadata as Record<string, unknown>) || {};
        await updateDeviceViaEdge(currentDevice.id, {
          metadata: { ...existingMeta, available_alarm_sounds: getAlarmSoundsForDB() },
        });
        console.log("[Index] ✅ Alarm sounds list synced to DB");
      } catch (e) {
        console.error("[Index] Failed to sync alarm sounds to DB:", e);
      }
    };
    syncAlarmSounds();
  }, [currentDevice?.id, savedAuth?.user_id]);

  // Track when broadcast sets monitoring (to prevent polling override)
  const broadcastMonitoringAt = useRef<number>(0);

  // Sync isMonitoring from devices data (useDevices already polls)
  // BUT skip if broadcast recently set the value (within 15s)
  useEffect(() => {
    if (!currentDevice) return;
    const mon = (currentDevice as unknown as Record<string, unknown>).is_monitoring;
    if (mon !== undefined) {
      const sinceBroadcast = Date.now() - broadcastMonitoringAt.current;
      if (sinceBroadcast < 15000) {
        console.log("[Index] 📡 Skipping polling override (broadcast was", Math.round(sinceBroadcast / 1000), "s ago)");
        return;
      }
      setIsMonitoring(prev => {
        const val = mon === true;
        if (prev !== val) console.log("[Index] 📡 Monitoring from devices:", val);
        return val;
      });
    }
  }, [currentDevice]);

  // Subscribe to broadcast commands from smartphone (instant, no polling)
  useEffect(() => {
    if (!currentDevice?.id) return;

    const channelName = `device-commands-${currentDevice.id}`;
    console.log("[Index] 🔌 Subscribing to broadcast channel:", channelName);

    // Remove any existing channel with same name to avoid duplicates
    const existingChannels = supabaseShared.getChannels();
    const existing = existingChannels.find(ch => ch.topic === `realtime:${channelName}`);
    if (existing) {
      supabaseShared.removeChannel(existing);
    }

    const channel = supabaseShared.channel(channelName);
    
    channel.on('broadcast', { event: 'monitoring_toggle' }, (payload) => {
      const isOn = payload.payload?.is_monitoring ?? false;
      console.log("[Index] 📲 Broadcast monitoring_toggle received:", isOn);
      broadcastMonitoringAt.current = Date.now();
      setIsMonitoring(isOn);
      refetch();
    });
    
    channel.on('broadcast', { event: 'settings_update' }, () => {
      console.log("[Index] 📲 Broadcast settings_update received");
      refetch();
    });

    channel.on('broadcast', { event: 'remote_alarm_off' }, () => {
      console.log("[Index] 📲 Broadcast remote_alarm_off received");
      stopAlarm();
      setCurrentEventType(undefined);
      setShowPinKeypad(false);
      markAlertCleared();
    });

    channel.subscribe((status) => {
      console.log("[Index] 📡 device-commands channel status:", status);
    });

    return () => {
      supabaseShared.removeChannel(channel);
    };
  }, [currentDevice?.id, refetch, stopAlarm]);

  // When smartphone goes offline, force stop monitoring
  useEffect(() => {
    if (!smartphoneOnline && isMonitoring) {
      console.log("[Index] 📴 Smartphone went offline → stopping monitoring");
      setIsMonitoring(false);
    }
  }, [smartphoneOnline, isMonitoring]);

  // Start/stop surveillance based on monitoring state from DB
  useEffect(() => {
    if (isMonitoring && !isSurveillanceActive) {
      console.log("[Index] Starting surveillance (requested by smartphone)");
      startSurveillance();
    } else if (!isMonitoring && isSurveillanceActive) {
      console.log("[Index] Stopping surveillance");
      stopSurveillance();
    }
  }, [isMonitoring, isSurveillanceActive, startSurveillance, stopSurveillance]);

  const handleDeviceSelect = useCallback((deviceId: string) => {
    setCurrentDeviceId(deviceId);
  }, []);

  // Show loading while checking auth - ALL HOOKS MUST BE ABOVE THIS LINE
  if (authLoading) {
    return (
      <div className="min-h-screen sky-background flex items-center justify-center">
        <div className="text-white text-lg">로딩 중...</div>
      </div>
    );
  }

  return (
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
        style={{
          backgroundImage: `url(${mainBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center bottom',
        }}
      >
        {/* Camouflage Overlay - fullscreen black screen, smartphone-only dismiss */}
        <CamouflageOverlay isActive={isCamouflageMode} />

        {/* Auto Broadcaster - listens for streaming requests from smartphone */}
        <AutoBroadcaster deviceId={currentDevice?.id} />

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

        {/* Device Name Badge */}
        <DeviceNameBadge 
          deviceName={currentDevice?.device_name || savedAuth?.device_name || "Laptop1"}
          deviceId={currentDevice?.id}
          onNameChanged={() => refetch()}
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
          availableSounds={availableSounds}
          selectedSoundId={selectedSoundId}
          onSoundChange={setSelectedSoundId}
          onPreviewSound={previewSound}
        />

        {/* Camera Modal */}
        <CameraModal
          isOpen={isCameraModalOpen}
          onClose={() => setIsCameraModalOpen(false)}
          onCameraStatusChange={setCameraAvailable}
          deviceId={currentDevice?.id}
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
        />

      </div>
    </ResizableContainer>
  );
};

export default Index;
