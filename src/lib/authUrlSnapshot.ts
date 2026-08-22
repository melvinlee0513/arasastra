/**
 * Snapshot of the URL as the browser first delivered it.
 *
 * `@supabase/supabase-js` runs with `detectSessionInUrl` enabled, so when an
 * auth link lands on the app with tokens in the hash fragment the client
 * consumes them and rewrites the URL to a bare `#` before React mounts. The
 * password-recovery screen therefore lost all evidence of the recovery link and
 * fell back to the "enter your email" state.
 *
 * This module is imported before the Supabase client is created, capturing the
 * original `search` and `hash` for later inspection.
 */
const initialSearch = typeof window !== "undefined" ? window.location.search : "";
const initialHash = typeof window !== "undefined" ? window.location.hash : "";

export function initialUrlSearchParams(): URLSearchParams {
  return new URLSearchParams(initialSearch);
}

export function initialUrlHashParams(): URLSearchParams {
  return new URLSearchParams(initialHash.replace(/^#/, ""));
}
