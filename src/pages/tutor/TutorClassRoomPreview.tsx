import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ChevronRight, Home, GraduationCap, Video, FileText, HelpCircle,
  Users, BarChart3, Sparkles, Plus, Megaphone, Layers, ClipboardList,
  Clock, BookOpen, Calendar, MoreHorizontal, CheckCircle2, PenSquare,
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
    schedule: "Saturdays · 10:00 – 11:30 AM",
    nextSession: "Sat, 18 Jul · 10:00 AM",
    enrolled: 24,
  },
  recent: [
    { id: "r1", kind: "replay", title: "Cell Structure Recap", status: "published", when: "Yesterday" },
    { id: "r2", kind: "note", title: "Chapter 3 — Plant Transport", status: "published", when: "2d ago" },
    { id: "r3", kind: "worksheet", title: "Worksheet 3.1 — Xylem & Phloem", status: "draft", when: "3d ago" },
    { id: "r4", kind: "quiz", title: "Quick Quiz: Osmosis Basics", status: "published", when: "5d ago" },
    { id: "r5", kind: "flashcards", title: "Cell Organelles Deck", status: "draft", when: "1w ago" },
  ],
  resources: [
    { id: "res1", title: "Cell Structure Recap", type: "video", status: "published" },
    { id: "res2", title: "Chapter 3 — Plant Transport", type: "note", status: "published" },
    { id: "res3", title: "Worksheet 3.1", type: "worksheet", status: "draft" },
  ],
  assessments: [
    { id: "a1", title: "Chapter 3 Mastery Check", type: "quiz", questions: 10, status: "published", attempts: 12 },
    { id: "a2", title: "Osmosis Basics Quick Quiz", type: "quiz", questions: 5, status: "published", attempts: 22 },
    { id: "a3", title: "Cell Organelles Deck", type: "flashcards", cards: 24, status: "draft", attempts: 0 },
  ],
  students: [
    { id: "s1", name: "Aiman Zulkifli", progress: 84, lastActive: "2h ago", status: "active" },
    { id: "s2", name: "Nur Farah", progress: 71, lastActive: "1d ago", status: "active" },
    { id: "s3", name: "Kai Wei", progress: 42, lastActive: "5d ago", status: "at_risk" },
    { id: "s4", name: "Meera Devi", progress: 90, lastActive: "3h ago", status: "active" },
  ],
  engagement: {
    activeThisWeek: 21,
    submissions: 46,
    avgQuizScore: 78,
    atRisk: 3,
  },
};

const TABS = [
  { value: "overview", label: "Overview", icon: Sparkles, flag: null },
  { value: "resources", label: "Resources", icon: FileText, flag: null },
  { value: "assessments", label: "Assessments", icon: HelpCircle, flag: null },
  { value: "students", label: "Students", icon: Users, flag: null },
  { value: "analytics", label: "Analytics", icon: BarChart3, flag: null },
];

