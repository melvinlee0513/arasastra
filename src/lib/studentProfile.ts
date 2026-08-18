/**
 * Canonical student profile source for the mobile student surfaces.
 *
 * One query key (`["student-profile", userId]`) is shared by Home's hero, the
 * mobile Profile summary and the Edit Profile sheet, so a display-name or
 * avatar change reflects everywhere without a hard refresh.
 */

import type { CSSProperties } from "react";
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

/** The six supported Home hero background colours. Nothing else is valid. */
export type HeroColorKey =
  | "red"
  | "blue"
  | "purple"
  | "green"
  | "yellow"
  | "orange";

export interface HeroColorPreset {
  key: HeroColorKey;
  label: string;
  /** Solid swatch used by the Profile picker. */
  background: string;
  /** Canonical illustrated Home hero background (WebP in /public). */
  image: string;
  /** Wider desktop variant of the same illustrated hero card. */
  imageDesktop: string;
  /**
   * Accessible darker shade of the same hue, used for text/labels on a very
   * light tinted background (bright hues like yellow need this).
   */
  foreground: string;
  /** Strong-but-readable icon shade. */
  icon: string;
}


/**
 * Canonical colour → illustrated background mapping. The artwork lives in
 * /public/assets/illustrations/ui and is never recreated in CSS.
 */
export const HERO_COLOR_PRESETS: HeroColorPreset[] = [
  {
    key: "red",
    label: "Red",
    background: "#EF4444",
    image: "/assets/illustrations/ui/student-home-hero-background-red.webp",
    imageDesktop: "/assets/illustrations/ui/student-home-hero-background-red-desktop.webp",
    foreground: "#B91C1C",
    icon: "#DC2626",
  },
  {
    key: "blue",
    label: "Blue",
    background: "#2563EB",
    image: "/assets/illustrations/ui/student-home-hero-background-blue.webp",
    imageDesktop: "/assets/illustrations/ui/student-home-hero-background-blue-desktop.webp",
    foreground: "#1D4ED8",
    icon: "#2563EB",
  },
  {
    key: "purple",
    label: "Purple",
    background: "#7C3AED",
    image: "/assets/illustrations/ui/student-home-hero-background-purple.webp",
    // NOTE: the uploaded purple desktop asset ships with this filename spelling.
    imageDesktop: "/assets/illustrations/ui/student-home-hero-background-purplse-desktop.webp",
    foreground: "#6D28D9",
    icon: "#7C3AED",
  },
  {
    key: "green",
    label: "Green",
    background: "#16A34A",
    image: "/assets/illustrations/ui/student-home-hero-background-green.webp",
    imageDesktop: "/assets/illustrations/ui/student-home-hero-background-green-desktop.webp",
    foreground: "#15803D",
    icon: "#16A34A",
  },
  {
    key: "yellow",
    label: "Yellow",
    background: "#FACC15",
    image: "/assets/illustrations/ui/student-home-hero-background-yellow.webp",
    imageDesktop: "/assets/illustrations/ui/student-home-hero-background-yellow-desktop.webp",
    // Bright hue: text and icon need a much darker amber to stay readable.
    foreground: "#92400E",
    icon: "#B45309",
  },
  {
    key: "orange",
    label: "Orange",
    background: "#F97316",
    image: "/assets/illustrations/ui/student-home-hero-background-orange.webp",
    imageDesktop: "/assets/illustrations/ui/student-home-hero-background-orange-desktop.webp",
    foreground: "#C2410C",
    icon: "#EA580C",
  },
];


export const DEFAULT_HERO_COLOR: HeroColorKey = "red";

/** Tolerant resolver — legacy/invalid stored values fall back to red. */
export function heroPresetFor(key: string | null | undefined): HeroColorPreset {
  return (
    HERO_COLOR_PRESETS.find((p) => p.key === key) ??
    HERO_COLOR_PRESETS.find((p) => p.key === DEFAULT_HERO_COLOR)!
  );
}

/** Background illustration for a stored preference value. */
export function heroBackgroundFor(
  key: string | null | undefined,
  variant: "mobile" | "desktop" = "mobile",
): string {
  const preset = heroPresetFor(key);
  return variant === "desktop" ? preset.imageDesktop : preset.image;
}

/* ------------------------- personal accent tokens ------------------------- */

/** Hex → "r g b" so it can be composed with alpha inside CSS colour funcs. */
function rgbTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export interface StudentAccentTokens {
  preset: HeroColorPreset;
  /** Emphasis colour (icons, arrows). */
  accent: string;
  /** Accessible darker shade for text. */
  accentForeground: string;
  /** Very light tinted background (~10%). */
  accentSoft: string;
  /** Even lighter hover tint (~6%). */
  accentSofter: string;
  /** Subtle accent border. */
  accentBorder: string;
  /** Ready-to-spread CSS custom properties. */
  vars: CSSProperties;
}

/**
 * Derived, accessible tokens for the student's PERSONAL accent.
 *
 * Single source of truth: the same `profiles.home_header_color` preference the
 * Home hero and Profile picker read, via the shared `["student-profile"]` query
 * cache — so changing the colour updates every consumer live with no local
 * duplicate state. This is deliberately NOT tenant branding.
 */
export function useStudentAccent(): StudentAccentTokens {
  const { data: profile } = useStudentProfile();
  const preset = heroPresetFor(profile?.home_header_color);
  const triplet = rgbTriplet(preset.background);

  const accent = preset.icon;
  const accentForeground = preset.foreground;
  const accentSoft = `rgb(${triplet} / 0.12)`;
  const accentSofter = `rgb(${triplet} / 0.06)`;
  const accentBorder = `rgb(${triplet} / 0.22)`;

  return {
    preset,
    accent,
    accentForeground,
    accentSoft,
    accentSofter,
    accentBorder,
    vars: {
      "--student-accent": accent,
      "--student-accent-foreground": accentForeground,
      "--student-accent-soft": accentSoft,
      "--student-accent-softer": accentSofter,
      "--student-accent-border": accentBorder,
    } as CSSProperties,
  };
}



/** Persist the student's own hero colour. Scoped to auth.uid() by RLS. */
export function useSaveHeroColor() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = studentProfileKeys.profile(user?.id);

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
    // Optimistic: the swatch, the "Selected:" line and Home all read the same
    // cached profile record, so the UI flips instantly with no refetch flash.
    onMutate: async (key: HeroColorKey) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<StudentProfileRecord | null>(queryKey);
      if (previous) {
        qc.setQueryData<StudentProfileRecord | null>(queryKey, {
          ...previous,
          home_header_color: key,
        });
      }
      return { previous };
    },
    onError: (_e, _key, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(queryKey, ctx.previous);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
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
