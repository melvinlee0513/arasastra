/**
 * Canonical flashcard contracts (Phase 3A).
 *
 * Backend model (existing, reused — no duplicate tables):
 *   public.flashcard_decks(id, center_id, class_id, subject_id, title, description,
 *                          status, display_order, created_by, published_at,
 *                          created_at, updated_at, access_level)
 *   public.flashcards(id, deck_id, center_id, front_text, back_text, sort_order,
 *                     created_at, updated_at)
 *
 * `flashcards.sort_order` is the canonical card ordering column and is exposed
 * through the RPC layer as `display_order`. All production reads/writes go
 * through SECURITY DEFINER RPCs so tenant, role, enrolment and the tenant
 * `flashcards` feature flag are enforced server-side.
 */
import { supabase } from "@/integrations/supabase/client";
import { showSupabaseError } from "@/lib/supabaseErrors";

// ─── Types ──────────────────────────────────────────────────────────────────
export type FlashcardDeckStatus = "draft" | "published" | "archived";

export interface FlashcardCard {
  id: string;
  front: string;
  back: string;
  display_order: number;
}

export interface FlashcardCardDraft {
  front: string;
  back: string;
}

export interface FlashcardDeckManagerRow {
  id: string;
  center_id: string;
  class_id: string;
  title: string;
  description: string | null;
  status: FlashcardDeckStatus;
  display_order: number;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  card_count: number;
  valid_card_count: number;
}

export interface FlashcardDeckManagerDetail {
  id: string;
  center_id: string;
  class_id: string;
  title: string;
  description: string | null;
  status: FlashcardDeckStatus;
  display_order: number;
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
  completed: boolean;
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

export function flashcardStatusLabel(status: FlashcardDeckStatus): string {
  switch (status) {
    case "published":
      return "Published";
    case "archived":
      return "Archived";
    default:
      return "Draft";
  }
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
  list: (tenantId: string | null, classId: string, userId: string | null) =>
    ["flashcard-manager", tenantId, classId, userId] as const,
  deck: (tenantId: string | null, classId: string, deckId: string, userId: string | null) =>
    ["flashcard-manager", tenantId, classId, deckId, userId] as const,
};

export const flashcardStudentKeys = {
  list: (tenantId: string | null, classId: string, userId: string | null) =>
    ["flashcard-student", tenantId, classId, userId] as const,
  deck: (tenantId: string | null, classId: string, deckId: string, userId: string | null) =>
    ["flashcard-student", tenantId, classId, deckId, userId] as const,
};

// ─── Error mapping ──────────────────────────────────────────────────────────
/** Maps known server-side flashcard guard messages onto friendly copy. */
export function reportFlashcardError(err: unknown, fallback = "Something went wrong. Please try again.") {
  const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? "");
  if (/flashcards disabled/i.test(message)) {
    return showSupabaseError({ message: "Flashcards are turned off for this centre." }, fallback);
  }
  if (/not permitted/i.test(message)) {
    return showSupabaseError({ message: "You do not have permission to perform this action." }, fallback);
  }
  if (/publish|card needs|title required|at least one card/i.test(message)) {
    return showSupabaseError({ message }, fallback);
  }
  return showSupabaseError(err, fallback);
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
  status: FlashcardDeckStatus;
}

export async function saveFlashcardDeck(args: {
  classId: string;
  definition: FlashcardDeckDefinition;
  deckId?: string | null;
  publish?: boolean;
}): Promise<SaveFlashcardDeckResult> {
  const { data, error } = await supabase.rpc("save_flashcard_deck", {
    _class_id: args.classId,
    _definition: {
      title: args.definition.title,
      description: args.definition.description ?? null,
      cards: args.definition.cards.map((c) => ({ front: c.front, back: c.back })),
    },
    _deck_id: args.deckId ?? undefined,
    _publish: args.publish ?? false,
  });
  if (error) throw error;
  return unwrap<SaveFlashcardDeckResult>(data);
}

export async function deleteFlashcardDeckSafe(deckId: string): Promise<{ deleted: boolean; deck_id: string }> {
  const { data, error } = await supabase.rpc("delete_flashcard_deck_safe", { _deck_id: deckId });
  if (error) throw error;
  return unwrap<{ deleted: boolean; deck_id: string }>(data);
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

// ─── Student RPC wrappers ───────────────────────────────────────────────────
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
