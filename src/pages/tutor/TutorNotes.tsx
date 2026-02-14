import { useState, useEffect, useRef } from "react";
import { FileText, Upload, Trash2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export function TutorNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const [notesRes, subjectsRes] = await Promise.all([
        supabase
          .from("notes")
          .select("*, subject:subjects(name)")
          .eq("uploaded_by", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("subjects").select("id, name").eq("is_active", true),
      ]);

      setNotes(notesRes.data || []);
      setSubjects(subjectsRes.data || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!file || !title || !subjectId || !user?.id) return;
    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadErr } = await supabase.storage
        .from("notes")
        .upload(fileName, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("notes").getPublicUrl(fileName);

      const { error: insertErr } = await supabase.from("notes").insert({
        title,
        description: description || null,
        subject_id: subjectId,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        uploaded_by: user.id,
      });
      if (insertErr) throw insertErr;

      toast({ title: "Uploaded!", description: "Note has been added successfully" });
      setShowUpload(false);
      setTitle("");
      setDescription("");
      setSubjectId("");
      setFile(null);
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to upload", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      const { error } = await supabase.from("notes").delete().eq("id", noteId);
      if (error) throw error;
      toast({ title: "Deleted", description: "Note removed" });
      fetchData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Upload Notes</h1>
          <p className="text-muted-foreground">Share PDF resources with your students</p>
        </div>
        <Button onClick={() => setShowUpload(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Upload PDF
        </Button>
      </div>

      {notes.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">No notes uploaded</h3>
          <p className="text-sm text-muted-foreground">
            Upload PDF files to share with your students
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card key={note.id} className="p-4 bg-card border-border hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{note.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {(note.subject as any)?.name || "General"} •{" "}
                    {note.created_at ? format(new Date(note.created_at), "MMM d, yyyy") : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={note.file_url} target="_blank" rel="noopener noreferrer">View</a>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(note.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload PDF Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Title</p>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 5 Notes" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Subject</p>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Description (optional)</p>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">PDF File</p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                {file ? file.name : "Choose PDF file"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!file || !title || !subjectId || isUploading}>
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
