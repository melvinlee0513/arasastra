import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Video, FileText, HelpCircle, PlayCircle, ClipboardList, ExternalLink, Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toSafeMessage } from "@/components/common/TenantGate";
import { hasValidSource, openClassResource } from "@/lib/classResources";
import { ResourcePreviewCard } from "@/components/resources/ResourcePreviewCard";
import { toast } from "sonner";
import { ClassShell } from "@/components/class/ClassShell";
import { useClassContext } from "@/hooks/useClassContext";

type ResourceRow = {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  source_type: string;
  file_url: string | null;
  file_path: string | null;
  external_url: string | null;
  embed_url: string | null;
  thumbnail_path: string | null;
  published_at: string | null;
};
type QuizRow = { id: string; title: string; description: string | null; total_points: number };

export function StudentClassMaterials() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const replaysOn = useFeatureEnabled("videoReplays");
  const flashcardsOn = useFeatureEnabled("flashcards");

  const q = useQuery({
    queryKey: ["classroom-materials", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && !!ctx.data?.canView,
    queryFn: async () => {
      const [{ data: resources }, { data: quizzes }] = await Promise.all([
        supabase
          .from("class_resources")
          .select("id,title,description,resource_type,source_type,file_url,file_path,external_url,embed_url,thumbnail_path,published_at")
          .eq("class_id", classId!)
          .eq("status", "published")
          .order("display_order", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true }),
        supabase
          .from("quizzes")
          .select("id,title,description,total_points")
          .eq("class_id", classId!)
          .eq("status", "published")
          .order("published_at", { ascending: false }),
      ]);
      return {
        resources: (resources || []).filter(hasValidSource) as ResourceRow[],
        quizzes: (quizzes || []) as QuizRow[],
      };
    },
  });

  const basePath = `/dashboard/classes/${classId}`;
  const materialsPath = `${basePath}/materials`;

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
    >
      {children}
    </ClassShell>
  );

  if (ctx.isError) return shell(<Msg title="Couldn't load this class" body={toSafeMessage(ctx.error, "Please try again.")} />);
  if (!ctx.isLoading && (!ctx.data?.klass || !ctx.data.sameTenant)) return shell(<Msg title="Class not found" body="This class isn't available for your organisation." />);
  if (!ctx.isLoading && ctx.data && !ctx.data.canView) return shell(<Msg title="Access restricted" body="You're not enrolled in this class." />);

  if (q.isLoading || !q.data) {
    return shell(<div className="text-sm text-slate-500 text-center py-10">Loading materials…</div>);
  }

  const replays = q.data.resources.filter((r) => r.resource_type === "video" || r.resource_type === "replay");
  const notes = q.data.resources.filter((r) => r.resource_type === "note");
  const worksheets = q.data.resources.filter((r) => r.resource_type === "worksheet");
  const links = q.data.resources.filter((r) => r.resource_type === "link");

  return shell(
    <Tabs defaultValue={replaysOn ? "replays" : "notes"} className="w-full">
      <div className="overflow-x-auto -mx-1 px-1">
        <TabsList className="bg-white border border-slate-200 rounded-full p-1 h-auto shadow-sm flex-nowrap w-max">
          {replaysOn && (
            <Tab value="replays" icon={<Video className="w-4 h-4 mr-1.5" />} label={`Replays (${replays.length})`} />
          )}
          <Tab value="notes" icon={<FileText className="w-4 h-4 mr-1.5" />} label={`Notes (${notes.length})`} />
          <Tab value="worksheets" icon={<ClipboardList className="w-4 h-4 mr-1.5" />} label={`Worksheets (${worksheets.length})`} />
          <Tab value="quizzes" icon={<HelpCircle className="w-4 h-4 mr-1.5" />} label={`Quizzes (${q.data.quizzes.length})`} />
          {links.length > 0 && (
            <Tab value="links" icon={<ExternalLink className="w-4 h-4 mr-1.5" />} label={`Links (${links.length})`} />
          )}
          {flashcardsOn && (
            <Tab value="flashcards" icon={<Layers className="w-4 h-4 mr-1.5" />} label="Flashcards" />
          )}
        </TabsList>
      </div>

      {replaysOn && (
        <TabsContent value="replays" className="mt-5">
          {replays.length === 0 ? <Empty icon={<Video />} label="No replays yet" /> : <Grid items={replays} />}
        </TabsContent>
      )}
      <TabsContent value="notes" className="mt-5">
        {notes.length === 0 ? <Empty icon={<FileText />} label="No notes yet" /> : <Grid items={notes} />}
      </TabsContent>
      <TabsContent value="worksheets" className="mt-5">
        {worksheets.length === 0 ? <Empty icon={<ClipboardList />} label="No worksheets yet" /> : <Grid items={worksheets} />}
      </TabsContent>
      <TabsContent value="quizzes" className="mt-5">
        {q.data.quizzes.length === 0 ? (
          <Empty icon={<HelpCircle />} label="No quizzes yet" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {q.data.quizzes.map((quiz) => (
              <Link
                key={quiz.id}
                to={`/quiz/${quiz.id}/lobby`}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md p-5 flex items-center gap-4 group"
              >
                <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <PlayCircle className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900 truncate">{quiz.title}</h4>
                  {quiz.description && <p className="text-xs text-slate-500 line-clamp-1">{quiz.description}</p>}
                </div>
                <Button size="sm" className="rounded-full">Start</Button>
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
          <Empty icon={<Layers />} label="Flashcard decks coming soon" />
        </TabsContent>
      )}
    </Tabs>
  );
}

function Tab({ value, icon, label }: { value: string; icon: React.ReactNode; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="rounded-full px-3.5 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
    >
      {icon} {label}
    </TabsTrigger>
  );
}

function Grid({ items }: { items: ResourceRow[] }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
      {items.map((r) => (
        <ResourcePreviewCard
          key={r.id}
          resource={r}
          role="student"
          actions={
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full h-9 px-3 text-primary min-h-[44px] sm:min-h-0"
              onClick={async () => {
                const ok = await openClassResource(r);
                if (!ok) toast.error("This file isn't available right now.");
              }}
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open
            </Button>
          }
        />
      ))}
    </div>
  );
}

function Empty({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-white/80 backdrop-blur-md border border-dashed border-slate-200 rounded-3xl py-14 text-center">
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
