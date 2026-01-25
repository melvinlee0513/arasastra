import { useState } from "react";
import { Play, Clock, TrendingUp, ChevronRight, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import owlMascot from "@/assets/owl-mascot.png";

// Mock data
const liveClasses = [
  {
    id: 1,
    title: "Advanced Mathematics",
    tutor: "Dr. Sarah Chen",
    tutorAvatar: "",
    subject: "Mathematics",
    viewerCount: 234,
    isLive: true,
  },
  {
    id: 2,
    title: "Physics: Quantum Mechanics",
    tutor: "Prof. James Wilson",
    tutorAvatar: "",
    subject: "Physics",
    viewerCount: 156,
    isLive: true,
  },
];

const subjects = [
  { id: 1, name: "Mathematics", icon: "📐", tutor: "Dr. Sarah Chen", nextClass: "Today, 3:00 PM", progress: 75 },
  { id: 2, name: "Physics", icon: "⚛️", tutor: "Prof. James Wilson", nextClass: "Tomorrow, 10:00 AM", progress: 60 },
  { id: 3, name: "Chemistry", icon: "🧪", tutor: "Ms. Emily Brown", nextClass: "Wed, 2:00 PM", progress: 45 },
  { id: 4, name: "Biology", icon: "🧬", tutor: "Dr. Michael Lee", nextClass: "Thu, 11:00 AM", progress: 80 },
  { id: 5, name: "English", icon: "📚", tutor: "Mrs. Johnson", nextClass: "Fri, 9:00 AM", progress: 90 },
];

const weeklyProgress = {
  hoursWatched: 12.5,
  streak: 7,
  completedLessons: 24,
};

export function HomePage() {
  const [currentSlide, setCurrentSlide] = useState(0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={owlMascot} alt="StudyOwl" className="w-12 h-12 md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Welcome back! 👋
            </h1>
            <p className="text-muted-foreground">Ready to learn something new today?</p>
          </div>
        </div>
      </div>

      {/* Live Now Hero Section */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          <h2 className="text-lg font-semibold text-foreground">Live Now</h2>
        </div>
        
        <div className="relative">
          <div className="overflow-hidden rounded-2xl">
            <div 
              className="flex transition-transform duration-300"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {liveClasses.map((liveClass) => (
                <div key={liveClass.id} className="w-full flex-shrink-0">
                  <Card className="relative overflow-hidden bg-gradient-to-br from-navy to-navy-light p-6 md:p-8 border-0">
                    <div className="absolute top-4 right-4">
                      <Badge variant="destructive" className="gap-1 animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-primary-foreground animate-ping" />
                        LIVE
                      </Badge>
                    </div>
                    
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1 space-y-3">
                        <Badge variant="secondary" className="bg-primary-foreground/10 text-primary-foreground border-0">
                          {liveClass.subject}
                        </Badge>
                        <h3 className="text-xl md:text-2xl font-bold text-primary-foreground">
                          {liveClass.title}
                        </h3>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8 border-2 border-primary-foreground/20">
                            <AvatarImage src={liveClass.tutorAvatar} />
                            <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                              {liveClass.tutor.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-primary-foreground/80">{liveClass.tutor}</span>
                        </div>
                        <div className="flex items-center gap-2 text-primary-foreground/60 text-sm">
                          <Video className="w-4 h-4" />
                          <span>{liveClass.viewerCount} watching</span>
                        </div>
                      </div>
                      
                      <Button variant="live" size="xl" className="w-full md:w-auto">
                        <Play className="w-5 h-5" />
                        Join Class
                      </Button>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>
          
          {/* Carousel Dots */}
          {liveClasses.length > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              {liveClasses.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${
                    currentSlide === index ? 'w-6 bg-accent' : 'bg-muted-foreground/30'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Learning Progress */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Learning Progress</h2>
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center bg-card border border-border hover:shadow-md transition-shadow">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-accent/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground">{weeklyProgress.hoursWatched}</p>
            <p className="text-xs text-muted-foreground">Hours Watched</p>
          </Card>
          <Card className="p-4 text-center bg-card border border-border hover:shadow-md transition-shadow">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-accent/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground">{weeklyProgress.streak}🔥</p>
            <p className="text-xs text-muted-foreground">Day Streak</p>
          </Card>
          <Card className="p-4 text-center bg-card border border-border hover:shadow-md transition-shadow">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-accent/10 flex items-center justify-center">
              <Play className="w-5 h-5 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground">{weeklyProgress.completedLessons}</p>
            <p className="text-xs text-muted-foreground">Lessons Done</p>
          </Card>
        </div>
      </section>

      {/* My Subjects */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">My Subjects</h2>
          <Button variant="ghost" size="sm" className="text-accent">
            See All <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.slice(0, 4).map((subject) => (
            <Card 
              key={subject.id} 
              className="p-4 bg-card border border-border hover:shadow-md hover:border-accent/30 transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  {subject.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{subject.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">{subject.tutor}</p>
                  <p className="text-xs text-accent mt-1">{subject.nextClass}</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium text-foreground">{subject.progress}%</span>
                </div>
                <Progress value={subject.progress} className="h-2" />
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}