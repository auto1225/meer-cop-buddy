import { useState, useEffect } from "react";
import { LaptopHeader } from "@/components/LaptopHeader";
import { LaptopStatusIcons } from "@/components/LaptopStatusIcons";
import { LaptopStatusMessage } from "@/components/LaptopStatusMessage";
import { CloudBackground } from "@/components/CloudBackground";
import { LaptopMascotSection } from "@/components/LaptopMascotSection";
import { DeviceNameBadge } from "@/components/DeviceNameBadge";
import { ResizableContainer } from "@/components/ResizableContainer";
import { SideMenu } from "@/components/SideMenu";
import { useDevices } from "@/hooks/useDevices";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  
  const { devices } = useDevices();
  
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

  return (
    <ResizableContainer
      initialWidth={400}
      initialHeight={300}
      minWidth={280}
      minHeight={210}
      maxWidth={800}
      maxHeight={600}
      baseWidth={400}
      baseHeight={300}
    >
      <div className="w-full h-full sky-background flex flex-col relative overflow-hidden">
        {/* Cloud Background */}
        <CloudBackground />

        {/* Side Menu */}
        <SideMenu
          isOpen={isSideMenuOpen}
          onClose={() => setIsSideMenuOpen(false)}
          devices={devices}
          currentDeviceId={currentDevice?.id}
          onDeviceSelect={handleDeviceSelect}
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

        {/* Status Message */}
        <LaptopStatusMessage isMonitoring={isMonitoring} />

        {/* Mascot Section */}
        <LaptopMascotSection isMonitoring={isMonitoring} />
      </div>
    </ResizableContainer>
  );
};

export default Index;
