import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, FileText, MessageCircle, ListOrdered, Download, Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";

// Mock data for the classroom
const mockNotes = [
  { id: 1, title: "Chapter 1 - Introduction to Algebra", fileName: "algebra-intro.pdf", size: "2.4 MB" },
  { id: 2, title: "Practice Problems Set A", fileName: "practice-set-a.pdf", size: "1.1 MB" },
  { id: 3, title: "Formula Quick Reference", fileName: "formula-ref.pdf", size: "540 KB" },
];

const mockChatHistory = [
  { id: 1, user: "Dr. Sarah Chen", avatar: null, message: "Welcome to today's class on Quadratic Equations!", time: "0:00" },
  { id: 2, user: "Ahmad Ibrahim", avatar: null, message: "Hi Teacher! Ready to learn!", time: "0:12" },
  { id: 3, user: "Dr. Sarah Chen", avatar: null, message: "Let's start with the standard form: ax² + bx + c = 0", time: "0:45" },
  { id: 4, user: "Mei Ling", avatar: null, message: "What if a = 0?", time: "1:20" },
  { id: 5, user: "Dr. Sarah Chen", avatar: null, message: "Great question! If a = 0, it becomes a linear equation, not quadratic.", time: "1:35" },
  { id: 6, user: "Raj Kumar", avatar: null, message: "Can you explain the discriminant?", time: "2:10" },
  { id: 7, user: "Dr. Sarah Chen", avatar: null, message: "The discriminant is b² - 4ac. It tells us about the nature of roots.", time: "2:25" },
];

const mockChapters = [
  { id: 1, title: "Introduction", time: "0:00", seconds: 0 },
  { id: 2, title: "Standard Form", time: "2:30", seconds: 150 },
  { id: 3, title: "The Discriminant", time: "8:15", seconds: 495 },
  { id: 4, title: "Solving by Factoring", time: "15:00", seconds: 900 },
  { id: 5, title: "Quadratic Formula", time: "22:45", seconds: 1365 },
  { id: 6, title: "Practice Problems", time: "35:00", seconds: 2100 },
  { id: 7, title: "Summary & Recap", time: "45:00", seconds: 2700 },
];

