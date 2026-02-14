import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function AccessDenied() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center bg-card border-border">
        <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">
          You don't have an active enrollment for this subject. Please upgrade your plan to access this content.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" asChild>
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
          <Button asChild>
            <Link to="/account">Upgrade Plan</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
