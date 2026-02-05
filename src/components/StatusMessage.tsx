interface StatusMessageProps {
  deviceName: string;
  isMonitoring: boolean;
}

export function StatusMessage({ deviceName, isMonitoring }: StatusMessageProps) {
  return (
    <div className="mx-3 my-2">
      <div className="status-card px-4 py-2.5 text-center">
        <p className="text-foreground font-semibold text-xs">
          {isMonitoring 
            ? `MeerCOP is monitoring your laptop (${deviceName}).`
            : `MeerCOP is not monitoring ${deviceName}.`
          }
        </p>
      </div>
    </div>
  );
}
