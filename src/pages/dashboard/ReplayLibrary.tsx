import { useEffect, useState } from "react";
import { Play, Calendar, Clock, Search, Filter } from "lucide-react";
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

interface ClassReplay {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  scheduled_at: string;
  duration_minutes: number;
  subject?: { name: string; icon: string | null } | null;
  tutor?: { name: string; avatar_url: string | null } | null;
}

interface Subject {
  id: string;
  name: string;
}

export function ReplayLibrary() {
  const [replays, setReplays] = useState<ClassReplay[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [classesRes, subjectsRes] = await Promise.all([
        supabase
          .from("classes")
          .select(
            "id, title, description, video_url, scheduled_at, duration_minutes, subject:subjects(name, icon), tutor:tutors(name, avatar_url)"
          )
          .eq("is_published", true)
          .not("video_url", "is", null)
          .order("scheduled_at", { ascending: false }),
        supabase.from("subjects").select("id, name").eq("is_active", true),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (subjectsRes.error) throw subjectsRes.error;

      setReplays(classesRes.data || []);
      setSubjects(subjectsRes.data || []);
    } catch (error) {
      console.error("Error fetching replays:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredReplays = replays.filter((replay) => {
    const matchesSearch =
      replay.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      replay.tutor?.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject =
      selectedSubject === "all" || replay.subject?.name === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Replay Library</h1>
        <p className="text-muted-foreground">Watch past class recordings</p>
      </div>

      {/* Filters */}
      <Card className="p-4 bg-card border-border">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or tutor..."
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
                <SelectItem key={subject.id} value={subject.name}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Replays Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-4 bg-card border-border animate-pulse">
              <div className="aspect-video bg-muted rounded-lg mb-4" />
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </Card>
          ))}
        </div>
      ) : filteredReplays.length === 0 ? (
        <Card className="p-12 text-center bg-card border-border">
          <Play className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No replays available</h3>
          <p className="text-muted-foreground">
            {searchQuery || selectedSubject !== "all"
              ? "Try adjusting your filters"
              : "Check back after classes have been recorded"}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReplays.map((replay) => (
            <Card
              key={replay.id}
              className="overflow-hidden bg-card border-border hover:shadow-lg transition-shadow group cursor-pointer"
              onClick={() => replay.video_url && window.open(replay.video_url, "_blank")}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-muted">
                <div className="absolute inset-0 flex items-center justify-center bg-navy/80">
                  <div className="w-16 h-16 rounded-full bg-accent/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play className="w-8 h-8 text-accent-foreground fill-current" />
                  </div>
                </div>
                <div className="absolute bottom-2 right-2">
                  <Badge variant="secondary" className="text-xs">
                    {replay.duration_minutes} min
                  </Badge>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                <div>
                  <Badge variant="outline" className="mb-2 text-xs">
                    {replay.subject?.name || "General"}
                  </Badge>
                  <h3 className="font-semibold text-foreground line-clamp-2">{replay.title}</h3>
                </div>

                <div className="flex items-center justify-between">
                  {replay.tutor && (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={replay.tutor.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px] bg-accent text-accent-foreground">
                          {replay.tutor.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground truncate">
                        {replay.tutor.name}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(replay.scheduled_at), "MMM d")}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
