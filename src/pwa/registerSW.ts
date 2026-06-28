/**
 * Single, guarded service-worker registrar.
 *
 * Refuses to register in dev, inside iframes, in Lovable preview contexts,
 * or when `?sw=off` is present. In any refused context it actively
 * unregisters any existing `/sw.js` registration so a stale worker from a
 * previous build can't keep serving cached HTML.
 */

const SW_URL = "/sw.js";

function isLovablePreviewHost(hostname: string): boolean {
  return (
    hostname.startsWith("id-preview--") ||
    hostname.startsWith("preview--") ||
    hostname === "lovableproject.com" ||
    hostname.endsWith(".lovableproject.com") ||
    hostname === "lovableproject-dev.com" ||
    hostname.endsWith(".lovableproject-dev.com") ||
    hostname === "beta.lovable.dev" ||
    hostname.endsWith(".beta.lovable.dev")
  );
}

function shouldRefuseRegistration(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  if (window.top !== window.self) return true;
  if (isLovablePreviewHost(window.location.hostname)) return true;
  if (new URLSearchParams(window.location.search).has("sw")) {
    if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  }
  return false;
}

async function unregisterAppServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
          return url.endsWith(SW_URL);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    // swallow — registration cleanup is best-effort
  }
}

function notifyUpdateReady(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pwa:update-ready"));
}

export function registerAppServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  if (shouldRefuseRegistration()) {
    void unregisterAppServiceWorker();
    return;
  }

  // When the active controller changes, the new SW has taken over → notify UI.
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    notifyUpdateReady();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((reg) => {
        // Listen for an updated worker installing
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              // A new version is waiting / activating
              notifyUpdateReady();
            }
          });
        });
        // Poll for updates hourly
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[pwa] service worker registration failed:", err);
      });
  });
}
