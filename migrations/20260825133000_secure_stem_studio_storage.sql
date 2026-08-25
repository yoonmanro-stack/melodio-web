-- Secure storage and queue boundaries for Stem Studio.
--
-- This is deliberately one, uniquely-versioned migration: source/output bucket
-- policy ordering is security-sensitive and must not depend on same-day file
-- name sorting.

BEGIN;

-- The live project accumulated several generations columns through dashboard
-- edits that were never captured in versioned SQL. Reconcile every column the
-- secure Stem pipeline needs so this migration is safe on a recovered schema.
ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN,
  ADD COLUMN IF NOT EXISTS preview_vocals_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_drums_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_bass_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_other_url TEXT;

-- Do not accidentally publish legacy private rows when introducing the
-- canonical visibility column. license_hash may be a non-JSON legacy string,
-- so use non-throwing text predicates rather than a JSON cast.
UPDATE public.generations
SET is_public = CASE
  WHEN license_hash ~ '"isPublic"[[:space:]]*:[[:space:]]*false' THEN FALSE
  WHEN license_hash ~ '"sourceMenu"[[:space:]]*:[[:space:]]*"(stem-upload|custom-upload)"' THEN FALSE
  ELSE TRUE
END
WHERE is_public IS NULL;

ALTER TABLE public.generations
  ALTER COLUMN is_public SET DEFAULT TRUE,
  ALTER COLUMN is_public SET NOT NULL;

-- Browsers may read their own generations, but all mutations go through the
-- authenticated application API or the service_role worker. This prevents a
-- client from forging source URLs, queue state, retry counters, or results.
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'generations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.generations', policy_row.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "Users can read own generations"
ON public.generations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.generations
FROM PUBLIC, anon, authenticated;

GRANT SELECT
ON TABLE public.generations
TO authenticated;

-- Short-lived upload grants are recorded server-side. The table is not exposed
-- to browser roles; signed Storage tokens are the only upload capability.
CREATE TABLE IF NOT EXISTS public.stem_upload_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  original_file_name TEXT NOT NULL,
  expected_size BIGINT NOT NULL CHECK (expected_size > 0 AND expected_size <= 83886080),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  generation_id UUID REFERENCES public.generations(id) ON DELETE CASCADE,
  CONSTRAINT stem_upload_sessions_path_shape
    CHECK (storage_path LIKE ('uploads/' || user_id::TEXT || '/%')),
  CONSTRAINT stem_upload_sessions_expiry_order
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_stem_upload_sessions_user_created
  ON public.stem_upload_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stem_upload_sessions_expiry
  ON public.stem_upload_sessions (expires_at)
  WHERE confirmed_at IS NULL;

ALTER TABLE public.stem_upload_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stem_upload_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stem_upload_sessions TO service_role;

