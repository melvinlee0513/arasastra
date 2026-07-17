// Permanently deletes a user account. Enforces role + centre matrix server-side
// and orchestrates public-schema cleanup + storage + auth.users deletion.
//
// Job status semantics (public.user_deletion_jobs.status):
//   processing              — cleanup in progress
//   pending_storage_cleanup — access revoked; personal-storage cleanup not
//                             yet fully drained (safe for superadmin retry)
//   completed               — all mandatory cleanup finished; safe to report
//                             "permanently deleted" to the operator
//   failed                  — permission or auth-layer failure
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function hashEmail(email: string | null | undefined) {
  if (!email) return null;
  const enc = new TextEncoder().encode(email.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Mandatory personal-storage buckets. Every prefix listed here must be fully
// drained (list-then-remove until list returns empty) before the deletion
// job can be marked `completed`. Anything else is centre-owned and stays.
type StoragePrefix = { bucket: string; prefix: string };
type CleanupSummary = { drained: string[]; pending: { bucket: string; remaining: number; error?: string }[] };

async function drainStoragePrefixes(
  admin: SupabaseClient,
  prefixes: StoragePrefix[],
): Promise<CleanupSummary> {
  const drained: string[] = [];
  const pending: CleanupSummary["pending"] = [];

  for (const { bucket, prefix } of prefixes) {
    if (!bucket || !prefix) continue;
    let remaining = 0;
    let lastError: string | undefined;
    try {
      // Recursively list and delete in pages so folders with many files complete.
      for (let page = 0; page < 20; page++) {
        const { data, error } = await admin.storage.from(bucket).list(prefix, {
          limit: 100,
          offset: 0,
        });
        if (error) { lastError = error.message; break; }
        if (!data || data.length === 0) break;
        const paths: string[] = [];
        for (const entry of data) {
          if (!entry?.name) continue;
          // If it's a folder (no id/metadata), recurse one level.
          if (!entry.id) {
            const sub = await admin.storage.from(bucket).list(`${prefix}/${entry.name}`, { limit: 100 });
            for (const child of sub.data ?? []) {
              if (child?.name) paths.push(`${prefix}/${entry.name}/${child.name}`);
            }
          } else {
            paths.push(`${prefix}/${entry.name}`);
          }
        }
        if (paths.length === 0) break;
        const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
        if (rmErr) { lastError = rmErr.message; break; }
      }
      // Verify empty.
      const check = await admin.storage.from(bucket).list(prefix, { limit: 1 });
      remaining = check.data?.length ?? 0;
      if (check.error) lastError = check.error.message;
    } catch (err) {
      lastError = (err as Error)?.message ?? "list_or_remove_failed";
    }

    if (remaining === 0 && !lastError) {
      drained.push(`${bucket}:${prefix}`);
    } else {
      pending.push({ bucket, remaining, error: lastError });
    }
  }
  return { drained, pending };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.slice("Bearer ".length);
  const { data: claimsData, error: claimsError } = await caller.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const callerId = claimsData.claims.sub as string;

  let payload: { target_user_id?: unknown; confirm_email?: unknown; retry_job_id?: unknown };
  try { payload = await req.json(); } catch { return json({ error: "invalid_body" }, 400); }
  const targetId = payload.target_user_id;
  const retryJobId = typeof payload.retry_job_id === "string" && isUuid(payload.retry_job_id)
    ? payload.retry_job_id : null;
  const confirmEmail = typeof payload.confirm_email === "string" ? payload.confirm_email.trim().toLowerCase() : "";
  if (!isUuid(targetId)) return json({ error: "invalid_target" }, 400);
  if (targetId === callerId) return json({ error: "cannot_delete_self" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Verify caller privileges up front (retry path also needs authorisation).
  const { data: callerRoles } = await admin
    .from("user_roles").select("role").eq("user_id", callerId);
  const callerRoleSet = new Set((callerRoles ?? []).map((r) => r.role));
  const callerIsSuper = callerRoleSet.has("superadmin");
  const callerIsAdmin = callerRoleSet.has("admin") || callerIsSuper;
  if (!callerIsAdmin) return json({ error: "not_authorised" }, 403);

  // -------- RETRY BRANCH --------
  // Superadmin can resume storage cleanup even after auth.users / profiles
  // are gone. Uses the protected job row's stored target_user_id + prefixes.
  if (retryJobId) {
    if (!callerIsSuper) return json({ error: "not_authorised" }, 403);
    const { data: jobRow, error: jobErr } = await admin
      .from("user_deletion_jobs").select("*").eq("id", retryJobId).maybeSingle();
    if (jobErr || !jobRow) return json({ error: "invalid_target" }, 404);
    if (jobRow.status === "completed") return json({ ok: true, status: "completed", job_id: jobRow.id });

    // Rebuild the mandatory prefixes from the stored identifiers.
    const prefixes: StoragePrefix[] = [
      { bucket: "avatars", prefix: jobRow.target_center_id
          ? `${jobRow.target_center_id}/${jobRow.target_user_id}`
          : jobRow.target_user_id },
      { bucket: "homework",         prefix: jobRow.target_user_id },
      { bucket: "submissions",      prefix: jobRow.target_user_id },
      { bucket: "payment-receipts", prefix: jobRow.target_user_id },
    ];
    await admin.from("user_deletion_jobs").update({
      status: "processing", current_step: "storage_cleanup_retry",
      retry_count: (jobRow.retry_count ?? 0) + 1,
    }).eq("id", jobRow.id);

    const summary = await drainStoragePrefixes(admin, prefixes);
    if (summary.pending.length === 0) {
      await admin.from("user_deletion_jobs").update({
        status: "completed", current_step: "done",
        completed_at: new Date().toISOString(), failure_category: null,
      }).eq("id", jobRow.id);
      return json({ ok: true, status: "completed", job_id: jobRow.id, drained: summary.drained });
    }
    await admin.from("user_deletion_jobs").update({
      status: "pending_storage_cleanup", current_step: "storage_cleanup",
      failure_category: "storage_cleanup_incomplete",
    }).eq("id", jobRow.id);
    return json({
      ok: false, status: "pending_storage_cleanup", job_id: jobRow.id,
      pending: summary.pending,
    }, 202);
  }

  // -------- FRESH DELETION BRANCH --------

  // Look up target profile/email for confirmation + protection.
  const { data: profileRow } = await admin
    .from("profiles").select("user_id, email, center_id, avatar_path")
    .eq("user_id", targetId).maybeSingle();
  const { data: targetAuth } = await admin.auth.admin.getUserById(targetId as string);
  const authEmail = targetAuth?.user?.email ?? null;
  const targetEmail = (profileRow?.email ?? authEmail ?? "").toLowerCase();

  if (!confirmEmail || confirmEmail !== targetEmail) {
    return json({ error: "email_confirmation_mismatch" }, 400);
  }

  // Idempotency: only report already_deleted when there is no outstanding
  // mandatory cleanup. Otherwise return the outstanding job so the caller
  // can retry via the retry_job_id path.
  if (!targetAuth?.user && !profileRow) {
    const { data: outstanding } = await admin
      .from("user_deletion_jobs")
      .select("id, status, target_center_id")
      .eq("target_user_id", targetId as string)
      .in("status", ["pending_storage_cleanup", "failed", "processing"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (outstanding) {
      return json({
        ok: false, status: outstanding.status, job_id: outstanding.id,
        message: "personal_storage_cleanup_incomplete",
      }, 202);
    }
    return json({ ok: true, status: "already_deleted" });
  }

  const { data: targetRoles } = await admin
    .from("user_roles").select("role").eq("user_id", targetId as string);
  const roles = new Set((targetRoles ?? []).map((r) => r.role));
  if (roles.has("superadmin")) return json({ error: "cannot_delete_superadmin" }, 403);

  const email_hash = await hashEmail(targetEmail);
  const { data: jobRow, error: jobErr } = await admin
    .from("user_deletion_jobs")
    .insert({
      target_user_id: targetId as string,
      target_center_id: profileRow?.center_id ?? null,
      target_email_hash: email_hash,
      requested_by: callerId,
      status: "processing",
      current_step: "starting",
    })
    .select("id").single();
  if (jobErr || !jobRow) return json({ error: "job_create_failed" }, 500);
  const jobId = jobRow.id as string;

  const updateJob = async (patch: Record<string, unknown>) => {
    await admin.from("user_deletion_jobs").update(patch).eq("id", jobId);
  };

  try {
    await updateJob({ current_step: "cleanup_rpc" });
    const { data: rpcData, error: rpcErr } = await caller.rpc("admin_delete_user_account", {
      _target: targetId as string,
    });
    if (rpcErr) {
      const msg = (rpcErr.message ?? "").toLowerCase();
      let category = "cleanup_failed";
      let status = 500;
      if (msg.includes("not authorised") || msg.includes("different centre") || msg.includes("only a superadmin")) {
        category = "not_authorised"; status = 403;
      } else if (msg.includes("cannot delete") || msg.includes("superadmin")) {
        category = "protected_target"; status = 403;
      }
      await updateJob({ status: "failed", failure_category: category, current_step: "cleanup_rpc" });
      return json({ error: category }, status);
    }

    const rpcCenter = (rpcData as { target_center_id?: string | null })?.target_center_id ?? null;
    if (rpcCenter && rpcCenter !== profileRow?.center_id) {
      await updateJob({ target_center_id: rpcCenter });
    }

    // Auth delete — removes sessions and refresh tokens. Do this before final
    // storage drain so the access surface is closed even if drain retries.
    await updateJob({ current_step: "auth_delete" });
    const { error: authDelErr } = await admin.auth.admin.deleteUser(targetId as string);
    if (authDelErr) {
      const notFound = (authDelErr.message ?? "").toLowerCase().includes("not found");
      if (!notFound) {
        await updateJob({ status: "failed", failure_category: "auth_delete_failed", current_step: "auth_delete" });
        return json({ error: "auth_delete_failed" }, 500);
      }
    }

    // Mandatory storage cleanup (authoritative, not best-effort).
    await updateJob({ current_step: "storage_cleanup" });
    const rpcPrefixes = Array.isArray((rpcData as { storage_prefixes?: unknown })?.storage_prefixes)
      ? ((rpcData as { storage_prefixes: StoragePrefix[] }).storage_prefixes)
      : [];
    const summary = await drainStoragePrefixes(admin, rpcPrefixes);

    if (summary.pending.length > 0) {
      await updateJob({
        status: "pending_storage_cleanup",
        current_step: "storage_cleanup",
        failure_category: "storage_cleanup_incomplete",
      });
      return json({
        ok: false, status: "pending_storage_cleanup", job_id: jobId,
        message: "Account access was removed, but personal file cleanup is still pending.",
        pending: summary.pending,
      }, 202);
    }

    await updateJob({
      status: "completed", current_step: "done",
      completed_at: new Date().toISOString(), failure_category: null,
    });
    return json({ ok: true, status: "completed", job_id: jobId, drained: summary.drained });
  } catch (err) {
    await updateJob({ status: "failed", failure_category: "unexpected_error" });
    console.error("delete-user-account unexpected", (err as Error)?.message);
    return json({ error: "unexpected_error" }, 500);
  }
});
