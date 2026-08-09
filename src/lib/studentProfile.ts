/**
 * Canonical student profile source for the mobile student surfaces.
 *
 * One query key (`["student-profile", userId]`) is shared by Home's hero, the
 * mobile Profile summary and the Edit Profile sheet, so a display-name or
 * avatar change reflects everywhere without a hard refresh.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface StudentProfileRecord {
  id: string;
  user_id: string;
  full_name: string;
  display_name: string | null;
  bio: string | null;
  avatar_path: string | null;
  avatar_updated_at: string | null;
  center_id: string | null;
  form_year: string | null;
  created_at: string | null;
  home_header_color: string;
}

export const studentProfileKeys = {
  profile: (userId: string | undefined) => ["student-profile", userId ?? null] as const,
};

const SELECT_COLUMNS =
  "id, user_id, full_name, display_name, bio, avatar_path, avatar_updated_at, center_id, form_year, created_at, home_header_color";

export function useStudentProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: studentProfileKeys.profile(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<StudentProfileRecord | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(SELECT_COLUMNS)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as StudentProfileRecord | null) ?? null;
    },
  });
}

/** Invalidate every profile-dependent cache after an identity mutation. */
export function invalidateProfileSurfaces(
  qc: ReturnType<typeof useQueryClient>,
  userId?: string,
) {
  qc.invalidateQueries({ queryKey: studentProfileKeys.profile(userId) });
  qc.invalidateQueries({ queryKey: ["profile-ext"] });
  qc.invalidateQueries({ queryKey: ["avatar-url"] });
  qc.invalidateQueries({ queryKey: ["student-home-leaderboard"] });
  qc.invalidateQueries({ queryKey: ["xp-leaderboard"] });
}

/* ------------------------------- hero colour ------------------------------ */

export type HeroColorKey =
  | "navy"
  | "indigo"
  | "purple"
  | "teal"
  | "emerald"
  | "blue"
  | "coral"
  | "slate";

export interface HeroColorPreset {
  key: HeroColorKey;
  label: string;
  /** Solid, saturated surface. Every preset is dark enough for white text. */
  background: string;
}

/**
 * Curated presets only — each one is a dark/saturated surface so the white
 * foreground text always clears WCAG AA at body sizes. No custom hex input,
 * which keeps unreadable combinations impossible by construction.
 */
export const HERO_COLOR_PRESETS: HeroColorPreset[] = [
  { key: "navy", label: "Navy", background: "#0F172A" },
  { key: "indigo", label: "Indigo", background: "#312E81" },
  { key: "purple", label: "Purple", background: "#4C1D95" },
  { key: "teal", label: "Teal", background: "#115E59" },
  { key: "emerald", label: "Emerald", background: "#065F46" },
  { key: "blue", label: "Blue", background: "#1D4ED8" },
  { key: "coral", label: "Coral", background: "#B91C1C" },
  { key: "slate", label: "Slate", background: "#334155" },
];

export const DEFAULT_HERO_COLOR: HeroColorKey = "navy";

export function heroPresetFor(key: string | null | undefined): HeroColorPreset {
  return (
    HERO_COLOR_PRESETS.find((p) => p.key === key) ??
    HERO_COLOR_PRESETS.find((p) => p.key === DEFAULT_HERO_COLOR)!
  );
}

/** Persist the student's own hero colour. Scoped to auth.uid() by RLS. */
export function useSaveHeroColor() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (key: HeroColorKey) => {
      if (!user?.id) throw new Error("Sign in required.");
      if (!HERO_COLOR_PRESETS.some((p) => p.key === key)) {
        throw new Error("That colour isn't available.");
      }
      const { error } = await supabase
        .from("profiles")
        .update({ home_header_color: key })
        .eq("user_id", user.id);
      if (error) throw error;
      return key;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: studentProfileKeys.profile(user?.id) });
    },
  });
}

/* --------------------------------- naming -------------------------------- */

/** First name derived from display_name, falling back to full_name. */
export function firstNameFrom(p?: {
  display_name?: string | null;
  full_name?: string | null;
} | null): string {
  const source = (p?.display_name?.trim() || p?.full_name?.trim() || "").replace(/\s+/g, " ");
  if (!source) return "Student";
  const first = source.split(" ")[0];
  return first || "Student";
}

/** Local-time aware greeting prefix. */
export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Best label for the student: display_name > full_name > "Student". */
export function bestStudentName(p?: {
  display_name?: string | null;
  full_name?: string | null;
} | null): string {
  return p?.display_name?.trim() || p?.full_name?.trim() || "Student";
}
