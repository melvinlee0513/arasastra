import { useEffect, useState } from "react";
import { FileText, RefreshCw, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Submission {
  id: string;
  file_url: string;
  grade: string | null;
  feedback: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  user_id: string;
  assignment: { title: string; class_id: string | null } | null;
  profile?: { full_name: string } | null;
}

const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "F"];

export function GradingPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("submissions")
        .select("id, file_url, grade, feedback, submitted_at, graded_at, user_id, assignment:assignments(title, class_id)")
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      // Fetch student names
      const userIds = [...new Set((data || []).map((s) => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

      const enriched = (data || []).map((s) => ({
        ...s,
        profile: profileMap.get(s.user_id) || null,
      }));

      setSubmissions(enriched as Submission[]);
    } catch (error) {
      console.error("Error fetching submissions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchSubmissions();
    setIsRefreshing(false);
    toast({ title: "✅ Refreshed", description: "Submissions updated" });
  };

  const openGrading = (submission: Submission) => {
    setSelectedSubmission(submission);
    setGrade(submission.grade || "");
    setFeedback(submission.feedback || "");
  };

  const saveGrade = async () => {
    if (!selectedSubmission) return;
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("submissions")
        .update({
          grade,
          feedback,
          graded_at: new Date().toISOString(),
        })
        .eq("id", selectedSubmission.id);

      if (error) throw error;

      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === selectedSubmission.id
            ? { ...s, grade, feedback, graded_at: new Date().toISOString() }
            : s
        )
      );

      toast({ title: "✅ Graded", description: `Grade ${grade} saved` });
      setSelectedSubmission(null);
    } catch (error) {
      console.error("Error saving grade:", error);
      toast({ title: "Error", description: "Failed to save grade", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const pendingCount = submissions.filter((s) => !s.grade).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Grading</h1>
          <p className="text-muted-foreground">
            {pendingCount} pending • {submissions.length} total submissions
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Student</TableHead>
              <TableHead>Assignment</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array(4)
                .fill(0)
                .map((_, i) => (
                  <TableRow key={i}>
                    {Array(5)
                      .fill(0)
                      .map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                  </TableRow>
                ))
            ) : submissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No submissions yet
                </TableCell>
              </TableRow>
            ) : (
              submissions.map((sub) => (
                <TableRow key={sub.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-foreground">
                    {sub.profile?.full_name || "Unknown"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sub.assignment?.title || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {sub.submitted_at
                      ? format(new Date(sub.submitted_at), "MMM d, h:mm a")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {sub.grade ? (
                      <Badge variant="secondary">{sub.grade}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-yellow-400 border-yellow-400/30">
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(sub.file_url, "_blank")}
                      >
                        <ExternalLink className="w-3 h-3 mr-1" /> View
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openGrading(sub)}>
                        Grade
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Grading Dialog */}
      <Dialog
        open={!!selectedSubmission}
        onOpenChange={(open) => !open && setSelectedSubmission(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grade Submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Student</p>
              <p className="font-medium text-foreground">
                {selectedSubmission?.profile?.full_name}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Assignment</p>
              <p className="font-medium text-foreground">
                {selectedSubmission?.assignment?.title}
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                selectedSubmission && window.open(selectedSubmission.file_url, "_blank")
              }
            >
              <ExternalLink className="w-4 h-4 mr-2" /> Open Student's Work
            </Button>
            <div className="space-y-2">
              <Label>Grade</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger>
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {GRADES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Feedback</Label>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Write feedback for the student..."
                rows={4}
              />
            </div>
            <Button onClick={saveGrade} disabled={!grade || isSaving} className="w-full">
              {isSaving ? "Saving..." : "Save Grade"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
