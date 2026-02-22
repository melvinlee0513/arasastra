import { useState, useRef, useEffect } from "react";
import { Maximize, Minimize, PictureInPicture2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  url: string;
  title: string;
  onClose: () => void;
}

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
      {/* Theater backdrop */}
      {theaterMode && (
        <div
          className="fixed inset-0 bg-background/95 z-40 animate-fade-in"
          onClick={() => setTheaterMode(false)}
        />
      )}

      <div className={cn(
        "relative group",
        theaterMode && "fixed inset-4 z-50 flex items-center justify-center"
      )}>
        <div className={cn(
          "relative w-full bg-background rounded-xl overflow-hidden border border-border",
          theaterMode && "max-w-6xl w-full shadow-2xl"
        )}>
          {/* Controls overlay */}
          <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-background/60 hover:bg-background/80 text-foreground"
              onClick={togglePiP}
              title="Picture in Picture"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-background/60 hover:bg-background/80 text-foreground"
              onClick={() => setTheaterMode(!theaterMode)}
              title={theaterMode ? "Exit Theater" : "Theater Mode"}
            >
              {theaterMode ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </Button>
            {theaterMode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-background/60 hover:bg-background/80 text-foreground"
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
