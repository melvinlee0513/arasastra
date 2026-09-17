import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  Eye,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Send,
  Sigma,
  Trash2,
  X,
} from "lucide-react";
import { ClassShell } from "@/components/class/ClassShell";
import { TenantEmptyState } from "@/components/common/TenantGate";
import { useClassContext } from "@/hooks/useClassContext";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderSelect } from "@/components/class/FolderSelect";
import {
  fetchManagerContentTree,
  folderKeys,
  moveContentItem,
} from "@/lib/contentFolders";
import { Textarea } from "@/components/ui/textarea";
import { parseRichValue, richDocToPlainText, type RichDoc } from "@/lib/richContent";
import type { Json } from "@/integrations/supabase/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  FlashcardMediaEditor,
  type FlashcardImageValue,
} from "@/components/flashcards/FlashcardMediaEditor";
import {
  CardEditorSheet,
  docHasMath,
  type BuilderCard,
} from "@/components/flashcards/CardEditorSheet";
import {
  FlashcardEmptyState,
  FlashcardHero,
  FlashcardScreen,
  HeroStat,
  StatTile,
} from "@/components/flashcards/FlashcardChrome";
import { FLASHCARD_ART } from "@/lib/flashcardArt";
import {
  FLASHCARD_DRAFT_PREFIX,
  FLASHCARD_DRAFT_TTL_MS,
  FLASHCARD_STATUS_LABEL,
  deleteFlashcardDeckSafe,
  formatFlashcardDate,
  type FlashcardDeckDefinition,
  type FlashcardDeckManagerDetail,
  flashcardManagerKeys,
  getFlashcardDeckForManager,
  isFlashcardConflict,
  mapFlashcardError,
  saveFlashcardDeck,
  setFlashcardDeckStatus,
  validateFlashcardDeck,
} from "@/lib/flashcards";

type Variant = "tutor" | "admin";

interface Props {
  variant: Variant;
}

const emptyImage = (): FlashcardImageValue => ({
  image_path: null,
  image_width: null,
  image_height: null,
  image_alt: null,
  image_crop: null,
});

type CardRow = BuilderCard;

interface BuilderState {
  title: string;
  description: string;
  coverPath: string | null;
  formLevel: string;
  showProgress: boolean;
  awardXp: boolean;
  cards: CardRow[];
  definitionVersion: number | null;
}

interface StoredDraft extends BuilderState {
  savedAt: number;
}

let keySeq = 0;
const nextKey = () => `c${Date.now().toString(36)}-${keySeq++}`;

const newCard = (): CardRow => ({
  key: nextKey(),
  serverId: null,
  front: "",
  back: "",
  frontDoc: null,
  backDoc: null,
  frontImage: emptyImage(),
  backImage: emptyImage(),
  tags: [],
});

const emptyState = (): BuilderState => ({
  title: "",
  description: "",
  coverPath: null,
  formLevel: "",
  showProgress: true,
  awardXp: true,
  cards: [newCard()],
  definitionVersion: null,
});

function stateFromDetail(detail: FlashcardDeckManagerDetail): BuilderState {
  return {
    title: detail.title ?? "",
    description: detail.description ?? "",
    coverPath: detail.cover_path ?? null,
    formLevel: detail.form_level ?? "",
    showProgress: detail.show_progress ?? true,
    awardXp: detail.award_xp ?? true,
    cards: (detail.cards ?? []).map((c) => ({
      key: `s-${c.id}`,
      serverId: c.id,
      front: c.front ?? "",
      back: c.back ?? "",
      frontDoc: parseRichValue(c.front_content ?? null, c.front ?? ""),
      backDoc: parseRichValue(c.back_content ?? null, c.back ?? ""),
      frontImage: {
        image_path: c.front_image_path ?? null,
        image_width: c.front_image_width ?? null,
        image_height: c.front_image_height ?? null,
        image_alt: c.front_image_alt ?? null,
        image_crop: c.front_image_crop ?? null,
      },
      backImage: {
        image_path: c.back_image_path ?? null,
        image_width: c.back_image_width ?? null,
        image_height: c.back_image_height ?? null,
        image_alt: c.back_image_alt ?? null,
        image_crop: c.back_image_crop ?? null,
      },
      tags: c.tags ?? [],
    })),
    definitionVersion: detail.definition_version ?? null,
  };
}

