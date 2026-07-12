import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Users, Filter, X, CheckCircle2, AlertTriangle, Clock, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  MOCK_CENTER_NAME,
  MOCK_CLASSES,
  MOCK_STUDENTS,
  MockAccountStatus,
  MockStudent,
} from "./mockEnrollmentData";

type EnrollmentFilter = "all" | "enrolled" | "not_enrolled";
type AccountFilter = "any" | MockAccountStatus;
type FormFilter = "any" | string;
type ViewTab = "all" | "enrolled" | "not_enrolled";

interface PendingAction {
  kind: "enroll" | "remove";
  studentIds: string[];
}

interface ActionSummary {
  kind: "enroll" | "remove";
  newlyEnrolled: number;
  alreadyEnrolled: number;
  skippedInactive: number;
  removed: number;
  failed: number;
  className: string;
}

const ACCOUNT_LABEL: Record<MockAccountStatus, string> = {
  active: "Active",
  pending: "Account pending",
  inactive: "Inactive",
};

function AccountStatusBadge({ status }: { status: MockAccountStatus }) {
  const map = {
    active: { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    pending: { icon: Clock, cls: "bg-amber-50 text-amber-700 border-amber-200" },
    inactive: { icon: AlertTriangle, cls: "bg-muted text-muted-foreground border-border" },
  } as const;
  const { icon: Icon, cls } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", cls)}>
      <Icon className="h-3 w-3" aria-hidden />
      {ACCOUNT_LABEL[status]}
    </span>
  );
}

