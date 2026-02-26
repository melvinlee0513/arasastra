import { Card } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

/**
 * GuardianBilling — Placeholder for payment history.
 * Soft-Tech glassmorphism empty state.
 */
export function GuardianBilling() {
  return (
    <div className="p-6 md:p-10 space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-1">View payment history and invoices</p>
      </div>
      <Card className="p-16 text-center bg-card/70 backdrop-blur-md border-border/40 rounded-2xl shadow-sm">
        <div className="w-20 h-20 rounded-full bg-secondary/60 flex items-center justify-center mx-auto mb-5">
          <CreditCard className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Coming Soon</h3>
        <p className="text-muted-foreground max-w-sm mx-auto">
          Payment history, downloadable receipts, and billing details will appear here.
        </p>
      </Card>
    </div>
  );
}