export default function TutorClassRoomPreview() {
  const { classId } = useParams();
  const [tab, setTab] = useState("overview");
  const flashcardsOn = useFeatureEnabled("flashcards");
  const replaysOn = useFeatureEnabled("videoReplays");

  const quickActions = useMemo(
    () =>
      [
        { label: "Add Material", icon: Plus, tone: "primary" as const, show: true },
        { label: "Create Quiz", icon: HelpCircle, tone: "default" as const, show: true },
        { label: "Create Flashcards", icon: Layers, tone: "default" as const, show: flashcardsOn },
        { label: "Post Announcement", icon: Megaphone, tone: "default" as const, show: true },
      ].filter((a) => a.show),
    [flashcardsOn],
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
          <Link to="/tutor" className="inline-flex items-center gap-1 hover:text-primary">
            <Home className="w-3.5 h-3.5" /> Tutor
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/tutor/classes" className="hover:text-primary">My Classes</Link>
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
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/15">
                  <BookOpen className="w-3 h-3 mr-1" /> {k.subject}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  <Clock className="w-3 h-3 mr-1" /> {k.schedule}
                </Badge>
                <Badge variant="outline" className="rounded-full">
                  <Users className="w-3 h-3 mr-1" /> {k.enrolled} students
                </Badge>
                <Badge variant="secondary" className="rounded-full">
                  <Calendar className="w-3 h-3 mr-1" /> Next: {k.nextSession}
                </Badge>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {quickActions.map((a) => (
              <Button
                key={a.label}
                variant={a.tone === "primary" ? "default" : "outline"}
                className="rounded-full h-11 justify-center"
              >
                <a.icon className="w-4 h-4 mr-2" /> {a.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <div className="overflow-x-auto -mx-1 px-1">
            <TabsList className="bg-white border border-slate-200 rounded-full p-1 h-auto shadow-sm flex-nowrap w-max">
              {TABS.map((t) => (
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
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <StatCard label="Active this week" value={MOCK.engagement.activeThisWeek} sub={`of ${k.enrolled}`} />
              <StatCard label="Submissions" value={MOCK.engagement.submissions} sub="last 7 days" />
              <StatCard label="Avg quiz score" value={`${MOCK.engagement.avgQuizScore}%`} sub="all quizzes" />
              <StatCard label="At risk" value={MOCK.engagement.atRisk} sub="need follow-up" tone="warn" />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">Recent Content</h3>
                  <Button variant="ghost" size="sm" className="text-primary">Manage</Button>
                </div>
                <ul className="divide-y divide-slate-100">
                  {MOCK.recent
                    .filter((it) => (it.kind === "replay" ? replaysOn : true))
                    .filter((it) => (it.kind === "flashcards" ? flashcardsOn : true))
                    .map((item) => (
                      <li key={item.id} className="py-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                          {item.kind === "replay" && <Video className="w-4 h-4" />}
                          {item.kind === "note" && <FileText className="w-4 h-4" />}
                          {item.kind === "worksheet" && <ClipboardList className="w-4 h-4" />}
                          {item.kind === "quiz" && <HelpCircle className="w-4 h-4" />}
                          {item.kind === "flashcards" && <Layers className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">{item.title}</p>
                          <p className="text-xs text-slate-500 capitalize">{item.kind} · {item.when}</p>
                        </div>
                        <StatusBadge status={item.status} />
                        <Button variant="ghost" size="icon" className="text-slate-400">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </li>
                    ))}
                </ul>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student Engagement</p>
                <div className="mt-4 space-y-3">
                  <EngagementRow label="Watched replays" value={72} />
                  <EngagementRow label="Read notes" value={54} />
                  <EngagementRow label="Attempted quizzes" value={63} />
                  <EngagementRow label="On-time submissions" value={81} />
                </div>
                <p className="text-xs text-slate-500 mt-4">Snapshot for the last 7 days.</p>
              </div>
            </div>
          </TabsContent>

          {/* Resources */}
          <TabsContent value="resources" className="mt-5">
            <ContentTable
              rows={MOCK.resources.map((r) => ({
                id: r.id,
                title: r.title,
                meta: r.type,
                status: r.status,
              }))}
              emptyLabel="No resources yet"
              emptyIcon={<FileText />}
            />
          </TabsContent>

          {/* Assessments */}
          <TabsContent value="assessments" className="mt-5">
            <ContentTable
              rows={MOCK.assessments
                .filter((a) => (a.type === "flashcards" ? flashcardsOn : true))
                .map((a) => ({
                  id: a.id,
                  title: a.title,
                  meta:
                    a.type === "quiz"
                      ? `${a.questions} questions · ${a.attempts} attempts`
                      : `${a.cards ?? 0} cards`,
                  status: a.status,
                }))}
              emptyLabel="No assessments yet"
              emptyIcon={<HelpCircle />}
            />
          </TabsContent>

          {/* Students */}
          <TabsContent value="students" className="mt-5">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <div className="col-span-5">Student</div>
                <div className="col-span-4">Progress</div>
                <div className="col-span-2">Last active</div>
                <div className="col-span-1 text-right">Status</div>
              </div>
              <ul className="divide-y divide-slate-100">
                {MOCK.students.map((s) => (
                  <li key={s.id} className="px-5 py-4 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-5 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {s.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                      </div>
                      <p className="font-medium text-slate-900 text-sm">{s.name}</p>
                    </div>
                    <div className="sm:col-span-4 flex items-center gap-3">
                      <Progress value={s.progress} className="h-2 flex-1" />
                      <span className="text-xs text-slate-500 w-8 text-right">{s.progress}%</span>
                    </div>
                    <div className="sm:col-span-2 text-xs text-slate-500">{s.lastActive}</div>
                    <div className="sm:col-span-1 sm:text-right">
                      {s.status === "at_risk" ? (
                        <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">At risk</Badge>
                      ) : (
                        <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Active
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          {/* Analytics */}
          <TabsContent value="analytics" className="mt-5">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total attempts" value={68} sub="all assessments" />
              <StatCard label="Avg completion" value="74%" sub="course progress" />
              <StatCard label="Median score" value="80%" sub="last 30 days" />
              <StatCard label="Retention" value="88%" sub="week over week" />
            </div>
            <div className="mt-5 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 text-center text-sm text-slate-500">
              <BarChart3 className="w-8 h-8 mx-auto text-slate-300" />
              <p className="mt-2 font-medium text-slate-700">Full analytics dashboard coming after data integration.</p>
              <p className="text-xs mt-1">Charts will render class-scoped engagement, quiz difficulty, and dropout risk.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, tone = "default",
}: { label: string; value: string | number; sub?: string; tone?: "default" | "warn" }) {
  return (
    <div className={`rounded-3xl border p-4 sm:p-5 shadow-sm ${tone === "warn" ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function EngagementRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">{value}%</span>
      </div>
      <Progress value={value} className="h-1.5 mt-1" />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Published</Badge>;
  }
  return (
    <Badge variant="outline" className="rounded-full">
      <PenSquare className="w-3 h-3 mr-1" /> Draft
    </Badge>
  );
}

function ContentTable({
  rows, emptyLabel, emptyIcon,
}: { rows: { id: string; title: string; meta: string; status: string }[]; emptyLabel: string; emptyIcon: React.ReactNode }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white/80 backdrop-blur-md border border-dashed border-slate-200 rounded-3xl py-14 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
          {emptyIcon}
        </div>
        <p className="mt-3 font-semibold text-slate-700">{emptyLabel}</p>
        <p className="text-sm text-slate-500">Create your first item to see it here.</p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="px-5 py-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 text-sm truncate">{r.title}</p>
              <p className="text-xs text-slate-500 capitalize">{r.meta}</p>
            </div>
            <StatusBadge status={r.status} />
            <Button variant="ghost" size="sm" className="text-primary">Edit</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
