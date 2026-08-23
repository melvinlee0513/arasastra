import { useEffect } from "react";

/**
 * Minimal document-head manager for route-level SEO.
 *
 * The project has no head library, so this hook updates the title, meta
 * description and canonical link on mount and restores the previous title on
 * unmount.
 */
export function usePageMeta({
  title,
  description,
  canonicalPath,
}: {
  title: string;
  description?: string;
  canonicalPath?: string;
}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let descEl: HTMLMetaElement | null = null;
    let previousDesc: string | null = null;
    if (description) {
      descEl = document.querySelector('meta[name="description"]');
      if (descEl) {
        previousDesc = descEl.getAttribute("content");
        descEl.setAttribute("content", description);
      }
    }

    let canonicalEl: HTMLLinkElement | null = null;
    let previousCanonical: string | null = null;
    let createdCanonical = false;
    if (canonicalPath) {
      canonicalEl = document.querySelector('link[rel="canonical"]');
      if (!canonicalEl) {
        canonicalEl = document.createElement("link");
        canonicalEl.rel = "canonical";
        document.head.appendChild(canonicalEl);
        createdCanonical = true;
      } else {
        previousCanonical = canonicalEl.getAttribute("href");
      }
      canonicalEl.setAttribute("href", `${window.location.origin}${canonicalPath}`);
    }

    return () => {
      document.title = previousTitle;
      if (descEl && previousDesc !== null) descEl.setAttribute("content", previousDesc);
      if (canonicalEl) {
        if (createdCanonical) canonicalEl.remove();
        else if (previousCanonical !== null) canonicalEl.setAttribute("href", previousCanonical);
      }
    };
  }, [title, description, canonicalPath]);
}
