import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const XP_PER_LEVEL = 500;

export interface GamificationState {
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progressPct: number;
  currentStreak: number;
  longestStreak: number;
  isLoading: boolean;
}

export type LearningEvent =
  | "flashcard_known"
  | "quiz_completed"
  | "video_watched"
  | "note_read"
  | "homework_submitted";

function derive(totalXp: number, current: number, longest: number, loading = false): GamificationState {
  const level = Math.max(1, Math.floor((totalXp || 0) / XP_PER_LEVEL) + 1);
  const xpIntoLevel = (totalXp || 0) % XP_PER_LEVEL;
  const xpToNextLevel = XP_PER_LEVEL - xpIntoLevel;
  return {
    totalXp: totalXp || 0,
    level,
    xpIntoLevel,
    xpToNextLevel,
    progressPct: Math.round((xpIntoLevel / XP_PER_LEVEL) * 100),
    currentStreak: current || 0,
    longestStreak: longest || 0,
    isLoading: loading,
  };
}

export function useGamification() {
  const { user } = useAuth();
  const [state, setState] = useState<GamificationState>(() => derive(0, 0, 0, true));

  const refetch = useCallback(async () => {
    if (!user?.id) {
      setState(derive(0, 0, 0, false));
      return;
    }
    const [{ data: profile }, { data: streak }] = await Promise.all([
      supabase.from("profiles").select("xp_points").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("student_streaks")
        .select("current_streak, longest_streak")
        .eq("student_user_id", user.id)
        .maybeSingle(),
    ]);
    setState(
      derive(
        profile?.xp_points || 0,
        streak?.current_streak || 0,
        streak?.longest_streak || 0,
        false,
      ),
    );
  }, [user?.id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const recordActivity = useCallback(
    async (
      eventType: LearningEvent,
      xpAmount: number,
      source?: { id?: string; type?: string },
    ) => {
      if (!user?.id) return null;
      const { data, error } = await supabase.rpc("record_learning_activity", {
        _event_type: eventType,
        _xp_amount: xpAmount,
        _source_id: source?.id ?? null,
        _source_type: source?.type ?? null,
      });
      if (error) {
        console.error("[gamification] record_learning_activity failed", error);
        return null;
      }
      const payload = data as {
        total_xp?: number;
        current_streak?: number;
        longest_streak?: number;
      } | null;
      if (payload) {
        setState(
          derive(
            payload.total_xp || 0,
            payload.current_streak || 0,
            payload.longest_streak || 0,
            false,
          ),
        );
      }
      return payload;
    },
    [user?.id],
  );

  return { ...state, refetch, recordActivity };
}