export function ClassroomPage() {
  const { classId } = useParams();
  const { profile } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLIFrameElement>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [classData, setClassData] = useState<any>(null);
  const [activeChapter, setActiveChapter] = useState(0);

  useEffect(() => {
    fetchClassData();
    checkProgress();
  }, [classId]);

  const fetchClassData = async () => {
    if (!classId) return;
    
    const { data } = await supabase
      .from("classes")
      .select("*, subject:subjects(name), tutor:tutors(name, avatar_url)")
      .eq("id", classId)
      .single();
    
    if (data) {
      setClassData(data);
    }
  };

  const checkProgress = async () => {
    if (!classId || !profile?.id) return;

    const { data } = await supabase
      .from("progress")
      .select("completed")
      .eq("class_id", classId)
      .eq("student_id", profile.id)
      .single();

    if (data?.completed) {
      setIsCompleted(true);
    }
  };

  const handleMarkComplete = async () => {
    if (!classId || !profile?.id) {
      toast({
        title: "Error",
        description: "Please log in to mark this lesson as complete.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Upsert progress
      const { error: progressError } = await supabase
        .from("progress")
        .upsert({
          class_id: classId,
          student_id: profile.id,
          completed: true,
          watched_seconds: 2700, // Mock full watch
          last_watched_at: new Date().toISOString(),
        }, {
          onConflict: "student_id,class_id",
        });

      if (progressError) throw progressError;

      // Award 50 XP
      const { error: xpError } = await supabase
        .from("profiles")
        .update({ xp_points: (profile.xp_points || 0) + 50 })
        .eq("id", profile.id);

      if (xpError) throw xpError;

      // Trigger confetti!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00D1FF', '#FFD700', '#1E3A5F'],
      });

      setIsCompleted(true);
      toast({
        title: "🎉 Lesson Complete!",
        description: "You earned 50 XP! Keep up the great work!",
      });
    } catch (error) {
      console.error("Error marking complete:", error);
      toast({
        title: "Error",
        description: "Failed to mark lesson as complete. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChapterClick = (seconds: number, index: number) => {
    setActiveChapter(index);
    // In a real implementation, this would seek the video
    toast({
      title: "Chapter Selected",
      description: `Jumping to ${mockChapters[index].title}`,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-lg border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Link to="/classes">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-semibold text-foreground line-clamp-1">
                {classData?.title || "Loading..."}
              </h1>
              <p className="text-sm text-muted-foreground">
                {classData?.subject?.name || "General"} • {classData?.tutor?.name || "Instructor"}
              </p>
            </div>
          </div>
          <Badge variant={isCompleted ? "default" : "secondary"} className={isCompleted ? "bg-green-600" : ""}>
            {isCompleted ? "Completed" : "In Progress"}
          </Badge>
        </div>
      </header>

      {/* Main Content - Split Screen */}
      <div className="flex flex-col lg:flex-row max-w-7xl mx-auto">
        {/* Video Player - 70% on desktop */}
        <div className="lg:w-[70%] p-4 space-y-4">
          {/* Video Container */}
          <div className="relative bg-foreground/5 rounded-xl overflow-hidden aspect-video">
            <iframe
              ref={videoRef}
              className="w-full h-full"
              src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&rel=0"
              title="Class Video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          {/* Mark Complete Button */}
          <Button
            onClick={handleMarkComplete}
            disabled={isCompleted || isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            size="lg"
          >
            {isCompleted ? (
              <>
                <Check className="w-5 h-5 mr-2" />
                Lesson Completed
              </>
            ) : isLoading ? (
              "Marking Complete..."
            ) : (
              <>
                <Check className="w-5 h-5 mr-2" />
                Mark as Complete (+50 XP)
              </>
            )}
          </Button>

          {/* Mobile Tabs - Show below video on mobile */}
          <div className="lg:hidden">
            <InteractionPanel
              activeChapter={activeChapter}
              onChapterClick={handleChapterClick}
            />
          </div>
        </div>

        {/* Interaction Panel - 30% on desktop, hidden on mobile (shown below video) */}
        <div className="hidden lg:block lg:w-[30%] p-4 border-l border-border">
          <InteractionPanel
            activeChapter={activeChapter}
            onChapterClick={handleChapterClick}
          />
        </div>
      </div>
    </div>
  );
}

interface InteractionPanelProps {
  activeChapter: number;
  onChapterClick: (seconds: number, index: number) => void;
}

function InteractionPanel({ activeChapter, onChapterClick }: InteractionPanelProps) {
  return (
    <Card className="bg-card border border-border overflow-hidden">
      <Tabs defaultValue="chapters" className="w-full">
        <TabsList className="w-full grid grid-cols-3 bg-secondary rounded-none">
          <TabsTrigger value="notes" className="gap-1.5 text-xs sm:text-sm">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Notes</span>
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5 text-xs sm:text-sm">
            <MessageCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Chat</span>
          </TabsTrigger>
          <TabsTrigger value="chapters" className="gap-1.5 text-xs sm:text-sm">
            <ListOrdered className="w-4 h-4" />
            <span className="hidden sm:inline">Chapters</span>
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="h-[400px] lg:h-[calc(100vh-280px)]">
          {/* Notes Tab */}
          <TabsContent value="notes" className="p-4 space-y-3 m-0">
            <h3 className="font-semibold text-foreground">Downloadable Resources</h3>
            {mockNotes.map((note) => (
              <Card
                key={note.id}
                className="p-3 bg-secondary/50 border border-border hover:bg-secondary transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm line-clamp-1">{note.title}</p>
                    <p className="text-xs text-muted-foreground">{note.size}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="flex-shrink-0">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </TabsContent>

          {/* Chat Tab */}
          <TabsContent value="chat" className="p-4 space-y-3 m-0">
            <h3 className="font-semibold text-foreground">Class Chat Replay</h3>
            <div className="space-y-3">
              {mockChatHistory.map((msg) => (
                <div key={msg.id} className="flex gap-3">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={msg.avatar || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {msg.user.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground text-sm">{msg.user}</span>
                      <span className="text-xs text-muted-foreground">{msg.time}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{msg.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Chapters Tab */}
          <TabsContent value="chapters" className="p-4 space-y-2 m-0">
            <h3 className="font-semibold text-foreground">Video Chapters</h3>
            {mockChapters.map((chapter, index) => (
              <button
                key={chapter.id}
                onClick={() => onChapterClick(chapter.seconds, index)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                  activeChapter === index
                    ? "bg-primary/10 border border-primary/30"
                    : "bg-secondary/50 hover:bg-secondary border border-transparent"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  activeChapter === index
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium line-clamp-1 ${
                    activeChapter === index ? "text-primary" : "text-foreground"
                  }`}>
                    {chapter.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{chapter.time}</p>
                </div>
                <Play className={`w-4 h-4 ${
                  activeChapter === index ? "text-primary" : "text-muted-foreground"
                }`} />
              </button>
            ))}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </Card>
  );
}
