import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TourStep {
  targetId: string;
  title: string;
  description: string;
  buttonText: string;
}

interface OnboardingTourProps {
  steps: TourStep[];
  isActive: boolean;
  onComplete: () => void;
  startAt?: number;
}

export function OnboardingTour({ steps, isActive, onComplete, startAt = 0 }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(startAt);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const recalcRect = useCallback(() => {
    if (!isActive || currentStep >= steps.length) return;
    const target = document.getElementById(steps[currentStep].targetId);
    if (target) {
      const rect = target.getBoundingClientRect();
      setPosition({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }
  }, [currentStep, steps, isActive]);

  const scrollAndMeasure = useCallback(() => {
    if (!isActive || currentStep >= steps.length) return;
    const target = document.getElementById(steps[currentStep].targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      // Measure after scroll settles
      setTimeout(recalcRect, 400);
    }
  }, [currentStep, steps, isActive, recalcRect]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(scrollAndMeasure, 300);
    const onScroll = () => recalcRect();
    window.addEventListener("resize", recalcRect);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", recalcRect);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [scrollAndMeasure, recalcRect, isActive]);

  if (!isActive || currentStep >= steps.length || !position) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  // Position tooltip below the target (viewport-relative for fixed positioning)
  const tooltipTop = position.top + position.height + 16;
  const tooltipLeft = Math.max(16, Math.min(position.left, window.innerWidth - 340));

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-[9998] pointer-events-none">
        {/* Dark backdrop with cutout */}
        <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
        {/* Spotlight cutout */}
        <div
          className="absolute rounded-xl border-2 border-primary shadow-[0_0_0_9999px_hsl(var(--background)/0.7)]"
          style={{
            top: position.top - 8,
            left: position.left - 8,
            width: position.width + 16,
            height: position.height + 16,
          }}
        />
      </div>

      {/* Tooltip */}
      <div
        className="fixed z-[9999] animate-fade-in"
        style={{
          top: tooltipTop,
          left: tooltipLeft,
          maxWidth: 320,
        }}
      >
        <Card className="p-5 bg-card border-primary/30 shadow-xl relative">
          <button
            onClick={onComplete}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              Step {currentStep + 1}/{steps.length}
            </span>
          </div>
          <h4 className="font-semibold text-foreground mb-1">{step.title}</h4>
          <p className="text-sm text-muted-foreground mb-4">{step.description}</p>
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    i <= currentStep ? "bg-primary" : "bg-muted"
                  )}
                />
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (isLast) {
                  onComplete();
                } else {
                  setCurrentStep((s) => s + 1);
                }
              }}
            >
              {step.buttonText}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
