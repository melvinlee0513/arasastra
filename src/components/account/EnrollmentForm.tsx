import { useState, forwardRef } from "react";
import { Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import confetti from "canvas-confetti";

interface EnrollmentFormProps {
  selectedPlanName: string | null;
  selectedPlanPrice: string | null;
  selectedPlanInterval: string | null;
  userName?: string;
  userEmail?: string;
  userFormYear?: string | null;
  onEnrollmentComplete?: (planPrice: string | null) => void;
}

export const EnrollmentForm = forwardRef<HTMLDivElement, EnrollmentFormProps>(
  ({ selectedPlanName, selectedPlanPrice, selectedPlanInterval, userName, userEmail, userFormYear, onEnrollmentComplete }, ref) => {
    const { toast } = useToast();
    const { user } = useAuth();
    const [studentName, setStudentName] = useState(userName || "");
    const [level, setLevel] = useState(userFormYear || "");
    const [parentName, setParentName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState(userEmail || "");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedPlanName) {
        toast({ title: "Please select a plan", description: "Choose a pricing plan above before enrolling.", variant: "destructive" });
        return;
      }
      if (!user?.id) return;

      setIsSubmitting(true);
      try {
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: studentName,
            form_year: level,
            parent_name: parentName,
            phone: phone,
            is_registered: true,
          } as any)
          .eq("user_id", user.id);

        if (error) throw error;

        // Confetti celebration
        confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, colors: ["#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"] });
        setTimeout(() => confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } }), 200);
        setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } }), 400);

        toast({
          title: "Registration Complete! 🎉",
          description: "Welcome aboard! Now complete your payment to unlock classes.",
        });

        onEnrollmentComplete?.(selectedPlanPrice);
      } catch (error) {
        console.error("Enrollment error:", error);
        toast({ title: "Registration failed", description: "Please try again.", variant: "destructive" });
      } finally {
        setIsSubmitting(false);
      }
    };

    const planDisplay = selectedPlanName
      ? `${selectedPlanName} Package – ${selectedPlanPrice}${selectedPlanInterval}`
      : "No plan selected";

    return (
      <Card ref={ref} id="enrollment-form" className="p-6 bg-card border border-border">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-5 h-5 text-accent" />
          <h3 className="text-xl font-bold text-foreground">Student Registration</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Fill in the details below to complete your enrollment
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Student Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Enter student's full name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Level / Form <span className="text-destructive">*</span></Label>
              <Select value={level} onValueChange={setLevel} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Form 1">Form 1</SelectItem>
                  <SelectItem value="Form 2">Form 2</SelectItem>
                  <SelectItem value="Form 3">Form 3</SelectItem>
                  <SelectItem value="Form 4">Form 4</SelectItem>
                  <SelectItem value="Form 5">Form 5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Parent Details */}
          <p className="text-sm font-semibold text-foreground pt-2">Parent / Guardian Details</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Parent's full name"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number <span className="text-destructive">*</span></Label>
              <Input
                placeholder="+60 12-345 6789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label>Email Address</Label>
            <Input
              type="email"
              placeholder="parent@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Selected Plan Display */}
          <div className="rounded-lg bg-accent/10 border border-accent/20 p-4">
            <p className="text-xs text-muted-foreground">Selected Plan</p>
            <p className="text-sm font-semibold text-primary">{planDisplay}</p>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Processing..." : "Complete Enrollment"}
          </Button>
        </form>
      </Card>
    );
  }
);

EnrollmentForm.displayName = "EnrollmentForm";
