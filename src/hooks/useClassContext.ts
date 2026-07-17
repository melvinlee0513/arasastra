import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";

export type ClassContextData = {
  klass: {
    id: string;
    title: string;
    description: string | null;
    scheduled_at: string | null;
    duration_minutes: number | null;
    cohort_label: string | null;
    schedule_label: string | null;
    status: string;
    center_id: string | null;
    cover_image_path: string | null;
    cover_image_updated_at: string | null;
    subject: { name: string } | null;
  } | null;
  tutors: {
    id: string;
    full_name: string | null;
    display_name: string | null;
    avatar_url?: string | null;
  }[];
  sameTenant: boolean;
  isEnrolled: boolean;
  isAssignedTutor: boolean;
  canManage: boolean;
  canView: boolean;
};

export function useClassContext(classId: string | undefined) {
  const { user, isAdmin } = useAuth();
  const { currentTenantId, isLoading: tenantLoading } = useTenant();

  return useQuery<ClassContextData>({
    queryKey: ["class-context", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && !tenantLoading,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: klass, error } = await supabase
        .from("classes")
        .select(
          "id,title,description,scheduled_at,duration_minutes,cohort_label,schedule_label,status,center_id,cover_image_path,cover_image_updated_at,subject:subjects(name)",
        )
        .eq("id", classId!)
        .maybeSingle();
      if (error) throw error;
      if (!klass) {
        return {
          klass: null,
          tutors: [],
          sameTenant: false,
          isEnrolled: false,
          isAssignedTutor: false,
          canManage: false,
          canView: false,
        };
      }

      const sameTenant =
        !currentTenantId || !klass.center_id || klass.center_id === currentTenantId;

      const [{ data: enrol }, { data: ct }] = await Promise.all([
        supabase
          .from("class_enrollments")
          .select("id")
          .eq("class_id", klass.id)
          .eq("student_user_id", user!.id)
          .eq("status", "active")
          .maybeSingle(),
        supabase
          .from("class_tutors")
          .select("tutor_user_id")
          .eq("class_id", klass.id),
      ]);

      const tutorIds = (ct || [])
        .map((r: { tutor_user_id: string }) => r.tutor_user_id)
        .filter(Boolean);
      const isAssignedTutor = !!user && tutorIds.includes(user.id);

      let tutors: ClassContextData["tutors"] = [];
      if (tutorIds.length) {
        // Safe cross-role read that returns display_name/full_name without emails.
        const { data: profs, error: pErr } = await supabase.rpc("get_public_profiles", {
          _user_ids: tutorIds,
        });
        if (pErr) throw pErr;
        tutors = (profs || []).map((p: {
          user_id: string;
          full_name: string | null;
          display_name: string | null;
          avatar_path: string | null;
        }) => ({
          id: p.user_id,
          full_name: p.full_name,
          display_name: p.display_name,
          avatar_url: p.avatar_path,
        }));
      }

      const canManage = (isAdmin && sameTenant) || isAssignedTutor;
      const canView = canManage || !!enrol;

      return {
        klass: klass as ClassContextData["klass"],
        tutors,
        sameTenant,
        isEnrolled: !!enrol,
        isAssignedTutor,
        canManage,
        canView,
      };
    },
  });
}
