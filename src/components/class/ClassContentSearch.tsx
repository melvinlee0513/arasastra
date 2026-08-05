import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileText, Folder, HelpCircle, Layers, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toSafeMessage } from "@/components/common/TenantGate";
import {
  folderPath,
  searchClassContentForManager,
  searchClassContentForStudent,
  folderKeys,
  type ContentFolder,
  type ContentSearchHit,
} from "@/lib/contentFolders";

interface Props {
  scope: "manager" | "student";
  classId: string;
  tenantId: string | null;
  userId?: string;
  folders: ContentFolder[];
  /** Root breadcrumb label, e.g. the class title. */
  rootLabel: string;
  /** Hide flashcard hits when the tenant has flashcards disabled. */
  flashcardsEnabled: boolean;
  onSelect: (hit: ContentSearchHit) => void;
  /** Notified so callers can disable arrange/reorder while a search is active. */
  onActiveChange?: (active: boolean) => void;
}

const ICONS: Record<ContentSearchHit["kind"], React.ReactNode> = {
  folder: <Folder className="w-4 h-4 text-primary" />,
  resource: <FileText className="w-4 h-4 text-sky-600" />,
  quiz: <HelpCircle className="w-4 h-4 text-amber-600" />,
  flashcard_deck: <Layers className="w-4 h-4 text-violet-600" />,
};

const KIND_LABEL: Record<ContentSearchHit["kind"], string> = {
  folder: "Folder",
  resource: "Material",
  quiz: "Quiz",
  flashcard_deck: "Flashcards",
};

/**
 * Class-wide, folder-aware search. Filtering happens inside the RPC so students
 * never receive draft or archived records — nothing is hidden client-side.
 */
export function ClassContentSearch({
  scope,
  classId,
  tenantId,
  userId,
  folders,
  rootLabel,
  flashcardsEnabled,
  onSelect,
  onActiveChange,
}: Props) {
  const [term, setTerm] = useState("");
  const trimmed = term.trim();
  const active = trimmed.length >= 2;

  const q = useQuery({
    queryKey: folderKeys.search(scope, tenantId, classId, trimmed),
    enabled: active,
    staleTime: 10_000,
    queryFn: () =>
      scope === "manager"
        ? searchClassContentForManager(classId, trimmed)
        : searchClassContentForStudent(classId, trimmed),
  });

  const hits = useMemo(
    () => (q.data ?? []).filter((h) => flashcardsEnabled || h.kind !== "flashcard_deck"),
    [q.data, flashcardsEnabled],
  );

  function setValue(v: string) {
    setTerm(v);
    onActiveChange?.(v.trim().length >= 2);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={term}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search folders, materials, quizzes…"
          aria-label="Search this class"
          className="pl-9 pr-9 rounded-full"
        />
        {term && (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full"
            onClick={() => setValue("")}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {active && (
        <div className="bg-white border border-slate-200 rounded-3xl p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {q.isLoading ? (
            <p className="text-sm text-slate-500 p-4 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Searching…
            </p>
          ) : q.isError ? (
            <p className="text-sm text-red-600 p-4">
              {toSafeMessage(q.error, "Couldn't search this class.")}
            </p>
          ) : hits.length === 0 ? (
            <p className="text-sm text-slate-500 p-4">No matches in this class.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {hits.map((hit) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(hit);
                      setValue("");
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-2xl hover:bg-slate-50 flex items-start gap-3"
                  >
                    <span className="mt-0.5 shrink-0">{ICONS[hit.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 break-words">
                          {hit.title}
                        </span>
                        <Badge variant="secondary" className="rounded-full text-[10px]">
                          {KIND_LABEL[hit.kind]}
                        </Badge>
                        {hit.status && hit.status !== "published" && (
                          <Badge className="rounded-full text-[10px] bg-amber-100 text-amber-700 capitalize">
                            {hit.status}
                          </Badge>
                        )}
                      </span>
                      <PathLine folders={folders} folderId={hit.folderId} rootLabel={rootLabel} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PathLine({
  folders,
  folderId,
  rootLabel,
}: {
  folders: ContentFolder[];
  folderId: string | null;
  rootLabel: string;
}) {
  const chain = folderPath(folders, folderId);
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
      <span className="break-words">{rootLabel}</span>
      {chain.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1">
          <ChevronRight className="w-3 h-3 text-slate-400" />
          <span className="break-words">{f.name}</span>
        </span>
      ))}
    </span>
  );
}
