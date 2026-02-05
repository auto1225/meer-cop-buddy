import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import meercopMascot from "@/assets/meercop-mascot.png";

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function Header({ onRefresh, isRefreshing }: HeaderProps) {
  return (
    <header className="brand-header border-b border-primary/20 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img 
                src={meercopMascot} 
                alt="MeerCOP 마스코트" 
                className="h-14 w-auto drop-shadow-lg"
              />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">
                Meer<span className="text-secondary">COP</span>
              </h1>
              <p className="text-xs text-white/70 font-medium">노트북 모니터링 시스템</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        </div>
      </div>
    </header>
  );
}