export default function EnrollmentMatrixPreview() {
  const { toast } = useToast();

  const activeClasses = useMemo(() => MOCK_CLASSES.filter((c) => c.status === "active"), []);
  const [selectedClassId, setSelectedClassId] = useState<string>(activeClasses[0]?.id ?? "");
  const selectedClass = MOCK_CLASSES.find((c) => c.id === selectedClassId);

  const [students, setStudents] = useState<MockStudent[]>(MOCK_STUDENTS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [formFilter, setFormFilter] = useState<FormFilter>("any");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("any");
  const [enrollmentFilter, setEnrollmentFilter] = useState<EnrollmentFilter>("all");
  const [tab, setTab] = useState<ViewTab>("all");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [summary, setSummary] = useState<ActionSummary | null>(null);

  const formLevels = useMemo(() => Array.from(new Set(MOCK_STUDENTS.map((s) => s.formLevel))).sort(), []);

  const visibleStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (q && !s.name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q)) return false;
      if (formFilter !== "any" && s.formLevel !== formFilter) return false;
      if (accountFilter !== "any" && s.accountStatus !== accountFilter) return false;
      const isEnrolled = s.enrolledClassIds.includes(selectedClassId);
      const tabFilter: EnrollmentFilter =
        tab === "enrolled" ? "enrolled" : tab === "not_enrolled" ? "not_enrolled" : enrollmentFilter;
      if (tabFilter === "enrolled" && !isEnrolled) return false;
      if (tabFilter === "not_enrolled" && isEnrolled) return false;
      return true;
    });
  }, [students, query, formFilter, accountFilter, enrollmentFilter, tab, selectedClassId]);

  const visibleIds = visibleStudents.map((s) => s.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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

  function runAction(action: PendingAction) {
    if (!selectedClass) return;
    let newlyEnrolled = 0, alreadyEnrolled = 0, skippedInactive = 0, removed = 0, failed = 0;

    const next = students.map((s) => {
      if (!action.studentIds.includes(s.id)) return s;
      const isEnrolled = s.enrolledClassIds.includes(selectedClassId);
      if (action.kind === "enroll") {
        if (s.accountStatus === "inactive") { skippedInactive++; return s; }
        if (isEnrolled) { alreadyEnrolled++; return s; }
        newlyEnrolled++;
        return {
          ...s,
          enrolledClassIds: [...s.enrolledClassIds, selectedClassId],
          enrolledDates: { ...s.enrolledDates, [selectedClassId]: new Date().toISOString().slice(0, 10) },
        };
      } else {
        if (!isEnrolled) return s;
        removed++;
        const { [selectedClassId]: _drop, ...restDates } = s.enrolledDates;
        return {
          ...s,
          enrolledClassIds: s.enrolledClassIds.filter((id) => id !== selectedClassId),
          enrolledDates: restDates,
        };
      }
    });

    setStudents(next);
    setSelectedIds(new Set());
    setSummary({
      kind: action.kind,
      newlyEnrolled, alreadyEnrolled, skippedInactive, removed, failed,
      className: selectedClass.className,
    });

    toast({
      title: action.kind === "enroll" ? "Enrollment updated" : "Removal complete",
      description:
        action.kind === "enroll"
          ? `${newlyEnrolled} enrolled · ${alreadyEnrolled} already enrolled · ${skippedInactive} skipped`
          : `${removed} removed from ${selectedClass.className}`,
    });
  }

  const selectedCount = selectedIds.size;

  const FiltersBody = (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Form level</label>
        <Select value={formFilter} onValueChange={(v) => setFormFilter(v as FormFilter)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Account pending</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {tab === "all" && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Enrollment</label>
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
      <Button variant="ghost" className="w-full rounded-full" onClick={clearFilters}>
        <X className="h-4 w-4 mr-1" /> Clear filters
      </Button>
    </div>
  );

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
              Assign students to class instances in bulk. Preview only — no changes are saved.
            </p>
          </div>
          <Badge variant="outline" className="rounded-full px-3 py-1">
            <Users className="h-3 w-3 mr-1" /> {MOCK_CENTER_NAME}
          </Badge>
        </div>

        {/* Class selector */}
        <Card className="rounded-3xl p-4 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="grid md:grid-cols-[minmax(0,1fr),auto] gap-4 items-end">
            <div className="min-w-0">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="class-select">Class instance</label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger id="class-select" className="mt-1 h-auto py-3">
                  <SelectValue placeholder="Choose a class" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {MOCK_CLASSES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex flex-col text-left">
                        <span className="font-medium">{c.className}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.tutorName} · {c.schedule} · {c.academicYear}
                          {c.status === "archived" && " · Archived"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedClass && (
              <div className="text-sm text-muted-foreground md:text-right">
                <div className="font-medium text-foreground">{selectedClass.subject}</div>
                <div>{selectedClass.tutorName} · {selectedClass.schedule}</div>
                <div className="text-xs">Academic year {selectedClass.academicYear}</div>
              </div>
            )}
          </div>
        </Card>

        {/* Tabs + toolbar */}
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

          {/* Desktop filters row */}
          <div className="hidden md:block mt-4">
            <Card className="rounded-2xl p-4">
              <div className="grid grid-cols-4 gap-4 items-end">{FiltersBody}</div>
            </Card>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span aria-live="polite">
              Showing {visibleStudents.length} of {students.length} students
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
            <StudentList
              students={visibleStudents}
              selectedIds={selectedIds}
              onToggle={toggle}
              classId={selectedClassId}
            />
            {visibleStudents.length === 0 && (
              <div className="text-center py-16 text-muted-foreground text-sm">
                No students match the current filters.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Sticky bulk-action bar */}
      {selectedCount > 0 && selectedClass && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="text-sm">
              <span className="font-semibold" aria-live="polite">{selectedCount} students selected</span>
              <span className="text-muted-foreground"> · Target: {selectedClass.className}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="ghost" className="rounded-full" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </Button>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => setPending({ kind: "remove", studentIds: Array.from(selectedIds) })}
              >
                Remove from class
              </Button>
              <Button
                className="rounded-full"
                onClick={() => setPending({ kind: "enroll", studentIds: Array.from(selectedIds) })}
              >
                Enroll selected
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      <AlertDialog open={pending?.kind === "enroll"} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Enroll {pending?.studentIds.length} students into {selectedClass?.className}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedClass?.tutorName} · {selectedClass?.schedule} · {selectedClass?.academicYear}.
              Students already enrolled will be skipped. Inactive accounts will not be enrolled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => { if (pending) runAction(pending); setPending(null); }}
            >
              Enroll students
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pending?.kind === "remove"} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {pending?.studentIds.length} students from {selectedClass?.className}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              These students will lose access to this class's materials. Past quiz attempts and
              progress records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep enrolled</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full"
              onClick={() => { if (pending) runAction(pending); setPending(null); }}
            >
              Remove students
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Summary dialog */}
      <AlertDialog open={!!summary} onOpenChange={(o) => !o && setSummary(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {summary?.kind === "enroll" ? "Enrollment summary" : "Removal summary"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm text-foreground">
                <div className="text-muted-foreground">Class: {summary?.className}</div>
                {summary?.kind === "enroll" ? (
                  <>
                    <div>{summary?.newlyEnrolled} newly enrolled</div>
                    <div>{summary?.alreadyEnrolled} were already enrolled</div>
                    <div>{summary?.skippedInactive} skipped (inactive accounts)</div>
                    <div>{summary?.failed} failed</div>
                  </>
                ) : (
                  <div>{summary?.removed} removed</div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="rounded-full" onClick={() => setSummary(null)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StudentList({
  students, selectedIds, onToggle, classId,
}: {
  students: MockStudent[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  classId: string;
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
                  <th className="p-3">Other classes</th>
                  <th className="p-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const enrolled = s.enrolledClassIds.includes(classId);
                  const others = s.enrolledClassIds.filter((id) => id !== classId).length;
                  return (
                    <tr key={s.id} className="border-t hover:bg-muted/30">
                      <td className="p-3">
                        <Checkbox
                          checked={selectedIds.has(s.id)}
                          onCheckedChange={() => onToggle(s.id)}
                          aria-label={`Select ${s.name}`}
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.email}</div>
                      </td>
                      <td className="p-3">{s.formLevel}</td>
                      <td className="p-3"><AccountStatusBadge status={s.accountStatus} /></td>
                      <td className="p-3">
                        {enrolled ? (
                          <Badge className="rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Enrolled</Badge>
                        ) : (
                          <Badge variant="outline" className="rounded-full">Not enrolled</Badge>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{others}</td>
                      <td className="p-3 text-muted-foreground">{s.joinedDate}</td>
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
          const enrolled = s.enrolledClassIds.includes(classId);
          const others = s.enrolledClassIds.filter((id) => id !== classId).length;
          const isSel = selectedIds.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className={cn(
                "w-full text-left rounded-2xl border p-3 flex gap-3 items-start transition-colors",
                isSel ? "border-primary bg-primary/5" : "border-border bg-card"
              )}
              aria-pressed={isSel}
            >
              <Checkbox
                checked={isSel}
                onCheckedChange={() => onToggle(s.id)}
                aria-label={`Select ${s.name}`}
                className="mt-1 h-5 w-5"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.email}</div>
                  </div>
                  {enrolled ? (
                    <Badge className="rounded-full bg-emerald-100 text-emerald-800 shrink-0">Enrolled</Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full shrink-0">Not enrolled</Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  <span>{s.formLevel}</span>
                  <span>·</span>
                  <AccountStatusBadge status={s.accountStatus} />
                  <span>·</span>
                  <span>{others} other classes</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
