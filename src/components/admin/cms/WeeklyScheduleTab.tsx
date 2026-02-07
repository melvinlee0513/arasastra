import { useState, useEffect } from "react";
import { format, addMinutes } from "date-fns";
import { Plus, Pencil, Trash2, Calendar, Clock, User, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  subject?: { name: string; color: string | null } | null;
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

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SUBJECT_COLORS = [
  "bg-violet-100 border-violet-200 text-violet-700",
  "bg-pink-100 border-pink-200 text-pink-700",
  "bg-emerald-100 border-emerald-200 text-emerald-700",
  "bg-orange-100 border-orange-200 text-orange-700",
  "bg-blue-100 border-blue-200 text-blue-700",
  "bg-amber-100 border-amber-200 text-amber-700",
  "bg-cyan-100 border-cyan-200 text-cyan-700",
];

export function WeeklyScheduleTab() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingClass, setEditingClass] = useState<Partial<ClassItem> | null>(null);
  const { toast } = useToast();

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
      setClasses(classesRes.data || []);
      setSubjects(subjectsRes.data || []);
      setTutors(tutorsRes.data || []);
    } catch (error) {
      console.error("Error fetching schedule data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSubjectColorClass = (subjectName: string | undefined) => {
    if (!subjectName) return SUBJECT_COLORS[0];
    const index = subjects.findIndex(s => s.name === subjectName);
    return SUBJECT_COLORS[index >= 0 ? index % SUBJECT_COLORS.length : 0];
  };

  // Group classes by day of week
  const groupedByDay = DAY_NAMES.map((dayName, dayIndex) => {
    const dayClasses = classes.filter((c) => {
      const d = new Date(c.scheduled_at);
      // getDay() returns 0=Sun, we want 0=Mon
      const classDay = (d.getDay() + 6) % 7;
      return classDay === dayIndex;
    }).sort((a, b) => {
      const timeA = new Date(a.scheduled_at).getHours() * 60 + new Date(a.scheduled_at).getMinutes();
      const timeB = new Date(b.scheduled_at).getHours() * 60 + new Date(b.scheduled_at).getMinutes();
      return timeA - timeB;
    });
    return { dayName, dayIndex, classes: dayClasses };
  }).filter(group => {
    if (dayFilter === "all") return group.classes.length > 0;
    return group.dayName === dayFilter;
  });

  const saveClass = async () => {
    if (!editingClass?.title || !editingClass?.scheduled_at) {
      toast({ title: "Error", description: "Please fill in required fields", variant: "destructive" });
      return;
    }

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
        toast({ title: "✅ Class updated" });
      } else {
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
        toast({ title: "✅ Class created" });
      }
      setIsDialogOpen(false);
      setEditingClass(null);
      fetchData();
    } catch (error) {
      console.error("Error saving class:", error);
      toast({ title: "Error", description: "Failed to save class", variant: "destructive" });
    }
  };

  const deleteClass = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("classes").delete().eq("id", deleteId);
      if (error) throw error;
      toast({ title: "✅ Class deleted" });
      setDeleteId(null);
      fetchData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete class", variant: "destructive" });
    }
  };

  const openNewDialog = () => {
    setEditingClass({
      title: "",
      description: "",
      scheduled_at: new Date().toISOString(),
      duration_minutes: 60,
      is_live: false,
      is_published: true,
    });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Weekly Schedule</h2>
          <p className="text-sm text-muted-foreground">Manage class time slots and subjects</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <Select value={dayFilter} onValueChange={setDayFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Days</SelectItem>
                {DAY_NAMES.map((day) => (
                  <SelectItem key={day} value={day}>{day}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={openNewDialog} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            <Plus className="w-4 h-4 mr-2" />
            Add Class
          </Button>
        </div>
      </div>

      {/* Grouped by Day */}
      {groupedByDay.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No classes scheduled</h3>
          <p className="text-sm text-muted-foreground">Add your first class to get started</p>
        </Card>
      ) : (
        groupedByDay.map(({ dayName, classes: dayClasses }) => (
          <Card key={dayName} className="p-5 bg-card border-border">
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <h3 className="text-lg font-bold text-foreground">{dayName}</h3>
              <Badge variant="destructive" className="text-xs">
                {dayClasses.length} {dayClasses.length === 1 ? "class" : "classes"}
              </Badge>
            </div>

            <div className="space-y-3">
              {dayClasses.map((classItem, idx) => {
                const colorClass = getSubjectColorClass(classItem.subject?.name);
                const hours = Math.floor((classItem.duration_minutes || 60) / 60);
                const mins = (classItem.duration_minutes || 60) % 60;
                const durationStr = hours > 0
                  ? mins > 0 ? `${hours}h${mins}m` : `${hours}h`
                  : `${mins}m`;

                return (
                  <div
                    key={classItem.id}
                    className={`flex items-center gap-4 p-4 rounded-xl border ${colorClass} transition-all hover:shadow-sm`}
                  >
                    {/* Time */}
                    <div className="text-center min-w-[60px]">
                      <p className="text-lg font-bold">
                        {format(new Date(classItem.scheduled_at), "HH:mm")}
                      </p>
                      <p className="text-xs opacity-70">{durationStr}</p>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{classItem.subject?.name || classItem.title}</p>
                      <div className="flex items-center gap-3 text-xs opacity-70 mt-0.5">
                        {classItem.tutor && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {classItem.tutor.name}
                          </span>
                        )}
                        {classItem.description && (
                          <span className="flex items-center gap-1">
                            <GraduationCap className="w-3 h-3" />
                            {classItem.description}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingClass(classItem);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(classItem.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingClass?.id ? "Edit Class" : "New Class"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={editingClass?.title || ""}
                onChange={(e) => setEditingClass((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Class title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description / Form Level</Label>
              <Input
                value={editingClass?.description || ""}
                onChange={(e) => setEditingClass((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="e.g. Form 5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select
                  value={editingClass?.subject_id || "none"}
                  onValueChange={(v) => setEditingClass((prev) => ({ ...prev, subject_id: v === "none" ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tutor</Label>
                <Select
                  value={editingClass?.tutor_id || "none"}
                  onValueChange={(v) => setEditingClass((prev) => ({ ...prev, tutor_id: v === "none" ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select tutor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {tutors.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
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
                  value={editingClass?.scheduled_at ? format(new Date(editingClass.scheduled_at), "yyyy-MM-dd'T'HH:mm") : ""}
                  onChange={(e) => setEditingClass((prev) => ({ ...prev, scheduled_at: new Date(e.target.value).toISOString() }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  value={editingClass?.duration_minutes || 60}
                  onChange={(e) => setEditingClass((prev) => ({ ...prev, duration_minutes: parseInt(e.target.value) }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Live URL</Label>
              <Input
                value={editingClass?.live_url || ""}
                onChange={(e) => setEditingClass((prev) => ({ ...prev, live_url: e.target.value }))}
                placeholder="https://zoom.us/..."
              />
            </div>
            <div className="space-y-2">
              <Label>Replay URL</Label>
              <Input
                value={editingClass?.video_url || ""}
                onChange={(e) => setEditingClass((prev) => ({ ...prev, video_url: e.target.value }))}
                placeholder="https://youtube.com/..."
              />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingClass?.is_live || false}
                  onCheckedChange={(v) => setEditingClass((prev) => ({ ...prev, is_live: v }))}
                />
                <Label>Live Now</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingClass?.is_published ?? true}
                  onCheckedChange={(v) => setEditingClass((prev) => ({ ...prev, is_published: v }))}
                />
                <Label>Published</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveClass}>{editingClass?.id ? "Save Changes" : "Create Class"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The class will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteClass} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
