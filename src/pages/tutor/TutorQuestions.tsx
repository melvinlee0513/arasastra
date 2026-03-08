import { useState, useEffect } from "react";
import { MessageSquare, Send, Clock, Video } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface StudentQuestion {
  id: string;
  comment_text: string;
  timestamp_seconds: number;
  created_at: string;
  class_id: string;
  user_id: string;
  class_title: string;
  student_name: string;
}

export function TutorQuestions() {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (user?.id) fetchQuestions();
  }, [user?.id]);

  const fetchQuestions = async () => {
    setIsLoading(true);
    try {
      const { data: tutor } = await supabase
        .from("tutors")
        .select("id")
        .eq("user_id", user!.id)
        .single();

      if (!tutor) { setIsLoading(false); return; }

      // Get classes for this tutor
      const { data: classes } = await supabase
        .from("classes")
        .select("id, title")
        .eq("tutor_id", tutor.id);

      if (!classes || classes.length === 0) { setIsLoading(false); return; }

      const classMap = new Map(classes.map((c) => [c.id, c.title]));
      const classIds = classes.map((c) => c.id);

      // Get video comments for those classes
      const { data: comments } = await supabase
        .from("video_comments")
        .select("*")
        .in("class_id", classIds)
        .order("created_at", { ascending: false });

      if (!comments || comments.length === 0) { setIsLoading(false); return; }

      // Get student names
      const userIds = [...new Set(comments.map((c) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));

      setQuestions(
        comments.map((c) => ({
          id: c.id,
          comment_text: c.comment_text,
          timestamp_seconds: c.timestamp_seconds,
          created_at: c.created_at,
          class_id: c.class_id,
          user_id: c.user_id,
          class_title: classMap.get(c.class_id) || "Unknown Class",
          student_name: profileMap.get(c.user_id) || "Unknown Student",
        }))
      );
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimestamp = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleReply = async (question: StudentQuestion) => {
    if (!replyText.trim() || !user) return;
    setIsSending(true);

    try {
      // Insert reply as a new video comment from the tutor
      const { error: commentErr } = await supabase.from("video_comments").insert({
        class_id: question.class_id,
        user_id: user.id,
        comment_text: `[Tutor Reply] ${replyText}`,
        timestamp_seconds: question.timestamp_seconds,
      });
      if (commentErr) throw commentErr;

      // Send notification to the student
      await supabase.from("notifications").insert({
        user_id: question.user_id,
        title: "Your tutor replied!",
        message: `Your tutor responded to your question on "${question.class_title}"`,
        type: "qa_reply",
      });

      toast({ title: "✅ Reply Sent", description: "The student has been notified." });
      setReplyingTo(null);
      setReplyText("");
      fetchQuestions();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send reply", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Student Q&A</h1>
        <p className="text-muted-foreground">
          {questions.length} question{questions.length !== 1 ? "s" : ""} from your students
        </p>
      </div>

      {questions.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border rounded-3xl">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-foreground">No questions yet</h3>
          <p className="text-sm text-muted-foreground">
            Student questions from your class videos will appear here
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <Card key={q.id} className="p-5 bg-card border-border rounded-3xl">
              <div className="flex items-start gap-3">
                <Avatar className="w-9 h-9 mt-0.5">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {q.student_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{q.student_name}</span>
                    <Badge variant="outline" className="text-xs gap-1">
                      <Video className="w-3 h-3" />
                      {q.class_title}
                    </Badge>
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(q.timestamp_seconds)}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground mt-2">{q.comment_text}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(q.created_at), "MMM d, h:mm a")}
                  </p>

                  {replyingTo === q.id ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type your reply..."
                        rows={3}
                        className="select-text"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setReplyingTo(null); setReplyText(""); }}
                          className="rounded-full"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleReply(q)}
                          disabled={!replyText.trim() || isSending}
                          className="rounded-full gap-1"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {isSending ? "Sending..." : "Send Reply"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 rounded-full gap-1"
                      onClick={() => setReplyingTo(q.id)}
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Reply
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
