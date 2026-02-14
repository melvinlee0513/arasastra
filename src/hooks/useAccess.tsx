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
    if (profile?.id) {
      fetchEnrollments();
    } else {
      setEnrolledSubjects([]);
      setIsLoading(false);
    }
  }, [profile?.id]);

  const fetchEnrollments = async () => {
    try {
      const { data, error } = await supabase
        .from("enrollments")
        .select("subject_id, is_active, subject:subjects(id, name)")
        .eq("student_id", profile!.id)
        .eq("is_active", true);

      if (error) throw error;

      const mapped: EnrolledSubject[] = (data || []).map((e) => ({
        subject_id: e.subject_id,
        subject_name: (e.subject as any)?.name || "Unknown",
        is_active: e.is_active ?? false,
      }));

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
