import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";

interface MathViewProps {
  latex: string;
  display?: boolean;
  className?: string;
}

/**
 * Renders LaTeX with KaTeX. KaTeX output is generated from the LaTeX string by
 * the library itself (never raw user HTML) and errors render as a readable
 * fallback instead of throwing.
 */
export function MathView({ latex, display = false, className }: MathViewProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex || "", {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
        trust: false,
        output: "html",
      });
    } catch {
      return null;
    }
  }, [latex, display]);

  if (!html) {
    return (
      <span className={cn("rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs", className)}>
        {latex}
      </span>
    );
  }

  return (
    <span
      className={cn(display ? "block my-2 text-center overflow-x-auto" : "inline-block", className)}
      // eslint-disable-next-line react/no-danger -- KaTeX-generated markup from LaTeX source
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
