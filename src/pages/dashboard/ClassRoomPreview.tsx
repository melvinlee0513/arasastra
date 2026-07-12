import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ChevronRight, Home, GraduationCap, Video, FileText, HelpCircle,
  PlayCircle, Download, Layers, ClipboardList, Sparkles, Calendar,
  Clock, User, BookOpen, Megaphone, ArrowRight, CheckCircle2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useFeatureEnabled } from "@/hooks/useFeature";

// ---------- ISOLATED MOCK DATA (UI-only preview) ----------
const MOCK = {
  klass: {
    id: "mock-class-1",
    title: "Form 4 Biology — Weekend Cohort",
    subject: "Biology",
    cohort: "Weekend · 2026 Intake",
    tutor: { name: "Ms. Aisyah Rahman", avatar: null as string | null },
    schedule: "Saturdays · 10:00 – 11:30 AM",
    nextSession: "Sat, 18 Jul · 10:00 AM",
    enrolled: 24,
    description:
      "Structured SPM Biology coverage focused on Cell Biology, Physiology, and Ecology with weekly quizzes and worksheets.",
  },
  announcement: {
    author: "Ms. Aisyah Rahman",
    postedAt: "2 hours ago",
    title: "Bring your Chapter 3 worksheet on Saturday",
    body: "We'll be doing a live walkthrough of the plant transport system worksheet. Please attempt Q1–Q5 beforehand.",
  },
  continueLearning: {
    type: "replay" as const,
    title: "Chapter 2 · Cell Structure Recap",
    progress: 62,
    remaining: "18 min left",
  },
  recent: [
    { id: "r1", kind: "replay", title: "Cell Structure Recap", when: "Yesterday" },
    { id: "r2", kind: "note", title: "Chapter 3 — Plant Transport (PDF)", when: "2 days ago" },
    { id: "r3", kind: "worksheet", title: "Worksheet 3.1 — Xylem & Phloem", when: "3 days ago" },
    { id: "r4", kind: "quiz", title: "Quick Quiz: Osmosis Basics", when: "5 days ago" },
  ],
  upcomingQuiz: {
    id: "q-mock-1",
    title: "Chapter 3 Mastery Check",
    dueIn: "Due Saturday · 10 questions",
  },
  progress: {
    overall: 48,
    replaysWatched: 6,
    replaysTotal: 12,
    notesRead: 4,
    notesTotal: 9,
    quizzesDone: 3,
    quizzesTotal: 8,
    avgScore: 82,
  },
  replays: [
    { id: "v1", title: "Cell Structure Recap", duration: "34 min", published: "Yesterday" },
    { id: "v2", title: "Diffusion & Osmosis Live Class", duration: "1h 12m", published: "1 wk ago" },
    { id: "v3", title: "Enzyme Action Demo", duration: "22 min", published: "2 wk ago" },
  ],
  notes: [
    { id: "n1", title: "Chapter 3 — Plant Transport", pages: 14, size: "2.1 MB" },
    { id: "n2", title: "Chapter 2 — Cell Biology Summary", pages: 8, size: "1.4 MB" },
  ],
  worksheets: [
    { id: "w1", title: "Worksheet 3.1 — Xylem & Phloem", questions: 12, status: "not_started" },
    { id: "w2", title: "Worksheet 2.4 — Osmosis Practice", questions: 8, status: "submitted" },
  ],
  quizzes: [
    { id: "q1", title: "Chapter 3 Mastery Check", questions: 10, status: "not_started" },
    { id: "q2", title: "Osmosis Basics Quick Quiz", questions: 5, status: "completed", score: 90 },
  ],
  flashcards: [
    { id: "d1", title: "Cell Organelles", cards: 24, mastered: 10 },
    { id: "d2", title: "Enzyme Terms", cards: 18, mastered: 4 },
  ],
};

const TABS = [
  { value: "overview", label: "Overview", icon: Sparkles, flag: null },
  { value: "replays", label: "Replays", icon: Video, flag: "videoReplays" as const },
  { value: "notes", label: "Notes", icon: FileText, flag: null },
  { value: "worksheets", label: "Worksheets", icon: ClipboardList, flag: null },
  { value: "quizzes", label: "Quizzes", icon: HelpCircle, flag: null },
  { value: "flashcards", label: "Flashcards", icon: Layers, flag: "flashcards" as const },
];

