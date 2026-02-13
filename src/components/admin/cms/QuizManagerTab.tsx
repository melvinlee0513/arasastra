import { useEffect, useState } from "react";
import { Plus, Trash2, Edit, GripVertical, Save, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Quiz {
  id: string;
  title: string;
  class_id: string | null;
  created_at: string | null;
  questions_count?: number;
  class?: { title: string } | null;
}

interface QuestionForm {
  id?: string;
  question: string;
  options: string[];
  correct_answer: string;
  sort_order: number;
}

export function QuizManagerTab() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [classes, setClasses] = useState<{ id: string; title: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [showQuizDialog, setShowQuizDialog] = useState(false);
  const [showQuestionsDialog, setShowQuestionsDialog] = useState(false);
  const [quizForm, setQuizForm] = useState({ title: "", class_id: "" });
  const [questions, setQuestions] = useState<QuestionForm[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    const [quizRes, classRes] = await Promise.all([
      supabase.from("quizzes").select("id, title, class_id, created_at, class:classes(title)").order("created_at", { ascending: false }),
      supabase.from("classes").select("id, title").order("title"),
    ]);

    if (quizRes.data) {
      // Count questions per quiz
      const { data: qCounts } = await supabase
        .from("quiz_questions")
        .select("quiz_id");
      const countMap: Record<string, number> = {};
      (qCounts || []).forEach((q) => {
        countMap[q.quiz_id] = (countMap[q.quiz_id] || 0) + 1;
      });
      setQuizzes(
        quizRes.data.map((q) => ({ ...q, questions_count: countMap[q.id] || 0 }))
      );
    }
    if (classRes.data) setClasses(classRes.data);
    setIsLoading(false);
  };

  const saveQuiz = async () => {
    setIsSaving(true);
    try {
      if (editingQuiz) {
        await supabase
          .from("quizzes")
          .update({ title: quizForm.title, class_id: quizForm.class_id || null })
          .eq("id", editingQuiz.id);
        toast({ title: "✅ Quiz updated" });
      } else {
        await supabase.from("quizzes").insert({
          title: quizForm.title,
          class_id: quizForm.class_id || null,
        });
        toast({ title: "✅ Quiz created" });
      }
      setShowQuizDialog(false);
      setEditingQuiz(null);
      fetchData();
    } catch {
      toast({ title: "Error", description: "Failed to save quiz", variant: "destructive" });
    }
    setIsSaving(false);
  };

  const deleteQuiz = async (id: string) => {
    await supabase.from("quiz_questions").delete().eq("quiz_id", id);
    await supabase.from("quizzes").delete().eq("id", id);
    toast({ title: "🗑️ Quiz deleted" });
    fetchData();
  };

  const openQuestions = async (quiz: Quiz) => {
    setEditingQuiz(quiz);
    const { data } = await supabase
      .from("quiz_questions")
      .select("*")
      .eq("quiz_id", quiz.id)
      .order("sort_order");
    setQuestions(
      (data || []).map((q) => ({
        id: q.id,
        question: q.question,
        options: Array.isArray(q.options) ? (q.options as string[]) : [],
        correct_answer: q.correct_answer,
        sort_order: q.sort_order || 0,
      }))
    );
    setShowQuestionsDialog(true);
  };

  const addQuestion = () => {
    setQuestions((q) => [
      ...q,
      {
        question: "",
        options: ["", "", "", ""],
        correct_answer: "",
        sort_order: q.length,
      },
    ]);
  };

  const updateQuestion = (index: number, field: string, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex ? { ...q, options: q.options.map((o, j) => (j === oIndex ? value : o)) } : q
      )
    );
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const saveQuestions = async () => {
    if (!editingQuiz) return;
    setIsSaving(true);
    try {
      // Validate
      for (const q of questions) {
        if (!q.question.trim()) throw new Error("All questions must have text");
        if (q.options.some((o) => !o.trim())) throw new Error("All options must be filled");
        if (!q.correct_answer) throw new Error("All questions must have a correct answer");
      }

      // Delete old questions
      await supabase.from("quiz_questions").delete().eq("quiz_id", editingQuiz.id);

      // Insert new
      if (questions.length > 0) {
        await supabase.from("quiz_questions").insert(
          questions.map((q, i) => ({
            quiz_id: editingQuiz.id,
            question: q.question,
            options: q.options,
            correct_answer: q.correct_answer,
            sort_order: i,
          }))
        );
      }

      toast({ title: "✅ Questions saved" });
      setShowQuestionsDialog(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array(3).fill(0).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Quizzes</h2>
          <p className="text-sm text-muted-foreground">{quizzes.length} quizzes total</p>
        </div>
        <Button
          variant="gold"
          onClick={() => {
            setEditingQuiz(null);
            setQuizForm({ title: "", class_id: "" });
            setShowQuizDialog(true);
          }}
        >
          <Plus className="w-4 h-4 mr-2" /> New Quiz
        </Button>
      </div>

      {quizzes.length === 0 ? (
        <Card className="p-12 text-center border-border">
          <HelpCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-foreground mb-2">No quizzes yet</h3>
          <p className="text-sm text-muted-foreground">Create your first quiz to get started.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {quizzes.map((quiz) => (
            <Card key={quiz.id} className="p-4 border-border flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <HelpCircle className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{quiz.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {quiz.questions_count} questions
                  </Badge>
                  {quiz.class && (
                    <Badge variant="outline" className="text-xs">
                      {quiz.class.title}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openQuestions(quiz)}
                >
                  <Edit className="w-4 h-4 mr-1" /> Questions
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingQuiz(quiz);
                    setQuizForm({ title: quiz.title, class_id: quiz.class_id || "" });
                    setShowQuizDialog(true);
                  }}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteQuiz(quiz.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Quiz Create/Edit Dialog */}
      <Dialog open={showQuizDialog} onOpenChange={setShowQuizDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingQuiz ? "Edit Quiz" : "Create Quiz"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Quiz Title</Label>
              <Input
                value={quizForm.title}
                onChange={(e) => setQuizForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Chapter 3 Review"
              />
            </div>
            <div className="space-y-2">
              <Label>Linked Class (optional)</Label>
              <Select
                value={quizForm.class_id}
                onValueChange={(v) => setQuizForm((f) => ({ ...f, class_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a class..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuizDialog(false)}>
              Cancel
            </Button>
            <Button variant="gold" onClick={saveQuiz} disabled={!quizForm.title || isSaving}>
              {isSaving ? "Saving..." : "Save Quiz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Questions Editor Dialog */}
      <Dialog open={showQuestionsDialog} onOpenChange={setShowQuestionsDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Questions — {editingQuiz?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {questions.map((q, qi) => (
              <Card key={qi} className="p-4 border-border space-y-3">
                <div className="flex items-start gap-2">
                  <GripVertical className="w-5 h-5 text-muted-foreground mt-2 shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Q{qi + 1}
                      </Badge>
                      <Textarea
                        value={q.question}
                        onChange={(e) => updateQuestion(qi, "question", e.target.value)}
                        placeholder="Enter the question..."
                        className="min-h-[60px]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-4">
                            {String.fromCharCode(65 + oi)}
                          </span>
                          <Input
                            value={opt}
                            onChange={(e) => updateOption(qi, oi, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                            className="text-sm"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs shrink-0">Correct:</Label>
                      <Select
                        value={q.correct_answer}
                        onValueChange={(v) => updateQuestion(qi, "correct_answer", v)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Pick correct answer" />
                        </SelectTrigger>
                        <SelectContent>
                          {q.options.filter(Boolean).map((opt, oi) => (
                            <SelectItem key={oi} value={opt}>
                              {String.fromCharCode(65 + oi)}: {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    onClick={() => removeQuestion(qi)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}

            <Button variant="outline" className="w-full" onClick={addQuestion}>
              <Plus className="w-4 h-4 mr-2" /> Add Question
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuestionsDialog(false)}>
              Cancel
            </Button>
            <Button variant="gold" onClick={saveQuestions} disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving..." : "Save All Questions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
