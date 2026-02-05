import { useState, useEffect } from "react";
import { MobileHeader } from "@/components/MobileHeader";
import { StatusIcons } from "@/components/StatusIcons";
import { StatusMessage } from "@/components/StatusMessage";
import { ToggleButton } from "@/components/ToggleButton";
import { CloudBackground } from "@/components/CloudBackground";
import { MascotSection } from "@/components/MascotSection";
import { ResizableContainer } from "@/components/ResizableContainer";
import { SideMenu } from "@/components/SideMenu";
import { NotificationPanel } from "@/components/NotificationPanel";
import { AlertScreen } from "@/components/AlertScreen";
import { useDevices } from "@/hooks/useDevices";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useAlerts } from "@/hooks/useAlerts";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  
  const { devices, stats } = useDevices();
  const { toast } = useToast();
  
  // Get the current device
  const currentDevice = currentDeviceId 
    ? devices.find(d => d.id === currentDeviceId) 
    : devices[0];
  
  const deviceName = currentDevice?.device_name || "Laptop1";
  const batteryLevel = currentDevice?.battery_level || 100;
  const isOnline = currentDevice?.status === "online";

  // Hooks for features
  const { isDarkMode, toggleDarkMode } = useDarkMode(currentDevice?.id);
  const { activeAlert, stopAlert, alerts } = useAlerts(currentDevice?.id);
  const { logs } = useActivityLogs(currentDevice?.id);

  // Set initial device
  useEffect(() => {
    if (devices.length > 0 && !currentDeviceId) {
      setCurrentDeviceId(devices[0].id);
    }
  }, [devices, currentDeviceId]);

  const handleToggle = async () => {
    const newStatus = !isMonitoring;
    setIsMonitoring(newStatus);
    
    if (currentDevice) {
      const { error } = await supabase
        .from("devices")
        .update({ status: newStatus ? "online" : "offline" })
        .eq("id", currentDevice.id);
      
      if (error) {
        console.error("Error updating device status:", error);
        toast({
          title: "오류",
          description: "상태 업데이트에 실패했습니다.",
          variant: "destructive",
        });
        setIsMonitoring(!newStatus);
        return;
      }

      await supabase.from("activity_logs").insert({
        device_id: currentDevice.id,
        event_type: newStatus ? "connected" : "disconnected",
        event_data: { triggered_by: "web_app" },
      });
    }

    toast({
      title: newStatus ? "MeerCOP 활성화" : "MeerCOP 비활성화",
      description: newStatus 
        ? "노트북 모니터링이 시작되었습니다." 
        : "노트북 모니터링이 중지되었습니다.",
    });
  };

  const handleDeviceSelect = (deviceId: string) => {
    setCurrentDeviceId(deviceId);
    const device = devices.find(d => d.id === deviceId);
    if (device) {
      setIsMonitoring(device.status === "online");
    }
  };

  // Sync monitoring status with device status
  useEffect(() => {
    if (currentDevice) {
      setIsMonitoring(currentDevice.status === "online");
    }
  }, [currentDevice?.status]);

  // Calculate notification count (unread alerts)
  const notificationCount = alerts.filter(a => 
    new Date(a.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  ).length;

  return (
    <ResizableContainer
      initialWidth={480}
      initialHeight={320}
      minWidth={320}
      minHeight={213}
      maxWidth={960}
      maxHeight={640}
      baseWidth={480}
      baseHeight={320}
    >
      <div className="w-full h-full sky-background flex flex-col relative overflow-hidden">
        {/* Cloud Background */}
        <CloudBackground />

        {/* Alert Screen - shown when alert is active */}
        {activeAlert && (
          <AlertScreen alert={activeAlert} onStop={stopAlert} />
        )}

        {/* Side Menu */}
        <SideMenu
          isOpen={isSideMenuOpen}
          onClose={() => setIsSideMenuOpen(false)}
          devices={devices}
          currentDeviceId={currentDevice?.id}
          onDeviceSelect={handleDeviceSelect}
        />

        {/* Notification Panel */}
        <NotificationPanel
          isOpen={isNotificationOpen}
          onClose={() => setIsNotificationOpen(false)}
          logs={logs}
          deviceName={deviceName}
        />

        {/* Header */}
        <MobileHeader 
          deviceName={deviceName}
          notificationCount={notificationCount}
          onMenuClick={() => setIsSideMenuOpen(true)}
          onNotificationClick={() => setIsNotificationOpen(true)}
        />

        {/* Status Icons */}
        <StatusIcons
          laptopStatus={isMonitoring}
          meercopStatus={isMonitoring}
          networkStatus={isOnline || isMonitoring}
          cameraStatus={isMonitoring}
          batteryLevel={batteryLevel}
        />

        {/* Status Message */}
        <StatusMessage 
          deviceName={deviceName}
          isMonitoring={isMonitoring}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Mascot Section */}
        <MascotSection isMonitoring={isMonitoring} />

        {/* Toggle Button */}
        <ToggleButton 
          isOn={isMonitoring} 
          onToggle={handleToggle}
          isDarkMode={isDarkMode}
          onDarkModeToggle={toggleDarkMode}
          showDarkMode={isMonitoring}
        />
      </div>
    </ResizableContainer>
  );
};

export default Index;