/** Short single-line preview of a card face for the builder list. */
function facePreview(doc: RichDoc | null, fallback: string): string {
  const text = (doc ? richDocToPlainText(doc) : fallback).replace(/\s+/g, " ").trim();
  return text;
}

export function ClassFlashcardBuilder({ variant }: Props) {
  const { classId, deckId } = useParams<{ classId: string; deckId?: string }>();
  const [searchParams] = useSearchParams();
  const isNew = !deckId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const ctx = useClassContext(classId);
  const qc = useQueryClient();
  const { toast } = useToast();

  const basePath = variant === "admin" ? `/admin/classes/${classId}` : `/tutor/classes/${classId}`;
  const managerPath = `${basePath}/flashcards`;
  const materialsPath = `${basePath}/resources`;
  const canManage = !!ctx.data?.canManage;
  /** Images are uploaded into the centre's private folder. */
  const centerId = ctx.data?.klass?.center_id ?? currentTenantId ?? null;

  const deckQ = useQuery({
    queryKey: flashcardManagerKeys.definition(currentTenantId, classId ?? "", deckId ?? "new", user?.id),
    enabled: !isNew && !!user && canManage,
    queryFn: () => getFlashcardDeckForManager(deckId!),
    staleTime: 15_000,
  });

  // Folder placement — new decks default to the folder the tutor came from.
  const treeQ = useQuery({
    queryKey: folderKeys.managerTree(currentTenantId, classId ?? "", user?.id),
    enabled: !!classId && !!user && canManage,
    queryFn: () => fetchManagerContentTree(classId!),
    staleTime: 15_000,
  });
  const folders = treeQ.data?.folders ?? [];
  const persistedFolderId = useMemo(() => {
    if (!deckId) return null;
    const row = (treeQ.data?.flashcard_decks ?? []).find((d) => d.id === deckId);
    return row?.folder_id ?? null;
  }, [treeQ.data, deckId]);
  const [folderId, setFolderId] = useState<string | null>(searchParams.get("folder"));
  const folderSeededRef = useRef(false);
  useEffect(() => {
    if (isNew || folderSeededRef.current || !treeQ.data) return;
    folderSeededRef.current = true;
    setFolderId(persistedFolderId);
  }, [isNew, treeQ.data, persistedFolderId]);

  const [state, setState] = useState<BuilderState>(() => emptyState());
  const [initialized, setInitialized] = useState(isNew);
  const [dirty, setDirty] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [tab, setTab] = useState<"cards" | "settings">("cards");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const restoredRef = useRef(false);

  const status = deckQ.data?.status ?? "draft";

  const draftKey = useMemo(() => {
    if (!user?.id || !currentTenantId || !classId) return null;
    return `${FLASHCARD_DRAFT_PREFIX}${user.id}:${currentTenantId}:${classId}:${deckId ?? "new"}:${variant}`;
  }, [user?.id, currentTenantId, classId, deckId, variant]);

  // Initialise from server (or blank for a new deck).
  useEffect(() => {
    if (initialized) return;
    if (deckQ.data) {
      setState(stateFromDetail(deckQ.data));
      setInitialized(true);
    }
  }, [deckQ.data, initialized]);

  // Offer to restore a recent local draft once initialised.
  useEffect(() => {
    if (!initialized || restoredRef.current || !draftKey) return;
    restoredRef.current = true;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredDraft;
      if (!parsed?.savedAt || Date.now() - parsed.savedAt > FLASHCARD_DRAFT_TTL_MS) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      setRestoreOpen(true);
    } catch {
      /* ignore malformed drafts */
    }
  }, [initialized, draftKey]);

  // Debounced draft persistence. Card text is stored locally only — never logged.
  useEffect(() => {
    if (!draftKey || !initialized || !dirty) return;
    const t = setTimeout(() => {
      try {
        const payload: StoredDraft = { ...state, savedAt: Date.now() };
        window.localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch {
        /* storage full or unavailable — non-fatal */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [state, dirty, draftKey, initialized]);

  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  const restoreDraft = useCallback(() => {
    if (!draftKey) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredDraft;
        setState({
          title: parsed.title ?? "",
          description: parsed.description ?? "",
          coverPath: parsed.coverPath ?? null,
          formLevel: parsed.formLevel ?? "",
          showProgress: parsed.showProgress ?? true,
          awardXp: parsed.awardXp ?? true,
          cards: (parsed.cards ?? []).map((c) => ({
            key: c.key || nextKey(),
            serverId: c.serverId ?? null,
            front: c.front ?? "",
            back: c.back ?? "",
            frontDoc: parseRichValue(c.frontDoc ?? null, c.front ?? ""),
            backDoc: parseRichValue(c.backDoc ?? null, c.back ?? ""),
            frontImage: c.frontImage ?? emptyImage(),
            backImage: c.backImage ?? emptyImage(),
            tags: c.tags ?? [],
          })),
          definitionVersion: parsed.definitionVersion ?? null,
        });

        setDirty(true);
      }
    } catch {
      /* ignore */
    }
    setRestoreOpen(false);
  }, [draftKey]);

  // ── Mutations ─────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: async (args: { publish: boolean }) => {
      const definition: FlashcardDeckDefinition = {
        title: state.title,
        description: state.description,
        cover_path: state.coverPath,
        form_level: state.formLevel.trim() || null,
        show_progress: state.showProgress,
        award_xp: state.awardXp,
        cards: state.cards.map((c) => ({
          id: c.serverId,
          front: c.front,
          back: c.back,
          front_content: (c.frontDoc ?? null) as unknown as Json,
          back_content: (c.backDoc ?? null) as unknown as Json,
          front_image_path: c.frontImage.image_path,
          front_image_width: c.frontImage.image_width,
          front_image_height: c.frontImage.image_height,
          front_image_alt: c.frontImage.image_alt,
          front_image_crop: c.frontImage.image_crop,
          back_image_path: c.backImage.image_path,
          back_image_width: c.backImage.image_width,
          back_image_height: c.backImage.image_height,
          back_image_alt: c.backImage.image_alt,
          back_image_crop: c.backImage.image_crop,
          tags: c.tags,
        })),
      };
      if (args.publish) {
        const v = validateFlashcardDeck(validationInput);
        if (!v.canPublish) throw new Error(v.errors.join("\n"));
      }

      const res = await saveFlashcardDeck({
        classId: classId!,
        deckId: deckId ?? null,
        definition,
        publish: args.publish,
        expectedVersion: isNew ? null : state.definitionVersion,
      });
      // Placement is a separate, non-destructive move — content is untouched.
      if (folderId !== persistedFolderId || (isNew && folderId)) {
        await moveContentItem("flashcard_deck", res.deck_id, folderId);
      }
      return res;
    },
    onSuccess: async (res, args) => {
      clearDraft();
      setDirty(false);
      setConflict(false);
      qc.invalidateQueries({ queryKey: ["flashcard-manager"] });
      qc.invalidateQueries({ queryKey: ["flashcard-student"] });
      qc.invalidateQueries({ queryKey: ["class-context", currentTenantId, classId] });
      qc.invalidateQueries({ queryKey: ["tutor-class-home"] });
      qc.invalidateQueries({ queryKey: ["student-class-materials"] });
      qc.invalidateQueries({ queryKey: ["class-content"] });
      toast({ title: args.publish ? "Deck published" : "Deck saved" });

      if (isNew) {
        navigate(`${basePath}/flashcards/${res.deck_id}/edit`, { replace: true });
        return;
      }
      // Reload the persisted definition so card IDs, order and version are exact.
      const fresh = await qc.fetchQuery({
        queryKey: flashcardManagerKeys.definition(currentTenantId, classId ?? "", deckId!, user?.id),
        queryFn: () => getFlashcardDeckForManager(deckId!),
      });
      setState(stateFromDetail(fresh));
    },
    onError: (err) => {
      if (isFlashcardConflict(err)) {
        setConflict(true);
        return;
      }
      toast({ title: "Save failed", description: mapFlashcardError(err), variant: "destructive" });
    },
  });

  const statusMut = useMutation({
    mutationFn: (next: "draft" | "published") => setFlashcardDeckStatus(deckId!, next),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["flashcard-manager"] });
      qc.invalidateQueries({ queryKey: ["flashcard-student"] });
      qc.invalidateQueries({ queryKey: ["class-content"] });
      toast({ title: res.status === "published" ? "Deck published" : "Deck moved to draft" });
    },
    onError: (err) =>
      toast({ title: "Couldn't update", description: mapFlashcardError(err), variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFlashcardDeckSafe(deckId!),
    onSuccess: (res) => {
      setDeleteOpen(false);
      if (!res.deleted) {
        toast({
          title: "Deck kept",
          description:
            "Students have already studied this deck, so it was archived instead of deleted.",
        });
      } else {
        toast({ title: "Deck deleted" });
      }
      clearDraft();
      qc.invalidateQueries({ queryKey: ["flashcard-manager"] });
      qc.invalidateQueries({ queryKey: ["flashcard-student"] });
      qc.invalidateQueries({ queryKey: ["class-content"] });
      navigate(managerPath, { replace: true });
    },
    onError: (err) =>
      toast({ title: "Delete failed", description: mapFlashcardError(err), variant: "destructive" }),
  });

  const reloadLatest = useCallback(async () => {
    if (!deckId) return;
    try {
      const fresh = await qc.fetchQuery({
        queryKey: flashcardManagerKeys.definition(currentTenantId, classId ?? "", deckId, user?.id),
        queryFn: () => getFlashcardDeckForManager(deckId),
      });
      setState(stateFromDetail(fresh));
      setDirty(false);
      setConflict(false);
      clearDraft();
      toast({ title: "Latest version loaded" });
    } catch (err) {
      toast({ title: "Reload failed", description: mapFlashcardError(err), variant: "destructive" });
    }
  }, [deckId, qc, currentTenantId, classId, user?.id, clearDraft, toast]);

  // ── Card editing helpers ──────────────────────────────────────────────
  const patch = (fn: (s: BuilderState) => BuilderState) => {
    setState((s) => fn(s));
    setDirty(true);
  };

  /** Rich content edit: keeps the plain-text mirror in sync for validation. */
  const setCardContent = (key: string, side: "front" | "back", doc: RichDoc) =>
    patch((s) => ({
      ...s,
      cards: s.cards.map((c) =>
        c.key === key
          ? side === "front"
            ? { ...c, frontDoc: doc, front: richDocToPlainText(doc) }
            : { ...c, backDoc: doc, back: richDocToPlainText(doc) }
          : c,
      ),
    }));

  const addCard = () => {
    const card = newCard();
    patch((s) => ({ ...s, cards: [...s.cards, card] }));
    setTab("cards");
    setEditingKey(card.key);
  };

  const duplicateCard = (key: string) =>
    patch((s) => {
      const i = s.cards.findIndex((c) => c.key === key);
      if (i < 0) return s;
      const src = s.cards[i];
      const copy: CardRow = {
        key: nextKey(),
        serverId: null,
        front: src.front,
        back: src.back,
        frontDoc: src.frontDoc,
        backDoc: src.backDoc,
        // Duplicated cards intentionally reference the same stored image.
        frontImage: { ...src.frontImage },
        backImage: { ...src.backImage },
        tags: [...src.tags],
      };

      const cards = [...s.cards];
      cards.splice(i + 1, 0, copy);
      return { ...s, cards };
    });

  const removeCard = (key: string) =>
    patch((s) => ({ ...s, cards: s.cards.filter((c) => c.key !== key) }));

  const moveCard = (key: string, delta: number) =>
    patch((s) => {
      const i = s.cards.findIndex((c) => c.key === key);
      const target = i + delta;
      if (i < 0 || target < 0 || target >= s.cards.length) return s;
      const cards = [...s.cards];
      const [moved] = cards.splice(i, 1);
      cards.splice(target, 0, moved);
      return { ...s, cards };
    });

  const setCardImage = (
    key: string,
    side: "front" | "back",
    patchValue: Partial<FlashcardImageValue>,
  ) =>
    patch((s) => ({
      ...s,
      cards: s.cards.map((c) =>
        c.key === key
          ? side === "front"
            ? { ...c, frontImage: { ...c.frontImage, ...patchValue } }
            : { ...c, backImage: { ...c.backImage, ...patchValue } }
          : c,
      ),
    }));

  const setCardTags = (key: string, raw: string) =>
    patch((s) => ({
      ...s,
      cards: s.cards.map((c) =>
        c.key === key
          ? { ...c, tags: raw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10) }
          : c,
      ),
    }));

  /**
   * A side counts as filled when it has text OR an image, so picture-only
   * cards can be published.
   */
  const validationInput = {
    title: state.title,
    description: state.description,
    cards: state.cards.map((c) => ({
      id: c.serverId,
      front: c.front.trim() || (c.frontImage.image_path ? "Image" : ""),
      back: c.back.trim() || (c.backImage.image_path ? "Image" : ""),
    })),
  };

  const validation = validateFlashcardDeck(validationInput);

  const breadcrumbs = [
    { label: variant === "admin" ? "Admin" : "Tutor", to: variant === "admin" ? "/admin" : "/tutor" },
    { label: "Classes", to: variant === "admin" ? "/admin/curriculum" : "/tutor/classes" },
    { label: ctx.data?.klass?.title ?? "Class", to: basePath },
    { label: "Flashcards", to: managerPath },
    { label: isNew ? "New deck" : "Edit deck" },
  ];

  const leave = () => navigate(managerPath);
  const onCancel = () => (dirty ? setCancelOpen(true) : leave());

  const busy = saveMut.isPending;
  const saveState: "saved" | "unsaved" | "saving" | "failed" = busy
    ? "saving"
    : saveMut.isError || conflict
      ? "failed"
      : dirty
        ? "unsaved"
        : "saved";

  const editingIndex = state.cards.findIndex((c) => c.key === editingKey);
  const editingCard = editingIndex >= 0 ? state.cards[editingIndex] : null;

  const subjectLine = [ctx.data?.klass?.subject?.name ?? null, state.formLevel.trim() || null]
    .filter(Boolean)
    .join(" • ");

  return (
    <ClassShell
      data={ctx.data}
      isLoading={ctx.isLoading}
      role={variant}
      section="flashcards"
      basePath={basePath}
      materialsPath={materialsPath}
      breadcrumbs={breadcrumbs}
    >
      {!ctx.isLoading && !ctx.data?.klass ? (
        <TenantEmptyState
          title="Class unavailable"
          body="This class no longer exists or is not part of your centre."
        />
      ) : !canManage && !ctx.isLoading ? (
        <TenantEmptyState
          title="Not available"
          body="You don't have permission to manage flashcards for this class."
        />
      ) : !isNew && deckQ.isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading deck…
        </div>
      ) : !isNew && deckQ.error ? (
        <div className="rounded-3xl border border-red-200 bg-white p-6 text-center">
          <p className="mb-3 text-sm text-red-600">
            Couldn't load this deck. {mapFlashcardError(deckQ.error)}
          </p>
          <Button variant="outline" onClick={() => deckQ.refetch()} className="rounded-full">
            <RefreshCcw className="mr-1.5 h-4 w-4" /> Retry
          </Button>
        </div>
      ) : (
        <FlashcardScreen className="-mx-4 px-4 pb-32 pt-1 sm:mx-0 sm:px-0">
          <div className="space-y-4">
            {conflict && (
              <div className="flex flex-col gap-3 rounded-[24px] border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-[13px] text-amber-800">
                    This deck was updated by another manager. Reload the latest version before saving.
                    Your unsaved edits stay here until you reload or discard them.
                  </p>
                </div>
                <Button variant="outline" className="shrink-0 rounded-full" onClick={reloadLatest}>
                  <RefreshCcw className="mr-1.5 h-4 w-4" /> Reload latest
                </Button>
              </div>
            )}

            {/* Deck hero */}
            <FlashcardHero
              eyebrow="Deck builder"
              title={state.title.trim() || "Untitled deck"}
              subtitle={subjectLine || "Add a title, then build the cards students will study."}
              art={FLASHCARD_ART.libraryHero}
            >
              <div className="grid grid-cols-3 gap-2">
                <HeroStat label="Cards" value={state.cards.length} />
                <HeroStat label="Ready" value={validation.canPublish ? "Yes" : "No"} />
                <HeroStat label="Status" value={FLASHCARD_STATUS_LABEL[status]} />
              </div>
            </FlashcardHero>

            {/* Workspace tabs + save state */}
            <div className="flex items-center gap-2">
              <div
                role="tablist"
                aria-label="Deck builder sections"
                className="flex flex-1 gap-1 rounded-full border border-violet-100 bg-white p-1"
              >
                {(["cards", "settings"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={
                      tab === t
                        ? "min-h-[40px] flex-1 rounded-full bg-violet-600 text-[13.5px] font-bold text-white"
                        : "min-h-[40px] flex-1 rounded-full text-[13.5px] font-bold text-slate-500"
                    }
                  >
                    {t === "cards" ? `Cards (${state.cards.length})` : "Settings"}
                  </button>
                ))}
              </div>
              <span
                className={
                  saveState === "failed"
                    ? "shrink-0 rounded-full bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-600"
                    : saveState === "saved"
                      ? "shrink-0 rounded-full bg-emerald-50 px-3 py-2 text-[12px] font-bold text-emerald-600"
                      : "shrink-0 rounded-full bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-600"
                }
              >
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "failed"
                    ? "Save failed"
                    : saveState === "unsaved"
                      ? "Unsaved"
                      : "Saved"}
              </span>
            </div>

            {tab === "cards" ? (
              <section className="space-y-3">
                {state.cards.length === 0 ? (
                  <FlashcardEmptyState
                    art={FLASHCARD_ART.empty}
                    title="No flashcards yet"
                    description="Create your first card to start building this deck."
                    action={
                      <Button
                        type="button"
                        onClick={addCard}
                        className="min-h-[46px] rounded-full bg-violet-600 px-6 font-bold hover:bg-violet-700"
                      >
                        <Plus className="mr-1.5 h-4 w-4" /> Add card
                      </Button>
                    }
                  />
                ) : (
                  <ol className="space-y-2.5">
                    {state.cards.map((card, i) => {
                      const front = facePreview(card.frontDoc, card.front);
                      const back = facePreview(card.backDoc, card.back);
                      const hasImage = !!(card.frontImage.image_path || card.backImage.image_path);
                      const hasMath = docHasMath(card.frontDoc) || docHasMath(card.backDoc);
                      return (
                        <li
                          key={card.key}
                          className="rounded-[24px] border border-violet-100 bg-white p-3.5 shadow-[0_12px_30px_-24px_rgba(76,29,149,0.5)]"
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-sky-100 text-[13px] font-black tabular-nums text-violet-700">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingKey(card.key)}
                              className="min-w-0 flex-1 text-left"
                              aria-label={`Edit card ${i + 1}`}
                            >
                              <p className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-slate-900">
                                {front || "Empty front — tap to add content"}
                              </p>
                              {back && (
                                <p className="mt-1 line-clamp-1 text-[13px] text-slate-500">{back}</p>
                              )}
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {hasImage && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[11.5px] font-bold text-violet-600">
                                    <ImageIcon className="h-3 w-3" /> Image
                                  </span>
                                )}
                                {hasMath && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-[11.5px] font-bold text-sky-600">
                                    <Sigma className="h-3 w-3" /> Equation
                                  </span>
                                )}
                                {card.tags.slice(0, 2).map((t) => (
                                  <span
                                    key={t}
                                    className="rounded-full bg-slate-100 px-2 py-1 text-[11.5px] font-semibold text-slate-500"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </button>
                            <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
                          </div>

                          <div className="mt-2 flex items-center justify-end gap-1 border-t border-violet-50 pt-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 rounded-full"
                              onClick={() => moveCard(card.key, -1)}
                              disabled={i === 0}
                              aria-label={`Move card ${i + 1} up`}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 rounded-full"
                              onClick={() => moveCard(card.key, 1)}
                              disabled={i === state.cards.length - 1}
                              aria-label={`Move card ${i + 1} down`}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 rounded-full"
                              onClick={() => duplicateCard(card.key)}
                              aria-label={`Duplicate card ${i + 1}`}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 rounded-full text-rose-600 hover:text-rose-700"
                              onClick={() => removeCard(card.key)}
                              aria-label={`Remove card ${i + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="ml-1 min-h-[38px] rounded-full text-[13px]"
                              onClick={() => setEditingKey(card.key)}
                            >
                              <Eye className="mr-1.5 h-3.5 w-3.5" /> Edit
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {state.cards.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addCard}
                    className="min-h-[48px] w-full rounded-full border-dashed border-violet-300 bg-white text-[14.5px] font-bold text-violet-700"
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> Add card
                  </Button>
                )}

                {!validation.canPublish && (
                  <ul className="list-disc space-y-1 pl-5 text-[12px] text-slate-500">
                    {validation.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </section>
            ) : (
              <section className="space-y-4">
                {/* General */}
                <div className="space-y-4 rounded-[24px] border border-violet-100 bg-white p-4 shadow-[0_12px_30px_-24px_rgba(76,29,149,0.5)]">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-500">General</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="deck-title" className="text-[12.5px] font-semibold text-slate-700">
                      Deck title
                    </Label>
                    <Input
                      id="deck-title"
                      value={state.title}
                      onChange={(e) => patch((s) => ({ ...s, title: e.target.value }))}
                      placeholder="e.g. Form 4 Biology — Cell Structure"
                      className="min-h-[46px] rounded-2xl border-slate-200 text-[15px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deck-desc" className="text-[12.5px] font-semibold text-slate-700">
                      Description (optional)
                    </Label>
                    <Textarea
                      id="deck-desc"
                      value={state.description}
                      onChange={(e) => patch((s) => ({ ...s, description: e.target.value }))}
                      placeholder="What should students revise with this deck?"
                      className="min-h-[88px] rounded-2xl border-slate-200 text-[15px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deck-form" className="text-[12.5px] font-semibold text-slate-700">
                      Form / year (optional)
                    </Label>
                    <Input
                      id="deck-form"
                      value={state.formLevel}
                      onChange={(e) => patch((s) => ({ ...s, formLevel: e.target.value }))}
                      placeholder="e.g. Form 4"
                      className="min-h-[46px] rounded-2xl border-slate-200 text-[15px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="deck-folder" className="text-[12.5px] font-semibold text-slate-700">
                      Folder
                    </Label>
                    <FolderSelect
                      id="deck-folder"
                      folders={folders}
                      value={folderId}
                      onChange={(next) => {
                        setFolderId(next);
                        setDirty(true);
                      }}
                    />
                  </div>
                  <p className="text-[12px] text-slate-500">
                    This deck belongs to {ctx.data?.klass?.title ?? "this class"}. Enrolled students in
                    that class can study it once it is published.
                  </p>
                </div>

                {/* Cover */}
                <div className="rounded-[24px] border border-violet-100 bg-white p-4 shadow-[0_12px_30px_-24px_rgba(76,29,149,0.5)]">
                  <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-violet-500">
                    Deck cover
                  </p>
                  <FlashcardMediaEditor
                    centerId={centerId}
                    fieldId="deck-cover"
                    folder="covers"
                    label="Cover image (optional)"
                    hint="Shown on the deck card in the library. JPG, PNG or WebP up to 10 MB."
                    value={{
                      image_path: state.coverPath,
                      image_width: null,
                      image_height: null,
                      image_alt: null,
                      image_crop: null,
                    }}
                    onChange={(p) => {
                      if ("image_path" in p) patch((s) => ({ ...s, coverPath: p.image_path ?? null }));
                    }}
                  />
                </div>

                {/* Publication */}
                <div className="rounded-[24px] border border-violet-100 bg-white p-4 shadow-[0_12px_30px_-24px_rgba(76,29,149,0.5)]">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-500">
                    Publication
                  </p>
                  {isNew ? (
                    <p className="mt-2 text-[13px] text-slate-500">
                      Save this deck first. You can then publish it for students.
                    </p>
                  ) : (
                    <>
                      <div className="mt-3 flex gap-1 rounded-full border border-violet-100 bg-violet-50/60 p-1">
                        {(["draft", "published"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => status !== s && statusMut.mutate(s)}
                            disabled={statusMut.isPending}
                            aria-pressed={status === s}
                            className={
                              status === s
                                ? "min-h-[42px] flex-1 rounded-full bg-violet-600 text-[13.5px] font-bold text-white"
                                : "min-h-[42px] flex-1 rounded-full text-[13.5px] font-bold text-slate-500"
                            }
                          >
                            {FLASHCARD_STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[12.5px] text-slate-500">
                        {status === "published"
                          ? "Published — enrolled students in this class can study this deck."
                          : status === "archived"
                            ? "Archived — students cannot study this deck."
                            : "Draft — students cannot study this deck yet."}
                      </p>
                    </>
                  )}
                </div>

                {/* Study options */}
                <div className="space-y-3 rounded-[24px] border border-violet-100 bg-white p-4 shadow-[0_12px_30px_-24px_rgba(76,29,149,0.5)]">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-500">
                    Study options
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="deck-show-progress" className="text-[13.5px] font-normal text-slate-600">
                      Show progress while studying
                    </Label>
                    <Switch
                      id="deck-show-progress"
                      checked={state.showProgress}
                      onCheckedChange={(v) => patch((s) => ({ ...s, showProgress: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="deck-award-xp" className="text-[13.5px] font-normal text-slate-600">
                      Award XP for finishing this deck
                    </Label>
                    <Switch
                      id="deck-award-xp"
                      checked={state.awardXp}
                      onCheckedChange={(v) => patch((s) => ({ ...s, awardXp: v }))}
                    />
                  </div>
                </div>

                {/* Stats */}
                {!isNew && deckQ.data && (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <StatTile label="Cards" value={state.cards.length} />
                    <StatTile label="Status" value={FLASHCARD_STATUS_LABEL[status]} />
                    <StatTile label="Created" value={formatFlashcardDate(deckQ.data.created_at)} />
                    <StatTile label="Updated" value={formatFlashcardDate(deckQ.data.updated_at)} />
                  </div>
                )}

                {/* Danger zone */}
                {!isNew && (
                  <div className="rounded-[24px] border border-rose-100 bg-rose-50/50 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-rose-500">
                      Danger zone
                    </p>
                    <p className="mt-1.5 text-[13px] text-slate-600">
                      Deleting a deck removes it and its cards from this class. If students have already
                      studied it, the deck is archived instead so their history stays intact.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDeleteOpen(true)}
                      className="mt-3 min-h-[46px] rounded-full border-rose-200 text-[14px] font-bold text-rose-600 hover:text-rose-700"
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" /> Delete deck
                    </Button>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* Sticky action bar */}
          <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-violet-100 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
            <div className="mx-auto flex max-w-6xl items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="min-h-[46px] shrink-0 rounded-full px-3"
                onClick={onCancel}
                disabled={busy}
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-[46px] flex-1 rounded-full text-[14px] font-bold"
                onClick={() => saveMut.mutate({ publish: false })}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-4 w-4" />
                )}
                {isNew || status === "draft" ? "Save draft" : "Save changes"}
              </Button>
              <Button
                type="button"
                className="min-h-[46px] flex-1 rounded-full bg-violet-600 text-[14px] font-bold hover:bg-violet-700"
                onClick={() => saveMut.mutate({ publish: true })}
                disabled={busy || !validation.canPublish}
                title={validation.canPublish ? undefined : validation.errors.join(" ")}
              >
                <Send className="mr-1.5 h-4 w-4" /> Publish
              </Button>
            </div>
          </div>
        </FlashcardScreen>
      )}

      {/* Card editor */}
      <CardEditorSheet
        open={!!editingCard}
        onOpenChange={(o) => !o && setEditingKey(null)}
        card={editingCard}
        index={editingIndex < 0 ? 0 : editingIndex}
        total={state.cards.length}
        deckTitle={state.title.trim()}
        centerId={centerId}
        saveState={saveState}
        onContent={(side, doc) => editingCard && setCardContent(editingCard.key, side, doc)}
        onImage={(side, p) => editingCard && setCardImage(editingCard.key, side, p)}
        onTags={(raw) => editingCard && setCardTags(editingCard.key, raw)}
        onDuplicate={() => {
          if (!editingCard) return;
          duplicateCard(editingCard.key);
          setEditingKey(null);
        }}
        onDelete={() => {
          if (!editingCard) return;
          removeCard(editingCard.key);
          setEditingKey(null);
        }}
        onPrev={() => {
          const prev = state.cards[editingIndex - 1];
          if (prev) setEditingKey(prev.key);
        }}
        onNext={() => {
          const next = state.cards[editingIndex + 1];
          if (next) setEditingKey(next.key);
        }}
        onSave={() => saveMut.mutate({ publish: false })}
      />

      {/* Cancel with unsaved changes */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to this deck have not been saved to the server yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                clearDraft();
                leave();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete deck */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this deck?</AlertDialogTitle>
            <AlertDialogDescription>
              {state.title.trim() || "This deck"} and its cards will be removed from this class. If
              students have already studied it, it is archived instead so their history stays intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep deck</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteMut.mutate();
              }}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete deck"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Local draft recovery */}
      <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore your unsaved draft?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes for this deck stored on this device. Restore them, or discard
              and continue with the saved version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                clearDraft();
                setRestoreOpen(false);
              }}
            >
              Discard draft
            </AlertDialogCancel>
            <AlertDialogAction onClick={restoreDraft}>Restore draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ClassShell>
  );
}

export default ClassFlashcardBuilder;
