import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { showSupabaseError } from "@/lib/supabaseErrors";

import {
  BookOpen,
  GraduationCap,
  Plus,
  Users,
  ChevronRight,
  UserCog,
  MoreHorizontal,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUBJECT_OPTIONS, subjectLabel } from "@/lib/subjectConfig";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Subject = {
  id: string;
  name: string;
  description: string | null;
  subject_key: string | null;
};
type Class = {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  tutor_id: string | null;
  scheduled_at: string;
  cohort_label: string | null;
};
type Tutor = { id: string; name: string; user_id: string | null };
type StudentProfile = { id: string; full_name: string; email: string | null };
type EnrollmentCount = Record<string, number>;

const ELECTRIC_BLUE = "#0052FF";

export default function CurriculumManager() {
  const { currentTenantId } = useTenant();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [enrollmentCounts, setEnrollmentCounts] = useState<EnrollmentCount>({});
  const [classTutorsByClassId, setClassTutorsByClassId] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [assignTutorsOpen, setAssignTutorsOpen] = useState(false);
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [editClass, setEditClass] = useState<Class | null>(null);
  const [deleteSubject, setDeleteSubject] = useState<Subject | null>(null);
  const [deleteClass, setDeleteClass] = useState<Class | null>(null);

  useEffect(() => {
    if (!currentTenantId) return;
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenantId]);

  useEffect(() => {
    if (!selectedSubjectId || !currentTenantId) {
      setClasses([]);
      return;
    }
    void loadClasses(selectedSubjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubjectId, currentTenantId]);

  async function loadAll() {
    if (!currentTenantId) return;
    setLoading(true);
    const [subsRes, tutorsRes] = await Promise.all([
      supabase
        .from("subjects")
        .select("id, name, description, subject_key")
        .eq("center_id", currentTenantId)
        .neq("status", "archived")
        .order("name"),
      // Canonical assignable-tutor list via SECURITY DEFINER RPC. Avoids
      // depending on a PostgREST embed between user_roles and profiles
      // (no FK exists between them), which previously returned zero rows
      // and made the Assign-tutors modal say "No tutors in this centre".
      supabase.rpc("list_assignable_tutors", {
        requested_center_id: currentTenantId,
      }),
    ]);

    setSubjects((subsRes.data ?? []) as Subject[]);

    if (tutorsRes.error) {
      showSupabaseError(tutorsRes.error, "Failed to load tutors");
      setTutors([]);
    } else {
      const rows = (tutorsRes.data ?? []) as Array<{
        user_id: string;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      }>;
      setTutors(
        rows.map((r) => ({
          id: r.user_id,
          name: r.full_name || r.email || "Tutor",
          user_id: r.user_id,
        })),
      );
    }

    if (subsRes.data && subsRes.data.length && !selectedSubjectId) {
      setSelectedSubjectId(subsRes.data[0].id);
    }
    setLoading(false);
  }



  async function loadClasses(subjectId: string) {
    if (!currentTenantId) return;
    const { data } = await supabase
      .from("classes")
      .select("id, title, description, subject_id, tutor_id, scheduled_at, cohort_label")
      .eq("center_id", currentTenantId)
      .eq("subject_id", subjectId)
      .neq("status", "archived")
      .order("scheduled_at", { ascending: false });
    const list = (data ?? []) as Class[];
    setClasses(list);

    // Enrollment counts + canonical class_tutors assignments (per-tenant).
    const ids = list.map((c) => c.id);
    if (ids.length) {
      const [enrRes, ctRes] = await Promise.all([
        supabase
          .from("class_enrollments")
          .select("class_id")
          .in("class_id", ids)
          .eq("status", "active"),
        supabase
          .from("class_tutors")
          .select("class_id, tutor_user_id")
          .eq("center_id", currentTenantId)
          .in("class_id", ids),
      ]);
      const counts: EnrollmentCount = {};
      (enrRes.data ?? []).forEach((e: any) => {
        counts[e.class_id] = (counts[e.class_id] ?? 0) + 1;
      });
      setEnrollmentCounts(counts);

      const byClass: Record<string, string[]> = {};
      (ctRes.data ?? []).forEach((r: any) => {
        (byClass[r.class_id] ||= []).push(r.tutor_user_id);
      });
      setClassTutorsByClassId(byClass);
    } else {
      setEnrollmentCounts({});
      setClassTutorsByClassId({});
    }
  }

  const selectedSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) ?? null,
    [subjects, selectedSubjectId],
  );
  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  if (!currentTenantId) {
    return (
      <div className="p-8 text-slate-500">Select a tuition center to manage curriculum.</div>
    );
  }

  return (
    <div className="p-6 md:p-10 space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Curriculum</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage subjects, spawn cohorts, and enroll students.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Subjects panel */}
        <section className="bg-white/50 backdrop-blur border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 flex items-center justify-between border-b border-slate-200/70">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-800">Subjects</h2>
            </div>
            <Button
              size="sm"
              onClick={() => setSubjectModalOpen(true)}
              className="rounded-full h-8 px-3 text-white shadow-sm hover:opacity-90"
              style={{ backgroundColor: ELECTRIC_BLUE }}
            >
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </div>
          <div className="p-3 max-h-[65vh] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-sm text-slate-400">Loading…</div>
            ) : subjects.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">
                No subjects yet. Create your first one.
              </div>
            ) : (
              <ul className="space-y-1">
                {subjects.map((s) => {
                  const active = s.id === selectedSubjectId;
                  return (
                    <li key={s.id}>
                      <div
                        className={cn(
                          "flex items-center gap-1 rounded-xl transition-all",
                          active ? "shadow-sm" : "hover:bg-slate-100/70",
                        )}
                        style={active ? { backgroundColor: ELECTRIC_BLUE } : undefined}
                      >
                        <button
                          onClick={() => {
                            setSelectedSubjectId(s.id);
                            setSelectedClassId(null);
                          }}
                          className={cn(
                            "min-w-0 flex-1 flex items-center justify-between gap-3 px-3 py-2.5 text-left",
                            active ? "text-white" : "text-slate-700",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {subjectLabel(s.subject_key, s.name)}
                            </div>
                            {s.description && (
                              <div
                                className={cn(
                                  "text-xs truncate",
                                  active ? "text-white/80" : "text-slate-500",
                                )}
                              >
                                {s.description}
                              </div>
                            )}
                          </div>
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 shrink-0",
                              active ? "text-white" : "text-slate-400",
                            )}
                          />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Actions for ${subjectLabel(s.subject_key, s.name)}`}
                              className={cn(
                                "mr-2 rounded-full p-1.5 transition-colors",
                                active
                                  ? "text-white/80 hover:bg-white/20 hover:text-white"
                                  : "text-slate-400 hover:bg-slate-200/70 hover:text-slate-700",
                              )}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem onSelect={() => setEditSubject(s)}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit subject
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleteSubject(s)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete subject
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Classes panel */}
        <section className="bg-white/50 backdrop-blur border border-slate-200 rounded-2xl overflow-hidden min-h-[60vh]">
          <div className="p-4 flex items-center justify-between border-b border-slate-200/70">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-slate-600" />
              <h2 className="text-sm font-semibold text-slate-800">
                {selectedSubject
                  ? `Classes · ${subjectLabel(selectedSubject.subject_key, selectedSubject.name)}`
                  : "Classes"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {selectedClass && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAssignTutorsOpen(true)}
                    className="rounded-full h-8 px-3"
                  >
                    <UserCog className="h-4 w-4 mr-1" /> Assign tutors
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEnrollModalOpen(true)}
                    className="rounded-full h-8 px-3"
                  >
                    <Users className="h-4 w-4 mr-1" /> Enroll students
                  </Button>
                </>
              )}
              <Button
                size="sm"
                disabled={!selectedSubject}
                onClick={() => setClassModalOpen(true)}
                className="rounded-full h-8 px-3 text-white shadow-sm hover:opacity-90 disabled:opacity-40"
                style={{ backgroundColor: ELECTRIC_BLUE }}
              >
                <Plus className="h-4 w-4 mr-1" /> Spawn class
              </Button>
            </div>
          </div>

          <div className="p-4">
            {!selectedSubject ? (
              <div className="p-10 text-center text-sm text-slate-400">
                Select a subject to see its classes.
              </div>
            ) : classes.length === 0 ? (
              <div className="p-10 flex flex-col items-center gap-2 text-center">
                <GraduationCap className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No classes yet</p>
                <p className="text-sm text-slate-500">
                  Create your first class under{" "}
                  {subjectLabel(selectedSubject.subject_key, selectedSubject.name)}.
                </p>
                <Button
                  size="sm"
                  onClick={() => setClassModalOpen(true)}
                  className="mt-2 rounded-full h-8 px-4 text-white shadow-sm hover:opacity-90"
                  style={{ backgroundColor: ELECTRIC_BLUE }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Spawn class
                </Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {classes.map((c) => {
                  const active = c.id === selectedClassId;
                  const assignedUserIds = classTutorsByClassId[c.id] ?? [];
                  const assignedNames = assignedUserIds
                    .map((uid) => tutors.find((t) => t.user_id === uid)?.name || "Tutor")
                    .filter(Boolean);
                  const tutorLabel =
                    assignedNames.length === 0
                      ? "Unassigned tutor"
                      : assignedNames.length <= 2
                        ? assignedNames.join(", ")
                        : `${assignedNames.length} tutors assigned`;
                  return (
                    <li key={c.id} className="relative">
                      <button
                        onClick={() => setSelectedClassId(c.id)}
                        className={cn(
                          "w-full flex items-center justify-between gap-4 p-4 pr-14 rounded-xl border text-left transition-all",
                          active
                            ? "border-transparent shadow-md ring-2"
                            : "border-slate-200 hover:border-slate-300 bg-white/60",
                        )}
                        style={
                          active
                            ? { boxShadow: `0 0 0 2px ${ELECTRIC_BLUE}` }
                            : undefined
                        }
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {c.title}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 truncate">
                            {tutorLabel} · {c.cohort_label ?? "Cohort"}
                          </div>
                        </div>
                        <Badge
                          className="rounded-full px-3 py-1 text-xs font-medium border-0"
                          style={{
                            backgroundColor: `${ELECTRIC_BLUE}15`,
                            color: ELECTRIC_BLUE,
                          }}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          {enrollmentCounts[c.id] ?? 0} enrolled
                        </Badge>
                      </button>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Actions for ${c.title}`}
                              className="h-8 w-8 rounded-full text-slate-500 hover:text-slate-900"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem onSelect={() => setEditClass(c)}>
                              Edit class
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setSelectedClassId(c.id);
                                setAssignTutorsOpen(true);
                              }}
                            >
                              Assign tutors
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setSelectedClassId(c.id);
                                setEnrollModalOpen(true);
                              }}
                            >
                              Enroll students
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleteClass(c)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete class
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Modals */}
      {deleteSubject && (
        <DeleteSubjectDialog
          subject={deleteSubject}
          onClose={() => setDeleteSubject(null)}
          onDeleted={(deletedId) => {
            setDeleteSubject(null);
            if (selectedSubjectId === deletedId) setSelectedSubjectId(null);
            void loadAll();
          }}
        />
      )}
      {deleteClass && (
        <DeleteClassDialog
          klass={deleteClass}
          onClose={() => setDeleteClass(null)}
          onDeleted={(deletedId) => {
            setDeleteClass(null);
            if (selectedClassId === deletedId) setSelectedClassId(null);
            if (selectedSubjectId) void loadClasses(selectedSubjectId);
          }}
        />
      )}
      {editSubject && (
        <EditSubjectModal
          subject={editSubject}
          centerId={currentTenantId}
          onClose={() => setEditSubject(null)}
          onSaved={() => {
            setEditSubject(null);
            void loadAll();
          }}
        />
      )}
      {editClass && (
        <EditClassModal
          klass={editClass}
          centerId={currentTenantId}
          onClose={() => setEditClass(null)}
          onSaved={() => {
            setEditClass(null);
            if (selectedSubjectId) void loadClasses(selectedSubjectId);
          }}
        />
      )}
      <SubjectModal
        open={subjectModalOpen}
        onOpenChange={setSubjectModalOpen}
        centerId={currentTenantId}
        existingKeys={subjects
          .map((s) => s.subject_key)
          .filter((k): k is string => Boolean(k))}
        onCreated={() => {
          setSubjectModalOpen(false);
          void loadAll();
        }}
      />
      <ClassModal
        open={classModalOpen}
        onOpenChange={setClassModalOpen}
        centerId={currentTenantId}
        subject={selectedSubject}
        tutors={tutors}
        onCreated={() => {
          setClassModalOpen(false);
          if (selectedSubjectId) void loadClasses(selectedSubjectId);
        }}
      />
      {selectedClass && (
        <EnrollModal
          open={enrollModalOpen}
          onOpenChange={setEnrollModalOpen}
          centerId={currentTenantId}
          classId={selectedClass.id}
          onDone={() => {
            setEnrollModalOpen(false);
            if (selectedSubjectId) void loadClasses(selectedSubjectId);
          }}
        />
      )}
      {selectedClass && (
        <AssignTutorsModal
          open={assignTutorsOpen}
          onOpenChange={setAssignTutorsOpen}
          centerId={currentTenantId}
          classId={selectedClass.id}
          tutors={tutors}
          onDone={() => {
            setAssignTutorsOpen(false);
            if (selectedSubjectId) void loadClasses(selectedSubjectId);
          }}
        />
      )}
    </div>
  );
}

