import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface PaymentSubmission {
  id: string;
  user_id: string;
  amount: number;
  receipt_url: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function usePaymentSubmissions() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<PaymentSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [latestPending, setLatestPending] = useState<PaymentSubmission | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchSubmissions();
    } else {
      setSubmissions([]);
      setLatestPending(null);
      setIsLoading(false);
    }
  }, [user?.id]);

  const fetchSubmissions = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from("payment_submissions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const typedData = (data || []) as PaymentSubmission[];
      setSubmissions(typedData);
      
      // Find the latest pending submission
      const pending = typedData.find(s => s.status === "pending");
      setLatestPending(pending || null);
    } catch (error) {
      console.error("Error fetching payment submissions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const submitPayment = async (amount: number, receiptFile: File) => {
    if (!user?.id) throw new Error("User not authenticated");

    // Upload receipt to storage
    const fileExt = receiptFile.name.split(".").pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;
    
    const { error: uploadError, data: uploadData } = await supabase.storage
      .from("payment-receipts")
      .upload(fileName, receiptFile);

    if (uploadError) throw uploadError;

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from("payment-receipts")
      .getPublicUrl(fileName);

    const receiptUrl = urlData.publicUrl;

    // Create payment submission record
    const { error: insertError, data: insertData } = await supabase
      .from("payment_submissions")
      .insert({
        user_id: user.id,
        amount,
        receipt_url: receiptUrl,
        status: "pending",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Refresh submissions
    await fetchSubmissions();

    return insertData;
  };

  return {
    submissions,
    latestPending,
    isLoading,
    submitPayment,
    refetch: fetchSubmissions,
  };
}

// Admin hook for managing all submissions
interface SubmissionWithProfile extends PaymentSubmission {
  profile?: { full_name: string; user_id: string };
}

export function useAdminPaymentSubmissions() {
  const [submissions, setSubmissions] = useState<SubmissionWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAllSubmissions();
  }, []);

  const fetchAllSubmissions = async () => {
    try {
      // First get all submissions
      const { data: submissionsData, error: submissionsError } = await supabase
        .from("payment_submissions")
        .select("*")
        .order("created_at", { ascending: false });

      if (submissionsError) throw submissionsError;

      // Get unique user IDs
      const userIds = [...new Set((submissionsData || []).map(s => s.user_id))];
      
      // Fetch profiles for those users
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      // Map profiles to a lookup object
      const profilesMap = new Map(
        (profilesData || []).map(p => [p.user_id, { full_name: p.full_name, user_id: p.user_id }])
      );

      // Combine submissions with profiles
      const combined: SubmissionWithProfile[] = (submissionsData || []).map(s => ({
        ...s,
        status: s.status as "pending" | "approved" | "rejected",
        profile: profilesMap.get(s.user_id),
      }));

      setSubmissions(combined);
    } catch (error) {
      console.error("Error fetching all payment submissions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const approveSubmission = async (submissionId: string, userId: string) => {
    // Update submission status
    const { error: updateError } = await supabase
      .from("payment_submissions")
      .update({ status: "approved" })
      .eq("id", submissionId);

    if (updateError) throw updateError;

    // Update user's subscription to active
    const { error: subError } = await supabase
      .from("subscriptions")
      .update({ 
        status: "active",
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        plan_name: "Monthly Subscription"
      })
      .eq("user_id", userId);

    if (subError) throw subError;

    // AUTO-ENROLLMENT: Get user's profile ID and enroll them in all active subjects
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (profileData?.id) {
      // Get all active subjects
      const { data: subjects } = await supabase
        .from("subjects")
        .select("id")
        .eq("is_active", true);

      // Create enrollments for each subject (ignore duplicates)
      if (subjects && subjects.length > 0) {
        const enrollments = subjects.map((subject) => ({
          student_id: profileData.id,
          subject_id: subject.id,
          is_active: true,
        }));

        await supabase
          .from("enrollments")
          .upsert(enrollments, { 
            onConflict: "student_id,subject_id",
            ignoreDuplicates: true 
          });
      }
    }

    await fetchAllSubmissions();
  };

  const rejectSubmission = async (submissionId: string, reason: string) => {
    const { error } = await supabase
      .from("payment_submissions")
      .update({ 
        status: "rejected",
        rejection_reason: reason
      })
      .eq("id", submissionId);

    if (error) throw error;

    await fetchAllSubmissions();
  };

  return {
    submissions,
    isLoading,
    approveSubmission,
    rejectSubmission,
    refetch: fetchAllSubmissions,
  };
}
