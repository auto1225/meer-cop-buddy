import { useState, useEffect, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import SerialAuth from "./pages/SerialAuth";
import DeviceNameEntry from "./components/DeviceNameEntry";
import MotionTest from "./pages/MotionTest";
import NotFound from "./pages/NotFound";
import { getSavedAuth, clearAuth } from "@/lib/serialAuth";

const queryClient = new QueryClient();

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getSavedAuth());
  const [needsDeviceName, setNeedsDeviceName] = useState(false);

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
        setNeedsDeviceName(false);
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
    setNeedsDeviceName(false);
  }, []);

  const handleSerialSuccess = useCallback((_deviceId: string, _userId: string) => {
    // After serial auth, check if device has a real name
    const auth = getSavedAuth();
    const name = auth?.device_name || "";
    const isDefault = !name || name === "My Laptop" || name === "Laptop";
    
    if (isDefault) {
      setNeedsDeviceName(true);
    } else {
      setIsAuthenticated(true);
    }
  }, []);

  const handleDeviceNameComplete = useCallback((_name: string) => {
    setNeedsDeviceName(false);
    setIsAuthenticated(true);
  }, []);

  if (!isAuthenticated && !needsDeviceName) {
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

  if (needsDeviceName) {
    return (
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <DeviceNameEntry onComplete={handleDeviceNameComplete} />
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
