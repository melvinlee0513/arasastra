// Permanently deletes a user account. Enforces role + centre matrix server-side
// and orchestrates public-schema cleanup + storage + auth.users deletion.
import { createClient } from "npm:@supabase/supabase-js@2";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  // Verify caller via anon client bound to the caller's JWT.
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.slice("Bearer ".length);
  const { data: claimsData, error: claimsError } = await caller.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const callerId = claimsData.claims.sub as string;

  let payload: { target_user_id?: unknown; confirm_email?: unknown };
  try { payload = await req.json(); } catch { return json({ error: "invalid_body" }, 400); }
  const targetId = payload.target_user_id;
  const confirmEmail = typeof payload.confirm_email === "string" ? payload.confirm_email.trim().toLowerCase() : "";
  if (!isUuid(targetId)) return json({ error: "invalid_target" }, 400);
  if (targetId === callerId) return json({ error: "cannot_delete_self" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Look up target profile/email + protection checks.
  const { data: profileRow } = await admin
    .from("profiles").select("user_id, email, center_id, avatar_path")
    .eq("user_id", targetId).maybeSingle();
  const { data: targetAuth } = await admin.auth.admin.getUserById(targetId);
  const authEmail = targetAuth?.user?.email ?? null;
  const targetEmail = (profileRow?.email ?? authEmail ?? "").toLowerCase();

  if (!confirmEmail || confirmEmail !== targetEmail) {
    return json({ error: "email_confirmation_mismatch" }, 400);
  }

  // Idempotency: if target no longer has an auth row and no profile, treat as done.
  if (!targetAuth?.user && !profileRow) {
    return json({ ok: true, status: "already_deleted" });
  }

  // Superadmin protections re-checked here (RPC also enforces).
  const { data: targetRoles } = await admin
    .from("user_roles").select("role").eq("user_id", targetId);
  const roles = new Set((targetRoles ?? []).map((r) => r.role));
  if (roles.has("superadmin")) {
    return json({ error: "cannot_delete_superadmin" }, 403);
  }

  // Create job row (redacted identifiers only).
  const email_hash = await hashEmail(targetEmail);
  const { data: jobRow, error: jobErr } = await admin
    .from("user_deletion_jobs")
    .insert({
      target_user_id: targetId,
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
    // Invoke RPC using caller-authenticated client so it can re-verify auth.uid()
    // and re-enforce the permission matrix. Cannot elevate via service-role.
    const { data: rpcData, error: rpcErr } = await caller.rpc("admin_delete_user_account", {
      _target: targetId,
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

    const storagePaths = Array.isArray((rpcData as { storage_paths?: unknown })?.storage_paths)
      ? ((rpcData as { storage_paths: Array<{ bucket: string; path: string }> }).storage_paths)
      : [];

    // Storage cleanup — best effort. Failures do not restore access.
    await updateJob({ current_step: "storage_cleanup" });
    const byBucket = new Map<string, string[]>();
    for (const item of storagePaths) {
      if (!item?.bucket || !item?.path) continue;
      const arr = byBucket.get(item.bucket) ?? [];
      arr.push(item.path);
      byBucket.set(item.bucket, arr);
    }
    // Also purge user avatar folder if it exists (defence in depth).
    try {
      const { data: avatarFiles } = await admin.storage.from("avatars").list(targetId, { limit: 100 });
      if (avatarFiles?.length) {
        const paths = avatarFiles.map((f) => `${targetId}/${f.name}`);
        const arr = byBucket.get("avatars") ?? [];
        byBucket.set("avatars", arr.concat(paths));
      }
    } catch { /* ignore */ }

    for (const [bucket, paths] of byBucket) {
      if (!paths.length) continue;
      try { await admin.storage.from(bucket).remove(paths); } catch { /* logged below */ }
    }

    // Revoke sessions before deleting the auth row (defence in depth).
    await updateJob({ current_step: "revoke_sessions" });
    try { await admin.auth.admin.signOut(targetId, "global"); } catch { /* ignore */ }

    // Delete the auth user last. This cascades to remaining CASCADE FKs
    // (profiles, subscriptions, notifications, quiz_results, submissions, etc.)
    // and to auth.sessions / auth.identities.
    await updateJob({ current_step: "auth_delete" });
    const { error: authDelErr } = await admin.auth.admin.deleteUser(targetId);
    if (authDelErr) {
      const notFound = (authDelErr.message ?? "").toLowerCase().includes("not found");
      if (!notFound) {
        await updateJob({ status: "failed", failure_category: "auth_delete_failed", current_step: "auth_delete" });
        return json({ error: "auth_delete_failed" }, 500);
      }
    }

    await updateJob({ status: "completed", current_step: "done", completed_at: new Date().toISOString() });
    return json({ ok: true, status: "completed", job_id: jobId });
  } catch (err) {
    await updateJob({ status: "failed", failure_category: "unexpected_error" });
    console.error("delete-user-account unexpected", (err as Error)?.message);
    return json({ error: "unexpected_error" }, 500);
  }
});
