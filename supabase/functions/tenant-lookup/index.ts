// Anonymous tenant-discovery endpoint.
// Wraps public.get_signin_redirect_for_email behind per-IP + per-email rate
// limits so anonymous callers cannot enumerate which emails belong to a
// tenant vs. HQ. Responses are intentionally minimal — { destination, slug? }.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// In-memory sliding-window limits. Per-instance only — good enough as a first
// line of defence; move to a shared store (KV/Redis) once a primitive exists.
type Bucket = { count: number; windowStart: number; blockedUntil?: number };
const IP_LIMIT = { max: 20, windowMs: 60_000, blockMs: 10 * 60_000 };   // 20/min/IP → 10 min block
const EMAIL_LIMIT = { max: 5, windowMs: 60_000, blockMs: 15 * 60_000 }; // 5/min/email → 15 min block

const ipBuckets = new Map<string, Bucket>();
const emailBuckets = new Map<string, Bucket>();

function hit(map: Map<string, Bucket>, key: string, limit: typeof IP_LIMIT): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const b = map.get(key) ?? { count: 0, windowStart: now };
  if (b.blockedUntil && now < b.blockedUntil) {
    return { ok: false, retryAfter: Math.ceil((b.blockedUntil - now) / 1000) };
  }
  if (now - b.windowStart > limit.windowMs) {
    b.windowStart = now; b.count = 0; b.blockedUntil = undefined;
  }
  b.count += 1;
  if (b.count > limit.max) {
    b.blockedUntil = now + limit.blockMs;
    map.set(key, b);
    return { ok: false, retryAfter: Math.ceil(limit.blockMs / 1000) };
  }
  map.set(key, b);
  return { ok: true };
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ destination: "hq" }), { status: 200, headers: jsonHeaders });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  const ipCheck = hit(ipBuckets, ip, IP_LIMIT);
  if (!ipCheck.ok) {
    console.warn(`[tenant-lookup] IP rate-limited ${ip}`);
    return new Response(
      JSON.stringify({ destination: "hq", error: "rate_limited" }),
      { status: 429, headers: { ...jsonHeaders, "Retry-After": String(ipCheck.retryAfter ?? 60) } },
    );
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  const email = normalizeEmail(body?.email);
  if (!email) {
    return new Response(JSON.stringify({ destination: "hq" }), { status: 200, headers: jsonHeaders });
  }

  const emailCheck = hit(emailBuckets, email, EMAIL_LIMIT);
  if (!emailCheck.ok) {
    console.warn(`[tenant-lookup] email rate-limited ${email.slice(0, 3)}***`);
    return new Response(
      JSON.stringify({ destination: "hq", error: "rate_limited" }),
      { status: 429, headers: { ...jsonHeaders, "Retry-After": String(emailCheck.retryAfter ?? 60) } },
    );
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("get_signin_redirect_for_email", { _email: email });
    if (error) {
      console.error("[tenant-lookup] rpc error", error.message);
      return new Response(JSON.stringify({ destination: "hq" }), { status: 200, headers: jsonHeaders });
    }
    const row = Array.isArray(data) ? data[0] : data;
    const destination = row?.destination === "tenant" ? "tenant" : "hq";
    const slug = destination === "tenant" ? row?.subdomain_slug ?? null : null;
    return new Response(JSON.stringify({ destination, slug }), { status: 200, headers: jsonHeaders });
  } catch (e) {
    console.error("[tenant-lookup] unexpected", e);
    return new Response(JSON.stringify({ destination: "hq" }), { status: 200, headers: jsonHeaders });
  }
});
