import { useState } from "react";
import { Laptop, Wifi, WifiOff, BatteryWarning } from "lucide-react";
import { Header } from "@/components/Header";
import { DeviceCard } from "@/components/DeviceCard";
import { StatsCard } from "@/components/StatsCard";
import { ActivityLog } from "@/components/ActivityLog";
import { useDevices } from "@/hooks/useDevices";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import meercopWatching from "@/assets/meercop-watching.png";

const Index = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { devices, isLoading: devicesLoading, refetch: refetchDevices, stats } = useDevices();
  const { logs, isLoading: logsLoading, refetch: refetchLogs } = useActivityLogs();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchDevices(), refetchLogs()]);
    setIsRefreshing(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Stats Section */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            title="전체 디바이스"
            value={stats.total}
            subtitle="등록된 노트북"
            icon={Laptop}
          />
          <StatsCard
            title="온라인"
            value={stats.online}
            subtitle="현재 연결됨"
            icon={Wifi}
            variant="success"
          />
          <StatsCard
            title="오프라인"
            value={stats.offline}
            subtitle="연결 끊김"
            icon={WifiOff}
            variant="warning"
          />
          <StatsCard
            title="배터리 부족"
            value={stats.lowBattery}
            subtitle="20% 미만"
            icon={BatteryWarning}
            variant="destructive"
          />
        </section>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Devices Grid */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
              <div className="h-1 w-4 bg-secondary rounded-full" />
              디바이스 목록
            </h2>
            {devicesLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-secondary" />
              </div>
            ) : devices.length === 0 ? (
              <div className="brand-card rounded-2xl p-12 text-center">
                <img 
                  src={meercopWatching} 
                  alt="MeerCOP 감시중" 
                  className="h-40 w-auto mx-auto mb-6 float-animation"
                />
                <h3 className="text-xl font-bold text-foreground mb-2">
                  등록된 디바이스가 없습니다
                </h3>
                <p className="text-muted-foreground font-medium">
                  스마트폰 앱에서 디바이스를 등록해주세요
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {devices.map((device) => (
                  <DeviceCard key={device.id} device={device} />
                ))}
              </div>
            )}
          </div>

          {/* Activity Log */}
          <div className="lg:col-span-1">
            <ActivityLog logs={logs} isLoading={logsLoading} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
