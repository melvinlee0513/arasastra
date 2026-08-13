import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClassShell } from "@/components/class/ClassShell";
import { ClassHubEmptyState, ClassHubPanel, Illustration } from "@/components/class/ClassHubChrome";
import { STATE_ART } from "@/lib/classIllustrations";
import type { ClassContextData } from "@/hooks/useClassContext";

/**
 * DEV-ONLY visual QA harness for the Class Hub shell + Quizzes section.
 *
 * Not routed in production builds. Isolated static props, zero backend calls.
 * Used to inspect layout at mobile widths without a live tenant session.
 */

const CLASS: ClassContextData = {
  klass: {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Additional Mathematics — SPM Intensive Revision Class",
    description: null,
    scheduled_at: new Date(Date.now() + 864e5).toISOString(),
    duration_minutes: 90,
    cohort_label: "Form 5 · 2026 Cohort",
    schedule_label: "Every Saturday, 10:00 AM",
    status: "active",
    center_id: "c1",
    cover_image_path: null,
    cover_image_updated_at: null,
    subject: { name: "Additional Mathematics" },
  },
  tutors: [{ id: "t1", full_name: "Nurul Aisyah binti Rahman", display_name: null }],
  sameTenant: true,
  isEnrolled: true,
  isAssignedTutor: false,
  canManage: false,
  canView: true,
};

export default function ClassHubQaHarness() {
  const [params] = useSearchParams();
  const variant = params.get("v") ?? "empty";

  return (
    <ClassShell
      data={CLASS}
      isLoading={false}
      role="student"
      section="quizzes"
      basePath="/dashboard/classes/x"
      materialsPath="/dashboard/classes/x/materials"
      breadcrumbs={[{ label: "Home", to: "/" }, { label: "Quizzes" }]}
    >
      {variant === "empty" ? (
        <ClassHubEmptyState
          art={STATE_ART.quiz}
          title="No quizzes yet"
          description="Your tutor will publish quizzes here. You'll see them the moment they go live."
        />
      ) : (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <ClassHubPanel key={i} className="p-4">
              <div className="flex gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <Illustration src={STATE_ART.quiz} className="h-8 w-8" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-bold text-slate-900">Chapter {i}: Differentiation</h3>
                  <p className="mt-0.5 text-[13px] text-slate-500">10 questions · 15 min</p>
                  <div className="mt-2 flex gap-1.5">
                    <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/15">Available</Badge>
                  </div>
                </div>
              </div>
              <Button className="mt-3 min-h-[44px] w-full rounded-full">Start quiz</Button>
            </ClassHubPanel>
          ))}
        </div>
      )}
    </ClassShell>
  );
}
