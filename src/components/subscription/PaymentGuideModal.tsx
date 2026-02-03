import { useState } from "react";
import { HelpCircle, X, CreditCard, Camera, Upload, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function PaymentGuideModal() {
  const [open, setOpen] = useState(false);

  const steps = [
    {
      icon: CreditCard,
      title: "Transfer the exact amount",
      description: "Transfer to Arasa A+ via Maybank: 123456789",
    },
    {
      icon: Camera,
      title: "Save your receipt",
      description: "Take a screenshot or save the bank PDF receipt",
    },
    {
      icon: Upload,
      title: "Upload the file",
      description: "Upload your receipt below and click 'Submit'",
    },
    {
      icon: Clock,
      title: "Wait for verification",
      description: "Our admins will unlock your classes within 24 hours",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
          <HelpCircle className="w-4 h-4" />
          <span className="hidden sm:inline">How it works</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            Step-by-Step Payment Guide
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {index + 1}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="w-0.5 h-full bg-border mt-2" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-primary" />
                    <h4 className="font-medium text-foreground">{step.title}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="bg-accent/10 rounded-lg p-3 text-center">
          <p className="text-sm text-accent font-medium">
            💡 Tip: Make sure the amount matches exactly to avoid delays!
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
