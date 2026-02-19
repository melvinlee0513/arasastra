import { useEffect, useState } from "react";

interface ScorePopupProps {
  score: number;
  streak: number;
  isCorrect: boolean;
  show: boolean;
}

export function ScorePopup({ score, streak, isCorrect, show }: ScorePopupProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 1200);
      return () => clearTimeout(t);
    }
  }, [show]);

  if (!visible || !show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[60] flex items-center justify-center">
      <div className="animate-score-popup text-center">
        {isCorrect ? (
          <>
            <div className="text-5xl md:text-7xl font-black text-accent drop-shadow-lg">
              +{score}
            </div>
            {streak >= 2 && (
              <div className="text-xl md:text-2xl font-bold text-accent/80 mt-1 animate-bounce">
                🔥 {streak}× Streak!
              </div>
            )}
            {streak >= 5 && (
              <div className="text-lg font-semibold text-accent/60 mt-1">
                ⚡ UNSTOPPABLE!
              </div>
            )}
          </>
        ) : (
          <div className="text-4xl md:text-6xl font-black text-destructive drop-shadow-lg">
            ✗
          </div>
        )}
      </div>
    </div>
  );
}
