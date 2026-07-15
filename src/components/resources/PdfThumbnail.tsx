import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getSignedFileUrl, splitFilePath } from "@/lib/classResources";

interface PdfThumbnailProps {
  source: { kind: "external"; url: string } | { kind: "storage"; filePath: string };
  className?: string;
  onError?: () => void;
}

/**
 * Lazily renders the first page of a PDF to a canvas thumbnail.
 * - Only starts work once scrolled into view (IntersectionObserver).
 * - Uses a short-lived signed URL for private storage files.
 * - Calls `onError` on any failure so the parent can show a fallback cover.
 * - Never throws through — a broken PDF must not break the page.
 */
export function PdfThumbnail({ source, className, onError }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(containerRef.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || ready || failed) return;
    let cancelled = false;

    (async () => {
      try {
        const url =
          source.kind === "external"
            ? source.url
            : await getSignedFileUrl(source.filePath, 120);
        if (!url) throw new Error("no-url");

        // Load pdf.js lazily so the main bundle stays small.
        const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
        // Point the worker at the bundled ESM worker.
        const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

        const loadingTask = pdfjs.getDocument({
          url,
          disableAutoFetch: true,
          disableStream: true,
        });
        const doc = await loadingTask.promise;
        if (cancelled) {
          doc.destroy?.();
          return;
        }
        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const viewport = page.getViewport({ scale: 1 });
        const targetWidth = 320;
        const scale = targetWidth / viewport.width;
        const scaled = page.getViewport({ scale });
        canvas.width = Math.floor(scaled.width);
        canvas.height = Math.floor(scaled.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no-canvas-ctx");
        await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
        if (!cancelled) setReady(true);
        page.cleanup?.();
        doc.destroy?.();
      } catch {
        if (!cancelled) {
          setFailed(true);
          onError?.();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, ready, failed, source, onError]);

  if (failed) return null;

  return (
    <div ref={containerRef} className={cn("w-full h-full", className)}>
      <canvas
        ref={canvasRef}
        className={cn(
          "w-full h-full object-cover transition-opacity",
          ready ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
