import { CheckCircle, Clock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="w-full bg-card border border-border rounded-xl p-4 md:p-6">
      <h3 className="font-semibold text-foreground mb-4">Payment Status</h3>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex items-center gap-3 flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                    isCompleted && "bg-accent text-accent-foreground",
                    isCurrent && "bg-primary text-primary-foreground animate-pulse",
                    isPending && "bg-secondary text-muted-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "font-medium text-sm",
                    isCompleted && "text-accent",
                    isCurrent && "text-primary",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {step.description}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "hidden md:block h-0.5 w-8 flex-shrink-0",
                    index < currentIndex ? "bg-accent" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
