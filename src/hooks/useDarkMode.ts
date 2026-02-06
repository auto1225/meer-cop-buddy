import { useState, useCallback } from "react";
import { supabaseShared } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { addActivityLog } from "@/lib/localActivityLogs";

export function useDarkMode(deviceId?: string) {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const toggleDarkMode = useCallback(async () => {
    if (!deviceId) {
      toast({
        title: "오류",
        description: "연결된 디바이스가 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const newDarkMode = !isDarkMode;

    try {
      // Update device metadata with dark mode state (필수 - 모바일 앱과 동기화 필요)
      const { error } = await supabaseShared
        .from("devices")
        .update({
          metadata: { dark_mode: newDarkMode },
        })
        .eq("id", deviceId);

      if (error) throw error;

      // 로컬에 활동 로그 기록 (DB 저장 안 함)
      addActivityLog(
        deviceId,
        newDarkMode ? "dark_mode_on" : "dark_mode_off",
        { triggered_by: "web_app" }
      );

      setIsDarkMode(newDarkMode);

      toast({
        title: newDarkMode ? "다크 모드 활성화" : "다크 모드 비활성화",
        description: newDarkMode
          ? "노트북 화면이 검정색으로 변경됩니다."
          : "노트북 화면이 정상으로 돌아갑니다.",
      });
    } catch (error) {
      console.error("Error toggling dark mode:", error);
      toast({
        title: "오류",
        description: "다크 모드 변경에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, isDarkMode, toast]);

  return {
    isDarkMode,
    isLoading,
    toggleDarkMode,
    setIsDarkMode,
  };
}
