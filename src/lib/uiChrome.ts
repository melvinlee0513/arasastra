import { useEffect, useSyncExternalStore } from "react";

/**
 * Tiny global store for app-chrome suppression.
 *
 * Mobile overlays (e.g. the Edit Profile bottom sheet) need the floating
 * student tab bar out of the way, otherwise its fixed pill covers the sheet's
 * action footer. Reference-counted so nested/concurrent overlays are safe.
 */
let hideCount = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return hideCount > 0;
}

/** True while at least one overlay requested chrome suppression. */
export function useBottomNavHidden(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Suppress the floating bottom nav while `active` is true. */
export function useHideBottomNav(active: boolean) {
  useEffect(() => {
    if (!active) return;
    hideCount += 1;
    emit();
    return () => {
      hideCount = Math.max(0, hideCount - 1);
      emit();
    };
  }, [active]);
}
