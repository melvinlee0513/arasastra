import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Save, PencilLine, Loader2, X, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { toSafeMessage } from "@/components/common/TenantGate";
import { ClassShell } from "@/components/class/ClassShell";
import { useClassContext } from "@/hooks/useClassContext";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { ClassCoverManager } from "@/components/class/ClassCoverManager";
import { bestDisplayName } from "@/lib/profile";
import { initialsFor } from "@/lib/profile";

type AboutRow = {
  id?: string;
  overview: string | null;
  learning_objectives: string | null;
  preparation_requirements: string | null;
  class_expectations: string | null;
  contact_guidance: string | null;
  venue_or_meeting_info: string | null;
};

const FIELDS: { key: keyof AboutRow; label: string; placeholder: string }[] = [
  { key: "overview", label: "Overview", placeholder: "What is this class about?" },
  { key: "learning_objectives", label: "Learning objectives", placeholder: "What will students learn?" },
  { key: "preparation_requirements", label: "Preparation requirements", placeholder: "What should students bring or prepare?" },
  { key: "class_expectations", label: "Class expectations", placeholder: "Attendance, behaviour, participation…" },
  { key: "contact_guidance", label: "Contact & questions", placeholder: "How can students reach the tutor?" },
  { key: "venue_or_meeting_info", label: "Venue / meeting info", placeholder: "Room, address or meeting link" },
];

interface Props {
  variant: "student" | "tutor";
}

export function ClassAboutPage({ variant }: Props) {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const ctx = useClassContext(classId);

  const basePath = variant === "tutor" ? `/tutor/classes/${classId}` : `/dashboard/classes/${classId}`;
  const materialsPath = variant === "tutor" ? `${basePath}/resources` : `${basePath}/materials`;

  const aboutQ = useQuery({
    queryKey: ["class-about", classId],
    enabled: !!classId && !!ctx.data?.canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_about")
        .select("id,overview,learning_objectives,preparation_requirements,class_expectations,contact_guidance,venue_or_meeting_info")
        .eq("class_id", classId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AboutRow | null;
    },
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AboutRow>(() => emptyAbout());

  useEffect(() => {
    if (aboutQ.data) setDraft(aboutQ.data);
    else setDraft(emptyAbout());
  }, [aboutQ.data]);

  const isDirty = useMemo(() => {
    const base = aboutQ.data || emptyAbout();
    return FIELDS.some((f) => (draft[f.key] || "") !== (base[f.key] || ""));
  }, [draft, aboutQ.data]);

  useEffect(() => {
    if (!editing || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editing, isDirty]);

  const canManage = variant === "tutor" && !!ctx.data?.canManage;

  const save = useMutation({
    mutationFn: async () => {
      if (!ctx.data?.klass) throw new Error("Class unavailable");
      const payload = {
        class_id: ctx.data.klass.id,
        center_id: ctx.data.klass.center_id!,
        updated_by: user?.id ?? null,
        overview: nullish(draft.overview),
        learning_objectives: nullish(draft.learning_objectives),
        preparation_requirements: nullish(draft.preparation_requirements),
        class_expectations: nullish(draft.class_expectations),
        contact_guidance: nullish(draft.contact_guidance),
        venue_or_meeting_info: nullish(draft.venue_or_meeting_info),
      };
      const { data, error } = await supabase
        .from("class_about")
        .upsert(payload, { onConflict: "class_id" })
        .select("id,overview,learning_objectives,preparation_requirements,class_expectations,contact_guidance,venue_or_meeting_info")
        .maybeSingle();
      if (error) throw error;
      return data as AboutRow | null;
    },
    onSuccess: (data) => {
      qc.setQueryData(["class-about", classId], data);
      toast.success("About page updated");
      setEditing(false);
    },
    onError: (err) => showSupabaseError(err, "We couldn't save these changes."),
  });

  const shell = (children: React.ReactNode) => (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role={variant}
      section="about"
      basePath={basePath}
      materialsPath={materialsPath}
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

  const nonEmpty = FIELDS.some((f) => (aboutQ.data?.[f.key] || "").trim());

  return shell(
    <div className="space-y-5">
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Info className="w-4 h-4 text-primary" />
            {editing ? "Editing About — changes are visible to enrolled students once saved." : "Only assigned tutors and centre admins can edit About."}
          </div>
          <div className="flex flex-wrap gap-2">
            {ctx.data?.klass && ctx.data.klass.center_id && !editing && (
              <ClassCoverManager
                classId={ctx.data.klass.id}
                centerId={ctx.data.klass.center_id}
                currentPath={ctx.data.klass.cover_image_path}
                currentVersion={ctx.data.klass.cover_image_updated_at}
              />
            )}
            {editing ? (
              <>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    if (isDirty && !confirm("Discard unsaved changes?")) return;
                    setDraft(aboutQ.data || emptyAbout());
                    setEditing(false);
                  }}
                >
                  <X className="w-4 h-4 mr-1.5" /> Cancel
                </Button>
                <Button
                  className="rounded-full"
                  disabled={!isDirty || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  Save changes
                </Button>
              </>
            ) : (
              <Button className="rounded-full" onClick={() => setEditing(true)}>
                <PencilLine className="w-4 h-4 mr-1.5" /> Edit About
              </Button>
            )}
          </div>
        </div>
      )}


      {aboutQ.isLoading ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-sm text-slate-500 text-center">Loading…</div>
      ) : editing && canManage ? (
        <div className="grid gap-4">
          {FIELDS.map((f) => (
            <div key={f.key} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <Label htmlFor={f.key} className="font-semibold text-slate-900">{f.label}</Label>
              <Textarea
                id={f.key}
                className="mt-2 rounded-2xl min-h-[100px]"
                placeholder={f.placeholder}
                value={draft[f.key] || ""}
                maxLength={4000}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      ) : nonEmpty ? (
        <div className="grid gap-4">
          {FIELDS.map((f) => {
            const value = aboutQ.data?.[f.key];
            if (!value?.trim()) return null;
            return (
              <section key={f.key} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
                <h3 className="font-semibold text-slate-900">{f.label}</h3>
                <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap leading-relaxed">{value}</p>
              </section>
            );
          })}
          {ctx.data && ctx.data.tutors.length > 0 && (
            <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Your tutor{ctx.data.tutors.length > 1 ? "s" : ""}</h3>
              <ul className="mt-3 flex flex-wrap gap-3">
                {ctx.data.tutors.map((t) => {
                  const name = bestDisplayName(t);
                  return (
                    <li key={t.id} className="inline-flex items-center gap-2 rounded-full bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm text-slate-700">
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
        <div className="bg-white/80 backdrop-blur-md border border-dashed border-slate-200 rounded-3xl py-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
            <Info />
          </div>
          <p className="mt-3 font-semibold text-slate-700">No About info yet</p>
          <p className="text-sm text-slate-500">
            {canManage ? "Add class overview and expectations to help students prepare." : "Check back once your tutor adds class details."}
          </p>
          {canManage && (
            <Button className="rounded-full mt-4" onClick={() => setEditing(true)}>
              <PencilLine className="w-4 h-4 mr-1.5" /> Add About
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function emptyAbout(): AboutRow {
  return {
    overview: "", learning_objectives: "", preparation_requirements: "",
    class_expectations: "", contact_guidance: "", venue_or_meeting_info: "",
  };
}
function nullish(v: string | null | undefined): string | null {
  const t = (v || "").trim();
  return t.length ? t : null;
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
