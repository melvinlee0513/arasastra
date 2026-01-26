import { useEffect, useState, useMemo } from "react";
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks, addMinutes } from "date-fns";
import { Plus, Trash2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ClassItem {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  tutor_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  video_url: string | null;
  live_url: string | null;
  is_live: boolean;
  is_published: boolean;
  subject?: { name: string; color: string } | null;
  tutor?: { name: string } | null;
}

interface Subject {
  id: string;
  name: string;
  color: string | null;
}

interface Tutor {
  id: string;
  name: string;
}

interface TutorConflict {
  tutorId: string;
  tutorName: string;
  conflictingClass: ClassItem;
}

export function ScheduleManager() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Partial<ClassItem> | null>(null);
  const [conflict, setConflict] = useState<TutorConflict | null>(null);
  const { toast } = useToast();

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [classesRes, subjectsRes, tutorsRes] = await Promise.all([
        supabase
          .from("classes")
          .select("*, subject:subjects(name, color), tutor:tutors(name)")
          .order("scheduled_at", { ascending: true }),
        supabase.from("subjects").select("id, name, color").eq("is_active", true),
        supabase.from("tutors").select("id, name").eq("is_active", true),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (subjectsRes.error) throw subjectsRes.error;
      if (tutorsRes.error) throw tutorsRes.error;

      setClasses(classesRes.data || []);
      setSubjects(subjectsRes.data || []);
      setTutors(tutorsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load schedule data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check for tutor conflicts
  const checkTutorConflict = useMemo(() => {
    return (tutorId: string | null | undefined, scheduledAt: string | undefined, duration: number, excludeId?: string): TutorConflict | null => {
      if (!tutorId || !scheduledAt) return null;

      const newStart = new Date(scheduledAt);
      const newEnd = addMinutes(newStart, duration);

      for (const existingClass of classes) {
        if (existingClass.id === excludeId) continue;
        if (existingClass.tutor_id !== tutorId) continue;

        const existingStart = new Date(existingClass.scheduled_at);
        const existingEnd = addMinutes(existingStart, existingClass.duration_minutes);

        const hasOverlap =
          (newStart >= existingStart && newStart < existingEnd) ||
          (newEnd > existingStart && newEnd <= existingEnd) ||
          (newStart <= existingStart && newEnd >= existingEnd);

        if (hasOverlap) {
          const tutor = tutors.find((t) => t.id === tutorId);
          return {
            tutorId,
            tutorName: tutor?.name || "Unknown",
            conflictingClass: existingClass,
          };
        }
      }
      return null;
    };
  }, [classes, tutors]);

  useEffect(() => {
    if (editingClass?.tutor_id && editingClass?.scheduled_at) {
      const detected = checkTutorConflict(
        editingClass.tutor_id,
        editingClass.scheduled_at,
        editingClass.duration_minutes || 60,
        editingClass.id
      );
      setConflict(detected);
    } else {
      setConflict(null);
    }
  }, [editingClass?.tutor_id, editingClass?.scheduled_at, editingClass?.duration_minutes, checkTutorConflict, editingClass?.id]);

  const saveClass = async () => {
    if (!editingClass?.title || !editingClass?.scheduled_at) {
      toast({
        title: "Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    const tempId = editingClass.id || `temp-${Date.now()}`;
    const optimisticClass: ClassItem = {
      id: tempId,
      title: editingClass.title,
      description: editingClass.description || null,
      subject_id: editingClass.subject_id || null,
      tutor_id: editingClass.tutor_id || null,
      scheduled_at: editingClass.scheduled_at,
      duration_minutes: editingClass.duration_minutes || 60,
      video_url: editingClass.video_url || null,
      live_url: editingClass.live_url || null,
      is_live: editingClass.is_live || false,
      is_published: editingClass.is_published ?? true,
      subject: subjects.find((s) => s.id === editingClass.subject_id) || null,
      tutor: tutors.find((t) => t.id === editingClass.tutor_id) || null,
    };

    if (editingClass.id) {
      setClasses((prev) => prev.map((c) => (c.id === editingClass.id ? optimisticClass : c)));
    } else {
      setClasses((prev) => [...prev, optimisticClass]);
    }
    
    setIsDialogOpen(false);
    setEditingClass(null);
    setConflict(null);

    try {
      if (editingClass.id) {
        const { error } = await supabase
          .from("classes")
          .update({
            title: editingClass.title,
            description: editingClass.description,
            subject_id: editingClass.subject_id,
            tutor_id: editingClass.tutor_id,
            scheduled_at: editingClass.scheduled_at,
            duration_minutes: editingClass.duration_minutes || 60,
            video_url: editingClass.video_url,
            live_url: editingClass.live_url,
            is_live: editingClass.is_live,
            is_published: editingClass.is_published,
          })
          .eq("id", editingClass.id);

        if (error) throw error;
        toast({ title: "Success", description: "Class updated successfully" });
      } else {
        const { data, error } = await supabase.from("classes").insert({
          title: editingClass.title,
          description: editingClass.description,
          subject_id: editingClass.subject_id,
          tutor_id: editingClass.tutor_id,
          scheduled_at: editingClass.scheduled_at,
          duration_minutes: editingClass.duration_minutes || 60,
          video_url: editingClass.video_url,
          live_url: editingClass.live_url,
          is_live: editingClass.is_live || false,
          is_published: editingClass.is_published ?? true,
        }).select("*, subject:subjects(name, color), tutor:tutors(name)").single();

        if (error) throw error;
        
        setClasses((prev) => prev.map((c) => (c.id === tempId ? data : c)));
        toast({ title: "Success", description: "Class created successfully" });
      }
    } catch (error) {
      console.error("Error saving class:", error);
      fetchData();
      toast({
        title: "Error",
        description: "Failed to save class",
        variant: "destructive",
      });
    }
  };

  const deleteClass = async (id: string) => {
    const deletedClass = classes.find((c) => c.id === id);
    setClasses((prev) => prev.filter((c) => c.id !== id));

    try {
      const { error } = await supabase.from("classes").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Class deleted" });
    } catch (error) {
      console.error("Error deleting class:", error);
      if (deletedClass) {
        setClasses((prev) => [...prev, deletedClass]);
      }
      toast({
        title: "Error",
        description: "Failed to delete class",
        variant: "destructive",
      });
    }
  };

  const getClassesForDay = (date: Date) =>
    classes.filter((c) => isSameDay(new Date(c.scheduled_at), date));

  const openNewClassDialog = (date?: Date) => {
    setEditingClass({
      title: "",
      description: "",
      scheduled_at: date ? date.toISOString() : new Date().toISOString(),
      duration_minutes: 60,
      is_live: false,
      is_published: true,
    });
    setConflict(null);
    setIsDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Schedule Manager</h1>
          <p className="text-muted-foreground">Manage class schedules and timings</p>
        </div>
        <Button onClick={() => openNewClassDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Add Class
        </Button>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </Button>
        <span className="text-lg font-semibold text-foreground">
          {format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d, yyyy")}
        </span>
        <Button variant="outline" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Week View Calendar */}
      <Card className="p-4 bg-card border-border overflow-x-auto">
        <div className="grid grid-cols-7 gap-2 min-w-[700px]">
          {weekDays.map((day) => (
            <div key={day.toISOString()} className="space-y-2">
              <div
                className={`text-center p-2 rounded-lg ${
                  isSameDay(day, new Date())
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-xs font-medium">{format(day, "EEE")}</p>
                <p className="text-lg font-bold">{format(day, "d")}</p>
              </div>

              <div className="space-y-1 min-h-[100px]">
                {getClassesForDay(day).map((classItem) => (
                  <div
                    key={classItem.id}
                    className="p-2 rounded-lg bg-muted text-xs cursor-pointer hover:bg-accent/20 transition-colors"
                    onClick={() => {
                      setEditingClass(classItem);
                      setIsDialogOpen(true);
                    }}
                  >
                    <p className="font-medium truncate">{classItem.title}</p>
                    <p className="text-muted-foreground">
                      {format(new Date(classItem.scheduled_at), "HH:mm")}
                    </p>
                    {classItem.is_live && (
                      <Badge variant="destructive" className="mt-1 text-[10px]">
                        LIVE
                      </Badge>
                    )}
                  </div>
                ))}

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => openNewClassDialog(day)}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Class Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingClass?.id ? "Edit Class" : "New Class"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {/* Conflict Warning */}
            {conflict && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Scheduling Conflict:</strong> {conflict.tutorName} is already teaching "
                  {conflict.conflictingClass.title}" at{" "}
                  {format(new Date(conflict.conflictingClass.scheduled_at), "MMM d, HH:mm")}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={editingClass?.title || ""}
                onChange={(e) =>
                  setEditingClass((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Class title"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editingClass?.description || ""}
                onChange={(e) =>
                  setEditingClass((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Class description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select
                  value={editingClass?.subject_id || ""}
                  onValueChange={(value) =>
                    setEditingClass((prev) => ({ ...prev, subject_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tutor</Label>
                <Select
                  value={editingClass?.tutor_id || ""}
                  onValueChange={(value) =>
                    setEditingClass((prev) => ({ ...prev, tutor_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tutor" />
                  </SelectTrigger>
                  <SelectContent>
                    {tutors.map((tutor) => (
                      <SelectItem key={tutor.id} value={tutor.id}>
                        {tutor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date & Time *</Label>
                <Input
                  type="datetime-local"
                  value={
                    editingClass?.scheduled_at
                      ? format(new Date(editingClass.scheduled_at), "yyyy-MM-dd'T'HH:mm")
                      : ""
                  }
                  onChange={(e) =>
                    setEditingClass((prev) => ({
                      ...prev,
                      scheduled_at: new Date(e.target.value).toISOString(),
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={editingClass?.duration_minutes || 60}
                  onChange={(e) =>
                    setEditingClass((prev) => ({
                      ...prev,
                      duration_minutes: parseInt(e.target.value),
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Live URL (Zoom/Meet)</Label>
              <Input
                value={editingClass?.live_url || ""}
                onChange={(e) =>
                  setEditingClass((prev) => ({ ...prev, live_url: e.target.value }))
                }
                placeholder="https://zoom.us/..."
              />
            </div>

            <div className="space-y-2">
              <Label>Replay URL (YouTube/Vimeo)</Label>
              <Input
                value={editingClass?.video_url || ""}
                onChange={(e) =>
                  setEditingClass((prev) => ({ ...prev, video_url: e.target.value }))
                }
                placeholder="https://youtube.com/..."
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingClass?.is_live || false}
                  onCheckedChange={(checked) =>
                    setEditingClass((prev) => ({ ...prev, is_live: checked }))
                  }
                />
                <Label>Currently Live</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={editingClass?.is_published ?? true}
                  onCheckedChange={(checked) =>
                    setEditingClass((prev) => ({ ...prev, is_published: checked }))
                  }
                />
                <Label>Published</Label>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              {editingClass?.id && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    deleteClass(editingClass.id!);
                    setIsDialogOpen(false);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )}
              <Button onClick={saveClass} className="flex-1">
                Save Class
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
