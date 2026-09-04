// Tenant-admin fallback: manually confirm an existing user's sign-in email.
//
// This ONLY touches the Auth account's email confirmation. It never creates an
// account, never regenerates or resends an invitation, and never changes the
// normal self-service verification flow.
//
// Authorisation is resolved entirely server-side by
// public.admin_authorize_email_verification(), called with the CALLER's JWT so
// RLS/role checks apply. The privileged Auth Admin call only runs after that
// check passes.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Map backend failures onto stable, non-leaking client codes. */
function classify(message: string): { code: string; status: number } {
  const m = message.toLowerCase();
  if (m.includes("already verified")) return { code: "already_verified", status: 409 };
  if (m.includes("account not found")) return { code: "not_found", status: 404 };
  if (m.includes("not authorised") || m.includes("not authenticated") || m.includes("permission")) {
    return { code: "forbidden", status: 403 };
  }
  return { code: "failed", status: 500 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "failed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ code: "forbidden" }, 403);

  let invitationId: unknown;
  try {
    invitationId = (await req.json())?.invitationId;
  } catch {
    return json({ code: "failed" }, 400);
  }
  if (!isUuid(invitationId)) return json({ code: "failed" }, 400);

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await caller.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) return json({ code: "forbidden" }, 403);
  const actorUserId = claimsData.claims.sub as string;

  // 1. Trusted authorisation + eligibility, evaluated as the caller.
  const { data: authorized, error: authzError } = await caller.rpc(
    "admin_authorize_email_verification",
    { _invitation_id: invitationId },
  );
  if (authzError) {
    const { code, status } = classify(authzError.message ?? "");
    console.error(`admin-verify-user-email authz refused [${code}]: ${authzError.message}`);
    return json({ code }, status);
  }

  const target = authorized as {
    user_id?: string;
    email?: string;
    center_id?: string;
    role?: string;
  } | null;
  if (!target?.user_id || !target.center_id) return json({ code: "not_found" }, 404);

  // 2. Supported Auth Admin API — marks the existing account's email confirmed.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: updateError } = await admin.auth.admin.updateUserById(target.user_id, {
    email_confirm: true,
  });
  if (updateError) {
    console.error(`admin-verify-user-email admin update failed: ${updateError.message}`);
    return json({ code: "failed" }, 500);
  }

  // 3. Audit trail. No tokens, links or secrets are recorded.
  const { error: auditError } = await admin.from("admin_audit_log").insert({
    admin_id: actorUserId,
    action: "tenant_admin_verified_user_email",
    entity_type: "auth_user",
    entity_id: target.user_id,
    metadata: {
      target_user_id: target.user_id,
      target_email: target.email ?? null,
      target_role: target.role ?? null,
      center_id: target.center_id,
      invitation_id: invitationId,
      verified_via: "tenant_admin_manual",
    },
  });
  if (auditError) {
    // The verification itself succeeded; never fail the operator's action here.
    console.error(`admin-verify-user-email audit insert failed: ${auditError.message}`);
  }

  return json({ verified: true, email: target.email ?? null });
});
