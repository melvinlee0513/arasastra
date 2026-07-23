import { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  Home, ChevronRight, BookOpen, User, Clock, Calendar,
  LayoutGrid, Megaphone, FileText, MessageCircle, HelpCircle, Info, Users, ImagePlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClassContextData } from "@/hooks/useClassContext";
import { cn } from "@/lib/utils";
import { ClassCover } from "@/components/class/ClassCover";
import { ClassCoverManager } from "@/components/class/ClassCoverManager";
import { tutorLabel } from "@/lib/classCovers";

export type ClassSection =
  | "home"
  | "announcements"
  | "materials"
  | "students"
  | "discussions"
  | "quizzes"
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
  children: ReactNode;
}

type NavEntry = {
  key: ClassSection;
  label: string;
  icon: typeof Home;
  disabled?: boolean;
  disabledLabel?: string;
  managerOnly?: boolean; // tutor + admin only
};

const NAV: NavEntry[] = [
  { key: "home", label: "Home", icon: LayoutGrid },
  { key: "announcements", label: "Announcements", icon: Megaphone },
  { key: "materials", label: "Materials", icon: FileText },
  { key: "students", label: "Students", icon: Users, managerOnly: true },
  { key: "discussions", label: "Discussions", icon: MessageCircle, disabled: true, disabledLabel: "Coming soon" },
  { key: "quizzes", label: "Quizzes", icon: HelpCircle },
  { key: "about", label: "About", icon: Info },
];

export function ClassShell({
  data, isLoading, role, section, basePath, materialsPath, breadcrumbs, headerRight, children,
}: ClassShellProps) {
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-5 md:p-8 space-y-6">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-12 rounded-full w-full max-w-2xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  const k = data?.klass;
  const tutorText = tutorLabel(data?.tutors);
  const canManageCover = !!data?.canManage && !!k?.center_id;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
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
          <header className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
            {/* Compact banner: 16:9 on mobile, banner-height on tablet/desktop. */}
            <ClassCover
              classId={k.id}
              coverPath={k.cover_image_path}
              version={k.cover_image_updated_at}
              priority
              sizeClassName="h-40 sm:h-44 md:h-52 lg:h-60"
              overlay={
                <>
                  {/* Subtle gradient for legibility of any overlay text/actions */}
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
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
                            className="inline-flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-white/60 text-slate-800 hover:bg-white shadow-sm px-3 py-1.5 text-xs font-medium"
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
            <div className="p-4 sm:p-6">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 break-words">{k.title}</h1>
                  {k.cohort_label && <p className="text-sm text-slate-500 mt-1">{k.cohort_label}</p>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {k.subject?.name && (
                      <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/15">
                        <BookOpen className="w-3 h-3 mr-1" /> {k.subject.name}
                      </Badge>
                    )}
                    <Badge variant="outline" className="rounded-full">
                      <User className="w-3 h-3 mr-1" /> {tutorText}
                    </Badge>
                    {k.schedule_label && (
                      <Badge variant="outline" className="rounded-full">
                        <Clock className="w-3 h-3 mr-1" /> {k.schedule_label}
                      </Badge>
                    )}
                    {k.scheduled_at && (
                      <Badge variant="secondary" className="rounded-full">
                        <Calendar className="w-3 h-3 mr-1" /> Next: {new Date(k.scheduled_at).toLocaleString()}
                      </Badge>
                    )}
                  </div>
                </div>
                {headerRight && <div className="shrink-0">{headerRight}</div>}
              </div>
            </div>
          </header>
        )}

        {/* Class-level navigation */}
        {k && (
          <div className="overflow-x-auto -mx-1 px-1 scrollbar-thin">
            <div className="bg-white border border-slate-200 rounded-full p-1 shadow-sm inline-flex gap-1 min-w-max">
              {NAV.filter((item) => !(item.managerOnly && role === "student")).map((item) => {
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
    case "quizzes":
      return `${basePath}/quizzes`;
    case "about":
      return `${basePath}/about`;
    default:
      return null;
  }
}
