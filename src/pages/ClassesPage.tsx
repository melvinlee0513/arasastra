import { useState } from "react";
import { ArrowLeft, Play, FileText, Download, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const subjects = [
  { id: 1, name: "Mathematics", icon: "📐", tutor: "Dr. Sarah Chen", progress: 75, totalLessons: 24, completedLessons: 18 },
  { id: 2, name: "Physics", icon: "⚛️", tutor: "Prof. James Wilson", progress: 60, totalLessons: 20, completedLessons: 12 },
  { id: 3, name: "Chemistry", icon: "🧪", tutor: "Ms. Emily Brown", progress: 45, totalLessons: 18, completedLessons: 8 },
  { id: 4, name: "Biology", icon: "🧬", tutor: "Dr. Michael Lee", progress: 80, totalLessons: 22, completedLessons: 18 },
  { id: 5, name: "English", icon: "📚", tutor: "Mrs. Johnson", progress: 90, totalLessons: 16, completedLessons: 14 },
  { id: 6, name: "History", icon: "🏛️", tutor: "Mr. Williams", progress: 55, totalLessons: 14, completedLessons: 8 },
];

const videoReplays = [
  { id: 1, title: "Chapter 5: Quadratic Equations", date: "Jan 20, 2026", duration: "1h 15m", thumbnail: "" },
  { id: 2, title: "Chapter 4: Linear Functions", date: "Jan 18, 2026", duration: "1h 05m", thumbnail: "" },
  { id: 3, title: "Chapter 3: Polynomials", date: "Jan 15, 2026", duration: "58m", thumbnail: "" },
  { id: 4, title: "Chapter 2: Algebra Basics", date: "Jan 12, 2026", duration: "1h 20m", thumbnail: "" },
];

const notes = [
  { id: 1, title: "Quadratic Equations Formula Sheet", type: "PDF", size: "2.4 MB", date: "Jan 20, 2026" },
  { id: 2, title: "Practice Problems Set 5", type: "PDF", size: "1.8 MB", date: "Jan 18, 2026" },
  { id: 3, title: "Linear Functions Summary", type: "PDF", size: "3.1 MB", date: "Jan 15, 2026" },
  { id: 4, title: "Mid-term Revision Guide", type: "PDF", size: "5.2 MB", date: "Jan 10, 2026" },
];

export function ClassesPage() {
  const [selectedSubject, setSelectedSubject] = useState<typeof subjects[0] | null>(null);

  if (selectedSubject) {
    return (
      <SubjectDetail 
        subject={selectedSubject} 
        onBack={() => setSelectedSubject(null)} 
      />
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">My Classes</h1>
        <p className="text-muted-foreground">Access your enrolled subjects and learning materials</p>
      </div>

      {/* Subjects Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((subject, index) => (
          <Card 
            key={subject.id}
            onClick={() => setSelectedSubject(subject)}
            className="p-5 bg-card border border-border hover:shadow-lg hover:border-accent/30 transition-all duration-200 cursor-pointer group animate-fade-up"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-secondary flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                {subject.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-lg">{subject.name}</h3>
                <p className="text-sm text-muted-foreground">{subject.tutor}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {subject.completedLessons} of {subject.totalLessons} lessons
                </span>
                <span className="font-semibold text-accent">{subject.progress}%</span>
              </div>
              <Progress value={subject.progress} className="h-2" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface SubjectDetailProps {
  subject: typeof subjects[0];
  onBack: () => void;
}

function SubjectDetail({ subject, onBack }: SubjectDetailProps) {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl">
            {subject.icon}
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">{subject.name}</h1>
            <p className="text-muted-foreground">{subject.tutor}</p>
          </div>
        </div>
      </div>

      {/* Progress Overview */}
      <Card className="p-4 bg-card border border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Course Progress</span>
          <span className="font-bold text-accent">{subject.progress}%</span>
        </div>
        <Progress value={subject.progress} className="h-3" />
        <p className="text-sm text-muted-foreground mt-2">
          {subject.completedLessons} of {subject.totalLessons} lessons completed
        </p>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="videos" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 bg-secondary">
          <TabsTrigger value="videos" className="gap-2">
            <Play className="w-4 h-4" />
            Video Replays
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-2">
            <FileText className="w-4 h-4" />
            Note Bank
          </TabsTrigger>
        </TabsList>

        <TabsContent value="videos" className="space-y-3">
          {videoReplays.map((video, index) => (
            <Card 
              key={video.id}
              className="p-4 bg-card border border-border hover:shadow-md hover:border-accent/30 transition-all duration-200 cursor-pointer animate-fade-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex gap-4">
                {/* Thumbnail */}
                <div className="w-32 h-20 rounded-lg bg-navy flex-shrink-0 flex items-center justify-center">
                  <Play className="w-8 h-8 text-primary-foreground/80" />
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground line-clamp-2">{video.title}</h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {video.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {video.duration}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="notes" className="space-y-3">
          {notes.map((note, index) => (
            <Card 
              key={note.id}
              className="p-4 bg-card border border-border hover:shadow-md hover:border-accent/30 transition-all duration-200 animate-fade-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-destructive" />
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{note.title}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <Badge variant="secondary">{note.type}</Badge>
                    <span>{note.size}</span>
                    <span>{note.date}</span>
                  </div>
                </div>

                {/* Download Button */}
                <Button variant="gold" size="icon">
                  <Download className="w-5 h-5" />
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}