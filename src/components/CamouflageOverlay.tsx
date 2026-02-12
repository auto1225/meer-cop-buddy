import { useEffect } from "react";

interface CamouflageOverlayProps {
  isActive: boolean;
}

/**
 * Camouflage Mode: Fullscreen black overlay that makes the laptop appear
 * as if the monitor is turned off. Surveillance continues in the background.
 * Can only be dismissed from the smartphone app via DB metadata.
 * 
 * - Covers the entire browser viewport with a black overlay
 * - Blocks all keyboard/mouse events from reaching the page
 * - Hides the cursor
 * - No dismiss button on laptop (smartphone-only control)
 * 
 * NOTE: requestFullscreen() cannot be called without a user gesture
 * (browser security policy). The overlay covers the app viewport only.
 * For true fullscreen coverage, use Electron's setKiosk(true) via IPC.
 */
export function CamouflageOverlay({ isActive }: CamouflageOverlayProps) {

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
