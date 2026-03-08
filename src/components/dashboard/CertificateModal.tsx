import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, Share2, X, Award, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface CertificateModalProps {
  open: boolean;
  onClose: () => void;
  studentName: string;
  subjectName: string;
  completionDate?: string;
}

export function CertificateModal({
  open,
  onClose,
  studentName,
  subjectName,
  completionDate,
}: CertificateModalProps) {
  const certRef = useRef<HTMLDivElement>(null);
  const [confettiFired, setConfettiFired] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && !confettiFired) {
      const duration = 3000;
      const end = Date.now() + duration;
      const colors = ["hsl(43,90%,55%)", "hsl(220,45%,22%)", "#00D1FF", "#FFD700"];

      const frame = () => {
        confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors });
        confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
      setConfettiFired(true);
    }
    if (!open) setConfettiFired(false);
  }, [open, confettiFired]);

  const handleDownloadPDF = async () => {
    if (!certRef.current || isDownloading) return;
    setIsDownloading(true);

    try {
      const canvas = await html2canvas(certRef.current, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: null,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("landscape", "mm", "a4");

      const pageW = 297;
      const pageH = 210;
      const margin = 10;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;

      const ratio = canvas.width / canvas.height;
      let w = maxW;
      let h = w / ratio;
      if (h > maxH) {
        h = maxH;
        w = h * ratio;
      }

      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;

      pdf.addImage(imgData, "PNG", x, y, w, h);
      pdf.save("Arasa_APlus_Certificate.pdf");

      toast({ title: "Certificate Downloaded!", description: "Share your achievement with friends and family." });
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast({ title: "Download failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = () => {
    const text = encodeURIComponent(`🎓 I just mastered ${subjectName} on Arasa A+! Check it out!`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const date =
    completionDate ||
    new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-transparent border-0 shadow-none [&>button]:hidden">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          {/* Fixed-width certificate for consistent PDF output */}
          <div className="flex justify-center overflow-auto">
            <div
              ref={certRef}
              className="relative bg-card rounded-3xl shadow-[0_8px_60px_rgb(0,0,0,0.1)] overflow-hidden w-[800px] aspect-[1.414] shrink-0"
            >
              {/* Top border */}
              <div className="h-2 bg-gradient-to-r from-accent via-primary to-accent" />

              <div className="p-10 md:p-14 text-center flex flex-col justify-center h-[calc(100%-16px)]">
                {/* Header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Award className="w-8 h-8 text-accent" strokeWidth={1.5} />
                    <Sparkles className="w-5 h-5 text-accent" strokeWidth={1.5} />
                  </div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground font-medium">
                    Certificate of Completion
                  </p>
                  <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground tracking-tight">
                    Arasa A+
                  </h2>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4 my-6">
                  <div className="flex-1 h-px bg-border/50" />
                  <Award className="w-5 h-5 text-accent/50" strokeWidth={1.5} />
                  <div className="flex-1 h-px bg-border/50" />
                </div>

                {/* Body */}
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">This is to certify that</p>
                  <h3 className="text-2xl md:text-3xl font-serif font-bold text-foreground italic">
                    {studentName}
                  </h3>
                  <p className="text-sm text-muted-foreground">has successfully completed all lessons in</p>
                  <h4 className="text-xl font-semibold text-accent">{subjectName}</h4>
                  <p className="text-sm text-muted-foreground">achieving 100% course completion on {date}</p>
                </div>

                {/* Signature */}
                <div className="pt-8 flex items-end justify-between px-8">
                  <div className="text-center">
                    <div className="w-32 h-px bg-border mb-1 mx-auto" />
                    <p className="text-xs text-muted-foreground">Program Director</p>
                  </div>
                  <div className="text-center">
                    <div className="w-32 h-px bg-border mb-1 mx-auto" />
                    <p className="text-xs text-muted-foreground">Date Issued</p>
                  </div>
                </div>
              </div>

              {/* Bottom border */}
              <div className="absolute bottom-0 left-0 right-0 h-2 bg-gradient-to-r from-accent via-primary to-accent" />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3 mt-4 print:hidden">
            <Button
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="rounded-full gap-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" strokeWidth={1.5} />
              )}
              {isDownloading ? "Generating…" : "Download PDF"}
            </Button>
            <Button variant="outline" onClick={handleShare} className="rounded-full gap-2 bg-card/80 backdrop-blur-sm">
              <Share2 className="w-4 h-4" strokeWidth={1.5} />
              Share on WhatsApp
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
              <X className="w-4 h-4" strokeWidth={1.5} />
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
