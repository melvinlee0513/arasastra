import { CheckCircle, Clock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface PaymentStatusTrackerProps {
  status: "submitted" | "verifying" | "activated";
}

export function PaymentStatusTracker({ status }: PaymentStatusTrackerProps) {
  const steps = [
    {
      key: "submitted",
      label: "Payment Submitted",
      icon: CheckCircle,
      description: "Your receipt has been uploaded",
    },
    {
      key: "verifying",
      label: "Verification in Progress",
      icon: Clock,
      description: "Our team is reviewing your payment",
    },
    {
      key: "activated",
      label: "Account Activated",
      icon: Unlock,
      description: "Full access unlocked!",
    },
  ];

  const currentIndex = steps.findIndex((s) => s.key === status);

  return (
    <Card className="w-full p-6">
      <h3 className="font-semibold text-foreground mb-6">Payment Status</h3>

      {/* Desktop: Horizontal */}
      <div className="hidden md:flex items-start">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isActive = isCompleted || isCurrent;
          const allDone = status === "activated";
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex items-start flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors",
                    allDone
                      ? "bg-accent text-accent-foreground"
                      : isCompleted
                        ? "bg-accent text-accent-foreground"
                        : isCurrent
                          ? "bg-primary text-primary-foreground animate-pulse"
                          : "bg-secondary text-muted-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <p
                  className={cn(
                    "font-medium text-sm mt-2 text-center",
                    allDone
                      ? "text-accent"
                      : isActive
                        ? "text-primary"
                        : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground text-center mt-0.5">
                  {step.description}
                </p>
              </div>

              {index < steps.length - 1 && (
                <div className="flex items-center pt-5 px-1 shrink-0" style={{ width: 48 }}>
                  <div
                    className={cn(
                      "h-0.5 w-full rounded-full",
                      (allDone || index < currentIndex)
                        ? "bg-accent"
                        : "bg-border"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: Vertical Timeline */}
      <div className="flex md:hidden flex-col gap-0">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isActive = isCompleted || isCurrent;
          const allDone = status === "activated";
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex gap-4">
              {/* Left: icon + connector line */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
                    allDone
                      ? "bg-accent text-accent-foreground"
                      : isCompleted
                        ? "bg-accent text-accent-foreground"
                        : isCurrent
                          ? "bg-primary text-primary-foreground animate-pulse"
                          : "bg-secondary text-muted-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "w-0.5 flex-1 min-h-[24px] my-1 rounded-full",
                      (allDone || index < currentIndex)
                        ? "bg-accent"
                        : "bg-border"
                    )}
                  />
                )}
              </div>

              {/* Right: text */}
              <div className="pb-6 pt-1">
                <p
                  className={cn(
                    "font-medium text-sm",
                    allDone
                      ? "text-accent"
                      : isActive
                        ? "text-primary"
                        : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
