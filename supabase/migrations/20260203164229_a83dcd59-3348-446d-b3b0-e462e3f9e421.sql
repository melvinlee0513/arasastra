-- Create subscriptions table for tracking user subscription status
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name text NOT NULL DEFAULT 'Free Tier',
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'expired', 'pending')),
  started_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own subscription
CREATE POLICY "Users can view their own subscription"
ON public.subscriptions
FOR SELECT
USING ((user_id = auth.uid()) OR is_admin());

-- Only admins can manage subscriptions
CREATE POLICY "Admins can manage all subscriptions"
ON public.subscriptions
FOR ALL
USING (is_admin());

-- Trigger for updating updated_at
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create subscription on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan_name, status)
  VALUES (NEW.id, 'Free Tier', 'inactive');
  RETURN NEW;
END;
$$;

-- Trigger to auto-create subscription for new users
CREATE TRIGGER on_auth_user_created_subscription
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_subscription();