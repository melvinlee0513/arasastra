import { useState, useEffect } from "react";
import { Users, Search, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface StudentInfo {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  form_year: string | null;
  subject_name: string;
}

export function TutorStudents() {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (user?.id) fetchStudents();
  }, [user?.id]);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      // Get tutor record to find specialization
      const { data: tutor } = await supabase
        .from("tutors")
        .select("id, specialization")
        .eq("user_id", user!.id)
        .single();

      if (!tutor?.specialization) { setIsLoading(false); return; }

      // Find subjects matching specialization
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id, name")
        .eq("name", tutor.specialization)
        .eq("is_active", true);

      if (!subjects || subjects.length === 0) { setIsLoading(false); return; }

      const subjectIds = subjects.map((s) => s.id);
      const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

      // Get enrollments for those subjects
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("student_id, subject_id")
        .in("subject_id", subjectIds)
        .eq("is_active", true);

      if (!enrollments || enrollments.length === 0) { setIsLoading(false); return; }

      const studentIds = [...new Set(enrollments.map((e) => e.student_id))];

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, form_year")
        .in("id", studentIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      const mapped: StudentInfo[] = enrollments.map((e) => {
        const p = profileMap.get(e.student_id);
        return {
          id: e.student_id,
          full_name: p?.full_name || "Unknown",
          email: p?.email || null,
          avatar_url: p?.avatar_url || null,
          form_year: p?.form_year || null,
          subject_name: subjectMap.get(e.subject_id) || "Unknown",
        };
      });

      // Deduplicate by student id
      const unique = Array.from(
        new Map(mapped.map((s) => [s.id, s])).values()
      );

      setStudents(unique);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = students.filter((s) =>
    s.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-12 w-full" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Students</h1>
        <p className="text-muted-foreground">{students.length} enrolled students</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search students..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No students found</h3>
          <p className="text-sm text-muted-foreground">
            {students.length === 0
              ? "No students enrolled in your subjects yet"
              : "Try adjusting your search"}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((student) => (
            <Card key={student.id} className="p-4 bg-card border-border hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={student.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {student.full_name.split(" ").map((n) => n[0]).join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{student.full_name}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {student.email || "No email"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {student.form_year && (
                    <Badge variant="secondary" className="text-xs">{student.form_year}</Badge>
                  )}
                  <Badge variant="outline" className="text-xs">{student.subject_name}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
