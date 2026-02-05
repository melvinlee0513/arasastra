import { useState, useEffect } from "react";
import { Plus, Upload, FileText, Trash2, Search, Filter, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/hooks/useAuth";

interface Note {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  file_url: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  created_at: string | null;
}

interface Subject {
  id: string;
  name: string;
  color: string | null;
}

export function NotesManagement() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
 const [isRefreshing, setIsRefreshing] = useState(false);

  // Form state
  const [uploadForm, setUploadForm] = useState({
    title: "",
    description: "",
    subject_id: "",
    file: null as File | null,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [notesRes, subjectsRes] = await Promise.all([
        supabase.from("notes").select("*").order("created_at", { ascending: false }),
        supabase.from("subjects").select("id, name, color").eq("is_active", true),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (subjectsRes.error) throw subjectsRes.error;

      setNotes(notesRes.data || []);
      setSubjects(subjectsRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load notes",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

 const handleRefresh = async () => {
   setIsRefreshing(true);
   await fetchData();
   setIsRefreshing(false);
   toast({
     title: "✅ Refreshed",
     description: "Notes list has been updated",
   });
 };

  const filteredNotes = notes.filter((note) => {
    const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject = selectedSubject === "all" || note.subject_id === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast({
          title: "Invalid File",
          description: "Please upload a PDF file",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Maximum file size is 10MB",
          variant: "destructive",
        });
        return;
      }
      setUploadForm((prev) => ({ ...prev, file }));
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.title || !uploadForm.file) {
      toast({
        title: "Missing Fields",
        description: "Please provide a title and select a file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const file = uploadForm.file;
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `notes/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("notes")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from("notes").getPublicUrl(filePath);

      // Insert into notes table
      const { data: noteData, error: insertError } = await supabase
        .from("notes")
        .insert({
          title: uploadForm.title,
          description: uploadForm.description || null,
          subject_id: uploadForm.subject_id || null,
          file_url: urlData.publicUrl,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          uploaded_by: user?.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setNotes((prev) => [noteData, ...prev]);
      setIsUploadOpen(false);
      setUploadForm({ title: "", description: "", subject_id: "", file: null });

      toast({
        title: "Success",
        description: "Note uploaded successfully",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    setIsDeleting(true);
    try {
      const note = notes.find((n) => n.id === deleteId);
      if (!note) return;

      // Extract file path from URL
      const urlParts = note.file_url.split("/notes/");
      if (urlParts.length > 1) {
        const filePath = `notes/${urlParts[1]}`;
        await supabase.storage.from("notes").remove([filePath]);
      }

      // Delete from database
      const { error } = await supabase.from("notes").delete().eq("id", deleteId);
      if (error) throw error;

      setNotes((prev) => prev.filter((n) => n.id !== deleteId));
      toast({
        title: "Deleted",
        description: "Note has been removed",
      });
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: "Failed to delete note",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "Unknown";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getSubjectName = (subjectId: string | null): string => {
    if (!subjectId) return "No Subject";
    return subjects.find((s) => s.id === subjectId)?.name || "Unknown";
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-20 bg-muted rounded" />
          <div className="h-20 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Notes Bank</h1>
          <p className="text-muted-foreground">Upload and manage study materials</p>
        </div>
        <div className="flex gap-2">
         <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
           <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsUploadOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Upload Note
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 bg-card border-border">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <EmptyState
          type="notes"
          title="No notes found"
          description={
            notes.length === 0
              ? "Upload your first study material to get started"
              : "Try adjusting your filters"
          }
          action={
            notes.length === 0 ? (
              <Button onClick={() => setIsUploadOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Upload Note
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => (
            <Card
              key={note.id}
              className="p-4 bg-card border-border hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{note.title}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {getSubjectName(note.subject_id)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      PDF • {formatFileSize(note.file_size)}
                    </span>
                    {note.created_at && (
                      <span className="text-xs text-muted-foreground">
                        • {new Date(note.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {note.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                      {note.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <a href={note.file_url} target="_blank" rel="noopener noreferrer">
                      View
                    </a>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteId(note.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Note</DialogTitle>
            <DialogDescription>
              Add study materials for students to download
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={uploadForm.title}
                onChange={(e) =>
                  setUploadForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Chapter 1 - Introduction"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={uploadForm.description}
                onChange={(e) =>
                  setUploadForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Brief description of the content..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Select
                value={uploadForm.subject_id}
                onValueChange={(value) =>
                  setUploadForm((prev) => ({ ...prev, subject_id: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a subject" />
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
              <Label htmlFor="file">PDF File *</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                <Input
                  id="file"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label htmlFor="file" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  {uploadForm.file ? (
                    <p className="text-sm font-medium text-foreground">
                      {uploadForm.file.name}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Click to select a PDF (max 10MB)
                    </p>
                  )}
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
