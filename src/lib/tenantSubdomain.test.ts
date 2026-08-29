import { describe, it, expect } from "vitest";
import { getTenantSubdomain, isHQHostname, ROOT_DOMAIN } from "./tenantSubdomain";

/**
 * Hostname → tenant-slug matrix.
 *
 * This is the first step of tenant resolution and the only part of it that is
 * pure, so it is pinned here: a regression would silently send a tenant host
 * down the HQ path (or vice versa).
 */
describe("getTenantSubdomain", () => {
  it("resolves a tenant subdomain to its slug", () => {
    expect(getTenantSubdomain("srisarjana.arasaplus.info")).toEqual({
      slug: "srisarjana",
      isApex: false,
      isPreview: false,
    });
  });

  it("is case-insensitive and trims", () => {
    expect(getTenantSubdomain("  SriSarjana.ArasAplus.info  ").slug).toBe("srisarjana");
  });

  it.each([ROOT_DOMAIN, `www.${ROOT_DOMAIN}`])("treats %s as HQ apex", (host) => {
    expect(getTenantSubdomain(host)).toEqual({
      slug: null,
      isApex: true,
      isPreview: false,
    });
    expect(isHQHostname(host)).toBe(true);
  });

  it.each(["localhost", "app.localhost", "127.0.0.1", "x.lovable.app", "y.lovable.dev"])(
    "treats %s as a preview host, never a tenant",
    (host) => {
      const info = getTenantSubdomain(host);
      expect(info.slug).toBeNull();
      expect(info.isPreview).toBe(true);
      // Preview hosts are apex-like but must NOT be reported as HQ.
      expect(isHQHostname(host)).toBe(false);
    },
  );

  it("never treats a reserved label as a tenant slug", () => {
    for (const reserved of ["www", "app", "admin", "api", "auth", "dashboard", "superadmin"]) {
      expect(getTenantSubdomain(`${reserved}.${ROOT_DOMAIN}`).slug).toBeNull();
    }
  });

  it("rejects multi-label subdomains", () => {
    expect(getTenantSubdomain(`a.b.${ROOT_DOMAIN}`).slug).toBeNull();
  });

  it("treats an unknown host as apex rather than a tenant", () => {
    expect(getTenantSubdomain("aras-a-plus.vercel.app").slug).toBeNull();
    expect(getTenantSubdomain("").isApex).toBe(true);
  });

  it("still returns a slug for an unrecognised centre (existence is the backend's call)", () => {
    // Parsing must not pre-judge whether the tenant exists — that is decided
    // by resolve_tenant_by_subdomain, not by the client.
    expect(getTenantSubdomain(`unknown.${ROOT_DOMAIN}`).slug).toBe("unknown");
  });
});
