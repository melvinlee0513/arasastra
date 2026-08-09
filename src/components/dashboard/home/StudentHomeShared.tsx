import { Link } from "react-router-dom";
import { ChevronRight, RotateCcw } from "lucide-react";

interface SectionHeaderProps {
  title: string;
  action?: { label: string; to: string };
  children?: React.ReactNode;
}

/** Shared mobile Home section header: title left, optional link/control right. */
export function SectionHeader({ title, action, children }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <h2 className="text-[17px] font-semibold text-slate-900">{title}</h2>
      {children}
      {action && (
        <Link
          to={action.to}
          className="inline-flex items-center gap-0.5 text-[13px] font-medium text-primary min-h-[44px] active:opacity-70"
        >
          {action.label}
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

interface HomeErrorStateProps {
  message: string;
  onRetry: () => void;
}

/** Compact, safe error state — never a fabricated empty state. */
export function HomeErrorState({ message, onRetry }: HomeErrorStateProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[13px] text-slate-600">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-[13px] font-medium text-slate-900 min-h-[44px] active:bg-slate-200"
      >
        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
