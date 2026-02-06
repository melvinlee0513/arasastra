import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface ScheduledClass {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number | null;
  subject?: { name: string; icon: string | null } | null;
  tutor?: { name: string; avatar_url: string | null } | null;
}

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TimetablePage() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    // Convert Sunday=0 to index 6, Mon=1 to 0, etc.
    return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  });
  const [classes, setClasses] = useState<ScheduledClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getWeekDates = () => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  };

  const weekDates = getWeekDates();
  const today = new Date();

  useEffect(() => {
    fetchClasses();
  }, [currentWeekStart]);

  const fetchClasses = async () => {
    setIsLoading(true);
    try {
      const weekEnd = addDays(currentWeekStart, 7);

      const { data, error } = await supabase
        .from("classes")
        .select(
          "id, title, scheduled_at, duration_minutes, subject:subjects(name, icon), tutor:tutors(name, avatar_url)"
        )
        .eq("is_published", true)
        .gte("scheduled_at", currentWeekStart.toISOString())
        .lt("scheduled_at", weekEnd.toISOString())
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error("Error fetching timetable:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedDate = weekDates[selectedDay];

  const filteredClasses = classes.filter((c) =>
    isSameDay(new Date(c.scheduled_at), selectedDate)
  );

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

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Timetable</h1>
      </div>

      {/* Week Navigation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="font-medium text-foreground">
            {format(weekDates[0], "MMM d")} - {format(weekDates[6], "MMM d, yyyy")}
          </span>
          <Button variant="ghost" size="icon" onClick={() => navigateWeek(1)}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Day Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {weekDays.map((day, index) => {
            const date = weekDates[index];
            const isToday = isSameDay(date, today);
            const isSelected = selectedDay === index;
            const hasClasses = classes.some((c) =>
              isSameDay(new Date(c.scheduled_at), date)
            );

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(index)}
                className={`
                  flex flex-col items-center min-w-[56px] px-3 py-2 rounded-xl transition-all duration-200
                  ${
                    isSelected
                      ? "bg-accent text-accent-foreground shadow-md"
                      : isToday
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border hover:border-accent/30"
                  }
                `}
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

      {/* Classes List */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          {weekDays[selectedDay]}'s Classes
        </h2>

        {isLoading ? (
          <Card className="p-8 text-center bg-card border border-border">
            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading schedule...</p>
          </Card>
        ) : filteredClasses.length === 0 ? (
          <Card className="p-8 text-center bg-card border border-border">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-secondary flex items-center justify-center">
              <Clock className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No classes scheduled for this day</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredClasses.map((classItem, index) => (
              <Card
                key={classItem.id}
                className="p-4 bg-card border border-border hover:shadow-md transition-all duration-200"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start gap-4">
                  {/* Time Column */}
                  <div className="text-center min-w-[60px]">
                    <p className="text-sm font-bold text-foreground">
                      {format(new Date(classItem.scheduled_at), "hh:mm a")}
                    </p>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {formatDuration(classItem.duration_minutes)}
                    </Badge>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {classItem.subject?.icon && (
                        <span className="text-lg">{classItem.subject.icon}</span>
                      )}
                      <h3 className="font-semibold text-foreground">
                        {classItem.subject?.name || classItem.title}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{classItem.title}</p>
                    {classItem.tutor && (
                      <div className="flex items-center gap-2 mt-2">
                        <Avatar className="w-6 h-6">
                          <AvatarImage src={classItem.tutor.avatar_url || undefined} />
                          <AvatarFallback className="bg-secondary text-xs">
                            {classItem.tutor.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-muted-foreground truncate">
                          {classItem.tutor.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
