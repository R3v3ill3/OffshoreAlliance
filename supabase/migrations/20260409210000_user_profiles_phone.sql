-- Staff contact phone on app user profile (distinct from organisers.phone when linked).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.user_profiles.phone IS 'Optional contact phone for the staff user; used in comms merge fields and admin UI.';
