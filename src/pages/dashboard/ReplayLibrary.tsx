import { useMemo, useState } from "react";
import { Play, Calendar, Search, Filter, AlertCircle, Sparkles } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { useQuery } from "@tanstack/react-query";
import {
  VIDEO_RESOURCE_TYPES,
  resolvePlayableUrl,
} from "@/lib/classResources";

interface ClassReplay {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  created_at: string;
  subject_name: string | null;
  class_title: string | null;
  tutor_name: string | null;
  tutor_avatar: string | null;
}

export function ReplayLibrary() {
  const { user } = useAuth();
  const { currentTenantId, isLoading: tenantLoading } = useTenant();
  const replaysOn = useFeatureEnabled("videoReplays");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [activeVideo, setActiveVideo] = useState<{
    url: string;
    title: string;
    classId: string;
  } | null>(null);

  const {
    data: replays = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["student-replays", currentTenantId, user?.id],
    enabled: !!user && !tenantLoading && replaysOn,
    queryFn: async (): Promise<ClassReplay[]> => {
      // Canonical enrolment source
      const { data: enrolls, error: enrollErr } = await supabase
        .from("class_enrollments")
        .select("class_id")
        .eq("student_user_id", user!.id)
        .eq("status", "active");
      if (enrollErr) throw enrollErr;

      const classIds = Array.from(
        new Set((enrolls || []).map((e: any) => e.class_id as string).filter(Boolean)),
      );
      if (classIds.length === 0) return [];

      // Canonical video source — same table + type used by ClassRoom
      let resourceQuery = supabase
        .from("class_resources")
        .select(
          "id,title,description,resource_type,source_type,file_url,file_path,external_url,embed_url,published_at,created_at,class_id,subject_id",
        )
        .in("class_id", classIds)
        .in("resource_type", ["video", "replay"])
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false });
      if (currentTenantId) resourceQuery = resourceQuery.eq("center_id", currentTenantId);

      const { data: rows, error: resErr } = await resourceQuery;
      if (resErr) throw resErr;

      const withUrl = (rows || [])
        .map((r: any) => ({ row: r, url: resolvePlayableUrl(r) }))
        .filter((x) => !!x.url);
      if (withUrl.length === 0) return [];

      const subjectIds = Array.from(
        new Set(withUrl.map((x) => x.row.subject_id).filter(Boolean)),
      );
      const classIdSet = Array.from(new Set(withUrl.map((x) => x.row.class_id).filter(Boolean)));

      const [subsRes, classesRes, tutorLinksRes] = await Promise.all([
        subjectIds.length
          ? supabase.from("subjects").select("id,name").in("id", subjectIds)
          : Promise.resolve({ data: [] as any[] }),
        classIdSet.length
          ? supabase.from("classes").select("id,title").in("id", classIdSet)
          : Promise.resolve({ data: [] as any[] }),
        classIdSet.length
          ? supabase.from("class_tutors").select("class_id,tutor_user_id").in("class_id", classIdSet)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const tutorIds = Array.from(
        new Set(((tutorLinksRes.data as any[]) || []).map((t) => t.tutor_user_id).filter(Boolean)),
      );
      const profilesRes = tutorIds.length
        ? await supabase
            .from("profiles")
            .select("user_id,full_name,avatar_url")
            .in("user_id", tutorIds)
        : { data: [] as any[] };

      const subjMap = new Map<string, string>(
        ((subsRes.data as any[]) || []).map((s) => [s.id, s.name]),
      );
      const classMap = new Map<string, string>(
        ((classesRes.data as any[]) || []).map((c) => [c.id, c.title]),
      );
      const profileMap = new Map<string, { name: string; avatar_url: string | null }>(
        ((profilesRes.data as any[]) || []).map((p) => [
          p.user_id,
          { name: p.full_name ?? "Tutor", avatar_url: p.avatar_url ?? null },
        ]),
      );
      const tutorByClass = new Map<string, { name: string; avatar_url: string | null }>();
      for (const link of ((tutorLinksRes.data as any[]) || [])) {
        if (tutorByClass.has(link.class_id)) continue;
        const prof = profileMap.get(link.tutor_user_id);
        if (prof) tutorByClass.set(link.class_id, prof);
      }

      return withUrl.map(({ row, url }): ClassReplay => ({
        id: row.id,
        title: row.title,
        description: row.description,
        video_url: url!,
        created_at: row.published_at ?? row.created_at,
        subject_name: row.subject_id ? subjMap.get(row.subject_id) ?? null : null,
        class_title: classMap.get(row.class_id) ?? null,
        tutor_name: tutorByClass.get(row.class_id)?.name ?? null,
        tutor_avatar: tutorByClass.get(row.class_id)?.avatar_url ?? null,
      }));
    },
  });

  const subjectOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of replays) if (r.subject_name) seen.add(r.subject_name);
    return Array.from(seen);
  }, [replays]);

  const filteredReplays = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return replays.filter((replay) => {
      const matchesSearch =
        !q ||
        replay.title.toLowerCase().includes(q) ||
        (replay.tutor_name?.toLowerCase().includes(q) ?? false) ||
        (replay.class_title?.toLowerCase().includes(q) ?? false);
      const matchesSubject =
        selectedSubject === "all" || replay.subject_name === selectedSubject;
      return matchesSearch && matchesSubject;
    });
  }, [replays, searchQuery, selectedSubject]);

  const isSearching = searchQuery.trim() !== "" || selectedSubject !== "all";

  if (!replaysOn) return <FeatureUnavailable feature="videoReplays" />;

  const handleWatch = (replay: ClassReplay) => {
    setActiveVideo({ url: replay.video_url, title: replay.title, classId: replay.id });
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

      {(replays.length > 0 || isSearching) && !isError && (
        <Card className="p-3 md:p-4 bg-white/80 backdrop-blur-xl border border-slate-200/70 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, tutor, or class…"
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
                {subjectOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}

      {isLoading || tenantLoading ? (
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
      ) : isError ? (
        <EmptyPanel
          icon={<AlertCircle className="w-8 h-8 text-rose-500" />}
          title="Couldn't load replays"
          body="We hit a problem loading your replays. Please try again in a moment."
          action={
            <Button
              onClick={() => {
                showSupabaseError(error, "Couldn't load replays");
                refetch();
              }}
              className="rounded-full"
            >
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
            title="No replays available yet"
            body="Published class replays from your enrolled classes will appear here once your tutors upload them."
          />
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReplays.map((replay) => (
            <ReplayCard key={replay.id} replay={replay} onWatch={() => handleWatch(replay)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReplayCard({
  replay,
  onWatch,
}: {
  replay: ClassReplay;
  onWatch: () => void;
}) {
  return (
    <Card className="overflow-hidden bg-white/85 backdrop-blur-xl border border-slate-200/70 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all group">
      <button
        type="button"
        onClick={onWatch}
        aria-label={`Watch ${replay.title}`}
        className="relative aspect-video w-full block bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-[#00D1FF] flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_10px_30px_-8px_rgba(0,209,255,0.7)]">
            <Play className="w-7 h-7 text-white fill-current ml-0.5" />
          </div>
        </div>
      </button>

      <div className="p-4 space-y-3">
        <div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {replay.subject_name && (
              <Badge variant="outline" className="text-xs rounded-full border-slate-200">
                {replay.subject_name}
              </Badge>
            )}
            {replay.class_title && (
              <Badge variant="outline" className="text-xs rounded-full border-slate-200 text-slate-600">
                {replay.class_title}
              </Badge>
            )}
          </div>
          <h3 className="font-semibold text-slate-900 line-clamp-2 break-words">
            {replay.title}
          </h3>
        </div>

        <div className="flex items-center justify-between gap-2">
          {replay.tutor_name ? (
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={replay.tutor_avatar || undefined} />
                <AvatarFallback className="text-[10px] bg-[#00D1FF] text-white">
                  {replay.tutor_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-slate-600 truncate">{replay.tutor_name}</span>
            </div>
          ) : (
            <span className="text-sm text-slate-400">Tutor TBA</span>
          )}
          <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
            <Calendar className="w-3 h-3" />
            {format(new Date(replay.created_at), "MMM d")}
          </div>
        </div>

        <Button
          onClick={onWatch}
          className="w-full rounded-full h-11 bg-[#00D1FF] hover:bg-[#00b8e0] text-white shadow-[0_6px_20px_-6px_rgba(0,209,255,0.6)]"
        >
          <Play className="w-4 h-4 mr-2 fill-current" /> Watch Replay
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
