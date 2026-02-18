import { useState } from "react";
import { X, User, HelpCircle, LogOut, Mail, Key, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getSavedAuth } from "@/lib/serialAuth";
import meercopMascot from "@/assets/meercop-mascot.png";
import { HelpModal } from "@/components/HelpModal";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SideMenu({ isOpen, onClose }: SideMenuProps) {
  const { signOut } = useAuth();
  const savedAuth = getSavedAuth();
  const [helpOpen, setHelpOpen] = useState(false);

  const handleSignOut = () => {
    signOut();
    onClose();
    window.location.reload();
  };

  if (!isOpen) return null;

  const serialKey = savedAuth?.serial_key || "—";
  const deviceName = savedAuth?.device_name || "게스트";

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Menu Panel - Glassmorphism */}
      <div className="absolute left-0 top-0 bottom-0 w-[75%] max-w-[300px] z-50 flex flex-col animate-slide-in
        bg-white/10 backdrop-blur-xl border-r border-white/20 text-white">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <img src={meercopMascot} alt="MeerCOP" className="w-9 h-9 object-contain drop-shadow-lg" />
            <div>
              <h2 className="font-extrabold text-base drop-shadow">MeerCOP</h2>
              <span className="text-[10px] text-white/60 font-semibold">ver 1.0.6</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/80 hover:bg-white/15 h-8 w-8 rounded-xl"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Profile Card - Glassmorphism */}
        <div className="p-4">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-5 space-y-4">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-white/15 backdrop-blur rounded-full flex items-center justify-center border border-white/25 shadow-lg">
                <User className="w-8 h-8 text-white/80" />
              </div>
              <p className="text-sm font-extrabold drop-shadow">{deviceName}</p>
            </div>

            {/* Info rows */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 bg-white/8 rounded-xl px-3 py-2.5 border border-white/10">
                <Key className="w-4 h-4 text-accent/80 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">시리얼 넘버</p>
                  <p className="text-xs font-bold truncate">{serialKey}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-white/8 rounded-xl px-3 py-2.5 border border-white/10">
                <UserCircle className="w-4 h-4 text-accent/80 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">멤버십</p>
                  <p className="text-xs font-bold">Normal Member</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom Menu */}
        <div className="border-t border-white/15 p-2 space-y-0.5">
          <button
            onClick={() => setHelpOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors"
          >
            <HelpCircle className="w-5 h-5 text-white/70" />
            <span className="text-sm font-bold">Q&A / 도움말</span>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/20 rounded-xl transition-colors text-red-300"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-bold">로그아웃</span>
          </button>
        </div>
      </div>

      <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />

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