-- Durable outbox for exact Storage deletion. A generation row and its cleanup
-- task are committed together; transient Storage failures can then be retried by
-- the Mac mini maintenance loop without losing the object paths.
CREATE TABLE IF NOT EXISTS public.stem_storage_cleanup_tasks (
  generation_id UUID PRIMARY KEY,
  -- NULL is reserved for an ownerless legacy row that was deleted before its
  -- exact public-object cleanup was queued. Private path arrays must be empty
  -- for such tasks and are revalidated by the worker.
  user_id UUID,
  cleanup_manifest JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stem_storage_cleanup_tasks
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.stem_storage_cleanup_tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_stem_storage_cleanup_due
  ON public.stem_storage_cleanup_tasks (next_attempt_at, generation_id);
REVOKE ALL ON TABLE public.stem_storage_cleanup_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stem_storage_cleanup_tasks TO service_role;

CREATE OR REPLACE FUNCTION public.delete_generation_with_stem_cleanup(
  p_id UUID,
  p_user_id UUID,
  p_expected_status TEXT,
  p_expected_license_hash TEXT,
  p_cleanup_manifest JSONB,
  p_cleanup_not_before TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_id UUID;
  v_signed_upload_expires_at TIMESTAMPTZ;
  v_cleanup_not_before TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  IF p_cleanup_manifest IS NULL
    OR jsonb_typeof(p_cleanup_manifest) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_cleanup_manifest->'privateSource') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_cleanup_manifest->'privateOutputs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_cleanup_manifest->'publicAssets') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_cleanup_manifest->'privateSource') > 11
    -- Attempt-scoped output sets plus legacy/actual-path fallbacks.
    -- Every path is independently shape-validated again by the worker before
    -- Storage deletion; these bounds only cap transaction payload size.
    OR jsonb_array_length(p_cleanup_manifest->'privateOutputs') > 144
    OR jsonb_array_length(p_cleanup_manifest->'publicAssets') > 145
  THEN
    RAISE EXCEPTION 'STEM_CLEANUP_MANIFEST_INVALID';
  END IF;
  IF p_cleanup_not_before <= NOW()
    OR p_cleanup_not_before > NOW() + INTERVAL '1 hour'
  THEN
    RAISE EXCEPTION 'STEM_CLEANUP_SCHEDULE_INVALID';
  END IF;

  -- The signed PUT capability can outlive the generation row. Read and lock
  -- its server-side expiry before the generation delete cascades the session,
  -- then keep the exact-path outbox task until any late upload has finished.
  SELECT expires_at
  INTO v_signed_upload_expires_at
  FROM public.stem_upload_sessions
  WHERE id = p_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF v_signed_upload_expires_at > NOW() + INTERVAL '2 hours 10 minutes' THEN
    RAISE EXCEPTION 'STEM_UPLOAD_EXPIRY_INVALID';
  END IF;

  v_cleanup_not_before := GREATEST(
    p_cleanup_not_before,
    COALESCE(v_signed_upload_expires_at + INTERVAL '30 minutes', p_cleanup_not_before)
  );

  DELETE FROM public.generations
  WHERE id = p_id
    AND user_id = p_user_id
    AND status = p_expected_status
    AND license_hash IS NOT DISTINCT FROM p_expected_license_hash
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Covers a rare historical row where generation insert succeeded but upload
  -- session bookkeeping did not set generation_id for FK cascade.
  DELETE FROM public.stem_upload_sessions WHERE id = p_id;

  INSERT INTO public.stem_storage_cleanup_tasks (
    generation_id, user_id, cleanup_manifest, next_attempt_at
  ) VALUES (
    p_id, p_user_id, p_cleanup_manifest, v_cleanup_not_before
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_generation_with_stem_cleanup(UUID, UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_generation_with_stem_cleanup(UUID, UUID, TEXT, TEXT, JSONB, TIMESTAMPTZ)
  TO service_role;

-- Delete an ownerless legacy upload row and persist its exact public-object
-- cleanup in the same transaction. Storage is never removed while a DB row
-- can still be repaired with an owner.
CREATE OR REPLACE FUNCTION public.delete_ownerless_legacy_stem_with_cleanup(
  p_id UUID,
  p_expected_status TEXT,
  p_expected_license_hash TEXT,
  p_expected_source_url TEXT,
  p_cleanup_manifest JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_id UUID;
  v_public_assets JSONB;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::TEXT, 1));

  IF p_expected_status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'OWNERLESS_STEM_STATUS_NOT_TERMINAL';
  END IF;

  v_public_assets := p_cleanup_manifest->'publicAssets';
  IF p_cleanup_manifest IS NULL
    OR jsonb_typeof(p_cleanup_manifest) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_cleanup_manifest->'privateSource') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_cleanup_manifest->'privateSource') <> 0
    OR jsonb_typeof(p_cleanup_manifest->'privateOutputs') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_cleanup_manifest->'privateOutputs') <> 0
    OR jsonb_typeof(v_public_assets) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_public_assets) <> 9
    OR (
      SELECT COUNT(*)
      FROM jsonb_array_elements_text(v_public_assets) AS asset(path)
      WHERE asset.path ~* ('^uploads/' || p_id::TEXT || '\.(mp3|wav|m4a|aac|ogg|flac)$')
    ) <> 1
    OR NOT (v_public_assets ? ('stems/' || p_id::TEXT || '/original/vocals.wav'))
    OR NOT (v_public_assets ? ('stems/' || p_id::TEXT || '/original/drums.wav'))
    OR NOT (v_public_assets ? ('stems/' || p_id::TEXT || '/original/bass.wav'))
    OR NOT (v_public_assets ? ('stems/' || p_id::TEXT || '/original/other.wav'))
    OR NOT (v_public_assets ? ('stems/' || p_id::TEXT || '/preview/vocals.m4a'))
    OR NOT (v_public_assets ? ('stems/' || p_id::TEXT || '/preview/drums.m4a'))
    OR NOT (v_public_assets ? ('stems/' || p_id::TEXT || '/preview/bass.m4a'))
    OR NOT (v_public_assets ? ('stems/' || p_id::TEXT || '/preview/other.m4a'))
  THEN
    RAISE EXCEPTION 'OWNERLESS_STEM_CLEANUP_MANIFEST_INVALID';
  END IF;

  DELETE FROM public.generations
  WHERE id = p_id
    AND user_id IS NULL
    AND status = p_expected_status
    AND COALESCE(license_hash, '') NOT LIKE '%"stemStatus":"pending"%'
    AND COALESCE(license_hash, '') NOT LIKE '%"stemStatus":"processing"%'
    AND COALESCE(license_hash, '') NOT LIKE '%"stemStatus":"cleanup"%'
    AND license_hash IS NOT DISTINCT FROM p_expected_license_hash
    AND source_audio_url IS NOT DISTINCT FROM p_expected_source_url
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.stem_storage_cleanup_tasks (
    generation_id,
    user_id,
    cleanup_manifest,
    next_attempt_at
  ) VALUES (
    p_id,
    NULL,
    p_cleanup_manifest,
    NOW()
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_ownerless_legacy_stem_with_cleanup(UUID, TEXT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ownerless_legacy_stem_with_cleanup(UUID, TEXT, TEXT, TEXT, JSONB)
  TO service_role;

-- Expire an unused signed-upload capability without losing its object path.
-- A PUT that started just before token expiry may commit after the first
-- removal, so the durable outbox repeats the exact removal after 30 minutes.
CREATE OR REPLACE FUNCTION public.expire_stem_upload_session_with_cleanup(
  p_id UUID,
  p_user_id UUID,
  p_storage_path TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.stem_upload_sessions%ROWTYPE;
  v_generation_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT * INTO v_session
  FROM public.stem_upload_sessions
  WHERE id = p_id
    AND user_id = p_user_id
    AND confirmed_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  IF v_session.expires_at > NOW() THEN
    RETURN FALSE;
  END IF;
  IF v_session.storage_path <> p_storage_path
    OR p_storage_path !~* (
      '^uploads/' || p_user_id::TEXT || '/' || p_id::TEXT
      || '\.(mp3|wav|m4a|aac|ogg|flac)$'
    )
  THEN
    RAISE EXCEPTION 'UPLOAD_PATH_INVALID';
  END IF;

  -- Defensive repair for a historical transaction that created the
  -- generation but did not mark its upload session confirmed.
  SELECT id INTO v_generation_id
  FROM public.generations
  WHERE user_id = p_user_id
    AND source_audio_url = ('storage://melodio-private/' || p_storage_path)
  LIMIT 1;
  IF v_generation_id IS NOT NULL THEN
    UPDATE public.stem_upload_sessions
    SET confirmed_at = NOW(), generation_id = v_generation_id
    WHERE id = p_id;
    RETURN FALSE;
  END IF;

  INSERT INTO public.stem_storage_cleanup_tasks (
    generation_id,
    user_id,
    cleanup_manifest,
    next_attempt_at
  ) VALUES (
    p_id,
    p_user_id,
    jsonb_build_object(
      'privateSource', jsonb_build_array(p_storage_path),
      'privateOutputs', '[]'::JSONB,
      'publicAssets', '[]'::JSONB
    ),
    GREATEST(NOW() + INTERVAL '30 minutes', v_session.expires_at + INTERVAL '30 minutes')
  );

  DELETE FROM public.stem_upload_sessions WHERE id = p_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stem_upload_session_with_cleanup(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stem_upload_session_with_cleanup(UUID, UUID, TEXT)
  TO service_role;

-- Claim a completed legacy public upload before copying it into private
-- Storage. This shares the same per-user lock as deletion, so either deletion
-- wins before any copy starts or the API observes the backfill lease and waits.
CREATE OR REPLACE FUNCTION public.claim_legacy_stem_backfill(
  p_id UUID,
  p_user_id UUID,
  p_expected_status TEXT,
  p_expected_license_hash TEXT,
  p_next_license_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  UPDATE public.generations
  SET license_hash = p_next_license_hash
  WHERE id = p_id
    AND user_id = p_user_id
    AND status = p_expected_status
    AND license_hash IS NOT DISTINCT FROM p_expected_license_hash
  RETURNING id INTO v_updated_id;

  RETURN v_updated_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_legacy_stem_backfill(UUID, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_legacy_stem_backfill(UUID, UUID, TEXT, TEXT, TEXT)
  TO service_role;

-- Reserve upload capacity under a per-user transaction lock. API-side count
-- checks alone are vulnerable to parallel-request TOCTOU races.
CREATE OR REPLACE FUNCTION public.reserve_stem_upload_session(
  p_id UUID,
  p_user_id UUID,
  p_storage_path TEXT,
  p_original_file_name TEXT,
  p_expected_size BIGINT,
  p_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recent_count BIGINT;
  v_reserved_bytes NUMERIC;
  v_active_count BIGINT;
  v_studio_slot_count BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  IF p_expected_size <= 0 OR p_expected_size > 83886080 THEN
    RAISE EXCEPTION 'UPLOAD_SIZE_LIMIT';
  END IF;
  IF p_expires_at <= NOW() OR p_expires_at > NOW() + INTERVAL '2 hours 5 minutes' THEN
    RAISE EXCEPTION 'UPLOAD_EXPIRY_INVALID';
  END IF;
  IF p_storage_path NOT LIKE ('uploads/' || p_user_id::TEXT || '/' || p_id::TEXT || '.%') THEN
    RAISE EXCEPTION 'UPLOAD_PATH_INVALID';
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM public.stem_upload_sessions
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '1 hour';
  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'UPLOAD_RATE_LIMIT';
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM public.generations
  WHERE user_id = p_user_id
    AND (
      license_hash LIKE '%"stemStatus":"pending"%'
      OR license_hash LIKE '%"stemStatus":"processing"%'
      OR license_hash LIKE '%"stemStatus":"cleanup"%'
    );
  IF v_active_count >= 3 THEN
    RAISE EXCEPTION 'STEM_ACTIVE_LIMIT';
  END IF;

  -- A slot is reserved from signed-URL issuance until the corresponding
  -- Stem Studio generation is deleted. Counting unconfirmed sessions prevents
  -- parallel reservations from oversubscribing the 10-job retention bound.
  SELECT
    (
      SELECT COUNT(*)
      FROM public.generations
      WHERE user_id = p_user_id
        AND (
          license_hash LIKE '%"sourceMenu":"stem-upload"%'
          OR license_hash LIKE '%"sourceMenu":"custom-upload"%'
        )
    )
    +
    (
      SELECT COUNT(*)
      FROM public.stem_upload_sessions
      WHERE user_id = p_user_id
        AND confirmed_at IS NULL
        AND expires_at > NOW()
    )
  INTO v_studio_slot_count;
  IF v_studio_slot_count >= 10 THEN
    RAISE EXCEPTION 'STEM_OUTPUT_LIMIT';
  END IF;

  SELECT COALESCE(SUM(expected_size), 0) INTO v_reserved_bytes
  FROM public.stem_upload_sessions
  WHERE user_id = p_user_id
    AND (confirmed_at IS NOT NULL OR expires_at > NOW());
  IF v_reserved_bytes + p_expected_size > 2147483648 THEN
    RAISE EXCEPTION 'UPLOAD_STORAGE_QUOTA';
  END IF;

  INSERT INTO public.stem_upload_sessions (
    id, user_id, storage_path, original_file_name, expected_size, expires_at
  ) VALUES (
    p_id, p_user_id, p_storage_path, p_original_file_name, p_expected_size, p_expires_at
  );

  RETURN jsonb_build_object('id', p_id, 'expiresAt', p_expires_at);
END;
$$;

-- Consume a verified session, enforce the active-work limit, create the queue
-- row, and mark the session confirmed in the same locked transaction.
CREATE OR REPLACE FUNCTION public.confirm_stem_upload_session(
  p_id UUID,
  p_user_id UUID,
  p_storage_path TEXT,
  p_original_file_name TEXT,
  p_expected_size BIGINT,
  p_title TEXT,
  p_source_uri TEXT,
  p_requested_at TIMESTAMPTZ,
  p_license_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.stem_upload_sessions%ROWTYPE;
  v_existing public.generations%ROWTYPE;
  v_active_count BIGINT;
  v_studio_slot_count BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT * INTO v_existing
  FROM public.generations
  WHERE id = p_id;
  IF FOUND THEN
    IF v_existing.user_id = p_user_id AND v_existing.source_audio_url = p_source_uri THEN
      RETURN jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'idempotent', TRUE);
    END IF;
    RAISE EXCEPTION 'UPLOAD_GENERATION_CONFLICT';
  END IF;

  SELECT * INTO v_session
  FROM public.stem_upload_sessions
  WHERE id = p_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UPLOAD_SESSION_MISSING';
  END IF;
  IF v_session.confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'UPLOAD_SESSION_USED';
  END IF;
  IF v_session.expires_at <= NOW() THEN
    RAISE EXCEPTION 'UPLOAD_SESSION_EXPIRED';
  END IF;
  IF v_session.storage_path <> p_storage_path
    OR v_session.original_file_name <> p_original_file_name
    OR v_session.expected_size <> p_expected_size
    OR p_source_uri <> ('storage://melodio-private/' || v_session.storage_path)
  THEN
    RAISE EXCEPTION 'UPLOAD_SESSION_MISMATCH';
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM public.generations
  WHERE user_id = p_user_id
    AND (
      license_hash LIKE '%"stemStatus":"pending"%'
      OR license_hash LIKE '%"stemStatus":"processing"%'
      OR license_hash LIKE '%"stemStatus":"cleanup"%'
    );
  IF v_active_count >= 3 THEN
    RAISE EXCEPTION 'UPLOAD_ACTIVE_LIMIT';
  END IF;

  SELECT
    (
      SELECT COUNT(*)
      FROM public.generations
      WHERE user_id = p_user_id
        AND (
          license_hash LIKE '%"sourceMenu":"stem-upload"%'
          OR license_hash LIKE '%"sourceMenu":"custom-upload"%'
        )
    )
    +
    (
      SELECT COUNT(*)
      FROM public.stem_upload_sessions
      WHERE user_id = p_user_id
        AND id <> p_id
        AND confirmed_at IS NULL
        AND expires_at > NOW()
    )
  INTO v_studio_slot_count;
  IF v_studio_slot_count >= 10 THEN
    RAISE EXCEPTION 'STEM_OUTPUT_LIMIT';
  END IF;

  INSERT INTO public.generations (
    id,
    user_id,
    title,
    status,
    is_public,
    is_liked,
    is_stem_extracted,
    audio_url,
    source_audio_url,
    license_hash
  ) VALUES (
    p_id,
    p_user_id,
    p_title,
    'pending',
    FALSE,
    FALSE,
    FALSE,
    NULL,
    p_source_uri,
    p_license_hash
  );

  UPDATE public.stem_upload_sessions
  SET confirmed_at = p_requested_at, generation_id = p_id
  WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'pending', 'idempotent', FALSE);
END;
$$;

-- Atomically queue a retry or an on-demand split after the API has validated
-- ownership/source/state. The expected values provide a CAS guard while the
-- advisory lock makes the shared per-user limits concurrency-safe.
CREATE OR REPLACE FUNCTION public.queue_existing_stem_job(
  p_id UUID,
  p_user_id UUID,
  p_expected_status TEXT,
  p_expected_license_hash TEXT,
  p_next_status TEXT,
  p_next_license_hash TEXT,
  p_force_private BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active_count BIGINT;
  v_studio_slot_count BIGINT;
  v_updated_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT COUNT(*) INTO v_active_count
  FROM public.generations
  WHERE user_id = p_user_id
    AND id <> p_id
    AND (
      license_hash LIKE '%"stemStatus":"pending"%'
      OR license_hash LIKE '%"stemStatus":"processing"%'
      OR license_hash LIKE '%"stemStatus":"cleanup"%'
    );
  IF v_active_count >= 3 THEN
    RAISE EXCEPTION 'STEM_ACTIVE_LIMIT';
  END IF;

  IF p_force_private THEN
    SELECT
      (
        SELECT COUNT(*)
        FROM public.generations
        WHERE user_id = p_user_id
          AND id <> p_id
          AND (
            license_hash LIKE '%"sourceMenu":"stem-upload"%'
            OR license_hash LIKE '%"sourceMenu":"custom-upload"%'
          )
      )
      +
      (
        SELECT COUNT(*)
        FROM public.stem_upload_sessions
        WHERE user_id = p_user_id
          AND confirmed_at IS NULL
          AND expires_at > NOW()
      )
    INTO v_studio_slot_count;
    IF v_studio_slot_count >= 10 THEN
      RAISE EXCEPTION 'STEM_OUTPUT_LIMIT';
    END IF;
  END IF;

  UPDATE public.generations
  SET
    status = p_next_status,
    license_hash = p_next_license_hash,
    is_public = CASE WHEN p_force_private THEN FALSE ELSE is_public END
  WHERE id = p_id
    AND user_id = p_user_id
    AND status = p_expected_status
    AND license_hash IS NOT DISTINCT FROM p_expected_license_hash
  RETURNING id INTO v_updated_id;

  RETURN v_updated_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_stem_upload_session(UUID, UUID, TEXT, TEXT, BIGINT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_stem_upload_session(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_existing_stem_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stem_upload_session(UUID, UUID, TEXT, TEXT, BIGINT, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_stem_upload_session(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_existing_stem_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role;

-- Source uploads are capped independently from the much larger uncompressed
-- Demucs outputs.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'melodio-private',
  'melodio-private',
  FALSE,
  83886080,
  ARRAY[
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/aac',
    'audio/ogg',
    'audio/flac',
    'audio/x-flac'
  ]::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'melodio-private-stems',
  'melodio-private-stems',
  FALSE,
  1073741824,
  ARRAY[
    'audio/wav',
    'audio/x-wav',
    'audio/mp4'
  ]::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Remove every historical policy name used by this feature before installing
-- the final least-privilege policy set.
DROP POLICY IF EXISTS "Users read own private stem files"
  ON storage.objects;
DROP POLICY IF EXISTS "Users upload own private stem files"
  ON storage.objects;
DROP POLICY IF EXISTS "Users update own private stem files"
  ON storage.objects;
DROP POLICY IF EXISTS "Users delete own private stem files"
  ON storage.objects;
DROP POLICY IF EXISTS "Users read own private stem uploads"
  ON storage.objects;
DROP POLICY IF EXISTS "Users upload own private stem sources"
  ON storage.objects;
DROP POLICY IF EXISTS "Users read own private stem outputs"
  ON storage.objects;
DROP POLICY IF EXISTS "Stem private select guard"
  ON storage.objects;
DROP POLICY IF EXISTS "Stem private insert guard"
  ON storage.objects;
DROP POLICY IF EXISTS "Stem private update guard"
  ON storage.objects;
DROP POLICY IF EXISTS "Stem private delete guard"
  ON storage.objects;

-- Authenticated users can only read their own source/output objects. Uploads
-- require a server-created signed token; only service_role may update/delete or
-- write Stem outputs.
CREATE POLICY "Users read own private stem uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'melodio-private'
  AND (storage.foldername(name))[1] = 'uploads'
  AND (storage.foldername(name))[2] = auth.uid()::TEXT
);

CREATE POLICY "Users read own private stem outputs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'melodio-private-stems'
  AND (storage.foldername(name))[1] = 'stems'
  AND (storage.foldername(name))[2] = auth.uid()::TEXT
);

-- Restrictive guards are AND-ed with every permissive policy that applies to
-- anon/authenticated. Therefore even an unrelated historical `USING (true)`
-- policy cannot expose or mutate either private bucket.
CREATE POLICY "Stem private select guard"
ON storage.objects
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (
  bucket_id NOT IN ('melodio-private', 'melodio-private-stems')
  OR (
    bucket_id = 'melodio-private'
    AND (storage.foldername(name))[1] = 'uploads'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
  )
  OR (
    bucket_id = 'melodio-private-stems'
    AND (storage.foldername(name))[1] = 'stems'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
  )
);

CREATE POLICY "Stem private insert guard"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id NOT IN ('melodio-private', 'melodio-private-stems'));

CREATE POLICY "Stem private update guard"
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (bucket_id NOT IN ('melodio-private', 'melodio-private-stems'))
WITH CHECK (bucket_id NOT IN ('melodio-private', 'melodio-private-stems'));

CREATE POLICY "Stem private delete guard"
ON storage.objects
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (bucket_id NOT IN ('melodio-private', 'melodio-private-stems'));

-- An unrelated storage.objects policy is OR-ed with the policies above. Only
-- pre-existing browser-role policies whose expression is visibly constrained
-- by a positive bucket_id equality/static ANY list are accepted. Negative,
-- function-based, OR-composed, bucket-agnostic, or private-bucket expressions
-- fail closed and require a manual policy audit.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname NOT IN (
        'Users read own private stem uploads',
        'Users read own private stem outputs',
        'Stem private select guard',
        'Stem private insert guard',
        'Stem private update guard',
        'Stem private delete guard'
      )
      AND roles && ARRAY['public', 'anon', 'authenticated']::NAME[]
      AND (
        (
          cmd IN ('ALL', 'SELECT', 'UPDATE', 'DELETE')
          AND NOT (
            qual IS NOT NULL
            AND qual NOT ILIKE '%melodio-private%'
            AND qual !~* '(^|[^a-z0-9_])or([^a-z0-9_]|$)'
            AND qual !~* '(^|[^a-z0-9_])not([^a-z0-9_]|$)'
            AND qual !~* '=[[:space:]]*(true|false)([^a-z0-9_]|$)'
            AND (
              qual ~* 'bucket_id[[:space:]]*=[[:space:]]*''[^'']+''(::text)?'
              OR qual ~* 'bucket_id[[:space:]]*=[[:space:]]*ANY[[:space:]]*\([[:space:]]*ARRAY\['
            )
          )
        )
        OR (
          cmd IN ('ALL', 'INSERT', 'UPDATE')
          AND NOT (
            with_check IS NOT NULL
            AND with_check NOT ILIKE '%melodio-private%'
            AND with_check !~* '(^|[^a-z0-9_])or([^a-z0-9_]|$)'
            AND with_check !~* '(^|[^a-z0-9_])not([^a-z0-9_]|$)'
            AND with_check !~* '=[[:space:]]*(true|false)([^a-z0-9_]|$)'
            AND (
              with_check ~* 'bucket_id[[:space:]]*=[[:space:]]*''[^'']+''(::text)?'
              OR with_check ~* 'bucket_id[[:space:]]*=[[:space:]]*ANY[[:space:]]*\([[:space:]]*ARRAY\['
            )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'UNSAFE_BROAD_STORAGE_POLICY_REQUIRES_REVIEW';
  END IF;
END;
$$;

COMMIT;
