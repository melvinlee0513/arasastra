/**
 * Host a live quiz — setup (tutor / admin, light mode).
 *
 * Only controls the session model actually stores. The reference design's
 * Music, Power-ups and Theme rows are shown as an explicitly disabled
 * "Coming later" group rather than as working toggles, and Mastery mode is
 * disabled for the same reason: neither has any backend behind it.
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Crown, Gamepad2, Loader2, Lock, Minus, Plus, Shuffle, Timer, Trophy, Users,
} from "lucide-react";
import { ClassShell } from "@/components/class/ClassShell";
import { TenantEmptyState } from "@/components/common/TenantGate";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useClassContext } from "@/hooks/useClassContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import {
  listClassQuizzesForManager, quizManagerKeys, type QuizManagerRow,
} from "@/lib/quizzes";
import { createLiveQuizSession, mapLiveQuizError } from "@/lib/liveQuiz";
import {
  BuilderArt, BuilderCard, BuilderPill, BuilderSection, BuilderToggleRow,
} from "@/components/quiz/builder/QuizBuilderChrome";

type Variant = "tutor" | "admin";

const SECONDS_CHOICES = [10, 20, 30, 45, 60];

export function HostLiveQuizSetup({ variant }: { variant: Variant }) {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const { toast } = useToast();

  const basePath = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;
  const canManage = !!ctx.data?.canManage;

  const [quizId, setQuizId] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(30);
  const [showNames, setShowNames] = useState(true);
  const [randomize, setRandomize] = useState(false);
  const [seconds, setSeconds] = useState(20);

  const listQ = useQuery({
    queryKey: quizManagerKeys.list(currentTenantId, classId ?? ""),
    enabled: !!classId && !!user && canManage,
    queryFn: () => listClassQuizzesForManager(classId!),
    staleTime: 15_000,
  });

  // Only a published quiz can be hosted — the RPC enforces this too.
  const hostable = useMemo(
    () => (listQ.data ?? []).filter((r) => r.status === "published" && r.question_count > 0),
    [listQ.data],
  );
  const chosen: QuizManagerRow | null = useMemo(
    () => hostable.find((r) => r.id === quizId) ?? null,
    [hostable, quizId],
  );

  const createMut = useMutation({
    mutationFn: () =>
      createLiveQuizSession({
        quizId: quizId!,
        maxPlayers,
        showPlayerNames: showNames,
        secondsPerQuestion: seconds,
        randomize,
      }),
    onSuccess: (res) => navigate(`${basePath}/live/${res.id}`),
    onError: (err) =>
      toast({ title: "Couldn't start hosting", description: mapLiveQuizError(err), variant: "destructive" }),
  });

  const breadcrumbs = [
    { label: variant === "admin" ? "Admin" : "Tutor", to: variant === "admin" ? "/admin" : "/tutor" },
    { label: "Classes", to: variant === "admin" ? "/admin/curriculum" : "/tutor/classes" },
    { label: ctx.data?.klass?.title ?? "Class", to: basePath },
    { label: "Host live quiz" },
  ];

  return (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role={variant}
      section="quizzes"
      basePath={basePath}
      materialsPath={`${basePath}/resources`}
      breadcrumbs={breadcrumbs}
    >
      {!canManage && !ctx.isLoading ? (
        <TenantEmptyState title="Not available" body="You don't have permission to host quizzes for this class." />
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-4 pb-[calc(env(safe-area-inset-bottom)+108px)]">
          <BuilderCard tone="accent">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-[17px] font-extrabold leading-tight text-slate-900">Host a live quiz</h1>
                <p className="mt-1 text-[13px] leading-snug text-slate-600">
                  Students join with a game code and answer together in real time.
                </p>
              </div>
              <BuilderArt src={QUIZ_ART.controllerIcon} className="h-16 w-16 shrink-0" />
            </div>
          </BuilderCard>

          {/* 1 — Quiz */}
          <BuilderSection
            title="Chosen quiz"
            description="Only published quizzes with questions can be hosted."
            icon={<Trophy className="h-5 w-5" />}
          >
            {listQ.isLoading ? (
              <p className="text-[13px] text-slate-500">Loading quizzes…</p>
            ) : hostable.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-center">
                <p className="text-[13.5px] font-semibold text-slate-700">No hostable quizzes yet</p>
                <p className="mt-1 text-[12.5px] text-slate-500">
                  Publish a quiz with at least one multiple-choice or true/false question first.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {hostable.map((r) => {
                  const selected = r.id === quizId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setQuizId(r.id)}
                      aria-pressed={selected}
                      className={cn(
                        "flex min-h-[56px] w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99]",
                        selected ? "border-quiz-accent/50 bg-quiz-tint" : "border-slate-200 bg-white",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                          selected ? "border-quiz-accent" : "border-slate-300",
                        )}
                      >
                        {selected && <span className="h-2.5 w-2.5 rounded-full bg-quiz-accent" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-bold text-slate-900">{r.title}</span>
                        <span className="mt-0.5 block text-[12px] text-slate-500">
                          {r.question_count} question{r.question_count === 1 ? "" : "s"} · {r.total_points} pts
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </BuilderSection>

          {/* 2 — Game mode */}
          <BuilderSection
            title="Game mode"
            description="How players compete."
            icon={<Gamepad2 className="h-5 w-5" />}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-quiz-accent/50 bg-quiz-tint p-3.5">
                <div className="flex items-center gap-2">
                  <BuilderArt src={QUIZ_ART.trophyPodium} className="h-9 w-9" />
                  <p className="text-[14.5px] font-bold text-slate-900">Classic</p>
                  <BuilderPill tone="accent">Selected</BuilderPill>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-slate-600">
                  Points for correct answers, with a bonus for answering quickly.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 opacity-70">
                <div className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-slate-400" />
                  <p className="text-[14.5px] font-bold text-slate-500">Mastery</p>
                  <BuilderPill tone="neutral">Coming later</BuilderPill>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-slate-500">
                  Accuracy-focused, untimed play. Not built yet.
                </p>
              </div>
            </div>
          </BuilderSection>

          {/* 3 — Session settings */}
          <BuilderSection
            title="Session settings"
            description="These are stored on the session."
            icon={<Users className="h-5 w-5" />}
          >
            <div className="divide-y divide-slate-100">
              <div className="flex min-h-[56px] items-center gap-3 py-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-quiz-tint text-quiz-accent-strong">
                  <Users className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-slate-900">Max players</span>
                  <span className="mt-0.5 block text-[12px] text-slate-500">Between 1 and 200.</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Fewer players"
                    onClick={() => setMaxPlayers((n) => Math.max(1, n - 5))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white active:scale-95"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-[15px] font-bold tabular-nums text-slate-900">
                    {maxPlayers}
                  </span>
                  <button
                    type="button"
                    aria-label="More players"
                    onClick={() => setMaxPlayers((n) => Math.min(200, n + 5))}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </span>
              </div>

              <BuilderToggleRow
                icon={<Users className="h-4 w-4" />}
                title="Show player names"
                description="Display real names on the leaderboard."
                checked={showNames}
                onCheckedChange={setShowNames}
              />
              <BuilderToggleRow
                icon={<Shuffle className="h-4 w-4" />}
                title="Randomise question order"
                description="Shuffle the order once, for the whole session."
                checked={randomize}
                onCheckedChange={setRandomize}
              />
            </div>

            <div className="mt-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                <Timer className="h-4 w-4" /> Seconds per question
              </p>
              <div className="flex flex-wrap gap-2">
                {SECONDS_CHOICES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeconds(s)}
                    aria-pressed={seconds === s}
                    className={cn(
                      "min-h-[44px] min-w-[64px] rounded-full border px-4 text-[14px] font-bold transition active:scale-95",
                      seconds === s
                        ? "border-quiz-accent bg-quiz-accent text-white"
                        : "border-slate-200 bg-white text-slate-700",
                    )}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>
          </BuilderSection>

          {/* 4 — Quiz summary. Every figure comes from the chosen quiz or the
              settings above; nothing here is invented, and the block only
              appears once there is a quiz to summarise. */}
          {chosen && (
            <BuilderSection
              title="Quiz summary"
              description="What you're about to host."
              icon={<Gamepad2 className="h-5 w-5" />}
            >
              <dl className="grid grid-cols-2 gap-2">
                {[
                  { k: "Quiz", v: chosen.title },
                  { k: "Questions", v: `${chosen.question_count}` },
                  { k: "Total points", v: chosen.total_points.toLocaleString() },
                  {
                    k: "Estimated time",
                    v: `${Math.max(1, Math.round((chosen.question_count * seconds) / 60))} min`,
                  },
                  { k: "Max players", v: `${maxPlayers}` },
                  { k: "Per question", v: `${seconds}s` },
                ].map((x) => (
                  <div key={x.k} className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <dt className="text-[11.5px] font-semibold text-slate-500">{x.k}</dt>
                    <dd className="mt-0.5 truncate text-[14.5px] font-bold text-slate-900">
                      {x.v}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2.5 text-[12px] leading-snug text-slate-500">
                Estimated time counts question windows only — it doesn't include the time you
                spend on the reveal and leaderboard between questions.
              </p>
            </BuilderSection>
          )}

          {/* Honest about what isn't built */}
          <BuilderCard>
            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-slate-700">Not available yet</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">
                  Background music, sound effects, power-ups, memes and quiz themes have no backend
                  support, so they aren't offered here rather than shown as switches that do nothing.
                </p>
              </div>
            </div>
          </BuilderCard>

          {/* Sticky CTA */}
          <div className="sticky bottom-0 z-40 -mx-4 border-t border-slate-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="mx-auto flex max-w-3xl items-center gap-2">
              <Button
                variant="outline"
                className="h-12 shrink-0 rounded-full px-4"
                onClick={() => navigate(`${basePath}/quizzes`)}
              >
                Cancel
              </Button>
              <Button
                className="h-12 flex-1 rounded-full bg-quiz-accent text-[15px] font-extrabold text-white"
                disabled={!chosen || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create session &amp; start hosting
              </Button>
            </div>
          </div>
        </div>
      )}
    </ClassShell>
  );
}

export default HostLiveQuizSetup;
