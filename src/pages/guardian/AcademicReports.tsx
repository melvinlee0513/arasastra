import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export function AcademicReports() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Academic Reports</h1>
        <p className="text-muted-foreground">Detailed performance analysis</p>
      </div>
      <Card className="p-12 text-center bg-card border-border">
        <BarChart3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Coming Soon</h3>
        <p className="text-muted-foreground">Detailed academic reports will be available here.</p>
      </Card>
    </div>
  );
}
