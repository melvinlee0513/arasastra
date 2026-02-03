import { useState } from "react";
import { format } from "date-fns";
import { 
  Search, 
  Check, 
  X, 
  Eye, 
  Bell, 
  FileText, 
  Image,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAdminPaymentSubmissions } from "@/hooks/usePaymentSubmissions";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function PaymentVerification() {
  const { submissions, isLoading, approveSubmission, rejectSubmission, refetch } = useAdminPaymentSubmissions();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [selectedSubmission, setSelectedSubmission] = useState<typeof submissions[0] | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [notifyStudent, setNotifyStudent] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const filteredSubmissions = submissions.filter((s) => {
    const matchesSearch = 
      s.profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleApprove = async (submission: typeof submissions[0]) => {
    setIsProcessing(true);
    try {
      await approveSubmission(submission.id, submission.user_id);
      
      if (notifyStudent) {
        // Send notification to student
        await supabase.from("notifications").insert({
          user_id: submission.user_id,
          title: "Payment Approved! 🎉",
          message: "Your subscription has been activated. Enjoy full access to all classes!",
          type: "subscription",
        });
      }

      toast({
        title: "Payment approved",
        description: "Student subscription has been activated",
      });
      setSelectedSubmission(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve payment",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSubmission) return;
    
    setIsProcessing(true);
    try {
      await rejectSubmission(selectedSubmission.id, rejectReason);
      
      if (notifyStudent) {
        await supabase.from("notifications").insert({
          user_id: selectedSubmission.user_id,
          title: "Payment Verification Failed",
          message: rejectReason || "Your payment could not be verified. Please contact support.",
          type: "subscription",
        });
      }

      toast({
        title: "Payment rejected",
        description: "Student has been notified",
      });
      setShowRejectDialog(false);
      setSelectedSubmission(null);
      setRejectReason("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reject payment",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
      case "approved":
        return <Badge className="gap-1 bg-accent text-accent-foreground"><CheckCircle className="w-3 h-3" /> Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isPDF = (url: string) => url.toLowerCase().includes(".pdf");

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payment Verification</h1>
          <p className="text-muted-foreground">Review and approve student payment submissions</p>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 bg-card border border-border">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by student name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            {(["all", "pending", "approved", "rejected"] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="capitalize"
              >
                {status}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Submissions List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground">No submissions found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter === "pending" 
              ? "No pending payments to verify" 
              : "Try adjusting your filters"}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSubmissions.map((submission) => (
            <Card
              key={submission.id}
              className={cn(
                "p-4 bg-card border border-border hover:border-primary/30 transition-colors cursor-pointer",
                selectedSubmission?.id === submission.id && "border-primary"
              )}
              onClick={() => setSelectedSubmission(submission)}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                    {isPDF(submission.receipt_url) ? (
                      <FileText className="w-6 h-6 text-muted-foreground" />
                    ) : (
                      <Image className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {submission.profile?.full_name || "Unknown Student"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      RM {submission.amount.toFixed(2)} • {format(new Date(submission.created_at), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {getStatusBadge(submission.status)}
                  <Button variant="ghost" size="icon">
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Quick View Drawer */}
      <Sheet open={!!selectedSubmission} onOpenChange={(open) => !open && setSelectedSubmission(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedSubmission && (
            <>
              <SheetHeader>
                <SheetTitle>Payment Details</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Student Info */}
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Student</Label>
                  <p className="font-medium text-foreground">
                    {selectedSubmission.profile?.full_name || "Unknown"}
                  </p>
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Amount</Label>
                  <p className="text-2xl font-bold text-foreground">
                    RM {selectedSubmission.amount.toFixed(2)}
                  </p>
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Submitted</Label>
                  <p className="text-foreground">
                    {format(new Date(selectedSubmission.created_at), "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Status</Label>
                  <div>{getStatusBadge(selectedSubmission.status)}</div>
                  {selectedSubmission.rejection_reason && (
                    <p className="text-sm text-destructive mt-1">
                      Reason: {selectedSubmission.rejection_reason}
                    </p>
                  )}
                </div>

                {/* Receipt Preview */}
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Receipt</Label>
                  <div className="border border-border rounded-lg overflow-hidden">
                    {isPDF(selectedSubmission.receipt_url) ? (
                      <div className="p-8 text-center bg-secondary/30">
                        <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground mb-3">PDF Receipt</p>
                        <Button variant="outline" size="sm" asChild>
                          <a href={selectedSubmission.receipt_url} target="_blank" rel="noopener noreferrer">
                            Open in New Tab
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <a href={selectedSubmission.receipt_url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={selectedSubmission.receipt_url}
                          alt="Payment receipt"
                          className="w-full h-auto"
                        />
                      </a>
                    )}
                  </div>
                </div>

                {/* Notify Toggle */}
                {selectedSubmission.status === "pending" && (
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="notify" className="font-normal">Notify student</Label>
                    </div>
                    <Switch
                      id="notify"
                      checked={notifyStudent}
                      onCheckedChange={setNotifyStudent}
                    />
                  </div>
                )}

                {/* Action Buttons */}
                {selectedSubmission.status === "pending" && (
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1 text-destructive hover:bg-destructive/10"
                      onClick={() => setShowRejectDialog(true)}
                      disabled={isProcessing}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      className="flex-1 bg-accent hover:bg-accent/90"
                      onClick={() => handleApprove(selectedSubmission)}
                      disabled={isProcessing}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      {isProcessing ? "Processing..." : "Approve"}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Rejection Reason</Label>
              <Textarea
                id="reason"
                placeholder="e.g., Amount doesn't match, receipt is unclear..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={isProcessing}
            >
              {isProcessing ? "Rejecting..." : "Reject Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
