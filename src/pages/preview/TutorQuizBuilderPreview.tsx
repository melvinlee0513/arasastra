import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Save, Eye, Send, Plus, Copy, Trash2, ChevronUp, ChevronDown,
  ChevronsUpDown, CheckCircle2, AlertTriangle, Sparkles, HelpCircle, ToggleLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  MOCK_QUESTIONS, MOCK_QUIZ_SETTINGS, type MockQuestion, type MockQuestionType,
} from "./mockQuizData";

let uid = 100;
const nextId = () => `id_${++uid}`;

function newQuestion(type: MockQuestionType): MockQuestion {
  if (type === "true_false") {
    return {
      id: nextId(),
      type,
      text: "",
      points: 1,
      options: [
        { id: nextId(), text: "True", isCorrect: false },
        { id: nextId(), text: "False", isCorrect: false },
      ],
    };
  }
  return {
    id: nextId(),
    type,
    text: "",
    points: 1,
    options: [
      { id: nextId(), text: "", isCorrect: false },
      { id: nextId(), text: "", isCorrect: false },
    ],
  };
}

interface QuestionIssue {
  id: string;
  index: number;
  reasons: string[];
}

function validate(questions: MockQuestion[]): { issues: QuestionIssue[]; quizEmpty: boolean } {
  const issues: QuestionIssue[] = [];
  questions.forEach((q, i) => {
    const reasons: string[] = [];
    if (!q.text.trim()) reasons.push("Question text is missing");
    if (q.options.length < 2) reasons.push("Add at least two answer options");
    if (!q.options.some((o) => o.isCorrect)) reasons.push("Mark a correct answer");
    const blanks = q.options.filter((o) => !o.text.trim());
    if (blanks.length > 1) reasons.push("Remove duplicate blank options");
    if (q.points <= 0) reasons.push("Set points greater than zero");
    if (reasons.length) issues.push({ id: q.id, index: i, reasons });
  });
  return { issues, quizEmpty: questions.length === 0 };
}

