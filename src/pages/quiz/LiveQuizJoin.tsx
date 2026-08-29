/**
 * Join a live quiz (student, dark arena).
 *
 * MVP players are authenticated and enrolled, so there is no nickname field
 * and no avatar picker: the display name and avatar come from the profile the
 * rest of the app already uses. An invalid, finished or foreign-tenant code
 * all produce the same message, so the six-digit space can't be probed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { QUIZ_ART } from "@/lib/quizArt";
import { ArenaArt, ArenaPanel, QuizArenaShell } from "@/components/quiz/QuizArena";
import { joinLiveQuizSession, mapLiveQuizError } from "@/lib/liveQuiz";

const LENGTH = 6;

export function LiveQuizJoin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [digits, setDigits] = useState<string[]>(() => Array(LENGTH).fill(""));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const autoJoined = useRef(false);

  const code = digits.join("");
  const complete = code.length === LENGTH && /^\d{6}$/.test(code);

  const joinMut = useMutation({
    mutationFn: (c: string) => joinLiveQuizSession(c),
    onSuccess: (res) => navigate(`/dashboard/quiz/live/${res.session_id}`, { replace: true }),
    onError: (err) => {
      toast.error(mapLiveQuizError(err, "That game code isn't valid."));
      setDigits(Array(LENGTH).fill(""));
      inputs.current[0]?.focus();
    },
  });

  // A scanned QR / shared link carries ?code= — prefill and join once.
  useEffect(() => {
    const param = (searchParams.get("code") ?? "").replace(/\D/g, "").slice(0, LENGTH);
    if (param.length === LENGTH && !autoJoined.current) {
      autoJoined.current = true;
      setDigits(param.split(""));
      joinMut.mutate(param);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setDigit = useCallback((i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    setDigits((prev) => {
      const next = prev.slice();
      if (clean.length > 1) {
        // Paste: spread across the remaining boxes.
        clean.split("").forEach((ch, k) => {
          if (i + k < LENGTH) next[i + k] = ch;
        });
        inputs.current[Math.min(i + clean.length, LENGTH - 1)]?.focus();
      } else {
        next[i] = clean;
        if (clean) inputs.current[Math.min(i + 1, LENGTH - 1)]?.focus();
      }
      return next;
    });
  }, []);

  const onKeyDown = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  return (
    <QuizArenaShell>
      <div className="mx-auto flex w-full max-w-md flex-col pb-[calc(env(safe-area-inset-bottom)+96px)]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            aria-label="Back"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/12 backdrop-blur active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="text-[18px] font-extrabold">Join quiz</h1>
        </div>

        <div className="mt-4 text-center">
          <ArenaArt src={QUIZ_ART.owlController} className="mx-auto h-32 w-32" />
          <p className="mt-2 text-[13.5px] leading-snug text-quiz-arena-muted">
            Enter the game code from your tutor to join the live quiz.
          </p>
        </div>

        <ArenaPanel className="mt-5">
          <label
            htmlFor="code-0"
            className="mb-3 block text-center text-[11px] font-bold uppercase tracking-[0.14em] text-quiz-arena-muted"
          >
            Enter game code
          </label>
          <div className="flex justify-center gap-1.5 sm:gap-2">
            {digits.map((d, i) => (
              <input
                key={i}
                id={`code-${i}`}
                ref={(el) => { inputs.current[i] = el; }}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={onKeyDown(i)}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={LENGTH}
                aria-label={`Game code digit ${i + 1}`}
                disabled={joinMut.isPending}
                className={cn(
                  "h-14 w-full max-w-[52px] rounded-2xl border bg-white/8 text-center",
                  "text-[22px] font-black tabular-nums text-quiz-arena-foreground",
                  "outline-none transition focus:border-quiz-accent-pink focus:ring-2 focus:ring-quiz-accent-pink/50",
                  d ? "border-quiz-accent/60" : "border-white/15",
                )}
              />
            ))}
          </div>
        </ArenaPanel>

        <div className="sticky bottom-0 z-40 -mx-4 mt-6 bg-gradient-to-t from-quiz-arena-deep via-quiz-arena-deep/95 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-5 sm:-mx-6 sm:px-6">
          <Button
            className="h-13 min-h-[52px] w-full rounded-full bg-gradient-to-r from-quiz-accent-pink to-quiz-accent text-[16px] font-extrabold text-white"
            disabled={!complete || joinMut.isPending}
            onClick={() => joinMut.mutate(code)}
          >
            {joinMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Join game
          </Button>
          <p className="mt-2 text-center text-[12px] text-quiz-arena-muted">
            You'll join with your own name and avatar.
          </p>
        </div>
      </div>
    </QuizArenaShell>
  );
}

export default LiveQuizJoin;
