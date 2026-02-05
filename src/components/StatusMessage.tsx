interface StatusMessageProps {
  deviceName: string;
  isMonitoring: boolean;
}

export function StatusMessage({ deviceName, isMonitoring }: StatusMessageProps) {
  return (
    <div className="mx-4 my-4">
      <div className="status-card px-6 py-4 text-center">
        <p className="text-foreground font-semibold text-base">
          {isMonitoring 
            ? `MeerCOP is monitoring your laptop (${deviceName}).`
            : `MeerCOP is not monitoring ${deviceName}.`
          }
        </p>
      </div>
    </div>
  );
}
