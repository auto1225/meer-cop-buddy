import { useEffect, useCallback } from "react";

interface CamouflageOverlayProps {
  isActive: boolean;
}

/**
 * Camouflage Mode: Fullscreen black overlay that makes the laptop appear
 * as if the monitor is turned off. Surveillance continues in the background.
 * Can only be dismissed from the smartphone app via DB metadata.
 * 
 * - Requests fullscreen mode for maximum realism
 * - Blocks all keyboard/mouse events from reaching the page
 * - Hides the cursor
 * - No dismiss button on laptop (smartphone-only control)
 */
export function CamouflageOverlay({ isActive }: CamouflageOverlayProps) {
  // Request fullscreen when activated
  useEffect(() => {
    if (!isActive) return;

    const requestFullscreen = async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.log("[Camouflage] Fullscreen request failed (expected on some browsers):", err);
      }
    };

    requestFullscreen();

    return () => {
      // Exit fullscreen when deactivated
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [isActive]);

  // Block keyboard events from exiting camouflage
  useEffect(() => {
    if (!isActive) return;

    const blockKeys = (e: KeyboardEvent) => {
      // Allow F11 for fullscreen toggle (browser native), block everything else
      if (e.key !== "F11") {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Block context menu (right click)
    const blockContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener("keydown", blockKeys, true);
    window.addEventListener("keyup", blockKeys, true);
    window.addEventListener("contextmenu", blockContextMenu, true);

    return () => {
      window.removeEventListener("keydown", blockKeys, true);
      window.removeEventListener("keyup", blockKeys, true);
      window.removeEventListener("contextmenu", blockContextMenu, true);
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black"
      style={{ cursor: "none" }}
      onClick={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
    />
  );
}
