import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Info, Loader2, PencilLine, Plus, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { toSafeMessage } from "@/components/common/TenantGate";
import { ClassShell } from "@/components/class/ClassShell";
import { useClassContext } from "@/hooks/useClassContext";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { ClassCoverManager } from "@/components/class/ClassCoverManager";
import { bestDisplayName, initialsFor } from "@/lib/profile";
import {
  aboutKeys,
  listClassAboutSections,
  reorderClassAboutSections,
  useAboutImageUrl,
  type ClassAboutSection,
} from "@/lib/classAbout";
import {
  ClassAboutSectionDialog,
  DeleteSectionButton,
} from "@/components/class/ClassAboutSectionDialog";

interface Props {
  variant: "student" | "tutor";
}

/**
 * Flexible class About page. Tutors/admins compose any number of ordered
 * information blocks; students see only the blocks that actually exist.
 */
export function ClassAboutPage({ variant }: Props) {
  const { classId } = useParams<{ classId: string }>();
  useAuth();
  const qc = useQueryClient();
  const ctx = useClassContext(classId);

  const basePath = variant === "tutor" ? `/tutor/classes/${classId}` : `/dashboard/classes/${classId}`;
  const materialsPath = variant === "tutor" ? `${basePath}/resources` : `${basePath}/materials`;

  const sectionsQ = useQuery({
    queryKey: aboutKeys.sections(classId),
    enabled: !!classId && !!ctx.data?.canView,
    queryFn: () => listClassAboutSections(classId!),
  });

  const sections = useMemo(() => sectionsQ.data ?? [], [sectionsQ.data]);
  const canManage = variant === "tutor" && !!ctx.data?.canManage;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassAboutSection | null>(null);

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!classId) throw new Error("Class unavailable");
      await reorderClassAboutSections(classId, ids);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aboutKeys.sections(classId) });
    },
    onError: (err) => showSupabaseError(err, "We couldn't reorder these sections."),
  });

  /** Move-up/move-down keeps mobile fully usable without any dragging. */
  function move(index: number, delta: number) {
    const next = [...sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((s) => s.id));
  }

  const shell = (children: React.ReactNode) => (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role={variant}
      section="about"
      basePath={basePath}
      materialsPath={materialsPath}
      mobileTitle="About"
      mobileBackTo={basePath}
      mobileBackLabel={ctx.data?.klass?.title || "Class"}
      breadcrumbs={
        variant === "tutor"
          ? [
              { label: "Tutor", to: "/tutor" },
              { label: "My Classes", to: "/tutor/classes" },
              { label: ctx.data?.klass?.title || "Class", to: basePath },
              { label: "About" },
            ]
          : [
              { label: "Dashboard", to: "/dashboard" },
              { label: "My Classes", to: "/dashboard/classes" },
              { label: ctx.data?.klass?.title || "Class", to: basePath },
              { label: "About" },
            ]
      }
    >
      {children}
    </ClassShell>
  );

  if (ctx.isError) return shell(<Msg title="Couldn't load this class" body={toSafeMessage(ctx.error, "Please try again.")} />);
  if (!ctx.isLoading && (!ctx.data?.klass || !ctx.data.sameTenant)) return shell(<Msg title="Class not found" body="This class isn't available for your organisation." />);
  if (!ctx.isLoading && ctx.data && !ctx.data.canView) return shell(<Msg title="Access restricted" body={variant === "tutor" ? "You aren't assigned to this class." : "You're not enrolled in this class."} />);

  const klass = ctx.data?.klass;

  return shell(
    <div className="space-y-3 md:space-y-5">
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-[13px] md:text-sm text-slate-600">
            <Info className="w-4 h-4 text-primary shrink-0" />
            Add any information your students need — there are no required headings.
          </div>
          <div className="flex flex-wrap gap-2">
            {klass?.center_id && (
              <ClassCoverManager
                classId={klass.id}
                centerId={klass.center_id}
                currentPath={klass.cover_image_path}
                currentVersion={klass.cover_image_updated_at}
              />
            )}
            <Button
              className="rounded-full min-h-[44px]"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" /> Add information
            </Button>
          </div>
        </div>
      )}

      {sectionsQ.isLoading ? (
        <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 p-8 text-sm text-slate-500 text-center">
          Loading…
        </div>
      ) : sections.length > 0 ? (
        <div className="grid gap-3 md:gap-4">
          {sections.map((section, index) => (
            <AboutSectionCard
              key={section.id}
              section={section}
              canManage={canManage}
              isFirst={index === 0}
              isLast={index === sections.length - 1}
              reordering={reorder.isPending}
              onEdit={() => {
                setEditing(section);
                setDialogOpen(true);
              }}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              classId={classId!}
            />
          ))}

          {ctx.data && ctx.data.tutors.length > 0 && (
            <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-4 md:p-6">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-[16px] md:text-base">
                <User className="w-4 h-4 text-primary" /> Your tutor{ctx.data.tutors.length > 1 ? "s" : ""}
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2 md:gap-3">
                {ctx.data.tutors.map((t) => {
                  const name = bestDisplayName(t);
                  return (
                    <li
                      key={t.id}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                        {initialsFor(name)}
                      </div>
                      <span className="line-clamp-2">{name}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-md border border-dashed border-slate-200 rounded-2xl md:rounded-3xl py-12 md:py-14 px-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
            <Info />
          </div>
          <p className="mt-3 font-semibold text-slate-700">No About info yet</p>
          <p className="text-sm text-slate-500">
            {canManage
              ? "Add your first information block to help students prepare."
              : "Check back once your tutor adds class details."}
          </p>
          {canManage && (
            <Button
              className="rounded-full mt-4 min-h-[44px]"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1.5" /> Add information
            </Button>
          )}
        </div>
      )}

      {canManage && klass?.center_id && (
        <ClassAboutSectionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          classId={klass.id}
          centerId={klass.center_id}
          section={editing}
        />
      )}
    </div>,
  );
}

function AboutSectionCard({
  section,
  canManage,
  isFirst,
  isLast,
  reordering,
  onEdit,
  onMoveUp,
  onMoveDown,
  classId,
}: {
  section: ClassAboutSection;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
  reordering: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  classId: string;
}) {
  const image = useAboutImageUrl(section.image_path);

  return (
    <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm p-4 md:p-6">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-slate-900 text-[16px] md:text-lg leading-snug">{section.title}</h3>
        {canManage && (
          <div className="flex items-center shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full min-h-[40px]"
              aria-label={`Move ${section.title} up`}
              disabled={isFirst || reordering}
              onClick={onMoveUp}
            >
              {reordering ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full min-h-[40px]"
              aria-label={`Move ${section.title} down`}
              disabled={isLast || reordering}
              onClick={onMoveDown}
            >
              <ArrowDown className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full min-h-[40px]"
              aria-label={`Edit ${section.title}`}
              onClick={onEdit}
            >
              <PencilLine className="w-4 h-4" />
            </Button>
            <DeleteSectionButton classId={classId} section={section} />
          </div>
        )}
      </div>

      {section.content && (
        <p className="text-[14px] md:text-sm text-slate-700 mt-2 whitespace-pre-wrap leading-relaxed">
          {section.content}
        </p>
      )}

      {section.image_path && image.data && (
        <img
          src={image.data}
          alt={section.title}
          loading="lazy"
          className="mt-3 w-full max-h-72 object-cover rounded-xl md:rounded-2xl border border-slate-200"
        />
      )}
    </section>
  );
}

function Msg({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="text-slate-500 mt-2">{body}</p>
      <Link to="/dashboard/classes" className="text-primary font-semibold mt-4 inline-block">← Back</Link>
    </div>
  );
}

export default ClassAboutPage;
