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
  { label: string; Icon: typeof Video; tone: string; cover: string }
> = {
  video: {
    label: "Video",
    Icon: PlayCircle,
    tone: "bg-rose-50 text-rose-600",
    cover: "bg-gradient-to-br from-rose-500 via-rose-600 to-slate-900",
  },
  pdf: {
    label: "PDF",
    Icon: ClipboardList,
    tone: "bg-amber-50 text-amber-600",
    cover: "bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600",
  },
  note: {
    label: "Note",
    Icon: FileText,
    tone: "bg-sky-50 text-sky-600",
    cover: "bg-gradient-to-br from-sky-400 via-sky-500 to-indigo-600",
  },
  link: {
    label: "Link",
    Icon: LinkIcon,
    tone: "bg-indigo-50 text-indigo-600",
    cover: "bg-gradient-to-br from-indigo-400 via-indigo-500 to-slate-800",
  },
  file: {
    label: "File",
    Icon: FileIcon,
    tone: "bg-slate-100 text-slate-600",
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
  const [thumbFailed, setThumbFailed] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);

  const showTitleAsLink = role === "student" && preview.href;

  const showThumb =
    preview.category !== "pdf" &&
    preview.category !== "note" &&
    preview.thumbnailUrl &&
    !thumbFailed;

  const cover = (
    <div
      className={cn(
        "relative w-full sm:w-44 aspect-video shrink-0 overflow-hidden rounded-2xl",
        meta.cover,
      )}
    >
      {/* Real thumbnail when available */}
      {showThumb && (
        <img
          src={preview.thumbnailUrl!}
          alt=""
          loading="lazy"
          className={cn(
            "absolute inset-0 w-full h-full",
            preview.category === "link" ? "object-contain p-6 bg-white" : "object-cover",
          )}
          onError={() => setThumbFailed(true)}
        />
      )}

      {/* Lazy PDF first-page render */}
      {preview.category === "pdf" && preview.pdfSource && !pdfFailed && (
        <div className="absolute inset-0 bg-white">
          <PdfThumbnail
            source={preview.pdfSource}
            onError={() => setPdfFailed(true)}
          />
        </div>
      )}

      {/* Fallback gradient cover with title + hostname */}
      {(!showThumb && !(preview.category === "pdf" && preview.pdfSource && !pdfFailed)) && (
        <div className="absolute inset-0 flex flex-col justify-between p-3 text-white">
          <div className="flex items-center gap-1.5">
            <meta.Icon className="w-4 h-4 opacity-90" />
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-90">
              {meta.label}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug line-clamp-2 drop-shadow">
              {resource.title}
            </p>
            {(preview.hostname || preview.filename) && (
              <p className="text-[10px] opacity-80 truncate mt-0.5">
                {preview.hostname ?? preview.filename}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Play overlay for videos with a real thumbnail */}
      {preview.category === "video" && showThumb && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <PlayCircle className="w-10 h-10 text-white drop-shadow" />
        </div>
      )}
    </div>
  );

  return (
    <Card
      className={cn(
        "p-4 rounded-2xl bg-white/80 border-slate-200 flex flex-col sm:flex-row gap-4",
        className,
      )}
    >
      {dragHandle}
      {cover}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {showTitleAsLink ? (
              <a
                href={preview.href!}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-slate-900 hover:underline break-words"
              >
                {resource.title}
              </a>
            ) : (
              <p className="font-semibold text-slate-900 break-words">{resource.title}</p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Badge
                variant="outline"
                className="rounded-full text-[10px] px-2 py-0 border-slate-200 text-slate-500"
              >
                {meta.label}
              </Badge>
              {role === "tutor" && (
                <Badge
                  className={cn(
                    "rounded-full text-[10px] px-2 py-0 border-0",
                    isPublished
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  {isPublished ? "Published" : "Draft"}
                </Badge>
              )}
              {preview.hostname && (
                <span className="text-[11px] text-slate-400 truncate max-w-[220px]">
                  {preview.hostname}
                </span>
              )}
              {preview.filename && !preview.hostname && (
                <span className="text-[11px] text-slate-400 truncate max-w-[220px]">
                  {preview.filename}
                </span>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
        </div>
        {(preview.excerpt || resource.description) && (
          <p className="text-xs text-slate-500 line-clamp-2">
            {preview.excerpt || resource.description}
          </p>
        )}
      </div>
    </Card>
  );
}
