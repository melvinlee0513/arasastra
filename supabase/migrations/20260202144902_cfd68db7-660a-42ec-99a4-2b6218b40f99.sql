-- Add xp_points column to profiles table for gamification
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS xp_points integer NOT NULL DEFAULT 0;

-- Create index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_xp_points ON public.profiles(xp_points DESC);