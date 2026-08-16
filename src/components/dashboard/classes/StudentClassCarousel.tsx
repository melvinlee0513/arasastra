import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudentAccent } from "@/lib/studentProfile";

/**
 * Horizontal class-card gallery for the student Study page.
 *
 * Presentation only — it receives already-ordered children (bookmark-first
 * sorting is decided by the caller) and never wraps them into a second row at
 * any breakpoint. Mobile keeps the existing swipe feel; tablet and desktop get
 * soft-UI Previous / Next controls tinted with the student's personal accent.
 */

interface Props {
  /** Pre-sorted cards. Order is owned by the caller. */
  items: { id: string; node: ReactNode }[];
  label: string;
}

export function StudentClassCarousel({ items, label }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const accent = useStudentAccent();
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  /** True when the track can actually scroll (more cards than fit). */
  const [scrollable, setScrollable] = useState(false);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollable(max > 8);
    setAtStart(el.scrollLeft <= 8);
    setAtEnd(el.scrollLeft >= max - 8);
  }, []);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [sync, items.length]);

  const step = useCallback(
    (dir: -1 | 1) => {
      const el = trackRef.current;
      if (!el) return;
      const first = el.firstElementChild as HTMLElement | null;
      const gap = 20;
      // Advance approximately one card at a time.
      const amount = first ? first.offsetWidth + gap : el.clientWidth * 0.6;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollBy({ left: dir * amount, behavior: reduce ? "auto" : "smooth" });
    },
    [],
  );

  const arrowClass =
    "absolute top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border bg-white/95 shadow-[0_10px_26px_rgba(15,23,42,0.14)] backdrop-blur transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 disabled:cursor-default disabled:opacity-35 disabled:shadow-none motion-reduce:transition-none motion-reduce:active:scale-100 sm:inline-flex";

  return (
    <div className="relative" style={accent.vars}>
      {scrollable && (
        <>
          <button
            type="button"
            aria-label="Previous classes"
            onClick={() => step(-1)}
            disabled={atStart}
            style={{
              color: "var(--student-accent)",
              borderColor: "var(--student-accent-border)",
            }}
            className={cn(arrowClass, "left-0 sm:-left-2 lg:-left-5")}
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next classes"
            onClick={() => step(1)}
            disabled={atEnd}
            style={{
              color: "var(--student-accent)",
              borderColor: "var(--student-accent-border)",
            }}
            className={cn(arrowClass, "right-0 sm:-right-2 lg:-right-5")}
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>
        </>
      )}

      <div
        ref={trackRef}
        onScroll={sync}
        role="group"
        aria-label={label}
        tabIndex={0}
        className={cn(
          "-mx-4 flex snap-x snap-mandatory flex-nowrap gap-3.5 overflow-x-auto overscroll-x-contain px-4 pb-2",
          "sm:mx-0 sm:gap-5 sm:px-0 focus-visible:outline-none",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "shrink-0 grow-0 snap-start",
              // One large card on phones, two large cards from tablet up — and
              // deliberately still two at 1600px+ so cards stay immersive.
              "w-[84%] max-w-[420px] sm:w-[calc((100%-1.25rem)/2)] sm:max-w-none",
            )}
          >
            {item.node}
          </div>
        ))}
      </div>
    </div>
  );
}

export default StudentClassCarousel;
