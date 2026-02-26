import { useEffect, useState, useRef } from "react";
import { MessageSquare, Clock, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
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

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoQAThread({ classId, currentTime, onSeek }: VideoQAThreadProps) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchComments();
  }, [classId]);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("video_comments")
      .select("*")
      .eq("class_id", classId)
      .order("timestamp_seconds", { ascending: true });

    if (data) {
      // Fetch user profiles
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
    <div className="flex flex-col h-full bg-card border-l border-border">
      <div className="p-3 border-b border-border flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-accent" />
        <h3 className="font-semibold text-foreground text-sm">Q&A</h3>
        <span className="text-xs text-muted-foreground ml-auto">{comments.length} comments</span>
      </div>

      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        <div className="space-y-3">
          {comments.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No questions yet. Be the first!</p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="group space-y-1">
                <div className="flex items-start gap-2">
                  <Avatar className="w-6 h-6 mt-0.5">
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
                        className="flex items-center gap-0.5 text-[10px] text-accent hover:underline"
                      >
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(comment.timestamp_seconds)}
                      </button>
                    </div>
                    <p className="text-sm text-foreground/80 mt-0.5">{comment.comment_text}</p>
                  </div>
                  {user?.id === comment.user_id && (
                    <button
                      onClick={() => deleteComment(comment.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {user && (
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1.5">
            <Clock className="w-3 h-3" />
            Posting at {formatTimestamp(currentTime)}
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
              className="text-sm h-9"
            />
            <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!newComment.trim() || isSubmitting}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
