/**
 * Central route-aware scroll restoration.
 *
 * One helper for the whole app so no button handler has to call
 * `window.scrollTo` itself.
 *
 *  PUSH / REPLACE (forward navigation)  → destination opens at the top.
 *  POP (browser back/forward)           → previous offset is restored.
 *  Tab / filter state that does not change the route key → untouched.
 *
 * The "route key" is the pathname plus the `folder` query param, because
 * opening a materials folder is a real forward navigation while switching a
 * materials tab is not.
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Offsets remembered per history entry, keyed by React Router's location key. */
const offsets = new Map<string, number>();

function routeKey(pathname: string, search: string): string {
  const folder = new URLSearchParams(search).get("folder") ?? "";
  return `${pathname}?folder=${folder}`;
}

/** Any nested scroll container that should also reset on forward navigation. */
const NESTED_SCROLLERS = "[data-scroll-reset]";

function resetNestedScrollers() {
  document.querySelectorAll<HTMLElement>(NESTED_SCROLLERS).forEach((el) => {
    el.scrollTop = 0;
    el.scrollLeft = 0;
  });
}

export function ScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const lastKey = useRef<string | null>(null);
  const currentHistoryKey = useRef<string>(location.key);

  // Remember where each history entry was left so POP can restore it.
  useEffect(() => {
    currentHistoryKey.current = location.key;
    const onScroll = () => {
      offsets.set(currentHistoryKey.current, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      offsets.set(currentHistoryKey.current, window.scrollY);
      window.removeEventListener("scroll", onScroll);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    const key = routeKey(location.pathname, location.search);
    const changed = lastKey.current !== key;
    lastKey.current = key;

    if (navigationType === "POP") {
      const saved = offsets.get(location.key);
      window.scrollTo({ top: saved ?? 0, left: 0, behavior: "auto" });
      return;
    }

    // Forward navigation only — never on a plain re-render or a tab switch.
    if (changed) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      resetNestedScrollers();
    }
  }, [location.pathname, location.search, location.key, navigationType]);

  return null;
}

export default ScrollRestoration;
