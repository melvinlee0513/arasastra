import { BarChart3 } from "lucide-react";
import { XPLeaderboard } from "@/components/dashboard/XPLeaderboard";

/**
 * Standalone student leaderboard route, reached from the More hub.
 * Reuses the existing XPLeaderboard widget — no new data access.
 */
export function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-5 md:px-8 md:py-8 space-y-5">
        <header className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[22px] md:text-3xl font-bold text-slate-900 leading-tight">
              Leaderboard
            </h1>
            <p className="text-[13px] md:text-sm text-slate-500">
              How you rank against classmates this season.
            </p>
          </div>
        </header>

        <XPLeaderboard />
      </div>
    </div>
  );
}

export default LeaderboardPage;
