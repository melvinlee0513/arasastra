/**
 * Canonical flashcard contracts (Phase 3A backend, Phase 3B1 manager layer).
 *
 * Backend model (existing, reused — no duplicate tables):
 *   public.flashcard_decks(id, center_id, class_id, subject_id, title, description,
 *                          status, display_order, definition_version, created_by,
 *                          published_at, created_at, updated_at, access_level)
 *   public.flashcards(id, deck_id, center_id, front_text, back_text, sort_order,
 *                     created_at, updated_at)
 *
 * `flashcards.sort_order` is the canonical card ordering column and is exposed
 * through the RPC layer as `display_order`. All production reads/writes go
 * through SECURITY DEFINER RPCs so tenant, role, enrolment and the tenant
 * `flashcards` feature flag are enforced server-side.
 *
 * `flashcard_decks.access_level` is LEGACY. It is retained for backwards
 * compatibility only and is deliberately NOT part of the authorisation
 * boundary: student access is decided by published status + active class
 * enrolment + same tenant + the `flashcards` feature flag, inside the RPCs.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { showSupabaseError } from "@/lib/supabaseErrors";

// ─── Types ──────────────────────────────────────────────────────────────────
export type FlashcardDeckStatus = "draft" | "published" | "archived";

export interface FlashcardCard {
  id: string;
  front: string;
  back: string;
  /** Canonical rich content (TipTap JSON). Null for legacy plain-text cards. */
  front_content?: Json | null;
  back_content?: Json | null;
  display_order: number;
}

export interface FlashcardCardDraft {
  /** Existing card ID. Omitted for newly added cards. */
  id?: string | null;
  front: string;
  back: string;
  front_content?: Json | null;
  back_content?: Json | null;
}


export interface FlashcardDeckManagerRow {
  id: string;
  center_id: string;
  class_id: string;
  title: string;
  description: string | null;
  status: FlashcardDeckStatus;
  display_order: number;
  definition_version: number;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  card_count: number;
  valid_card_count: number;
  has_learning_history: boolean;
}

export interface FlashcardDeckManagerDetail {
  id: string;
  center_id: string;
  class_id: string;
  title: string;
  description: string | null;
  status: FlashcardDeckStatus;
  display_order: number;
  definition_version: number;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  cards: FlashcardCard[];
}

export interface FlashcardDeckStudentRow {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  display_order: number;
  published_at: string | null;
  card_count: number;
  /** True once completion XP has been awarded for this deck. */
  completed: boolean;
  /** Cards marked "Got It" in the current study run. */
  completed_card_count: number;
  /** True once the student has opened the deck at least once. */
  started: boolean;
  /** Set when the current run reached the end of the queue. */
  run_completed_at: string | null;
  last_studied_at: string | null;
}

export interface FlashcardDeckStudy {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  display_order: number;
  completed: boolean;
  cards: FlashcardCard[];
}

export interface FlashcardDeckDefinition {
  title: string;
  description?: string | null;
  cards: FlashcardCardDraft[];
}

// ─── Status helpers ─────────────────────────────────────────────────────────
export const FLASHCARD_STATUSES: FlashcardDeckStatus[] = ["draft", "published", "archived"];

export function isFlashcardStatus(value: unknown): value is FlashcardDeckStatus {
  return typeof value === "string" && (FLASHCARD_STATUSES as string[]).includes(value);
}

export const FLASHCARD_STATUS_LABEL: Record<FlashcardDeckStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export function flashcardStatusLabel(status: FlashcardDeckStatus): string {
  return FLASHCARD_STATUS_LABEL[status] ?? "Draft";
}

// ─── Formatting helpers ─────────────────────────────────────────────────────
export function formatFlashcardDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function formatFlashcardRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatFlashcardDate(iso);
}

// ─── Validation helpers (mirror of the server-side publish rules) ───────────
export interface FlashcardValidationResult {
  canSaveDraft: boolean;
  canPublish: boolean;
  errors: string[];
}

export function validateFlashcardDeck(def: FlashcardDeckDefinition): FlashcardValidationResult {
  const errors: string[] = [];
  const title = def.title?.trim() ?? "";
  const cards = def.cards ?? [];

  if (title.length === 0) errors.push("Add a deck title before publishing.");
  const complete = cards.filter((c) => c.front.trim().length > 0 && c.back.trim().length > 0);
  if (cards.length === 0) errors.push("Add at least one card before publishing.");
  else if (complete.length !== cards.length) errors.push("Every card needs both a front and a back before publishing.");

  return { canSaveDraft: true, canPublish: errors.length === 0, errors };
}

// ─── Query keys ─────────────────────────────────────────────────────────────
export const flashcardManagerKeys = {
  list: (tenantId: string | null | undefined, classId: string, userId: string | null | undefined) =>
    ["flashcard-manager", "list", tenantId ?? "no-tenant", classId, userId ?? "anon"] as const,
  definition: (
    tenantId: string | null | undefined,
    classId: string,
    deckId: string,
    userId: string | null | undefined,
  ) => ["flashcard-manager", "definition", tenantId ?? "no-tenant", classId, deckId, userId ?? "anon"] as const,
};