/* ─── Subject Modal ─── */
function SubjectModal({
  open,
  onOpenChange,
  centerId,
  existingKeys,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  centerId: string;
  /** Canonical keys already present in this centre — blocked from re-adding. */
  existingKeys: string[];
  onCreated: () => void;
}) {
  const [subjectKey, setSubjectKey] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const taken = useMemo(() => new Set(existingKeys), [existingKeys]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const option = SUBJECT_OPTIONS.find((o) => o.key === subjectKey);
    if (!option || taken.has(option.key)) return;
    setSaving(true);
    // Identity is the canonical key; the label is derived, never user-typed.
    const { error } = await supabase.from("subjects").insert({
      name: option.label,
      subject_key: option.key,
      description: description.trim() || null,
      center_id: centerId,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      showSupabaseError(error, "Could not create subject");
      return;
    }
    setSubjectKey("");
    setDescription("");
    toast.success("Subject created");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white/95 backdrop-blur-md border-slate-200 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Create subject</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Subject</Label>
            <Select value={subjectKey} onValueChange={setSubjectKey}>
              <SelectTrigger className="rounded-full">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {SUBJECT_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key} disabled={taken.has(o.key)}>
                    {o.label}
                    {taken.has(o.key) ? " · Already added" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of the subject"
              className="rounded-2xl"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !subjectKey}
              className="rounded-full text-white hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: ELECTRIC_BLUE }}
            >
              {saving ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Class Modal ─── */
function ClassModal({
  open,
  onOpenChange,
  centerId,
  subject,
  tutors,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  centerId: string;
  subject: Subject | null;
  tutors: Tutor[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cohort, setCohort] = useState("");
  const [tutorId, setTutorId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject || !title.trim()) return;
    setSaving(true);
    const { data: created, error } = await supabase
      .from("classes")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        cohort_label: cohort.trim() || null,
        subject_id: subject.id,
        // classes.tutor_id is legacy. Assignments are written to class_tutors below.
        center_id: centerId,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
        is_published: true,
      })
      .select("id")
      .single();
    if (error || !created) {
      setSaving(false);
      showSupabaseError(error, "Could not create class");
      return;
    }

    // Persist the selected tutor through the canonical class_tutors table.
    const selectedTutor = tutors.find((t) => t.id === tutorId);
    if (selectedTutor?.user_id) {
      const { error: assignError } = await supabase.from("class_tutors").insert({
        center_id: centerId,
        class_id: created.id,
        tutor_user_id: selectedTutor.user_id,
      });
      if (assignError) {
        setSaving(false);
        showSupabaseError(assignError, "Class created, but the tutor could not be assigned");
        onCreated();
        return;
      }
    } else if (tutorId) {
      setSaving(false);
      toast.error("Class created, but that tutor has no linked account yet");
      onCreated();
      return;
    }

    setSaving(false);

    setTitle("");
    setDescription("");
    setCohort("");
    setTutorId("");
    setScheduledAt("");
    toast.success("Class spawned");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white/95 backdrop-blur-md border-slate-200 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Spawn class {subject ? `· ${subject.name}` : ""}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Class name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Form 5 Physics - Friday Cohort"
              className="rounded-full"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Class description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — e.g. Friday 2 PM SPM Physics, Form 5 syllabus."
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-2">
            <Label>Cohort label</Label>
            <Input
              value={cohort}
              onChange={(e) => setCohort(e.target.value)}
              placeholder="e.g. Friday 7pm"
              className="rounded-full"
            />
          </div>
          <div className="space-y-2">
            <Label>Assigned tutor</Label>
            <Select value={tutorId} onValueChange={setTutorId}>
              <SelectTrigger className="rounded-full">
                <SelectValue placeholder={tutors.length ? "Select a tutor" : "No tutors available"} />
              </SelectTrigger>
              <SelectContent>
                {tutors.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>First session</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="rounded-full"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full text-white hover:opacity-90"
              style={{ backgroundColor: ELECTRIC_BLUE }}
            >
              {saving ? "Saving…" : "Spawn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Enroll Modal ─── */
function EnrollModal({
  open,
  onOpenChange,
  centerId,
  classId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  centerId: string;
  classId: string;
  onDone: () => void;
}) {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId]);

  async function load() {
    setLoading(true);
    const [{ data: roleRows }, { data: enr }] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "student"),
      supabase
        .from("class_enrollments")
        .select("student_user_id")
        .eq("class_id", classId)
        .eq("status", "active"),
    ]);
    const studentUserIds = new Set((roleRows ?? []).map((r: any) => r.user_id));
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name, email, user_id")
      .eq("center_id", centerId)
      .order("full_name");
    const list = (profs ?? [])
      .filter((p: any) => studentUserIds.has(p.user_id))
      .map((p: any) => ({ id: p.id, full_name: p.full_name, email: p.email, user_id: p.user_id }));
    setStudents(list as any);
    // Track already enrolled by user_id (canonical identity)
    setAlreadyEnrolled(new Set((enr ?? []).map((e: any) => e.student_user_id)));
    setSelected(new Set());
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => s.full_name.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q),
    );
  }, [students, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) return;
    setSaving(true);
    const chosen = students.filter((s) => selected.has(s.id));
    // Canonical-only write to class_enrollments.
    const canonicalRows = chosen
      .filter((s: any) => s.user_id)
      .map((s: any) => ({
        center_id: centerId,
        class_id: classId,
        student_user_id: s.user_id,
        status: "active",
      }));
    let error: any = null;
    if (canonicalRows.length) {
      const res = await supabase.from("class_enrollments").insert(canonicalRows);
      error = res.error;
    }
    setSaving(false);
    if (error) {
      const { showSupabaseError } = await import("@/lib/supabaseErrors");
      showSupabaseError(error, "Enrollment failed");
      return;
    }
    toast.success(`Enrolled ${canonicalRows.length} student${canonicalRows.length > 1 ? "s" : ""}`);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white/95 backdrop-blur-md border-slate-200 rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle>Enroll students</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search students…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-full"
          />

          <div className="border border-slate-200 rounded-2xl max-h-80 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-sm text-slate-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">No students found.</div>
            ) : (
              filtered.map((s) => {
                const isEnrolled = alreadyEnrolled.has(s.id);
                const isSelected = selected.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex items-center gap-3 p-3 cursor-pointer",
                      isEnrolled && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <Checkbox
                      checked={isEnrolled || isSelected}
                      disabled={isEnrolled}
                      onCheckedChange={() => !isEnrolled && toggle(s.id)}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {s.full_name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {s.email ?? "—"} {isEnrolled && "· already enrolled"}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
          <div className="text-xs text-slate-500">
            {selected.size} selected
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || selected.size === 0}
            onClick={submit}
            className="rounded-full text-white hover:opacity-90"
            style={{ backgroundColor: ELECTRIC_BLUE }}
          >
            {saving ? "Enrolling…" : `Enroll ${selected.size || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Assign Tutors Modal ─── */
function AssignTutorsModal({
  open,
  onOpenChange,
  centerId,
  classId,
  tutors,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  centerId: string;
  classId: string;
  tutors: Tutor[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tutorList, setTutorList] = useState<Tutor[]>(tutors);
  const [tutorsLoading, setTutorsLoading] = useState(false);
  const [tutorsError, setTutorsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId]);

  async function load() {
    setLoading(true);
    setTutorsLoading(true);
    setTutorsError(null);

    // 1. Existing assignments for this class (to pre-select).
    const { data: existing, error: existingErr } = await supabase
      .from("class_tutors")
      .select("tutor_user_id")
      .eq("class_id", classId);
    if (existingErr) {
      showSupabaseError(existingErr, "Failed to load current assignments");
    }
    setSelected(new Set((existing ?? []).map((r: any) => r.tutor_user_id)));
    setLoading(false);

    // 2. Assignable tutor candidates via RPC (tenant-scoped, admin-gated).
    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      "list_assignable_tutors",
      { requested_center_id: centerId },
    );
    if (rpcErr) {
      setTutorsError("We couldn't load tutors for this centre. Please try again.");
      showSupabaseError(rpcErr, "Failed to load tutors");
      setTutorList([]);
    } else {
      const rows = (rpcData ?? []) as Array<{
        user_id: string;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
      }>;
      setTutorList(
        rows.map((r) => ({
          id: r.user_id,
          name: r.full_name || r.email || "Tutor",
          user_id: r.user_id,
        })),
      );
    }
    setTutorsLoading(false);
  }


  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function submit() {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("class_tutors")
        .select("tutor_user_id")
        .eq("class_id", classId);
      const currentSet = new Set((existing ?? []).map((r: any) => r.tutor_user_id));
      const toAdd = Array.from(selected).filter((id) => !currentSet.has(id));
      const toRemove = Array.from(currentSet).filter((id) => !selected.has(id));

      if (toAdd.length) {
        const rows = toAdd.map((tutor_user_id) => ({
          center_id: centerId,
          class_id: classId,
          tutor_user_id,
        }));
        const { error } = await supabase.from("class_tutors").insert(rows);
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await supabase
          .from("class_tutors")
          .delete()
          .eq("class_id", classId)
          .in("tutor_user_id", toRemove);
        if (error) throw error;
      }
      toast.success("Tutor assignments updated");
      onDone();
    } catch (err: any) {
      showSupabaseError(err, "Failed to update assignments");
    } finally {
      setSaving(false);
    }
  }

  const assignableTutors = tutorList.filter((t) => t.user_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white/95 backdrop-blur-md border-slate-200 rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign tutors to class</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Assigned tutors can add resources, videos, notes, quizzes, and flashcards for this
            specific class. Tutors cannot enroll students.
          </p>
          <div className="border border-slate-200 rounded-2xl max-h-80 overflow-y-auto divide-y divide-slate-100">
            {loading || tutorsLoading ? (
              <div className="p-6 text-sm text-slate-400">Loading tutors…</div>
            ) : tutorsError ? (
              <div className="p-6 text-sm text-red-600 flex items-center justify-between gap-3">
                <span>{tutorsError}</span>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => void load()}>
                  Retry
                </Button>
              </div>
            ) : assignableTutors.length === 0 ? (
              <div className="p-6 text-sm text-slate-400">
                No tutors in this centre yet. Invite tutors from the Users page.
              </div>
            ) : (
              assignableTutors.map((t) => {
                const isSelected = selected.has(t.user_id as string);
                return (
                  <label key={t.id} className="flex items-center gap-3 p-3 cursor-pointer">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(t.user_id as string)}
                    />
                    <div className="text-sm font-medium text-slate-900">{t.name}</div>
                  </label>
                );
              })

            )}
          </div>
          <div className="text-xs text-slate-500">{selected.size} assigned</div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={submit}
            className="rounded-full text-white hover:opacity-90"
            style={{ backgroundColor: ELECTRIC_BLUE }}
          >
            {saving ? "Saving…" : "Save assignments"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Subject Modal ───
   Canonical subject identity (`subject_key`) is locked after creation so a
   subject can never silently change academic category — and with it the
   artwork of every attached class. Only the description is editable. */
function EditSubjectModal({
  subject,
  centerId,
  onClose,
  onSaved,
}: {
  subject: Subject;
  centerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(subject.description ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("subjects")
      .update({ description: description.trim() || null })
      .eq("id", subject.id)
      .eq("center_id", centerId);
    setSaving(false);
    if (error) {
      showSupabaseError(error, "Could not update subject");
      return;
    }
    toast.success("Subject updated");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white/95 backdrop-blur-md border-slate-200 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit subject</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={subjectLabel(subject.subject_key, subject.name)}
              readOnly
              disabled
              className="rounded-full bg-slate-50"
            />
            <p className="text-xs text-slate-500">
              Subject identity is locked after creation. Create a new subject instead of
              re-categorising this one.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of the subject"
              className="rounded-2xl"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-full text-white hover:opacity-90"
              style={{ backgroundColor: ELECTRIC_BLUE }}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Class Modal ───
   Updates the existing class record in place: id, center_id, subject_id,
   tutors, enrolments, resources and schedules are untouched. */
function EditClassModal({
  klass,
  centerId,
  onClose,
  onSaved,
}: {
  klass: Class;
  centerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(klass.title);
  const [description, setDescription] = useState(klass.description ?? "");
  const [saving, setSaving] = useState(false);
  const trimmed = title.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    setSaving(true);
    const { error } = await supabase
      .from("classes")
      .update({ title: trimmed, description: description.trim() || null })
      .eq("id", klass.id)
      .eq("center_id", centerId);
    setSaving(false);
    if (error) {
      showSupabaseError(error, "Could not update class");
      return;
    }
    toast.success("Class updated");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white/95 backdrop-blur-md border-slate-200 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit class</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Class name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. SPM Physics 2026"
              className="rounded-full"
              required
            />
            {!trimmed && (
              <p className="text-xs text-rose-600">Class name is required.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — schedule, syllabus focus, notes for students."
              className="rounded-2xl"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !trimmed}
              className="rounded-full text-white hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: ELECTRIC_BLUE }}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Delete Subject ───
   Tenant-scoped and class-safe: `admin_delete_subject` blocks the delete while
   any class still references the subject, so nothing cascades away silently.
   Only the tenant-owned subject row is removed — the canonical subject_key
   stays globally available and other tenants are untouched. */
function DeleteSubjectDialog({
  subject,
  onClose,
  onDeleted,
}: {
  subject: Subject;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  const label = subjectLabel(subject.subject_key, subject.name);

  async function run() {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_delete_subject", {
      p_subject_id: subject.id,
    });
    setBusy(false);
    if (error) {
      showSupabaseError(error, "Unable to delete subject");
      return;
    }
    const result = (data ?? {}) as { mode?: string; class_count?: number };
    if (result.mode === "blocked") {
      setBlockedCount(result.class_count ?? 0);
      return;
    }
    toast.success(`${label} deleted`);
    onDeleted(subject.id);
  }

  if (blockedCount !== null) {
    return (
      <AlertDialog open onOpenChange={(v) => !v && onClose()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot delete {label}</AlertDialogTitle>
            <AlertDialogDescription>
              This subject still contains {blockedCount}{" "}
              {blockedCount === 1 ? "class" : "classes"}. Delete or move these classes
              before deleting the subject.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Deleting this subject may also affect classes and learning content associated
            with it. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full" disabled={busy}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
            className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? "Deleting…" : "Delete subject"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const IMPACT_LABELS: Array<{ key: string; singular: string; plural: string }> = [
  { key: "enrolled_students", singular: "enrolled student", plural: "enrolled students" },
  { key: "tutors", singular: "assigned tutor", plural: "assigned tutors" },
  { key: "resources", singular: "learning resource", plural: "learning resources" },
  { key: "folders", singular: "content folder", plural: "content folders" },
  { key: "quizzes", singular: "quiz", plural: "quizzes" },
  { key: "quiz_attempts", singular: "quiz attempt", plural: "quiz attempts" },
  { key: "flashcard_decks", singular: "flashcard deck", plural: "flashcard decks" },
  { key: "announcements", singular: "announcement", plural: "announcements" },
  { key: "notes", singular: "note", plural: "notes" },
  { key: "video_resources", singular: "video", plural: "videos" },
  { key: "attendance", singular: "attendance record", plural: "attendance records" },
];

/* ─── Delete Class ───
   Shows real dependency counts from `get_class_delete_impact`, then calls
   `admin_delete_class`, which hard-deletes an empty class and archives one that
   carries learning history (revoking student/tutor access while preserving
   grades, attempts and XP records). */
function DeleteClassDialog({
  klass,
  onClose,
  onDeleted,
}: {
  klass: Class;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [impact, setImpact] = useState<Record<string, number> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("get_class_delete_impact", {
        p_class_id: klass.id,
      });
      if (cancelled) return;
      if (error) {
        setLoadError(true);
        return;
      }
      setImpact((data ?? {}) as Record<string, number>);
    })();
    return () => {
      cancelled = true;
    };
  }, [klass.id]);

  const rows = useMemo(
    () =>
      IMPACT_LABELS.map((l) => ({ ...l, count: Number(impact?.[l.key] ?? 0) })).filter(
        (r) => r.count > 0,
      ),
    [impact],
  );
  const enrolled = Number(impact?.enrolled_students ?? 0);
  // Strong confirmation only when real dependent data exists.
  const needsTypedConfirm = rows.length > 0;
  const ready = impact !== null || loadError;
  const canDelete =
    ready && !busy && (!needsTypedConfirm || confirmText.trim().toUpperCase() === "DELETE");

  async function run() {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_delete_class", {
      p_class_id: klass.id,
    });
    setBusy(false);
    if (error) {
      showSupabaseError(error, "Unable to delete class. Please try again.");
      return;
    }
    const mode = (data as { mode?: string } | null)?.mode;
    toast.success(
      mode === "archived"
        ? `“${klass.title}” removed from active classes`
        : `“${klass.title}” deleted`,
    );
    onDeleted(klass.id);
  }

  return (
    <AlertDialog open onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{klass.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Deleting this class removes it from active student and tutor workspaces. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!ready ? (
          <div className="text-sm text-slate-500">Checking related data…</div>
        ) : rows.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-1">
            <p className="text-sm font-semibold text-slate-800">This class contains:</p>
            <ul className="text-sm text-slate-600 space-y-0.5">
              {rows.map((r) => (
                <li key={r.key}>
                  {r.count} {r.count === 1 ? r.singular : r.plural}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 pt-2">
              Grades, quiz attempts and activity history are preserved for reporting; the
              class itself is retired from active views.
            </p>
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            This class has no students, tutors or content attached.
          </div>
        )}

        {enrolled > 0 && (
          <div className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              This class currently has {enrolled} enrolled{" "}
              {enrolled === 1 ? "student" : "students"}. Deleting it will remove the class
              from their active learning workspace.
            </p>
          </div>
        )}

        {needsTypedConfirm && (
          <div className="space-y-2">
            <Label>
              Type <span className="font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="rounded-full"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full" disabled={busy}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!canDelete}
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
            className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Delete class"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
