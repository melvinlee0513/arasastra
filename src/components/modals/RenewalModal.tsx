import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Upload, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RenewalModalProps {
  children: React.ReactNode;
}

const bankDetails = {
  bankName: "Maybank",
  accountNumber: "5621 2345 6789",
  accountHolder: "Arasa A+ Education Sdn Bhd",
  amount: "RM 199.00",
};

export function RenewalModal({ children }: RenewalModalProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text.replace(/\s/g, ""));
    setCopied(true);
    toast({
      title: "Copied!",
      description: "Account number copied to clipboard.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload a file smaller than 5MB.",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
      toast({
        title: "Receipt uploaded",
        description: selectedFile.name,
      });
    }
  };

  const handleSubmit = () => {
    if (!file) {
      toast({
        title: "No receipt",
        description: "Please upload your payment receipt.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Renewal Request Submitted",
      description: "We'll verify your payment within 24 hours.",
    });
    setIsOpen(false);
    setFile(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renew Subscription</DialogTitle>
          <DialogDescription>
            Transfer to the account below and upload your receipt for manual verification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Bank Details Card */}
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">{bankDetails.bankName}</h4>
                <p className="text-sm text-muted-foreground">{bankDetails.accountHolder}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs text-muted-foreground">Account Number</Label>
                  <p className="font-mono font-semibold text-foreground">{bankDetails.accountNumber}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCopy(bankDetails.accountNumber)}
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Amount</Label>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-xl text-accent">{bankDetails.amount}</p>
                  <Badge variant="secondary">Monthly</Badge>
                </div>
              </div>
            </div>
          </Card>

          {/* Receipt Upload */}
          <div className="space-y-2">
            <Label htmlFor="receipt">Upload Payment Receipt</Label>
            <div className="relative">
              <Input
                id="receipt"
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="receipt"
                className="flex items-center justify-center gap-2 w-full h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              >
                {file ? (
                  <div className="text-center">
                    <Check className="w-6 h-6 text-green-500 mx-auto mb-1" />
                    <p className="text-sm text-foreground font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">Click to change</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload receipt
                    </p>
                    <p className="text-xs text-muted-foreground">PNG, JPG or PDF (max 5MB)</p>
                  </div>
                )}
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSubmit}>
            Submit for Verification
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
