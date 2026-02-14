import { useState, useEffect } from "react";
import { ClipboardCheck, Search, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface SubmissionItem {
  id: string;
  file_url: string;
  grade: string | null;
  feedback: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  assignment_title: string;
  student_name: string;
  user_id: string;
}

export function TutorGrading() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [gradeDialog, setGradeDialog] = useState<SubmissionItem | null>(null);
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isGrading, setIsGrading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (user?.id) fetchSubmissions();
  }, [user?.id]);

  const fetchSubmissions = async () => {
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
        .select("id")
        .eq("tutor_id", tutor.id);

      if (!classes || classes.length === 0) { setIsLoading(false); return; }

      // Get assignments for these classes
      const { data: assignments } = await supabase
        .from("assignments")
        .select("id, title, class_id")
        .in("class_id", classes.map((c) => c.id));

      if (!assignments || assignments.length === 0) { setIsLoading(false); return; }

      const assignmentMap = new Map(assignments.map((a) => [a.id, a.title]));

      // Get submissions
      const { data: subs } = await supabase
        .from("submissions")
        .select("*")
        .in("assignment_id", assignments.map((a) => a.id))
        .order("submitted_at", { ascending: false });

      if (!subs || subs.length === 0) { setIsLoading(false); return; }

      // Get student names
      const userIds = [...new Set(subs.map((s) => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));

      setSubmissions(
        subs.map((s) => ({
          id: s.id,
          file_url: s.file_url,
          grade: s.grade,
          feedback: s.feedback,
          submitted_at: s.submitted_at,
          graded_at: s.graded_at,
          assignment_title: assignmentMap.get(s.assignment_id) || "Unknown",
          student_name: profileMap.get(s.user_id) || "Unknown",
          user_id: s.user_id,
        }))
      );
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGrade = async () => {
    if (!gradeDialog || !grade) return;
    setIsGrading(true);
    try {
      const { error } = await supabase
        .from("submissions")
        .update({ grade, feedback, graded_at: new Date().toISOString() })
        .eq("id", gradeDialog.id);

      if (error) throw error;

      toast({ title: "Graded!", description: `Assigned grade: ${grade}` });
      setGradeDialog(null);
      setGrade("");
      setFeedback("");
      fetchSubmissions();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save grade", variant: "destructive" });
    } finally {
      setIsGrading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Grading</h1>
        <p className="text-muted-foreground">Review and grade student submissions</p>
      </div>

      {submissions.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No submissions yet</h3>
          <p className="text-sm text-muted-foreground">
            Student submissions will appear here when they submit assignments
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {submissions.map((sub) => (
            <Card key={sub.id} className="p-4 bg-card border-border hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{sub.assignment_title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {sub.student_name} • {sub.submitted_at ? format(new Date(sub.submitted_at), "MMM d, h:mm a") : "N/A"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {sub.grade ? (
                    <Badge className="bg-accent text-accent-foreground">{sub.grade}</Badge>
                  ) : (
                    <Badge variant="secondary">Ungraded</Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGradeDialog(sub);
                      setGrade(sub.grade || "");
                      setFeedback(sub.feedback || "");
                    }}
                  >
                    {sub.grade ? "Edit" : "Grade"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Grade Dialog */}
      <Dialog open={!!gradeDialog} onOpenChange={(open) => !open && setGradeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grade Submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Student</p>
              <p className="font-medium text-foreground">{gradeDialog?.student_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Assignment</p>
              <p className="font-medium text-foreground">{gradeDialog?.assignment_title}</p>
            </div>
            {gradeDialog?.file_url && (
              <Button variant="outline" size="sm" asChild>
                <a href={gradeDialog.file_url} target="_blank" rel="noopener noreferrer">
                  View Submission File
                </a>
              </Button>
            )}
            <div>
              <p className="text-sm text-muted-foreground mb-1">Grade</p>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                <SelectContent>
                  {["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "F"].map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Feedback</p>
              <Textarea
                placeholder="Optional feedback for the student..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGradeDialog(null)}>Cancel</Button>
            <Button onClick={handleGrade} disabled={!grade || isGrading}>
              {isGrading ? "Saving..." : "Save Grade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
