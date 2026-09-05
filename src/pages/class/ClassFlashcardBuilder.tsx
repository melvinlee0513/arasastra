import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Send,
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderSelect } from "@/components/class/FolderSelect";
import {
  fetchManagerContentTree,
  folderKeys,
  moveContentItem,
} from "@/lib/contentFolders";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/richtext/RichTextEditor";
import { parseRichValue, richDocToPlainText, type RichDoc } from "@/lib/richContent";


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
import {
  FLASHCARD_DRAFT_PREFIX,
  FLASHCARD_DRAFT_TTL_MS,
  FLASHCARD_STATUS_LABEL,
  type FlashcardDeckManagerDetail,
  flashcardManagerKeys,
  getFlashcardDeckForManager,
  isFlashcardConflict,
  mapFlashcardError,
  saveFlashcardDeck,
  validateFlashcardDeck,
} from "@/lib/flashcards";

type Variant = "tutor" | "admin";

interface Props {
  variant: Variant;
}

/** Local card row. `serverId` is null for cards not yet persisted. */
interface CardRow {
  /** Stable React key that survives typing and reordering. */
  key: string;
  serverId: string | null;
  front: string;
  back: string;
  /** Canonical rich content documents (null for untouched legacy cards). */
  frontDoc: RichDoc | null;
  backDoc: RichDoc | null;
}

interface BuilderState {
  title: string;
  description: string;
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
});

const emptyState = (): BuilderState => ({
  title: "",
  description: "",
  cards: [newCard()],
  definitionVersion: null,
});