export const flashcardStudentKeys = {
  list: (tenantId: string | null | undefined, classId: string, userId: string | null | undefined) =>
    ["flashcard-student", "list", tenantId ?? "no-tenant", classId, userId ?? "anon"] as const,
  deck: (
    tenantId: string | null | undefined,
    classId: string,
    deckId: string,
    userId: string | null | undefined,
  ) => ["flashcard-student", "deck", tenantId ?? "no-tenant", classId, deckId, userId ?? "anon"] as const,
};

// ─── Error mapping ──────────────────────────────────────────────────────────
export const FLASHCARD_CONFLICT_MESSAGE =
  "This deck was updated by another manager. Reload the latest version before saving.";

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const m = (err as { message?: string } | null)?.message;
  return typeof m === "string" ? m : "";
}

/** True when a save was rejected because the loaded definition was stale. */
export function isFlashcardConflict(err: unknown): boolean {
  return /flashcard_definition_conflict/i.test(errMessage(err));
}

/** Maps known server-side guard messages onto friendly, safe copy. */
export function mapFlashcardError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const message = errMessage(err);
  if (!message) return fallback;
  if (/flashcard_definition_conflict/i.test(message)) return FLASHCARD_CONFLICT_MESSAGE;
  if (/flashcards disabled/i.test(message)) return "Flashcards are turned off for this centre.";
  if (/not permitted|not authenticated|permission denied|42501/i.test(message))
    return "You do not have permission to perform this action.";
  if (/deck not found|deck not available/i.test(message)) return "This deck is no longer available.";
  if (/class not found/i.test(message)) return "This class is no longer available.";
  if (/card does not belong to this deck|invalid card id/i.test(message))
    return "One of the cards could not be matched to this deck. Reload and try again.";
  if (/invalid deck list/i.test(message)) return "The deck order could not be saved. Reload and try again.";
  if (/title required to publish/i.test(message)) return "Add a deck title before publishing.";
  if (/at least one card is required to publish|at least one complete card/i.test(message))
    return "Add at least one complete card before publishing.";
  if (/every card needs a front and a back/i.test(message))
    return "Every card needs both a front and a back before publishing.";
  if (/invalid cards payload|invalid status/i.test(message)) return "That change could not be saved.";
  if (/deck_has_learning_history/i.test(message))
    return "Students already studied this deck, so it was archived instead of deleted.";
  if (/Failed to fetch|NetworkError|network/i.test(message))
    return "Network problem. Check your connection and try again.";
  return fallback;
}

/** Toast-friendly wrapper kept for callers that surface errors directly. */
export function reportFlashcardError(err: unknown, fallback = "Something went wrong. Please try again.") {
  return showSupabaseError({ message: mapFlashcardError(err, fallback) }, fallback);
}

// ─── Local draft cleanup ────────────────────────────────────────────────────
export const FLASHCARD_DRAFT_PREFIX = "flashcard-builder:";
export const FLASHCARD_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Purge client-side flashcard builder drafts. Called on sign-out so a later
 * user on the same browser never inherits the previous manager's draft.
 */
export function clearFlashcardLocalState(): void {
  if (typeof window === "undefined") return;
  try {
    const kill: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(FLASHCARD_DRAFT_PREFIX)) kill.push(k);
    }
    kill.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Best-effort cleanup only.
  }
}

function unwrap<T>(data: unknown): T {
  return data as T;
}

// ─── Manager RPC wrappers ───────────────────────────────────────────────────
export async function listClassFlashcardDecksForManager(classId: string): Promise<FlashcardDeckManagerRow[]> {
  const { data, error } = await supabase.rpc("list_class_flashcard_decks_for_manager", { _class_id: classId });
  if (error) throw error;
  return unwrap<FlashcardDeckManagerRow[]>(data ?? []);
}

export async function getFlashcardDeckForManager(deckId: string): Promise<FlashcardDeckManagerDetail> {
  const { data, error } = await supabase.rpc("get_flashcard_deck_for_manager", { _deck_id: deckId });
  if (error) throw error;
  return unwrap<FlashcardDeckManagerDetail>(data);
}

export interface SaveFlashcardDeckResult {
  deck_id: string;
  card_count: number;
  definition_version: number;
  status: FlashcardDeckStatus;
}

