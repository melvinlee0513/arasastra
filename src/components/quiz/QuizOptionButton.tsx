import { CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTION_LABELS = ["A", "B", "C", "D"];
const OPTION_COLORS = [
  "bg-[hsl(0,72%,55%)] hover:bg-[hsl(0,72%,48%)]",
  "bg-[hsl(220,72%,55%)] hover:bg-[hsl(220,72%,48%)]",
  "bg-[hsl(43,90%,50%)] hover:bg-[hsl(43,90%,43%)]",
  "bg-[hsl(150,60%,45%)] hover:bg-[hsl(150,60%,38%)]",
];
const OPTION_SHAPES = ["rounded-tl-3xl", "rounded-tr-3xl", "rounded-bl-3xl", "rounded-br-3xl"];

interface QuizOptionButtonProps {
  option: string;
  index: number;
  correctAnswer: string;
  selectedAnswer: string | null;
  isFeedback: boolean;
  isHidden: boolean;
  onSelect: (option: string) => void;
  animationDelay: number;
}

export function QuizOptionButton({
  option, index, correctAnswer, selectedAnswer, isFeedback, isHidden, onSelect, animationDelay,
}: QuizOptionButtonProps) {
  const isSelected = selectedAnswer === option;
  const isCorrect = option === correctAnswer;

  if (isHidden && !isFeedback) {
    return (
      <div className="p-4 md:p-5 rounded-2xl bg-primary-foreground/5 opacity-30 flex items-center justify-center">
        <span className="text-primary-foreground/30 text-sm">Eliminated</span>
      </div>
    );
  }

  return (
    <button
      disabled={isFeedback || isHidden}
      onClick={() => onSelect(option)}
      style={{ animationDelay: `${animationDelay}ms` }}
      className={cn(
        "relative flex items-center gap-3 p-4 md:p-5 rounded-2xl text-left",
        "transition-all duration-200 transform animate-slide-in-option",
        "font-semibold text-base md:text-lg",
        OPTION_SHAPES[index],
        !isFeedback && "hover:scale-[1.02] active:scale-[0.98]",
        isFeedback && isCorrect && "ring-4 ring-[hsl(150,60%,45%)] bg-[hsl(150,60%,45%)] scale-105",
        isFeedback && isSelected && !isCorrect && "ring-4 ring-destructive opacity-60 shake-animation",
        isFeedback && !isSelected && !isCorrect && "opacity-40",
        !isFeedback && OPTION_COLORS[index],
        "text-primary-foreground"
      )}
    >
      <span className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center text-sm font-black shrink-0">
        {OPTION_LABELS[index]}
      </span>
      <span className="flex-1">{option}</span>
      {isFeedback && isCorrect && <CheckCircle className="w-6 h-6 shrink-0 animate-bounce" />}
      {isFeedback && isSelected && !isCorrect && <XCircle className="w-6 h-6 shrink-0" />}
    </button>
  );
}
