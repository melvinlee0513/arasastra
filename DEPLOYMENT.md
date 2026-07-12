# Aras A+ — External Frontend Deployment Guide

Lovable Cloud hosting only permits one primary domain per project and forces
all other connected domains to redirect to it. That is incompatible with
Aras A+'s multi-tenant model where `srisarjana.arasaplus.info` and future
`*.arasaplus.info` hosts must each keep their own hostname so the React
tenant resolver can read `window.location.hostname`.

Target architecture:

- **Lovable** — development & preview (unchanged)
- **GitHub** — source of truth (bi-directionally synced by Lovable)
- **External host (Vercel / Netlify / Cloudflare Pages)** — production frontend
- **Supabase (Lovable Cloud)** — database, Auth, Storage, RLS, Edge Functions (unchanged)

One production deployment serves every hostname:
- `arasaplus.info`, `www.arasaplus.info` (HQ)
- `srisarjana.arasaplus.info` (tenant)
- future `*.arasaplus.info` tenant hosts

## 1. Environment variables (public)

All `VITE_*` values are inlined at build time and safe to expose. Copy from
your Lovable project's `.env` (Project Settings → Environment) into the
external host's environment settings:

| Variable                        | Purpose                          |
| ------------------------------- | -------------------------------- |
| `VITE_SUPABASE_URL`             | Supabase project URL             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key (RLS-guarded)  |
| `VITE_SUPABASE_PROJECT_ID`      | Supabase project reference       |

Never add `SUPABASE_SERVICE_ROLE_KEY` to the frontend build.

## 2. Build settings

- Build command: `npm run build`
- Output directory: `dist`
- Node version: 18 or 20
- Install command: `npm ci` (or `bun install`)

## 3. SPA rewrite (already in this repo)

Deep-link refresh (`/auth`, `/invite`, `/dashboard`, `/admin`,
`/tutor/classes/:id`, `/dashboard/classes/:id`) requires a rewrite to
`index.html`. Do NOT use a 301/302 redirect — a rewrite preserves the URL
so React Router can handle it.

- **Netlify / Cloudflare Pages** — `public/_redirects` ships `/* /index.html 200`.
- **Vercel** — `vercel.json` ships the equivalent rewrite rule.

Critically, do NOT configure the host to redirect all domains to a single
canonical host. Every tenant subdomain must serve its own hostname.

## 4. DNS

Create these DNS records at the domain registrar and point them at the
external host as its docs specify:

- `arasaplus.info` — A / ALIAS (HQ apex)
- `www.arasaplus.info` — CNAME (HQ www)
- `srisarjana.arasaplus.info` — CNAME (first tenant)
- `*.arasaplus.info` — wildcard CNAME once tenant self-provisioning is enabled

On the host: add every hostname above to the same project so they all serve
the same build.

## 5. Supabase Auth redirect allow-list

In the Supabase dashboard (Authentication → URL Configuration) add:

- Site URL: `https://arasaplus.info`
- Additional Redirect URLs:
  - `https://arasaplus.info/*`
  - `https://www.arasaplus.info/*`
  - `https://*.arasaplus.info/*`

If wildcards are rejected, add each tenant explicitly, e.g.:

- `https://srisarjana.arasaplus.info/*`

## 6. Migration checklist

1. Sync the Lovable project with GitHub (Lovable → Git → Connect).
2. Import the repository into the external host.
3. Set build command `npm run build` and output directory `dist`.
4. Add the three `VITE_SUPABASE_*` environment variables.
5. Connect `arasaplus.info` and `www.arasaplus.info` to the host.
6. Connect `srisarjana.arasaplus.info` to the same host project.
7. Add wildcard `*.arasaplus.info` once tenant onboarding scales.
8. Verify SSL certificates provision for every hostname.
9. Update Supabase Auth redirect URLs (section 5).
10. Test: HQ login, tenant login on `srisarjana.arasaplus.info`, invite redemption, deep-link refresh.
11. In Lovable → Project Settings → Domains, **disconnect** every custom
    domain so Lovable stops serving/redirecting them. Keep the
    `*.lovable.app` preview for development only.

## 7. Post-deploy validation

- `arasaplus.info/auth` resolves as HQ.
- `srisarjana.arasaplus.info/auth` stays on the tenant hostname (no redirect to HQ).
- Wrong credentials show an inline error and stay on the same URL.
- Refresh on `/admin`, `/dashboard`, `/invite?token=...` returns the SPA (not 404).
- Tenant session survives a hard refresh on the tenant hostname.
- No tenant-scoped data renders before tenant resolution completes
  (verify with a slow-3G throttle).

## 8. What is NOT changed by this migration

- Database schema, RLS policies, RPCs, Edge Functions, and Storage buckets
  all remain on Supabase and are untouched.
- Tenant resolution logic (`resolve_tenant_by_subdomain`,
  `get_signin_redirect_for_email`, `get_invite_redirect`,
  `src/lib/tenantSubdomain.ts`, `TenantContext`) is unchanged — it already
  uses exact HQ hostname comparison and reads `window.location.hostname`.
