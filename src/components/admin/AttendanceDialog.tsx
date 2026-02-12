import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Student {
  id: string;
  user_id: string;
  full_name: string;
  present: boolean;
}

interface AttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  classTitle: string;
  classDate: string;
}

export function AttendanceDialog({
  open,
  onOpenChange,
  classId,
  classTitle,
  classDate,
}: AttendanceDialogProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && classId) {
      fetchStudents();
    }
  }, [open, classId]);

  const fetchStudents = async () => {
    setIsLoading(true);
    try {
      // Get the class's subject to find enrolled students
      const { data: classData } = await supabase
        .from("classes")
        .select("subject_id")
        .eq("id", classId)
        .single();

      if (!classData?.subject_id) {
        setStudents([]);
        setIsLoading(false);
        return;
      }

      // Get enrolled students for this subject
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("student_id, profiles!enrollments_student_id_fkey(id, user_id, full_name)")
        .eq("subject_id", classData.subject_id)
        .eq("is_active", true);

      // Get existing attendance for this class
      const dateStr = new Date(classDate).toISOString().split("T")[0];
      const { data: existingAttendance } = await supabase
        .from("attendance")
        .select("user_id, status")
        .eq("class_id", classId)
        .eq("date", dateStr);

      const attendanceMap = new Map(
        (existingAttendance || []).map((a) => [a.user_id, a.status])
      );

      const studentList: Student[] = (enrollments || [])
        .filter((e) => e.profiles)
        .map((e) => {
          const profile = e.profiles as unknown as { id: string; user_id: string; full_name: string };
          return {
            id: profile.id,
            user_id: profile.user_id,
            full_name: profile.full_name,
            present: attendanceMap.get(profile.user_id) === "present",
          };
        });

      setStudents(studentList);
    } catch (error) {
      console.error("Error fetching students:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStudent = (userId: string) => {
    setStudents((prev) =>
      prev.map((s) => (s.user_id === userId ? { ...s, present: !s.present } : s))
    );
  };

  const saveAttendance = async () => {
    setIsSaving(true);
    const dateStr = new Date(classDate).toISOString().split("T")[0];

    try {
      // Upsert attendance records
      const records = students.map((s) => ({
        user_id: s.user_id,
        class_id: classId,
        date: dateStr,
        status: s.present ? "present" : "absent",
      }));

      const { error } = await supabase.from("attendance").upsert(records, {
        onConflict: "user_id,class_id,date",
      });

      if (error) throw error;

      const presentCount = students.filter((s) => s.present).length;
      toast({
        title: "✅ Attendance Saved",
        description: `${presentCount}/${students.length} students marked present`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving attendance:", error);
      toast({ title: "Error", description: "Failed to save attendance", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const markAll = (present: boolean) => {
    setStudents((prev) => prev.map((s) => ({ ...s, present })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark Attendance</DialogTitle>
          <p className="text-sm text-muted-foreground">{classTitle}</p>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={() => markAll(true)}>
            <Check className="w-3 h-3 mr-1" /> All Present
          </Button>
          <Button variant="outline" size="sm" onClick={() => markAll(false)}>
            <X className="w-3 h-3 mr-1" /> All Absent
          </Button>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {isLoading ? (
            Array(4)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-10" />
                </div>
              ))
          ) : students.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">
              No enrolled students for this class's subject
            </p>
          ) : (
            students.map((student) => (
              <div
                key={student.user_id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              >
                <span className="font-medium text-foreground text-sm">{student.full_name}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${student.present ? "text-green-400" : "text-red-400"}`}>
                    {student.present ? "Present" : "Absent"}
                  </span>
                  <Switch checked={student.present} onCheckedChange={() => toggleStudent(student.user_id)} />
                </div>
              </div>
            ))
          )}
        </div>

        <Button onClick={saveAttendance} disabled={isSaving || students.length === 0} className="w-full mt-4">
          {isSaving ? "Saving..." : "Save Attendance"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
