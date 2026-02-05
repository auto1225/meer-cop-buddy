export function CloudBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Clouds */}
      <div className="cloud w-32 h-8" style={{ top: '25%', left: '-5%' }} />
      <div className="cloud w-24 h-6" style={{ top: '35%', right: '5%' }} />
      <div className="cloud w-20 h-5" style={{ top: '45%', left: '10%' }} />
      <div className="cloud w-28 h-7" style={{ top: '55%', right: '-3%' }} />
      <div className="cloud w-16 h-4" style={{ top: '65%', left: '5%' }} />
    </div>
  );
}
