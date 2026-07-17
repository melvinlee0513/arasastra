import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Copy, RotateCw, Ban, Loader2, Mail, AlertCircle, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { showSupabaseError } from "@/lib/supabaseErrors";
import { tenantHrefFor, hqHrefFor } from "@/lib/tenantSubdomain";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Row {
  id: string;
  email: string;
  role: "student" | "tutor" | "admin" | "superadmin";
  status: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  invited_by: string | null;
  invited_by_name: string | null;
  auth_account_created: boolean;
  email_verified: boolean;
  profile_created: boolean;
  role_assigned: boolean;
  accepted_at: string | null;
}

type ComputedStatus =
  | "pending"
  | "account_created"
  | "verified"
  | "expired"
  | "revoked";

function computeStatus(row: Row): ComputedStatus {
  if (row.revoked_at) return "revoked";
  if (row.used_at || row.status === "accepted") {
    if (row.email_verified) return "verified";
    return "account_created";
  }
  if (new Date(row.expires_at).getTime() < Date.now()) return "expired";
  return "pending";
}

const STATUS_META: Record<ComputedStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200" },
  account_created: { label: "Account created", className: "bg-sky-50 text-sky-700 border-sky-200" },
  verified: { label: "Verified", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  expired: { label: "Expired", className: "bg-slate-100 text-slate-600 border-slate-200" },
  revoked: { label: "Revoked", className: "bg-rose-50 text-rose-700 border-rose-200" },
};

export function InvitationsPanel() {
  const { currentTenantId, center } = useTenant();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "student" | "tutor">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ComputedStatus>("all");

  const fetchRows = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await (supabase as any).rpc("list_center_invitations", {
        _center_id: currentTenantId,
      });
      if (error) throw error;
      setRows((data ?? []) as Row[]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load invitations");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const buildLink = useCallback((token: string) => {
    const slug = center?.subdomainSlug ?? null;
    return slug
      ? tenantHrefFor(slug, `/invite?token=${token}`)
      : hqHrefFor(`/invite?token=${token}`);
  }, [center?.subdomainSlug]);

  const copyLink = useCallback(async (row: Row) => {
    setBusyId(row.id);
    try {
      const { data, error } = await (supabase as any).rpc("reveal_invitation_token", {
        _invitation_id: row.id,
      });
      if (error) throw error;
      const token = data?.[0]?.token;
      if (!token) {
        toast.error("This invitation cannot be shared any more. Regenerate the link instead.");
        return;
      }
      const link = buildLink(token);
      await navigator.clipboard.writeText(link);
      toast.success("Invitation link copied", { description: link, duration: 10000 });
    } catch (err) {
      showSupabaseError(err as any, "Could not reveal invitation link");
    } finally {
      setBusyId(null);
    }
  }, [buildLink]);

  const regenerate = useCallback(async (row: Row) => {
    setBusyId(row.id);
    try {
      const { data, error } = await (supabase as any).rpc("regenerate_invitation_token", {
        _invitation_id: row.id,
      });
      if (error) throw error;
      const token = data?.[0]?.token;
      if (!token) throw new Error("No token returned");
      const link = buildLink(token);
      await navigator.clipboard.writeText(link);
      toast.success("New link generated and copied", {
        description: `${link} — the previous link is now invalid.`,
        duration: 12000,
      });
      await fetchRows();
    } catch (err) {
      showSupabaseError(err as any, "Could not regenerate invitation");
    } finally {
      setBusyId(null);
    }
  }, [buildLink, fetchRows]);

  const revoke = useCallback(async (row: Row) => {
    if (!confirm(`Revoke the invitation for ${row.email}? The link will stop working immediately.`)) return;
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.rpc("revoke_invitation", { _invitation_id: row.id });
      if (error) throw error;
      if (!data) {
        toast.error("This invitation cannot be revoked.");
      } else {
        toast.success("Invitation revoked");
        await fetchRows();
      }
    } catch (err) {
      showSupabaseError(err as any, "Could not revoke invitation");
    } finally {
      setBusyId(null);
    }
  }, [fetchRows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      const cs = computeStatus(r);
      if (statusFilter !== "all" && cs !== statusFilter) return false;
      if (q && !r.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, roleFilter, statusFilter]);

  return (
    <Card className="p-4 md:p-5 rounded-3xl border-slate-200 shadow-sm bg-white space-y-4">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-[#0052FF]/10 flex items-center justify-center">
            <Send className="w-5 h-5 text-[#0052FF]" />
          </div>
          <div>
            <div className="text-lg font-semibold text-[#0F172A]">Invitations</div>
            <div className="text-xs text-slate-500">Track, resend or revoke access invitations for this organisation.</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-full w-[220px]"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
            <SelectTrigger className="rounded-full w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="tutor">Tutor</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="rounded-full w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="account_created">Account created</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchRows} className="rounded-full" disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {loading && rows === null ? (
        <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading invitations…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <AlertCircle className="w-8 h-8 text-rose-500" />
          <div className="text-sm text-slate-600 max-w-md">{error}</div>
          <Button onClick={fetchRows} variant="outline" className="rounded-full">Retry</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
          <Mail className="w-8 h-8 text-slate-300" />
          <div className="text-sm text-slate-500">No invitations match these filters.</div>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Invited by</TableHead>
                <TableHead>Redeemed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const cs = computeStatus(row);
                const meta = STATUS_META[cs];
                const canCopy = cs === "pending";
                const canRegen = cs === "pending" || cs === "expired" || cs === "revoked";
                const canRevoke = cs === "pending";
                const busy = busyId === row.id;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-[#0F172A]">{row.email}</TableCell>
                    <TableCell className="capitalize text-slate-600">{row.role}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("rounded-full border", meta.className)}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600 whitespace-nowrap">
                      {format(new Date(row.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-slate-600 whitespace-nowrap">
                      {format(new Date(row.expires_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-slate-600">{row.invited_by_name ?? "—"}</TableCell>
                    <TableCell className="text-slate-600 whitespace-nowrap">
                      {row.accepted_at ? format(new Date(row.accepted_at), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {canCopy && (
                          <Button
                            size="sm" variant="ghost" className="rounded-full"
                            disabled={busy} onClick={() => copyLink(row)}
                            title="Copy invitation link"
                          >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        )}
                        {canRegen && (
                          <Button
                            size="sm" variant="ghost" className="rounded-full"
                            disabled={busy} onClick={() => regenerate(row)}
                            title="Regenerate link (invalidates the previous one)"
                          >
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                          </Button>
                        )}
                        {canRevoke && (
                          <Button
                            size="sm" variant="ghost" className="rounded-full text-rose-600 hover:text-rose-700"
                            disabled={busy} onClick={() => revoke(row)}
                            title="Revoke invitation"
                          >
                            <Ban className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
