import { ReactNode } from "react";
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
  { label: string; Icon: typeof Video; tone: string }
> = {
  video: { label: "Video", Icon: Video, tone: "bg-rose-50 text-rose-600" },
  pdf: { label: "PDF", Icon: ClipboardList, tone: "bg-amber-50 text-amber-600" },
  note: { label: "Note", Icon: FileText, tone: "bg-sky-50 text-sky-600" },
  link: { label: "Link", Icon: LinkIcon, tone: "bg-indigo-50 text-indigo-600" },
  file: { label: "File", Icon: FileIcon, tone: "bg-slate-100 text-slate-600" },
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
  const { Icon, label, tone } = CATEGORY_META[preview.category];
  const isPublished = resource.status === "published";

  const thumb = (
    <div className="relative w-full sm:w-40 aspect-video shrink-0 overflow-hidden rounded-2xl bg-slate-100">
      {preview.thumbnailUrl ? (
        <img
          src={preview.thumbnailUrl}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className={cn("w-full h-full flex items-center justify-center", tone)}>
          <Icon className="w-8 h-8" />
        </div>
      )}
      {preview.category === "video" && preview.thumbnailUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <PlayCircle className="w-9 h-9 text-white drop-shadow" />
        </div>
      )}
    </div>
  );

  const showTitleAsLink = role === "student" && preview.href;

  return (
    <Card
      className={cn(
        "p-4 rounded-2xl bg-white/80 border-slate-200 flex flex-col sm:flex-row gap-4",
        className,
      )}
    >
      {dragHandle}
      {thumb}
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
                {label}
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
