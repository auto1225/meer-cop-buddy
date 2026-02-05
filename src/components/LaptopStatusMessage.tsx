interface LaptopStatusMessageProps {
  isMonitoring: boolean;
}

export function LaptopStatusMessage({ isMonitoring }: LaptopStatusMessageProps) {
  return (
    <div className="mx-6 my-3">
      <div className="bg-white rounded-xl px-6 py-3 text-center shadow-lg">
        <p className="text-foreground font-bold text-sm leading-relaxed">
          {isMonitoring 
            ? "스마트폰에서 감시를 ON 해 주세요."
            : "MeerCOP이 비활성화되어 있습니다."
          }
        </p>
      </div>
    </div>
  );
}
