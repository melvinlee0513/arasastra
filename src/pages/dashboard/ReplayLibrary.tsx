import { useEffect, useMemo, useState } from "react";
import { Play, Calendar, Search, Filter, AlertCircle, Lock, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { VideoPlayer } from "@/components/shared/VideoPlayer";
import { toast } from "sonner";
import { useAccess } from "@/hooks/useAccess";

interface ClassReplay {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  scheduled_at: string;
  duration_minutes: number;
  subject_id: string | null;
  subject?: { name: string; icon: string | null } | null;
  tutor?: { name: string; avatar_url: string | null } | null;
}

interface Subject {
  id: string;
  name: string;
}

/**
 * Validate that a video URL is renderable. Accepts http(s) links or bare
 * YouTube IDs. Rejects null/empty/malformed values so we never mount a
 * <video> or <iframe> pointing at nothing.
 */
function isValidMediaUrl(raw: string | null | undefined): raw is string {
  if (!raw || typeof raw !== "string") return false;
  const v = raw.trim();
  if (!v) return false;
  // Bare 11-char YouTube ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return true;
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function ReplayLibrary() {
  const [replays, setReplays] = useState<ClassReplay[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<{
    url: string;
    title: string;
    classId: string;
  } | null>(null);

  const { hasAccess, isLoading: accessLoading } = useAccess();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [classesRes, subjectsRes] = await Promise.all([
        supabase
          .from("classes")
          .select(
            "id, title, description, video_url, scheduled_at, duration_minutes, subject_id, subject:subjects(name, icon), tutor:tutors(name, avatar_url)"
          )
          .eq("is_published", true)
          .not("video_url", "is", null)
          .neq("video_url", "")
          .order("scheduled_at", { ascending: false }),
        supabase.from("subjects").select("id, name").eq("is_active", true),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (subjectsRes.error) throw subjectsRes.error;

      // Belt-and-suspenders: filter out any invalid media on the client too.
      const clean = (classesRes.data || []).filter((c: any) =>
        isValidMediaUrl(c.video_url)
      );

      setReplays(clean as ClassReplay[]);
      setSubjects(subjectsRes.data || []);
    } catch (error) {
      if (import.meta.env.DEV) console.error("[ReplayLibrary]", error);
      setLoadError("We couldn't load your replays. Please try again in a moment.");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredReplays = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return replays.filter((replay) => {
      const matchesSearch =
        !q ||
        replay.title.toLowerCase().includes(q) ||
        (replay.tutor?.name.toLowerCase().includes(q) ?? false);
      const matchesSubject =
        selectedSubject === "all" || replay.subject?.name === selectedSubject;
      return matchesSearch && matchesSubject;
    });
  }, [replays, searchQuery, selectedSubject]);

  const isSearching = searchQuery.trim() !== "" || selectedSubject !== "all";

  const handleWatch = (replay: ClassReplay) => {
    if (!isValidMediaUrl(replay.video_url)) return;
    const isExclusive = replay.subject_id ? !hasAccess(replay.subject_id) : false;
    if (isExclusive) {
      toast.error("Enroll in this subject to watch the full replay.", {
        description: "This is exclusive content for enrolled students.",
      });
      return;
    }
    setActiveVideo({
      url: replay.video_url,
      title: replay.title,
      classId: replay.id,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {activeVideo && (
        <VideoPlayer
          url={activeVideo.url}
          title={activeVideo.title}
          classId={activeVideo.classId}
          onClose={() => setActiveVideo(null)}
        />
      )}

      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Replay Library</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Rewatch every class from your enrolled subjects.
        </p>
      </div>

      {/* Filters — mobile-first stack */}
      <Card className="p-3 md:p-4 bg-white/80 backdrop-blur-xl border border-slate-200/70 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or tutor…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-full bg-white border-slate-200"
            />
          </div>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger className="w-full sm:w-48 rounded-full bg-white border-slate-200">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.name}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* States */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card
              key={i}
              className="p-4 bg-white/70 border border-slate-200/70 rounded-3xl animate-pulse"
            >
              <div className="aspect-video bg-slate-100 rounded-2xl mb-4" />
              <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
            </Card>
          ))}
        </div>
      ) : loadError ? (
        <EmptyPanel
          icon={<AlertCircle className="w-8 h-8 text-rose-500" />}
          title="Something went wrong"
          body={loadError}
          action={
            <Button onClick={fetchData} className="rounded-full">
              Try again
            </Button>
          }
        />
      ) : filteredReplays.length === 0 ? (
        isSearching ? (
          <EmptyPanel
            icon={<Search className="w-8 h-8 text-[#00D1FF]" />}
            title="No matches"
            body="Try a different search term or clear the subject filter."
            action={
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedSubject("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyPanel
            icon={<Sparkles className="w-8 h-8 text-[#00D1FF]" />}
            title="No replays yet"
            body="Your recorded classes will appear here as soon as they're published."
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReplays.map((replay) => {
            const isExclusive = replay.subject_id
              ? !accessLoading && !hasAccess(replay.subject_id)
              : false;
            return (
              <ReplayCard
                key={replay.id}
                replay={replay}
                isExclusive={isExclusive}
                onWatch={() => handleWatch(replay)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReplayCard({
  replay,
  isExclusive,
  onWatch,
}: {
  replay: ClassReplay;
  isExclusive: boolean;
  onWatch: () => void;
}) {
  return (
    <Card className="overflow-hidden bg-white/85 backdrop-blur-xl border border-slate-200/70 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all group">
      {/* Thumbnail — never an <iframe> or <video>; safe placeholder */}
      <button
        type="button"
        onClick={onWatch}
        aria-label={`Watch ${replay.title}`}
        className="relative aspect-video w-full block bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-[#00D1FF] flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_10px_30px_-8px_rgba(0,209,255,0.7)]">
            {isExclusive ? (
              <Lock className="w-6 h-6 text-white" />
            ) : (
              <Play className="w-7 h-7 text-white fill-current ml-0.5" />
            )}
          </div>
        </div>
        <div className="absolute top-2 left-2">
          <Badge
            className={
              isExclusive
                ? "bg-amber-500/95 hover:bg-amber-500 text-white border-0 rounded-full"
                : "bg-emerald-500/95 hover:bg-emerald-500 text-white border-0 rounded-full"
            }
          >
            {isExclusive ? "Exclusive" : "Demo"}
          </Badge>
        </div>
        {replay.duration_minutes ? (
          <div className="absolute bottom-2 right-2">
            <Badge className="bg-black/60 hover:bg-black/60 text-white border-0 rounded-full">
              {replay.duration_minutes} min
            </Badge>
          </div>
        ) : null}
      </button>

      <div className="p-4 space-y-3">
        <div>
          <Badge
            variant="outline"
            className="mb-2 text-xs rounded-full border-slate-200"
          >
            {replay.subject?.name || "General"}
          </Badge>
          <h3 className="font-semibold text-slate-900 line-clamp-2 break-words">
            {replay.title}
          </h3>
        </div>

        <div className="flex items-center justify-between gap-2">
          {replay.tutor ? (
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={replay.tutor.avatar_url || undefined} />
                <AvatarFallback className="text-[10px] bg-[#00D1FF] text-white">
                  {replay.tutor.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-slate-600 truncate">
                {replay.tutor.name}
              </span>
            </div>
          ) : (
            <span className="text-sm text-slate-400">Tutor TBA</span>
          )}
          <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
            <Calendar className="w-3 h-3" />
            {format(new Date(replay.scheduled_at), "MMM d")}
          </div>
        </div>

        <Button
          onClick={onWatch}
          className="w-full rounded-full h-11 bg-[#00D1FF] hover:bg-[#00b8e0] text-white shadow-[0_6px_20px_-6px_rgba(0,209,255,0.6)]"
        >
          {isExclusive ? (
            <>
              <Lock className="w-4 h-4 mr-2" /> Enroll to Watch
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2 fill-current" /> Watch Replay
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

function EmptyPanel({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-8 md:p-12 text-center bg-white/80 backdrop-blur-xl border border-slate-200/70 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#00D1FF]/10">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mx-auto">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </Card>
  );
}