export default function ClassRoomPreview() {
  const { classId } = useParams();
  const [tab, setTab] = useState("overview");
  const replaysOn = useFeatureEnabled("videoReplays");
  const flashcardsOn = useFeatureEnabled("flashcards");

  const visibleTabs = useMemo(
    () =>
      TABS.filter((t) => {
        if (t.flag === "videoReplays") return replaysOn;
        if (t.flag === "flashcards") return flashcardsOn;
        return true;
      }),
    [replaysOn, flashcardsOn],
  );

  const k = MOCK.klass;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Preview banner */}
        <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2.5 text-xs sm:text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>UI Preview · Isolated mock data. Not wired to backend. Class id: {classId}</span>
        </div>

        {/* Breadcrumbs */}
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Link to="/dashboard" className="inline-flex items-center gap-1 hover:text-primary">
            <Home className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/dashboard/classes" className="hover:text-primary">My Classes</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-slate-900 font-medium truncate max-w-[60vw]">{k.title}</span>
        </nav>

        {/* Header */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-5 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-start gap-5">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <GraduationCap className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{k.title}</h1>
              <p className="text-sm text-slate-500 mt-1">{k.cohort}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/15">
                  <BookOpen className="w-3 h-3 mr-1" /> {k.subject}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  <User className="w-3 h-3 mr-1" /> {k.tutor.name}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  <Clock className="w-3 h-3 mr-1" /> {k.schedule}
                </Badge>
                <Badge variant="secondary" className="rounded-full">
                  <Calendar className="w-3 h-3 mr-1" /> Next: {k.nextSession}
                </Badge>
              </div>
              <p className="text-sm text-slate-600 mt-4 leading-relaxed">{k.description}</p>
            </div>
          </div>
        </div>

        {/* Announcement + Continue Learning */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">Announcement · {MOCK.announcement.postedAt}</p>
                </div>
                <h3 className="font-semibold text-slate-900 mt-0.5">{MOCK.announcement.title}</h3>
                <p className="text-sm text-slate-600 mt-1.5">{MOCK.announcement.body}</p>
                <p className="text-xs text-slate-400 mt-3">— {MOCK.announcement.author}</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl border border-primary/20 p-5 sm:p-6 flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Continue Learning</p>
            <h3 className="font-semibold text-slate-900 mt-2 line-clamp-2">{MOCK.continueLearning.title}</h3>
            <Progress value={MOCK.continueLearning.progress} className="mt-3 h-2" />
            <p className="text-xs text-slate-500 mt-2">{MOCK.continueLearning.remaining}</p>
            <Button className="mt-4 rounded-full w-full" size="sm">
              <PlayCircle className="w-4 h-4 mr-2" /> Resume
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="bg-white border border-slate-200 rounded-full p-1 h-auto shadow-sm flex-nowrap w-max">
              {visibleTabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="rounded-full px-3.5 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
                >
                  <t.icon className="w-4 h-4 mr-1.5" /> {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Overview */}
          <TabsContent value="overview" className="mt-5 space-y-5">
            <div className="grid gap-5 lg:grid-cols-3">
              {/* Recent materials */}
              <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">Recently Published</h3>
                  <Button variant="ghost" size="sm" className="text-primary">
                    View all <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <ul className="divide-y divide-slate-100">
                  {MOCK.recent.map((item) => (
                    <li key={item.id} className="py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                        {item.kind === "replay" && <Video className="w-4 h-4" />}
                        {item.kind === "note" && <FileText className="w-4 h-4" />}
                        {item.kind === "worksheet" && <ClipboardList className="w-4 h-4" />}
                        {item.kind === "quiz" && <HelpCircle className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate">{item.title}</p>
                        <p className="text-xs text-slate-500 capitalize">{item.kind} · {item.when}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </li>
                  ))}
                </ul>
              </div>

              {/* Upcoming + progress */}
              <div className="space-y-5">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upcoming Quiz</p>
                  <h4 className="font-semibold text-slate-900 mt-2">{MOCK.upcomingQuiz.title}</h4>
                  <p className="text-xs text-slate-500 mt-1">{MOCK.upcomingQuiz.dueIn}</p>
                  <Button size="sm" className="rounded-full mt-4 w-full">Start Quiz</Button>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your Progress</p>
                  <div className="mt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-bold text-slate-900">{MOCK.progress.overall}%</span>
                      <span className="text-xs text-slate-500">Overall</span>
                    </div>
                    <Progress value={MOCK.progress.overall} className="h-2 mt-2" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                    <ProgressChip label="Replays" value={`${MOCK.progress.replaysWatched}/${MOCK.progress.replaysTotal}`} />
                    <ProgressChip label="Notes" value={`${MOCK.progress.notesRead}/${MOCK.progress.notesTotal}`} />
                    <ProgressChip label="Quizzes" value={`${MOCK.progress.quizzesDone}/${MOCK.progress.quizzesTotal}`} />
                  </div>
                  <p className="text-xs text-slate-500 mt-3">Avg quiz score: <span className="font-semibold text-slate-900">{MOCK.progress.avgScore}%</span></p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Replays */}
          <TabsContent value="replays" className="mt-5">
            {MOCK.replays.length === 0 ? (
              <PreviewEmpty icon={<Video />} label="No replays yet" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {MOCK.replays.map((v) => (
                  <div key={v.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="aspect-video bg-slate-900 flex items-center justify-center">
                      <PlayCircle className="w-10 h-10 text-white/80" />
                    </div>
                    <div className="p-4">
                      <h4 className="font-semibold text-slate-900 line-clamp-1">{v.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">{v.duration} · {v.published}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="mt-5">
            {MOCK.notes.length === 0 ? (
              <PreviewEmpty icon={<FileText />} label="No notes yet" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {MOCK.notes.map((n) => (
                  <div key={n.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 truncate">{n.title}</h4>
                      <p className="text-xs text-slate-500">{n.pages} pages · {n.size}</p>
                    </div>
                    <Download className="w-4 h-4 text-slate-400" />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Worksheets */}
          <TabsContent value="worksheets" className="mt-5">
            {MOCK.worksheets.length === 0 ? (
              <PreviewEmpty icon={<ClipboardList />} label="No worksheets yet" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {MOCK.worksheets.map((w) => (
                  <div key={w.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <ClipboardList className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">{w.title}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{w.questions} questions</p>
                      </div>
                      {w.status === "submitted" ? (
                        <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Submitted
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-full">Not started</Badge>
                      )}
                    </div>
                    <Button size="sm" className="rounded-full mt-4">Open</Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Quizzes */}
          <TabsContent value="quizzes" className="mt-5">
            {MOCK.quizzes.length === 0 ? (
              <PreviewEmpty icon={<HelpCircle />} label="No quizzes yet" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {MOCK.quizzes.map((q) => (
                  <div key={q.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <PlayCircle className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 truncate">{q.title}</h4>
                      <p className="text-xs text-slate-500">
                        {q.questions} questions
                        {q.status === "completed" && q.score != null ? ` · Scored ${q.score}%` : ""}
                      </p>
                    </div>
                    {q.status === "completed" ? (
                      <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Done</Badge>
                    ) : (
                      <Button size="sm" className="rounded-full">Start</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Flashcards */}
          {flashcardsOn && (
            <TabsContent value="flashcards" className="mt-5">
              {MOCK.flashcards.length === 0 ? (
                <PreviewEmpty icon={<Layers />} label="No flashcard decks yet" />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {MOCK.flashcards.map((d) => (
                    <div key={d.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                      <div className="w-11 h-11 rounded-2xl bg-purple-100 flex items-center justify-center">
                        <Layers className="w-5 h-5 text-purple-600" />
                      </div>
                      <h4 className="font-semibold text-slate-900 mt-3">{d.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{d.cards} cards · {d.mastered} mastered</p>
                      <Progress value={(d.mastered / d.cards) * 100} className="h-1.5 mt-3" />
                      <Button size="sm" className="rounded-full mt-4 w-full">Practice</Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

function ProgressChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-100 py-2">
      <p className="text-sm font-semibold text-slate-900">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function PreviewEmpty({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-white/80 backdrop-blur-md border border-dashed border-slate-200 rounded-3xl py-14 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
        {icon}
      </div>
      <p className="mt-3 font-semibold text-slate-700">{label}</p>
      <p className="text-sm text-slate-500">Your tutor hasn't published anything here yet.</p>
    </div>
  );
}
