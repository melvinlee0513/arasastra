/**
 * DEV-ONLY visual QA harness for the Class Hub shell + Home cards.
 * Static props only — never mounted in production builds.
 */
import { ClassShell } from "@/components/class/ClassShell";
import { ClassAnnouncementCard, ClassGlanceCard } from "@/components/class/ClassHomeCards";
import type { ClassContextData } from "@/hooks/useClassContext";

const DATA = {
  klass: {
    id: "qa", center_id: "qa", title: "Physics Form 5 Test",
    cohort_label: "Form 5 · 2026 Cohort", schedule_label: "Friday 2pm",
    scheduled_at: null, cover_image_path: null, cover_image_updated_at: null,
    subject: { id: "s", name: "Physics" },
  },
  tutors: [{ id: "t", full_name: "Tutor 1" }],
  canView: true, canManage: false, sameTenant: true, enrolled: true,
} as unknown as ClassContextData;

export default function ClassHubQaHarness() {
  return (
    <ClassShell
      data={DATA} isLoading={false} role="student" section="home"
      basePath="/dashboard/classes/qa" materialsPath="/dashboard/classes/qa/materials"
      breadcrumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Physics Form 5 Test" }]}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ClassAnnouncementCard
            announcement={{
              title: "TESTING 1",
              body: "Check your whatsapp group for latest updates!",
              is_pinned: true,
              published_at: "2026-08-08T04:17:03Z",
              created_at: "2026-08-08T04:17:03Z",
            }}
            allHref="#"
          />
        </div>
        <aside className="space-y-5">
          <ClassGlanceCard counts={{ replays: 6, notes: 1, worksheets: 0, links: 0 }} materialsPath="#" />
        </aside>
      </div>
    </ClassShell>
  );
}
