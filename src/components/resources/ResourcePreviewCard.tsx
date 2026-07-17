import { ReactNode, useState } from "react";
import {
  Video,
  FileText,
  ClipboardList,
  Link as LinkIcon,
  File as FileIcon,
  PlayCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ClassResourceLike,
  ResourceCategory,
  buildResourcePreview,
  useSignedThumbnailUrl,
} from "@/lib/classResources";
import { PdfThumbnail } from "@/components/resources/PdfThumbnail";

export type PreviewResource = ClassResourceLike & {
  id: string;
  title: string;
  status?: string | null;
  resource_type: string;
  created_at?: string | null;
  published_at?: string | null;
};

const CATEGORY_META: Record<
  ResourceCategory,
  { label: string; Icon: typeof Video; cover: string }
> = {
  video: {
    label: "Video",
    Icon: PlayCircle,
    cover: "bg-gradient-to-br from-rose-500 via-rose-600 to-slate-900",
  },
  pdf: {
    label: "PDF",
    Icon: ClipboardList,
    cover: "bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600",
  },
  note: {
    label: "Note",
    Icon: FileText,
    cover: "bg-gradient-to-br from-sky-400 via-sky-500 to-indigo-600",
  },
  link: {
    label: "Link",
    Icon: LinkIcon,
    cover: "bg-gradient-to-br from-indigo-400 via-indigo-500 to-slate-800",
  },
  file: {
    label: "File",
    Icon: FileIcon,
    cover: "bg-gradient-to-br from-slate-400 via-slate-500 to-slate-700",
  },
};

interface ResourcePreviewCardProps {
  resource: PreviewResource;
  role: "tutor" | "student";
  actions?: ReactNode;
  dragHandle?: ReactNode;
  className?: string;
}

export function ResourcePreviewCard({
  resource,
  role,
  actions,
  dragHandle,
  className,
}: ResourcePreviewCardProps) {
  const preview = buildResourcePreview(resource);
  const meta = CATEGORY_META[preview.category];
  const isPublished = resource.status === "published";
  const [externalThumbFailed, setExternalThumbFailed] = useState(false);
  const [storedThumbFailed, setStoredThumbFailed] = useState(false);
  const [pdfFallbackFailed, setPdfFallbackFailed] = useState(false);

  const showTitleAsLink = role === "student" && preview.href;

  // Pre-generated stored thumbnail (private storage; signed URL cached).
  const storedThumb = useSignedThumbnailUrl(
    preview.storedThumbnailPath && !storedThumbFailed ? preview.storedThumbnailPath : null,
  );
  const storedThumbUrl = storedThumb.data ?? null;

  const hasStoredThumb = !!storedThumbUrl;
  const hasExternalThumb =
    !hasStoredThumb &&
    preview.category !== "pdf" &&
    preview.category !== "note" &&
    !!preview.thumbnailUrl &&
    !externalThumbFailed;

  const showLegacyPdfRender =
    !hasStoredThumb &&
    preview.category === "pdf" &&
    !!preview.pdfSource &&
    !pdfFallbackFailed;

  const showFallbackCover = !hasStoredThumb && !hasExternalThumb && !showLegacyPdfRender;

  const cover = (
    <div
      className={cn(
        "relative w-full aspect-video overflow-hidden rounded-t-2xl bg-slate-100",
        meta.cover,
      )}
    >
      {/* Pre-generated preview image from private storage */}
      {hasStoredThumb && (
        <img
          src={storedThumbUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover bg-white"
          onError={() => setStoredThumbFailed(true)}
        />
      )}

      {/* External thumbnail (YouTube / favicon) */}
      {hasExternalThumb && (
        <img
          src={preview.thumbnailUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(
            "absolute inset-0 w-full h-full",
            preview.category === "link" ? "object-contain p-6 bg-white" : "object-cover",
          )}
          onError={() => setExternalThumbFailed(true)}
        />
      )}

      {/* Legacy PDF first-page render (for rows without stored thumbnail) */}
      {showLegacyPdfRender && (
        <div className="absolute inset-0 bg-white">
          <PdfThumbnail
            source={preview.pdfSource!}
            onError={() => setPdfFallbackFailed(true)}
          />
        </div>
      )}

      {/* Branded gradient fallback with type + hostname/filename */}
      {showFallbackCover && (
        <div className="absolute inset-0 flex flex-col justify-between p-3 text-white">
          <div className="flex items-center gap-1.5">
            <meta.Icon className="w-4 h-4 opacity-95" />
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-95">
              {meta.label}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug line-clamp-2 break-words drop-shadow">
              {resource.title}
            </p>
            {(preview.hostname || preview.filename) && (
              <p className="text-[10px] opacity-85 truncate mt-0.5">
                {preview.hostname ?? preview.filename}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Play overlay for videos with a real thumbnail */}
      {preview.category === "video" && (hasStoredThumb || hasExternalThumb) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <PlayCircle className="w-10 h-10 text-white drop-shadow" />
        </div>
      )}

      {/* Drag handle overlay (tutor arrange mode) */}
      {dragHandle && (
        <div className="absolute top-2 left-2 z-10 rounded-full bg-white/90 backdrop-blur-sm shadow-sm">
          {dragHandle}
        </div>
      )}

      {/* Draft badge overlay so tutors can eyeball unpublished tiles */}
      {role === "tutor" && !isPublished && (
        <div className="absolute top-2 right-2 z-10">
          <Badge className="rounded-full bg-white/90 text-slate-700 border-0 text-[10px] px-2 py-0 shadow-sm">
            Draft
          </Badge>
        </div>
      )}
    </div>
  );

  return (
    <Card
      className={cn(
        "group flex flex-col h-full overflow-hidden rounded-2xl bg-white/90 border-slate-200",
        "shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_28px_rgb(0,0,0,0.08)] transition-shadow",
        className,
      )}
    >
      {cover}
      <div className="flex-1 min-w-0 flex flex-col gap-2 p-4">
        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <Badge
            variant="outline"
            className="rounded-full text-[10px] px-2 py-0 border-slate-200 text-slate-500"
          >
            {meta.label}
          </Badge>
          {role === "tutor" && isPublished && (
            <Badge className="rounded-full text-[10px] px-2 py-0 border-0 bg-emerald-100 text-emerald-700">
              Published
            </Badge>
          )}
          {preview.hostname ? (
            <span className="text-[11px] text-slate-400 truncate min-w-0 max-w-full">
              {preview.hostname}
            </span>
          ) : preview.filename ? (
            <span className="text-[11px] text-slate-400 truncate min-w-0 max-w-full">
              {preview.filename}
            </span>
          ) : null}
        </div>

        {/* Title — reserved 2 lines of height so cards align across the row */}
        <div className="min-w-0 min-h-[2.75rem]">
          {showTitleAsLink ? (
            <a
              href={preview.href!}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-slate-900 hover:underline break-words line-clamp-2 leading-snug"
              title={resource.title}
            >
              {resource.title}
            </a>
          ) : (
            <p
              className="font-semibold text-slate-900 break-words line-clamp-2 leading-snug"
              title={resource.title}
            >
              {resource.title}
            </p>
          )}
        </div>

        {/* Description — always reserves a fixed 2 lines to keep card heights consistent */}
        <p
          className={cn(
            "text-xs text-slate-500 break-words line-clamp-2 min-h-[2rem]",
            !(preview.excerpt || resource.description) && "opacity-0",
          )}
        >
          {preview.excerpt || resource.description || "\u00A0"}
        </p>

        {actions && (
          <div className="mt-auto pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1 min-w-0">
            {actions}
          </div>
        )}
      </div>
    </Card>
  );
}
