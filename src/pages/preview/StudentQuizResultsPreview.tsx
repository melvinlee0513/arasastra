import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Trophy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { MOCK_QUESTIONS, MOCK_QUIZ_SETTINGS } from "./mockQuizData";

// Simulated mock attempt — answers 2 of 3 correctly.
const MOCK_ATTEMPT = {
  selected: {
    q1: "o1", // correct
    q2: "t2", // incorrect
    q3: "a1", // correct
  } as Record<string, string>,
  timeTakenSeconds: 6 * 60 + 42,
  xpEarned: 45,
};

export default function StudentQuizResultsPreview() {
  const { classId = "mock-1" } = useParams();
  const gamificationOn = useFeatureEnabled("gamification");
  const quizXPOn = useFeatureEnabled("quizXP");
  const showXP = gamificationOn && quizXPOn;

  const settings = MOCK_QUIZ_SETTINGS;
  const questions = MOCK_QUESTIONS;

  const totalPoints = questions.reduce((s, q) => s + q.points, 0);
  const earned = questions.reduce((s, q) => {
    const chosen = MOCK_ATTEMPT.selected[q.id];
    const correct = q.options.find((o) => o.isCorrect)?.id;
    return chosen === correct ? s + q.points : s;
  }, 0);
  const percent = Math.round((earned / totalPoints) * 100);
  const passed = percent >= settings.passingScore;
  const correctCount = questions.filter(
    (q) => MOCK_ATTEMPT.selected[q.id] === q.options.find((o) => o.isCorrect)?.id,
  ).length;

  const mins = Math.floor(MOCK_ATTEMPT.timeTakenSeconds / 60);
  const secs = MOCK_ATTEMPT.timeTakenSeconds % 60;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 text-xs sm:text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 shrink-0" /> UI Preview · Mock results, not from real attempts.
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="rounded-full">
            <Link to={`/dashboard/classes/${classId}/preview`}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to class
            </Link>
          </Button>
        </div>

        {/* Score hero */}
        <Card className={`rounded-3xl shadow-sm p-6 sm:p-8 border ${passed ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white" : "border-amber-200 bg-gradient-to-br from-amber-50 to-white"}`}>
          <div className="flex items-center gap-2">
            <Trophy className={`w-5 h-5 ${passed ? "text-emerald-600" : "text-amber-600"}`} />
            <p className="text-sm font-semibold text-slate-700">{settings.title}</p>
          </div>
          <div className="mt-4 flex items-end gap-3">
            <span className="text-5xl font-bold text-slate-900">{percent}%</span>
            <Badge className={`rounded-full mb-2 ${passed ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-amber-100 text-amber-800 hover:bg-amber-100"}`}>
              {passed ? "Passed" : "Below passing score"}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {earned} of {totalPoints} points · Passing score {settings.passingScore}%
          </p>
          <Progress value={percent} className="h-2 mt-4" />
        </Card>

        {/* Summary chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Correct" value={`${correctCount}/${questions.length}`} />
          <Stat label="Points" value={`${earned}/${totalPoints}`} />
          <Stat label="Time taken" value={`${mins}m ${secs}s`} icon={<Clock className="w-3.5 h-3.5" />} />
          {showXP && <Stat label="XP earned" value={`+${MOCK_ATTEMPT.xpEarned}`} tone="primary" />}
        </div>

        {/* Review or summary-only */}
        {settings.showCorrectAfterSubmit ? (
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900">Question review</h3>
            {questions.map((q, i) => {
              const chosen = MOCK_ATTEMPT.selected[q.id];
              const correctId = q.options.find((o) => o.isCorrect)?.id;
              const isCorrect = chosen === correctId;
              return (
                <Card key={q.id} className={`rounded-3xl shadow-sm p-5 border ${isCorrect ? "border-emerald-200" : "border-red-200"}`}>
                  <div className="flex items-start gap-2 flex-wrap">
                    <Badge variant="secondary" className="rounded-full">Q{i + 1}</Badge>
                    {isCorrect ? (
                      <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Correct
                      </Badge>
                    ) : (
                      <Badge className="rounded-full bg-red-100 text-red-700 hover:bg-red-100">
                        <XCircle className="w-3 h-3 mr-1" /> Incorrect
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-slate-500">{q.points} pts</span>
                  </div>
                  <p className="text-slate-900 font-medium mt-3 break-words">{q.text}</p>
                  <ul className="mt-3 space-y-1.5">
                    {q.options.map((o) => {
                      const isChosen = chosen === o.id;
                      const isRight = o.isCorrect;
                      return (
                        <li
                          key={o.id}
                          className={`rounded-2xl px-3 py-2 text-sm flex items-center gap-2 border
                            ${isRight ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
                              isChosen ? "border-red-200 bg-red-50 text-red-800" :
                              "border-slate-100 bg-slate-50 text-slate-700"}`}
                        >
                          {isRight && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                          {!isRight && isChosen && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                          <span className="flex-1">{o.text}</span>
                          {isChosen && <span className="text-[10px] uppercase tracking-wide">Your answer</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {q.explanation && (
                    <p className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-2xl px-3 py-2">
                      <span className="font-semibold text-slate-900">Explanation: </span>{q.explanation}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="rounded-3xl border-slate-200 shadow-sm p-6 text-sm text-slate-600">
            Your tutor has hidden correct answers for this quiz. Only your score and summary are shown.
          </Card>
        )}

        <div className="flex justify-center">
          <Button asChild className="rounded-full">
            <Link to={`/dashboard/classes/${classId}/preview`}>Return to class</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label, value, icon, tone = "default",
}: { label: string; value: string; icon?: React.ReactNode; tone?: "default" | "primary" }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tone === "primary" ? "bg-primary/5 border-primary/20" : "bg-white border-slate-200"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1">
        {icon} {label}
      </p>
      <p className={`text-lg font-bold mt-1 ${tone === "primary" ? "text-primary" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
