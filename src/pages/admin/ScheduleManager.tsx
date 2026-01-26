import { useEffect, useState } from "react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { Calendar, Clock, Plus, Edit, Trash2, Video } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

export function ScheduleManager() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Partial<ClassItem> | null>(null);
  const { toast } = useToast();

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
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

  const saveClass = async () => {
    if (!editingClass?.title || !editingClass?.scheduled_at) {
      toast({
        title: "Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingClass.id) {
        // Update
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
        // Create
        const { error } = await supabase.from("classes").insert({
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
        });

        if (error) throw error;
        toast({ title: "Success", description: "Class created successfully" });
      }

      setIsDialogOpen(false);
      setEditingClass(null);
      fetchData();
    } catch (error) {
      console.error("Error saving class:", error);
      toast({
        title: "Error",
        description: "Failed to save class",
        variant: "destructive",
      });
    }
  };

  const deleteClass = async (id: string) => {
    try {
      const { error } = await supabase.from("classes").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Class deleted" });
      fetchData();
    } catch (error) {
      console.error("Error deleting class:", error);
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
