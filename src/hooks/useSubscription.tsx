import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Subscription {
  id: string;
  user_id: string;
  plan_name: string;
  status: "active" | "inactive" | "expired" | "pending";
  started_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchSubscription();
    } else {
      setSubscription(null);
      setIsLoading(false);
    }
  }, [user?.id]);

  const fetchSubscription = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching subscription:", error);
      } else {
        setSubscription(data as Subscription | null);
      }
    } catch (error) {
      console.error("Error fetching subscription:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getDaysRemaining = () => {
    if (!subscription?.expires_at) return 0;
    const expiryDate = new Date(subscription.expires_at);
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const isActive = subscription?.status === "active";
  const isPending = subscription?.status === "pending";
  const isExpired = subscription?.status === "expired" || (subscription?.expires_at && new Date(subscription.expires_at) < new Date());

  return {
    subscription,
    isLoading,
    isActive,
    isPending,
    isExpired,
    getDaysRemaining,
    refetch: fetchSubscription,
  };
}
