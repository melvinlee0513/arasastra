import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface UserProgress {
  hoursWatched: number;
  streak: number;
  completedLessons: number;
}

export function useUserProgress() {
  const { user, profile } = useAuth();
  const [progress, setProgress] = useState<UserProgress>({
    hoursWatched: 0,
    streak: 0,
    completedLessons: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      fetchProgress();
    } else {
      setProgress({ hoursWatched: 0, streak: 0, completedLessons: 0 });
      setIsLoading(false);
    }
  }, [profile?.id]);

  const fetchProgress = async () => {
    if (!profile?.id) return;

    try {
      // Fetch completed lessons and watch time
      const { data: progressData } = await supabase
        .from("progress")
        .select("completed, watched_seconds, last_watched_at")
        .eq("student_id", profile.id);

      if (progressData) {
        const completedLessons = progressData.filter((p) => p.completed).length;
        const totalSeconds = progressData.reduce((sum, p) => sum + (p.watched_seconds || 0), 0);
        const hoursWatched = Math.round((totalSeconds / 3600) * 10) / 10;

        // Calculate streak (consecutive days with activity)
        const watchDates = progressData
          .filter((p) => p.last_watched_at)
          .map((p) => new Date(p.last_watched_at!).toDateString())
          .filter((v, i, a) => a.indexOf(v) === i)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

        let streak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < watchDates.length; i++) {
          const watchDate = new Date(watchDates[i]);
          const expectedDate = new Date(today);
          expectedDate.setDate(today.getDate() - i);
          
          if (watchDate.toDateString() === expectedDate.toDateString()) {
            streak++;
          } else if (i === 0 && watchDate.toDateString() === new Date(today.getTime() - 86400000).toDateString()) {
            // Allow for yesterday if no activity today yet
            streak++;
          } else {
            break;
          }
        }

        setProgress({
          hoursWatched,
          streak,
          completedLessons,
        });
      }
    } catch (error) {
      console.error("Error fetching progress:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    progress,
    isLoading,
    isAuthenticated: !!user,
    refetch: fetchProgress,
  };
}
