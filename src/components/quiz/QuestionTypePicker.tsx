/**
 * Question type picker — the bottom sheet behind "Add question".
 *
 * Every type listed here is fully supported end to end: it saves, reloads,
 * previews, publishes, is answered by a student and is graded server-side.
 * Nothing is listed that the engine cannot actually run.
 *
 * The four types Phase 5 added are behind the centre's `expandedQuestionTypes`
 * flag, so a centre that has not been enrolled in them is offered the classic
 * two rather than a picker full of choices its tutors were not trained on.
 */
import { ChevronRight } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { QuestionType } from "@/lib/quizzes";
import { questionTypesFor } from "@/lib/questionTypes";
import { useFeatureEnabled } from "@/hooks/useFeature";

export function QuestionTypePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: QuestionType) => void;
}) {
  // Authoring gate only. A quiz that already contains one of the expanded types
  // keeps working and keeps grading whatever this says — turning the flag off
  // must not strand a tutor's existing content.
  const types = questionTypesFor(useFeatureEnabled("expandedQuestionTypes"));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-[28px] pb-[calc(env(safe-area-inset-bottom)+16px)]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="pr-8 text-[18px] font-extrabold">Add question</SheetTitle>
          <SheetDescription className="text-[13px]">Choose a question type</SheetDescription>
        </SheetHeader>
        <ul className="mt-3 space-y-2">
          {types.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.value}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(t.value);
                    onOpenChange(false);
                  }}
                  className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition active:scale-[0.99]"
                >
                  <span
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                      t.tone,
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-bold text-slate-900">{t.label}</span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">
                      {t.hint}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

export default QuestionTypePicker;
