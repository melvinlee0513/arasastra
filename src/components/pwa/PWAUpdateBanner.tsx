import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * PWAUpdateBanner — listens for the "pwa:update-ready" event dispatched by the
 * service-worker registrar and surfaces a soft-tech, dismissible banner that
 * lets the user reload to apply the new build.
 */
export function PWAUpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onReady = () => setVisible(true);
    window.addEventListener("pwa:update-ready", onReady);
    return () => window.removeEventListener("pwa:update-ready", onReady);
  }, []);

  const reload = () => {
    setVisible(false);
    // A short delay lets the toast animation settle before the reload flash.
    setTimeout(() => window.location.reload(), 120);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-md"
          role="status"
          aria-live="polite"
        >
          <div className="bg-white/90 backdrop-blur-md border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-3xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">New version available</p>
              <p className="text-xs text-slate-500">Reload to get the latest improvements.</p>
            </div>
            <Button
              size="sm"
              onClick={reload}
              className="rounded-full bg-accent hover:bg-accent/90 text-accent-foreground gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload
            </Button>
            <button
              onClick={() => setVisible(false)}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              aria-label="Dismiss update notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
