import { useState, useEffect } from "react";
import { ArrowLeft, User, HelpCircle, LogOut, Key, UserCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getSavedAuth } from "@/lib/serialAuth";
import meercopMascot from "@/assets/meercop-mascot.png";
import { HelpModal } from "@/components/HelpModal";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";

// Website Supabase (master project for auth & profiles)
const websiteSupabase = createClient(
  "https://peqgmuicrorjvvburqly.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlcWdtdWljcm9yanZ2YnVycWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDA1NzQsImV4cCI6MjA4NzUxNjU3NH0.e5HYG3dSMqhm4ahT-en-nNX2mD95KM_TdKIlfuzdMc4"
);

const _buildDate = new Date(import.meta.env.VITE_BUILD_TIMESTAMP || Date.now());
const BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIMESTAMP ? Number(import.meta.env.VITE_BUILD_TIMESTAMP) : Date.now();
const BUILD_DATE = `${_buildDate.toLocaleDateString()} ${_buildDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SideMenu({ isOpen, onClose }: SideMenuProps) {
  const { signOut } = useAuth();
  const savedAuth = getSavedAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  const { t } = useTranslation();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Fetch avatar from website Supabase's public_profiles
  useEffect(() => {
    if (!savedAuth?.user_id) return;
    const fetchAvatar = async () => {
      try {
        const { data } = await websiteSupabase
          .from("public_profiles")
          .select("avatar_url")
          .eq("user_id", savedAuth.user_id)
          .maybeSingle();
        if (data?.avatar_url) {
          setAvatarUrl(data.avatar_url);
        }
      } catch {
        // silent
      }
    };
    fetchAvatar();
  }, [savedAuth?.user_id]);


  const getPlanLabel = (planType?: string) => {
    switch (planType) {
      case "free": return t("menu.planFree");
      case "basic": return t("menu.planBasic");
      case "premium": return t("menu.planPremium");
      default: return t("menu.planFree");
    }
  };

  const [isUpdating, setIsUpdating] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      // Clean up persisted device selection
      localStorage.removeItem('meercop-current-device-id');
      await signOut();
    } catch {
      // proceed anyway
    }
    onClose();
  };

  const handleCheckUpdate = async () => {
    setIsUpdating(true);
    try {
      // DB에서 최신 버전 정보 조회
      const { data, error } = await supabase
        .from("app_versions")
        .select("build_timestamp, version_code, release_notes")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        toast.error(t("menu.updateCheckFailed"));
        setIsUpdating(false);
        return;
      }

      const latestTimestamp = Number(data.build_timestamp);

      if (latestTimestamp <= BUILD_TIMESTAMP) {
        // 이미 최신 버전
        toast.success(t("menu.alreadyUpToDate"));
        setIsUpdating(false);
        return;
      }

      // 업데이트 필요 — 확인 메시지 후 진행
      toast(t("menu.updateAvailable"), {
        description: data.release_notes || "",
        action: {
          label: t("menu.updateNow"),
          onClick: async () => {
            if ('serviceWorker' in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              await Promise.all(registrations.map(r => r.unregister()));
            }
            if ('caches' in window) {
              const cacheNames = await caches.keys();
              await Promise.all(cacheNames.map(name => caches.delete(name)));
            }
            window.location.reload();
          },
        },
        duration: 10000,
      });
      setIsUpdating(false);
    } catch {
      toast.error(t("menu.updateCheckFailed"));
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  const serialKey = savedAuth?.serial_key || "—";
  const deviceName = savedAuth?.device_name || t("menu.guest");

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Menu Panel - Glassmorphism */}
      <div className="absolute left-0 top-0 bottom-0 w-[75%] max-w-[300px] z-50 flex flex-col animate-slide-in
        bg-white/10 backdrop-blur-xl border-r border-white/20 text-white overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <img src={meercopMascot} alt="MeerCOP" className="w-9 h-9 object-contain drop-shadow-lg" />
            <div>
              <h2 className="font-extrabold text-base drop-shadow">MeerCOP</h2>
              <span className="text-[10px] text-white/60 font-semibold leading-tight">
                {t("menu.lastUpdated")}: {BUILD_DATE}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/80 hover:bg-white/15 h-8 w-8 rounded-xl"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* Profile Card - Compact */}
        <div className="px-4 py-3">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-4 space-y-3">
            {/* Avatar + Name row */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-white/15 backdrop-blur rounded-full flex items-center justify-center border border-white/25 shadow-lg shrink-0 overflow-hidden">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    onError={() => setAvatarUrl(null)}
                  />
                ) : (
                  <span className="text-base font-extrabold text-white/80">
                    {(deviceName || "?").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-sm font-extrabold drop-shadow truncate">{deviceName}</p>
            </div>

            {/* Info rows */}
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 bg-white/8 rounded-xl px-3 py-2 border border-white/10">
                <Key className="w-4 h-4 text-accent/80 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">{t("menu.serialNumber")}</p>
                  <p className="text-xs font-bold truncate">{serialKey}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 bg-white/8 rounded-xl px-3 py-2 border border-white/10">
                <UserCircle className="w-4 h-4 text-accent/80 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">{t("menu.membership")}</p>
                  <p className="text-xs font-bold">{getPlanLabel(savedAuth?.plan_type)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom Menu */}
        <div className="border-t border-white/15 p-2 space-y-0.5">
          {/* Menu Items */}
          <button
            onClick={handleCheckUpdate}
            disabled={isUpdating}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 text-white/70 ${isUpdating ? 'animate-spin' : ''}`} />
            <span className="text-sm font-bold">{isUpdating ? t("menu.updating") : t("menu.checkUpdate")}</span>
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 rounded-xl transition-colors"
          >
            <HelpCircle className="w-5 h-5 text-white/70" />
            <span className="text-sm font-bold">{t("menu.help")}</span>
          </button>
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/20 rounded-xl transition-colors text-red-300 disabled:opacity-50"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-bold">{isSigningOut ? "..." : t("menu.logout")}</span>
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
