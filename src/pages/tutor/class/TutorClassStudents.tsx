import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, Search, AlertCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toSafeMessage } from "@/components/common/TenantGate";
import { ClassShell } from "@/components/class/ClassShell";
import { useClassContext } from "@/hooks/useClassContext";
import { bestDisplayName, initialsFor } from "@/lib/profile";

type EnrollmentRow = {
  id: string;
  student_user_id: string;
  status: string;
  enrolled_at: string | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_path: string | null;
};

type RosterRow = EnrollmentRow & { profile: ProfileRow | null };

export function TutorClassStudents() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const [query, setQuery] = useState("");

  const canView = !!ctx.data?.canManage;

  const rosterQ = useQuery({
    queryKey: ["tutor-class-roster", currentTenantId, classId, user?.id],
    enabled: !!classId && !!user && canView,
    staleTime: 30_000,
    queryFn: async (): Promise<RosterRow[]> => {
      const { data: enrolments, error } = await supabase
        .from("class_enrollments")
        .select("id, student_user_id, status, enrolled_at")
        .eq("class_id", classId!)
        .eq("status", "active")
        .order("enrolled_at", { ascending: true });
      if (error) throw error;

      const rows = (enrolments || []) as EnrollmentRow[];
      const ids = Array.from(new Set(rows.map((r) => r.student_user_id).filter(Boolean)));
      let byId = new Map<string, ProfileRow>();
      if (ids.length) {
        // Safe cross-role read: returns display_name/full_name only, no emails.
        const { data: profs, error: pErr } = await supabase.rpc("get_public_profiles", {
          _user_ids: ids,
        });
        if (pErr) throw pErr;
        byId = new Map(
          (profs || []).map((p: ProfileRow) => [p.user_id, p]),
        );
      }
      return rows.map((r) => ({ ...r, profile: byId.get(r.student_user_id) ?? null }));
    },
  });

  const basePath = `/tutor/classes/${classId}`;
  const materialsPath = `${basePath}/resources`;

  const shell = (children: React.ReactNode) => (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role="tutor"
      section="students"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={[
        { label: "Tutor", to: "/tutor" },
        { label: "My Classes", to: "/tutor/classes" },
        { label: ctx.data?.klass?.title || "Class", to: basePath },
        { label: "Students" },
      ]}
    >
      {children}
    </ClassShell>
  );

  if (ctx.isError)
    return shell(<Msg title="Couldn't load this class" body={toSafeMessage(ctx.error, "Please try again.")} />);
  if (!ctx.isLoading && (!ctx.data?.klass || !ctx.data.sameTenant))
    return shell(<Msg title="Class not found" body="This class isn't available for your organisation." />);
  if (!ctx.isLoading && ctx.data && !canView)
    return shell(<Msg title="You're not assigned to this class" body="Only assigned tutors and centre admins can view the roster." />);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = rosterQ.data || [];
    const filtered = q
      ? rows.filter((r) => {
          const name = bestDisplayName(r.profile || {}) || "";
          return name.toLowerCase().includes(q);
        })
      : rows;
    return filtered
      .slice()
      .sort((a, b) =>
        (bestDisplayName(a.profile || {}) || "").localeCompare(
          bestDisplayName(b.profile || {}) || "",
          undefined,
          { sensitivity: "base" },
        ),
      );
  }, [rosterQ.data, query]);

  return shell(
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-2 text-sm text-slate-600 flex-1 min-w-[200px]">
          <Info className="w-4 h-4 text-primary shrink-0" />
          <span>
            View-only roster. Enrolment changes are managed by centre admins from{" "}
            <Link to="/admin/enrollment-matrix" className="text-primary font-medium hover:underline">
              Enrollment Matrix
            </Link>
            .
          </span>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            className="pl-9 rounded-full h-10"
          />
        </div>
      </div>

      {rosterQ.isLoading ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-sm text-slate-500 text-center">
          Loading roster…
        </div>
      ) : rosterQ.isError ? (
        <div className="bg-white rounded-3xl border border-red-200 p-6 shadow-sm">
          <p className="font-semibold text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Couldn't load students
          </p>
          <p className="text-sm text-slate-600 mt-1">
            {toSafeMessage(rosterQ.error, "Please try again.")}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center text-primary">
            <Users />
          </div>
          <h3 className="mt-3 font-semibold text-slate-900">
            {query ? "No students match your search" : "No active enrolments yet"}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {query
              ? "Try a different name."
              : "Centre admins can enrol students from the Enrollment Matrix."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="sm:hidden space-y-2">
            {items.map((r) => {
              const name = bestDisplayName(r.profile || {}) || "Unnamed student";
              return (
                <li
                  key={r.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex items-center gap-3"
                >
                  <Avatar name={name} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{name}</p>
                    <p className="text-xs text-slate-500">
                      Enrolled{" "}
                      {r.enrolled_at
                        ? new Date(r.enrolled_at).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                  <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    Active
                  </Badge>
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Student</th>
                  <th className="text-left py-3 px-4 font-medium">Enrolled</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((r) => {
                  const name = bestDisplayName(r.profile || {}) || "Unnamed student";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={name} />
                          <span className="font-medium text-slate-900">{name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {r.enrolled_at
                          ? new Date(r.enrolled_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          Active
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500 px-1">
            {items.length} student{items.length === 1 ? "" : "s"} shown
          </p>
        </>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
      {initialsFor(name)}
    </div>
  );
}

function Msg({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="text-slate-500 mt-2">{body}</p>
      <Link to="/tutor/classes" className="text-primary font-semibold mt-4 inline-block">
        ← Back to Classes
      </Link>
    </div>
  );
}

export default TutorClassStudents;
