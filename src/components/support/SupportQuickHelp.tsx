import { ChevronRight } from "lucide-react";
import { QuickHelpTopic } from "@/content/supportFaq";
import { HELP_SUPPORT_ART } from "@/lib/studentIllustrations";
import { SERVICE_CARD } from "@/components/dashboard/services/StudentServiceChrome";
import { cn } from "@/lib/utils";

/**
 * Quick Help — one contained card holding compact topic rows (single column on
 * mobile, 2 x 3 on desktop). A tap jumps to the matching FAQ answers and
 * pre-selects the Contact Support category, so it always leads somewhere real.
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
  return (
    <section className={cn(SERVICE_CARD, "p-3.5 md:p-4")} aria-labelledby="quick-help-heading">
      <div className="mb-3 flex items-center gap-2.5 px-0.5">
        <img
          src={HELP_SUPPORT_ART.lifebuoy}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="pointer-events-none h-9 w-9 select-none object-contain drop-shadow-[0_2px_4px_rgba(15,23,42,0.14)]"
        />
        <div className="min-w-0">
          <h2 id="quick-help-heading" className="text-[16px] font-bold leading-tight text-slate-900">
            Quick Help
          </h2>
          <p className="text-[12.5px] leading-snug text-slate-500">Find help for common topics</p>
        </div>
      </div>

      {topics.length === 0 ? (
        <p className="rounded-[16px] border border-slate-200/70 bg-slate-50/70 px-3.5 py-4 text-[13px] text-slate-500">
          No help topics match your search. Try a different word, or send us a request below.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {topics.map((topic) => {
            const active = topic.id === activeTopicId;
            return (
              <li key={topic.id}>
                <button
                  type="button"
                  onClick={() => onSelect(topic)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[16px] border bg-slate-50/60 px-3 py-2.5 text-left",
                    "min-h-[56px] transition-colors duration-150",
                    "hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                    active ? "border-primary/50 bg-primary/[0.07]" : "border-slate-200/70",
                  )}
                >
                  <img
                    src={HELP_SUPPORT_ART[topic.art]}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    className="pointer-events-none h-9 w-9 shrink-0 select-none object-contain drop-shadow-[0_2px_4px_rgba(15,23,42,0.14)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold leading-tight text-slate-900">
                      {topic.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-slate-500 line-clamp-2">
                      {topic.description}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
