import { Play, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface RecommendedVideo {
  id: string;
  title: string;
  subject_name: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
}

function formatDuration(secs: number | null): string {
  if (!secs || secs <= 0) return "";
  const m = Math.round(secs / 60);
  return `${m} min`;
}

export function RemedialPlaylist() {
  const { user } = useAuth();

  const { data: videos, isLoading } = useQuery({
    queryKey: ["student-recommended-videos", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<RecommendedVideo[]> => {
      // Canonical enrollment read
      const { data: enrolls } = await (supabase as any)
        .from("class_enrollments")
        .select("class_id, status")
        .eq("student_user_id", user!.id)
        .eq("status", "active");

      const classIds = (enrolls || [])
        .map((e: any) => e.class_id as string)
        .filter(Boolean);

      if (classIds.length === 0) return [];

      const { data: vids, error } = await (supabase as any)
        .from("video_resources")
        .select("id,title,duration_seconds,thumbnail_url,video_url,is_published,subject_id,class_id")
        .in("class_id", classIds)
        .eq("is_published", true)
        .not("video_url", "is", null)
        .neq("video_url", "")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;

      const filtered = (vids || []).filter(
        (v: any) => typeof v.video_url === "string" && v.video_url.trim() !== "",
      );
      if (filtered.length === 0) return [];

      const subjectIds = Array.from(
        new Set(filtered.map((v: any) => v.subject_id).filter(Boolean)),
      );
      let subjMap = new Map<string, string>();
      if (subjectIds.length) {
        const { data: subs } = await (supabase as any)
          .from("subjects")
          .select("id,name")
          .in("id", subjectIds);
        subjMap = new Map((subs || []).map((s: any) => [s.id, s.name]));
      }

      return filtered.map((v: any) => ({
        id: v.id,
        title: v.title,
        subject_name: (subjMap.get(v.subject_id) as string) || null,
        duration_seconds: v.duration_seconds,
        thumbnail_url: v.thumbnail_url,
      }));
    },
  });

  // Hide the entire section when there is nothing real to show.
  if (isLoading) return null;
  if (!videos || videos.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-[hsl(35,90%,55%)]/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[hsl(35,90%,55%)]" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Recommended For You</h2>
          <p className="text-xs text-muted-foreground">Fresh lessons from your enrolled classes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {videos.slice(0, 3).map((video) => (
          <Link key={video.id} to={`/dashboard/replays?video=${video.id}`}>
            <Card className="p-4 bg-card border-border/40 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:border-accent/30 transition-all duration-200 cursor-pointer group rounded-2xl">
              <div className="relative aspect-video bg-secondary/50 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
                {video.thumbnail_url ? (
                  <img
                    src={video.thumbnail_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : null}
                <div className="w-10 h-10 rounded-full bg-accent/80 flex items-center justify-center group-hover:scale-110 transition-transform relative z-10">
                  <Play className="w-5 h-5 text-accent-foreground fill-current" />
                </div>
                {formatDuration(video.duration_seconds) && (
                  <span className="absolute bottom-2 right-2 text-[10px] bg-foreground/60 text-background px-1.5 py-0.5 rounded-full font-medium z-10">
                    {formatDuration(video.duration_seconds)}
                  </span>
                )}
              </div>
              {video.subject_name && (
                <Badge variant="outline" className="text-[10px] mb-1.5">
                  {video.subject_name}
                </Badge>
              )}
              <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-snug break-words">
                {video.title}
              </h3>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
