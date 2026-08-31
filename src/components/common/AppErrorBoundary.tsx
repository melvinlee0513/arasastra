/**
 * The last thing between a thrown render error and a blank white page.
 *
 * The app had no error boundary at all, so any throw during render — a failed
 * lazy chunk after a deploy being the likely one — unmounted the whole tree and
 * left the user staring at nothing, with no way back except knowing to reload.
 *
 * Two distinct messages, because the two causes need different actions from the
 * user: a stale build needs a reload, and anything else needs them to be able
 * to leave the broken screen.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError } from "@/lib/lazyWithRetry";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry service is wired up, so this goes to the console rather than
    // being swallowed — a support call needs something to read out.
    console.error("[app] render error:", error, info.componentStack);
  }

  private reload = async () => {
    try {
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.allSettled(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* best effort */
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);

    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-slate-50 px-5">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-[18px] font-extrabold text-slate-900">
            {stale ? "A new version is ready" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-[13.5px] leading-snug text-slate-600">
            {stale
              ? "This tab was open while the app was updated. Reloading will pick up the new version — nothing you saved is lost."
              : "This screen failed to load. Reloading usually fixes it. If it keeps happening, tell your tutor or an admin what you were doing."}
          </p>
          <button
            type="button"
            onClick={this.reload}
            className="mt-5 inline-flex h-12 min-h-[48px] w-full items-center justify-center rounded-full bg-slate-900 px-5 text-[15px] font-bold text-white transition active:scale-[0.99]"
          >
            Reload
          </button>
          {!stale && (
            <p className="mt-3 break-words text-[11.5px] text-slate-400">{error.message}</p>
          )}
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
