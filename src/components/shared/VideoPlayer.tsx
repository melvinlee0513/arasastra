import { useState, useRef, useEffect } from "react";
import { Maximize, Minimize, PictureInPicture2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VideoSpatialTimeline } from "@/components/shared/VideoSpatialTimeline";

interface VideoPlayerProps {
  url: string;
  title: string;
  classId?: string;
  onClose: () => void;
}

/**
 * VideoPlayer — Inline player with Theater Mode, PiP, and spatial timeline.
 * Soft-Tech: glassmorphism overlay, rounded-2xl container, subtle shadows.
 */
export function VideoPlayer({ url, title, classId, onClose }: VideoPlayerProps) {
  const [theaterMode, setTheaterMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
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

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && theaterMode) setTheaterMode(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [theaterMode]);

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  };

  const handleSeek = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  const handlePause = () => videoRef.current?.pause();
  const handleResume = () => videoRef.current?.play();

  return (
    <>
      {theaterMode && (
        <div
          className="fixed inset-0 bg-background/90 backdrop-blur-sm z-40 animate-fade-up"
          onClick={() => setTheaterMode(false)}
        />
      )}

      <div className={cn(
        "relative group",
        theaterMode && "fixed inset-4 z-50 flex flex-col items-center justify-center"
      )}>
        <div className={cn(
          "relative w-full rounded-2xl overflow-hidden border-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
          "bg-card/90 backdrop-blur-md",
          theaterMode && "max-w-6xl w-full"
        )}>
          {/* Controls overlay */}
          <div className="absolute top-3 right-3 z-10 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-card/60 backdrop-blur-sm hover:bg-card/80 text-foreground" onClick={togglePiP} title="Picture in Picture">
              <PictureInPicture2 className="w-4 h-4" strokeWidth={1.5} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-card/60 backdrop-blur-sm hover:bg-card/80 text-foreground" onClick={() => setTheaterMode(!theaterMode)} title={theaterMode ? "Exit Theater" : "Theater Mode"}>
              {theaterMode ? <Minimize className="w-4 h-4" strokeWidth={1.5} /> : <Maximize className="w-4 h-4" strokeWidth={1.5} />}
            </Button>
            {theaterMode && (
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-card/60 backdrop-blur-sm hover:bg-card/80 text-foreground" onClick={onClose}>
                <X className="w-4 h-4" strokeWidth={1.5} />
              </Button>
            )}
          </div>

          <video
            ref={videoRef}
            src={url}
            controls
            className="w-full aspect-video"
            title={title}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
          />
        </div>

        {/* Spatial Timeline with comment markers */}
        {classId && duration > 0 && (
          <div className="mt-3 w-full px-1">
            <VideoSpatialTimeline
              classId={classId}
              duration={duration}
              currentTime={currentTime}
              onSeek={handleSeek}
              onPause={handlePause}
              onResume={handleResume}
            />
          </div>
        )}
      </div>
    </>
  );
}
