import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Video, FileText, HelpCircle, PlayCircle, ClipboardList, ExternalLink, Layers, LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toSafeMessage } from "@/components/common/TenantGate";
import { openClassResource } from "@/lib/classResources";
import { ResourcePreviewCard } from "@/components/resources/ResourcePreviewCard";
import { toast } from "sonner";
import { ClassShell } from "@/components/class/ClassShell";
import { useClassContext } from "@/hooks/useClassContext";
import {
  FolderBreadcrumb,
  FolderCard,
  FolderGrid,
  MobileFolderBar,
} from "@/components/class/ContentFolderNav";
import { ClassContentSearch } from "@/components/class/ClassContentSearch";
import {
  type ContentSearchHit,
  type FolderQuiz,
  type FolderResource,
  childFolders,
  fetchStudentContentTree,
  folderPath,
} from "@/lib/contentFolders";

export function StudentClassMaterials() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const navigate = useNavigate();
  const replaysOn = useFeatureEnabled("videoReplays");
  const flashcardsOn = useFeatureEnabled("flashcards");
  const [searchParams, setSearchParams] = useSearchParams();
  const currentFolderId = searchParams.get("folder");
  const [tab, setTab] = useState<string>(replaysOn ? "replays" : "notes");


  const q = useQuery({
    queryKey: ["classroom-materials", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && !!ctx.data?.canView,
    queryFn: () => fetchStudentContentTree(classId!),
  });

  const basePath = `/dashboard/classes/${classId}`;
  const materialsPath = `${basePath}/materials`;

  const folders = q.data?.folders ?? [];
  const visibleFolders = useMemo(
    () => childFolders(folders, currentFolderId ?? null),
    [folders, currentFolderId],
  );
  const breadcrumbPath = useMemo(
    () => folderPath(folders, currentFolderId ?? null),
    [folders, currentFolderId],
  );

  function goToFolder(folderId: string | null) {
    const next = new URLSearchParams(searchParams);
    if (folderId) next.set("folder", folderId);
    else next.delete("folder");
    setSearchParams(next, { replace: false });
  }

  /** Search hits open the folder holding the item, or its own class section. */
  function openSearchHit(hit: ContentSearchHit) {
    if (hit.kind === "quiz") {
      navigate(`${basePath}/quizzes`);
      return;
    }
    if (hit.kind === "flashcard_deck") {
      navigate(`${basePath}/flashcards`);
      return;
    }
    goToFolder(hit.kind === "folder" ? hit.id : hit.folderId);
  }

  const shell = (children: React.ReactNode) => (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role="student"
      section="materials"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={[
        { label: "Dashboard", to: "/dashboard" },
        { label: "My Classes", to: "/dashboard/classes" },
        { label: ctx.data?.klass?.title || "Class", to: basePath },
        { label: "Materials" },
      ]}
      mobileTitle="Materials"
      mobileBackTo={basePath}
      mobileBackLabel={ctx.data?.klass?.title || "Class"}
    >
      {children}
    </ClassShell>
  );

  if (ctx.isError) return shell(<Msg title="Couldn't load this class" body={toSafeMessage(ctx.error, "Please try again.")} />);
  if (!ctx.isLoading && (!ctx.data?.klass || !ctx.data.sameTenant)) return shell(<Msg title="Class not found" body="This class isn't available for your organisation." />);
  if (!ctx.isLoading && ctx.data && !ctx.data.canView) return shell(<Msg title="Access restricted" body="You're not enrolled in this class." />);

  if (q.isLoading || !q.data) {
    return shell(
      <div className="space-y-4">
        <div className="h-10 rounded-full bg-slate-200/70 animate-pulse" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-200/70 animate-pulse" />
          ))}
        </div>
      </div>,
    );
  }
  if (q.isError) {
    return shell(<Msg title="Couldn't load materials" body={toSafeMessage(q.error, "Please try again.")} />);
  }

  const scoped = q.data.resources.filter(
    (r) => (r.folder_id ?? null) === (currentFolderId ?? null),
  );
  const quizzes = q.data.quizzes.filter(
    (quiz) => (quiz.folder_id ?? null) === (currentFolderId ?? null),
  );

  const replays = scoped.filter((r) => r.resource_type === "video" || r.resource_type === "replay");
  const notes = scoped.filter((r) => r.resource_type === "note");
  const worksheets = scoped.filter((r) => r.resource_type === "worksheet");
  const links = scoped.filter((r) => r.resource_type === "link");
  const allResources = scoped;


  return shell(
    <div className="space-y-6">
      <ClassContentSearch
        scope="student"
        classId={classId!}
        tenantId={currentTenantId ?? null}
        userId={user?.id}
        folders={folders}
        rootLabel={ctx.data?.klass?.title || "Class"}
        flashcardsEnabled={flashcardsOn}
        onSelect={openSearchHit}
      />

      <FolderBreadcrumb path={breadcrumbPath} rootLabel="All materials" onNavigate={goToFolder} />
      <MobileFolderBar path={breadcrumbPath} rootLabel="Materials" onNavigate={goToFolder} />

      {visibleFolders.length > 0 && (
        <FolderGrid>
          {visibleFolders.map((f) => (
            <FolderCard
              key={f.id}
              folder={f}
              classId={classId!}
              compact={!!currentFolderId}
              onOpen={() => goToFolder(f.id)}
            />
          ))}
        </FolderGrid>
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        {/* Desktop keeps the horizontal pill filters. */}
        <div className="hidden md:block overflow-x-auto md:-mx-1 md:px-1 scrollbar-thin">
          {/* Materials browsing is scoped to files: All / Replays / Notes /
              Worksheets. Links, quizzes and flashcards keep their own dedicated
              Class Hub sections. */}
          <TabsList className="bg-white border border-slate-200 rounded-full p-1 h-auto shadow-sm flex-nowrap w-max">
            <Tab value="all" icon={<LayoutGrid className="w-4 h-4 mr-1.5" />} label={`All (${allResources.length})`} />
            {replaysOn && (
              <Tab value="replays" icon={<Video className="w-4 h-4 mr-1.5" />} label={`Replays (${replays.length})`} />
            )}
            <Tab value="notes" icon={<FileText className="w-4 h-4 mr-1.5" />} label={`Notes (${notes.length})`} />
            <Tab value="worksheets" icon={<ClipboardList className="w-4 h-4 mr-1.5" />} label={`Worksheets (${worksheets.length})`} />
          </TabsList>
        </div>

        {/* Mobile: compact non-scrolling icon grid. */}
        <MobileFilterGrid
          value={tab}
          onChange={setTab}
          items={[
            { value: "all", label: "All", full: "All materials", icon: <LayoutGrid className="w-4 h-4" />, count: allResources.length },
            ...(replaysOn
              ? [{ value: "replays", label: "Replays", full: "Replays", icon: <Video className="w-4 h-4" />, count: replays.length }]
              : []),
            { value: "notes", label: "Notes", full: "Notes", icon: <FileText className="w-4 h-4" />, count: notes.length },
            { value: "worksheets", label: "Work", full: "Worksheets", icon: <ClipboardList className="w-4 h-4" />, count: worksheets.length },
          ]}
        />

        <TabsContent value="all" className="mt-5">
          {allResources.length === 0 ? (
            <Empty icon={<Layers />} label="No materials here" />
          ) : (
            <Grid items={allResources} />
          )}
        </TabsContent>
        {replaysOn && (
          <TabsContent value="replays" className="mt-5">
            {replays.length === 0 ? <Empty icon={<Video />} label="No replays here" /> : <Grid items={replays} />}
          </TabsContent>
        )}

        <TabsContent value="notes" className="mt-5">
          {notes.length === 0 ? <Empty icon={<FileText />} label="No notes here" /> : <Grid items={notes} />}
        </TabsContent>
        <TabsContent value="worksheets" className="mt-5">
          {worksheets.length === 0 ? <Empty icon={<ClipboardList />} label="No worksheets here" /> : <Grid items={worksheets} />}
        </TabsContent>
        <TabsContent value="quizzes" className="mt-5">
          {quizzes.length === 0 ? (
            <Empty icon={<HelpCircle />} label="No quizzes here" />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3">
              {quizzes.map((quiz: FolderQuiz) => (
                <Link
                  key={quiz.id}
                  to={`/dashboard/classes/${classId}/quizzes`}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md p-3 md:p-4 flex flex-col gap-2 min-h-[112px]"
                >
                  <span className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <PlayCircle className="w-5 h-5 text-primary" aria-hidden="true" />
                  </span>
                  <h4 className="text-[14px] font-semibold text-slate-900 line-clamp-2 leading-snug">
                    {quiz.title}
                  </h4>
                  <span className="mt-auto text-[12px] font-semibold text-primary">Open quiz</span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
        {links.length > 0 && (
          <TabsContent value="links" className="mt-5"><Grid items={links} /></TabsContent>
        )}
        {flashcardsOn && (
          <TabsContent value="flashcards" className="mt-5">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center">
                <Layers className="w-6 h-6 text-primary" />
              </div>
              <p className="mt-3 font-semibold text-slate-800">Study with flashcards</p>
              <p className="text-sm text-slate-500 mt-1">
                Published decks for this class live in the flashcard library.
              </p>
              <Button asChild className="rounded-full mt-5 min-h-[44px]">
                <Link to={`${basePath}/flashcards`}>Open flashcards</Link>
              </Button>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>,
  );
}

function Tab({ value, icon, label }: { value: string; icon: React.ReactNode; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-full px-3 py-2 min-h-[40px] text-[13px] md:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
    >
      {icon} {label}
    </TabsTrigger>
  );
}

interface FilterItem {
  value: string;
  /** Short mobile label. */
  label: string;
  /** Full accessible name. */
  full: string;
  icon: React.ReactNode;
  count?: number;
}

/**
 * Mobile-only filter control: a compact non-scrolling icon grid so the material
 * filters never overflow horizontally on narrow phones.
 */
function MobileFilterGrid({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (next: string) => void;
  items: FilterItem[];
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter materials"
      className="md:hidden grid grid-cols-4 gap-1 bg-white border border-slate-200 rounded-2xl p-2 shadow-sm"
    >
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={item.full}
            onClick={() => onChange(item.value)}
            className="flex flex-col items-center justify-start gap-1 min-h-[44px] py-1 rounded-xl active:bg-slate-50"
          >
            <span
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center border transition-colors",
                active
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-slate-50 text-slate-500 border-slate-200",
              )}
            >
              {item.icon}
            </span>
            <span className={cn("text-[11px] leading-tight", active ? "font-semibold text-slate-900" : "text-slate-500")}>
              {item.label}
              {typeof item.count === "number" && item.count > 0 ? ` (${item.count})` : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Grid({ items }: { items: FolderResource[] }) {
  const open = async (r: FolderResource) => {
    const ok = await openClassResource(r);
    if (!ok) toast.error("This file isn't available right now.");
  };
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.map((r) => (
        <ResourcePreviewCard
          key={r.id}
          resource={r}
          role="student"
          compact
          onOpen={() => void open(r)}
        />
      ))}
    </div>
  );
}

function Empty({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-white/80 backdrop-blur-md border border-dashed border-slate-200 rounded-2xl md:rounded-3xl py-10 md:py-14 px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">{icon}</div>
      <p className="mt-3 font-semibold text-slate-700">{label}</p>
      <p className="text-sm text-slate-500">Check back once your tutor publishes new material.</p>
    </div>
  );
}

function Msg({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="text-slate-500 mt-2">{body}</p>
    </div>
  );
}

export default StudentClassMaterials;
