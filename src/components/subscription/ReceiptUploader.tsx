import { useState, useCallback, useRef } from "react";
import { Upload, FileCheck, X, Image, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";

interface ReceiptUploaderProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
  isUploading?: boolean;
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE_MB = 10;

export function ReceiptUploader({
  onFileSelect,
  selectedFile,
  onClear,
  isUploading = false,
}: ReceiptUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateFile = useCallback(
    (file: File): boolean => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or image file (JPEG, PNG, WebP)",
          variant: "destructive",
        });
        return false;
      }

      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `Maximum file size is ${MAX_SIZE_MB}MB`,
          variant: "destructive",
        });
        return false;
      }

      return true;
    },
    [toast]
  );

  const handleFile = useCallback(
    (file: File) => {
      if (!validateFile(file)) return;

      onFileSelect(file);

      // Create preview for images
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreview(null);
      }
    },
    [onFileSelect, validateFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleClear = useCallback(() => {
    onClear();
    setPreview(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [onClear]);

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#2563EB", "#10B981", "#F59E0B", "#8B5CF6"],
    });
  };

  if (selectedFile) {
    const isPDF = selectedFile.type === "application/pdf";
    const Icon = isPDF ? FileText : Image;

    return (
      <div className="relative rounded-2xl border-2 border-dashed border-accent bg-accent/5 p-6">
        <div className="flex items-center gap-4">
          {preview ? (
            <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
              <img src={preview} alt="Receipt preview" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-lg bg-accent/10 flex items-center justify-center">
              <Icon className="w-8 h-8 text-accent" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-accent" />
              <span className="font-medium text-foreground">File ready</span>
            </div>
            <p className="text-sm text-muted-foreground truncate">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            disabled={isUploading}
            className="flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative rounded-2xl border-2 border-dashed transition-all cursor-pointer",
        "p-8 md:p-12 text-center",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.02]"
          : "border-border hover:border-primary/50 hover:bg-secondary/30"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        onChange={handleInputChange}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-3">
        <div
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
            isDragging ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
          )}
        >
          <Upload className="w-7 h-7" />
        </div>
        <div>
          <p className="font-medium text-foreground">
            {isDragging ? "Drop your receipt here" : "Drag & drop your receipt"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to browse • PDF, JPEG, PNG up to {MAX_SIZE_MB}MB
          </p>
        </div>
      </div>
    </div>
  );
}

export { confetti };
