import { useState, useEffect, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import SerialAuth from "./pages/SerialAuth";
import Landing from "./pages/Landing";
import MotionTest from "./pages/MotionTest";
import NotFound from "./pages/NotFound";
import { getSavedAuth, clearAuth } from "@/lib/serialAuth";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

const BUILD_TIMESTAMP = Number(import.meta.env.VITE_BUILD_TIMESTAMP || Date.now());

/** Register current build version in app_versions table (once per build) */
const registerBuildVersion = async () => {
  const registeredKey = `meercop_build_registered_${BUILD_TIMESTAMP}`;
  if (localStorage.getItem(registeredKey)) return;

  try {
    // Check if this build_timestamp already exists
    const { data } = await supabase
      .from("app_versions")
      .select("id")
      .eq("build_timestamp", BUILD_TIMESTAMP)
      .limit(1);

    if (!data || data.length === 0) {
      await supabase.from("app_versions").insert({
        build_timestamp: BUILD_TIMESTAMP,
        version_code: new Date(BUILD_TIMESTAMP).toISOString().slice(0, 16).replace("T", " "),
      });
    }

    localStorage.setItem(registeredKey, "1");
  } catch {
    // silent fail — non-critical
  }
};

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getSavedAuth());
  

  // Register current build version on startup
  useEffect(() => {
    registerBuildVersion();
  }, []);

  // Global error handler for unhandled promise rejections
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", event.reason);
      event.preventDefault();
    };

    window.addEventListener("unhandledrejection", handleRejection);
    return () => window.removeEventListener("unhandledrejection", handleRejection);
  }, []);

  // Listen for auth changes (logout from SideMenu)
  useEffect(() => {
    const checkAuth = () => {
      const auth = getSavedAuth();
      if (!auth) {
        setIsAuthenticated(false);
      }
    };
    // Poll for auth changes (signOut clears localStorage)
    const interval = setInterval(checkAuth, 500);
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = useCallback(() => {
    sessionStorage.setItem("meercop_relogin", "1");
    clearAuth();
    setIsAuthenticated(false);
  }, []);

  const handleSerialSuccess = useCallback((_deviceId: string, _userId: string) => {
    setIsAuthenticated(true);
  }, []);

  // Landing page is accessible without auth
  if (typeof window !== 'undefined' && window.location.pathname === '/landing') {
    return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Landing />
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    );
  }

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <SerialAuth onSuccess={handleSerialSuccess} />
          </TooltipProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index onExpired={handleSignOut} />} />
              <Route path="/motion-test" element={<MotionTest />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
