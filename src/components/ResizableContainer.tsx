import { useState, useRef, useCallback } from "react";
import { GripVertical } from "lucide-react";

interface ResizableContainerProps {
  children: React.ReactNode;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export function ResizableContainer({
  children,
  initialWidth = 480,
  initialHeight = 320,
  minWidth = 300,
  minHeight = 200,
  maxWidth = 800,
  maxHeight = 600,
}: ResizableContainerProps) {
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

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

      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + deltaX));
      const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + deltaY));

      setSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [size, minWidth, minHeight, maxWidth, maxHeight]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30 p-4">
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: size.width, height: size.height }}
      >
        {children}
        
        {/* Resize Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center bg-foreground/20 hover:bg-foreground/40 rounded-tl-lg transition-colors z-50"
        >
          <GripVertical className="h-3 w-3 text-white rotate-[-45deg]" />
        </div>

        {/* Size Indicator */}
        <div className="absolute top-2 right-2 bg-foreground/30 text-white text-[10px] font-mono px-2 py-0.5 rounded-full z-50">
          {Math.round(size.width)} × {Math.round(size.height)}
        </div>
      </div>
    </div>
  );
}
