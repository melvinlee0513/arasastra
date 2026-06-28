import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";

const DISMISS_KEY = "arasa.pwa.install.dismissed.v1";
const SHOW_AFTER_MS = 1500;

export function PWAInstallPrompt() {
  const { platform, standalone, canPromptNatively, needsManualInstructions, promptInstall } =
    usePWAInstall();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });

  useEffect(() => {
    if (standalone || dismissed) return;
    if (!canPromptNatively && !needsManualInstructions) return;
    const t = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [standalone, dismissed, canPromptNatively, needsManualInstructions]);

  const handleDismiss = () => {
    setVisible(false);
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore quota errors */
    }
  };

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted" || outcome === "dismissed") {
      handleDismiss();
    }
  };

  if (standalone || dismissed) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
          role="dialog"
          aria-label="Install ARASA Plus"
          className="fixed inset-x-0 bottom-6 z-[100] mx-auto w-[92vw] max-w-md px-2 sm:bottom-8"
        >
          <div className="rounded-3xl border border-slate-200/80 bg-white/90 backdrop-blur-md shadow-[0_10px_40px_rgb(0,0,0,0.08)] p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-2xl bg-primary/10 p-2.5">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  Install ARASA Plus
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  {platform === "ios"
                    ? "Add to your Home Screen for a full-screen, app-like experience."
                    : "Install the app for faster access, offline-ready shell, and a cleaner experience."}
                </p>
              </div>
              <button
                onClick={handleDismiss}
                aria-label="Dismiss install prompt"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {platform === "ios" ? (
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <p className="flex items-center gap-2">
                  <span>1.</span> Tap
                  <Share className="h-3.5 w-3.5 text-primary" aria-label="Share" />
                  <span className="font-medium text-slate-700">Share</span>
                </p>
                <p className="mt-1.5 flex items-center gap-2">
                  <span>2.</span> Choose
                  <Plus className="h-3.5 w-3.5 text-primary" aria-label="Add" />
                  <span className="font-medium text-slate-700">Add to Home Screen</span>
                </p>
              </div>
            ) : (
              <Button
                onClick={handleInstall}
                disabled={!canPromptNatively}
                className="mt-4 w-full rounded-full"
                size="sm"
              >
                <Download className="mr-2 h-4 w-4" />
                Install App
              </Button>
            )}

            <button
              onClick={handleDismiss}
              className="mt-2 w-full rounded-full py-2 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              Not now
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
