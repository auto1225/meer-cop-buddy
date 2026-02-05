import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LaptopHeader } from "@/components/LaptopHeader";
import { LaptopStatusIcons } from "@/components/LaptopStatusIcons";
import { LaptopMascotSection } from "@/components/LaptopMascotSection";
import { DeviceNameBadge } from "@/components/DeviceNameBadge";
import { ResizableContainer } from "@/components/ResizableContainer";
import { SideMenu } from "@/components/SideMenu";
import { CameraModal } from "@/components/CameraModal";
import { AlertOverlay } from "@/components/AlertOverlay";
import { useDevices } from "@/hooks/useDevices";
import { useAuth } from "@/hooks/useAuth";
import { useDeviceStatus } from "@/hooks/useDeviceStatus";
import { useSecuritySurveillance, SecurityEvent } from "@/hooks/useSecuritySurveillance";
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
  const { isNetworkConnected, isCameraAvailable, setCameraAvailable } = useDeviceStatus();

  // Alarm system
  const { 
    isAlarmEnabled, 
    isAlarming, 
    toggleAlarmEnabled, 
    startAlarm, 
    stopAlarm 
  } = useAlarmSystem();

  // Security event handler
  const handleSecurityEvent = useCallback((event: SecurityEvent) => {
    console.log("[Security] Event detected:", event.type, "Photos:", event.photos.length);
    setCurrentEventType(event.type);
    startAlarm();
    
    // TODO: Send event and photos to MeerCOP mobile app via Supabase
    // This would involve uploading photos to storage and creating an alert record
  }, [startAlarm]);

  // Security surveillance
  const { 
    isActive: isSurveillanceActive,
    startSurveillance, 
    stopSurveillance 
  } = useSecuritySurveillance({
    onEventDetected: handleSecurityEvent,
    bufferDuration: 10, // Keep 10 seconds of photos
    captureInterval: 1000, // Capture every 1 second
    mouseSensitivity: 50, // Require 50px movement to trigger
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
  
  // Get the current device
  const currentDevice = currentDeviceId 
    ? devices.find(d => d.id === currentDeviceId) 
    : devices[0];
  
  const isOnline = currentDevice?.status === "online";

  // Set initial device
  useEffect(() => {
    if (devices.length > 0 && !currentDeviceId) {
      setCurrentDeviceId(devices[0].id);
    }
  }, [devices, currentDeviceId]);

  // Sync monitoring status with device status and start/stop surveillance
  useEffect(() => {
    if (currentDevice) {
      const newMonitoringState = currentDevice.status === "online";
      setIsMonitoring(newMonitoringState);
    }
  }, [currentDevice?.status]);

  // Start/stop surveillance based on monitoring state (separate effect to avoid loops)
  useEffect(() => {
    if (isMonitoring && !isSurveillanceActive) {
      startSurveillance();
    } else if (!isMonitoring && isSurveillanceActive) {
      stopSurveillance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMonitoring]);

  const handleDeviceSelect = (deviceId: string) => {
    setCurrentDeviceId(deviceId);
    const device = devices.find(d => d.id === deviceId);
    if (device) {
      setIsMonitoring(device.status === "online");
    }
  };

  // Subscribe to realtime status changes
  useEffect(() => {
    if (!currentDevice?.id) return;

    const channel = supabaseShared
      .channel("laptop-status")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "devices",
          filter: `id=eq.${currentDevice.id}`,
        },
        (payload) => {
          // Shared DB uses is_monitoring field
          const isMonitoringNow = (payload.new as { is_monitoring: boolean }).is_monitoring;
          setIsMonitoring(isMonitoringNow);
        }
      )
      .subscribe();

    return () => {
      supabaseShared.removeChannel(channel);
    };
  }, [currentDevice?.id]);

  // Show loading while checking auth
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
          meercopStatus={isMonitoring}
          networkStatus={isNetworkConnected}
          cameraStatus={isCameraAvailable}
          onCameraClick={() => setIsCameraModalOpen(true)}
        />

        {/* Camera Modal */}
        <CameraModal
          isOpen={isCameraModalOpen}
          onClose={() => setIsCameraModalOpen(false)}
          onCameraStatusChange={setCameraAvailable}
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