export async function saveFlashcardDeck(args: {
  classId: string;
  definition: FlashcardDeckDefinition;
  deckId?: string | null;
  publish?: boolean;
  /** Loaded definition_version — omit for new decks. */
  expectedVersion?: number | null;
}): Promise<SaveFlashcardDeckResult> {
  const { data, error } = await supabase.rpc("save_flashcard_deck", {
    _class_id: args.classId,
    _definition: {
      title: args.definition.title,
      description: args.definition.description ?? null,
      cards: args.definition.cards.map((c) => ({
        id: c.id ?? null,
        front: c.front,
        back: c.back,
      })),
    },
    _deck_id: args.deckId ?? undefined,
    _publish: args.publish ?? false,
    _expected_version: args.expectedVersion ?? undefined,
  });
  if (error) throw error;
  return unwrap<SaveFlashcardDeckResult>(data);
}

export interface DeleteFlashcardDeckResult {
  deleted: boolean;
  deck_id: string;
  reason?: string;
}

export async function deleteFlashcardDeckSafe(deckId: string): Promise<DeleteFlashcardDeckResult> {
  const { data, error } = await supabase.rpc("delete_flashcard_deck_safe", { _deck_id: deckId });
  if (error) throw error;
  return unwrap<DeleteFlashcardDeckResult>(data);
}

export async function duplicateFlashcardDeckAsDraft(deckId: string): Promise<string> {
  const { data, error } = await supabase.rpc("duplicate_flashcard_deck_as_draft", { _deck_id: deckId });
  if (error) throw error;
  return data as string;
}

export async function setFlashcardDeckStatus(
  deckId: string,
  status: FlashcardDeckStatus,
): Promise<{ deck_id: string; status: FlashcardDeckStatus }> {
  const { data, error } = await supabase.rpc("set_flashcard_deck_status", { _deck_id: deckId, _status: status });
  if (error) throw error;
  return unwrap<{ deck_id: string; status: FlashcardDeckStatus }>(data);
}

export async function reorderFlashcardDecks(classId: string, deckIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("reorder_flashcard_decks", { _class_id: classId, _deck_ids: deckIds });
  if (error) throw error;
  return unwrap<{ reordered: number }>(data).reordered;
}

// ─── Student RPC wrappers (Phase 3B2) ───────────────────────────────────────
export async function listClassFlashcardDecksForStudent(classId: string): Promise<FlashcardDeckStudentRow[]> {
  const { data, error } = await supabase.rpc("list_class_flashcard_decks_for_student", { _class_id: classId });
  if (error) throw error;
  return unwrap<FlashcardDeckStudentRow[]>(data ?? []);
}

export async function getFlashcardDeckForStudy(deckId: string): Promise<FlashcardDeckStudy> {
  const { data, error } = await supabase.rpc("get_flashcard_deck_for_study", { _deck_id: deckId });
  if (error) throw error;
  return unwrap<FlashcardDeckStudy>(data);
}

/** Server-side deduplicated completion XP: awarded at most once per student per deck. */
export async function recordFlashcardDeckCompletion(
  deckId: string,
): Promise<{ awarded: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("record_flashcard_deck_completion", { _deck_id: deckId });
  if (error) throw error;
  return unwrap<{ awarded: boolean; reason?: string }>(data);
}

/**
 * Canonical, server-owned study progress for one student + deck.
 * `queue` is the remaining card order, `completed_ids` are cards marked "Got It",
 * and `progress_revision` guards against a stale tab overwriting newer progress.
 */
export interface FlashcardStudyProgress {
  deck_id: string;
  queue: string[];
  completed_ids: string[];
  reviewed_ids: string[];
  current_card_id: string | null;
  progress_revision: number;
  started_at: string;
  last_studied_at: string;
  completed_at: string | null;
}

export interface FlashcardStudySession {
  deck: FlashcardDeckStudy;
  progress: FlashcardStudyProgress;
}

export interface FlashcardProgressPatch {
  queue: string[];
  completed_ids: string[];
  reviewed_ids: string[];
  current_card_id: string | null;
}

export async function startOrResumeFlashcardDeck(deckId: string): Promise<FlashcardStudySession> {
  const { data, error } = await supabase.rpc("start_or_resume_flashcard_deck", { _deck_id: deckId });
  if (error) throw error;
  return unwrap<FlashcardStudySession>(data);
}

export async function saveFlashcardProgress(
  deckId: string,
  state: FlashcardProgressPatch,
  expectedRevision: number,
): Promise<FlashcardStudyProgress> {
  const { data, error } = await supabase.rpc("save_flashcard_progress", {
    _deck_id: deckId,
    _state: state as unknown as Json,
    _expected_revision: expectedRevision,
  });
  if (error) throw error;
  return unwrap<FlashcardStudyProgress>(data);
}

export async function restartFlashcardDeck(deckId: string): Promise<FlashcardStudySession> {
  const { data, error } = await supabase.rpc("restart_flashcard_deck", { _deck_id: deckId });
  if (error) throw error;
  return unwrap<FlashcardStudySession>(data);
}

/** True when a progress save was rejected because another tab saved first. */
export function isFlashcardProgressConflict(err: unknown): boolean {
  return /flashcard_progress_conflict/i.test(errMessage(err));
}

