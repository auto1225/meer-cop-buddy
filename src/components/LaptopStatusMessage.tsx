interface LaptopStatusMessageProps {
  isMonitoring: boolean;
}

export function LaptopStatusMessage({ isMonitoring }: LaptopStatusMessageProps) {
  return (
    <div className="mx-6 my-2">
      <div className="bg-white rounded-2xl px-4 py-2.5 text-center shadow-lg">
        <p className="text-foreground font-bold text-[11px] leading-relaxed">
          {isMonitoring ? (
            <>MeerCOP이 감시 중입니다.</>
          ) : (
            <>스마트폰에서 감시를 <span className="text-success font-black">ON</span> 해 주세요.</>
          )}
        </p>
      </div>
    </div>
  );
}
