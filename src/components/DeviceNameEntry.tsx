import { useState } from "react";
import { ResizableContainer } from "@/components/ResizableContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import meercopLogo from "@/assets/meercop-logo.png";
import loginTreesBg from "@/assets/login-trees-bg.png";
import { I18nProvider, useTranslation, type Lang } from "@/lib/i18n";
import { fetchDevicesViaEdge, registerDeviceViaEdge } from "@/lib/deviceApi";
import { getSavedAuth } from "@/lib/serialAuth";

interface DeviceNameEntryProps {
  onComplete: (deviceName: string) => void;
}

function DeviceNameEntryInner({ onComplete }: DeviceNameEntryProps) {
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async () => {
    const name = deviceName.trim();
    if (!name) {
      setError(t("deviceName.required"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const auth = getSavedAuth();
      if (!auth?.user_id) {
        setError(t("deviceSettings.serialRequired"));
        setLoading(false);
        return;
      }

      // Check duplicate name among computer-type devices
      const devices = await fetchDevicesViaEdge(auth.user_id);
      const computerTypes = ["laptop", "desktop", "notebook"];
      const duplicate = devices.find(
        (d) =>
          computerTypes.includes((d.device_type || "").toLowerCase()) &&
          (d.name || d.device_name || "").toLowerCase() === name.toLowerCase() &&
          d.id !== auth.device_id
      );

      if (duplicate) {
        setError(t("device.duplicateDesc"));
        setLoading(false);
        return;
      }

      // Update device name in shared DB
      const { updateDeviceViaEdge } = await import("@/lib/deviceApi");
      await updateDeviceViaEdge(auth.device_id, {
        device_name: name,
        name: name,
      });

      // Update local storage auth data
      const updatedAuth = { ...auth, device_name: name };
      localStorage.setItem("meercop_serial_auth", JSON.stringify(updatedAuth));

      onComplete(name);
    } catch (err: any) {
      setError(err.message || t("deviceSettings.saveFailedDesc"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResizableContainer
      initialWidth={300} initialHeight={520}
      minWidth={200} minHeight={347}
      maxWidth={450} maxHeight={780}
      baseWidth={300} baseHeight={520}
    >
      <div className="w-full h-full sky-background flex flex-col relative overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center px-6 z-10">
          <div className="mb-4">
            <img src={meercopLogo} alt="MeerCOP" className="h-14 object-contain" />
          </div>

          <p className="text-white/80 text-xs text-center mb-6">{t("deviceName.prompt")}</p>

          <Input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={t("deviceSettings.namePlaceholder")}
            disabled={loading}
            autoFocus
            className="w-full max-w-[240px] h-9 mb-3 backdrop-blur-xl bg-white/15 border border-white/25 rounded-full text-white placeholder:text-white/40 text-center text-sm font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
          />

          {error && <p className="text-red-300 text-xs text-center mb-3">{error}</p>}

          <Button
            onClick={handleSubmit}
            disabled={loading || !deviceName.trim()}
            className="w-full max-w-[240px] h-9 backdrop-blur-xl bg-white/20 border border-white/30 hover:bg-white/30 text-white font-extrabold rounded-full text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
          >
            {loading ? t("deviceSettings.saving") : t("deviceName.confirm")}
          </Button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-0">
          <img src={loginTreesBg} alt="" className="w-full object-cover object-bottom" style={{ maxHeight: "120px" }} />
        </div>
      </div>
    </ResizableContainer>
  );
}

export default function DeviceNameEntry({ onComplete }: DeviceNameEntryProps) {
  const savedLang = (localStorage.getItem("meercop-language") as Lang) || "ko";
  return (
    <I18nProvider initialLang={savedLang}>
      <DeviceNameEntryInner onComplete={onComplete} />
    </I18nProvider>
  );
}
