import { Link } from "react-router-dom";
import { ArrowRight, Calendar, Layers, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Decor, Illustration } from "@/components/class/ClassHubChrome";
import { STATE_ART } from "@/lib/classIllustrations";

/**
 * Presentational Class Home cards. No data access and no role logic — the page
 * owns the queries and passes plain values in. Shared so the same composition
 * can be reused by other Class Hub surfaces.
 */

export interface AnnouncementCardData {
  title: string;
  body: string | null;
  is_pinned: boolean;
  published_at: string | null;
  created_at: string;
  edited_at?: string | null;
}

/** Latest pinned/published announcement teaser with soft-3D megaphone. */
export function ClassAnnouncementCard({
  announcement,
  allHref,
}: {
  announcement: AnnouncementCardData;
  allHref: string;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-3xl border p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6 ${
        announcement.is_pinned ? "border-amber-200 bg-amber-50/80" : "border-slate-200 bg-white"
      }`}
    >
      <Decor art="star" className="left-2 bottom-3 w-6 opacity-60" />
      {/* Soft-3D megaphone anchors the card, matching the reference. */}
      <Illustration
        src={STATE_ART.megaphone}
        className="pointer-events-none absolute -right-3 top-1/2 w-28 -translate-y-1/2 drop-shadow-[0_14px_24px_rgba(15,23,42,0.18)] sm:w-32"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold text-slate-900 md:text-base">Latest announcement</h2>
          <Button asChild variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-[13px] text-hub-accent">
            <Link to={allHref}>
              View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <div className="pr-[104px] sm:pr-32">
        {announcement.is_pinned && (
          <Badge className="mt-2 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">
            <Pin className="mr-1 h-3 w-3" /> Pinned
          </Badge>
        )}
        <h3 className="mt-2 break-words text-[15px] font-bold leading-snug text-slate-900">
          {announcement.title}
        </h3>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Calendar className="h-3.5 w-3.5 text-hub-accent" aria-hidden="true" />
          {new Date(announcement.published_at || announcement.created_at).toLocaleString()}
          {announcement.edited_at && " · edited"}
        </p>
        {announcement.body && (
          <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 line-clamp-4">
            {announcement.body}
          </p>
        )}
        </div>
      </div>
    </section>
  );
}

export interface GlanceCounts {
  replays: number;
  notes: number;
  worksheets: number;
  links: number;
}

/** "At a glance" material counters with illustrated rows + Browse CTA. */
export function ClassGlanceCard({
  counts,
  materialsPath,
}: {
  counts: GlanceCounts;
  materialsPath: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-5">
      <Decor art="star" className="right-3 top-3 w-7 opacity-75" />
      <Decor art="orbs" className="-left-5 bottom-20 w-14 opacity-20" />
      <div className="relative mb-2 flex items-center gap-2.5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-hub-tint">
          <Illustration
            src={STATE_ART.glance}
            className="h-8 w-8 drop-shadow-[0_4px_9px_rgba(15,23,42,0.16)]"
          />
        </span>
        <h3 className="text-[16px] font-bold text-slate-900">At a glance</h3>
      </div>
      <ul className="relative divide-y divide-slate-100 text-sm">
        <GlanceRow art={STATE_ART.replay} label="Replays" value={counts.replays} />
        <GlanceRow art={STATE_ART.notes} label="Notes" value={counts.notes} />
        <GlanceRow art={STATE_ART.worksheet} label="Worksheets" value={counts.worksheets} />
        <GlanceRow art={STATE_ART.link} label="Links" value={counts.links} />
      </ul>
      <Button asChild className="relative mt-4 h-12 w-full rounded-full text-[15px]">
        <Link to={materialsPath}>
          <Layers className="mr-2 h-4 w-4" /> Browse materials
        </Link>
      </Button>
    </section>
  );
}

function GlanceRow({ art, label, value }: { art: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="inline-flex min-w-0 items-center gap-2.5 font-medium text-slate-700">
        <Illustration
          src={art}
          className="h-8 w-8 shrink-0 drop-shadow-[0_3px_7px_rgba(15,23,42,0.14)]"
        />
        <span className="truncate">{label}</span>
      </span>
      <span className="min-w-[44px] shrink-0 rounded-full bg-slate-50 px-3 py-1 text-center text-[13px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
        {value}
      </span>
    </li>
  );
}
