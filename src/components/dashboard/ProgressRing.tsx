import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  className?: string;
  color?: string; // css color (defaults to primary)
  trackClassName?: string;
}

/**
 * Animated circular progress ring (SVG).
 * Soft-Tech aesthetic: rounded stroke, subtle track, primary accent.
 */
export function ProgressRing({
  value,
  size = 96,
  stroke = 8,
  label,
  sublabel,
  className,
  color = "hsl(var(--primary))",
  trackClassName = "text-muted/30",
}: ProgressRingProps) {
  const pct = Math.max(0, Math.min(100, value || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          className={trackClassName}
          stroke="currentColor"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          stroke={color}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - dash }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        {label !== undefined && (
          <span className="text-lg font-bold text-foreground leading-none">{label}</span>
        )}
        {sublabel && (
          <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
