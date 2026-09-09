/**
 * Tutor/Admin flashcard library — every deck the signed-in manager can edit,
 * across all of their classes in the current centre.
 *
 * `list_flashcard_decks_for_manager` resolves centre, role and class assignment
 * server-side, so this page never filters tenant data in the browser.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Layers, Pencil, Plus, Search, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";
import { useFeatureEnabled } from "@/hooks/useFeature";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FeatureUnavailable } from "@/pages/FeatureUnavailable";
import { FlashcardMedia } from "@/components/flashcards/FlashcardMedia";
import {
  FLASHCARD_STATUS_LABEL,
  flashcardLibraryKeys,
  listFlashcardDecksForManager,
  mapFlashcardError,
  type FlashcardDeckManagerRow,
} from "@/lib/flashcards";

type Variant = "tutor" | "admin";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
] as const;

export function FlashcardLibrary({ variant }: { variant: Variant }) {
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const flashcardsOn = useFeatureEnabled("flashcards");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const decksQ = useQuery({
    queryKey: flashcardLibraryKeys.manager(currentTenantId, user?.id),
    enabled: !!user && flashcardsOn,
    queryFn: listFlashcardDecksForManager,
    staleTime: 15_000,
  });

  const decks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (decksQ.data ?? []).filter((d) => {
      if (filter === "published" && d.status !== "published") return false;
      if (filter === "draft" && d.status === "published") return false;
      if (!term) return true;
      return (
        d.title.toLowerCase().includes(term) ||
        (d.class_title ?? "").toLowerCase().includes(term) ||
        (d.subject_name ?? "").toLowerCase().includes(term)
      );
    });
  }, [decksQ.data, filter, search]);

  if (!flashcardsOn) return <FeatureUnavailable feature="Flashcards" />;

  const basePath = variant === "admin" ? "/admin" : "/tutor";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-4 sm:px-6">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Flashcards
        </h1>
        <p className="mt-1 text-[13.5px] text-slate-500">
          Every deck across your classes. Open a class to create a new deck.
        </p>
      </header>

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search decks, classes or subjects"
            aria-label="Search flashcard decks"
            className="rounded-full pl-9"
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              type="button"
              variant={filter === f.key ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {decksQ.isLoading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      ) : decksQ.isError ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
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
        <div className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Layers className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-[15px] font-bold text-slate-900">
            {(decksQ.data ?? []).length === 0 ? "No decks yet" : "No decks match that search"}
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            {(decksQ.data ?? []).length === 0
              ? "Open one of your classes and add a flashcard deck to get started."
              : "Try a different word, or clear the filters."}
          </p>
          <Button asChild variant="outline" className="mt-5 rounded-full">
            <Link to={variant === "admin" ? "/admin/curriculum" : "/tutor/classes"}>
              <Plus className="mr-1.5 h-4 w-4" /> Go to my classes
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {decks.map((deck) => (
            <li key={deck.id}>
              <DeckCard deck={deck} basePath={basePath} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeckCard({ deck, basePath }: { deck: FlashcardDeckManagerRow; basePath: string }) {
  const editPath = `${basePath}/classes/${deck.class_id}/flashcards/${deck.id}/edit`;
  return (
    <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      {deck.cover_path ? (
        <FlashcardMedia
          media={{ image_path: deck.cover_path, image_alt: `${deck.title} cover` }}
          className="mb-3"
          enableLightbox={false}
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[15px] font-bold text-slate-900">{deck.title}</p>
        <Badge variant={deck.status === "published" ? "default" : "outline"} className="shrink-0 rounded-full">
          {FLASHCARD_STATUS_LABEL[deck.status]}
        </Badge>
      </div>
      <p className="mt-0.5 truncate text-[12.5px] text-slate-500">
        {deck.subject_name ? `${deck.subject_name} · ` : ""}
        {deck.class_title ?? "Class"}
        {deck.form_level ? ` · ${deck.form_level}` : ""}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-slate-500">
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
      </div>

      <Button asChild variant="outline" className="mt-4 rounded-full">
        <Link to={editPath}>
          <Pencil className="mr-1.5 h-4 w-4" /> Edit deck
        </Link>
      </Button>
    </div>
  );
}

export default FlashcardLibrary;
