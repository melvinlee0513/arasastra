import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type EventType =
  | "pwa_install_available"
  | "pwa_install_clicked"
  | "pwa_installed"
  | "session_start";

function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  return "Desktop";
}

function isPWAMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

async function getProfileId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .single();
  return data?.id ?? null;
}

async function trackEvent(
  profileId: string,
  eventType: EventType,
  isPwa: boolean
) {
  try {
    await supabase.from("analytics_events").insert({
      user_id: profileId,
      event_type: eventType,
      platform: detectPlatform(),
      is_pwa: isPwa,
    });
  } catch (err) {
    console.error("Analytics event failed:", err);
  }
}

export function usePWAAnalytics() {
  const { user } = useAuth();
  const tracked = useRef(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!user || tracked.current) return;
    tracked.current = true;

    const pwa = isPWAMode();
    const platform = detectPlatform();

    (async () => {
      const profileId = await getProfileId(user.id);
      if (!profileId) return;

      // Log session start
      await trackEvent(profileId, "session_start", pwa);

      // Listen for install prompt (Android/Chrome)
      const handlePrompt = (e: Event) => {
        e.preventDefault();
        deferredPrompt.current = e as BeforeInstallPromptEvent;
        trackEvent(profileId, "pwa_install_available", false);
      };

      const handleInstalled = () => {
        trackEvent(profileId, "pwa_installed", true);
      };

      window.addEventListener("beforeinstallprompt", handlePrompt);
      window.addEventListener("appinstalled", handleInstalled);

      return () => {
        window.removeEventListener("beforeinstallprompt", handlePrompt);
        window.removeEventListener("appinstalled", handleInstalled);
      };
    })();
  }, [user]);

  const triggerInstall = async () => {
    if (!deferredPrompt.current || !user) return;
    deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;

    const profileId = await getProfileId(user.id);
    if (profileId) {
      await trackEvent(profileId, "pwa_install_clicked", false);
      if (outcome === "accepted") {
        await trackEvent(profileId, "pwa_installed", true);
      }
    }
    deferredPrompt.current = null;
  };

  return { triggerInstall, isPWA: isPWAMode() };
}
