import { FileText, Download, Search, Filter, ExternalLink, Lock, AlertCircle, Sparkles, FileImage, FileType2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAccess } from "@/hooks/useAccess";
import { format } from "date-fns";

type AccessLevel = "demo" | "exclusive";

interface Note {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  class_id: string | null;
  file_url: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  access_level: AccessLevel;
  created_at: string | null;
  class?: { title: string | null } | null;
}

interface Subject {
  id: string;
  name: string;
}

interface NotesBankProps {
  embedded?: boolean;
}

type FetchState = "loading" | "loaded" | "error";

export function NotesBank({ embedded }: NotesBankProps = {}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [state, setState] = useState<FetchState>("loading");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const { toast } = useToast();
  const { hasAccess } = useAccess();

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async () => {
    setState("loading");
    try {
      const [notesRes, subjectsRes] = await Promise.all([
        supabase
          .from("notes")
          .select(
            "id, title, description, subject_id, class_id, file_url, file_name, file_size, file_type, access_level, created_at, class:classes(title)"
          )
          .order("created_at", { ascending: false }),
        supabase.from("subjects").select("id, name").eq("is_active", true),
      ]);

      if (notesRes.error) throw notesRes.error;
      if (subjectsRes.error) throw subjectsRes.error;

      setNotes((notesRes.data || []) as Note[]);
      setSubjects(subjectsRes.data || []);
      setState("loaded");
    } catch (error) {
      console.error("Error fetching notes:", error);
      setState("error");
      toast({
        title: "Couldn't load notes",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    }
  };

  const filteredNotes = notes.filter((note) => {
    const matchesSearch = note.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesSubject =
      selectedSubject === "all" || note.subject_id === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getSubjectName = (subjectId: string | null): string => {
    if (!subjectId) return "General";
    return subjects.find((s) => s.id === subjectId)?.name || "Unknown";
  };

  const fileKind = (t: string | null, name: string) => {
    const raw = (t || name.split(".").pop() || "").toLowerCase();
    if (raw.includes("pdf")) return { label: "PDF", Icon: FileText };
    if (raw.match(/png|jpe?g|gif|webp|image/)) return { label: "Image", Icon: FileImage };
    if (raw.match(/docx?|word/)) return { label: "DOC", Icon: FileType2 };
    if (raw.match(/pptx?|slides/)) return { label: "Slides", Icon: FileType2 };
    return { label: raw ? raw.toUpperCase().slice(0, 6) : "File", Icon: FileText };
  };

  const canOpen = (note: Note) =>
    note.access_level === "demo" || hasAccess(note.subject_id || "");

  // ── Loading ───────────────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <div className={embedded ? "space-y-4" : "p-4 md:p-6 space-y-4 max-w-6xl mx-auto"}>
        <Skeleton className="h-14 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (state === "error") {
    return (
      <div className={embedded ? "" : "p-4 md:p-6 max-w-6xl mx-auto"}>
        <Card className="p-8 text-center bg-card border-border rounded-3xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">Couldn't load notes</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Something went wrong reaching the notes library.
          </p>
          <Button onClick={fetchData} className="rounded-full">Try again</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "p-4 md:p-6 space-y-6 max-w-6xl mx-auto"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Notes Bank</h1>
          <p className="text-muted-foreground">Download study materials and resources</p>
        </div>
      )}

      {/* Filters */}
      <Card className="p-3 md:p-4 bg-card border-border rounded-3xl">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-full h-11"
            />
          </div>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger className="w-full sm:w-52 rounded-full h-11">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Notes list */}
      {filteredNotes.length === 0 ? (
        <Card className="bg-card border-border rounded-3xl">
          <EmptyState
            type="notes"
            title={notes.length === 0 ? "No notes yet" : "No notes match your filters"}
            description={
              notes.length === 0
                ? "Notes uploaded by your tutors will appear here."
                : "Try clearing the search or changing the subject."
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map((note) => {
            const { label: kindLabel, Icon: KindIcon } = fileKind(note.file_type, note.file_name);
            const open = canOpen(note);
            return (
              <Card
                key={note.id}
                className="p-4 bg-card border-border rounded-3xl hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
                    <KindIcon className="w-6 h-6 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{note.title}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary" className="rounded-full text-xs">
                        {getSubjectName(note.subject_id)}
                      </Badge>
                      {note.class?.title && (
                        <Badge variant="outline" className="rounded-full text-xs">
                          {note.class.title}
                        </Badge>
                      )}
                      {note.access_level === "demo" ? (
                        <Badge className="rounded-full text-xs bg-primary/15 text-primary border-0 gap-1">
                          <Sparkles className="w-3 h-3" /> Demo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-full text-xs">
                          Exclusive
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {kindLabel} · {formatFileSize(note.file_size)}
                      </span>
                      {note.created_at && (
                        <span className="text-xs text-muted-foreground">
                          · {format(new Date(note.created_at), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                    {note.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                        {note.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col md:flex-row gap-2 shrink-0">
                    {open ? (
                      <>
                        <Button asChild variant="outline" size="sm" className="gap-2 rounded-full">
                          <a href={note.file_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                            <span className="hidden sm:inline">View</span>
                          </a>
                        </Button>
                        <Button asChild size="sm" className="gap-2 rounded-full">
                          <a href={note.file_url} download={note.file_name}>
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Download</span>
                          </a>
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-2 rounded-full" disabled>
                        <Lock className="w-4 h-4" />
                        <span className="hidden sm:inline">Enroll to unlock</span>
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
