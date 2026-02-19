import { useEffect, useState } from "react";
import confetti from "canvas-confetti";

interface ComboCounterProps {
  streak: number;
  show: boolean;
}

export function ComboCounter({ streak, show }: ComboCounterProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show && streak >= 5) {
      setVisible(true);
      // Fire particle burst
      confetti({
        particleCount: 40 + streak * 5,
        spread: 60,
        startVelocity: 30,
        origin: { x: 0.5, y: 0.4 },
        colors: ["#FFD700", "#FF6B00", "#FF0080", "#00FFAA"],
        ticks: 60,
      });
      const t = setTimeout(() => setVisible(false), 1800);
      return () => clearTimeout(t);
    }
  }, [show, streak]);

  if (!visible || streak < 5) return null;

  const label =
    streak >= 10 ? "🌟 LEGENDARY!" :
    streak >= 7 ? "⚡ UNSTOPPABLE!" :
    "🔥 COMBO!";

  return (
    <div className="fixed inset-0 pointer-events-none z-[70] flex items-center justify-center">
      <div className="animate-combo-burst text-center">
        <div className="text-6xl md:text-8xl font-black text-accent drop-shadow-[0_0_30px_hsl(var(--accent)/0.6)]">
          {streak}×
        </div>
        <div className="text-2xl md:text-3xl font-black text-accent/80 mt-1">
          {label}
        </div>
      </div>
    </div>
  );
}
