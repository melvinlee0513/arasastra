import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Users, Filter, X, CheckCircle2, AlertTriangle, Clock, ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { showSupabaseError } from "@/lib/supabaseErrors";

type EnrollmentFilter = "all" | "enrolled" | "not_enrolled";
type AccountFilter = "any" | "active" | "pending";
type FormFilter = "any" | string;
type ViewTab = "all" | "enrolled" | "not_enrolled";

interface ClassRow {
  id: string;
  class_name: string | null;
  title: string;
  schedule_label: string | null;
  academic_year: string | null;
  status: string;
  subject_name: string | null;
  enrolled_count: number;
}

interface StudentRow {
  user_id: string;
  full_name: string;
  email: string | null;
  form_year: string | null;
  is_registered: boolean;
  created_at: string | null;
}

interface EnrollResult {
  requested: number;
  newly_enrolled: number;
  already_enrolled: number;
  skipped_no_student_role: number;
  skipped_foreign_center: number;
  failed: number;
}

interface RemoveResult {
  requested: number;
  removed: number;
  not_enrolled: number;
  skipped_foreign_center: number;
  failed: number;
}

interface PendingAction {
  kind: "enroll" | "remove";
  studentIds: string[];
}

function AccountStatusBadge({ registered }: { registered: boolean }) {
  const Icon = registered ? CheckCircle2 : Clock;
  const cls = registered
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", cls)}>
      <Icon className="h-3 w-3" aria-hidden />
      {registered ? "Active" : "Pending signup"}
    </span>
  );
}

