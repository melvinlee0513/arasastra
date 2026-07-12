/**
 * Tenant subdomain resolution helpers.
 *
 * Aras A+ tenants live at https://[slug].arasaplus.info.
 * The apex arasaplus.info (and www.arasaplus.info) is the marketing / global
 * platform surface — no tenant is bound to it.
 */

export const ROOT_DOMAIN = "arasaplus.info";

// Hostnames that should NEVER be treated as a tenant slug.
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "auth",
  "dashboard",
  "superadmin",
  "arasaplus",
  "support",
  "mail",
  "static",
  "assets",
  "cdn",
  "status",
]);

export interface SubdomainInfo {
  /** The resolved tenant slug, or null when we're on the apex/preview. */
  slug: string | null;
  /** True when we're on the apex domain (arasaplus.info / www.arasaplus.info). */
  isApex: boolean;
  /** True when running on localhost / *.lovable.app / *.lovable.dev previews. */
  isPreview: boolean;
}

export function getTenantSubdomain(hostname?: string): SubdomainInfo {
  const host = (hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""))
    .toLowerCase()
    .trim();

  if (!host) return { slug: null, isApex: true, isPreview: false };

  // Local dev + Lovable preview hosts — treat as apex/global.
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovable.dev")
  ) {
    return { slug: null, isApex: true, isPreview: true };
  }

  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) {
    return { slug: null, isApex: true, isPreview: false };
  }

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const candidate = host.slice(0, -1 - ROOT_DOMAIN.length);
    // Only accept a single-label subdomain (no dots)
    if (candidate.includes(".")) return { slug: null, isApex: true, isPreview: false };
    if (RESERVED_SUBDOMAINS.has(candidate)) {
      return { slug: null, isApex: true, isPreview: false };
    }
    return { slug: candidate, isApex: false, isPreview: false };
  }

  // Unknown host (custom domain in the future) — treat as apex.
  return { slug: null, isApex: true, isPreview: false };
}

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/;

export function normalizeSlugInput(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

export function validateSubdomainSlug(slug: string): string | null {
  if (!slug) return "Subdomain is required";
  if (slug.length < 3) return "Subdomain must be at least 3 characters";
  if (slug.length > 50) return "Subdomain must be at most 50 characters";
  if (!SLUG_RE.test(slug)) {
    return "Only lowercase letters, numbers, and hyphens (no leading/trailing hyphen)";
  }
  if (RESERVED_SUBDOMAINS.has(slug)) return "This subdomain is reserved";
  return null;
}

export function tenantUrlFor(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`;
}

/** Absolute URL for a path on the given tenant subdomain. */
export function tenantHrefFor(slug: string, path: string = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `https://${slug}.${ROOT_DOMAIN}${clean}`;
}

/** Absolute URL to the HQ apex domain. */
export function hqHrefFor(path: string = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `https://${ROOT_DOMAIN}${clean}`;
}

/** True when this hostname is the HQ apex (arasaplus.info / www.arasaplus.info). */
export function isHQHostname(hostname?: string): boolean {
  const info = getTenantSubdomain(hostname);
  return info.isApex && !info.isPreview;
}

