import { useEffect, useState } from "react";
import { ChevronRight, Folder, FolderOpen, HelpCircle, Layers, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClassCoverSignedUrl, fallbackGradient } from "@/lib/classCovers";
import { type ContentFolder, folderItemCount } from "@/lib/contentFolders";

/** Canonical folder cover path — `{center_id}/{class_id}/folders/{folder_id}/cover.webp`. */
export function folderCoverPathFor(centerId: string, classId: string, folderId: string): string {
  return `${centerId}/${classId}/folders/${folderId}/cover.webp`;
}

interface BreadcrumbProps {
  path: ContentFolder[];
  rootLabel: string;
  onNavigate: (folderId: string | null) => void;
}

export function FolderBreadcrumb({ path, rootLabel, onNavigate }: BreadcrumbProps) {
  return (
    <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium",
          path.length === 0 ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-slate-100",
        )}
      >
        <FolderOpen className="w-3.5 h-3.5" /> {rootLabel}
      </button>
      {path.map((f, i) => (
        <span key={f.id} className="inline-flex items-center gap-1">
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <button
            type="button"
            onClick={() => onNavigate(f.id)}
            className={cn(
              "rounded-full px-3 py-1.5 font-medium max-w-[45vw] truncate",
              i === path.length - 1
                ? "bg-primary/10 text-primary"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {f.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

interface FolderCardProps {
  folder: ContentFolder;
  classId: string;
  centerId?: string | null;
  onOpen: () => void;
  actions?: React.ReactNode;
  /** Subfolders render as a compact icon tile — no custom artwork required. */
  compact?: boolean;
}

export function FolderCard({
  folder,
  classId,
  centerId,
  onOpen,
  actions,
  compact = false,
}: FolderCardProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!folder.cover_image_path) {
      setCoverUrl(null);
      return () => {
        active = false;
      };
    }
    void getClassCoverSignedUrl(folder.cover_image_path).then((url) => {
      if (active) setCoverUrl(url);
    });
    return () => {
      active = false;
    };
  }, [folder.cover_image_path, folder.id, classId, centerId]);

  const items = folderItemCount(folder);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        className="text-left group"
        aria-label={`Open folder ${folder.name}`}
      >
        <div
          className={cn(
            "relative w-full bg-gradient-to-br",
            compact ? "aspect-[3/1]" : "aspect-square",
            fallbackGradient(folder.id),
          )}
        >
          {coverUrl && !compact ? (
            <img
              src={coverUrl}
              alt={`${folder.name} cover`}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Folder className={cn("text-primary/50", compact ? "w-7 h-7" : "w-12 h-12")} />
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-slate-900 break-words group-hover:text-primary">
            {folder.name}
          </h3>
          {folder.description && (
            <p className="text-xs text-slate-500 line-clamp-2 mt-1 break-words">
              {folder.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-slate-500">
            {folder.subfolder_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Folder className="w-3 h-3" /> {folder.subfolder_count}{" "}
                {folder.subfolder_count === 1 ? "subfolder" : "subfolders"}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <FileText className="w-3 h-3" /> {folder.resource_count}
            </span>
            {folder.quiz_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <HelpCircle className="w-3 h-3" /> {folder.quiz_count}
              </span>
            )}
            {folder.deck_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Layers className="w-3 h-3" /> {folder.deck_count}
              </span>
            )}
            {items === 0 && folder.subfolder_count === 0 && <span>Empty</span>}
          </div>
        </div>
      </button>
      {actions && (
        <div className="px-4 pb-4 mt-auto flex flex-wrap items-center gap-1.5">{actions}</div>
      )}
    </div>
  );
}


export function FolderGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
    >
      {children}
    </div>
  );
}
