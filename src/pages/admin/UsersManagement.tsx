import { useEffect, useMemo, useState } from "react";
import {
  Search, Edit, Shield, User, GraduationCap, ChevronDown, RefreshCw,
  Settings2, Plus, X, Users, Filter, Loader2, UserPlus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { InviteUserModal } from "@/components/admin/InviteUserModal";
import { cn } from "@/lib/utils";


interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string;
  avatar_url: string | null;
  form_year: string | null;
  phone: string | null;
  center_id: string | null;
  created_at: string;
  role?: "admin" | "superadmin" | "tutor" | "student";
}

interface Subject { id: string; name: string }
interface Standard { id: string; name: string; sort_order: number }
interface ClassInstance {
  id: string; title: string; subject_id: string | null;
  standard_id: string | null; cohort_label: string | null;
}
interface TutorAssignment {
  id: string; tutor_id: string; subject_id: string; standard_id: string | null;
}
interface Enrollment { id: string; student_id: string; class_id: string | null; subject_id: string | null }

const FORM_YEARS = ["Year 5","Year 6","Form 1","Form 2","Form 3","Form 4","Form 5"];

export function UsersManagement() {
  const { toast } = useToast();
  const { currentTenantId } = useTenant();
  const { role: userRole } = useAuth();
  const isSuperadmin = userRole === "superadmin";
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [classes, setClasses] = useState<ClassInstance[]>([]);
  const [assignments, setAssignments] = useState<TutorAssignment[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [tutors, setTutors] = useState<{ id: string; user_id: string }[]>([]);

  const [activeTab, setActiveTab] = useState<"admin" | "tutor" | "student">("student");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [standardFilter, setStandardFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const [assignUser, setAssignUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (isSuperadmin || currentTenantId) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTenantId, activeTab, isSuperadmin]);
  useEffect(() => { setRoleFilter(activeTab === "admin" ? "all" : activeTab); }, [activeTab]);


  const fetchUsers = async () => {
    try {
      setIsLoading(true);

      // Step 1: Fetch the valid IDs for the active tab from the user_roles table
      const targetRoles: Array<"admin" | "superadmin" | "student" | "tutor"> =
        activeTab === "admin" ? ["admin", "superadmin"] : [activeTab];
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", targetRoles);

      if (roleError) throw roleError;

      // Step 2: Guard clause — stop and clear if no users found for this role
      if (!roleData || roleData.length === 0) {
        setUsers([]);
        return;
      }

      const userIds = Array.from(new Set(roleData.map((r) => r.user_id)));
      const roleByUserId = new Map<string, "admin" | "superadmin" | "student" | "tutor">();
      roleData.forEach((row) => {
        const existing = roleByUserId.get(row.user_id);
        if (!existing || row.role === "superadmin") roleByUserId.set(row.user_id, row.role);
      });

      // Step 3: Fetch profiles using ONLY the validated IDs.
      // STRICT CONDITIONAL: Only apply tenant isolation if NOT a superadmin.
      let profileQuery = supabase
        .from("profiles")
        .select("*")
        .in("user_id", userIds);
      if (!isSuperadmin) {
        profileQuery = profileQuery.eq("center_id", currentTenantId);
      }
      const { data: profiles, error: profilesError } = await profileQuery;

      if (profilesError) throw profilesError;

      // Step 4: Merge the explicit role back into the profile object for the UI
      const mergedUsers: UserProfile[] = (profiles || []).map((profile: any) => ({
        ...profile,
        role: roleByUserId.get(profile.user_id) ?? targetRoles[0],
      }));

      setUsers(mergedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({ title: "Error", description: "Failed to load users", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRelations = async () => {
    const [subsRes, stdsRes, classesRes, assignsRes, enrolRes, tutorsRes] = await Promise.all([
      (supabase as any).from("subjects").select("id,name").eq("is_active", true).order("name"),
      (supabase as any).from("standards").select("id,name,sort_order").order("sort_order"),
      (supabase as any).from("classes").select("id,title,subject_id,standard_id,cohort_label").order("scheduled_at", { ascending: false }),
      (supabase as any).from("tutor_assignments").select("id,tutor_id,subject_id,standard_id"),
      (supabase as any).from("enrollments").select("id,student_id,class_id,subject_id"),
      (supabase as any).from("tutors").select("id,user_id"),
    ]);
    setSubjects(subsRes.data || []);
    setStandards(stdsRes.data || []);
    setClasses(classesRes.data || []);
    setAssignments(assignsRes.data || []);
    setEnrollments(enrolRes.data || []);
    setTutors(tutorsRes.data || []);
  };

  const fetchAll = async () => {
    if (!currentTenantId) return;
    await Promise.all([fetchUsers(), fetchRelations()]);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAll();
    setIsRefreshing(false);
    toast({ title: "✅ Refreshed" });
  };

  const updateUserRole = async (userId: string, newRole: "admin" | "student" | "tutor") => {
    setUpdatingRoleId(userId);
    try {
      const { data: existing } = await supabase.from("user_roles").select("id").eq("user_id", userId).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole as any });
        if (error) throw error;
      }
      // If promoting to tutor and they have no tutor row, create a stub
      if (newRole === "tutor" && !tutors.find((t) => t.user_id === userId)) {
        const profile = users.find((u) => u.user_id === userId);
        const { data: t } = await (supabase as any).from("tutors")
          .insert({ user_id: userId, name: profile?.full_name || "Tutor" })
          .select("id,user_id").single();
        if (t) setTutors((prev) => [...prev, t]);
      }
      setUsers((prev) => prev.map((u) => u.user_id === userId ? { ...u, role: newRole } : u));
      toast({ title: "Role updated", description: `Now ${newRole}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update role", variant: "destructive" });
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const updateUser = async () => {
    if (!editingUser) return;
    // Validate + sanitize admin-provided fields before persisting.
    const fullName = (editingUser.full_name ?? "").trim().slice(0, 100);
    const formYear = (editingUser.form_year ?? "").trim().slice(0, 32) || null;
    const rawPhone = (editingUser.phone ?? "").trim();
    const cleanedPhone = rawPhone.replace(/[^+\d\s-]/g, "").slice(0, 20);
    const phoneOk = cleanedPhone === "" || /^[+]?[\d\s-]{7,20}$/.test(cleanedPhone);
    if (!fullName) {
      toast({ title: "Invalid name", description: "Full name is required.", variant: "destructive" });
      return;
    }
    if (!phoneOk) {
      toast({ title: "Invalid phone", description: "Use 7–20 digits, spaces, or dashes.", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase.from("profiles").update({
        full_name: fullName,
        form_year: formYear,
        phone: cleanedPhone || null,
      }).eq("id", editingUser.id);
      if (error) throw error;
      toast({ title: "Saved" });
      setIsEditOpen(false);
      fetchAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };


  // --- Faceted filtering ---
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (standardFilter !== "all" && u.form_year !== standardFilter) return false;

      if (subjectFilter !== "all") {
        if (u.role === "tutor") {
          const t = tutors.find((tt) => tt.user_id === u.user_id);
          if (!t || !assignments.some((a) => a.tutor_id === t.id && a.subject_id === subjectFilter)) return false;
        } else if (u.role === "student") {
          const studentClassIds = enrollments.filter((e) => e.student_id === u.id).map((e) => e.class_id);
          const hasSubject = classes.some((c) => studentClassIds.includes(c.id) && c.subject_id === subjectFilter)
            || enrollments.some((e) => e.student_id === u.id && e.subject_id === subjectFilter);
          if (!hasSubject) return false;
        } else { return false; }
      }

      if (classFilter !== "all") {
        if (u.role !== "student") return false;
        if (!enrollments.some((e) => e.student_id === u.id && e.class_id === classFilter)) return false;
      }

      if (!q) return true;
      return u.full_name.toLowerCase().includes(q)
        || (u.email || "").toLowerCase().includes(q)
        || (u.form_year || "").toLowerCase().includes(q)
        || (u.phone || "").toLowerCase().includes(q);
    });
  }, [users, searchQuery, roleFilter, standardFilter, subjectFilter, classFilter, assignments, enrollments, tutors, classes]);

  const clearFilters = () => {
    setSearchQuery(""); setRoleFilter("all"); setStandardFilter("all");
    setSubjectFilter("all"); setClassFilter("all");
  };

  const activeFilterCount = [roleFilter, standardFilter, subjectFilter, classFilter].filter((f) => f !== "all").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#0052FF]/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-[#0052FF]" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-[#0F172A]">User Management</h1>
              <p className="text-sm text-slate-500">Manage tutors and students for your organisation.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing} className="rounded-full">
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              onClick={() => setInviteOpen(true)}
              className="rounded-full bg-[#0052FF] hover:bg-[#0047DB] text-white shadow-[0_8px_30px_rgb(0,82,255,0.25)]"
            >
              <UserPlus className="w-4 h-4 mr-2" /> Invite user
            </Button>
          </div>
        </div>

        {/* Tabs: Tutors / Students */}
        <div className="inline-flex items-center gap-1 rounded-full bg-white/80 backdrop-blur-md border border-white/40 p-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {([
            { id: "student", label: "Students", icon: User },
            { id: "tutor", label: "Tutors", icon: GraduationCap },
            { id: "admin", label: "Admins", icon: Shield },
          ] as const).map((t) => {
            const active = activeTab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-5 h-10 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#0052FF] text-white shadow-sm"
                    : "text-[#0F172A] hover:bg-slate-100",
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>


        {/* Faceted filter bar */}
        <Card className="p-4 rounded-3xl border-slate-200 shadow-sm bg-white space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name, phone, or form…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 rounded-full"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={standardFilter} onValueChange={setStandardFilter}>
                <SelectTrigger className="rounded-full w-[140px]"><SelectValue placeholder="Standard" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All standards</SelectItem>
                  {FORM_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger className="rounded-full w-[160px]"><SelectValue placeholder="Subject" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subjects</SelectItem>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="rounded-full w-[200px]"><SelectValue placeholder="Enrolled class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.cohort_label || c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeFilterCount > 0 && (
                <Button variant="ghost" onClick={clearFilters} className="rounded-full text-slate-500">
                  <X className="w-4 h-4 mr-1" /> Clear
                </Button>
              )}
            </div>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <Filter className="w-3.5 h-3.5" />
            Showing <span className="font-semibold text-slate-700">{filteredUsers.length}</span> of {users.length} users
          </div>
        </Card>

        {/* Users table */}
        <Card className="rounded-3xl border-slate-200 shadow-sm bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead>Name</TableHead>
                  <TableHead>Form/Year</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden lg:table-cell">Scope</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-500">Loading users…</TableCell></TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-slate-500">
                        <User className="w-10 h-10 text-slate-300" />
                        <p className="font-medium">No users match your filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.map((user) => {
                  const tutor = tutors.find((t) => t.user_id === user.user_id);
                  const tutorAssignments = tutor ? assignments.filter((a) => a.tutor_id === tutor.id) : [];
                  const studentEnrollments = enrollments.filter((e) => e.student_id === user.id && e.class_id);

                  return (
                    <TableRow key={user.id} className="hover:bg-slate-50/60">
                      <TableCell className="font-medium text-slate-900">{user.full_name}</TableCell>
                      <TableCell className="text-slate-600">{user.form_year || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-slate-600">{user.phone || "—"}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-auto p-0" disabled={updatingRoleId === user.user_id}>
                              <Badge
                                variant={user.role === "admin" ? "default" : "secondary"}
                                className="gap-1 rounded-full cursor-pointer"
                              >
                                {user.role === "admin" || user.role === "superadmin" ? <Shield className="w-3 h-3" />
                                  : user.role === "tutor" ? <GraduationCap className="w-3 h-3" />
                                  : <User className="w-3 h-3" />}
                                {updatingRoleId === user.user_id ? "…" : user.role}
                                <ChevronDown className="w-3 h-3 ml-1" />
                              </Badge>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => updateUserRole(user.user_id, "student")} className="gap-2">
                              <User className="w-4 h-4" /> Student
                              {user.role === "student" && <span className="ml-auto">✓</span>}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateUserRole(user.user_id, "tutor")} className="gap-2">
                              <GraduationCap className="w-4 h-4" /> Tutor
                              {user.role === "tutor" && <span className="ml-auto">✓</span>}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateUserRole(user.user_id, "admin")} className="gap-2">
                              <Shield className="w-4 h-4" /> Admin
                              {user.role === "admin" && <span className="ml-auto">✓</span>}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-slate-500">
                        {user.role === "tutor"
                          ? `${tutorAssignments.length} assignment${tutorAssignments.length === 1 ? "" : "s"}`
                          : user.role === "student"
                          ? `${studentEnrollments.length} enrolled class${studentEnrollments.length === 1 ? "" : "es"}`
                          : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-slate-600">
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {(user.role === "tutor" || user.role === "student") && (
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setAssignUser(user)}
                              className="rounded-full"
                              title={user.role === "tutor" ? "Manage subjects" : "Manage enrollments"}
                            >
                              <Settings2 className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="sm" className="rounded-full"
                            onClick={() => { setEditingUser(user); setIsEditOpen(true); }}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editingUser?.full_name || ""}
                onChange={(e) => setEditingUser((p) => p ? { ...p, full_name: e.target.value } : null)} />
            </div>
            <div className="space-y-2">
              <Label>Form/Year</Label>
              <Select value={editingUser?.form_year || ""}
                onValueChange={(v) => setEditingUser((p) => p ? { ...p, form_year: v } : null)}>
                <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
                <SelectContent>
                  {FORM_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={editingUser?.phone || ""}
                onChange={(e) => setEditingUser((p) => p ? { ...p, phone: e.target.value } : null)} />
            </div>
            <Button onClick={updateUser} className="w-full rounded-full">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assignment / Enrollment Modal */}
      <AssignmentDialog
        user={assignUser}
        onClose={() => setAssignUser(null)}
        subjects={subjects}
        standards={standards}
        classes={classes}
        tutors={tutors}
        assignments={assignments}
        enrollments={enrollments}
        setAssignments={setAssignments}
        setEnrollments={setEnrollments}
      />

      {/* Invite user modal */}
      <InviteUserModal open={inviteOpen} onClose={() => { setInviteOpen(false); fetchAll(); }} />
    </div>
  );
}

// ------------------ Assignment Dialog ------------------
function AssignmentDialog({
  user, onClose, subjects, standards, classes, tutors,
  assignments, enrollments, setAssignments, setEnrollments,
}: {
  user: UserProfile | null;
  onClose: () => void;
  subjects: Subject[];
  standards: Standard[];
  classes: ClassInstance[];
  tutors: { id: string; user_id: string }[];
  assignments: TutorAssignment[];
  enrollments: Enrollment[];
  setAssignments: React.Dispatch<React.SetStateAction<TutorAssignment[]>>;
  setEnrollments: React.Dispatch<React.SetStateAction<Enrollment[]>>;
}) {
  const { toast } = useToast();
  const [newSubject, setNewSubject] = useState("");
  const [newStandard, setNewStandard] = useState("__any");
  const [newClass, setNewClass] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) { setNewSubject(""); setNewStandard("__any"); setNewClass(""); }
  }, [user?.id]);

  if (!user) return null;
  const isTutor = user.role === "tutor";
  const tutor = tutors.find((t) => t.user_id === user.user_id);

  const tutorRows = tutor ? assignments.filter((a) => a.tutor_id === tutor.id) : [];
  const studentRows = enrollments.filter((e) => e.student_id === user.id && e.class_id);

  const addTutorAssignment = async () => {
    if (!tutor || !newSubject) return;
    const optimistic: TutorAssignment = {
      id: `tmp-${Date.now()}`, tutor_id: tutor.id,
      subject_id: newSubject, standard_id: newStandard === "__any" ? null : newStandard,
    };
    setAssignments((p) => [...p, optimistic]);
    const { data, error } = await (supabase as any).from("tutor_assignments").insert({
      tutor_id: tutor.id, subject_id: newSubject,
      standard_id: newStandard === "__any" ? null : newStandard,
    }).select().single();
    if (error) {
      setAssignments((p) => p.filter((a) => a.id !== optimistic.id));
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setAssignments((p) => p.map((a) => a.id === optimistic.id ? data : a));
    setNewSubject(""); setNewStandard("__any");
    toast({ title: "✅ Assigned" });
  };

  const removeTutorAssignment = async (id: string) => {
    const prev = assignments;
    setAssignments((p) => p.filter((a) => a.id !== id));
    const { error } = await (supabase as any).from("tutor_assignments").delete().eq("id", id);
    if (error) { setAssignments(prev); toast({ title: "Failed", description: error.message, variant: "destructive" }); }
  };

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const addEnrollment = async () => {
    if (!newClass || isSubmitting) return;
    // CRITICAL: enrollments.student_id references profiles.id (NOT auth.users.id).
    // Validate before we even touch the network so the FK can never trip.
    const profileId = user.id;
    if (!profileId || !UUID_RE.test(profileId)) {
      toast({
        title: "Invalid user profile",
        description: "This user has no valid profile ID. Refresh and try again.",
        variant: "destructive",
      });
      return;
    }
    if (!UUID_RE.test(newClass)) {
      toast({ title: "Invalid class", description: "Pick a valid class to enroll.", variant: "destructive" });
      return;
    }
    const klass = classes.find((c) => c.id === newClass);
    const optimistic: Enrollment = {
      id: `tmp-${Date.now()}`, student_id: profileId,
      class_id: newClass, subject_id: klass?.subject_id || null,
    };

    setIsSubmitting(true);
    setEnrollments((p) => [...p, optimistic]);

    try {
      const { data, error } = await (supabase as any).from("enrollments").insert({
        student_id: profileId,
        class_id: newClass,
        subject_id: klass?.subject_id || null,
        is_active: true,
      }).select().single();

      if (error) throw error;

      // Reconcile optimistic row with DB row; keep modal open on success too so
      // the admin can queue additional enrollments in one sitting.
      setEnrollments((p) => p.map((e) => e.id === optimistic.id ? data : e));
      setNewClass("");
      toast({ title: "✅ Enrolled" });
    } catch (err: any) {
      // Rollback: remove ONLY the optimistic row we added; leave the rest of
      // the grid untouched so it continues to mirror the database.
      setEnrollments((p) => p.filter((e) => e.id !== optimistic.id));

      const isDuplicateEnrollment =
        err?.code === '23505' ||
        (typeof err?.message === 'string' && err.message.includes('enrollments_student_id_class_id_key')) ||
        (typeof err?.details === 'string' && err.details.includes('enrollments_student_id_class_id_key'));

      toast({
        title: "Enrollment failed",
        description: isDuplicateEnrollment
          ? "Student is already enrolled in this class instance."
          : "Failed to enroll student. Please try again.",
        variant: "destructive",
      });
      // Do NOT call onClose(): the modal must stay open so the admin can pick
      // another time slot without losing their selection context.
    } finally {
      setIsSubmitting(false);
    }
  };


  const removeEnrollment = async (id: string) => {
    const prev = enrollments;
    setEnrollments((p) => p.filter((e) => e.id !== id));
    const { error } = await (supabase as any).from("enrollments").delete().eq("id", id);
    if (error) { setEnrollments(prev); toast({ title: "Failed", description: error.message, variant: "destructive" }); }
  };

  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name || "Unknown";
  const standardName = (id: string | null) => id ? (standards.find((s) => s.id === id)?.name || "All standards") : "All standards";
  const classLabel = (id: string | null) => {
    const c = classes.find((cc) => cc.id === id); return c?.cohort_label || c?.title || "Class";
  };

  return (
    <Dialog open={!!user} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-3xl max-w-xl bg-white/95 backdrop-blur-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isTutor ? <GraduationCap className="w-5 h-5 text-primary" /> : <User className="w-5 h-5 text-primary" />}
            {isTutor ? "Tutor Assignments" : "Class Enrollments"}
          </DialogTitle>
          <DialogDescription>
            {isTutor
              ? `Choose the subjects and standards ${user.full_name} is authorized to teach.`
              : `Choose the class instances ${user.full_name} is enrolled in.`}
          </DialogDescription>
        </DialogHeader>

        {isTutor && !tutor ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Promoting this user to Tutor is still syncing. Please reopen this dialog in a moment.
          </p>
        ) : isTutor ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={newSubject} onValueChange={setNewSubject}>
                <SelectTrigger className="rounded-full flex-1"><SelectValue placeholder="Subject" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={newStandard} onValueChange={setNewStandard}>
                <SelectTrigger className="rounded-full w-full sm:w-44"><SelectValue placeholder="Standard" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">Any standard</SelectItem>
                  {standards.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={addTutorAssignment} disabled={!newSubject} className="rounded-full">
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {tutorRows.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">No assignments yet.</p>
              ) : tutorRows.map((a) => (
                <div key={a.id} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-2.5">
                  <div className="text-sm">
                    <span className="font-semibold text-slate-900">{subjectName(a.subject_id)}</span>
                    <span className="text-slate-500"> · {standardName(a.standard_id)}</span>
                  </div>
                  <button onClick={() => removeTutorAssignment(a.id)}
                    className="text-slate-400 hover:text-destructive p-1.5 rounded-full hover:bg-destructive/10">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={newClass} onValueChange={setNewClass}>
                <SelectTrigger className="rounded-full flex-1"><SelectValue placeholder="Class instance" /></SelectTrigger>
                <SelectContent>
                  {classes
                    .filter((c) => !studentRows.some((e) => e.class_id === c.id))
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.cohort_label || c.title}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                onClick={addEnrollment}
                disabled={!newClass || isSubmitting}
                aria-busy={isSubmitting}
                className={`rounded-full ${isSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Enrolling…</>
                ) : (
                  <><Plus className="w-4 h-4 mr-1" /> Enroll</>
                )}
              </Button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {studentRows.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">Not enrolled in any class instance yet.</p>
              ) : studentRows.map((e) => (
                <div key={e.id} className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-2.5">
                  <div className="text-sm font-medium text-slate-900 truncate">{classLabel(e.class_id)}</div>
                  <button onClick={() => removeEnrollment(e.id)}
                    className="text-slate-400 hover:text-destructive p-1.5 rounded-full hover:bg-destructive/10 shrink-0 ml-2">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-full">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
