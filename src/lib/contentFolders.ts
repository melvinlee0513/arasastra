import { supabase } from "@/integrations/supabase/client";

/**
 * Canonical typed contracts for the hierarchical class content folder system.
 *
 * All reads/writes go through the Phase 4 security-definer RPCs. The RPCs are
 * the authoritative enforcement point for tenant isolation, tutor assignment,
 * admin centre scope and student enrolment — never trust client filtering.
 */

export const MAX_FOLDER_DEPTH = 5;
export const UNFILED_LABEL = "Unfiled Materials";

export type ContentItemType = "resource" | "quiz" | "flashcard_deck";
export type FolderDeleteStrategy = "reject" | "move_to_parent" | "unfile";

export interface ContentFolder {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  cover_image_path: string | null;
  display_order: number;
  resource_count: number;
  quiz_count: number;
  deck_count: number;
  subfolder_count: number;
}

export interface FolderResource {
  id: string;
  folder_id: string | null;
  title: string;
  description: string | null;
  resource_type: string;
  source_type: string;
  status?: string;
  file_url: string | null;
  file_path: string | null;
  external_url: string | null;
  embed_url: string | null;
  thumbnail_path: string | null;
  display_order?: number | null;
  created_at?: string;
  published_at: string | null;
}

export interface FolderQuiz {
  id: string;
  folder_id: string | null;
  title: string;
  description: string | null;
  status?: string;
  total_points: number | null;
  due_at: string | null;
  available_from?: string | null;
  created_at?: string;
}

export interface FolderDeck {
  id: string;
  folder_id: string | null;
  title: string;
  description: string | null;
  status?: string;
  display_order: number | null;
  card_count: number;
  created_at?: string;
}

export interface ClassContentTree {
  class: { id: string; title: string; center_id?: string | null } | null;
  folders: ContentFolder[];
  resources: FolderResource[];
  quizzes: FolderQuiz[];
  flashcard_decks: FolderDeck[];
}

const EMPTY_TREE: ClassContentTree = {
  class: null,
  folders: [],
  resources: [],
  quizzes: [],
  flashcard_decks: [],
};

function normaliseTree(raw: unknown): ClassContentTree {
  if (!raw || typeof raw !== "object") return EMPTY_TREE;
  const t = raw as Partial<ClassContentTree>;
  return {
    class: t.class ?? null,
    folders: Array.isArray(t.folders) ? t.folders : [],
    resources: Array.isArray(t.resources) ? t.resources : [],
    quizzes: Array.isArray(t.quizzes) ? t.quizzes : [],
    flashcard_decks: Array.isArray(t.flashcard_decks) ? t.flashcard_decks : [],
  };
}

export async function fetchManagerContentTree(classId: string): Promise<ClassContentTree> {
  const { data, error } = await supabase.rpc("list_class_content_tree_for_manager", {
    _class_id: classId,
  });
  if (error) throw error;
  return normaliseTree(data);
}

export async function fetchStudentContentTree(classId: string): Promise<ClassContentTree> {
  const { data, error } = await supabase.rpc("list_class_content_tree_for_student", {
    _class_id: classId,
  });
  if (error) throw error;
  return normaliseTree(data);
}

export async function saveContentFolder(input: {
  classId: string;
  name: string;
  folderId?: string | null;
  parentId?: string | null;
  description?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("save_class_content_folder", {
    _class_id: input.classId,
    _name: input.name,
    _folder_id: input.folderId ?? null,
    _parent_id: input.parentId ?? null,
    _description: input.description ?? null,
  });
  if (error) throw error;
  const payload = data as { id?: string } | null;
  return payload?.id ?? "";
}

export async function moveContentFolder(folderId: string, newParentId: string | null): Promise<void> {
  const { error } = await supabase.rpc("move_class_content_folder", {
    _folder_id: folderId,
    _new_parent_id: newParentId,
  });
  if (error) throw error;
}

export async function reorderContentFolders(
  classId: string,
  orderedIds: string[],
  parentId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("reorder_class_content_folders", {
    _class_id: classId,
    _ordered_ids: orderedIds,
    _parent_id: parentId,
  });
  if (error) throw error;
}

export async function deleteContentFolderSafe(
  folderId: string,
  strategy: FolderDeleteStrategy,
): Promise<void> {
  const { error } = await supabase.rpc("delete_class_content_folder_safe", {
    _folder_id: folderId,
    _strategy: strategy,
  });
  if (error) throw error;
}

export async function moveContentItem(
  itemType: ContentItemType,
  itemId: string,
  folderId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("move_class_content_item", {
    _item_type: itemType,
    _item_id: itemId,
    _folder_id: folderId,
  });
  if (error) throw error;
}

/* ------------------------- tree helpers (pure) ------------------------- */

export function childFolders(folders: ContentFolder[], parentId: string | null): ContentFolder[] {
  return folders
    .filter((f) => (f.parent_id ?? null) === parentId)
    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
}

/** Ancestor chain (root first) for the given folder, used for breadcrumbs. */
export function folderPath(folders: ContentFolder[], folderId: string | null): ContentFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: ContentFolder[] = [];
  let cursor = folderId ? byId.get(folderId) : undefined;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return chain;
}

export function folderDepth(folders: ContentFolder[], folderId: string | null): number {
  return folderPath(folders, folderId).length;
}

export function canAddSubfolder(folders: ContentFolder[], folderId: string | null): boolean {
  return folderDepth(folders, folderId) < MAX_FOLDER_DEPTH;
}

/** Descendant ids of a folder (excluding itself) — used to block invalid moves. */
export function descendantIds(folders: ContentFolder[], folderId: string): Set<string> {
  const out = new Set<string>();
  const walk = (id: string) => {
    for (const f of folders) {
      if ((f.parent_id ?? null) === id && !out.has(f.id)) {
        out.add(f.id);
        walk(f.id);
      }
    }
  };
  walk(folderId);
  return out;
}

/** Flattened move targets with indentation, excluding self + descendants. */
export function moveTargets(
  folders: ContentFolder[],
  excludeFolderId?: string,
): Array<{ id: string; label: string; depth: number }> {
  const excluded = excludeFolderId
    ? new Set<string>([excludeFolderId, ...descendantIds(folders, excludeFolderId)])
    : new Set<string>();
  const out: Array<{ id: string; label: string; depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const f of childFolders(folders, parentId)) {
      if (excluded.has(f.id)) continue;
      out.push({ id: f.id, label: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function folderItemCount(f: ContentFolder): number {
  return f.resource_count + f.quiz_count + f.deck_count;
}

/** Case-insensitive title/name match used by folder-aware search. */
export function matchesQuery(value: string | null | undefined, query: string): boolean {
  if (!query.trim()) return true;
  return (value ?? "").toLowerCase().includes(query.trim().toLowerCase());
}
