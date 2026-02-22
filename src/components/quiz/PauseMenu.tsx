import { Settings, Play, RotateCcw, Save, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PauseMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  volume: number;
  onVolumeChange: (value: number) => void;
  onResume: () => void;
  onRestart: () => void;
  onSaveQuit: () => void;
  isSaving?: boolean;
}

export function PauseMenu({
  open,
  onOpenChange,
  volume,
  onVolumeChange,
  onResume,
  onRestart,
  onSaveQuit,
  isSaving,
}: PauseMenuProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Settings className="w-5 h-5" />
            Paused
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Volume Control */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Volume2 className="w-4 h-4 text-accent" />
              Sound Effects Volume
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[volume]}
                onValueChange={([v]) => onVolumeChange(v)}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground w-10 text-right">{volume}%</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button variant="default" className="w-full gap-2" onClick={onResume}>
              <Play className="w-4 h-4" />
              Resume
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={onRestart}>
              <RotateCcw className="w-4 h-4" />
              Restart Quiz
            </Button>
            <Button
              variant="destructive"
              className="w-full gap-2"
              onClick={onSaveQuit}
              disabled={isSaving}
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Saving..." : "Save & Quit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
