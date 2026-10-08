-- Dance jobs keep full metadata snapshots. Compare the previous TEXT value in
-- an RPC request body rather than a PostgREST URL filter, preserving exact CAS.
-- This migration defines an API only; it does not change any generation rows.
BEGIN;

CREATE OR REPLACE FUNCTION public.compare_and_swap_dance_generation(
  p_track_id UUID,
  p_user_id UUID,
  p_expected_license_hash TEXT,
  p_next_license_hash TEXT,
  p_final_title TEXT DEFAULT NULL,
  p_final_cover_art_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  title TEXT,
  is_public BOOLEAN,
  created_at TIMESTAMPTZ,
  status TEXT,
  audio_url TEXT,
  license_hash TEXT
)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.generations AS g
  SET license_hash = p_next_license_hash,
      title = COALESCE(p_final_title, g.title),
      cover_art_url = COALESCE(p_final_cover_art_url, g.cover_art_url)
  WHERE g.id = p_track_id
    AND g.user_id = p_user_id
    AND g.status = 'completed'
    AND g.license_hash IS NOT DISTINCT FROM p_expected_license_hash
    AND p_next_license_hash IS NOT NULL
  RETURNING g.id, g.user_id, g.title, g.is_public, g.created_at,
    g.status, g.audio_url, g.license_hash;
$$;

REVOKE ALL ON FUNCTION public.compare_and_swap_dance_generation(UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compare_and_swap_dance_generation(UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMIT;
