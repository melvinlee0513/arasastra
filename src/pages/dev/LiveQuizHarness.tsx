/**
 * Live multiplayer QA harness — superadmin only, never linked from navigation.
 *
 * This drives the REAL RPCs and the REAL Realtime subscription. There is no
 * mock data anywhere in this file. It exists so a live session can be driven
 * and observed from actual browser sessions BEFORE `liveQuizMultiplayer` is
 * enabled for anyone, which is why it is gated on superadmin rather than on
 * the feature flag.
 *
 * Diagnostics deliberately expose only transport and lifecycle state: session
 * id, participant id, question index, state revision, realtime status and the
 * last event time. Never correctness, never the correct option, never another
 * player's answer.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useLiveQuizSession } from "@/hooks/useLiveQuizSession";
import {
  advanceLiveQuizSession,
  createLiveQuizSession,
  findMyLiveQuizSession,
  joinLiveQuizSession,
  leaveLiveQuizSession,
  mapLiveQuizError,
  submitLiveQuizAnswer,
  type LiveQuizAction,
} from "@/lib/liveQuiz";

/** Published quizzes the signed-in user may host, straight from the manager RPC. */
function useHostableQuizzes(classId: string) {
  return useQuery({
    queryKey: ["dev-live-quiz", "hostable", classId],
    enabled: classId.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_class_quizzes_for_manager", {
        _class_id: classId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; title: string; status: string; question_count: number;
      }>;
    },
  });
}