export default function TutorQuizBuilderPreview() {
  const nav = useNavigate();
  const { classId = "mock-1", quizId } = useParams();
  const isEdit = !!quizId;

  const [settings, setSettings] = useState({ ...MOCK_QUIZ_SETTINGS, classId });
  const [questions, setQuestions] = useState<MockQuestion[]>(isEdit ? MOCK_QUESTIONS : []);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(MOCK_QUESTIONS.map((q) => [q.id, true])),
  );
  const [showIssues, setShowIssues] = useState(false);

  const { issues, quizEmpty } = useMemo(() => validate(questions), [questions]);

  const setSetting = <K extends keyof typeof settings>(k: K, v: (typeof settings)[K]) =>
    setSettings((s) => ({ ...s, [k]: v }));

  const addQuestion = (type: MockQuestionType) => {
    const q = newQuestion(type);
    setQuestions((qs) => [...qs, q]);
    setExpanded((e) => ({ ...e, [q.id]: true }));
  };

  const updateQuestion = (id: string, patch: Partial<MockQuestion>) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const duplicateQuestion = (id: string) => {
    setQuestions((qs) => {
      const idx = qs.findIndex((q) => q.id === id);
      if (idx < 0) return qs;
      const src = qs[idx];
      const copy: MockQuestion = {
        ...src,
        id: nextId(),
        options: src.options.map((o) => ({ ...o, id: nextId() })),
      };
      const next = [...qs];
      next.splice(idx + 1, 0, copy);
      setExpanded((e) => ({ ...e, [copy.id]: true }));
      return next;
    });
  };

  const deleteQuestion = (id: string) => setQuestions((qs) => qs.filter((q) => q.id !== id));

  const move = (id: string, dir: -1 | 1) =>
    setQuestions((qs) => {
      const idx = qs.findIndex((q) => q.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const setCorrect = (qid: string, oid: string) =>
    updateQuestion(qid, {
      options: questions.find((q) => q.id === qid)!.options.map((o) => ({ ...o, isCorrect: o.id === oid })),
    });

  const updateOptionText = (qid: string, oid: string, text: string) => {
    const q = questions.find((x) => x.id === qid)!;
    updateQuestion(qid, { options: q.options.map((o) => (o.id === oid ? { ...o, text } : o)) });
  };

  const addOption = (qid: string) => {
    const q = questions.find((x) => x.id === qid)!;
    if (q.type === "true_false") return;
    updateQuestion(qid, { options: [...q.options, { id: nextId(), text: "", isCorrect: false }] });
  };

  const removeOption = (qid: string, oid: string) => {
    const q = questions.find((x) => x.id === qid)!;
    if (q.options.length <= 2) return;
    updateQuestion(qid, { options: q.options.filter((o) => o.id !== oid) });
  };

  const attemptAction = (kind: "save" | "preview" | "publish") => {
    setShowIssues(true);
    if (kind === "publish" && (quizEmpty || issues.length)) return;
    if (kind === "preview") nav(`/dashboard/classes/${classId}/quizzes/mock-quiz/attempt/preview?mode=tutor`);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 text-xs sm:text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 shrink-0" />
          UI Preview · Isolated mock data. Superadmin only. Nothing is saved.
        </div>

        {/* Header */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-4 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="sm" className="rounded-full">
                <Link to={`/tutor/classes/${classId}/preview`}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back to class
                </Link>
              </Button>
              <Badge variant="outline" className="rounded-full ml-auto">
                {settings.status === "draft" ? "Draft" : "Published"}
              </Badge>
            </div>
            <div>
              <Label htmlFor="quiz-title" className="text-xs text-slate-500">Quiz title</Label>
              <Input
                id="quiz-title"
                value={settings.title}
                onChange={(e) => setSetting("title", e.target.value)}
                placeholder="Untitled quiz"
                className="mt-1 text-lg font-semibold border-0 border-b border-slate-200 rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => attemptAction("save")}>
                <Save className="w-4 h-4 mr-2" /> Save Draft
              </Button>
              <Button variant="outline" className="rounded-full" onClick={() => attemptAction("preview")}>
                <Eye className="w-4 h-4 mr-2" /> Preview
              </Button>
              <Button
                className="rounded-full"
                onClick={() => attemptAction("publish")}
                disabled={quizEmpty || issues.length > 0}
              >
                <Send className="w-4 h-4 mr-2" /> Publish
              </Button>
            </div>
          </div>
        </div>

        {/* Validation summary */}
        {showIssues && (quizEmpty || issues.length > 0) && (
          <Card className="rounded-3xl border-amber-200 bg-amber-50 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-amber-900">
                  {quizEmpty ? "This quiz has no questions yet" : `Fix ${issues.length} question${issues.length > 1 ? "s" : ""} before publishing`}
                </p>
                {!quizEmpty && (
                  <ul className="mt-2 space-y-1 text-amber-900/90">
                    {issues.map((i) => (
                      <li key={i.id}>
                        <span className="font-medium">Question {i.index + 1}:</span> {i.reasons.join(" · ")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Settings */}
        <Card className="rounded-3xl border-slate-200 shadow-sm p-5 sm:p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Quiz Settings</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="desc" className="text-xs text-slate-500">Description</Label>
              <Textarea
                id="desc"
                value={settings.description}
                onChange={(e) => setSetting("description", e.target.value)}
                className="mt-1 rounded-2xl"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Assigned class</Label>
              <Select value={settings.classId} onValueChange={(v) => setSetting("classId", v)}>
                <SelectTrigger className="mt-1 rounded-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mock-1">{settings.className}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="attempts" className="text-xs text-slate-500">Attempt limit</Label>
              <Input id="attempts" type="number" min={1} value={settings.attemptLimit}
                onChange={(e) => setSetting("attemptLimit", Number(e.target.value))}
                className="mt-1 rounded-full" />
            </div>
            <div>
              <Label htmlFor="pass" className="text-xs text-slate-500">Passing score (%)</Label>
              <Input id="pass" type="number" min={0} max={100} value={settings.passingScore}
                onChange={(e) => setSetting("passingScore", Number(e.target.value))}
                className="mt-1 rounded-full" />
            </div>
            <div>
              <Label htmlFor="dur" className="text-xs text-slate-500">Time limit (minutes)</Label>
              <Input id="dur" type="number" min={1} value={settings.timeLimitMinutes}
                disabled={!settings.timeLimitEnabled}
                onChange={(e) => setSetting("timeLimitMinutes", Number(e.target.value))}
                className="mt-1 rounded-full" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ToggleRow label="Enforce time limit" checked={settings.timeLimitEnabled}
              onChange={(v) => setSetting("timeLimitEnabled", v)} />
            <ToggleRow label="Shuffle questions" checked={settings.shuffleQuestions}
              onChange={(v) => setSetting("shuffleQuestions", v)} />
            <ToggleRow label="Shuffle options" checked={settings.shuffleOptions}
              onChange={(v) => setSetting("shuffleOptions", v)} />
            <ToggleRow label="Show score immediately" checked={settings.showScoreImmediately}
              onChange={(v) => setSetting("showScoreImmediately", v)} />
            <ToggleRow label="Show correct answers after submission" checked={settings.showCorrectAfterSubmit}
              onChange={(v) => setSetting("showCorrectAfterSubmit", v)} />
          </div>
        </Card>

        {/* Questions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">
              Questions <span className="text-slate-400 font-normal">({questions.length})</span>
            </h3>
          </div>

          {questions.length === 0 && (
            <Card className="rounded-3xl border-dashed border-slate-200 bg-white/60 p-10 text-center">
              <HelpCircle className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700 mt-3">No questions yet</p>
              <p className="text-sm text-slate-500">Add your first question to build this quiz.</p>
            </Card>
          )}

          {questions.map((q, i) => {
            const qIssue = issues.find((x) => x.id === q.id);
            const hasIssue = showIssues && qIssue;
            return (
              <Collapsible
                key={q.id}
                open={expanded[q.id] ?? true}
                onOpenChange={(o) => setExpanded((e) => ({ ...e, [q.id]: o }))}
              >
                <Card className={`rounded-3xl shadow-sm p-4 sm:p-5 border ${hasIssue ? "border-amber-300" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="rounded-full">Q{i + 1}</Badge>
                    <Badge variant="outline" className="rounded-full text-xs">
                      {q.type === "mcq" ? "Multiple choice" : "True / False"}
                    </Badge>
                    <div className="ml-auto flex items-center gap-1 flex-wrap">
                      <IconBtn label="Move up" onClick={() => move(q.id, -1)} disabled={i === 0}>
                        <ChevronUp className="w-4 h-4" />
                      </IconBtn>
                      <IconBtn label="Move down" onClick={() => move(q.id, 1)} disabled={i === questions.length - 1}>
                        <ChevronDown className="w-4 h-4" />
                      </IconBtn>
                      <IconBtn label="Duplicate question" onClick={() => duplicateQuestion(q.id)}>
                        <Copy className="w-4 h-4" />
                      </IconBtn>
                      <IconBtn label="Delete question" onClick={() => deleteQuestion(q.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </IconBtn>
                      <CollapsibleTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="Toggle question" className="rounded-full">
                          <ChevronsUpDown className="w-4 h-4" />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>

                  {hasIssue && (
                    <p className="mt-2 text-xs text-amber-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> {qIssue!.reasons.join(" · ")}
                    </p>
                  )}

                  <CollapsibleContent className="mt-4 space-y-4">
                    <div>
                      <Label className="text-xs text-slate-500">Question text</Label>
                      <Textarea
                        value={q.text}
                        onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                        placeholder="Type your question…"
                        className="mt-1 rounded-2xl"
                        rows={2}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs text-slate-500">Points</Label>
                        <Input type="number" min={1} value={q.points}
                          onChange={(e) => updateQuestion(q.id, { points: Number(e.target.value) })}
                          className="mt-1 rounded-full" />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-slate-500">Options</Label>
                      <RadioGroup
                        value={q.options.find((o) => o.isCorrect)?.id ?? ""}
                        onValueChange={(v) => setCorrect(q.id, v)}
                        className="mt-2 space-y-2"
                      >
                        {q.options.map((o, oi) => (
                          <div key={o.id} className="flex items-center gap-2">
                            <RadioGroupItem value={o.id} id={o.id} aria-label={`Mark option ${oi + 1} correct`} />
                            <Input
                              value={o.text}
                              onChange={(e) => updateOptionText(q.id, o.id, e.target.value)}
                              disabled={q.type === "true_false"}
                              placeholder={q.type === "true_false" ? o.text : `Option ${oi + 1}`}
                              className="rounded-full flex-1"
                            />
                            {q.type === "mcq" && q.options.length > 2 && (
                              <IconBtn label="Remove option" onClick={() => removeOption(q.id, o.id)}>
                                <Trash2 className="w-4 h-4 text-slate-400" />
                              </IconBtn>
                            )}
                          </div>
                        ))}
                      </RadioGroup>
                      {q.type === "mcq" && (
                        <Button variant="ghost" size="sm" className="mt-2 rounded-full text-primary" onClick={() => addOption(q.id)}>
                          <Plus className="w-4 h-4 mr-1" /> Add option
                        </Button>
                      )}
                      <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Select the radio to mark the correct answer.
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs text-slate-500">Explanation (optional)</Label>
                      <Textarea
                        value={q.explanation ?? ""}
                        onChange={(e) => updateQuestion(q.id, { explanation: e.target.value })}
                        placeholder="Shown after submission when review is enabled."
                        className="mt-1 rounded-2xl"
                        rows={2}
                      />
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      </div>

      {/* Bottom add bar (mobile-safe) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3 sm:p-4 z-30">
        <div className="max-w-5xl mx-auto flex flex-wrap gap-2 justify-center sm:justify-start">
          <Button className="rounded-full" onClick={() => addQuestion("mcq")}>
            <Plus className="w-4 h-4 mr-2" /> Multiple choice
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => addQuestion("true_false")}>
            <ToggleLeft className="w-4 h-4 mr-2" /> True / False
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
      <Label className="text-sm text-slate-700">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function IconBtn({
  label, onClick, disabled, children,
}: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button size="icon" variant="ghost" aria-label={label} onClick={onClick} disabled={disabled} className="rounded-full">
      {children}
    </Button>
  );
}
