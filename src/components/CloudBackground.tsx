export function CloudBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Animated clouds */}
      <div 
        className="cloud w-40 h-10 animate-cloud-1" 
        style={{ top: '15%', left: '-10%' }} 
      />
      <div 
        className="cloud w-32 h-8 animate-cloud-2" 
        style={{ top: '30%', right: '-5%' }} 
      />
      <div 
        className="cloud w-24 h-6 animate-cloud-3" 
        style={{ top: '50%', left: '5%' }} 
      />
      <div 
        className="cloud w-36 h-9 animate-cloud-1" 
        style={{ top: '70%', right: '0%' }} 
      />
      
      <style>{`
        @keyframes cloud-drift-1 {
          0%, 100% { transform: translateX(0); opacity: 0.4; }
          50% { transform: translateX(20px); opacity: 0.6; }
        }
        @keyframes cloud-drift-2 {
          0%, 100% { transform: translateX(0); opacity: 0.3; }
          50% { transform: translateX(-15px); opacity: 0.5; }
        }
        @keyframes cloud-drift-3 {
          0%, 100% { transform: translateX(0); opacity: 0.35; }
          50% { transform: translateX(25px); opacity: 0.55; }
        }
        .animate-cloud-1 { animation: cloud-drift-1 8s ease-in-out infinite; }
        .animate-cloud-2 { animation: cloud-drift-2 10s ease-in-out infinite; }
        .animate-cloud-3 { animation: cloud-drift-3 12s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
