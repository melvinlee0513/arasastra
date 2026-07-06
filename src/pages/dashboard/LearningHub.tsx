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

  const path = location.pathname;
  const activeTab = path.includes("/quizzes")
    ? "quizzes"
    : path.includes("/flashcards")
    ? "flashcards"
    : path.includes("/replays")
    ? "replays"
    : "notes";

  const handleTabChange = (value: string) => {
    const map: Record<string, string> = {
      notes: "/dashboard/learning/notes",
      quizzes: "/dashboard/learning/quizzes",
      flashcards: "/dashboard/learning/flashcards",
      replays: "/dashboard/learning/replays",
    };
    // push (not replace) so back/forward preserves tab history
    navigate(map[value] || "/dashboard/learning/notes");
  };

  const tabs = [
    { value: "notes", label: "Notes", Icon: BookOpen },
    { value: "quizzes", label: "Quizzes", Icon: HelpCircle },
    { value: "flashcards", label: "Flashcards", Icon: BrainCircuit },
    { value: "replays", label: "Replays", Icon: Video },
  ] as const;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8">
      <div className="px-1">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">My Learning</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Notes, quizzes, flashcards and class replays — all in one place.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {/* Mobile-first sticky pill tab bar (Ceriakid-inspired) */}
        <div className="sticky top-0 z-20 -mx-4 md:mx-0 px-4 md:px-0 py-2 bg-gradient-to-b from-white/95 to-white/70 backdrop-blur-xl">
          <TabsList
            className="w-full h-auto p-1.5 rounded-full bg-white/80 border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex gap-1 overflow-x-auto no-scrollbar"
          >
            {tabs.map(({ value, label, Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex-1 min-w-[88px] gap-1.5 rounded-full py-2.5 text-sm font-medium text-slate-600 data-[state=active]:bg-[#00D1FF] data-[state=active]:text-white data-[state=active]:shadow-[0_6px_20px_-6px_rgba(0,209,255,0.6)] transition-all"
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="notes" className="mt-4 focus-visible:outline-none">
          <NotesBank embedded />
        </TabsContent>
        <TabsContent value="quizzes" className="mt-4 focus-visible:outline-none">
          <QuizList embedded />
        </TabsContent>
        <TabsContent value="flashcards" className="mt-4 focus-visible:outline-none">
          <FlashcardEngine />
        </TabsContent>
        <TabsContent value="replays" className="mt-4 focus-visible:outline-none">
          <ReplayLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}

