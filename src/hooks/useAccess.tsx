import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface EnrolledSubject {
  subject_id: string;
  subject_name: string;
  is_active: boolean;
}

export function useAccess() {
  const { profile, user } = useAuth();
  const [enrolledSubjects, setEnrolledSubjects] = useState<EnrolledSubject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchEnrollments();
    } else {
      setEnrolledSubjects([]);
      setIsLoading(false);
    }
  }, [user?.id]);

  const fetchEnrollments = async () => {
    try {
      // Canonical: derive subjects from enrolled classes
      const { data, error } = await supabase
        .from("class_enrollments")
        .select("classes:classes!class_enrollments_class_id_fkey(subject:subjects(id, name))")
        .eq("student_user_id", user!.id)
        .eq("status", "active");

      if (error) throw error;

      const seen = new Set<string>();
      const mapped: EnrolledSubject[] = [];
      for (const row of (data || []) as any[]) {
        const s = row.classes?.subject;
        if (s?.id && !seen.has(s.id)) {
          seen.add(s.id);
          mapped.push({ subject_id: s.id, subject_name: s.name || "Unknown", is_active: true });
        }
      }

      setEnrolledSubjects(mapped);
    } catch (error) {
      console.error("Error fetching enrollments:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const hasAccess = (subjectId: string): boolean => {
    return enrolledSubjects.some((e) => e.subject_id === subjectId && e.is_active);
  };

  const hasAccessByName = (subjectName: string): boolean => {
    return enrolledSubjects.some(
      (e) => e.subject_name.toLowerCase() === subjectName.toLowerCase() && e.is_active
    );
  };

  return {
    enrolledSubjects,
    isLoading,
    hasAccess,
    hasAccessByName,
    refetch: fetchEnrollments,
  };
}
