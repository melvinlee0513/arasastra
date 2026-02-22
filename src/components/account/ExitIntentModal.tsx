import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExitIntentModalProps {
  enabled?: boolean;
}

export function ExitIntentModal({ enabled = true }: ExitIntentModalProps) {
  const [show, setShow] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  useEffect(() => {
    if (!enabled || hasShown) return;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !hasShown) {
        setShow(true);
        setHasShown(true);
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [enabled, hasShown]);

  const whatsappLink = "https://wa.me/60123456789?text=Hi%2C%20I%27m%20interested%20in%20Arasa%20A%2B%20and%20need%20help%20choosing%20a%20plan.";

  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-center text-xl text-foreground">
            Not sure which plan? 🤔
          </DialogTitle>
        </DialogHeader>

        <div className="text-center space-y-4 py-4">
          <p className="text-muted-foreground">
            Our counselors are happy to help you find the perfect plan for your learning goals.
          </p>

          <Button
            variant="default"
            size="lg"
            className="w-full gap-2"
            onClick={() => window.open(whatsappLink, "_blank")}
          >
            <MessageCircle className="w-5 h-5" />
            Chat with a Counselor
          </Button>

          <Button variant="ghost" size="sm" onClick={() => setShow(false)}>
            No thanks, I'll decide myself
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
