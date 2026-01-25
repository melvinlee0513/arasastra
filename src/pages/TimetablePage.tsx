import { useState } from "react";
import { ChevronLeft, ChevronRight, Bell, BellOff, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const levels = ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5"];

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const classes = [
  { id: 1, time: "09:00 AM", subject: "Mathematics", tutor: "Dr. Sarah Chen", duration: "1h", day: 0, level: "Form 4" },
  { id: 2, time: "11:00 AM", subject: "Physics", tutor: "Prof. James Wilson", duration: "1h 30m", day: 0, level: "Form 4" },
  { id: 3, time: "02:00 PM", subject: "Chemistry", tutor: "Ms. Emily Brown", duration: "1h", day: 1, level: "Form 4" },
  { id: 4, time: "10:00 AM", subject: "Biology", tutor: "Dr. Michael Lee", duration: "1h", day: 2, level: "Form 4" },
  { id: 5, time: "03:00 PM", subject: "English", tutor: "Mrs. Johnson", duration: "1h", day: 3, level: "Form 4" },
  { id: 6, time: "09:00 AM", subject: "History", tutor: "Mr. Williams", duration: "1h", day: 4, level: "Form 3" },
  { id: 7, time: "11:00 AM", subject: "Geography", tutor: "Ms. Davis", duration: "1h 30m", day: 5, level: "Form 3" },
];

export function TimetablePage() {
  const [selectedLevel, setSelectedLevel] = useState("Form 4");
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(0);
  const [reminders, setReminders] = useState<Record<number, boolean>>({});

  const getWeekDates = () => {
    const dates = [];
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - start.getDay() + 1);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getWeekDates();
  const today = new Date();

  const filteredClasses = classes.filter(
    (c) => c.level === selectedLevel && c.day === selectedDay
  );

  const navigateWeek = (direction: number) => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + direction * 7);
    setCurrentWeekStart(newDate);
  };

  const toggleReminder = (classId: number) => {
    setReminders((prev) => ({
      ...prev,
      [classId]: !prev[classId],
    }));
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Timetable</h1>
        <Select value={selectedLevel} onValueChange={setSelectedLevel}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {levels.map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Week Navigation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon-sm" onClick={() => navigateWeek(-1)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="font-medium text-foreground">
            {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => navigateWeek(1)}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Day Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {weekDays.map((day, index) => {
            const date = weekDates[index];
            const isToday = date.toDateString() === today.toDateString();
            const isSelected = selectedDay === index;
            const hasClasses = classes.some((c) => c.day === index && c.level === selectedLevel);

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(index)}
                className={`
                  flex flex-col items-center min-w-[56px] px-3 py-2 rounded-xl transition-all duration-200
                  ${isSelected 
                    ? 'bg-accent text-accent-foreground shadow-md' 
                    : isToday 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-card border border-border hover:border-accent/30'
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

        {filteredClasses.length === 0 ? (
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
                    <p className="text-sm font-bold text-foreground">{classItem.time}</p>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {classItem.duration}
                    </Badge>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{classItem.subject}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="bg-secondary text-xs">
                          {classItem.tutor.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground truncate">
                        {classItem.tutor}
                      </span>
                    </div>
                  </div>

                  {/* Reminder Toggle */}
                  <div className="flex items-center gap-2">
                    {reminders[classItem.id] ? (
                      <Bell className="w-4 h-4 text-accent" />
                    ) : (
                      <BellOff className="w-4 h-4 text-muted-foreground" />
                    )}
                    <Switch
                      checked={reminders[classItem.id] || false}
                      onCheckedChange={() => toggleReminder(classItem.id)}
                    />
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