import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, HelpCircle, BrainCircuit, Video } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesBank } from "@/pages/dashboard/NotesBank";
import { QuizList } from "@/pages/dashboard/QuizList";
import { FlashcardEngine } from "@/pages/dashboard/FlashcardEngine";
import { ReplayLibrary } from "@/pages/dashboard/ReplayLibrary";

/**
 * LearningHub — Central hub for Note Banks, Quizzes, Flashcards, and Replays.
 * Soft-Tech: pill-shaped tabs, high whitespace.
 */
export function LearningHub() {
  const location = useLocation();
  const navigate = useNavigate();

  const isQuizzes = location.pathname.includes("/quizzes");
  const isFlashcards = location.pathname.includes("/flashcards");
  const isReplays = location.pathname.includes("/replays");
  const activeTab = isReplays
    ? "replays"
    : isFlashcards
    ? "flashcards"
    : isQuizzes
    ? "quizzes"
    : "notes";

  const handleTabChange = (value: string) => {
    const map: Record<string, string> = {
      notes: "/dashboard/learning",
      quizzes: "/dashboard/learning/quizzes",
      flashcards: "/dashboard/learning/flashcards",
      replays: "/dashboard/learning/replays",
    };
    navigate(map[value] || "/dashboard/learning", { replace: true });
  };

  const triggerClass =
    "gap-2 flex-1 sm:flex-initial rounded-full data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm text-slate-800";

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">My Learning</h1>
        <p className="text-muted-foreground mt-1">
          Access your study materials, quizzes, flashcards, and class replays
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full sm:w-auto rounded-full p-1 bg-white border border-slate-200 shadow-sm h-auto flex-wrap">
          <TabsTrigger value="notes" className={triggerClass}>
            <BookOpen className="w-4 h-4" /> Note Banks
          </TabsTrigger>
          <TabsTrigger value="quizzes" className={triggerClass}>
            <HelpCircle className="w-4 h-4" /> Quizzes
          </TabsTrigger>
          <TabsTrigger value="flashcards" className={triggerClass}>
            <BrainCircuit className="w-4 h-4" /> Flashcards
          </TabsTrigger>
          <TabsTrigger value="replays" className={triggerClass}>
            <Video className="w-4 h-4" /> Replays
          </TabsTrigger>
        </TabsList>
        <TabsContent value="notes" className="mt-0">
          <NotesBank embedded />
        </TabsContent>
        <TabsContent value="quizzes" className="mt-0">
          <QuizList embedded />
        </TabsContent>
        <TabsContent value="flashcards" className="mt-0">
          <FlashcardEngine />
        </TabsContent>
        <TabsContent value="replays" className="mt-0">
          <ReplayLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}
