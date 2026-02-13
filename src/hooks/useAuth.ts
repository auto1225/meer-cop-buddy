import { useState, useEffect, useCallback } from "react";
import { getSavedAuth, clearAuth, SerialAuthData } from "@/lib/serialAuth";

export function useAuth() {
  const [authData, setAuthData] = useState<SerialAuthData | null>(() => getSavedAuth());
  const [isLoading, setIsLoading] = useState(false);

  // Listen for storage changes (e.g., after serial auth success)
  useEffect(() => {
    const handleStorage = () => {
      setAuthData(getSavedAuth());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const signOut = useCallback(() => {
    clearAuth();
    setAuthData(null);
  }, []);

  const refreshAuth = useCallback(() => {
    setAuthData(getSavedAuth());
  }, []);

  return {
    user: authData ? { id: authData.user_id, email: null } : null,
    session: null,
    isLoading,
    isAuthenticated: !!authData,
    signOut,
    refreshAuth,
    deviceId: authData?.device_id ?? null,
    userId: authData?.user_id ?? null,
    serialKey: authData?.serial_key ?? null,
  };
}
