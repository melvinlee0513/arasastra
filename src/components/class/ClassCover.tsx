import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { fallbackGradient, getClassCoverSignedUrl } from "@/lib/classCovers";
import { cn } from "@/lib/utils";

interface ClassCoverProps {
  classId: string;
  coverPath?: string | null;
  /** cover_image_updated_at from `classes` — used to cache-bust signed URLs. */
  version?: string | null;
  className?: string;
  /** Priority = eager decode (used above the fold). */
  priority?: boolean;
  /** Optional subject/status overlay children. */
  overlay?: React.ReactNode;
  alt?: string;
}

/**
 * 16:9 class cover with a branded gradient fallback and cached signed URL.
 * Reserves aspect ratio to prevent layout shift while the URL is signing.
 */
export function ClassCover({
  classId,
  coverPath,
  version,
  className,
  priority,
  overlay,
  alt = "Class cover",
}: ClassCoverProps) {
  const cover = useQuery({
    queryKey: ["class-cover-signed", coverPath, version],
    enabled: !!coverPath,
    // Signed URLs live ~1h — refresh conservatively.
    staleTime: 45 * 60_000,
    gcTime: 60 * 60_000,
    queryFn: () => getClassCoverSignedUrl(coverPath!),
  });

  const gradient = fallbackGradient(classId);
  const url = cover.data ?? null;

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden bg-gradient-to-br",
        gradient,
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <GraduationCap className="w-14 h-14 text-slate-400/60" strokeWidth={1.25} />
        </div>
      )}
      {overlay}
    </div>
  );
}
