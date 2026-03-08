import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Smartphone } from "lucide-react";

export function InstallQRCode() {
  const installUrl = `${window.location.origin}/mobile-onboarding`;

  return (
    <Card className="rounded-3xl border-border/40 bg-card/80 backdrop-blur-xl">
      <CardContent className="p-6 flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Smartphone className="h-4 w-4 text-primary" />
          Install on your phone
        </div>
        <div className="bg-background rounded-2xl p-4">
          <QRCodeSVG
            value={installUrl}
            size={160}
            bgColor="transparent"
            fgColor="hsl(220, 45%, 22%)"
            level="M"
          />
        </div>
        <p className="text-xs text-muted-foreground text-center max-w-[200px]">
          Scan with your phone camera to install Arasa A+ as an app
        </p>
      </CardContent>
    </Card>
  );
}
