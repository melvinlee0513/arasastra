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

import { BookOpen, GraduationCap, Plus, Users, ChevronRight, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

type Subject = { id: string; name: string; description: string | null };
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
  const [loading, setLoading] = useState(true);

  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [assignTutorsOpen, setAssignTutorsOpen] = useState(false);

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
    const [{ data: subs }, { data: tuts }] = await Promise.all([
      supabase
        .from("subjects")
        .select("id, name, description")
        .eq("center_id", currentTenantId)
        .order("name"),
      supabase
        .from("tutors")
        .select("id, name, user_id, profiles:user_id(center_id)")
        .eq("is_active", true),
    ]);
    setSubjects((subs ?? []) as Subject[]);
    const scoped = (tuts ?? []).filter(
      (t: any) => t.profiles?.center_id === currentTenantId,
    );
    setTutors(scoped.map((t: any) => ({ id: t.id, name: t.name, user_id: t.user_id })));
    if (subs && subs.length && !selectedSubjectId) {
      setSelectedSubjectId(subs[0].id);
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
      .order("scheduled_at", { ascending: false });
    const list = (data ?? []) as Class[];
    setClasses(list);

    // Enrollment counts
    const ids = list.map((c) => c.id);
    if (ids.length) {
      const { data: enr } = await supabase
        .from("class_enrollments")
        .select("class_id")
        .in("class_id", ids)
        .eq("status", "active");
      const counts: EnrollmentCount = {};
      (enr ?? []).forEach((e: any) => {
        counts[e.class_id] = (counts[e.class_id] ?? 0) + 1;
      });
      setEnrollmentCounts(counts);
    } else {
      setEnrollmentCounts({});
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
                      <button
                        onClick={() => {
                          setSelectedSubjectId(s.id);
                          setSelectedClassId(null);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                          active
                            ? "text-white shadow-sm"
                            : "text-slate-700 hover:bg-slate-100/70",
                        )}
                        style={active ? { backgroundColor: ELECTRIC_BLUE } : undefined}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{s.name}</div>
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
                {selectedSubject ? `Classes · ${selectedSubject.name}` : "Classes"}
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
              <div className="p-10 text-center text-sm text-slate-400">
                No cohorts yet for {selectedSubject.name}.
              </div>
            ) : (
              <ul className="space-y-2">
                {classes.map((c) => {
                  const active = c.id === selectedClassId;
                  const tutor = tutors.find((t) => t.id === c.tutor_id);
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedClassId(c.id)}
                        className={cn(
                          "w-full flex items-center justify-between gap-4 p-4 rounded-xl border text-left transition-all",
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
                            {tutor ? tutor.name : "Unassigned tutor"} ·{" "}
                            {c.cohort_label ?? "Cohort"}
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
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Modals */}
      <SubjectModal
        open={subjectModalOpen}
        onOpenChange={setSubjectModalOpen}
        centerId={currentTenantId}
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
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  centerId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("subjects")
      .insert({ name: name.trim(), description: description.trim() || null, center_id: centerId, is_active: true });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
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
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Physics"
              className="rounded-full"
              required
            />
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
              disabled={saving}
              className="rounded-full text-white hover:opacity-90"
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
  const [cohort, setCohort] = useState("");
  const [tutorId, setTutorId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject) return;
    setSaving(true);
    const { error } = await supabase.from("classes").insert({
      title: title.trim(),
      cohort_label: cohort.trim() || null,
      subject_id: subject.id,
      tutor_id: tutorId || null,
      center_id: centerId,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
      is_published: true,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
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

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("class_tutors")
      .select("tutor_user_id")
      .eq("class_id", classId);
    setSelected(new Set((data ?? []).map((r: any) => r.tutor_user_id)));
    setLoading(false);
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

  const assignableTutors = tutors.filter((t) => t.user_id);

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
            {loading ? (
              <div className="p-6 text-sm text-slate-400">Loading…</div>
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
