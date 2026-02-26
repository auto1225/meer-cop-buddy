import { useState, useRef, useCallback, useEffect } from "react";
import { GripVertical, Maximize, Minimize } from "lucide-react";

interface ResizableContainerProps {
  children: React.ReactNode;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  baseWidth?: number;
  baseHeight?: number;
}

export function ResizableContainer({
  children,
  initialWidth = 480,
  initialHeight = 320,
  minWidth = 300,
  minHeight = 200,
  maxWidth = 900,
  maxHeight = 600,
  baseWidth = 480,
  baseHeight = 320,
}: ResizableContainerProps) {
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return localStorage.getItem('meercop-fullscreen') === 'true';
  });
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('meercop-container-size');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.width && parsed.height) return parsed;
      } catch {}
    }
    return { width: initialWidth, height: initialHeight };
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  // In fullscreen, use viewport dimensions
  const effectiveWidth = isFullscreen ? window.innerWidth : size.width;
  const effectiveHeight = isFullscreen ? window.innerHeight : size.height;
  const scale = Math.min(effectiveWidth / baseWidth, effectiveHeight / baseHeight);

  // Update on window resize when fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = () => {
      // Force re-render
      setSize(prev => ({ ...prev }));
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const next = !prev;
      localStorage.setItem('meercop-fullscreen', String(next));
      return next;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isFullscreen) return;
    e.preventDefault();
    isResizing.current = true;

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const aspectRatio = baseWidth / baseHeight;
      let newWidth = startWidth + deltaX;
      let newHeight = startHeight + deltaY;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + deltaX));
        newHeight = newWidth / aspectRatio;
      } else {
        newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + deltaY));
        newWidth = newHeight * aspectRatio;
      }

      newWidth = Math.min(maxWidth, Math.max(minWidth, newWidth));
      newHeight = Math.min(maxHeight, Math.max(minHeight, newHeight));

      setSize(() => {
        const s = { width: newWidth, height: newHeight };
        localStorage.setItem('meercop-container-size', JSON.stringify(s));
        return s;
      });
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [isFullscreen, size, minWidth, minHeight, maxWidth, maxHeight, baseWidth, baseHeight]);

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[100] overflow-auto bg-transparent">
        {/* Full width, natural height - no scale transform */}
        <div className="w-full min-h-screen">
          {children}
        </div>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className="fixed top-2 right-2 w-8 h-8 flex items-center justify-center bg-foreground/30 hover:bg-foreground/50 rounded-lg transition-colors z-[200]"
          title="창 모드"
        >
          <Minimize className="h-4 w-4 text-white" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center bg-transparent min-h-screen p-0">
      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{ width: size.width, height: size.height }}
      >
        {/* Scaled Content */}
        <div 
          className="origin-top-left"
          style={{ 
            width: baseWidth, 
            height: baseHeight,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
        
        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-1 right-1 w-7 h-7 flex items-center justify-center bg-foreground/20 hover:bg-foreground/40 rounded-lg transition-colors z-50"
          title="전체화면"
        >
          <Maximize className="h-3.5 w-3.5 text-white" />
        </button>

        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center bg-foreground/20 hover:bg-foreground/40 rounded-tl-lg transition-colors z-50"
        >
          <GripVertical className="h-3 w-3 text-white rotate-[-45deg]" />
        </div>
      </div>
    </div>
  );
}
