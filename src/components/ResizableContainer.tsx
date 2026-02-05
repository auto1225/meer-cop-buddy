import { useState, useRef, useCallback, useEffect } from "react";
import { GripVertical } from "lucide-react";

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
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  // Calculate scale based on container size
  const scale = Math.min(size.width / baseWidth, size.height / baseHeight);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
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

      // Maintain aspect ratio
      const aspectRatio = baseWidth / baseHeight;
      let newWidth = startWidth + deltaX;
      let newHeight = startHeight + deltaY;

      // Use the larger delta to determine size, maintaining aspect ratio
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + deltaX));
        newHeight = newWidth / aspectRatio;
      } else {
        newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + deltaY));
        newWidth = newHeight * aspectRatio;
      }

      // Clamp values
      newWidth = Math.min(maxWidth, Math.max(minWidth, newWidth));
      newHeight = Math.min(maxHeight, Math.max(minHeight, newHeight));

      setSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [size, minWidth, minHeight, maxWidth, maxHeight, baseWidth, baseHeight]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-transparent p-0">
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
