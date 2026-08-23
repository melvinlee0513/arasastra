import { useState } from "react";
import { Link } from "react-router-dom";
import { LifeBuoy } from "lucide-react";
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
import {
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
  PRIVACY_SUMMARY,
  PRIVACY_TOC,
} from "@/content/privacyPolicy";
import { DECOR_ART, PRIVACY_ART } from "@/lib/studentIllustrations";
import { usePageMeta } from "@/lib/pageMeta";
import { cn } from "@/lib/utils";

/**
 * Privacy Policy — shared across guests, students, tutors and admins. Content
 * lives in `src/content/privacyPolicy.ts`; this page is presentation only.
 */
export function PrivacyPolicyPage() {
  usePageMeta({
    title: "Privacy Policy | Aras A+",
    description:
      "How Aras A+ collects, uses, shares and protects information for tuition centres, students and tutors.",
    canonicalPath: "/privacy",
  });

  // Every section starts open so the policy is readable and printable in full.
  const [openSections, setOpenSections] = useState<string[]>(PRIVACY_SECTIONS.map((s) => s.id));

  return (
    <ServicePage maxWidth="max-w-3xl lg:max-w-5xl">
      <ServiceReveal>
        <ServiceHeader
          art={PRIVACY_ART.hero}
          title="Privacy Policy"
          subtitle={`Last updated ${PRIVACY_LAST_UPDATED}`}
        />
      </ServiceReveal>

      {/* summary */}
      <ServiceReveal delay={40}>
        <section
          className={cn(SERVICE_CARD, "relative mb-6 overflow-hidden p-4")}
          aria-labelledby="privacy-summary-heading"
        >
          <DecorArt src={DECOR_ART.cloud} className="absolute -right-5 -top-5 h-20 w-20 opacity-[0.16]" />
          <div className="relative flex items-start gap-3">
            <ServiceArtBubble
              src={PRIVACY_ART.shield}
              size="lg"
              eager
              className="bg-primary/5 ring-1 ring-inset ring-white"
            />
            <div className="min-w-0">
              <h2 id="privacy-summary-heading" className="text-[16px] font-bold text-slate-900">
                {PRIVACY_SUMMARY.title}
              </h2>
              {PRIVACY_SUMMARY.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-1 text-[13.5px] leading-relaxed text-slate-600">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </section>
      </ServiceReveal>

      <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* table of contents */}
        <ServiceReveal delay={80} className="mb-6 lg:mb-0 lg:sticky lg:top-6">
          <nav className={cn(SERVICE_CARD, "p-3.5")} aria-labelledby="privacy-toc-heading">
            <h2 id="privacy-toc-heading" className="px-1 pb-1 text-[13px] font-bold uppercase tracking-wide text-slate-500">
              On this page
            </h2>
            <ol className="space-y-0.5">
              {PRIVACY_TOC.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={() =>
                      setOpenSections((prev) =>
                        prev.includes(item.id) ? prev : [...prev, item.id],
                      )
                    }
                    className="flex items-start gap-2 rounded-xl px-2 py-2 text-[13.5px] leading-snug text-slate-700 transition-colors hover:bg-primary/8 hover:text-slate-900"
                  >
                    <span className="w-4 shrink-0 text-right font-semibold text-primary">
                      {item.number}
                    </span>
                    <span>{item.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </ServiceReveal>

        {/* policy sections */}
        <div>
          <ServiceSectionHeading title="Policy" />
          <ServiceReveal delay={120}>
            <Accordion
              type="multiple"
              value={openSections}
              onValueChange={setOpenSections}
              className={cn(SERVICE_CARD, "px-3 py-1")}
            >
              {PRIVACY_SECTIONS.map((section) => (
                <AccordionItem
                  key={section.id}
                  id={section.id}
                  value={section.id}
                  className="scroll-mt-24 border-slate-200/70"
                >
                  <AccordionTrigger className="py-3.5 text-left text-[15px] font-bold text-slate-900 hover:no-underline">
                    <span className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-bold text-primary">
                        {section.number}
                      </span>
                      <span>{section.title}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2.5 pb-4 text-[13.5px] leading-relaxed text-slate-600">
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {section.bullets && (
                      <ul className="ml-1 list-disc space-y-1.5 pl-4">
                        {section.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                    {section.closing?.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </ServiceReveal>

          <ServiceReveal delay={160}>
            <Link
              to="/support"
              className={cn(
                SERVICE_CARD,
                "mt-5 flex items-center gap-3 p-4 transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transform-none",
              )}
            >
              <ServiceArtBubble
                src={PRIVACY_ART.info}
                size="md"
                className="bg-primary/5 ring-1 ring-inset ring-white"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-bold text-slate-900">
                  Questions about your data?
                </span>
                <span className="block text-[13px] leading-snug text-slate-600">
                  Send us a request from Help &amp; Support.
                </span>
              </span>
              <LifeBuoy className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            </Link>
          </ServiceReveal>

          <p className="mt-5 px-1 text-[12px] text-muted-foreground">
            Last updated {PRIVACY_LAST_UPDATED} · Aras A+ is provided by Futron Digital.
          </p>
        </div>
      </div>

      <ServiceFooterDecor />
    </ServicePage>
  );
}

export default PrivacyPolicyPage;
