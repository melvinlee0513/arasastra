import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Clock, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface SpatialComment {
  id: string;
  user_id: string;
  timestamp_seconds: number;
  comment_text: string;
  created_at: string;
  user_name?: string;
  user_avatar?: string | null;
}

interface VideoSpatialTimelineProps {
  classId: string;
  duration: number; // total seconds
  currentTime: number;
  onSeek: (seconds: number) => void;
  onPause: () => void;
  onResume: () => void;
}

function formatTs(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * VideoSpatialTimeline — Glowing comment markers overlaying a video progress bar.
 * Hover triggers pause + backdrop-blur popover with Q&A text.
 */
export function VideoSpatialTimeline({
  classId, duration, currentTime, onSeek, onPause, onResume,
}: VideoSpatialTimelineProps) {
  const [comments, setComments] = useState<SpatialComment[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchComments();
  }, [classId]);

  const fetchComments = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("video_comments")
      .select("*")
      .eq("class_id", classId)
      .order("timestamp_seconds");

    if (data) {
      const userIds = [...new Set(data.map((c) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      const pMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      setComments(data.map((c) => ({
        ...c,
        user_name: pMap.get(c.user_id)?.full_name || "Student",
        user_avatar: pMap.get(c.user_id)?.avatar_url,
      })));
    }
    setIsLoading(false);
  };

  const handleMarkerEnter = (id: string) => {
    setHoveredId(id);
    onPause();
  };

  const handleMarkerLeave = () => {
    setHoveredId(null);
    onResume();
  };

  const hoveredComment = comments.find((c) => c.id === hoveredId);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (isLoading) {
    return <Skeleton className="h-10 w-full rounded-full" />;
  }

  return (
    <div className="relative w-full">
      {/* Backdrop blur when hovering a marker */}
      <AnimatePresence>
        {hoveredId && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute -top-2 -left-2 -right-2 -bottom-2 rounded-2xl bg-background/40 backdrop-blur-sm z-0 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Progress bar container */}
      <div
        ref={barRef}
        className="relative h-10 rounded-full bg-secondary/50 cursor-pointer overflow-visible z-10"
        onClick={(e) => {
          if (!barRef.current || duration <= 0) return;
          const rect = barRef.current.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          onSeek(Math.max(0, Math.min(duration, pct * duration)));
        }}
      >
        {/* Filled track */}
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-primary/20 transition-all duration-100"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Playhead */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.5)] z-20 transition-all duration-100"
          style={{ left: `${progressPercent}%`, transform: `translate(-50%, -50%)` }}
        />

        {/* Comment markers — glowing dots */}
        {comments.map((c) => {
          const left = duration > 0 ? (c.timestamp_seconds / duration) * 100 : 0;
          const isActive = hoveredId === c.id;
          return (
            <div
              key={c.id}
              className="absolute top-1/2 z-30"
              style={{ left: `${left}%`, transform: "translate(-50%, -50%)" }}
              onMouseEnter={() => handleMarkerEnter(c.id)}
              onMouseLeave={handleMarkerLeave}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(c.timestamp_seconds);
              }}
            >
              <motion.div
                animate={{
                  scale: isActive ? 1.8 : 1,
                  boxShadow: isActive
                    ? "0 0 16px hsl(var(--primary) / 0.6)"
                    : "0 0 8px hsl(var(--primary) / 0.3)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className={cn(
                  "w-2.5 h-2.5 rounded-full bg-primary cursor-pointer",
                  isActive && "ring-2 ring-primary/30"
                )}
              />
            </div>
          );
        })}
      </div>

      {/* Floating popover */}
      <AnimatePresence>
        {hoveredComment && (
          <motion.div
            key={hoveredComment.id}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute bottom-full mb-3 z-40"
            style={{
              left: `${duration > 0 ? (hoveredComment.timestamp_seconds / duration) * 100 : 0}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="bg-card/95 backdrop-blur-md rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border-0 p-4 min-w-[220px] max-w-[300px]">
              <div className="flex items-center gap-2 mb-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={hoveredComment.user_avatar || undefined} />
                  <AvatarFallback className="text-[9px] bg-secondary text-foreground">
                    {hoveredComment.user_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium text-foreground">{hoveredComment.user_name}</span>
                <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
                  <Clock className="w-2.5 h-2.5" strokeWidth={1.5} />
                  {formatTs(hoveredComment.timestamp_seconds)}
                </span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{hoveredComment.comment_text}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comment count indicator */}
      {comments.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
          <MessageSquare className="w-3 h-3" strokeWidth={1.5} />
          {comments.length} discussion{comments.length !== 1 ? "s" : ""} on this video
        </div>
      )}
    </div>
  );
}