function stateFromDetail(detail: FlashcardDeckManagerDetail): BuilderState {
  return {
    title: detail.title ?? "",
    description: detail.description ?? "",
    cards: (detail.cards ?? []).map((c) => ({
      key: `s-${c.id}`,
      serverId: c.id,
      front: c.front ?? "",
      back: c.back ?? "",
      frontDoc: parseRichValue(c.front_content ?? null, c.front ?? ""),
      backDoc: parseRichValue(c.back_content ?? null, c.back ?? ""),
    })),
    definitionVersion: detail.definition_version ?? null,
  };
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
  const [conflict, setConflict] = useState(false);
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
          cards: (parsed.cards ?? []).map((c) => ({
            key: c.key || nextKey(),
            serverId: c.serverId ?? null,
            front: c.front ?? "",
            back: c.back ?? "",
            frontDoc: parseRichValue(c.frontDoc ?? null, c.front ?? ""),
            backDoc: parseRichValue(c.backDoc ?? null, c.back ?? ""),
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
      const definition = {
        title: state.title,
        description: state.description,
        cards: state.cards.map((c) => ({ id: c.serverId, front: c.front, back: c.back })),
      };
      if (args.publish) {
        const v = validateFlashcardDeck(definition);
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

  const setCard = (key: string, field: "front" | "back", value: string) =>
    patch((s) => ({ ...s, cards: s.cards.map((c) => (c.key === key ? { ...c, [field]: value } : c)) }));

  const addCard = () =>
    patch((s) => ({ ...s, cards: [...s.cards, { key: nextKey(), serverId: null, front: "", back: "" }] }));

  const duplicateCard = (key: string) =>
    patch((s) => {
      const i = s.cards.findIndex((c) => c.key === key);
      if (i < 0) return s;
      const src = s.cards[i];
      const copy: CardRow = { key: nextKey(), serverId: null, front: src.front, back: src.back };
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

  const validation = validateFlashcardDeck({
    title: state.title,
    description: state.description,
    cards: state.cards.map((c) => ({ id: c.serverId, front: c.front, back: c.back })),
  });

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
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading deck…
        </div>
      ) : !isNew && deckQ.error ? (
        <div className="bg-white border border-red-200 rounded-3xl p-6 text-center">
          <p className="text-sm text-red-600 mb-3">
            Couldn't load this deck. {mapFlashcardError(deckQ.error)}
          </p>
          <Button variant="outline" onClick={() => deckQ.refetch()} className="rounded-full">
            <RefreshCcw className="w-4 h-4 mr-1.5" /> Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-4 pb-28">
          {conflict && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">
                  This deck was updated by another manager. Reload the latest version before saving.
                  Your unsaved edits stay here until you reload or discard them.
                </p>
              </div>
              <Button variant="outline" className="rounded-full shrink-0" onClick={reloadLatest}>
                <RefreshCcw className="w-4 h-4 mr-1.5" /> Reload latest
              </Button>
            </div>
          )}

          {/* Metadata */}
          <section className="bg-white border border-slate-200 rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Deck details</h2>
              {!isNew && (
                <>
                  <Badge variant="outline" className="rounded-full">
                    {FLASHCARD_STATUS_LABEL[status]}
                  </Badge>
                  {state.definitionVersion !== null && (
                    <Badge variant="secondary" className="rounded-full">
                      v{state.definitionVersion}
                    </Badge>
                  )}
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="deck-title">Title</Label>
              <Input
                id="deck-title"
                value={state.title}
                onChange={(e) => patch((s) => ({ ...s, title: e.target.value }))}
                placeholder="e.g. Form 4 Biology — Cell Structure"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deck-folder">Folder</Label>
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
            <div className="space-y-2">
              <Label htmlFor="deck-desc">Description (optional)</Label>
              <Textarea
                id="deck-desc"
                value={state.description}
                onChange={(e) => patch((s) => ({ ...s, description: e.target.value }))}
                placeholder="What should students revise with this deck?"
                className="rounded-2xl min-h-[80px]"
              />
            </div>
          </section>

          {/* Cards */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="text-lg font-semibold text-slate-900">
                Cards <span className="text-slate-400 font-normal">({state.cards.length})</span>
              </h2>
              <Button type="button" variant="outline" className="rounded-full" onClick={addCard}>
                <Plus className="w-4 h-4 mr-1.5" /> Add card
              </Button>
            </div>

            {state.cards.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-8 text-center">
                <p className="text-sm text-slate-500">
                  This deck has no cards yet. Drafts can be saved empty, but a deck needs at least
                  one complete card before it can be published.
                </p>
              </div>
            ) : (
              <ol className="space-y-3">
                {state.cards.map((card, i) => (
                  <li
                    key={card.key}
                    className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Card {i + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="rounded-full h-8 w-8"
                          onClick={() => moveCard(card.key, -1)}
                          disabled={i === 0}
                          aria-label={`Move card ${i + 1} up`}
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="rounded-full h-8 w-8"
                          onClick={() => moveCard(card.key, 1)}
                          disabled={i === state.cards.length - 1}
                          aria-label={`Move card ${i + 1} down`}
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="rounded-full h-8 w-8"
                          onClick={() => duplicateCard(card.key)}
                          aria-label={`Duplicate card ${i + 1}`}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="rounded-full h-8 w-8 text-red-600 hover:text-red-700"
                          onClick={() => removeCard(card.key)}
                          aria-label={`Remove card ${i + 1}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <Label htmlFor={`front-${card.key}`}>Front</Label>
                        <Textarea
                          id={`front-${card.key}`}
                          value={card.front}
                          onChange={(e) => setCard(card.key, "front", e.target.value)}
                          placeholder="Prompt or question"
                          className="rounded-2xl min-h-[72px] break-words"
                        />
                      </div>
                      <div className="space-y-1.5 min-w-0">
                        <Label htmlFor={`back-${card.key}`}>Back</Label>
                        <Textarea
                          id={`back-${card.key}`}
                          value={card.back}
                          onChange={(e) => setCard(card.key, "back", e.target.value)}
                          placeholder="Answer or explanation"
                          className="rounded-2xl min-h-[72px] break-words"
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {!validation.canPublish && (
            <ul className="text-xs text-slate-500 list-disc pl-5 space-y-1">
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {/* Sticky action bar */}
          <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur-sm px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-end gap-2">
              {dirty && <span className="text-xs text-slate-500 mr-auto">Unsaved changes</span>}
              <Button type="button" variant="ghost" className="rounded-full" onClick={onCancel} disabled={busy}>
                <X className="w-4 h-4 mr-1.5" /> Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => saveMut.mutate({ publish: false })}
                disabled={busy}
              >
                {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                {isNew || status === "draft" ? "Save draft" : "Save changes"}
              </Button>
              <Button
                type="button"
                className="rounded-full"
                onClick={() => saveMut.mutate({ publish: true })}
                disabled={busy || !validation.canPublish}
                title={validation.canPublish ? undefined : validation.errors.join(" ")}
              >
                <Send className="w-4 h-4 mr-1.5" /> Publish now
              </Button>
            </div>
          </div>
        </div>
      )}

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
