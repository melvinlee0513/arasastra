import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Clock, Sparkles, CheckCircle2, AlertTriangle, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MOCK_QUESTIONS, MOCK_QUIZ_SETTINGS } from "./mockQuizData";

export default function StudentQuizAttemptPreview() {
  const nav = useNavigate();
  const { classId = "mock-1" } = useParams();
  const [params] = useSearchParams();
  const isTutorPreview = params.get("mode") === "tutor";

  const questions = MOCK_QUESTIONS;
  const settings = MOCK_QUIZ_SETTINGS;
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const q = questions[idx];
  const progress = ((idx + 1) / questions.length) * 100;
  const unanswered = useMemo(
    () => questions.filter((qq) => !answers[qq.id]).length,
    [answers, questions],
  );

  const goto = (i: number) => setIdx(Math.max(0, Math.min(questions.length - 1, i)));

  const submit = () => {
    if (isTutorPreview) {
      nav(`/tutor/classes/${classId}/quizzes/mock-quiz/edit/preview`);
      return;
    }
    nav(`/dashboard/classes/${classId}/quizzes/mock-quiz/results/preview`);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to={isTutorPreview ? `/tutor/classes/${classId}/quizzes/mock-quiz/edit/preview` : `/dashboard/classes/${classId}/preview`}>
              <X className="w-4 h-4 mr-1" /> Exit
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{settings.title}</p>
            <p className="text-xs text-slate-500 truncate">{settings.className}</p>
          </div>
          {settings.timeLimitEnabled && (
            <Badge variant="outline" className="rounded-full">
              <Clock className="w-3 h-3 mr-1" /> {settings.timeLimitMinutes}:00
            </Badge>
          )}
        </div>
        {isTutorPreview && (
          <div className="bg-amber-50 border-t border-amber-200 text-amber-900 text-xs px-4 py-2 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Preview mode — responses will not be saved.
          </div>
        )}
        <div className="max-w-3xl mx-auto px-4 pb-3">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>Question {idx + 1} of {questions.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 pb-40">
        <Card className="rounded-3xl border-slate-200 shadow-sm p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Question {idx + 1} · {q.points} pts
          </p>
          <h2 className="text-lg sm:text-2xl font-semibold text-slate-900 mt-2 leading-relaxed break-words">
            {q.text}
          </h2>

          <RadioGroup
            value={answers[q.id] ?? ""}
            onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            className="mt-6 space-y-3"
          >
            {q.options.map((o, i) => {
              const selected = answers[q.id] === o.id;
              return (
                <Label
                  key={o.id}
                  htmlFor={o.id}
                  className={`flex items-center gap-3 rounded-2xl border p-4 cursor-pointer transition
                    ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-slate-200 hover:border-slate-300 bg-white"}`}
                >
                  <RadioGroupItem value={o.id} id={o.id} />
                  <span className="text-xs font-semibold text-slate-400 w-5">{String.fromCharCode(65 + i)}</span>
                  <span className="flex-1 text-sm sm:text-base text-slate-800">{o.text}</span>
                  {selected && <CheckCircle2 className="w-5 h-5 text-primary" />}
                </Label>
              );
            })}
          </RadioGroup>
        </Card>

        {/* Question navigator */}
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Jump to question</p>
          <div className="flex flex-wrap gap-2">
            {questions.map((qq, i) => {
              const answered = !!answers[qq.id];
              const active = i === idx;
              return (
                <button
                  key={qq.id}
                  onClick={() => goto(i)}
                  aria-label={`Go to question ${i + 1}${answered ? " (answered)" : ""}`}
                  className={`w-9 h-9 rounded-full text-xs font-semibold border transition
                    ${active ? "bg-primary text-primary-foreground border-primary" :
                      answered ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                      "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3 sm:p-4 z-30">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => goto(idx - 1)} disabled={idx === 0}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Previous
          </Button>
          <div className="flex-1" />
          {idx < questions.length - 1 ? (
            <Button className="rounded-full" onClick={() => goto(idx + 1)}>
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button className="rounded-full" onClick={() => setConfirmOpen(true)}>
              Submit quiz
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-3xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your quiz?</AlertDialogTitle>
            <AlertDialogDescription>
              {unanswered > 0 ? (
                <span className="flex items-start gap-2 text-amber-700">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  You have {unanswered} unanswered question{unanswered > 1 ? "s" : ""}. You can still submit, but they will be marked incorrect.
                </span>
              ) : (
                "All questions are answered. You can't change your answers after submitting."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep reviewing</AlertDialogCancel>
            <AlertDialogAction className="rounded-full" onClick={submit}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
