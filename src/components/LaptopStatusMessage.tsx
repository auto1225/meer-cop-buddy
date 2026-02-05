interface LaptopStatusMessageProps {
  isMonitoring: boolean;
}

export function LaptopStatusMessage({ isMonitoring }: LaptopStatusMessageProps) {
  return (
    <div className="mx-4 my-2">
      <div className="bg-white rounded-lg px-4 py-2 text-center shadow-lg">
        <p className="text-foreground font-bold text-xs leading-relaxed">
          {isMonitoring 
            ? "스마트폰에서 감시를 ON 해 주세요."
            : "MeerCOP이 비활성화되어 있습니다."
          }
        </p>
      </div>
    </div>
  );
}
