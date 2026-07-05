import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * AppUpdatePrompt — persistent glassmorphic toast that appears when a new
 * production build is detected. Two detection channels:
 *
 *   1. `pwa:update-ready` event dispatched by the service-worker registrar.
 *   2. Polling `/` for a changed ETag/Last-Modified header (fallback for
 *      contexts where the service worker isn't allowed to register).
 */
export function AppUpdatePrompt() {
  const [visible, setVisible] = useState(false);
  const [reloading, setReloading] = useState(false);
  const baselineTagRef = useRef<string | null>(null);

  // Channel 1: service-worker update event
  useEffect(() => {
    const onReady = () => setVisible(true);
    window.addEventListener("pwa:update-ready", onReady);
    return () => window.removeEventListener("pwa:update-ready", onReady);
  }, []);

  // Channel 2: poll index.html ETag / Last-Modified as a fallback
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    const fetchTag = async (): Promise<string | null> => {
      try {
        const res = await fetch("/", {
          method: "GET",
          cache: "no-store",
          headers: { "cache-control": "no-cache" },
        });
        if (!res.ok) return null;
        return (
          res.headers.get("etag") ||
          res.headers.get("last-modified") ||
          null
        );
      } catch {
        return null;
      }
    };

    const check = async () => {
      const tag = await fetchTag();
      if (cancelled || !tag) return;
      if (baselineTagRef.current == null) {
        baselineTagRef.current = tag;
        return;
      }
      if (tag !== baselineTagRef.current) {
        setVisible(true);
      }
    };

    void check();
    const interval = window.setInterval(check, 60_000); // every 60s
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const applyUpdate = async () => {
    setReloading(true);
    try {
      // Ask any waiting service worker to activate immediately
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          try {
            await reg.update();
          } catch {
            /* noop */
          }
        }
      }
      // Wipe caches so the next navigation pulls fresh HTML/assets
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.allSettled(keys.map((k) => caches.delete(k)));
      }
    } finally {
      // Hard reload — bypass memory/HTTP cache
      window.location.replace(window.location.href);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 24, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          role="status"
          aria-live="polite"
          className="fixed z-[100] bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 max-w-sm ml-auto"
        >
          <div className="bg-white/90 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-2xl p-4 sm:p-5 flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#0052FF15" }}
            >
              <Sparkles className="w-5 h-5" style={{ color: "#0052FF" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-semibold leading-tight"
                style={{ color: "#0F172A" }}
              >
                A new version of the site is available.
              </p>
              <p className="text-xs mt-1" style={{ color: "#0F172A99" }}>
                Refresh to load the latest improvements.
              </p>
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={applyUpdate}
                  disabled={reloading}
                  className="rounded-full px-4 h-9 text-white shadow-sm hover:opacity-90 disabled:opacity-70"
                  style={{ backgroundColor: "#0052FF" }}
                >
                  {reloading ? "Updating…" : "Update Now"}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AppUpdatePrompt;
