import { useState, useEffect } from "react";
import { Play, Clock, TrendingUp, ChevronRight, UserPlus } from "lucide-react";
import { addMinutes, isAfter, isBefore } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserProgress } from "@/hooks/useUserProgress";
import { useContentSections } from "@/hooks/useContentSections";
import owlMascot from "@/assets/owl-mascot.png";
import { Link } from "react-router-dom";

interface LiveClass {
  id: string;
  title: string;
  live_url: string | null;
  scheduled_at: string;
  duration_minutes: number;
  subject?: { name: string } | null;
  tutor?: { name: string; avatar_url: string | null } | null;
}

// Fallback subjects for non-logged in users
const defaultSubjects = [
  { id: 1, name: "Mathematics", icon: "📐", tutor: "Dr. Sarah Chen", nextClass: "Today, 3:00 PM", progress: 0 },
  { id: 2, name: "Physics", icon: "⚛️", tutor: "Prof. James Wilson", nextClass: "Tomorrow, 10:00 AM", progress: 0 },
  { id: 3, name: "Chemistry", icon: "🧪", tutor: "Ms. Emily Brown", nextClass: "Wed, 2:00 PM", progress: 0 },
  { id: 4, name: "Biology", icon: "🧬", tutor: "Dr. Michael Lee", nextClass: "Thu, 11:00 AM", progress: 0 },
];

export function HomePage() {
  const { user, profile } = useAuth();
  const { progress: weeklyProgress, isAuthenticated } = useUserProgress();
  const { getContentValue, getSectionByKey } = useContentSections();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLiveClasses();
  }, []);

  const fetchLiveClasses = async () => {
    try {
      const now = new Date();
      
      const { data } = await supabase
        .from("classes")
        .select("id, title, live_url, scheduled_at, duration_minutes, is_live, subject:subjects(name), tutor:tutors(name, avatar_url)")
        .eq("is_published", true)
        .order("scheduled_at", { ascending: true });

      // Filter for currently live classes
      const liveNow = (data || []).filter((classItem) => {
        const start = new Date(classItem.scheduled_at);
        const end = addMinutes(start, classItem.duration_minutes || 60);
        return classItem.is_live || (isAfter(now, start) && isBefore(now, end));
      }).filter((c) => c.live_url);

      setLiveClasses(liveNow);
    } catch (error) {
      console.error("Error fetching live classes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Dynamic content from CMS with fallbacks
  const heroSection = getSectionByKey("hero");
  const heroTitle = heroSection?.title || "Welcome to Arasa A+";
  const heroSubtitle = heroSection?.subtitle || "Your gateway to academic excellence";
  const heroTagline = getContentValue("hero", "tagline", "Master your SPM subjects with Malaysia's top tutors");
  const ctaText = getContentValue("hero", "cta_text", "Get Started");

  const displayName = profile?.full_name?.split(" ")[0] || "Guest";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={owlMascot} alt="Arasa A+" className="w-12 h-12 md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              {isAuthenticated ? `Welcome back, ${displayName}!` : heroTitle} 👋
            </h1>
            <p className="text-muted-foreground">
              {isAuthenticated ? "Ready to learn something new today?" : heroSubtitle}
            </p>
          </div>
        </div>
        {!isAuthenticated && (
          <Link to="/auth">
            <Button variant="gold">{ctaText}</Button>
          </Link>
        )}
      </div>

      {/* Live Now Hero Section */}
      {liveClasses.length > 0 && (
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
                            {liveClass.subject?.name || "General"}
                          </Badge>
                          <h3 className="text-xl md:text-2xl font-bold text-primary-foreground">
                            {liveClass.title}
                          </h3>
                          {liveClass.tutor && (
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8 border-2 border-primary-foreground/20">
                                <AvatarImage src={liveClass.tutor.avatar_url || undefined} />
                                <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                                  {liveClass.tutor.name.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-primary-foreground/80">{liveClass.tutor.name}</span>
                            </div>
                          )}
                        </div>
                        
                        <Button 
                          variant="live" 
                          size="xl" 
                          className="w-full md:w-auto"
                          onClick={() => liveClass.live_url && window.open(liveClass.live_url, "_blank")}
                        >
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
      )}

      {/* Learning Progress */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Learning Progress</h2>
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center bg-card border border-border hover:shadow-md transition-shadow">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-accent/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {isAuthenticated ? weeklyProgress.hoursWatched : "–"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAuthenticated ? "Hours Watched" : "Sign in to track"}
            </p>
          </Card>
          <Card className="p-4 text-center bg-card border border-border hover:shadow-md transition-shadow">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-accent/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {isAuthenticated ? `${weeklyProgress.streak}🔥` : "–"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAuthenticated ? "Day Streak" : "Sign in to track"}
            </p>
          </Card>
          <Card className="p-4 text-center bg-card border border-border hover:shadow-md transition-shadow">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-accent/10 flex items-center justify-center">
              <Play className="w-5 h-5 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {isAuthenticated ? weeklyProgress.completedLessons : "–"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAuthenticated ? "Lessons Done" : "Sign in to track"}
            </p>
          </Card>
        </div>
      </section>

      {/* Featured Subjects */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {getSectionByKey("subjects")?.title || "Featured Subjects"}
          </h2>
          {isAuthenticated && (
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="text-accent">
                See All <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {defaultSubjects.slice(0, 4).map((subject) => (
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

      {/* CTA for non-logged in users */}
      {!isAuthenticated && (
        <section className="py-8">
          <Card className="p-8 bg-gradient-to-br from-navy to-navy-light border-0 text-center">
            <h2 className="text-2xl font-bold text-primary-foreground mb-2">
              {heroTagline}
            </h2>
            <p className="text-primary-foreground/80 mb-6">
              Join thousands of students excelling with Arasa A+
            </p>
            <Link to="/auth">
              <Button variant="gold" size="lg">
                Create Free Account
              </Button>
            </Link>
          </Card>
        </section>
      )}
    </div>
  );
}
