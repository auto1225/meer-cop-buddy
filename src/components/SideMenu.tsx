import { useState } from "react";
import { X, User, Laptop, HelpCircle, LogOut, Settings, ChevronRight, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { DeviceSettingsPanel } from "@/components/DeviceSettingsPanel";
import { AlarmSoundSelector } from "@/components/AlarmSoundSelector";
import { type AlarmSoundConfig } from "@/lib/alarmSounds";
import meercopMascot from "@/assets/meercop-mascot.png";

interface Device {
  id: string;
  device_name: string;
  device_type: string;
  status: string;
  battery_level: number | null;
  metadata: Record<string, unknown> | null;
}

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  devices: Device[];
  currentDeviceId?: string;
  onDeviceSelect: (deviceId: string) => void;
  onDevicesRefresh?: () => void;
  // Alarm sound props
  availableSounds?: AlarmSoundConfig[];
  selectedSoundId?: string;
  onSelectSound?: (soundId: string) => void;
  onPreviewSound?: (soundId: string) => void;
}

export function SideMenu({
  isOpen,
  onClose,
  devices,
  currentDeviceId,
  onDeviceSelect,
  onDevicesRefresh,
  availableSounds,
  selectedSoundId,
  onSelectSound,
  onPreviewSound,
}: SideMenuProps) {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [isAddingDevice, setIsAddingDevice] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    onClose();
    navigate("/auth");
  };

  const handleEditDevice = (device: Device, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDevice(device);
  };

  const handleDeviceSettingsClose = () => {
    setEditingDevice(null);
    setIsAddingDevice(false);
  };

  const handleDeviceUpdate = () => {
    onDevicesRefresh?.();
  };

  const handleAddDevice = () => {
    setIsAddingDevice(true);
  };

  if (!isOpen) return null;

  // Get user display info
  const userEmail = user?.email || "게스트";
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || userEmail.split("@")[0];
  const userAvatar = user?.user_metadata?.avatar_url;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Menu Panel */}
      <div className="absolute left-0 top-0 bottom-0 w-[70%] max-w-[280px] z-50 bg-primary text-primary-foreground flex flex-col animate-slide-in">
        {/* Device Settings Panel (overlay) */}
        {(editingDevice || isAddingDevice) && (
          <DeviceSettingsPanel
            device={editingDevice}
            isNewDevice={isAddingDevice}
            onClose={handleDeviceSettingsClose}
            onUpdate={handleDeviceUpdate}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/20">
          <div className="flex items-center gap-2">
            <img src={meercopMascot} alt="MeerCOP" className="w-10 h-10 object-contain" />
            <div>
              <h2 className="font-extrabold text-lg">MeerCOP</h2>
              <span className="text-xs text-white/70">ver 1.0.6</span>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* User Profile Info */}
        <div className="p-4 border-b border-white/20">
          <div className="flex items-center gap-3">
            {userAvatar ? (
              <img 
                src={userAvatar} 
                alt="프로필" 
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{userName}</p>
              <p className="text-xs text-white/70 truncate">{userEmail}</p>
              <p className="text-xs text-white/50">Normal Member</p>
            </div>
          </div>
        </div>

        {/* Devices Section */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-xs font-bold text-white/70 mb-2 flex items-center gap-1">
              <Laptop className="w-4 h-4" />
              내 디바이스
            </h3>
            <div className="space-y-2">
              {/* Add Device Button */}
              <button
                onClick={handleAddDevice}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-secondary/20 hover:bg-secondary/30 text-white border border-dashed border-white/30 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-bold">디바이스 추가</span>
              </button>

              {devices.length === 0 ? (
                <p className="text-sm text-white/50 text-center py-2">
                  등록된 디바이스가 없습니다.
                </p>
              ) : (
                devices.map((device) => (
                  <div
                    key={device.id}
                    className={`flex items-center justify-between p-3 rounded-xl transition-colors ${
                      device.id === currentDeviceId
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-white/10 hover:bg-white/20"
                    }`}
                  >
                    <button
                      onClick={() => {
                        onDeviceSelect(device.id);
                        onClose();
                      }}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      <Laptop className="w-4 h-4" />
                      <div>
                        <p className="text-sm font-bold">{device.device_name}</p>
                        <p className="text-xs opacity-70">
                          {device.status === "online" ? "온라인" : "오프라인"}
                          {device.battery_level !== null && ` · ${device.battery_level}%`}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={(e) => handleEditDevice(device, e)}
                      className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Alarm Sound Selector */}
          {availableSounds && selectedSoundId && onSelectSound && onPreviewSound && (
            <AlarmSoundSelector
              sounds={availableSounds}
              selectedSoundId={selectedSoundId}
              onSelectSound={onSelectSound}
              onPreviewSound={onPreviewSound}
            />
          )}
        </div>

        {/* Bottom Menu */}
        <div className="border-t border-white/20">
          <button className="w-full flex items-center gap-3 p-4 hover:bg-white/10 transition-colors">
            <HelpCircle className="w-5 h-5" />
            <span className="text-sm font-semibold">Q&A / 도움말</span>
          </button>
          <button className="w-full flex items-center gap-3 p-4 hover:bg-white/10 transition-colors">
            <Settings className="w-5 h-5" />
            <span className="text-sm font-semibold">설정</span>
          </button>
          <button 
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 p-4 hover:bg-white/10 transition-colors text-destructive-foreground"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-semibold">로그아웃</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slide-in {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slide-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
