import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, HelpCircle, Mail, Search, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DecorArt,
  ServiceHeroBanner,
  ServicePage,
  ServicePageTitle,
  ServiceReveal,
  SERVICE_CARD,
} from "@/components/dashboard/services/StudentServiceChrome";
import { SupportQuickHelp } from "@/components/support/SupportQuickHelp";
import { SupportContactForm } from "@/components/support/SupportContactForm";
import {
  FaqItem,
  QUICK_HELP_TOPICS,
  QuickHelpTopic,
  SUPPORT_FAQ,
  searchFaq,
  searchQuickHelp,
} from "@/content/supportFaq";
import { DECOR_ART, HELP_SUPPORT_ART } from "@/lib/studentIllustrations";
import { useIsMobile } from "@/hooks/use-mobile";
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

  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<QuickHelpTopic | null>(null);
  const [presetCategory, setPresetCategory] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

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
    if (next && isMobile) setFormOpen(true);
    document.getElementById("faq")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const contactForm = (
    <SupportContactForm
      presetCategory={presetCategory}
      onPresetConsumed={() => setPresetCategory(null)}
    />
  );

  return (
    <ServicePage maxWidth="max-w-3xl lg:max-w-[1120px]">
      <ServiceReveal>
        <ServicePageTitle
          title="Help & Support"
          subtitle="Need help? We're here to support your learning journey."
        />
        <ServiceHeroBanner
          art={HELP_SUPPORT_ART.hero}
          eyebrow="Hi there! 👋"
          subtitle="How can we help you today?"
        />
      </ServiceReveal>

      {/* search */}
      <ServiceReveal delay={40}>
        <div className={cn(SERVICE_CARD, "mb-5 flex items-center gap-2.5 rounded-full px-4 py-1.5 md:px-5")}>
          <Search className="h-4.5 w-4.5 shrink-0 text-slate-400" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search FAQs or help topics..."
            aria-label="Search FAQs or help topics"
            className="h-11 border-0 bg-transparent px-0 text-[14.5px] shadow-none focus-visible:ring-0"
          />
        </div>
      </ServiceReveal>

      {/* quick help + contact */}
      <section className="mb-6 lg:grid lg:grid-cols-[minmax(0,53fr)_minmax(0,47fr)] lg:items-start lg:gap-5">
        <div className="space-y-4">
          <ServiceReveal delay={80}>
            <SupportQuickHelp
              topics={topics}
              activeTopicId={activeTopic?.id ?? null}
              onSelect={handleTopicSelect}
            />
          </ServiceReveal>

          {/* mobile / tablet: compact contact CTA opening the form in a dialog */}
          {isMobile && (
            <ServiceReveal delay={110}>
              <div className={cn(SERVICE_CARD, "p-4")}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                    <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[15.5px] font-bold leading-tight text-slate-900">
                      Contact Support
                    </h2>
                    <p className="mt-0.5 text-[13px] leading-snug text-slate-500">
                      Send us a message and we'll get back to you.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => setFormOpen(true)}
                  className="mt-3.5 min-h-12 w-full rounded-full bg-[linear-gradient(100deg,hsl(var(--primary)),#6366f1)] text-[15px] font-semibold text-primary-foreground shadow-[0_8px_20px_rgba(79,70,229,0.28)] hover:opacity-95"
                >
                  <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Send Support Request
                </Button>
              </div>
            </ServiceReveal>
          )}

          {/* "we're here for you" illustrated card */}
          <ServiceReveal delay={140}>
            <aside
              className={cn(
                SERVICE_CARD,
                "relative isolate overflow-hidden rounded-[24px] bg-[linear-gradient(110deg,#f2f6ff_0%,#f7f5ff_100%)]",
              )}
              aria-labelledby="support-response-heading"
            >
              <div className="relative min-h-[132px] p-4 pr-[40%] md:min-h-[148px]">
                <h3
                  id="support-response-heading"
                  className="flex items-center gap-2 text-[15px] font-bold leading-tight text-primary"
                >
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  We're here for you
                </h3>
                <p className="mt-1.5 text-[13px] leading-snug text-slate-600">
                  Support requests are reviewed by the Aras A+ team. For enrolment, fees or class
                  changes, your tuition centre can help fastest.
                </p>
                <Link
                  to="/privacy"
                  className="mt-2.5 inline-flex items-center gap-2 text-[13px] font-semibold text-slate-800 hover:text-primary"
                >
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  How we handle your data
                </Link>
              </div>
              <DecorArt
                src={HELP_SUPPORT_ART.chat}
                className="absolute bottom-0 right-0 h-[calc(100%-8px)] w-[40%] object-right-bottom"
              />
            </aside>
          </ServiceReveal>
        </div>

        {/* desktop: inline form card */}
        {!isMobile && (
          <ServiceReveal delay={120} className="mt-4 lg:mt-0">
            <div className={cn(SERVICE_CARD, "p-4 md:p-5")}>
              <div className="mb-3.5 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[16px] font-bold leading-tight text-slate-900">
                    Contact Support
                  </h2>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">
                    Send us a message and we'll get back to you.
                  </p>
                </div>
              </div>
              {contactForm}
            </div>
          </ServiceReveal>
        )}
      </section>

      {isMobile && (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-h-[92vh] max-w-[560px] overflow-y-auto rounded-[24px]">
            <DialogHeader>
              <DialogTitle>Contact Support</DialogTitle>
              <DialogDescription>
                Send us a message and we'll get back to you.
              </DialogDescription>
            </DialogHeader>
            {contactForm}
          </DialogContent>
        </Dialog>
      )}

      {/* faq */}
      <section id="faq" className="scroll-mt-24">
        <ServiceReveal delay={180}>
          <div className={cn(SERVICE_CARD, "p-3.5 md:p-5")}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <HelpCircle className="h-5 w-5 text-primary" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[16px] font-bold leading-tight text-slate-900">
                    Frequently Asked Questions
                  </h2>
                  <p className="text-[12.5px] leading-snug text-slate-500">
                    Quick answers to common questions
                  </p>
                </div>
              </div>
              {activeTopic && (
                <button
                  type="button"
                  onClick={() => setActiveTopic(null)}
                  className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-primary/10"
                >
                  Clear filter
                </button>
              )}
            </div>

            {faqItems.length === 0 ? (
              <p className="rounded-[16px] border border-slate-200/70 bg-slate-50/70 px-4 py-5 text-[13px] text-slate-500">
                No answers match “{query}”. Send us a request above and we'll help directly.
              </p>
            ) : (
              <div className="lg:grid lg:grid-cols-2 lg:gap-x-4">
                <FaqColumn items={faqItems.filter((_, i) => i % 2 === 0)} idSuffix="a" />
                <FaqColumn items={faqItems.filter((_, i) => i % 2 === 1)} idSuffix="b" />
              </div>
            )}
          </div>
        </ServiceReveal>
      </section>

      <DecorArt src={DECOR_ART.star} className="mx-auto mt-6 h-5 w-5 opacity-60" />
      <div className="h-4" />
    </ServicePage>
  );
}

/** One accordion column — desktop lays the FAQ out in two columns. */
function FaqColumn({ items, idSuffix }: { items: FaqItem[]; idSuffix: string }) {
  if (items.length === 0) return null;
  return (
    <Accordion type="single" collapsible className="space-y-2">
      {items.map((item) => (
        <AccordionItem
          key={`${item.id}-${idSuffix}`}
          value={`${item.id}-${idSuffix}`}
          className="rounded-[16px] border border-slate-200/70 bg-slate-50/50 px-3.5"
        >
          <AccordionTrigger className="min-h-[52px] py-3 text-left text-[14px] font-semibold text-slate-900 hover:no-underline">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="pb-3.5 text-[13.5px] leading-relaxed text-slate-600">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export default SupportPage;
