import { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Home, ChevronRight, BookOpen, User, Clock, Calendar,
  LayoutGrid, Megaphone, FileText, MessageCircle, HelpCircle, Info, Users, ImagePlus, Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClassContextData } from "@/hooks/useClassContext";
import { cn } from "@/lib/utils";
import { ClassCover } from "@/components/class/ClassCover";
import { ClassCoverManager } from "@/components/class/ClassCoverManager";
import { tutorLabel } from "@/lib/classCovers";
import { useFeatureEnabled, type FeatureFlag } from "@/hooks/useFeature";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import { Decor, Illustration } from "@/components/class/ClassHubChrome";
import { CLASS_NAV_ART, subjectArt } from "@/lib/classIllustrations";


export type ClassSection =
  | "home"
  | "announcements"
  | "materials"
  | "students"
  | "discussions"
  | "quizzes"
  | "flashcards"
  | "about";


type BreadcrumbItem = { label: string; to?: string };

interface ClassShellProps {
  data: ClassContextData | undefined;
  isLoading: boolean;
  role: "student" | "tutor" | "admin";
  section: ClassSection;
  basePath: string; // e.g. /dashboard/classes/:id, /tutor/classes/:id, /admin/classes/:id
  materialsPath: string; // student uses /materials, tutor/admin uses /resources
  breadcrumbs: BreadcrumbItem[];
  headerRight?: ReactNode;
  /**
   * Immersive activities (quiz result review, etc.) keep only the mobile back
   * bar — no compact header and no section launcher on phones.
   */
  mobileImmersive?: boolean;
  /** Overrides for the mobile back bar when the page is not a plain section. */
  mobileTitle?: string;
  mobileBackTo?: string;
  mobileBackLabel?: string;
  /** Trailing slot in the mobile back bar (progress, actions). */
  mobileHeaderRight?: ReactNode;
  children: ReactNode;
}

type NavEntry = {
  key: ClassSection;
  label: string;
  /** Shorter label used by the compact mobile launcher. */
  shortLabel?: string;
  icon: typeof Home;
  /** Soft-3D artwork used by the mobile launcher tiles. */
  art: string;
  disabled?: boolean;
  disabledLabel?: string;
  managerOnly?: boolean; // tutor + admin only
  /** Tenant feature flag that must be enabled for this item to appear. */
  featureFlag?: FeatureFlag;
};

const NAV: NavEntry[] = [
  { key: "home", label: "Home", icon: LayoutGrid, art: CLASS_NAV_ART.home },
  { key: "announcements", label: "Announcements", shortLabel: "News", icon: Megaphone, art: CLASS_NAV_ART.announcements },
  { key: "materials", label: "Materials", icon: FileText, art: CLASS_NAV_ART.materials },
  { key: "students", label: "Students", icon: Users, art: CLASS_NAV_ART.students, managerOnly: true },
  { key: "discussions", label: "Discussions", shortLabel: "Discuss", icon: MessageCircle, art: CLASS_NAV_ART.discussions, disabled: true, disabledLabel: "Coming soon" },
  { key: "quizzes", label: "Quizzes", shortLabel: "Quiz", icon: HelpCircle, art: CLASS_NAV_ART.quizzes },
  { key: "flashcards", label: "Flashcards", shortLabel: "Cards", icon: Layers, art: CLASS_NAV_ART.flashcards, featureFlag: "flashcards" },
  { key: "about", label: "About", icon: Info, art: CLASS_NAV_ART.about },
];

const SECTION_TITLES: Record<ClassSection, string> = {
  home: "Class",
  announcements: "Announcements",
  materials: "Materials",
  students: "Students",
  discussions: "Discussions",
  quizzes: "Quizzes",
  flashcards: "Flashcards",
  about: "About",
};

function classListRoute(role: ClassShellProps["role"]): { to: string; label: string } {
  if (role === "student") return { to: "/dashboard/classes", label: "My Classes" };
  if (role === "tutor") return { to: "/tutor/classes", label: "Classes" };
  return { to: "/admin/curriculum", label: "Classes" };
}

/** Soft page canvas shared by every Class Hub surface. */
const HUB_CANVAS =
  "min-h-screen bg-gradient-to-b from-[hsl(219,100%,97%)] via-slate-50 to-slate-50";

