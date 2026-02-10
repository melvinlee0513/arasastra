import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Trash2, Star, GripVertical, CheckCircle } from "lucide-react";

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
  is_active: boolean;
}

export function PricingPlansTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<PricingPlan | null>(null);
  const [formState, setFormState] = useState({
    name: "",
    subtitle: "",
    price: "",
    interval: "/month",
    button_text: "Select Plan",
    is_popular: false,
    is_active: true,
    features: [] as string[],
  });
  const [newFeature, setNewFeature] = useState("");

  const { data: plans, isLoading } = useQuery({
    queryKey: ["admin-pricing-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_plans")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as unknown as PricingPlan[];
    },
    staleTime: 0,
  });

  const saveMutation = useMutation({
    mutationFn: async (plan: typeof formState & { id?: string }) => {
      const payload = {
        name: plan.name,
        subtitle: plan.subtitle || null,
        price: plan.price,
        interval: plan.interval,
        button_text: plan.button_text,
        is_popular: plan.is_popular,
        is_active: plan.is_active,
        features: JSON.parse(JSON.stringify(plan.features)),
      };
      if (plan.id) {
        const { error } = await supabase.from("pricing_plans").update(payload).eq("id", plan.id);
        if (error) throw error;
      } else {
        const maxOrder = plans?.reduce((m, p) => Math.max(m, p.sort_order), 0) ?? 0;
        const { error } = await supabase.from("pricing_plans").insert({ ...payload, sort_order: maxOrder + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pricing-plans"] });
      queryClient.invalidateQueries({ queryKey: ["pricing-plans"] });
      setEditingPlan(null);
      toast({ title: "✅ Saved", description: "Pricing plan updated successfully." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pricing_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pricing-plans"] });
      queryClient.invalidateQueries({ queryKey: ["pricing-plans"] });
      toast({ title: "Deleted", description: "Plan removed." });
    },
  });

  const openEdit = (plan?: PricingPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormState({
        name: plan.name,
        subtitle: plan.subtitle || "",
        price: plan.price,
        interval: plan.interval,
        button_text: plan.button_text,
        is_popular: plan.is_popular,
        is_active: plan.is_active,
        features: Array.isArray(plan.features) ? [...plan.features] : [],
      });
    } else {
      setEditingPlan({ id: "" } as PricingPlan);
      setFormState({
        name: "",
        subtitle: "",
        price: "",
        interval: "/month",
        button_text: "Select Plan",
        is_popular: false,
        is_active: true,
        features: [],
      });
    }
    setNewFeature("");
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setFormState((s) => ({ ...s, features: [...s.features, newFeature.trim()] }));
      setNewFeature("");
    }
  };

  const removeFeature = (idx: number) => {
    setFormState((s) => ({ ...s, features: s.features.filter((_, i) => i !== idx) }));
  };

  const handleSave = () => {
    saveMutation.mutate({ ...formState, id: editingPlan?.id || undefined });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">Manage pricing plans visible on the student account page.</p>
        <Button onClick={() => openEdit()} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Add Plan
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans?.map((plan) => (
          <Card key={plan.id} className={`p-5 relative ${plan.is_popular ? "border-2 border-primary" : "border border-border"} ${!plan.is_active ? "opacity-60" : ""}`}>
            {plan.is_popular && (
              <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground border-0 text-xs">
                <Star className="w-3 h-3 mr-1 fill-current" /> Best Value
              </Badge>
            )}
            <div className="text-center mb-3 pt-1">
              <h3 className="font-bold text-foreground">{plan.name}</h3>
              {plan.subtitle && <p className="text-xs text-muted-foreground">{plan.subtitle}</p>}
              <p className="text-2xl font-bold text-primary mt-2">{plan.price}<span className="text-sm text-muted-foreground">{plan.interval}</span></p>
            </div>
            <ul className="space-y-1.5 text-sm mb-4">
              {(plan.features as string[]).slice(0, 4).map((f, i) => (
                <li key={i} className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" /> {f}
                </li>
              ))}
              {(plan.features as string[]).length > 4 && (
                <li className="text-xs text-muted-foreground">+{(plan.features as string[]).length - 4} more</li>
              )}
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                <Pencil className="w-3 h-3 mr-1" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(plan.id)}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan?.id ? "Edit Plan" : "New Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Plan Name</Label>
                <Input value={formState.name} onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Subtitle</Label>
                <Input placeholder="e.g. 2 subjects" value={formState.subtitle} onChange={(e) => setFormState((s) => ({ ...s, subtitle: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Price</Label>
                <Input placeholder="RM149" value={formState.price} onChange={(e) => setFormState((s) => ({ ...s, price: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Interval</Label>
                <Input placeholder="/month" value={formState.interval} onChange={(e) => setFormState((s) => ({ ...s, interval: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Button Text</Label>
                <Input value={formState.button_text} onChange={(e) => setFormState((s) => ({ ...s, button_text: e.target.value }))} />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={formState.is_popular} onCheckedChange={(v) => setFormState((s) => ({ ...s, is_popular: v }))} />
                <Label>Best Value Badge</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formState.is_active} onCheckedChange={(v) => setFormState((s) => ({ ...s, is_active: v }))} />
                <Label>Active</Label>
              </div>
            </div>

            {/* Features Manager */}
            <div className="space-y-2">
              <Label>Features / Perks</Label>
              <div className="space-y-1.5">
                {formState.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-1.5 text-sm">
                    <GripVertical className="w-3 h-3 text-muted-foreground" />
                    <span className="flex-1 text-foreground">{f}</span>
                    <button onClick={() => removeFeature(i)} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a feature..."
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFeature())}
                />
                <Button type="button" variant="outline" size="sm" onClick={addFeature}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
