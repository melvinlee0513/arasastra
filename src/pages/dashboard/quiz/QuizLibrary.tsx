import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, CheckCircle2, Clock, HelpCircle, Lock, Play, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { QUIZ_ART, quizSubjectArt } from "@/lib/quizArt";
import { formatDateTime, formatDuration } from "@/lib/quizzes";
import {
  quizAvailability,
  useQuizFeedGroups,
  useStudentQuizFeed,
  type StudentQuizFeedRow,
} from "@/lib/studentQuizzes";
import {
  QuizArt,
  QuizEmptyState,
  QuizMetaPill,
  QuizRow,
  QuizSectionHeader,
} from "@/components/quiz/QuizChrome";
import { cn } from "@/lib/utils";
import { useStartQuiz } from "./useStartQuiz";

type Tab = "all" | "ready" | "played" | "upcoming" | "locked";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "played", label: "Played" },
  { key: "upcoming", label: "Upcoming" },
  { key: "locked", label: "Closed" },
];

/**
 * Student Quiz Library — searchable, filterable view of every quiz the student
 * may access. Same server-enforced data contract as the Quiz Hub.
 */
export function QuizLibrary() {
  const { data, isLoading, isError, refetch, isFetching } = useStudentQuizFeed();
  const groups = useQuizFeedGroups(data?.rows);
  const { start, startingId } = useStartQuiz();
  const [tab, setTab] = useState<Tab>("all");
  const [term, setTerm] = useState("");

  const rows = useMemo<StudentQuizFeedRow[]>(() => {
    const base =
      tab === "ready"
        ? [...groups.inProgress, ...groups.fresh]
        : tab === "played"
        ? groups.played
        : tab === "upcoming"
        ? groups.upcoming
        : tab === "locked"
        ? groups.locked
        : data?.rows ?? [];

    const q = term.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      [r.title, r.class_title, r.subject_name]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [tab, term, groups, data?.rows]);

  const counts: Record<Tab, number> = {
    all: data?.rows.length ?? 0,
    ready: groups.inProgress.length + groups.fresh.length,
    played: groups.played.length,
    upcoming: groups.upcoming.length,
    locked: groups.locked.length,
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 pb-10 pt-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="rounded-full text-slate-600">
          <Link to="/dashboard/quizzes">
            <ArrowLeft className="mr-1 h-4 w-4" /> Quiz Arena
          </Link>
        </Button>
      </div>

      <header className="flex items-center gap-3">
        <QuizArt
          src={QUIZ_ART.crystalGem}
          className="h-10 w-10 drop-shadow-[0_8px_16px_rgba(15,23,42,0.18)]"
        />
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold text-slate-900 sm:text-3xl">Quiz Library</h1>
          <p className="truncate text-[13px] text-slate-500">
            Every quiz from your enrolled classes, in one place.
          </p>
        </div>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search quizzes, subjects or classes"
          aria-label="Search quizzes"
          className="min-h-[48px] rounded-full border-slate-200 bg-white pl-11 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
        />
      </div>

      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={tab === t.key}
              className={cn(
                "min-h-[40px] shrink-0 rounded-full px-4 text-[13px] font-bold transition-colors",
                tab === t.key
                  ? "bg-quiz-accent text-white shadow-[0_10px_24px_-14px_hsl(var(--quiz-accent))]"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200",
              )}
            >
              {t.label}
              <span className="ml-1.5 opacity-70">{counts[t.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-3xl" />
          ))}
        </div>
      ) : isError ? (
        <QuizEmptyState
          art={QUIZ_ART.hourglass}
          title="Couldn't load the library"
          description="Something interrupted the connection. Please try again in a moment."
          action={
            <Button onClick={() => refetch()} disabled={isFetching} className="min-h-[44px] rounded-full px-6">
              Try again
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <QuizEmptyState
          art={term ? QUIZ_ART.owlGamingCompact : QUIZ_ART.owlGaming}
          title={term ? "No matching quizzes" : "Nothing in this filter yet"}
          description={
            term
              ? "Try a different quiz title, subject or class name."
              : "Switch filters, or check back once your tutor publishes more quizzes."
          }
        />
      ) : (
        <section className="space-y-2.5">
          <QuizSectionHeader
            title={`${rows.length} quiz${rows.length === 1 ? "" : "zes"}`}
            subtitle={tab === "all" ? "Sorted by class activity" : undefined}
          />
          {rows.map((row) => (
            <LibraryRow
              key={`${row.class_id}-${row.id}`}
              row={row}
              onStart={start}
              isStarting={startingId === row.id}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function LibraryRow({
  row,
  onStart,
  isStarting,
}: {
  row: StudentQuizFeedRow;
  onStart: (row: StudentQuizFeedRow) => void;
  isStarting: boolean;
}) {
  const state = quizAvailability(row);
  const subtitle =
    [row.subject_name, row.class_title].filter(Boolean).join(" · ") || null;

  const meta = (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <QuizMetaPill icon={<HelpCircle className="h-3 w-3" />}>
        {row.question_count}
      </QuizMetaPill>
      {row.time_limit_seconds && (
        <QuizMetaPill icon={<Clock className="h-3 w-3" />}>
          {formatDuration(row.time_limit_seconds)}
        </QuizMetaPill>
      )}
      {row.due_at && (
        <QuizMetaPill icon={<Calendar className="h-3 w-3" />} tone="warn">
          Due {formatDateTime(row.due_at)}
        </QuizMetaPill>
      )}
    </div>
  );

  const art = quizSubjectArt(row.subject_key, row.id);

  if (state.kind === "in_progress") {
    return (
      <QuizRow
        art={art}
        title={row.title}
        subtitle={subtitle}
        to={`/dashboard/classes/${row.class_id}/quizzes/${row.id}/attempt/${state.attemptId}`}
        right={
          <span className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-quiz-accent px-4 text-[13px] font-bold text-white">
            <RotateCcw className="h-3.5 w-3.5" /> Resume
          </span>
        }
      />
    );
  }

  if (state.kind === "available") {
    return (
      <div className="rounded-3xl border border-slate-200/80 bg-white p-3.5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex items-start gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-quiz-tint">
            <QuizArt src={art} className="h-10 w-10 drop-shadow-[0_6px_12px_rgba(15,23,42,0.16)]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold text-slate-900">{row.title}</p>
            {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{subtitle}</p>}
            {meta}
          </div>
        </div>
        <Button
          onClick={() => onStart(row)}
          disabled={isStarting}
          className="mt-3 min-h-[44px] w-full rounded-full bg-quiz-accent text-white hover:bg-quiz-accent-strong sm:w-auto sm:px-7"
        >
          <Play className="mr-1.5 h-4 w-4" />
          {isStarting ? "Starting…" : row.attempts_used > 0 ? "Play again" : "Start quiz"}
        </Button>
      </div>
    );
  }

  if (state.kind === "submitted") {
    return (
      <QuizRow
        art={QUIZ_ART.completionCheck}
        title={row.title}
        subtitle={subtitle}
        to={
          state.attemptId
            ? `/dashboard/classes/${row.class_id}/quizzes/${row.id}/results/${state.attemptId}`
            : `/dashboard/classes/${row.class_id}/quizzes`
        }
        right={
          <QuizMetaPill tone="good" icon={<CheckCircle2 className="h-3 w-3" />}>
            {state.attemptId ? "Result" : "Submitted"}
          </QuizMetaPill>
        }
      />
    );
  }

  return (
    <QuizRow
      art={state.kind === "upcoming" ? QUIZ_ART.hourglass : QUIZ_ART.planet}
      title={row.title}
      subtitle={
        state.kind === "upcoming"
          ? `Opens ${formatDateTime(state.availableFrom)}`
          : state.kind === "exhausted"
          ? "All attempts used"
          : "Closed"
      }
      disabled
      right={<QuizMetaPill icon={<Lock className="h-3 w-3" />}>Locked</QuizMetaPill>}
    />
  );
}

export default QuizLibrary;
