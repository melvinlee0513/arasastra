import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  FileCheck2,
  History,
  Lock,
  LifeBuoy,
  Mail,
  ListOrdered,
  Share2,
  ShieldCheck,
  UserCircle2,
  Users,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DecorArt,
  ServiceArtBubble,
  ServiceHeroBanner,
  ServicePage,
  ServicePageTitle,
  ServiceReveal,
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

/** Functional section icons — consistent blue line icons in soft circles. */
const SECTION_ICONS: Record<string, typeof BookOpen> = {
  introduction: BookOpen,
  "information-we-collect": ClipboardList,
  "how-we-use-information": Users,
  "information-sharing": Share2,
  "data-storage-security": ShieldCheck,
  "your-rights": UserCircle2,
  "data-retention": History,
  "students-younger-users": FileCheck2,
  "changes-to-this-policy": Lock,
  "contact-us": Mail,
};

const MOBILE_TOC_PREVIEW = 5;

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

  // Introduction opens by default; the rest stay collapsed for easy scanning.
  const [openSections, setOpenSections] = useState<string[]>([PRIVACY_SECTIONS[0]?.id ?? ""]);
  const [tocExpanded, setTocExpanded] = useState(false);

  const openSection = (id: string) => {
    setOpenSections((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  return (
    <ServicePage maxWidth="max-w-3xl lg:max-w-[1120px]">
      <ServiceReveal>
        <ServicePageTitle
          title="Privacy Policy"
          subtitle="Learn how Aras A+ collects, uses and protects your information."
        />
        <ServiceHeroBanner
          art={PRIVACY_ART.hero}
          subtitle={PRIVACY_SUMMARY.paragraphs[0]}
          className="md:min-h-[210px]"
          artClassName="w-[48%] md:w-[46%]"
        />
      </ServiceReveal>

      <div className="lg:grid lg:grid-cols-[minmax(0,27fr)_minmax(0,73fr)] lg:items-start lg:gap-5">
        {/* table of contents */}
        <ServiceReveal delay={60} className="mb-5 lg:mb-0 lg:sticky lg:top-6">
          <nav
            className={cn(SERVICE_CARD, "relative overflow-hidden p-3.5")}
            aria-labelledby="privacy-toc-heading"
          >
            <div className="mb-2 flex items-center gap-2.5 px-0.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                <ListOrdered className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <h2 id="privacy-toc-heading" className="text-[15.5px] font-bold text-slate-900">
                On this page
              </h2>
            </div>

            <ol className="space-y-1">
              {PRIVACY_TOC.map((item, index) => {
                const hiddenOnMobile = !tocExpanded && index >= MOBILE_TOC_PREVIEW;
                const active = openSections.includes(item.id);
                return (
                  <li key={item.id} className={hiddenOnMobile ? "hidden lg:block" : undefined}>
                    <a
                      href={`#${item.id}`}
                      onClick={() => openSection(item.id)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-[13.5px] leading-snug transition-colors",
                        active
                          ? "border-primary/30 bg-primary/[0.08] font-semibold text-primary"
                          : "border-transparent text-slate-700 hover:bg-primary/[0.05] hover:text-slate-900",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold",
                          active ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {item.number}
                      </span>
                      <span className="min-w-0">{item.title}</span>
                    </a>
                  </li>
                );
              })}
            </ol>

            {!tocExpanded && (
              <button
                type="button"
                onClick={() => setTocExpanded(true)}
                className="mt-1.5 flex w-full items-center justify-between rounded-2xl px-2.5 py-2 text-[13px] font-semibold text-primary hover:bg-primary/[0.06] lg:hidden"
              >
                View all ({PRIVACY_TOC.length})
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <DecorArt
              src={DECOR_ART.orb}
              className="pointer-events-none absolute -bottom-4 right-1 hidden h-16 w-16 opacity-[0.18] lg:block"
            />
          </nav>
        </ServiceReveal>

        {/* policy sections */}
        <div>
          <ServiceReveal delay={100}>
            <Accordion
              type="multiple"
              value={openSections}
              onValueChange={setOpenSections}
              className="space-y-2.5"
            >
              {PRIVACY_SECTIONS.map((section) => {
                const Icon = SECTION_ICONS[section.id] ?? BookOpen;
                return (
                  <AccordionItem
                    key={section.id}
                    id={section.id}
                    value={section.id}
                    className={cn(SERVICE_CARD, "scroll-mt-24 rounded-[20px] border px-4 md:px-5")}
                  >
                    <AccordionTrigger className="min-h-[56px] py-3.5 text-left text-[15.5px] font-bold text-slate-900 hover:no-underline md:text-[17px]">
                      <span className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Icon className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
                        </span>
                        <span className="text-primary">
                          {section.number}.{" "}
                          <span className="text-slate-900">{section.title}</span>
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2.5 border-t border-slate-100 pb-4 pt-3.5 text-[13.5px] leading-relaxed text-slate-600 md:text-[14.5px]">
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
                );
              })}
            </Accordion>
          </ServiceReveal>

          <ServiceReveal delay={140}>
            <Link
              to="/support"
              className={cn(
                SERVICE_CARD,
                "mt-4 flex items-center gap-3 rounded-[20px] p-4 transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transform-none",
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

          {/* last updated — metadata footer row */}
          <p className="mt-4 flex items-center justify-center gap-2 px-1 pb-6 text-[12.5px] text-slate-500">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Last updated: {PRIVACY_LAST_UPDATED} · Aras A+ is provided by Futron Digital.
          </p>
        </div>
      </div>
    </ServicePage>
  );
}

export default PrivacyPolicyPage;
