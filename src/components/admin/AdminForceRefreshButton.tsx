import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Floating bottom-left button for admins.
 * Unregisters the service worker, purges all caches, and performs a
 * hard reload so the very latest published build is served immediately.
 */
export function AdminForceRefreshButton() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const forceRefresh = async () => {
    setBusy(true);
    toast({ title: "Pulling latest build…", description: "Clearing cache and updating." });
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn("Force refresh cleanup failed", e);
    } finally {
      const url = new URL(window.location.href);
      url.searchParams.set("_v", Date.now().toString());
      window.location.replace(url.toString());
    }
  };

  return (
    <button
      type="button"
      onClick={forceRefresh}
      disabled={busy}
      title="Force refresh — pull the latest published update"
      className="fixed bottom-5 left-5 z-[60] inline-flex items-center gap-2 rounded-full pl-3 pr-4 h-11 text-sm font-medium
                 bg-white/90 backdrop-blur-xl border border-slate-200 text-[#0F172A]
                 shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:bg-white transition
                 disabled:opacity-70"
    >
      <span className="w-7 h-7 rounded-full bg-[#0052FF] text-white inline-flex items-center justify-center">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      </span>
      {busy ? "Updating…" : "Force refresh"}
    </button>
  );
}
