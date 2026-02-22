import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, Star, Zap } from "lucide-react";
import { ExitIntentModal } from "@/components/account/ExitIntentModal";

interface PricingPlan {
  id: string;
  name: string;
  subtitle: string | null;
  price: string;
  interval: string;
  features: string[];
  is_popular: boolean;
  button_text: string;
  sort_order: number;
}

interface PricingSectionProps {
  selectedPlanId: string | null;
  onSelectPlan: (plan: PricingPlan) => void;
}

export function PricingSection({ selectedPlanId, onSelectPlan }: PricingSectionProps) {
  const { data: plans, isLoading } = useQuery({
    queryKey: ["pricing-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data as unknown as PricingPlan[]) ?? [];
    },
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <Skeleton className="h-8 w-64 mx-auto" />
          <Skeleton className="h-4 w-80 mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 w-full" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <ExitIntentModal />
      {/* Header */}
      <div className="text-center space-y-2">
        <Badge variant="secondary" className="bg-primary/10 text-primary border-0">
          <Zap className="w-3 h-3 mr-1" />
          Enrollment
        </Badge>
        <h2 className="text-2xl md:text-3xl font-bold text-foreground">
          Start Your <span className="text-primary">Learning Journey</span>
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Choose the plan that fits your needs and unlock your academic potential with Arasa A+.
        </p>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans?.map((plan) => {
          const isSelected = selectedPlanId === plan.id;
          return (
            <Card
              key={plan.id}
              className={`relative p-6 flex flex-col transition-all ${
                plan.is_popular
                  ? "border-2 border-primary shadow-md"
                  : "border border-border"
              } ${isSelected ? "ring-2 ring-accent" : ""}`}
            >
              {plan.is_popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground border-0 shadow-sm">
                  <Star className="w-3 h-3 mr-1 fill-current" />
                  Best Value
                </Badge>
              )}

              <div className="text-center space-y-1 mb-4">
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                {plan.subtitle && (
                  <p className="text-sm text-muted-foreground">{plan.subtitle}</p>
                )}
              </div>

              <div className="text-center mb-5">
                <span className="text-3xl font-bold text-primary">{plan.price}</span>
                <span className="text-muted-foreground text-sm">{plan.interval}</span>
              </div>

              <ul className="space-y-2.5 flex-1 mb-6">
                {(plan.features as string[]).map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={isSelected ? "default" : "outline"}
                className="w-full"
                onClick={() => onSelectPlan(plan)}
              >
                {isSelected ? "Selected" : plan.button_text}
              </Button>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
