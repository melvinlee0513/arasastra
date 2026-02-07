import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Star, Users, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

interface Tutor {
  id: string;
  name: string;
  avatar_url: string | null;
  specialization: string | null;
  bio: string | null;
  is_active: boolean;
  rating: number | null;
  years_experience: number | null;
  student_count: number | null;
}

export function TutorProfilesTab() {
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingTutor, setEditingTutor] = useState<Partial<Tutor> | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTutors();
  }, []);

  const fetchTutors = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("tutors")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      setTutors((data || []) as Tutor[]);
    } catch (error) {
      console.error("Error fetching tutors:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const uploadAvatar = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `tutors/${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage.from("cms-assets").upload(fileName, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("cms-assets").getPublicUrl(fileName);
    return data.publicUrl;
  };

  const saveTutor = async () => {
    if (!editingTutor?.name) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      let avatarUrl = editingTutor.avatar_url || null;
      if (avatarFile) {
        avatarUrl = await uploadAvatar(avatarFile);
      }

      const tutorData = {
        name: editingTutor.name,
        specialization: editingTutor.specialization || null,
        bio: editingTutor.bio || null,
        avatar_url: avatarUrl,
        is_active: editingTutor.is_active ?? true,
        rating: editingTutor.rating || 4.8,
        years_experience: editingTutor.years_experience || 0,
        student_count: editingTutor.student_count || 0,
      };

      if (editingTutor.id) {
        const { error } = await supabase.from("tutors").update(tutorData).eq("id", editingTutor.id);
        if (error) throw error;
        toast({ title: "✅ Tutor updated" });
      } else {
        const { error } = await supabase.from("tutors").insert(tutorData);
        if (error) throw error;
        toast({ title: "✅ Tutor added" });
      }

      setIsDialogOpen(false);
      setEditingTutor(null);
      setAvatarFile(null);
      fetchTutors();
    } catch (error) {
      console.error("Error saving tutor:", error);
      toast({ title: "Error", description: "Failed to save tutor", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const deleteTutor = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("tutors").delete().eq("id", deleteId);
      if (error) throw error;
      toast({ title: "✅ Tutor deleted" });
      setDeleteId(null);
      fetchTutors();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete tutor", variant: "destructive" });
    }
  };

  const openNewDialog = () => {
    setEditingTutor({ name: "", specialization: "", bio: "", is_active: true, rating: 4.8, years_experience: 0, student_count: 0 });
    setAvatarFile(null);
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Tutor Profiles</h2>
          <p className="text-sm text-muted-foreground">Manage tutor information, ratings, and videos</p>
        </div>
        <Button onClick={openNewDialog} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
          <Plus className="w-4 h-4 mr-2" />
          Add Tutor
        </Button>
      </div>

      {/* Tutor Grid */}
      {tutors.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No tutors yet</h3>
          <p className="text-sm text-muted-foreground">Add your first tutor to get started</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tutors.map((tutor) => (
            <Card key={tutor.id} className="overflow-hidden bg-card border-border hover:shadow-md transition-shadow">
              {/* Avatar Image */}
              <div className="aspect-[4/3] bg-muted overflow-hidden">
                {tutor.avatar_url ? (
                  <img
                    src={tutor.avatar_url}
                    alt={tutor.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-secondary">
                    <span className="text-5xl font-bold text-muted-foreground/30">
                      {tutor.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-foreground">{tutor.name}</h3>
                    <p className="text-sm text-muted-foreground">{tutor.specialization || "General"}</p>
                  </div>
                  <div className="flex items-center gap-1 text-accent">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="text-sm font-semibold">{tutor.rating?.toFixed(1) || "4.8"}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {(tutor.student_count || 0).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {tutor.years_experience || 0} years
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setEditingTutor(tutor);
                      setAvatarFile(null);
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
                    onClick={() => setDeleteId(tutor.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTutor?.id ? "Edit Tutor" : "Add Tutor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            {/* Avatar Upload */}
            <div className="space-y-2">
              <Label>Profile Photo</Label>
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={avatarFile ? URL.createObjectURL(avatarFile) : editingTutor?.avatar_url || undefined} />
                  <AvatarFallback className="bg-secondary text-lg">
                    {editingTutor?.name?.charAt(0)?.toUpperCase() || "T"}
                  </AvatarFallback>
                </Avatar>
                <label className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setAvatarFile(file);
                    }}
                  />
                  <div className="flex items-center justify-center h-10 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                    <span className="text-sm text-muted-foreground">Click to upload photo</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={editingTutor?.name || ""}
                onChange={(e) => setEditingTutor((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Mr. Ahmad"
              />
            </div>

            <div className="space-y-2">
              <Label>Specialization / Subject</Label>
              <Input
                value={editingTutor?.specialization || ""}
                onChange={(e) => setEditingTutor((prev) => ({ ...prev, specialization: e.target.value }))}
                placeholder="e.g. Physics & Add Maths"
              />
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                value={editingTutor?.bio || ""}
                onChange={(e) => setEditingTutor((prev) => ({ ...prev, bio: e.target.value }))}
                placeholder="Brief description..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Rating</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={editingTutor?.rating || 4.8}
                  onChange={(e) => setEditingTutor((prev) => ({ ...prev, rating: parseFloat(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Students</Label>
                <Input
                  type="number"
                  value={editingTutor?.student_count || 0}
                  onChange={(e) => setEditingTutor((prev) => ({ ...prev, student_count: parseInt(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Years Exp.</Label>
                <Input
                  type="number"
                  value={editingTutor?.years_experience || 0}
                  onChange={(e) => setEditingTutor((prev) => ({ ...prev, years_experience: parseInt(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTutor} disabled={isUploading}>
              {isUploading ? "Uploading..." : editingTutor?.id ? "Save Changes" : "Add Tutor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tutor</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this tutor profile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTutor} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
