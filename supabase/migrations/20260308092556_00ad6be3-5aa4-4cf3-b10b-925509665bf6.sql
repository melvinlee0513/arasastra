
-- Create analytics_events table
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  platform text NOT NULL DEFAULT 'Desktop',
  is_pwa boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "Users can insert own analytics events"
ON public.analytics_events FOR INSERT TO authenticated
WITH CHECK (user_id = get_profile_id());

-- Admins can read all events
CREATE POLICY "Admins can read all analytics events"
ON public.analytics_events FOR SELECT TO authenticated
USING (is_admin());

-- Admins can manage all events
CREATE POLICY "Admins can manage analytics events"
ON public.analytics_events FOR ALL TO authenticated
USING (is_admin());

-- Index for efficient querying
CREATE INDEX idx_analytics_events_type ON public.analytics_events(event_type);
CREATE INDEX idx_analytics_events_created ON public.analytics_events(created_at);
CREATE INDEX idx_analytics_events_user ON public.analytics_events(user_id);
