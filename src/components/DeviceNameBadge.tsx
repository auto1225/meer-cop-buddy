import { Pencil } from "lucide-react";

interface DeviceNameBadgeProps {
  deviceName: string;
  onEdit?: () => void;
}

export function DeviceNameBadge({ deviceName, onEdit }: DeviceNameBadgeProps) {
  return (
    <div className="flex justify-center py-1 mt-4">
      <button 
        onClick={onEdit}
        className="flex items-center gap-1.5 bg-muted hover:bg-muted/80 transition-colors px-3 py-1 rounded-full shadow-sm"
      >
        <span className="text-foreground font-bold text-[11px]">{deviceName}</span>
        <Pencil className="h-3 w-3 text-foreground/70" />
      </button>
    </div>
  );
}
