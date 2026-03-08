import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates every hour
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000);
      }
    },
  });

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-[90vw] max-w-sm"
        >
          <div className="rounded-3xl border border-border/40 bg-card/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-primary/10 p-2">
                <RefreshCw className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  New update available
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click to refresh and get the latest features.
                </p>
              </div>
              <button
                onClick={() => setNeedRefresh(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Button
              onClick={() => updateServiceWorker(true)}
              className="w-full mt-3 rounded-full"
              size="sm"
            >
              Update Now
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
