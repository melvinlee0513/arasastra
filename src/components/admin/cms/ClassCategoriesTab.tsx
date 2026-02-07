import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Star, Users, Eye, EyeOff, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface Subject {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  enrollment_count?: number;
}

const EMOJI_OPTIONS = ["📐", "🔬", "🧪", "🧬", "📊", "📚", "📝", "🌍", "💻", "🎨", "🎵", "⚽", "🧮", "📖", "🔢", "🌿", "💰", "🗣️"];

export function ClassCategoriesTab() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingSubject, setEditingSubject] = useState<Partial<Subject> | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;

      // Fetch enrollment counts
      const subjectIds = (data || []).map((s) => s.id);
      const enrollmentCounts: Record<string, number> = {};

      if (subjectIds.length > 0) {
        const enrollmentPromises = subjectIds.map(async (id) => {
          const { count } = await supabase
            .from("enrollments")
            .select("id", { count: "exact", head: true })
            .eq("subject_id", id);
          return { id, count: count || 0 };
        });
        const results = await Promise.all(enrollmentPromises);
        results.forEach((r) => (enrollmentCounts[r.id] = r.count));
      }

      setSubjects(
        (data || []).map((s) => ({
          ...s,
          is_active: s.is_active ?? true,
          enrollment_count: enrollmentCounts[s.id] || 0,
        }))
      );
    } catch (error) {
      console.error("Error fetching subjects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVisibility = async (subject: Subject) => {
    const newActive = !subject.is_active;
    // Optimistic update
    setSubjects((prev) =>
      prev.map((s) => (s.id === subject.id ? { ...s, is_active: newActive } : s))
    );

    try {
      const { error } = await supabase
        .from("subjects")
        .update({ is_active: newActive })
        .eq("id", subject.id);
      if (error) throw error;
      toast({ title: newActive ? "✅ Subject visible" : "Subject hidden" });
    } catch (error) {
      // Rollback
      setSubjects((prev) =>
        prev.map((s) => (s.id === subject.id ? { ...s, is_active: !newActive } : s))
      );
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  };

  const saveSubject = async () => {
    if (!editingSubject?.name) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    try {
      const subjectData = {
        name: editingSubject.name,
        description: editingSubject.description || null,
        icon: editingSubject.icon || "📚",
        color: editingSubject.color || null,
        is_active: editingSubject.is_active ?? true,
      };

      if (editingSubject.id) {
        const { error } = await supabase.from("subjects").update(subjectData).eq("id", editingSubject.id);
        if (error) throw error;
        toast({ title: "✅ Subject updated" });
      } else {
        const { error } = await supabase.from("subjects").insert(subjectData);
        if (error) throw error;
        toast({ title: "✅ Subject added" });
      }

      setIsDialogOpen(false);
      setEditingSubject(null);
      fetchSubjects();
    } catch (error) {
      console.error("Error saving subject:", error);
      toast({ title: "Error", description: "Failed to save subject", variant: "destructive" });
    }
  };

  const deleteSubject = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("subjects").delete().eq("id", deleteId);
      if (error) throw error;
      toast({ title: "✅ Subject deleted" });
      setDeleteId(null);
      fetchSubjects();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete subject", variant: "destructive" });
    }
  };

  const filteredSubjects = subjects.filter((s) => {
    if (filter === "active") return s.is_active;
    if (filter === "hidden") return !s.is_active;
    return true;
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Class Categories</h2>
          <p className="text-sm text-muted-foreground">Manage subject icons and class information</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              setEditingSubject({ name: "", description: "", icon: "📚", is_active: true });
              setIsDialogOpen(true);
            }}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Class
          </Button>
        </div>
      </div>

      {/* Subject Grid */}
      {filteredSubjects.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No subjects found</h3>
          <p className="text-sm text-muted-foreground">Add your first subject category</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSubjects.map((subject) => (
            <Card key={subject.id} className="p-4 bg-card border-border hover:shadow-md transition-shadow relative">
              {/* Hidden Badge */}
              {!subject.is_active && (
                <div className="absolute top-3 right-3 flex items-center gap-1 text-xs text-muted-foreground">
                  <EyeOff className="w-3 h-3" />
                  Hidden
                </div>
              )}

              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl flex-shrink-0">
                  {subject.icon || "📚"}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground truncate">{subject.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">{subject.description || "—"}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {(subject.enrollment_count || 0).toLocaleString()}
                </span>
                {(subject.enrollment_count || 0) > 5 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Popular</Badge>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setEditingSubject(subject);
                    setIsDialogOpen(true);
                  }}
                >
                  <Pencil className="w-3 h-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteId(subject.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSubject?.id ? "Edit Subject" : "Add Subject"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={editingSubject?.name || ""}
                onChange={(e) => setEditingSubject((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Additional Mathematics"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editingSubject?.description || ""}
                onChange={(e) => setEditingSubject((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="e.g. Form 4 & 5"
              />
            </div>

            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                      editingSubject?.icon === emoji
                        ? "bg-primary text-primary-foreground ring-2 ring-ring"
                        : "bg-secondary hover:bg-secondary/80"
                    }`}
                    onClick={() => setEditingSubject((prev) => ({ ...prev, icon: emoji }))}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Color (hex)</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={editingSubject?.color || ""}
                  onChange={(e) => setEditingSubject((prev) => ({ ...prev, color: e.target.value }))}
                  placeholder="#7c3aed"
                />
                <div
                  className="w-10 h-10 rounded-lg border border-border flex-shrink-0"
                  style={{ backgroundColor: editingSubject?.color || "#7c3aed" }}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={editingSubject?.is_active ?? true}
                onCheckedChange={(v) => setEditingSubject((prev) => ({ ...prev, is_active: v }))}
              />
              <Label>Active (visible to students)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveSubject}>
              {editingSubject?.id ? "Save Changes" : "Add Subject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subject</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this subject and may affect related enrollments.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSubject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
