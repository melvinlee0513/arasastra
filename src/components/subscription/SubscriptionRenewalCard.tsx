import { useState } from "react";
import { Copy, Check, CreditCard, Sparkles, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ReceiptUploader } from "./ReceiptUploader";
import { PaymentGuideModal } from "./PaymentGuideModal";
import { usePaymentSubmissions } from "@/hooks/usePaymentSubmissions";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";

interface SubscriptionRenewalCardProps {
  onSuccess?: () => void;
}

export function SubscriptionRenewalCard({ onSuccess }: SubscriptionRenewalCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("99.00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { submitPayment } = usePaymentSubmissions();

  const bankDetails = {
    bank: "Maybank",
    accountName: "Arasa A+ Sdn Bhd",
    accountNumber: "123456789012",
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(bankDetails.accountNumber);
    setCopied(true);
    toast({
      title: "Copied!",
      description: "Account number copied to clipboard",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please upload your payment receipt",
        variant: "destructive",
      });
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await submitPayment(numAmount, selectedFile);
      
      // Trigger confetti celebration
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: ["#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"],
      });

      // Fire additional confetti bursts
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
      }, 200);

      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 400);

      setShowSuccess(true);
      onSuccess?.();
    } catch (error) {
      console.error("Error submitting payment:", error);
      toast({
        title: "Submission failed",
        description: "Failed to submit payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <Card className="p-6 md:p-8 bg-gradient-to-br from-accent/10 to-primary/10 border-accent/30">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-accent/20 flex items-center justify-center animate-bounce">
            <PartyPopper className="w-10 h-10 text-accent" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">🎉 Receipt Uploaded!</h3>
            <p className="text-muted-foreground mt-2">
              We've received your proof of payment. Our team is checking it now.
            </p>
          </div>
          <div className="bg-background/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">
              <strong>What's next?</strong><br />
              Verification typically takes up to 24 hours. In the meantime, you can explore our free introductory lessons!
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowSuccess(false)}>
            Upload Another Receipt
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 md:p-8 bg-card border border-border space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Renew Subscription</h3>
            <p className="text-sm text-muted-foreground">Unlock full access to all classes</p>
          </div>
        </div>
        <PaymentGuideModal />
      </div>

      {/* Bank Details */}
      <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
        <h4 className="font-medium text-foreground text-sm">Bank Transfer Details</h4>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bank</span>
            <span className="font-medium text-foreground">{bankDetails.bank}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Account Name</span>
            <span className="font-medium text-foreground">{bankDetails.accountName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Account Number</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium text-foreground">{bankDetails.accountNumber}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="w-4 h-4 text-accent" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Amount Input */}
      <div className="space-y-2">
        <Label htmlFor="amount">Payment Amount (RM)</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="99.00"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Monthly subscription: RM 99.00
        </p>
      </div>

      {/* Receipt Uploader */}
      <div className="space-y-2">
        <Label>Upload Payment Receipt</Label>
        <ReceiptUploader
          onFileSelect={setSelectedFile}
          selectedFile={selectedFile}
          onClear={() => setSelectedFile(null)}
          isUploading={isSubmitting}
        />
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!selectedFile || isSubmitting}
        className={cn(
          "w-full h-12 text-base font-medium rounded-full",
          "bg-primary hover:bg-primary/90"
        )}
      >
        {isSubmitting ? (
          <>
            <Sparkles className="w-5 h-5 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 mr-2" />
            Submit Receipt
          </>
        )}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        By submitting, you confirm that you have transferred the stated amount to our account.
      </p>
    </Card>
  );
}