export default function EnrollmentMatrix() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { currentTenantId, isLoading: tenantLoading } = useTenant();

  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [formFilter, setFormFilter] = useState<FormFilter>("any");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("any");
  const [enrollmentFilter, setEnrollmentFilter] = useState<EnrollmentFilter>("all");
  const [tab, setTab] = useState<ViewTab>("all");
  const [pending, setPending] = useState<PendingAction | null>(null);

  // ---- Load classes for the current tenant ------------------------------
  const classesQuery = useQuery({
    queryKey: ["enrollment-matrix", "classes", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async (): Promise<ClassRow[]> => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, title, class_name, schedule_label, academic_year, status, subjects(name)")
        .eq("center_id", currentTenantId!)
        .order("status", { ascending: true })
        .order("class_name", { ascending: true, nullsFirst: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        id: string;
        title: string;
        class_name: string | null;
        schedule_label: string | null;
        academic_year: string | null;
        status: string;
        subjects: { name: string } | null;
      }>;

      // enrolled counts
      const ids = rows.map((r) => r.id);
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: cnt } = await supabase
          .from("class_enrollments")
          .select("class_id")
          .eq("center_id", currentTenantId!)
          .eq("status", "active")
          .in("class_id", ids);
        (cnt ?? []).forEach((r: { class_id: string }) => {
          counts.set(r.class_id, (counts.get(r.class_id) ?? 0) + 1);
        });
      }

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        class_name: r.class_name,
        schedule_label: r.schedule_label,
        academic_year: r.academic_year,
        status: r.status,
        subject_name: r.subjects?.name ?? null,
        enrolled_count: counts.get(r.id) ?? 0,
      }));
    },
  });

  const classes = classesQuery.data ?? [];
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // ---- Load same-centre students (profiles + student role) --------------
  const studentsQuery = useQuery({
    queryKey: ["enrollment-matrix", "students", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async (): Promise<StudentRow[]> => {
      // 1. All user_ids in this centre holding the student role
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");
      if (rolesErr) throw rolesErr;
      const studentIds = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
      if (studentIds.length === 0) return [];

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, form_year, is_registered, created_at")
        .eq("center_id", currentTenantId!)
        .in("user_id", studentIds);
      if (profErr) throw profErr;

      return (profiles ?? []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name ?? "Unnamed student",
        email: p.email ?? null,
        form_year: p.form_year ?? null,
        is_registered: !!p.is_registered,
        created_at: p.created_at ?? null,
      }));
    },
  });

  const students = studentsQuery.data ?? [];

  // ---- Load enrolments for the selected class ---------------------------
  const enrollmentsQuery = useQuery({
    queryKey: ["enrollment-matrix", "enrollments", currentTenantId, selectedClassId],
    enabled: !!currentTenantId && !!selectedClassId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("class_enrollments")
        .select("student_user_id")
        .eq("center_id", currentTenantId!)
        .eq("class_id", selectedClassId)
        .eq("status", "active");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.student_user_id));
    },
  });

  const enrolledSet = enrollmentsQuery.data ?? new Set<string>();

  // ---- Derived filter data ---------------------------------------------
  const formLevels = useMemo(() => {
    const s = new Set<string>();
    students.forEach((st) => st.form_year && s.add(st.form_year));
    return Array.from(s).sort();
  }, [students]);

  const visibleStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !s.full_name.toLowerCase().includes(q) && !(s.email ?? "").toLowerCase().includes(q)) return false;
      if (formFilter !== "any" && s.form_year !== formFilter) return false;
      if (accountFilter === "active" && !s.is_registered) return false;
      if (accountFilter === "pending" && s.is_registered) return false;
      const isEnrolled = enrolledSet.has(s.user_id);
      const tabFilter: EnrollmentFilter =
        tab === "enrolled" ? "enrolled" : tab === "not_enrolled" ? "not_enrolled" : enrollmentFilter;
      if (tabFilter === "enrolled" && !isEnrolled) return false;
      if (tabFilter === "not_enrolled" && isEnrolled) return false;
      return true;
    });
  }, [students, query, formFilter, accountFilter, enrollmentFilter, tab, enrolledSet]);

  const visibleIds = visibleStudents.map((s) => s.user_id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setFormFilter("any");
    setAccountFilter("any");
    setEnrollmentFilter("all");
  }

  // ---- Mutations --------------------------------------------------------
  function invalidateAfterMutation() {
    qc.invalidateQueries({ queryKey: ["enrollment-matrix"] });
    // Downstream student/tutor caches
    qc.invalidateQueries({ queryKey: ["classroom"] });
    qc.invalidateQueries({ queryKey: ["classes"] });
    qc.invalidateQueries({ queryKey: ["my-classes"] });
    qc.invalidateQueries({ queryKey: ["student-dashboard"] });
    qc.invalidateQueries({ queryKey: ["tutor-students"] });
    qc.invalidateQueries({ queryKey: ["curriculum"] });
  }

  const enrollMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await (supabase.rpc as any)("bulk_enroll_students", {
        requested_class_id: selectedClassId,
        requested_student_user_ids: ids,
      });
      if (error) throw error;
      return data as EnrollResult;
    },
    onSuccess: (result) => {
      invalidateAfterMutation();
      setSelectedIds(new Set());
      const parts = [
        `${result.newly_enrolled} newly enrolled`,
        `${result.already_enrolled} already enrolled`,
      ];
      if (result.skipped_no_student_role) parts.push(`${result.skipped_no_student_role} skipped (no student role)`);
      if (result.skipped_foreign_center) parts.push(`${result.skipped_foreign_center} skipped (other centre)`);
      if (result.failed) parts.push(`${result.failed} failed`);
      toast({
        title: result.failed > 0 ? "Enrolment partially completed" : "Enrolment complete",
        description: parts.join(" · "),
        variant: result.failed > 0 ? "destructive" : "default",
      });
    },
    onError: (err) => showSupabaseError(err),
  });

  const removeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await (supabase.rpc as any)("bulk_remove_students", {
        requested_class_id: selectedClassId,
        requested_student_user_ids: ids,
      });
      if (error) throw error;
      return data as RemoveResult;
    },
    onSuccess: (result) => {
      invalidateAfterMutation();
      setSelectedIds(new Set());
      const parts = [`${result.removed} removed`, `${result.not_enrolled} were not enrolled`];
      if (result.skipped_foreign_center) parts.push(`${result.skipped_foreign_center} skipped (other centre)`);
      if (result.failed) parts.push(`${result.failed} failed`);
      toast({
        title: result.failed > 0 ? "Removal partially completed" : "Removal complete",
        description: parts.join(" · "),
        variant: result.failed > 0 ? "destructive" : "default",
      });
    },
    onError: (err) => showSupabaseError(err),
  });

  const selectedCount = selectedIds.size;

  // ---- Confirmation preview counts --------------------------------------
  const pendingPreview = useMemo(() => {
    if (!pending) return null;
    const ids = pending.studentIds;
    let alreadyEnrolled = 0;
    let eligibleEnroll = 0;
    let pendingSignup = 0;
    let currentlyEnrolled = 0;
    ids.forEach((id) => {
      const s = students.find((x) => x.user_id === id);
      const isEnrolled = enrolledSet.has(id);
      if (pending.kind === "enroll") {
        if (isEnrolled) alreadyEnrolled++;
        else eligibleEnroll++;
        if (s && !s.is_registered) pendingSignup++;
      } else {
        if (isEnrolled) currentlyEnrolled++;
      }
    });
    return { alreadyEnrolled, eligibleEnroll, pendingSignup, currentlyEnrolled };
  }, [pending, students, enrolledSet]);

  // ---- Rendering --------------------------------------------------------
  const FiltersBody = (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Form / year</label>
        <Select value={formFilter} onValueChange={(v) => setFormFilter(v)}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Any" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All form levels</SelectItem>
            {formLevels.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Account status</label>
        <Select value={accountFilter} onValueChange={(v) => setAccountFilter(v as AccountFilter)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            <SelectItem value="active">Active (signed up)</SelectItem>
            <SelectItem value="pending">Pending signup</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {tab === "all" && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Enrolment</label>
          <Select value={enrollmentFilter} onValueChange={(v) => setEnrollmentFilter(v as EnrollmentFilter)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All students</SelectItem>
              <SelectItem value="enrolled">Enrolled in this class</SelectItem>
              <SelectItem value="not_enrolled">Not enrolled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-end">
        <Button variant="ghost" className="w-full rounded-full" onClick={clearFilters}>
          <X className="h-4 w-4 mr-1" /> Clear filters
        </Button>
      </div>
    </div>
  );

  if (tenantLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isBusy = enrollMutation.isPending || removeMutation.isPending;

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6 pb-40">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <Link to="/admin" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-3 w-3" /> Back to admin
            </Link>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Enrollment Matrix</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              Enrol or remove students in bulk. Writes to the canonical class_enrollments table.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1">
              <Users className="h-3 w-3 mr-1" /> {students.length} students in centre
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => qc.invalidateQueries({ queryKey: ["enrollment-matrix"] })}
              disabled={studentsQuery.isFetching || classesQuery.isFetching}
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* Class selector */}
        <Card className="rounded-3xl p-4 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {classesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading classes…
            </div>
          ) : classesQuery.isError ? (
            <div className="text-sm text-destructive flex items-center justify-between">
              <span>Could not load classes.</span>
              <Button size="sm" variant="outline" onClick={() => classesQuery.refetch()}>Retry</Button>
            </div>
          ) : classes.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No classes yet. Create one in <Link to="/admin/curriculum" className="underline">Curriculum</Link>.
            </div>
          ) : (
            <div className="grid md:grid-cols-[minmax(0,1fr),auto] gap-4 items-end">
              <div className="min-w-0">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="class-select">Class instance</label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger id="class-select" className="mt-1 h-auto py-3">
                    <SelectValue placeholder="Choose a class" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex flex-col text-left">
                          <span className="font-medium">{c.class_name || c.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {[c.subject_name, c.schedule_label, c.academic_year].filter(Boolean).join(" · ")}
                            {" · "}{c.enrolled_count} enrolled
                            {c.status !== "active" && ` · ${c.status}`}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedClass && (
                <div className="text-sm text-muted-foreground md:text-right">
                  <div className="font-medium text-foreground">{selectedClass.subject_name ?? "—"}</div>
                  <div>{selectedClass.schedule_label ?? ""}</div>
                  <div className="text-xs">
                    {enrollmentsQuery.isLoading ? "Loading enrolments…" : `${enrolledSet.size} enrolled`}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {!selectedClassId ? (
          <Card className="rounded-3xl p-10 text-center text-sm text-muted-foreground">
            Select a class above to view its student roster.
          </Card>
        ) : (
          <>
            {/* Toolbar */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as ViewTab)}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <TabsList className="rounded-full">
                  <TabsTrigger value="all" className="rounded-full">All students</TabsTrigger>
                  <TabsTrigger value="enrolled" className="rounded-full">Enrolled</TabsTrigger>
                  <TabsTrigger value="not_enrolled" className="rounded-full">Not enrolled</TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 md:w-72">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      aria-label="Search students by name or email"
                      placeholder="Search name or email"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="pl-9 rounded-full"
                    />
                  </div>
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" className="rounded-full md:hidden" aria-label="Open filters">
                        <Filter className="h-4 w-4" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="rounded-t-3xl">
                      <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
                      <div className="pt-4">{FiltersBody}</div>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>

              <div className="hidden md:block mt-4">
                <Card className="rounded-2xl p-4">{FiltersBody}</Card>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <span aria-live="polite">
                  Showing {visibleStudents.length} of {students.length} students
                  {selectedCount > 0 && ` · ${selectedCount} selected`}
                </span>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAllVisible}
                    aria-label="Select all visible students"
                  />
                  <label htmlFor="select-all" className="cursor-pointer">Select all visible</label>
                </div>
              </div>

              <TabsContent value={tab} className="mt-4">
                {studentsQuery.isLoading || enrollmentsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading roster…
                  </div>
                ) : studentsQuery.isError || enrollmentsQuery.isError ? (
                  <Card className="rounded-2xl p-6 text-center">
                    <AlertTriangle className="h-6 w-6 mx-auto text-destructive" />
                    <p className="mt-2 text-sm text-destructive">Could not load student roster.</p>
                    <Button
                      variant="outline"
                      className="mt-3 rounded-full"
                      onClick={() => {
                        studentsQuery.refetch();
                        enrollmentsQuery.refetch();
                      }}
                    >
                      Retry
                    </Button>
                  </Card>
                ) : students.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground text-sm">
                    No student accounts exist in this centre yet.
                  </div>
                ) : visibleStudents.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground text-sm">
                    No students match the current filters.
                  </div>
                ) : (
                  <StudentList
                    students={visibleStudents}
                    selectedIds={selectedIds}
                    onToggle={toggle}
                    enrolledSet={enrolledSet}
                  />
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Sticky bulk-action bar */}
      {selectedCount > 0 && selectedClass && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="text-sm">
              <span className="font-semibold" aria-live="polite">{selectedCount} students selected</span>
              <span className="text-muted-foreground"> · Target: {selectedClass.class_name || selectedClass.title}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="ghost" className="rounded-full min-h-11" onClick={() => setSelectedIds(new Set())} disabled={isBusy}>
                Clear selection
              </Button>
              <Button
                variant="outline"
                className="rounded-full min-h-11"
                disabled={isBusy}
                onClick={() => setPending({ kind: "remove", studentIds: Array.from(selectedIds) })}
              >
                Remove from class
              </Button>
              <Button
                className="rounded-full min-h-11"
                disabled={isBusy}
                onClick={() => setPending({ kind: "enroll", studentIds: Array.from(selectedIds) })}
              >
                Enrol selected
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm enrol */}
      <AlertDialog open={pending?.kind === "enroll"} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Enrol {pending?.studentIds.length} students in {selectedClass?.class_name || selectedClass?.title}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <div>{pendingPreview?.eligibleEnroll ?? 0} will be newly enrolled</div>
                <div>{pendingPreview?.alreadyEnrolled ?? 0} already enrolled (will be skipped)</div>
                {pendingPreview?.pendingSignup ? (
                  <div className="text-amber-700">
                    {pendingPreview.pendingSignup} have not signed up yet — they will see the class after signing in.
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => {
                if (!pending) return;
                enrollMutation.mutate(pending.studentIds);
                setPending(null);
              }}
            >
              Enrol students
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm remove */}
      <AlertDialog open={pending?.kind === "remove"} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {pendingPreview?.currentlyEnrolled ?? 0} enrolments from {selectedClass?.class_name || selectedClass?.title}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              These students will lose access to this class's materials, videos and quizzes.
              Their other class enrolments and past progress are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep enrolled</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => {
                if (!pending) return;
                removeMutation.mutate(pending.studentIds);
                setPending(null);
              }}
            >
              Remove students
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StudentList({
  students, selectedIds, onToggle, enrolledSet,
}: {
  students: StudentRow[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  enrolledSet: Set<string>;
}) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Card className="rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 w-10"></th>
                  <th className="p-3">Student</th>
                  <th className="p-3">Form</th>
                  <th className="p-3">Account</th>
                  <th className="p-3">This class</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const enrolled = enrolledSet.has(s.user_id);
                  return (
                    <tr key={s.user_id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        <Checkbox
                          checked={selectedIds.has(s.user_id)}
                          onCheckedChange={() => onToggle(s.user_id)}
                          aria-label={`Select ${s.full_name}`}
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{s.full_name}</div>
                        <div className="text-xs text-muted-foreground">{s.email ?? "—"}</div>
                      </td>
                      <td className="p-3">{s.form_year ?? "—"}</td>
                      <td className="p-3"><AccountStatusBadge registered={s.is_registered} /></td>
                      <td className="p-3">
                        {enrolled ? (
                          <Badge className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Enrolled</Badge>
                        ) : (
                          <Badge variant="outline" className="rounded-full">Not enrolled</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {students.map((s) => {
          const enrolled = enrolledSet.has(s.user_id);
          const isSel = selectedIds.has(s.user_id);
          return (
            <button
              key={s.user_id}
              type="button"
              onClick={() => onToggle(s.user_id)}
              className={cn(
                "w-full text-left rounded-2xl border p-3 flex gap-3 items-start transition-colors min-h-14",
                isSel ? "border-primary bg-primary/5" : "border-border bg-card"
              )}
              aria-pressed={isSel}
            >
              <Checkbox
                checked={isSel}
                onCheckedChange={() => onToggle(s.user_id)}
                aria-label={`Select ${s.full_name}`}
                className="mt-1 h-5 w-5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.email ?? "—"}</div>
                  </div>
                  {enrolled ? (
                    <Badge className="rounded-full bg-emerald-100 text-emerald-800 shrink-0">Enrolled</Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full shrink-0">Not enrolled</Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  <span>{s.form_year ?? "—"}</span>
                  <span>·</span>
                  <AccountStatusBadge registered={s.is_registered} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
