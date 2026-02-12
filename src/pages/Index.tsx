import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LaptopHeader } from "@/components/LaptopHeader";
import { LaptopStatusIcons } from "@/components/LaptopStatusIcons";
import { LaptopMascotSection } from "@/components/LaptopMascotSection";
import { DeviceNameBadge } from "@/components/DeviceNameBadge";
import { ResizableContainer } from "@/components/ResizableContainer";
import { SideMenu } from "@/components/SideMenu";
import { CameraModal } from "@/components/CameraModal";
import { AlertOverlay } from "@/components/AlertOverlay";
import { PinKeypad } from "@/components/PinKeypad";
import { LocationMapModal } from "@/components/LocationMapModal";
import { NetworkInfoModal } from "@/components/NetworkInfoModal";
import { AutoBroadcaster } from "@/components/AutoBroadcaster";
import { CamouflageOverlay } from "@/components/CamouflageOverlay";
import { useDevices } from "@/hooks/useDevices";
import { useAuth } from "@/hooks/useAuth";
import { useDeviceStatus } from "@/hooks/useDeviceStatus";
import { useSecuritySurveillance, SecurityEvent, SensorToggles } from "@/hooks/useSecuritySurveillance";
import { useAlerts } from "@/hooks/useAlerts";
import { saveAlertPhotos } from "@/lib/localPhotoStorage";
import { addActivityLog } from "@/lib/localActivityLogs";
import { PhotoTransmitter, PhotoTransmission } from "@/lib/photoTransmitter";
import { useCameraDetection } from "@/hooks/useCameraDetection";
import { useAlarmSystem } from "@/hooks/useAlarmSystem";
import { useLocationResponder } from "@/hooks/useLocationResponder";
import { useNetworkInfoResponder } from "@/hooks/useNetworkInfoResponder";
import { supabaseShared } from "@/lib/supabase";
import mainBg from "@/assets/main-bg.png";

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [currentEventType, setCurrentEventType] = useState<string | undefined>();
  const { devices, refetch } = useDevices();
  
  // Get the current device
  const currentDevice = currentDeviceId 
    ? devices.find(d => d.id === currentDeviceId) 
    : devices[0];
  
  const { isNetworkConnected, isCameraAvailable, setCameraAvailable } = useDeviceStatus(currentDevice?.id, isAuthenticated);

  // Camera detection - auto-sync to DB
  useCameraDetection({ deviceId: currentDevice?.id });
  // Location responder - listens for locate commands from smartphone
  useLocationResponder(currentDevice?.id);
  // Network info responder - listens for network_info commands from smartphone
  useNetworkInfoResponder(currentDevice?.id);
  // Alerts system - broadcasts alerts to smartphone via Presence
  const { triggerAlert, dismissedBySmartphone } = useAlerts(currentDevice?.id);
  const triggerAlertRef = useRef(triggerAlert);
  triggerAlertRef.current = triggerAlert;
  // PIN for alarm dismissal (default: 1234, will be set from smartphone)
  const [alarmPin, setAlarmPin] = useState(() => localStorage.getItem('meercop-alarm-pin') || "1234");
  const [showPinKeypad, setShowPinKeypad] = useState(false);
  // Whether PC PIN is required for alarm dismissal (default: true)
  const [requirePcPin, setRequirePcPin] = useState(() => {
    const stored = localStorage.getItem('meercop-require-pc-pin');
    return stored !== null ? stored === 'true' : true;
  });
  const [isCamouflageMode, setIsCamouflageMode] = useState(false);
  // Sensor toggles from smartphone metadata
  const [sensorToggles, setSensorToggles] = useState<SensorToggles>({
    cameraMotion: true, lid: true, keyboard: true, mouse: true, power: true,
  });
  const [motionThreshold, setMotionThreshold] = useState(15);
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
  } = useAlarmSystem();

  // Photo transmitter - manages broadcast + offline queue
  const transmitterRef = useRef<PhotoTransmitter | null>(null);
  
  useEffect(() => {
    if (currentDevice?.id) {
      transmitterRef.current = new PhotoTransmitter(currentDevice.id);
    }
    return () => {
      transmitterRef.current?.destroy();
      transmitterRef.current = null;
    };
  }, [currentDevice?.id]);

  // Security event handler - use ref to avoid recreating callback
  const startAlarmRef = useRef(startAlarm);
  startAlarmRef.current = startAlarm;

  const handleSecurityEvent = useCallback((event: SecurityEvent) => {
    console.log("[Security] Event detected:", event.type, "Photos:", event.photos.length, 
      event.changePercent ? `Change: ${event.changePercent.toFixed(1)}%` : "");
    setCurrentEventType(event.type);
    startAlarmRef.current();

    // 스마트폰에 경보 알림 전송 (Presence 채널)
    triggerAlertRef.current(`alert_${event.type}`, {
      alert_type: event.type,
      change_percent: event.changePercent,
      photo_count: event.photos.length,
      message: event.type === "camera_motion"
        ? `카메라 모션 감지 (변화율: ${event.changePercent?.toFixed(1)}%)`
        : `${event.type} 이벤트 감지됨`,
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
    mouseSensitivity: 50,
    motionThreshold,
    sensorToggles,
  });

  // Handle alarm dismiss (from PIN keypad success)
  const handleAlarmDismiss = useCallback(() => {
    stopAlarm();
    setCurrentEventType(undefined);
    setShowPinKeypad(false);
  }, [stopAlarm]);

  // When AlertOverlay dismiss is clicked, show PIN keypad or dismiss directly
  const handleAlarmDismissRequest = useCallback(() => {
    if (requirePcPin) {
      setShowPinKeypad(true);
    } else {
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
    }
  }, [dismissedBySmartphone, stopAlarm]);

  // Listen for settings changes from smartphone via metadata
  useEffect(() => {
    if (!currentDevice?.id) return;
    const meta = currentDevice?.metadata as {
      alarm_pin?: string;
      alarm_sound_id?: string;
      camouflage_mode?: boolean;
      sensorSettings?: {
        camera?: boolean;
        lidClosed?: boolean;
        keyboard?: boolean;
        mouse?: boolean;
        usb?: boolean;
      };
      motionSensitivity?: string; // "sensitive" | "normal" | "insensitive"
    } | null;

    if (meta?.alarm_pin) {
      setAlarmPin(meta.alarm_pin);
      localStorage.setItem('meercop-alarm-pin', meta.alarm_pin);
    }

    // Sync require_pc_pin setting
    if ((meta as any)?.require_pc_pin !== undefined) {
      const val = (meta as any).require_pc_pin;
      setRequirePcPin(val);
      localStorage.setItem('meercop-require-pc-pin', String(val));
      console.log("[Index] require_pc_pin updated from metadata:", val);
    }

    // Sync camouflage mode from metadata
    if (meta?.camouflage_mode !== undefined) {
      setIsCamouflageMode(meta.camouflage_mode);
      console.log("[Index] Camouflage mode updated from metadata:", meta.camouflage_mode);
    }

    // Sync sensor toggles from metadata
    if (meta?.sensorSettings) {
      const s = meta.sensorSettings;
      setSensorToggles({
        cameraMotion: s.camera ?? true,
        lid: s.lidClosed ?? true,
        keyboard: s.keyboard ?? true,
        mouse: s.mouse ?? true,
        power: true, // power not in sensorSettings, always on
      });
      console.log("[Index] Sensor toggles updated from metadata:", s);
    }

    // Sync motion sensitivity: 민감=10%, 보통=50%, 둔감=80%
    if (meta?.motionSensitivity) {
      const sensitivityMap: Record<string, number> = {
        sensitive: 10,
        normal: 50,
        insensitive: 80,
      };
      const threshold = sensitivityMap[meta.motionSensitivity] ?? 15;
      setMotionThreshold(threshold);
      console.log("[Index] Motion threshold updated:", meta.motionSensitivity, "→", threshold);
    }
  }, [currentDevice?.metadata, currentDevice?.id]);

  // Redirect to auth if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Set initial device
  useEffect(() => {
    if (devices.length > 0 && !currentDeviceId) {
      setCurrentDeviceId(devices[0].id);
    }
  }, [devices, currentDeviceId]);

  // Subscribe to monitoring status from smartphone via DB
  // Only start surveillance when smartphone requests it
  useEffect(() => {
    if (!currentDevice?.id) return;

    let pollInterval = 2000;
    let pollTimeoutId: NodeJS.Timeout | null = null;
    let retryTimeoutId: NodeJS.Timeout | null = null;
    let isPollingActive = false;
    let isMounted = true;

    // Fetch monitoring status from device (direct column, not metadata)
    const fetchMonitoringStatus = async () => {
      if (!isMounted) return false;
      
      try {
        const { data, error } = await supabaseShared
          .from("devices")
          .select("is_monitoring")
          .eq("id", currentDevice.id)
          .maybeSingle();
        
        if (error) {
          console.error("[Index] Error fetching monitoring status:", error);
          return false;
        }
        
        // Read from is_monitoring column directly (not metadata)
        const isMonitoringFromDB = (data as { is_monitoring?: boolean })?.is_monitoring ?? false;
        console.log("[Index] Fetched monitoring status:", isMonitoringFromDB);
        if (isMounted) {
          setIsMonitoring(isMonitoringFromDB);
        }
        return isMonitoringFromDB;
      } catch (err) {
        console.error("[Index] Fetch error:", err);
        return false;
      }
    };

    // Fallback polling with exponential backoff (with deduplication)
    const startPolling = () => {
      if (isPollingActive) return; // Prevent duplicate polling
      isPollingActive = true;
      
      const poll = async () => {
        if (!isMounted) return;
        await fetchMonitoringStatus();
        // Backoff up to 10 seconds
        pollInterval = Math.min(pollInterval * 1.5, 10000);
        if (isMounted && isPollingActive) {
          pollTimeoutId = setTimeout(poll, pollInterval);
        }
      };
      pollTimeoutId = setTimeout(poll, pollInterval);
    };

    const stopPolling = () => {
      isPollingActive = false;
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      }
    };

    fetchMonitoringStatus();

    // Subscribe to realtime changes with retry logic
    const channel = supabaseShared
      .channel(`laptop-monitoring-status-${currentDevice.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "devices",
          filter: `id=eq.${currentDevice.id}`,
        },
        (payload) => {
          const newData = payload.new as { is_monitoring?: boolean; metadata?: Record<string, unknown> };
          
          // Read monitoring status
          const isMonitoringFromDB = newData.is_monitoring ?? false;
          console.log("[Index] Monitoring status changed from DB:", isMonitoringFromDB);
          if (isMounted) {
            setIsMonitoring(isMonitoringFromDB);
          }

          // Read metadata changes (alarm_pin, sensorSettings, etc.)
          if (newData.metadata && isMounted) {
            const meta = newData.metadata as {
              alarm_pin?: string;
              alarm_sound_id?: string;
              camouflage_mode?: boolean;
              sensorSettings?: { camera?: boolean; lidClosed?: boolean; keyboard?: boolean; mouse?: boolean; usb?: boolean };
              motionSensitivity?: string;
            };
            if (meta.alarm_pin) {
              console.log("[Index] PIN updated from DB:", meta.alarm_pin);
              setAlarmPin(meta.alarm_pin);
              localStorage.setItem('meercop-alarm-pin', meta.alarm_pin);
            }
            if ((meta as any).require_pc_pin !== undefined) {
              setRequirePcPin((meta as any).require_pc_pin);
              localStorage.setItem('meercop-require-pc-pin', String((meta as any).require_pc_pin));
              console.log("[Index] require_pc_pin updated via Realtime:", (meta as any).require_pc_pin);
            }
            if (meta.camouflage_mode !== undefined) {
              setIsCamouflageMode(meta.camouflage_mode);
              console.log("[Index] Camouflage mode updated via Realtime:", meta.camouflage_mode);
            }
            if (meta.alarm_sound_id) {
              console.log("[Index] Alarm sound updated from DB:", meta.alarm_sound_id);
              setSelectedSoundId(meta.alarm_sound_id);
            }
            if (meta.sensorSettings) {
              const s = meta.sensorSettings;
              setSensorToggles({
                cameraMotion: s.camera ?? true,
                lid: s.lidClosed ?? true,
                keyboard: s.keyboard ?? true,
                mouse: s.mouse ?? true,
                power: true,
              });
              console.log("[Index] Sensor toggles updated via Realtime:", s);
            }
            if (meta.motionSensitivity) {
              const sensitivityMap: Record<string, number> = { sensitive: 10, normal: 50, insensitive: 80 };
              setMotionThreshold(sensitivityMap[meta.motionSensitivity] ?? 15);
              console.log("[Index] Motion threshold updated via Realtime:", meta.motionSensitivity);
            }
          }

          // Reset poll interval on realtime event
          pollInterval = 2000;
        }
      )
      .subscribe((status, err) => {
        console.log("[Index] Monitoring channel status:", status, err);
        
        if (status === "SUBSCRIBED") {
          // Stop polling when realtime is working
          stopPolling();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Start fallback polling and retry subscription
          startPolling();
          retryTimeoutId = setTimeout(() => {
            if (isMounted) channel.subscribe();
          }, 3000);
        } else if (status === "CLOSED") {
          // Only start polling if component is still mounted
          if (isMounted) startPolling();
        }
      });

    return () => {
      isMounted = false;
      stopPolling();
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      supabaseShared.removeChannel(channel);
    };
  }, [currentDevice?.id]);

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
      maxWidth={450}
      maxHeight={780}
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
          devices={devices}
          currentDeviceId={currentDevice?.id}
          onDeviceSelect={handleDeviceSelect}
          onDevicesRefresh={refetch}
          availableSounds={availableSounds}
          selectedSoundId={selectedSoundId}
          onSelectSound={setSelectedSoundId}
          onPreviewSound={previewSound}
        />

        {/* Header */}
        <LaptopHeader 
          onMenuClick={() => setIsSideMenuOpen(true)}
          soundEnabled={isAlarmEnabled}
          onSoundToggle={toggleAlarmEnabled}
        />

        {/* Device Name Badge */}
        <DeviceNameBadge 
          deviceName={currentDevice?.device_name || "Laptop1"}
        />

        {/* Status Icons - Real device status */}
        <LaptopStatusIcons
          meercopStatus={isAuthenticated}
          networkStatus={isNetworkConnected}
          cameraStatus={isCameraAvailable}
          onCameraClick={() => setIsCameraModalOpen(true)}
          onMeercopClick={() => setIsLocationModalOpen(true)}
          onNetworkClick={() => setIsNetworkModalOpen(true)}
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
          deviceId={currentDevice?.id}
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

        {/* 테스트 페이지 바로가기 (임시) */}
        <Link 
          to="/motion-test"
          className="absolute bottom-2 right-2 bg-yellow-500 text-black text-[10px] font-bold px-2 py-1 rounded shadow-lg z-30 hover:bg-yellow-400"
        >
          🔬 모션 테스트
        </Link>
      </div>
    </ResizableContainer>
  );
};

export default Index;
