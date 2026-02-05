import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LaptopHeader } from "@/components/LaptopHeader";
import { LaptopStatusIcons } from "@/components/LaptopStatusIcons";
import { LaptopMascotSection } from "@/components/LaptopMascotSection";
import { DeviceNameBadge } from "@/components/DeviceNameBadge";
import { ResizableContainer } from "@/components/ResizableContainer";
import { SideMenu } from "@/components/SideMenu";
import { useDevices } from "@/hooks/useDevices";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import mainBg from "@/assets/main-bg.png";

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  
  const { devices, refetch } = useDevices();

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

  // Sync monitoring status with device status
  useEffect(() => {
    if (currentDevice) {
      setIsMonitoring(currentDevice.status === "online");
    }
  }, [currentDevice?.status]);

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

    const channel = supabase
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
          const newStatus = (payload.new as { status: string }).status;
          setIsMonitoring(newStatus === "online");
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
        />

        {/* Device Name Badge */}
        <DeviceNameBadge 
          deviceName={currentDevice?.device_name || "Laptop1"}
        />

        {/* Status Icons - Only 3 icons for laptop version */}
        <LaptopStatusIcons
          meercopStatus={isMonitoring}
          networkStatus={isOnline || isMonitoring}
          cameraStatus={isMonitoring}
        />

        {/* Mascot Section with Speech Bubble */}
        <LaptopMascotSection isMonitoring={isMonitoring} />
      </div>
    </ResizableContainer>
  );
};

export default Index;
