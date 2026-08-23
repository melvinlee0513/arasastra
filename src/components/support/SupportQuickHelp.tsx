import { QuickHelpTopic } from "@/content/supportFaq";
import { HELP_SUPPORT_ART } from "@/lib/studentIllustrations";
import { ServiceArtBubble } from "@/components/dashboard/services/StudentServiceChrome";
import { cn } from "@/lib/utils";

/**
 * Quick Help grid — each tile jumps to the matching FAQ answers and pre-selects
 * the Contact Support category, so a tap always leads somewhere real.
 */
export function SupportQuickHelp({
  topics,
  activeTopicId,
  onSelect,
}: {
  topics: QuickHelpTopic[];
  activeTopicId: string | null;
  onSelect: (topic: QuickHelpTopic) => void;
}) {
  if (topics.length === 0) {
    return (
      <p className="rounded-[20px] border border-slate-200/70 bg-white px-4 py-5 text-[13px] text-slate-500">
        No help topics match your search. Try a different word, or send us a request below.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
      {topics.map((topic) => {
        const active = topic.id === activeTopicId;
        return (
          <button
            key={topic.id}
            type="button"
            onClick={() => onSelect(topic)}
            aria-pressed={active}
            className={cn(
              "flex min-h-[132px] flex-col items-start gap-2 rounded-[22px] border bg-white p-3.5 text-left",
              "shadow-[0_6px_22px_rgba(15,23,42,0.06)] transition-transform duration-150",
              "hover:-translate-y-0.5 active:scale-[0.98] motion-reduce:transform-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              active ? "border-primary/50 ring-2 ring-primary/25" : "border-slate-200/70",
            )}
          >
            <ServiceArtBubble
              src={HELP_SUPPORT_ART[topic.art]}
              size="md"
              className="bg-primary/5 ring-1 ring-inset ring-white"
            />
            <span className="text-[14px] font-bold leading-tight text-slate-900">{topic.title}</span>
            <span className="text-[12px] leading-snug text-slate-500">{topic.description}</span>
          </button>
        );
      })}
    </div>
  );
}
