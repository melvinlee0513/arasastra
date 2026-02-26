import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, HelpCircle, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotesBank } from "@/pages/dashboard/NotesBank";
import { QuizList } from "@/pages/dashboard/QuizList";
import { FlashcardEngine } from "@/pages/dashboard/FlashcardEngine";

export function LearningHub() {
  const location = useLocation();
  const navigate = useNavigate();

  const isQuizzes = location.pathname.includes("/quizzes");
  const isFlashcards = location.pathname.includes("/flashcards");
  const activeTab = isFlashcards ? "flashcards" : isQuizzes ? "quizzes" : "notes";

  const handleTabChange = (value: string) => {
    if (value === "quizzes") {
      navigate("/dashboard/learning/quizzes", { replace: true });
    } else if (value === "flashcards") {
      navigate("/dashboard/learning/flashcards", { replace: true });
    } else {
      navigate("/dashboard/learning", { replace: true });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">My Learning</h1>
        <p className="text-muted-foreground">Access your study materials, quizzes, and flashcards</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="notes" className="gap-2 flex-1 sm:flex-initial">
            <BookOpen className="w-4 h-4" />
            Note Banks
          </TabsTrigger>
          <TabsTrigger value="quizzes" className="gap-2 flex-1 sm:flex-initial">
            <HelpCircle className="w-4 h-4" />
            Quizzes
          </TabsTrigger>
          <TabsTrigger value="flashcards" className="gap-2 flex-1 sm:flex-initial">
            <Layers className="w-4 h-4" />
            Flashcards
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
      </Tabs>
    </div>
  );
}
