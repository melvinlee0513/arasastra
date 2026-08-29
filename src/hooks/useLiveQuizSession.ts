/**
 * Subscribe to a live quiz session and keep an authoritative snapshot.
 *
 * The realtime row change is only a *signal*; the snapshot RPC is the single
 * source of truth, because it is the thing that redacts answers. Nothing here
 * polls: one subscription per client, one refetch per state transition.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import {
  getLiveQuizSnapshot,
  liveQuizKeys,
  secondsRemaining,
  serverClockOffset,
  subscribeToLiveQuizSession,
  unsubscribeFromLiveQuiz,
  type LiveQuizSnapshot,
} from "@/lib/liveQuiz";

export function useLiveQuizSession(sessionId: string | undefined) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const qc = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [offset, setOffset] = useState(0);

  const queryKey = useMemo(
    () => liveQuizKeys.snapshot(currentTenantId, sessionId ?? "", user?.id),
    [currentTenantId, sessionId, user?.id],
  );

  const q = useQuery<LiveQuizSnapshot>({
    queryKey,
    enabled: !!sessionId && !!user,
    queryFn: () => getLiveQuizSnapshot(sessionId!),
    // Realtime drives freshness; a window-focus refetch would just add load.
    refetchOnWindowFocus: false,
    staleTime: 1000,
  });

  // Track the server/browser clock difference so the countdown is honest even
  // on a device with the wrong time.
  useEffect(() => {
    if (q.data?.session.server_now) {
      setOffset(serverClockOffset(q.data.session.server_now));
    }
  }, [q.data?.session.server_now]);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey });
  }, [qc, queryKey]);

  useEffect(() => {
    if (!sessionId || !user) return;
    channelRef.current = subscribeToLiveQuizSession(sessionId, refresh);
    return () => {
      unsubscribeFromLiveQuiz(channelRef.current);
      channelRef.current = null;
    };
  }, [sessionId, user, refresh]);

  // Local 1s tick for the countdown only — no network, no writes.
  const [, setTick] = useState(0);
  const status = q.data?.session.status;
  useEffect(() => {
    if (status !== "question_open") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const secondsLeft = q.data ? secondsRemaining(q.data.session, Date.now(), offset) : null;

  return { ...q, snapshot: q.data, secondsLeft, refresh };
}