export function ClassShell({
  data, isLoading, role, section, basePath, materialsPath, breadcrumbs, headerRight,
  mobileImmersive = false, mobileTitle, mobileBackTo, mobileBackLabel, mobileHeaderRight,
  children,
}: ClassShellProps) {
  useLocation(); // keep the shell re-rendering with route changes
  // Feature-flag gating for flag-scoped nav items. Client-side hiding only —
  // backend RPCs remain the authoritative enforcement point.
  const flashcardsEnabled = useFeatureEnabled("flashcards");
  const flagEnabled = (flag?: FeatureFlag): boolean => {
    if (!flag) return true;
    if (flag === "flashcards") return flashcardsEnabled;
    return true;
  };

  if (isLoading) {
    return (
      <div className={cn(HUB_CANVAS, "p-4 md:p-8 space-y-4 md:space-y-6")}>
        <Skeleton className="h-12 md:h-6 w-full md:w-1/2 rounded-full" />
        <Skeleton className="h-44 md:h-56 rounded-3xl" />
        <Skeleton className="h-[168px] md:h-12 rounded-3xl md:rounded-full w-full max-w-2xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  const k = data?.klass;
  const tutorText = tutorLabel(data?.tutors);
  const canManageCover = !!data?.canManage && !!k?.center_id;
  const list = classListRoute(role);
  const classTitle = k?.title || "Class";
  const heroArt = subjectArt(k?.subject?.name);

  // Mobile back bar defaults: sections return to class home, class home returns
  // to the class list. Always a resolved route, never history-only.
  const backTo = mobileBackTo ?? (section === "home" ? list.to : basePath);
  const backLabel = mobileBackLabel ?? (section === "home" ? list.label : classTitle);
  const barTitle =
    mobileTitle ?? (section === "home" ? classTitle : SECTION_TITLES[section]);

  const visibleNav = NAV.filter(
    (item) => !(item.managerOnly && role === "student") && flagEnabled(item.featureFlag),
  );

  return (
    <div className={HUB_CANVAS}>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4 md:space-y-6">
        {/* Mobile: native app bar. Desktop/tablet: breadcrumbs. */}
        <MobileTopBar
          backTo={backTo}
          backLabel={backLabel}
          title={barTitle}
          right={mobileHeaderRight}
          titleVariant={section === "home" && !mobileTitle ? "plain" : "pill"}
        />

        <nav className="hidden md:flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5" />}
              {b.to ? (
                <Link to={b.to} className="inline-flex items-center gap-1 hover:text-primary">
                  {i === 0 && <Home className="w-3.5 h-3.5" />} {b.label}
                </Link>
              ) : (
                <span className="text-slate-900 font-medium truncate max-w-[50vw]">{b.label}</span>
              )}
            </span>
          ))}
        </nav>

        {k && (
          <header
            className={cn(
              "relative bg-white rounded-3xl border border-slate-200/80 shadow-[0_10px_36px_rgb(0,0,0,0.05)] overflow-hidden",
              mobileImmersive && "hidden md:block",
            )}
          >
            {/* Compact banner: 16:9 on mobile, banner-height on tablet/desktop. */}
            {/* Tutor-uploaded cover stays the dominant identity image. When a
                class has no cover we show a shorter branded subject panel. */}
            <ClassCover
              classId={k.id}
              coverPath={k.cover_image_path}
              version={k.cover_image_updated_at}
              priority
              fallbackArt={heroArt}
              sizeClassName={
                k.cover_image_path
                  ? "aspect-video sm:aspect-auto sm:h-44 md:h-52 lg:h-60"
                  : "h-32 sm:h-40 md:h-48 lg:h-56"
              }
              overlay={
                <>
                  {/* Legibility scrim only over a real photographic cover —
                      it would grey out the pastel subject fallback. */}
                  {k.cover_image_path && (
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
                  )}
                  {canManageCover && (
                    <div className="absolute top-3 right-3 z-10">
                      <ClassCoverManager
                        classId={k.id}
                        centerId={k.center_id!}
                        currentPath={k.cover_image_path}
                        currentVersion={k.cover_image_updated_at}
                        trigger={
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-white/60 text-slate-800 hover:bg-white shadow-sm px-3 py-1.5 text-xs font-medium min-h-[36px]"
                          >
                            <ImagePlus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">
                              {k.cover_image_path ? "Change cover" : "Add cover"}
                            </span>
                          </button>
                        }
                      />
                    </div>
                  )}
                </>
              }
            />
            <div className="relative p-4 sm:p-6">
              {/* Supporting subject medallion — only over a real cover, so the
                  fallback artwork is never duplicated. */}
              {k.cover_image_path && (
                <span className="md:hidden absolute -top-8 right-4 z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/70 bg-white/95 shadow-[0_10px_24px_rgb(0,0,0,0.10)] backdrop-blur-sm">
                  <Illustration src={heroArt} className="h-9 w-9" priority />
                </span>
              )}
              <Decor art="star" className="hidden md:block right-4 top-3 w-8 opacity-70" />
              <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
                <div className="flex-1 min-w-0">
                  <h1
                    className={cn(
                      "text-[19px] sm:text-2xl md:text-3xl font-bold text-slate-900 break-words leading-snug line-clamp-2 md:line-clamp-none",
                      k.cover_image_path && "pr-16 md:pr-0",
                    )}
                    title={k.title}
                  >
                    {k.title}
                  </h1>
                  {k.cohort_label && (
                    <p className="text-[12.5px] sm:text-sm text-slate-500 mt-0.5 sm:mt-1">{k.cohort_label}</p>
                  )}
                  {k.schedule_label && (
                    <p className="md:hidden mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-600">
                      <Calendar className="w-3.5 h-3.5 text-hub-accent" aria-hidden="true" />
                      {k.schedule_label}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2 sm:mt-3">
                    {k.subject?.name && (
                      <Badge className="rounded-full bg-hub-tint text-hub-accent hover:bg-hub-tint-strong">
                        <BookOpen className="w-3 h-3 mr-1" /> {k.subject.name}
                      </Badge>
                    )}
                    <Badge variant="outline" className="rounded-full max-w-full bg-white">
                      <User className="w-3 h-3 mr-1 shrink-0" />{" "}
                      <span className="truncate">{tutorText}</span>
                    </Badge>
                    {k.schedule_label && (
                      <Badge variant="outline" className="rounded-full hidden md:inline-flex">
                        <Clock className="w-3 h-3 mr-1" /> {k.schedule_label}
                      </Badge>
                    )}
                    {/* Next-session timestamp is desktop-only — the mobile
                        header keeps title, schedule, subject and tutor. */}
                    {k.scheduled_at && (
                      <Badge variant="secondary" className="rounded-full hidden md:inline-flex">
                        <Calendar className="w-3 h-3 mr-1" /> Next:{" "}
                        {new Date(k.scheduled_at).toLocaleString()}
                      </Badge>
                    )}

                  </div>
                </div>
                {headerRight && <div className="shrink-0">{headerRight}</div>}
              </div>
            </div>
          </header>
        )}

        {/* Class-level navigation — desktop pill row */}
        {k && (
          <div className="hidden md:block overflow-x-auto -mx-1 px-1 scrollbar-thin">
            <div className="bg-white border border-slate-200 rounded-full p-1 shadow-sm inline-flex gap-1 min-w-max">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const isActive = item.key === section;
                const href = resolveHref(item.key, basePath, materialsPath);
                const disabled = item.disabled || !href;
                const content = (
                  <>
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {disabled && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        Soon
                      </span>
                    )}
                  </>
                );
                const baseCls = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors";
                if (disabled) {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      disabled
                      aria-disabled
                      title={item.disabledLabel || "Coming soon"}
                      className={cn(baseCls, "text-slate-400 cursor-not-allowed")}
                    >
                      {content}
                    </button>
                  );
                }
                return (
                  <NavLink
                    key={item.key}
                    to={href!}
                    end={item.key === "home"}
                    className={cn(
                      baseCls,
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-slate-700 hover:bg-slate-100"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {content}
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}

        {/* Class-level navigation — mobile soft-3D launcher (no horizontal scroll) */}
        {k && !mobileImmersive && (
          <nav
            aria-label="Class sections"
            className="md:hidden relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white px-2.5 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
          >
            {/* Decor kept to the extreme corner so it never sits behind a tile label. */}
            <Decor art="orbs" className="right-1.5 top-1.5 w-9 opacity-20" />
            <ul className="relative grid grid-cols-4 gap-x-1 gap-y-2">
              {visibleNav.map((item) => {
                const isActive = item.key === section;
                const href = resolveHref(item.key, basePath, materialsPath);
                const disabled = item.disabled || !href;
                const short = item.shortLabel ?? item.label;
                const inner = (
                  <>
                    <span
                      className={cn(
                        "flex h-[42px] w-[42px] items-center justify-center rounded-2xl transition-colors",
                        isActive
                          ? "bg-hub-tint-strong ring-1 ring-inset ring-hub-accent/25"
                          : disabled
                            ? "bg-slate-50/70"
                            : "bg-slate-50",
                      )}
                    >
                      <Illustration
                        src={item.art}
                        priority={isActive}
                        className={cn(
                          "h-[26px] w-[26px] drop-shadow-[0_3px_6px_rgba(15,23,42,0.12)]",
                          disabled && "opacity-35",
                        )}
                      />
                    </span>
                    <span
                      className={cn(
                        "w-full truncate text-center text-[11px] leading-tight",
                        isActive ? "font-semibold text-hub-accent" : "font-medium text-slate-600",
                        disabled && "font-medium text-slate-400",
                      )}
                    >
                      {short}
                    </span>
                  </>
                );
                const tileCls =
                  "w-full min-h-[72px] flex flex-col items-center justify-center gap-1.5 rounded-2xl px-0.5 transition-transform";
                return (
                  <li key={item.key}>
                    {disabled ? (
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        aria-label={`${item.label} — coming soon`}
                        className={cn(tileCls, "cursor-not-allowed")}
                      >
                        {inner}
                      </button>
                    ) : (
                      <Link
                        to={href!}
                        aria-label={item.label}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          tileCls,
                          "active:scale-[0.96] motion-reduce:active:scale-100",
                          isActive && "bg-hub-tint/60",
                        )}
                      >
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

        )}

        <div>{children}</div>
      </div>
    </div>
  );
}

function resolveHref(key: ClassSection, basePath: string, materialsPath: string): string | null {
  switch (key) {
    case "home":
      return basePath;
    case "announcements":
      return `${basePath}/announcements`;
    case "materials":
      return materialsPath;
    case "students":
      return `${basePath}/students`;
    case "flashcards":
      return `${basePath}/flashcards`;
    case "quizzes":

      return `${basePath}/quizzes`;
    case "about":
      return `${basePath}/about`;
    default:
      return null;
  }
}
