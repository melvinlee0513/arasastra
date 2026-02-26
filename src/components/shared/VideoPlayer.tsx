import { useState, useRef, useEffect } from "react";
import { Maximize, Minimize, PictureInPicture2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
}

/**
 * VideoPlayer — Inline player with Theater Mode and PiP support.
 * Soft-Tech: glassmorphism overlay, rounded-2xl container, subtle shadows.
 */
export function VideoPlayer({ url, title, onClose }: VideoPlayerProps) {
  const [theaterMode, setTheaterMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.error("PiP not supported:", err);
    }
  };

  // Escape to exit theater
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && theaterMode) {
        setTheaterMode(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [theaterMode]);

  return (
    <>
      {/* Theater backdrop — glassmorphism */}
      {theaterMode && (
        <div
          className="fixed inset-0 bg-background/90 backdrop-blur-sm z-40 animate-fade-up"
          onClick={() => setTheaterMode(false)}
        />
      )}

      <div className={cn(
        "relative group",
        theaterMode && "fixed inset-4 z-50 flex items-center justify-center"
      )}>
        <div className={cn(
          "relative w-full rounded-2xl overflow-hidden border border-border/40 shadow-sm",
          "bg-card/70 backdrop-blur-md",
          theaterMode && "max-w-6xl w-full shadow-md"
        )}>
          {/* Controls overlay — pill-shaped buttons */}
          <div className="absolute top-3 right-3 z-10 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-card/60 backdrop-blur-sm hover:bg-card/80 text-foreground"
              onClick={togglePiP}
              title="Picture in Picture"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full bg-card/60 backdrop-blur-sm hover:bg-card/80 text-foreground"
              onClick={() => setTheaterMode(!theaterMode)}
              title={theaterMode ? "Exit Theater" : "Theater Mode"}
            >
              {theaterMode ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </Button>
            {theaterMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-card/60 backdrop-blur-sm hover:bg-card/80 text-foreground"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          <video
            ref={videoRef}
            src={url}
            controls
            className="w-full aspect-video"
            title={title}
          />
        </div>
      </div>
    </>
  );
}
