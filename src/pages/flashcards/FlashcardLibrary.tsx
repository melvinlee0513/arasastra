/**
 * Tutor/Admin flashcard library — every deck the signed-in manager can edit,
 * across all of their classes in the current centre.
 *
 * `list_flashcard_decks_for_manager` resolves centre, role and class assignment
 * server-side, so this page never filters tenant data in the browser. Deck
 * actions go through the existing RPC wrappers, which re-check authorisation.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  Eye,
  Layers,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";
import { FlashcardMedia } from "@/components/flashcards/FlashcardMedia";
import {
  DeckTile,
  FilterChips,
  FlashcardEmptyState,
  FlashcardHero,
  FlashcardScreen,
  HeroStat,
} from "@/components/flashcards/FlashcardChrome";
import { FLASHCARD_ART } from "@/lib/flashcardArt";
import { cn } from "@/lib/utils";
import {
  FLASHCARD_STATUS_LABEL,
  deleteFlashcardDeckSafe,
  duplicateFlashcardDeckAsDraft,
  flashcardLibraryKeys,
  formatFlashcardRelative,
  listFlashcardDecksForManager,
  mapFlashcardError,
  setFlashcardDeckStatus,
  type FlashcardDeckManagerRow,
} from "@/lib/flashcards";

type Variant = "tutor" | "admin";
type Filter = "all" | "published" | "draft" | "mine";
const ALL_SUBJECTS = "__all__";

export function FlashcardLibrary({ variant }: { variant: Variant }) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const flashcardsOn = useFeatureEnabled("flashcards");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [subject, setSubject] = useState<string>(ALL_SUBJECTS);
  const [pendingDelete, setPendingDelete] = useState<FlashcardDeckManagerRow | null>(null);

  const listKey = flashcardLibraryKeys.manager(currentTenantId, user?.id);

  const decksQ = useQuery({
    queryKey: listKey,
    enabled: !!user && flashcardsOn,
    queryFn: listFlashcardDecksForManager,
    staleTime: 15_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: listKey });

  const duplicateM = useMutation({
    mutationFn: (deckId: string) => duplicateFlashcardDeckAsDraft(deckId),
    onSuccess: async () => {
      await refresh();
      toast.success("Deck duplicated as a draft.");
    },
    onError: (err) => toast.error(mapFlashcardError(err, "Couldn't duplicate this deck.")),
  });

  const statusM = useMutation({
    mutationFn: ({ deckId, publish }: { deckId: string; publish: boolean }) =>
      setFlashcardDeckStatus(deckId, publish ? "published" : "draft"),
    onSuccess: async (_res, vars) => {
      await refresh();
      toast.success(vars.publish ? "Deck published for students." : "Deck moved back to draft.");
    },
    onError: (err) => toast.error(mapFlashcardError(err, "Couldn't update this deck.")),
  });

  const deleteM = useMutation({
    mutationFn: (deckId: string) => deleteFlashcardDeckSafe(deckId),
    onSuccess: async () => {
      setPendingDelete(null);
      await refresh();
      toast.success("Deck deleted.");
    },
    onError: (err) => toast.error(mapFlashcardError(err, "Couldn't delete this deck.")),
  });

  const allDecks = decksQ.data ?? [];

  const subjects = useMemo(
    () =>
      Array.from(
        new Set(allDecks.map((d) => d.subject_name).filter((s): s is string => !!s && s.length > 0)),
      ).sort((a, b) => a.localeCompare(b)),
    [allDecks],
  );

  const decks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allDecks.filter((d) => {
      if (filter === "published" && d.status !== "published") return false;
      if (filter === "draft" && d.status === "published") return false;
      if (filter === "mine" && d.created_by !== user?.id) return false;
      if (subject !== ALL_SUBJECTS && d.subject_name !== subject) return false;
      if (!term) return true;
      return (
        d.title.toLowerCase().includes(term) ||
        (d.class_title ?? "").toLowerCase().includes(term) ||
        (d.subject_name ?? "").toLowerCase().includes(term)
      );
    });
  }, [allDecks, filter, search, subject, user?.id]);

  if (!flashcardsOn) return <FeatureUnavailable feature="Flashcards" />;

  const basePath = variant === "admin" ? "/admin" : "/tutor";
  const classesPath = variant === "admin" ? "/admin/curriculum" : "/tutor/classes";
  const publishedCount = allDecks.filter((d) => d.status === "published").length;
  const draftCount = allDecks.length - publishedCount;
  const mineCount = allDecks.filter((d) => d.created_by === user?.id).length;
  const totalCards = allDecks.reduce((n, d) => n + (d.card_count ?? 0), 0);
  const busyDeckId =
    duplicateM.isPending || statusM.isPending
      ? (statusM.variables?.deckId ?? duplicateM.variables ?? null)
      : null;

  return (
    <FlashcardScreen>
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6">
        <FlashcardHero
          eyebrow="Flashcard library"
          title="Your flashcard decks"
          subtitle="Create and manage engaging study decks for your students."
          art={FLASHCARD_ART.libraryHero}
        >
          <div className="grid grid-cols-3 gap-2">
            <HeroStat label="Decks" value={allDecks.length} />
            <HeroStat label="Cards" value={totalCards} />
            <HeroStat label="Published" value={publishedCount} />
          </div>
        </FlashcardHero>

        <div className="mt-4 space-y-2.5">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by deck, subject or class…"
                aria-label="Search flashcard decks"
                className="min-h-[46px] rounded-full border-violet-100 bg-white pl-10 text-[14.5px] shadow-[0_10px_26px_-20px_rgba(76,29,149,0.5)]"
              />
            </div>
            {subjects.length > 1 && (
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger
                  aria-label="Filter decks by subject"
                  className="min-h-[46px] rounded-full border-violet-100 bg-white text-[14px] font-semibold sm:w-56"
                >
                  <SelectValue placeholder="All subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SUBJECTS}>All subjects</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <FilterChips
            ariaLabel="Filter decks"
            active={filter}
            onSelect={(k) => setFilter(k as Filter)}
            options={[
              { key: "all", label: "All", count: allDecks.length },
              { key: "published", label: "Published", count: publishedCount },
              { key: "draft", label: "Draft", count: draftCount },
              { key: "mine", label: "My decks", count: mineCount },
            ]}
          />
        </div>

        {decksQ.isLoading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-44 rounded-[28px]" />
            <Skeleton className="h-44 rounded-[28px]" />
            <Skeleton className="h-44 rounded-[28px]" />
          </div>
        ) : decksQ.isError ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-[28px] border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-[14px] font-bold text-slate-900">Couldn't load your decks</p>
              <p className="mt-0.5 text-[13px] text-slate-600">{mapFlashcardError(decksQ.error)}</p>
              <Button variant="outline" className="mt-3 rounded-full" onClick={() => void decksQ.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : decks.length === 0 ? (
          <div className="mt-4">
            <FlashcardEmptyState
              art={FLASHCARD_ART.empty}
              title={allDecks.length === 0 ? "No flashcard decks yet" : "No decks match those filters"}
              description={
                allDecks.length === 0
                  ? "Open one of your classes and add a flashcard deck to get started."
                  : "Try a different word, subject or status."
              }
              action={
                allDecks.length === 0 ? (
                  <Button asChild className="rounded-full bg-violet-600 hover:bg-violet-700">
                    <Link to={classesPath}>
                      <Plus className="mr-1.5 h-4 w-4" /> Create deck
                    </Link>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      setSearch("");
                      setFilter("all");
                      setSubject(ALL_SUBJECTS);
                    }}
                  >
                    Clear filters
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {decks.map((deck) => (
              <li key={deck.id}>
                <DeckCard
                  deck={deck}
                  basePath={basePath}
                  busy={busyDeckId === deck.id}
                  onDuplicate={() => duplicateM.mutate(deck.id)}
                  onToggleStatus={() =>
                    statusM.mutate({ deckId: deck.id, publish: deck.status !== "published" })
                  }
                  onDelete={() => setPendingDelete(deck)}
                  onPreview={() => navigate(`${basePath}/classes/${deck.class_id}/flashcards/${deck.id}/edit`)}
                />
              </li>
            ))}
          </ul>
        )}

        {allDecks.length > 0 && (
          <div className="pointer-events-none sticky bottom-4 z-10 mt-5 flex justify-center">
            <Button
              asChild
              className="pointer-events-auto h-12 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-6 text-[15px] font-extrabold text-white shadow-[0_18px_34px_-14px_rgba(109,40,217,0.9)] hover:from-violet-700 hover:to-indigo-700"
            >
              <Link to={classesPath}>
                <Plus className="mr-1.5 h-4 w-4" /> Create deck
              </Link>
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this deck?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” and its {pendingDelete?.card_count ?? 0} card
              {pendingDelete?.card_count === 1 ? "" : "s"} will be removed for your students. This can't be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Keep deck</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-rose-600 hover:bg-rose-700"
              disabled={deleteM.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteM.mutate(pendingDelete.id);
              }}
            >
              {deleteM.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete deck
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FlashcardScreen>
  );
}

function DeckCard({
  deck,
  basePath,
  busy,
  onDuplicate,
  onToggleStatus,
  onDelete,
  onPreview,
}: {
  deck: FlashcardDeckManagerRow;
  basePath: string;
  busy: boolean;
  onDuplicate: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const editPath = `${basePath}/classes/${deck.class_id}/flashcards/${deck.id}/edit`;
  const published = deck.status === "published";
  return (
    <div className="flex h-full flex-col rounded-[28px] border border-violet-100 bg-white p-4 shadow-[0_16px_36px_-26px_rgba(76,29,149,0.5)] transition hover:border-violet-200 hover:shadow-[0_20px_40px_-22px_rgba(76,29,149,0.55)]">
      {deck.cover_path ? (
        <FlashcardMedia
          media={{ image_path: deck.cover_path, image_alt: `${deck.title} cover` }}
          className="mb-3"
          enableLightbox={false}
        />
      ) : null}

      <div className="flex items-start gap-3">
        <DeckTile />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold leading-snug text-slate-900">{deck.title}</p>
          <p className="mt-0.5 truncate text-[12px] font-semibold text-slate-500">
            {deck.subject_name ? `${deck.subject_name} · ` : ""}
            {deck.class_title ?? "Class"}
            {deck.form_level ? ` · ${deck.form_level}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black",
            published ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
          )}
        >
          {FLASHCARD_STATUS_LABEL[deck.status]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-bold text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          {deck.card_count} card{deck.card_count === 1 ? "" : "s"}
        </span>
        {typeof deck.students_accessed === "number" && (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {deck.students_accessed} studying
          </span>
        )}
        <span>Updated {formatFlashcardRelative(deck.updated_at)}</span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          asChild
          className="min-h-[44px] flex-1 rounded-full bg-violet-600 text-[13.5px] font-bold hover:bg-violet-700"
        >
          <Link to={editPath}>
            <Pencil className="mr-1.5 h-4 w-4" /> Edit
          </Link>
        </Button>
        <Button
          variant="outline"
          onClick={onPreview}
          className="min-h-[44px] flex-1 rounded-full text-[13.5px] font-bold"
        >
          <Eye className="mr-1.5 h-4 w-4" /> Preview
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={`More actions for ${deck.title}`}
              disabled={busy}
              className="h-11 w-11 shrink-0 rounded-full"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreVertical className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl">
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" /> Duplicate as draft
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleStatus}>
              <Upload className="mr-2 h-4 w-4" /> {published ? "Unpublish" : "Publish"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-rose-600 focus:text-rose-700" onSelect={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete deck
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default FlashcardLibrary;
