import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Medal, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLevelInfo } from "./LevelBadge";

interface LeaderboardEntry {
  id: string;
  full_name: string;
  avatar_url: string | null;
  xp_points: number;
}

export function Leaderboard() {
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, xp_points")
        .order("xp_points", { ascending: false })
        .limit(5);

      setLeaders(data || []);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="w-5 h-5 text-yellow-500" />;
      case 1:
        return <Medal className="w-5 h-5 text-slate-400" />;
      case 2:
        return <Award className="w-5 h-5 text-amber-700" />;
      default:
        return (
          <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground">
            {index + 1}
          </span>
        );
    }
  };

  const getRankBgColor = (index: number) => {
    switch (index) {
      case 0:
        return "bg-yellow-500/10 border-yellow-500/30";
      case 1:
        return "bg-slate-400/10 border-slate-400/30";
      case 2:
        return "bg-amber-700/10 border-amber-700/30";
      default:
        return "bg-secondary/50 border-border";
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4 bg-card border border-border">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          Top Students This Week
        </h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (leaders.length === 0) {
    return (
      <Card className="p-4 bg-card border border-border">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          Top Students This Week
        </h3>
        <p className="text-sm text-muted-foreground text-center py-4">
          No students on the leaderboard yet. Be the first!
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-card border border-border">
      <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-accent" />
        Top Students This Week
      </h3>
      <div className="space-y-2">
        {leaders.map((leader, index) => {
          const levelInfo = getLevelInfo(leader.xp_points);
          
          return (
            <div
              key={leader.id}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg border transition-all",
                getRankBgColor(index),
                index < 3 && "hover:scale-[1.02]"
              )}
            >
              <div className="w-6 flex items-center justify-center">
                {getRankIcon(index)}
              </div>
              <Avatar className="w-8 h-8">
                <AvatarImage src={leader.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {leader.full_name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm truncate">
                  {leader.full_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Lvl {levelInfo.level} {levelInfo.title}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-accent text-sm">
                  {leader.xp_points.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">XP</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
