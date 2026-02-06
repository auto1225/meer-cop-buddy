import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LaptopHeader } from "@/components/LaptopHeader";
import { LaptopStatusIcons } from "@/components/LaptopStatusIcons";
import { LaptopMascotSection } from "@/components/LaptopMascotSection";
import { DeviceNameBadge } from "@/components/DeviceNameBadge";
import { ResizableContainer } from "@/components/ResizableContainer";
import { SideMenu } from "@/components/SideMenu";
import { CameraModal } from "@/components/CameraModal";
import { AlertOverlay } from "@/components/AlertOverlay";
import { AutoBroadcaster } from "@/components/AutoBroadcaster";
import { useDevices } from "@/hooks/useDevices";
import { useAuth } from "@/hooks/useAuth";
import { useDeviceStatus } from "@/hooks/useDeviceStatus";
import { useSecuritySurveillance, SecurityEvent } from "@/hooks/useSecuritySurveillance";
import { useCameraDetection } from "@/hooks/useCameraDetection";
import { useAlarmSystem } from "@/hooks/useAlarmSystem";
import { supabaseShared } from "@/lib/supabase";
import mainBg from "@/assets/main-bg.png";

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
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

  // Security event handler - use ref to avoid recreating callback
  const startAlarmRef = useRef(startAlarm);
  startAlarmRef.current = startAlarm;

  const handleSecurityEvent = useCallback((event: SecurityEvent) => {
    console.log("[Security] Event detected:", event.type, "Photos:", event.photos.length);
    setCurrentEventType(event.type);
    startAlarmRef.current();
  }, []);

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
  });

  // Handle alarm dismiss
  const handleAlarmDismiss = useCallback(() => {
    stopAlarm();
    setCurrentEventType(undefined);
  }, [stopAlarm]);

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

    // Fetch monitoring status from device (direct column, not metadata)
    const fetchMonitoringStatus = async () => {
      const { data } = await supabaseShared
        .from("devices")
        .select("is_monitoring")
        .eq("id", currentDevice.id)
        .maybeSingle();
      
      // Read from is_monitoring column directly (not metadata)
      const isMonitoringFromDB = (data as { is_monitoring?: boolean })?.is_monitoring ?? false;
      console.log("[Index] Fetched monitoring status:", isMonitoringFromDB);
      setIsMonitoring(isMonitoringFromDB);
      return isMonitoringFromDB;
    };

    // Fallback polling with exponential backoff
    const startPolling = () => {
      const poll = async () => {
        await fetchMonitoringStatus();
        // Backoff up to 10 seconds
        pollInterval = Math.min(pollInterval * 1.5, 10000);
        pollTimeoutId = setTimeout(poll, pollInterval);
      };
      pollTimeoutId = setTimeout(poll, pollInterval);
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
          // Read from is_monitoring column directly (not metadata)
          const isMonitoringFromDB = (payload.new as { is_monitoring?: boolean }).is_monitoring ?? false;
          console.log("[Index] Monitoring status changed from DB:", isMonitoringFromDB);
          setIsMonitoring(isMonitoringFromDB);
          // Reset poll interval on realtime event
          pollInterval = 2000;
        }
      )
      .subscribe((status, err) => {
        console.log("[Index] Monitoring channel status:", status, err);
        
        if (status === "SUBSCRIBED") {
          // Stop polling when realtime is working
          if (pollTimeoutId) {
            clearTimeout(pollTimeoutId);
            pollTimeoutId = null;
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Start fallback polling and retry subscription
          startPolling();
          retryTimeoutId = setTimeout(() => {
            channel.subscribe();
          }, 3000);
        } else if (status === "CLOSED") {
          // Start fallback polling
          startPolling();
        }
      });

    return () => {
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
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
        {/* Auto Broadcaster - listens for streaming requests from smartphone */}
        <AutoBroadcaster deviceId={currentDevice?.id} />

        {/* Alert Overlay - shows when alarm is triggered */}
        <AlertOverlay
          isActive={isAlarming}
          onDismiss={handleAlarmDismiss}
          eventType={currentEventType}
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
        />

        {/* Camera Modal */}
        <CameraModal
          isOpen={isCameraModalOpen}
          onClose={() => setIsCameraModalOpen(false)}
          onCameraStatusChange={setCameraAvailable}
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
