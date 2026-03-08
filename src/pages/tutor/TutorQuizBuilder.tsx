import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Check, HelpCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface QuestionDraft {
  question: string;
  options: string[];
  correctAnswer: string;
  topicTag: string;
}

export function TutorQuizBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tutorClasses, setTutorClasses] = useState<{ id: string; title: string }[]>([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [classId, setClassId] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user?.id) fetchTutorClasses();
  }, [user?.id]);

  const fetchTutorClasses = async () => {
    const { data: tutor } = await supabase
      .from("tutors")
      .select("id")
      .eq("user_id", user!.id)
      .single();

    if (!tutor) return;

    const { data } = await supabase
      .from("classes")
      .select("id, title")
      .eq("tutor_id", tutor.id)
      .order("scheduled_at", { ascending: false });

    setTutorClasses(data || []);
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      { question: "", options: ["", "", "", ""], correctAnswer: "", topicTag: "" },
    ]);
  };

  const updateQuestion = (index: number, field: keyof QuestionDraft, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const updated = [...questions];
    updated[qIndex].options[oIndex] = value;
    setQuestions(updated);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const isValid = () => {
    if (!quizTitle.trim() || questions.length === 0) return false;
    return questions.every(
      (q) =>
        q.question.trim() &&
        q.options.every((o) => o.trim()) &&
        q.correctAnswer &&
        q.topicTag.trim()
    );
  };

  const handleSubmit = async () => {
    if (!isValid()) return;
    setIsSubmitting(true);

    try {
      const { data: quiz, error: quizErr } = await supabase
        .from("quizzes")
        .insert({
          title: quizTitle,
          class_id: classId || null,
        })
        .select()
        .single();

      if (quizErr) throw quizErr;

      const questionsToInsert = questions.map((q, i) => ({
        quiz_id: quiz.id,
        question: `[${q.topicTag}] ${q.question}`,
        options: q.options,
        correct_answer: q.correctAnswer,
        sort_order: i,
      }));

      const { error: qErr } = await supabase
        .from("quiz_questions")
        .insert(questionsToInsert);

      if (qErr) throw qErr;

      toast({ title: "🎉 Quiz Created!", description: `${questions.length} questions added successfully.` });
      navigate("/tutor/classes");
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create quiz", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Create Quiz</h1>
        <p className="text-muted-foreground">Build a multiple-choice quiz for your students</p>
      </div>

      {/* Quiz Info */}
      <Card className="p-6 bg-card border-border rounded-3xl space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Quiz Title *</label>
          <Input
            value={quizTitle}
            onChange={(e) => setQuizTitle(e.target.value)}
            placeholder="e.g. Chapter 5 - Quadratic Equations"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Link to Class (optional)</label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger><SelectValue placeholder="Select a class" /></SelectTrigger>
            <SelectContent>
              {tutorClasses.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Questions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Questions ({questions.length})
          </h2>
          <Button onClick={addQuestion} variant="outline" className="rounded-full gap-2">
            <Plus className="w-4 h-4" /> Add Question
          </Button>
        </div>

        <AnimatePresence>
          {questions.map((q, qIdx) => (
            <motion.div
              key={qIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Card className="p-5 bg-card border-border rounded-3xl space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="gap-1">
                    <HelpCircle className="w-3 h-3" /> Q{qIdx + 1}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeQuestion(qIdx)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Question *</label>
                  <Input
                    value={q.question}
                    onChange={(e) => updateQuestion(qIdx, "question", e.target.value)}
                    placeholder="What is the formula for...?"
                  />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Options *</label>
                  <RadioGroup
                    value={q.correctAnswer}
                    onValueChange={(val) => updateQuestion(qIdx, "correctAnswer", val)}
                    className="space-y-2"
                  >
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-3">
                        <RadioGroupItem value={opt || `option-${oIdx}`} id={`q${qIdx}-o${oIdx}`} disabled={!opt.trim()} />
                        <Label htmlFor={`q${qIdx}-o${oIdx}`} className="flex-1">
                          <Input
                            value={opt}
                            onChange={(e) => {
                              updateOption(qIdx, oIdx, e.target.value);
                              // Update correctAnswer if it was previously set to this option's old value
                              if (q.correctAnswer === opt) {
                                updateQuestion(qIdx, "correctAnswer", e.target.value);
                              }
                            }}
                            placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                          />
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground mt-2">
                    Select the radio button next to the correct answer
                  </p>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Topic Tag *</label>
                  <Input
                    value={q.topicTag}
                    onChange={(e) => updateQuestion(qIdx, "topicTag", e.target.value)}
                    placeholder="e.g. Algebra, Trigonometry, Paper 1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This tag helps identify which areas students are struggling with
                  </p>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        {questions.length === 0 && (
          <Card className="p-8 text-center bg-card border-border rounded-3xl">
            <HelpCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-foreground">No questions yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Click "Add Question" to start building your quiz
            </p>
            <Button onClick={addQuestion} className="rounded-full gap-2">
              <Plus className="w-4 h-4" /> Add First Question
            </Button>
          </Card>
        )}
      </div>

      {/* Submit */}
      {questions.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!isValid() || isSubmitting}
            className="rounded-full"
          >
            {isSubmitting ? "Creating..." : "Create Quiz"} <Check className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
