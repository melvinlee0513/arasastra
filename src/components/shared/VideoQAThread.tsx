import { useEffect, useState, useRef } from "react";
import { MessageSquare, Clock, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface VideoComment {
  id: string;
  user_id: string;
  timestamp_seconds: number;
  comment_text: string;
  created_at: string;
  user_name?: string;
  user_avatar?: string | null;
}

interface VideoQAThreadProps {
  classId: string;
  currentTime: number;
  onSeek: (seconds: number) => void;
}

/** Format seconds to mm:ss */
function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * VideoQAThread — Timestamp-linked Q&A side panel for replays.
 * Soft-Tech: glassmorphism panel, rounded inputs, pill timestamp badges.
 */
export function VideoQAThread({ classId, currentTime, onSeek }: VideoQAThreadProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchComments();
  }, [classId]);

  const fetchComments = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("video_comments")
      .select("*")
      .eq("class_id", classId)
      .order("timestamp_seconds", { ascending: true });

    if (data) {
      const userIds = [...new Set(data.map((c) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      setComments(
        data.map((c) => ({
          ...c,
          user_name: profileMap.get(c.user_id)?.full_name || "Student",
          user_avatar: profileMap.get(c.user_id)?.avatar_url,
        }))
      );
    }
    setIsLoading(false);
  };

  const submitComment = async () => {
    if (!newComment.trim() || !user) return;
    setIsSubmitting(true);
    try {
      await supabase.from("video_comments").insert({
        class_id: classId,
        user_id: user.id,
        timestamp_seconds: Math.floor(currentTime),
        comment_text: newComment.trim(),
      });
      setNewComment("");
      await fetchComments();
    } catch (e) {
      console.error("Error posting comment:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteComment = async (id: string) => {
    await supabase.from("video_comments").delete().eq("id", id);
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="flex flex-col h-full bg-card/70 backdrop-blur-md border-l border-border/30 rounded-r-2xl">
      {/* Header */}
      <div className="p-4 border-b border-border/30 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-accent" />
        <h3 className="font-semibold text-foreground text-sm">Q&A Thread</h3>
        <span className="text-xs text-muted-foreground ml-auto bg-secondary/50 px-2.5 py-0.5 rounded-full">
          {comments.length}
        </span>
      </div>

      {/* Comments list */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-24 rounded-full" />
                  <Skeleton className="h-4 w-full rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No questions yet. Be the first!</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="group">
                  <div className="flex items-start gap-2.5">
                    <Avatar className="w-7 h-7 mt-0.5">
                      <AvatarImage src={comment.user_avatar || undefined} />
                      <AvatarFallback className="text-[10px] bg-secondary text-foreground">
                        {(comment.user_name || "S").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{comment.user_name}</span>
                        <button
                          onClick={() => onSeek(comment.timestamp_seconds)}
                          className="inline-flex items-center gap-0.5 text-[10px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimestamp(comment.timestamp_seconds)}
                        </button>
                      </div>
                      <p className="text-sm text-foreground/80 mt-1 leading-relaxed">{comment.comment_text}</p>
                    </div>
                    {user?.id === comment.user_id && (
                      <button
                        onClick={() => deleteComment(comment.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive mt-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </ScrollArea>

      {/* Input area */}
      {user && (
        <div className="p-4 border-t border-border/30">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-2">
            <Clock className="w-3 h-3" />
            Posting at <span className="font-medium text-primary">{formatTimestamp(currentTime)}</span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitComment();
            }}
            className="flex gap-2"
          >
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Ask a question..."
              className="text-sm h-10 rounded-full bg-secondary/30 border-border/30"
            />
            <Button
              type="submit"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              disabled={!newComment.trim() || isSubmitting}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
