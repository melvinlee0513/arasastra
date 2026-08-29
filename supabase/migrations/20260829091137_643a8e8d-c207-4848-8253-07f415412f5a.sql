-- Bound orphaned/aborted API transactions so they cannot hold row locks forever.
ALTER ROLE authenticator SET idle_in_transaction_session_timeout = '15s';

-- Bound lock waits inside the two progress-save routines that take a row lock,
-- so a contended row fails fast instead of parking an API pool connection.
ALTER FUNCTION public.save_quiz_progress(uuid, jsonb, integer) SET lock_timeout = '3s';
ALTER FUNCTION public.save_flashcard_progress(uuid, jsonb, integer) SET lock_timeout = '3s';