import { useEffect, useState } from "react";
import { Trophy, Medal, Flame, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  xp_points: number;
  rank: number;
}

type TimeFilter = "weekly" | "monthly" | "all-time";

export function XPLeaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("weekly");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, [timeFilter]);

  const fetchLeaderboard = async () => {
    setIsLoading(true);
    try {
      if (timeFilter === "all-time") {
        // Use XP points from profiles
        const { data } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url, xp_points")
          .eq("is_registered", true)
          .order("xp_points", { ascending: false })
          .limit(10);

        setEntries(
          (data || []).map((d, i) => ({ ...d, rank: i + 1 }))
        );
      } else {
        // Use quiz scores within time window
        const now = new Date();
        const since = new Date();
        if (timeFilter === "weekly") since.setDate(now.getDate() - 7);
        else since.setMonth(now.getMonth() - 1);

        const { data } = await supabase
          .from("quiz_results")
          .select("user_id, score, completed_at")
          .gte("completed_at", since.toISOString());

        // Aggregate scores per user
        const scoreMap = new Map<string, number>();
        (data || []).forEach((r) => {
          scoreMap.set(r.user_id, (scoreMap.get(r.user_id) || 0) + r.score);
        });

        // Get profiles for these users
        const userIds = Array.from(scoreMap.keys());
        if (userIds.length === 0) {
          setEntries([]);
          setIsLoading(false);
          return;
        }

        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url, xp_points")
          .in("user_id", userIds);

        const leaderboard = (profiles || [])
          .map((p) => ({
            ...p,
            xp_points: scoreMap.get(p.user_id) || 0,
            rank: 0,
          }))
          .sort((a, b) => b.xp_points - a.xp_points)
          .slice(0, 10)
          .map((e, i) => ({ ...e, rank: i + 1 }));

        setEntries(leaderboard);
      }
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-primary" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-muted-foreground" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-accent" />;
    return <span className="w-5 text-center text-sm font-bold text-muted-foreground">{rank}</span>;
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return "bg-primary/10 border-primary/30";
    if (rank === 2) return "bg-muted border-muted-foreground/30";
    if (rank === 3) return "bg-accent/10 border-accent/30";
    return "bg-card border-border";
  };

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-accent" />
          <h3 className="font-semibold text-foreground">XP Leaderboard</h3>
        </div>
        <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">This Week</SelectItem>
            <SelectItem value="monthly">This Month</SelectItem>
            <SelectItem value="all-time">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No scores yet for this period
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isCurrentUser = entry.user_id === user?.id;
            return (
              <div
                key={entry.user_id}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${getRankStyle(entry.rank)} ${isCurrentUser ? "ring-2 ring-accent/50" : ""}`}
              >
                <div className="w-6 flex justify-center">{getRankIcon(entry.rank)}</div>
                <Avatar className="w-8 h-8">
                  <AvatarImage src={entry.avatar_url || undefined} />
                  <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">
                    {entry.full_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.full_name}
                    {isCurrentUser && (
                      <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                        You
                      </Badge>
                    )}
                  </p>
                </div>
                <span className="text-sm font-bold text-accent">{entry.xp_points} XP</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
