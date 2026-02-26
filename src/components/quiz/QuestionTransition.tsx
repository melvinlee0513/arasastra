import { useState, useEffect, ReactNode } from "react";
import { cn } from "@/lib/utils";

const ANIMATIONS = [
  // Slide from right
  { enter: "animate-slide-in-right", exit: "animate-slide-out-left" },
  // Slide from bottom
  { enter: "animate-slide-in-bottom", exit: "animate-slide-out-top" },
  // Zoom in
  { enter: "animate-zoom-in", exit: "animate-zoom-out" },
  // Flip
  { enter: "animate-flip-in", exit: "animate-flip-out" },
  // Fade scale
  { enter: "animate-fade-scale-in", exit: "animate-fade-scale-out" },
  // Rotate in
  { enter: "animate-rotate-in", exit: "animate-rotate-out" },
] as const;

interface QuestionTransitionProps {
  questionKey: number;
  children: ReactNode;
}

export function QuestionTransition({ questionKey, children }: QuestionTransitionProps) {
  const [animClass, setAnimClass] = useState("");
  const [currentAnim] = useState(() => ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)]);
  const [prevKey, setPrevKey] = useState(questionKey);

  useEffect(() => {
    if (questionKey !== prevKey) {
      // Pick a random animation for this transition
      const anim = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)];
      setAnimClass(anim.enter);
      setPrevKey(questionKey);
    } else {
      setAnimClass(currentAnim.enter);
    }
  }, [questionKey]);

  return (
    <div className={cn("w-full", animClass)} key={questionKey}>
      {children}
    </div>
  );
}
