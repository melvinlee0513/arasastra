import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, CalendarX, Lock, Users, User as UserIcon } from "lucide-react";
import { format, startOfWeek, addDays, isSameDay, isAfter } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ScheduledClass {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number | null;
  cohort_label: string | null;
  subject?: { name: string; icon: string | null } | null;
  tutor?: { name: string; avatar_url: string | null } | null;
}

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type ViewMode = "today" | "upcoming";
type FetchState = "loading" | "loaded" | "empty" | "error" | "unauthorized";

// Race a promise against a timeout so a stalled Supabase request never hangs the UI.
function withTimeout<T>(p: PromiseLike<T>, ms = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Request timed out")), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export function TimetablePage() {
  const { user, profile, role, isLoading: authLoading } = useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>("today");
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  });
  const [classes, setClasses] = useState<ScheduledClass[]>([]);
  const [state, setState] = useState<FetchState>("loading");

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const today = new Date();

  const fetchClasses = useCallback(async () => {
    if (authLoading) return;
    if (!user) { setState("unauthorized"); return; }

    setState("loading");
    try {
      const weekEnd = addDays(currentWeekStart, 7);
      const baseSelect =
        "id, title, scheduled_at, duration_minutes, cohort_label, subject:subjects(name, icon), tutor:tutors(name, avatar_url)";

      let query = supabase
        .from("classes")
        .select(baseSelect)
        .eq("is_published", true)
        .gte("scheduled_at", currentWeekStart.toISOString())
        .lt("scheduled_at", weekEnd.toISOString())
        .order("scheduled_at", { ascending: true });

      // Role-aware scoping. Center Admins are further restricted by RLS to their center_id.
      if (role === "student" && profile?.id) {
        const { data: enr, error: enrErr } = await withTimeout(
          supabase
            .from("class_enrollments")
            .select("class_id")
            .eq("student_user_id", user.id)
            .eq("status", "active")
        );
        if (enrErr) throw enrErr;
        const ids = (enr || []).map((e: { class_id: string | null }) => e.class_id).filter(Boolean) as string[];
        if (ids.length === 0) { setClasses([]); setState("empty"); return; }
        query = query.in("id", ids);
      } else if (role === "tutor") {
        const { data: tutorRow, error: tErr } = await withTimeout(
          supabase.from("tutors").select("id").eq("user_id", user.id).maybeSingle()
        );
        if (tErr) throw tErr;
        if (!tutorRow?.id) { setClasses([]); setState("empty"); return; }
        query = query.eq("tutor_id", tutorRow.id);
      }
      // admin / superadmin: rely on RLS (admin scoped to their center_id, superadmin sees all).

      const { data, error } = await withTimeout(query);
      if (error) throw error;

      const rows = (data || []) as ScheduledClass[];
      setClasses(rows);
      setState(rows.length === 0 ? "empty" : "loaded");
    } catch (err) {
      console.error("Timetable fetch failed:", err);
      setClasses([]);
      setState("error");
    }
  }, [authLoading, user, profile?.id, role, currentWeekStart]);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  const selectedDate = weekDates[selectedDay];
  const now = new Date();

  const filteredClasses =
    viewMode === "today"
      ? classes.filter((c) => isSameDay(new Date(c.scheduled_at), selectedDate))
      : classes.filter((c) => isAfter(new Date(c.scheduled_at), now));

  const navigateWeek = (direction: number) => {
    setCurrentWeekStart((prev) => addDays(prev, direction * 7));
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "1h";
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  // ---------- Render helpers ----------

  const renderState = () => {
    if (state === "loading") {
      return (
        <Card className="p-8 text-center bg-card border border-border rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading schedule...</p>
        </Card>
      );
    }
    if (state === "unauthorized") {
      return (
        <Card className="p-8 text-center bg-card border border-border rounded-3xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary flex items-center justify-center">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">Sign in required</h3>
          <p className="text-sm text-muted-foreground">Sign in to view your class timetable.</p>
        </Card>
      );
    }
    if (state === "error") {
      return (
        <Card className="p-8 text-center bg-card border border-border rounded-3xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">Couldn't load your schedule</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Something went wrong reaching the timetable. Please try again.
          </p>
          <Button onClick={fetchClasses} className="rounded-full">Try again</Button>
        </Card>
      );
    }
    if (filteredClasses.length === 0) {
      return (
        <Card className="p-8 text-center bg-card border border-border rounded-3xl">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary flex items-center justify-center">
            <CalendarX className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-1">No classes scheduled</h3>
          <p className="text-sm text-muted-foreground">
            {viewMode === "today"
              ? "Enjoy the free time — check another day or view upcoming."
              : "You're all caught up. New classes will appear here once scheduled."}
          </p>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        {filteredClasses.map((classItem, index) => (
          <Card
            key={classItem.id}
            className="p-4 bg-card border border-border rounded-3xl hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-200"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start gap-4">
              <div className="text-center min-w-[64px]">
                <p className="text-sm font-bold text-foreground">
                  {format(new Date(classItem.scheduled_at), "hh:mm a")}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                  {format(new Date(classItem.scheduled_at), "EEE d MMM")}
                </p>
                <Badge variant="secondary" className="mt-1 text-xs rounded-full">
                  {formatDuration(classItem.duration_minutes)}
                </Badge>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {classItem.subject?.icon && (
                    <span className="text-lg">{classItem.subject.icon}</span>
                  )}
                  {classItem.subject?.name && (
                    <Badge className="rounded-full bg-accent/15 text-accent-foreground border-0 text-xs">
                      {classItem.subject.name}
                    </Badge>
                  )}
                </div>
                <h3 className="font-semibold text-foreground truncate">{classItem.title}</h3>
                <div className="flex items-center gap-3 mt-2 flex-wrap text-sm text-muted-foreground">
                  {classItem.tutor && (
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={classItem.tutor.avatar_url || undefined} />
                        <AvatarFallback className="bg-secondary text-xs">
                          {classItem.tutor.name.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{classItem.tutor.name}</span>
                    </div>
                  )}
                  {!classItem.tutor && (
                    <div className="flex items-center gap-1">
                      <UserIcon className="w-3.5 h-3.5" />
                      <span>Tutor TBA</span>
                    </div>
                  )}
                  {classItem.cohort_label && (
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span className="truncate">{classItem.cohort_label}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Timetable</h1>
        {/* Today / Upcoming segmented control */}
        <div className="inline-flex p-1 rounded-full bg-secondary border border-border">
          {(["today", "upcoming"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 h-9 text-sm font-medium rounded-full transition-all ${
                viewMode === mode
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {mode === "today" ? "By day" : "Upcoming"}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "today" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => navigateWeek(-1)}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="font-medium text-foreground text-sm md:text-base">
              {format(weekDates[0], "MMM d")} – {format(weekDates[6], "MMM d, yyyy")}
            </span>
            <Button variant="ghost" size="icon" onClick={() => navigateWeek(1)}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {weekDays.map((day, index) => {
              const date = weekDates[index];
              const isToday = isSameDay(date, today);
              const isSelected = selectedDay === index;
              const hasClasses = classes.some((c) => isSameDay(new Date(c.scheduled_at), date));
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(index)}
                  className={`flex flex-col items-center min-w-[52px] px-3 py-2 rounded-2xl transition-all duration-200 ${
                    isSelected
                      ? "bg-accent text-accent-foreground shadow-md"
                      : isToday
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border hover:border-accent/30"
                  }`}
                >
                  <span className="text-xs font-medium opacity-80">{day}</span>
                  <span className="text-lg font-bold">{date.getDate()}</span>
                  {hasClasses && !isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {viewMode === "today"
              ? `${format(selectedDate, "EEEE")}'s classes`
              : "Upcoming classes"}
          </h2>
          {state === "loaded" && (
            <span className="text-xs text-muted-foreground">
              {filteredClasses.length} class{filteredClasses.length === 1 ? "" : "es"}
            </span>
          )}
        </div>
        {renderState()}
      </div>
    </div>
  );
}