export function LiveQuizHarness() {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const [params, setParams] = useSearchParams();

  const sessionId = params.get("session") ?? "";
  const [classId, setClassId] = useState("");
  const [quizId, setQuizId] = useState("");
  const [code, setCode] = useState("");
  const [log, setLog] = useState<string[]>([]);

  const say = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 40));

  const setSession = (id: string) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (id) n.set("session", id); else n.delete("session");
      return n;
    });
  };

  const live = useLiveQuizSession(sessionId || undefined);
  const quizzes = useHostableQuizzes(classId);

  const createMut = useMutation({
    mutationFn: () => createLiveQuizSession({ quizId, secondsPerQuestion: 20 }),
    onSuccess: (r) => { say(`created session ${r.id} · code ${r.game_code}`); setSession(r.id); },
    onError: (e) => say(`create FAILED: ${mapLiveQuizError(e)}`),
  });

  const joinMut = useMutation({
    mutationFn: () => joinLiveQuizSession(code),
    onSuccess: (r) => {
      say(`joined ${r.session_id} as participant ${r.participant_id}${r.rejoined ? " (rejoined)" : ""}`);
      setSession(r.session_id);
    },
    onError: (e) => say(`join FAILED: ${mapLiveQuizError(e)}`),
  });

  const advanceMut = useMutation({
    mutationFn: (action: LiveQuizAction) =>
      advanceLiveQuizSession({
        sessionId,
        action,
        expectedRevision: live.snapshot?.session.state_revision ?? null,
      }),
    onSuccess: (r) => say(`advance → ${r.status}${r.index !== undefined ? ` (q${r.index})` : ""}`),
    onError: (e) => say(`advance FAILED: ${mapLiveQuizError(e)}`),
  });

  const answerMut = useMutation({
    mutationFn: (a: { optionId?: string; answerText?: string }) =>
      submitLiveQuizAnswer({
        sessionId,
        questionIndex: live.snapshot?.session.current_question_index ?? -1,
        optionId: a.optionId ?? null,
        answerText: a.answerText ?? null,
      }),
    onSuccess: (r) => say(r.duplicate ? "answer was a DUPLICATE (no score)" : "answer accepted"),
    onError: (e) => say(`answer FAILED: ${mapLiveQuizError(e)}`),
  });

  const recoverMut = useMutation({
    mutationFn: () => findMyLiveQuizSession(),
    onSuccess: (r) => {
      if (r.session_id) { say(`recovered ${r.session_id} (host=${r.is_host})`); setSession(r.session_id); }
      else say("no active session for this account");
    },
    onError: (e) => say(`recover FAILED: ${mapLiveQuizError(e)}`),
  });

  const s = live.snapshot?.session;
  const q = live.snapshot?.question;

  const statusTone = useMemo(() => {
    switch (live.realtimeStatus) {
      case "connected": return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "reconnecting": return "bg-amber-100 text-amber-800 border-amber-300";
      case "connecting": return "bg-slate-100 text-slate-700 border-slate-300";
      default: return "bg-rose-100 text-rose-800 border-rose-300";
    }
  }, [live.realtimeStatus]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-mono text-[13px] text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header>
          <h1 className="text-[17px] font-bold">Live quiz QA harness</h1>
          <p className="mt-1 text-slate-600">
            Real RPCs, real Realtime. Superadmin only; not linked from navigation.
            Independent of the <code>liveQuizMultiplayer</code> flag.
          </p>
          <p className="mt-1 text-slate-500">
            signed in as <b>{user?.id ?? "—"}</b> · tenant <b>{currentTenantId ?? "—"}</b>
          </p>
        </header>

        {/* ── Diagnostics ─────────────────────────────────────────── */}
        <section className="rounded-lg border border-slate-300 bg-white p-3">
          <h2 className="mb-2 font-bold">Diagnostics</h2>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <Diag label="realtime">
              <span className={cn("rounded border px-1.5 py-0.5 font-bold", statusTone)}>
                {live.realtimeStatus}
              </span>
            </Diag>
            <Diag label="last server event">{live.lastEventAt ?? "—"}</Diag>
            <Diag label="session id">{s?.id ?? "—"}</Diag>
            <Diag label="participant id">{live.snapshot?.me?.participant_id ?? "— (host or not joined)"}</Diag>
            <Diag label="is host">{String(live.snapshot?.is_host ?? "—")}</Diag>
            <Diag label="status">{s?.status ?? "—"}</Diag>
            <Diag label="question index">
              {s ? `${s.current_question_index} of ${s.question_count}` : "—"}
            </Diag>
            <Diag label="state revision">{s?.state_revision ?? "—"}</Diag>
            <Diag label="participants / answered">
              {s ? `${s.participant_count} / ${s.answered_count}` : "—"}
            </Diag>
            <Diag label="seconds left">{live.secondsLeft ?? "—"}</Diag>
            <Diag label="server now">{s?.server_now ?? "—"}</Diag>
            <Diag label="game code (host only)">{s?.game_code ?? "— (hidden from players)"}</Diag>
          </div>
          {live.isError && (
            <p className="mt-2 rounded bg-rose-50 p-2 text-rose-800">
              snapshot error: {mapLiveQuizError(live.error)}
            </p>
          )}
        </section>

        {/* ── Host ────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-slate-300 bg-white p-3">
          <h2 className="mb-2 font-bold">Host</h2>
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-slate-600">class id</span>
              <Input value={classId} onChange={(e) => setClassId(e.target.value.trim())}
                placeholder="uuid of a class you tutor" className="h-10 font-mono text-[13px]" />
            </label>
            {quizzes.data && (
              <div className="flex flex-wrap gap-1.5">
                {quizzes.data.filter((z) => z.status === "published").map((z) => (
                  <button key={z.id} type="button" onClick={() => setQuizId(z.id)}
                    className={cn("rounded border px-2 py-1 text-left",
                      quizId === z.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300")}>
                    {z.title} ({z.question_count}q)
                  </button>
                ))}
                {quizzes.data.filter((z) => z.status === "published").length === 0 && (
                  <span className="text-slate-500">no published quizzes in that class</span>
                )}
              </div>
            )}
            {quizzes.isError && (
              <span className="text-rose-700">quiz list failed — check the class id</span>
            )}
            <div className="flex flex-wrap gap-2">
              <Button className="h-10" disabled={!quizId || createMut.isPending}
                onClick={() => createMut.mutate()}>
                {createMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                create session
              </Button>
              {(["start", "lock", "reveal", "leaderboard", "next", "complete", "cancel"] as LiveQuizAction[])
                .map((a) => (
                  <Button key={a} variant="outline" className="h-10"
                    disabled={!sessionId || advanceMut.isPending}
                    onClick={() => advanceMut.mutate(a)}>
                    {a}
                  </Button>
                ))}
            </div>
          </div>
        </section>

        {/* ── Student ─────────────────────────────────────────────── */}
        <section className="rounded-lg border border-slate-300 bg-white p-3">
          <h2 className="mb-2 font-bold">Student</h2>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-slate-600">game code</span>
              <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" placeholder="000000"
                className="h-10 w-32 font-mono text-[15px] tracking-widest" />
            </label>
            <Button className="h-10" disabled={code.length !== 6 || joinMut.isPending}
              onClick={() => joinMut.mutate()}>
              {joinMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              join
            </Button>
            <Button variant="outline" className="h-10" disabled={!sessionId}
              onClick={async () => { await leaveLiveQuizSession(sessionId); say("left session"); }}>
              leave
            </Button>
            <Button variant="outline" className="h-10" onClick={() => recoverMut.mutate()}>
              recover my session
            </Button>
          </div>

          {q && (
            <div className="mt-3 rounded border border-slate-300 p-2">
              <p className="font-bold">Q{q.index + 1}: {q.question}</p>
              <p className="mt-0.5 text-slate-600">
                type {q.question_type} · {q.points} pts ·
                {" "}explanation {q.explanation ? "PRESENT (revealed)" : "withheld"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {q.question_type === "true_false"
                  ? ["true", "false"].map((v) => (
                      <Button key={v} variant="outline" className="h-10"
                        disabled={s?.status !== "question_open" || answerMut.isPending}
                        onClick={() => answerMut.mutate({ answerText: v })}>
                        {v}
                      </Button>
                    ))
                  : q.options.map((o) => (
                      <Button key={o.id} variant="outline" className="h-10"
                        disabled={s?.status !== "question_open" || answerMut.isPending}
                        onClick={() => answerMut.mutate({ optionId: o.id })}>
                        {o.text}
                        {/* null until the server reveals — proves redaction live */}
                        {o.is_correct === true && " ✓"}
                        {o.is_correct === false && " ✗"}
                      </Button>
                    ))}
              </div>
              <p className="mt-2 text-slate-600">
                is_correct on options:{" "}
                <b>{q.options.every((o) => o.is_correct === null) ? "all null (redacted)" : "revealed"}</b>
              </p>
              {live.snapshot?.my_answer && (
                <p className="mt-1 text-slate-600">
                  my answer: answered={String(live.snapshot.my_answer.answered)} ·
                  {" "}is_correct={String(live.snapshot.my_answer.is_correct)} ·
                  {" "}points={String(live.snapshot.my_answer.points_awarded)}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Leaderboard + roster ────────────────────────────────── */}
        {live.snapshot && (
          <section className="rounded-lg border border-slate-300 bg-white p-3">
            <h2 className="mb-2 font-bold">Leaderboard (server-ranked)</h2>
            <ol className="space-y-0.5">
              {live.snapshot.leaderboard.map((r) => (
                <li key={r.participant_id} className={cn(r.is_me && "font-bold")}>
                  #{r.rank} {r.display_name} — {r.score} pts · {r.correct_count} correct
                  {r.is_me && " ← you"}
                </li>
              ))}
              {live.snapshot.leaderboard.length === 0 && <li className="text-slate-500">empty</li>}
            </ol>
            <h2 className="mb-1 mt-3 font-bold">Roster</h2>
            <ul className="space-y-0.5">
              {live.snapshot.players.map((p) => (
                <li key={p.participant_id}>{p.display_name} · {p.status}</li>
              ))}
              {live.snapshot.players.length === 0 && <li className="text-slate-500">empty</li>}
            </ul>
          </section>
        )}

        {/* ── Log ─────────────────────────────────────────────────── */}
        <section className="rounded-lg border border-slate-300 bg-white p-3">
          <h2 className="mb-2 font-bold">Log</h2>
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-[12px] text-slate-700">
            {log.join("\n") || "—"}
          </pre>
        </section>
      </div>
    </div>
  );
}

function Diag({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-slate-100 py-0.5">
      <span className="w-40 shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 break-all">{children}</span>
    </div>
  );
}

export default LiveQuizHarness;
