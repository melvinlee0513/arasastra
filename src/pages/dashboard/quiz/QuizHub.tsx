import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Calendar, Clock, HelpCircle, Library, Lock, Play, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGamification } from "@/hooks/useGamification";
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
  QuizCarousel,
  QuizEmptyState,
  QuizFeatureCard,
  QuizMetaPill,
  QuizRow,
  QuizSectionHeader,
  QuizStatChip,
  QuizTile,
} from "@/components/quiz/QuizChrome";
import { useStartQuiz } from "./useStartQuiz";

/**
 * Student Quiz Hub — the gamified entry point for quiz discovery.
 *
 * All content is real: quizzes come from the student's active enrolments via
 * `list_student_class_quizzes` per class, XP/streak from the gamification
 * reader. No placeholder or demo rows are ever rendered.
 */
export function QuizHub() {
  const { data, isLoading, isError, refetch, isFetching } = useStudentQuizFeed();
  const groups = useQuizFeedGroups(data?.rows);
  const game = useGamification();
  const { start, startingId } = useStartQuiz();

  const featured = useMemo<StudentQuizFeedRow | null>(() => {
    if (groups.inProgress[0]) return groups.inProgress[0];
    if (groups.dueSoon[0]) return groups.dueSoon[0];
    if (groups.fresh[0]) return groups.fresh[0];
    if (groups.played[0]) return groups.played[0];
    return null;
  }, [groups]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-7 px-4 pb-10 pt-4 sm:px-6">
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <QuizArt
            src={QUIZ_ART.controllerIcon}
            className="h-11 w-11 drop-shadow-[0_8px_16px_rgba(15,23,42,0.18)]"
          />
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 text-[22px] font-extrabold text-slate-900 sm:text-3xl">
              Quiz Arena
              <Sparkles className="h-4 w-4 text-quiz-accent" />
            </h1>
            <p className="truncate text-[13px] text-slate-500">
              Play quizzes from your classes and climb the leaderboard.
            </p>
          </div>
        </div>

        {game.enabled && (
          <div className="flex gap-2">
            <QuizStatChip
              art={QUIZ_ART.streakFire}
              value={`${game.currentStreak}`}
              label={game.currentStreak === 1 ? "day streak" : "day streak"}
              tone="streak"
            />
            <QuizStatChip
              art={QUIZ_ART.xpGem}
              value={`${game.totalXp}`}
              label="total XP"
              tone="xp"
            />
            <QuizStatChip
              art={QUIZ_ART.levelStars}
              value={`Lv ${game.level}`}
              label={`${game.xpToNextLevel} XP to go`}
            />
          </div>
        )}
      </header>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-[28px]" />
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-28 rounded-3xl" />
        </div>
      ) : isError ? (
        <QuizEmptyState
          art={QUIZ_ART.hourglass}
          title="Couldn't load your quizzes"
          description="Something interrupted the connection. Your progress is safe — try again in a moment."
          action={
            <Button onClick={() => refetch()} disabled={isFetching} className="min-h-[44px] rounded-full px-6">
              Try again
            </Button>
          }
        />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <QuizEmptyState
          art={QUIZ_ART.owlGaming}
          title={data?.classCount ? "No quizzes published yet" : "Join a class to start playing"}
          description={
            data?.classCount
              ? "Your tutors haven't published quizzes for your classes yet. They'll appear here the moment they go live."
              : "Once you're enrolled in a class, its quizzes will show up in the arena."
          }
          action={
            <Button asChild variant="outline" className="min-h-[44px] rounded-full px-6">
              <Link to="/dashboard/classes">Go to My Classes</Link>
            </Button>
          }
        />
      ) : (
        <>
          {featured && <FeaturedQuiz row={featured} onStart={start} isStarting={startingId === featured.id} />}

          {groups.fresh.length > 0 && (
            <section>
              <QuizSectionHeader
                title="Ready to play"
                subtitle={`${groups.fresh.length} quiz${groups.fresh.length === 1 ? "" : "zes"} waiting for you`}
                action={
                  <Button asChild variant="ghost" size="sm" className="rounded-full text-quiz-accent-strong">
                    <Link to="/dashboard/quizzes/library">
                      <Library className="mr-1 h-4 w-4" /> Library
                    </Link>
                  </Button>
                }
              />
              <QuizCarousel>
                {groups.fresh.slice(0, 8).map((row) => (
                  <QuizTile
                    key={row.id}
                    art={quizSubjectArt(row.subject_key, row.id)}
                    title={row.title}
                    subtitle={row.subject_name ?? row.class_title}
                    meta={
                      <>
                        <QuizMetaPill icon={<HelpCircle className="h-3 w-3" />}>
                          {row.question_count}
                        </QuizMetaPill>
                        {row.time_limit_seconds && (
                          <QuizMetaPill icon={<Clock className="h-3 w-3" />}>
                            {formatDuration(row.time_limit_seconds)}
                          </QuizMetaPill>
                        )}
                      </>
                    }
                    onClick={() => start(row)}
                  />
                ))}
              </QuizCarousel>
            </section>
          )}

          {groups.inProgress.length > 0 && (
            <section className="space-y-2.5">
              <QuizSectionHeader title="Continue where you left off" />
              {groups.inProgress.map((row) => {
                const state = quizAvailability(row);
                return (
                  <QuizRow
                    key={row.id}
                    art={quizSubjectArt(row.subject_key, row.id)}
                    title={row.title}
                    subtitle={[row.subject_name, row.class_title].filter(Boolean).join(" · ") || null}
                    to={
                      state.kind === "in_progress"
                        ? `/dashboard/classes/${row.class_id}/quizzes/${row.id}/attempt/${state.attemptId}`
                        : undefined
                    }
                    right={
                      <span className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-quiz-accent px-4 text-[13px] font-bold text-white">
                        <RotateCcw className="h-3.5 w-3.5" /> Resume
                      </span>
                    }
                  />
                );
              })}
            </section>
          )}

          {groups.played.length > 0 && (
            <section className="space-y-2.5">
              <QuizSectionHeader title="Recently played" subtitle="Review your answers and try again" />
              {groups.played.slice(0, 5).map((row) => (
                <QuizRow
                  key={row.id}
                  art={QUIZ_ART.completionCheck}
                  title={row.title}
                  subtitle={`${row.attempts_used} of ${row.attempt_limit} attempt${row.attempt_limit === 1 ? "" : "s"} used${
                    row.subject_name ? ` · ${row.subject_name}` : ""
                  }`}
                  to={
                    row.latest_submitted_attempt_id
                      ? `/dashboard/classes/${row.class_id}/quizzes/${row.id}/results/${row.latest_submitted_attempt_id}`
                      : `/dashboard/classes/${row.class_id}/quizzes`
                  }
                  right={
                    <span className="text-[12.5px] font-semibold text-quiz-accent-strong">
                      {row.latest_submitted_attempt_id ? "View result" : "Open"}
                    </span>
                  }
                />
              ))}
            </section>
          )}

          {groups.upcoming.length > 0 && (
            <section className="space-y-2.5">
              <QuizSectionHeader title="Opening soon" />
              {groups.upcoming.slice(0, 4).map((row) => {
                const state = quizAvailability(row);
                return (
                  <QuizRow
                    key={row.id}
                    art={QUIZ_ART.hourglass}
                    title={row.title}
                    subtitle={
                      state.kind === "upcoming" ? `Opens ${formatDateTime(state.availableFrom)}` : null
                    }
                    disabled
                    right={
                      <QuizMetaPill icon={<Lock className="h-3 w-3" />}>Locked</QuizMetaPill>
                    }
                  />
                );
              })}
            </section>
          )}

          <div className="flex justify-center pt-1">
            <Button asChild variant="outline" className="min-h-[44px] rounded-full px-6">
              <Link to="/dashboard/quizzes/library">
                <Library className="mr-1.5 h-4 w-4" /> Browse the full quiz library
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function FeaturedQuiz({
  row,
  onStart,
  isStarting,
}: {
  row: StudentQuizFeedRow;
  onStart: (row: StudentQuizFeedRow) => void;
  isStarting: boolean;
}) {
  const state = quizAvailability(row);
  const meta = (
    <>
      <QuizMetaPill tone="light" icon={<HelpCircle className="h-3 w-3" />}>
        {row.question_count} question{row.question_count === 1 ? "" : "s"}
      </QuizMetaPill>
      {row.time_limit_seconds && (
        <QuizMetaPill tone="light" icon={<Clock className="h-3 w-3" />}>
          {formatDuration(row.time_limit_seconds)}
        </QuizMetaPill>
      )}
      {row.due_at && (
        <QuizMetaPill tone="light" icon={<Calendar className="h-3 w-3" />}>
          Due {formatDateTime(row.due_at)}
        </QuizMetaPill>
      )}
    </>
  );

  const eyebrow =
    state.kind === "in_progress"
      ? "Attempt in progress"
      : row.due_at
      ? "Next up · due soon"
      : "Featured challenge";

  if (state.kind === "in_progress") {
    return (
      <QuizFeatureCard
        eyebrow={eyebrow}
        title={row.title}
        meta={meta}
        art={QUIZ_ART.owlGamingStars}
        cta="Resume quiz"
        to={`/dashboard/classes/${row.class_id}/quizzes/${row.id}/attempt/${state.attemptId}`}
      />
    );
  }

  if (state.kind === "available") {
    return (
      <QuizFeatureCard
        eyebrow={eyebrow}
        title={row.title}
        meta={meta}
        art={QUIZ_ART.owlGamingStars}
        cta={isStarting ? "Starting…" : row.attempts_used > 0 ? "Play again" : "Start quiz"}
        onClick={() => onStart(row)}
        disabled={isStarting}
      />
    );
  }

  if (state.kind === "submitted" && state.attemptId) {
    return (
      <QuizFeatureCard
        eyebrow="Latest result"
        title={row.title}
        meta={meta}
        art={QUIZ_ART.trophyRibbon}
        cta="View result"
        to={`/dashboard/classes/${row.class_id}/quizzes/${row.id}/results/${state.attemptId}`}
      />
    );
  }

  return (
    <QuizFeatureCard
      eyebrow={state.kind === "upcoming" ? "Opening soon" : "Closed"}
      title={row.title}
      meta={meta}
      art={QUIZ_ART.hourglass}
      cta={state.kind === "upcoming" ? "Not open yet" : "Locked"}
      disabled
    />
  );
}

export default QuizHub;
