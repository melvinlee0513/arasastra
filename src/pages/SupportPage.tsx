import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DecorArt,
  ServiceArtBubble,
  ServiceFooterDecor,
  ServiceHeader,
  ServicePage,
  ServiceReveal,
  ServiceSectionHeading,
  SERVICE_CARD,
} from "@/components/dashboard/services/StudentServiceChrome";
import { SupportQuickHelp } from "@/components/support/SupportQuickHelp";
import { SupportContactForm } from "@/components/support/SupportContactForm";
import {
  QUICK_HELP_TOPICS,
  QuickHelpTopic,
  SUPPORT_FAQ,
  searchFaq,
  searchQuickHelp,
} from "@/content/supportFaq";
import { DECOR_ART, HELP_SUPPORT_ART } from "@/lib/studentIllustrations";
import { usePageMeta } from "@/lib/pageMeta";
import { cn } from "@/lib/utils";

/**
 * Help & Support — shared across guests, students, tutors and admins. The
 * surrounding chrome is supplied by SharedInfoShell; this page holds no
 * role-specific logic and shows no centre or personal data.
 */
export function SupportPage() {
  usePageMeta({
    title: "Help & Support | Aras A+",
    description:
      "Get help with your Aras A+ account, classes, learning materials and timetable, or send a support request to the Aras A+ team.",
    canonicalPath: "/support",
  });

  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<QuickHelpTopic | null>(null);
  const [presetCategory, setPresetCategory] = useState<string | null>(null);

  const topics = useMemo(() => searchQuickHelp(QUICK_HELP_TOPICS, query), [query]);

  const faqItems = useMemo(() => {
    const searched = searchFaq(SUPPORT_FAQ, query);
    if (!activeTopic) return searched;
    const filtered = searched.filter((item) => item.tag === activeTopic.tag);
    return filtered.length > 0 ? filtered : searched;
  }, [query, activeTopic]);

  const handleTopicSelect = (topic: QuickHelpTopic) => {
    const next = activeTopic?.id === topic.id ? null : topic;
    setActiveTopic(next);
    setPresetCategory(next ? next.category : null);
    document.getElementById("faq")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <ServicePage maxWidth="max-w-3xl lg:max-w-5xl">
      <ServiceReveal>
        <ServiceHeader
          art={HELP_SUPPORT_ART.hero}
          title="Help & Support"
          subtitle="Find quick answers, or send us a request — we're happy to help."
        />
      </ServiceReveal>

      {/* search */}
      <ServiceReveal delay={40}>
        <div className={cn(SERVICE_CARD, "mb-6 flex items-center gap-2 px-3.5 py-2.5")}>
          <Search className="h-4.5 w-4.5 shrink-0 text-slate-400" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help topics and FAQs"
            aria-label="Search help topics and FAQs"
            className="h-9 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          />
        </div>
      </ServiceReveal>

      {/* quick help */}
      <section className="mb-8">
        <ServiceSectionHeading title="Quick help" />
        <ServiceReveal delay={80}>
          <SupportQuickHelp
            topics={topics}
            activeTopicId={activeTopic?.id ?? null}
            onSelect={handleTopicSelect}
          />
        </ServiceReveal>
      </section>

      {/* contact + reassurance */}
      <section className="mb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div>
          <ServiceSectionHeading title="Contact support" />
          <ServiceReveal delay={120}>
            <SupportContactForm
              presetCategory={presetCategory}
              onPresetConsumed={() => setPresetCategory(null)}
            />
          </ServiceReveal>
        </div>

        <ServiceReveal delay={160} className="mt-6 lg:mt-[52px]">
          <aside
            className={cn(SERVICE_CARD, "relative overflow-hidden p-4")}
            aria-labelledby="support-response-heading"
          >
            <DecorArt
              src={DECOR_ART.cloud}
              className="absolute -right-4 -top-4 h-16 w-16 opacity-[0.18]"
            />
            <div className="relative flex items-start gap-3">
              <ServiceArtBubble
                src={HELP_SUPPORT_ART.chat}
                size="lg"
                className="bg-primary/5 ring-1 ring-inset ring-white"
              />
              <div className="min-w-0">
                <h3
                  id="support-response-heading"
                  className="text-[15.5px] font-bold leading-tight text-slate-900"
                >
                  We're here for you
                </h3>
                <p className="mt-1 text-[13px] leading-snug text-slate-600">
                  Support requests are reviewed by the Aras A+ team. For enrolment, fees or class
                  changes, your tuition centre can help fastest — they manage classes and access.
                </p>
              </div>
            </div>
            <Link
              to="/privacy"
              className="relative mt-3 flex items-center gap-2 rounded-2xl bg-primary/5 px-3 py-2.5 text-[13px] font-semibold text-slate-800 transition-colors hover:bg-primary/10"
            >
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              How we handle your data
            </Link>
          </aside>
        </ServiceReveal>
      </section>

      {/* faq */}
      <section id="faq" className="scroll-mt-24">
        <ServiceSectionHeading
          title="Frequently asked questions"
          action={
            activeTopic ? (
              <button
                type="button"
                onClick={() => setActiveTopic(null)}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-primary/10"
              >
                Clear filter
              </button>
            ) : undefined
          }
        />
        <ServiceReveal delay={200}>
          {faqItems.length === 0 ? (
            <p className={cn(SERVICE_CARD, "px-4 py-5 text-[13px] text-slate-500")}>
              No answers match “{query}”. Send us a request above and we'll help directly.
            </p>
          ) : (
            <Accordion type="single" collapsible className={cn(SERVICE_CARD, "px-3 py-1")}>
              {faqItems.map((item) => (
                <AccordionItem key={item.id} value={item.id} className="border-slate-200/70">
                  <AccordionTrigger className="py-3.5 text-left text-[14.5px] font-semibold text-slate-900 hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 text-[13.5px] leading-relaxed text-slate-600">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </ServiceReveal>
      </section>

      <ServiceFooterDecor />
    </ServicePage>
  );
}

export default SupportPage;
