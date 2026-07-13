import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Upload, FolderOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { format } from "date-fns";

type AssignedClass = {
  id: string;
  title: string;
  scheduled_at: string;
  center_id: string | null;
  subject: { name: string | null; icon: string | null } | null;
};

/**
 * TutorUpload — assigned-class picker.
 *
 * The canonical resource-authoring surface lives on
 * /tutor/classes/:classId/resources (TutorClassResources), which writes to
 * public.class_resources with `uploaded_by = auth.uid()`, `center_id` and
 * `class_id` derived from the assigned class. This screen simply routes the
 * tutor to the correct class first, so nothing here touches the legacy
 * public.tutors / classes.tutor_id path any more.
 */
export function TutorUpload() {
  const { user, hasRole } = useAuth();
  const { currentTenantId } = useTenant();
  const [classes, setClasses] = useState<AssignedClass[]>([]);
  const [loading, setLoading] = useState(true);

  const isTutor = hasRole("tutor");

  useEffect(() => {
    if (!user?.id || !currentTenantId || !isTutor) {
      setLoading(false);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentTenantId, isTutor]);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("class_tutors")
        .select(
          `class:classes!class_tutors_class_id_fkey(
            id, title, scheduled_at, center_id,
            subject:subjects(name, icon)
          )`,
        )
        .eq("tutor_user_id", user!.id)
        .eq("center_id", currentTenantId!);

      if (error) throw error;

      const rows = ((data ?? []) as Array<{ class: AssignedClass | null }>)
        .map((r) => r.class)
        .filter((c): c is AssignedClass => !!c && c.center_id === currentTenantId)
        .sort(
          (a, b) =>
            new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
        );

      setClasses(rows);
    } catch (err) {
      showSupabaseError(err, "Could not load your classes");
    } finally {
      setLoading(false);
    }
  }

  if (!isTutor) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card className="p-8 text-center bg-card border-border">
          <h2 className="font-semibold text-foreground">Tutor access required</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your account does not have the tutor role in this centre.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Upload material</h1>
        <p className="text-muted-foreground">
          Pick one of your assigned classes to attach notes, replay videos, worksheets
          or external links. Materials are saved to that class only.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No classes assigned yet.</h3>
          <p className="text-sm text-muted-foreground">
            Contact your centre administrator.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {classes.map((cls) => (
            <Card
              key={cls.id}
              className="p-4 bg-card border-border hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
                  {cls.subject?.icon || "📚"}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{cls.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {cls.subject?.name ?? "Class"} •{" "}
                    {format(new Date(cls.scheduled_at), "MMM d, h:mm a")}
                  </p>
                </div>
                <Button asChild size="sm" className="rounded-full">
                  <Link to={`/tutor/classes/${cls.id}/resources`}>
                    <Upload className="w-4 h-4 mr-1" /> Attach material
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
