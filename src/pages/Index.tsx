import { useState, useEffect } from "react";
import { MobileHeader } from "@/components/MobileHeader";
import { StatusIcons } from "@/components/StatusIcons";
import { StatusMessage } from "@/components/StatusMessage";
import { ToggleButton } from "@/components/ToggleButton";
import { CloudBackground } from "@/components/CloudBackground";
import { MascotSection } from "@/components/MascotSection";
import { useDevices } from "@/hooks/useDevices";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [isMonitoring, setIsMonitoring] = useState(true);
  const { devices, stats } = useDevices();
  const { toast } = useToast();
  
  // Get the first device or use default
  const currentDevice = devices[0];
  const deviceName = currentDevice?.device_name || "Laptop1";
  const batteryLevel = currentDevice?.battery_level || 100;
  const isOnline = currentDevice?.status === "online";

  const handleToggle = async () => {
    const newStatus = !isMonitoring;
    setIsMonitoring(newStatus);
    
    // Update device status in database if we have a device
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
        setIsMonitoring(!newStatus); // Revert
        return;
      }

      // Log the activity
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

  // Sync monitoring status with device status
  useEffect(() => {
    if (currentDevice) {
      setIsMonitoring(currentDevice.status === "online");
    }
  }, [currentDevice?.status]);

  return (
    <div className="min-h-screen sky-background flex flex-col relative">
      {/* Cloud Background */}
      <CloudBackground />

      {/* Header */}
      <MobileHeader 
        deviceName={deviceName}
        notificationCount={stats.lowBattery}
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
      <ToggleButton isOn={isMonitoring} onToggle={handleToggle} />
    </div>
  );
};

export default Index;
