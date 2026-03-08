import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Share, Plus, MoreVertical, Smartphone, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function MobileOnboarding() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const steps = {
    ios: [
      {
        icon: <Share className="h-5 w-5" />,
        title: "Tap the Share icon",
        description: "Find the Share button at the bottom of Safari's toolbar.",
      },
      {
        icon: <Plus className="h-5 w-5" />,
        title: "Tap 'Add to Home Screen'",
        description: "Scroll down in the share sheet and tap 'Add to Home Screen'.",
      },
      {
        icon: <CheckCircle2 className="h-5 w-5" />,
        title: "Tap 'Add'",
        description: "Confirm the name and tap Add. Arasa A+ will appear on your Home Screen!",
      },
    ],
    android: [
      {
        icon: <MoreVertical className="h-5 w-5" />,
        title: "Tap the menu (⋮)",
        description: "Open Chrome's menu at the top-right corner.",
      },
      {
        icon: <Download className="h-5 w-5" />,
        title: "Tap 'Install app'",
        description: "Select 'Install app' or 'Add to Home screen' from the menu.",
      },
      {
        icon: <CheckCircle2 className="h-5 w-5" />,
        title: "Confirm",
        description: "Tap Install. The app will be added to your Home Screen!",
      },
    ],
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Smartphone className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Install Arasa A+</h1>
          <p className="text-muted-foreground text-sm">
            Get the full app experience — offline access, instant loading, and home screen launch.
          </p>
        </div>

        {installed ? (
          <Card className="rounded-3xl border-border/40 bg-card/80 backdrop-blur-xl">
            <CardContent className="p-6 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <p className="font-semibold text-foreground">App Installed!</p>
              <p className="text-sm text-muted-foreground">
                Arasa A+ is now on your home screen. Open it anytime for instant access.
              </p>
            </CardContent>
          </Card>
        ) : platform === "android" && deferredPrompt ? (
          <div className="space-y-4">
            <Button
              onClick={handleInstall}
              className="w-full rounded-full h-12 text-base"
              size="lg"
            >
              <Download className="mr-2 h-5 w-5" />
              Install Arasa A+
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              One tap to add to your Home Screen
            </p>
          </div>
        ) : (platform === "ios" || platform === "android") ? (
          <div className="space-y-3">
            {(steps[platform === "ios" ? "ios" : "android"]).map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
              >
                <Card className="rounded-3xl border-border/40 bg-card/80 backdrop-blur-xl">
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <span className="text-sm font-bold">{i + 1}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-primary">{step.icon}</span>
                        <p className="font-semibold text-sm text-foreground">{step.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card className="rounded-3xl border-border/40 bg-card/80 backdrop-blur-xl">
            <CardContent className="p-6 text-center space-y-3">
              <Smartphone className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="font-semibold text-foreground">Open on your phone</p>
              <p className="text-sm text-muted-foreground">
                Scan the QR code from your Profile page, or visit this page on your mobile browser to install the app.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Branding */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          Arasa A+ Education • Your path to academic excellence
        </p>
      </motion.div>
    </div>
  );
}
