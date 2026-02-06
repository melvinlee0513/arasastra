import { useState, useEffect } from "react";
import { ArrowLeft, Play, FileText, Download, Clock, Calendar, BookOpen, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface EnrolledSubject {
  id: string;
  subject: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    description: string | null;
  };
}

interface ClassReplay {
  id: string;
  title: string;
  video_url: string | null;
  scheduled_at: string;
  duration_minutes: number | null;
}

interface SubjectNote {
  id: string;
  title: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string | null;
}

export function ClassesPage() {
  const { profile } = useAuth();
  const [enrollments, setEnrollments] = useState<EnrolledSubject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<EnrolledSubject | null>(null);

  useEffect(() => {
    fetchEnrollments();
  }, [profile?.id]);

  const fetchEnrollments = async () => {
    setIsLoading(true);
    try {
      if (profile?.id) {
        // Fetch enrolled subjects for authenticated user
        const { data, error } = await supabase
          .from("enrollments")
          .select("id, subject:subjects(id, name, icon, color, description)")
          .eq("student_id", profile.id)
          .eq("is_active", true);

        if (error) throw error;
        setEnrollments((data || []) as unknown as EnrolledSubject[]);
      } else {
        // Fetch all active subjects for unauthenticated users
        const { data, error } = await supabase
          .from("subjects")
          .select("id, name, icon, color, description")
          .eq("is_active", true)
          .order("name");

        if (error) throw error;
        setEnrollments(
          (data || []).map((s) => ({
            id: s.id,
            subject: s,
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching enrollments:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (selectedSubject) {
    return (
      <SubjectDetail
        subjectId={selectedSubject.subject.id}
        subjectName={selectedSubject.subject.name}
        subjectIcon={selectedSubject.subject.icon}
        onBack={() => setSelectedSubject(null)}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">My Classes</h1>
        <p className="text-muted-foreground">Access your enrolled subjects and learning materials</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : enrollments.length === 0 ? (
        <Card className="p-12 text-center bg-card border border-border">
          <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground mb-2">No subjects available</h3>
          <p className="text-muted-foreground text-sm">
            {profile ? "Contact your administrator to enroll in subjects." : "Sign in to view your enrolled subjects."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {enrollments.map((enrollment, index) => (
            <Card
              key={enrollment.id}
              onClick={() => setSelectedSubject(enrollment)}
              className="p-5 bg-card border border-border hover:shadow-lg hover:border-accent/30 transition-all duration-200 cursor-pointer group animate-fade-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform"
                  style={{
                    backgroundColor: enrollment.subject.color
                      ? `${enrollment.subject.color}20`
                      : undefined,
                  }}
                >
                  {enrollment.subject.icon || "📚"}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-lg">
                    {enrollment.subject.name}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {enrollment.subject.description || "Tap to view materials"}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface SubjectDetailProps {
  subjectId: string;
  subjectName: string;
  subjectIcon: string | null;
  onBack: () => void;
}

function SubjectDetail({ subjectId, subjectName, subjectIcon, onBack }: SubjectDetailProps) {
  const [replays, setReplays] = useState<ClassReplay[]>([]);
  const [notes, setNotes] = useState<SubjectNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchSubjectData();
  }, [subjectId]);

  const fetchSubjectData = async () => {
    setIsLoading(true);
    try {
      const [classesRes, notesRes] = await Promise.all([
        supabase
          .from("classes")
          .select("id, title, video_url, scheduled_at, duration_minutes")
          .eq("subject_id", subjectId)
          .eq("is_published", true)
          .not("video_url", "is", null)
          .order("scheduled_at", { ascending: false }),
        supabase
          .from("notes")
          .select("id, title, file_name, file_url, file_type, file_size, created_at")
          .eq("subject_id", subjectId)
          .order("created_at", { ascending: false }),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (notesRes.error) throw notesRes.error;

      setReplays(classesRes.data || []);
      setNotes(notesRes.data || []);
    } catch (error) {
      console.error("Error fetching subject data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "–";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl">
            {subjectIcon || "📚"}
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{subjectName}</h1>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="videos" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 bg-secondary">
            <TabsTrigger value="videos" className="gap-2">
              <Play className="w-4 h-4" />
              Video Replays ({replays.length})
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              <FileText className="w-4 h-4" />
              Note Bank ({notes.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="space-y-3">
            {replays.length === 0 ? (
              <Card className="p-8 text-center bg-card border border-border">
                <Play className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No video replays available yet</p>
              </Card>
            ) : (
              replays.map((video, index) => (
                <Card
                  key={video.id}
                  className="p-4 bg-card border border-border hover:shadow-md hover:border-accent/30 transition-all duration-200 cursor-pointer animate-fade-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => video.video_url && window.open(video.video_url, "_blank")}
                >
                  <div className="flex gap-4">
                    <div className="w-32 h-20 rounded-lg bg-navy flex-shrink-0 flex items-center justify-center">
                      <Play className="w-8 h-8 text-primary-foreground/80" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground line-clamp-2">{video.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(video.scheduled_at), "MMM d, yyyy")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {video.duration_minutes || 60} min
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="notes" className="space-y-3">
            {notes.length === 0 ? (
              <Card className="p-8 text-center bg-card border border-border">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No notes available yet</p>
              </Card>
            ) : (
              notes.map((note, index) => (
                <Card
                  key={note.id}
                  className="p-4 bg-card border border-border hover:shadow-md hover:border-accent/30 transition-all duration-200 animate-fade-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-6 h-6 text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{note.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <Badge variant="secondary">
                          {note.file_type?.toUpperCase() || "PDF"}
                        </Badge>
                        <span>{formatFileSize(note.file_size)}</span>
                        {note.created_at && (
                          <span>{format(new Date(note.created_at), "MMM d, yyyy")}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="gold"
                      size="icon"
                      onClick={() => window.open(note.file_url, "_blank")}
                    >
                      <Download className="w-5 h-5" />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
