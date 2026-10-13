-- Audio-first checkpoints and immutable owner decisions. No paid calls or long-form enablement.
BEGIN;
ALTER TABLE public.healing_rain_generations ADD COLUMN review_records JSONB NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(review_records) = 'object' AND octet_length(review_records::text) <= 8000);

CREATE FUNCTION public.guard_healing_rain_review_records()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_kind TEXT; v_record JSONB; v_key TEXT; v_hash JSONB;
BEGIN
  FOR v_kind, v_record IN SELECT key, value FROM jsonb_each(OLD.review_records) LOOP
    IF NEW.review_records->v_kind IS DISTINCT FROM v_record THEN
      RAISE EXCEPTION 'Review evidence is immutable' USING ERRCODE = '22023';
    END IF;
    IF NEW.checkpoints #>> '{generationSpec,sha256}' IS DISTINCT FROM v_record->>'generationSpecSha256' THEN
      RAISE EXCEPTION 'Reviewed specification is immutable' USING ERRCODE = '22023';
    END IF;
    FOR v_key, v_hash IN SELECT key, value FROM jsonb_each(v_record->'assetHashes') LOOP
      IF NEW.assets->v_key IS DISTINCT FROM OLD.assets->v_key
        OR (v_kind = 'audio' AND NEW.checkpoints->v_key IS DISTINCT FROM OLD.checkpoints->v_key) THEN
        RAISE EXCEPTION 'Reviewed originals are immutable' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_healing_rain_review_records() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER healing_rain_review_records_guard BEFORE UPDATE ON public.healing_rain_generations
  FOR EACH ROW EXECUTE FUNCTION public.guard_healing_rain_review_records();

CREATE FUNCTION public.review_healing_rain_generation(
  p_user_id UUID, p_job_id UUID, p_kind TEXT, p_decision TEXT, p_spec_sha256 TEXT, p_asset_hashes JSONB,
  p_global_queue_limit INTEGER DEFAULT 10
)
RETURNS SETOF public.healing_rain_generations
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_job public.healing_rain_generations%ROWTYPE;
  v_keys TEXT[]; v_key TEXT; v_asset JSONB; v_checkpoint JSONB; v_hashes JSONB := '{}'::jsonb;
  v_prior JSONB; v_record JSONB; v_origin JSONB;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Server authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_job_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('audio','preview')
    OR p_decision IS NULL OR p_decision NOT IN ('approve','reject')
    OR p_spec_sha256 IS NULL OR p_spec_sha256 !~ '^[a-f0-9]{64}$'
    OR p_asset_hashes IS NULL OR jsonb_typeof(p_asset_hashes) <> 'object'
    OR octet_length(p_asset_hashes::text) > 1024
    OR p_global_queue_limit IS NULL OR p_global_queue_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid review input' USING ERRCODE = '22023';
  END IF;
  -- Use the enqueue lock order: global queue before the job row. Replays remain idempotent at capacity.
  IF p_kind = 'audio' AND p_decision = 'approve' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('healing-rain-generation-queue', 0));
  END IF;
  SELECT g.* INTO v_job FROM public.healing_rain_generations g
    WHERE g.id = p_job_id AND g.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Generation not found' USING ERRCODE = 'P0002'; END IF;
  IF v_job.checkpoints #>> '{generationSpec,state}' IS DISTINCT FROM 'frozen'
    OR v_job.checkpoints #>> '{generationSpec,sha256}' IS DISTINCT FROM p_spec_sha256 THEN
    RAISE EXCEPTION 'Review specification changed' USING ERRCODE = '40001';
  END IF;
  v_keys := CASE WHEN p_kind = 'audio' THEN ARRAY['audio1','audio2','audio3','audio4','audio5','audio6'] ELSE ARRAY['preview30','preview180'] END;
  FOREACH v_key IN ARRAY v_keys LOOP
    v_asset := v_job.assets->v_key;
    IF v_asset->>'sha256' IS NULL OR v_asset->>'sha256' !~ '^[a-f0-9]{64}$'
      OR left(v_asset->>'path', length(p_user_id::text || '/' || p_job_id::text || '/')) IS DISTINCT FROM p_user_id::text || '/' || p_job_id::text || '/' THEN
      RAISE EXCEPTION 'Review original missing or foreign' USING ERRCODE = '40001';
    END IF;
    IF p_kind = 'audio' THEN
      v_checkpoint := v_job.checkpoints->v_key;
      v_origin := jsonb_build_object('policyVersion','healing-rain-fresh-audio-v1','jobId',p_job_id::text,'userId',p_user_id::text,'takeIndex',right(v_key,1)::integer,'seconds',30);
      IF v_asset->>'path' IS DISTINCT FROM p_user_id::text || '/' || p_job_id::text || '/' || v_key || '.mp3'
        OR v_asset->>'mimeType' IS DISTINCT FROM 'audio/mpeg' OR v_asset->'durationSeconds' IS DISTINCT FROM '30'::jsonb
        OR v_asset->'audioOrigin' IS DISTINCT FROM v_origin OR v_checkpoint->'audioOrigin' IS DISTINCT FROM v_origin
        OR v_checkpoint->>'state' IS DISTINCT FROM 'ready' OR v_checkpoint->>'provider' IS DISTINCT FROM 'elevenlabs'
        OR v_checkpoint->>'model' IS DISTINCT FROM 'eleven_text_to_sound_v2'
        OR v_checkpoint->>'generationSpecSha256' IS DISTINCT FROM p_spec_sha256
        OR v_checkpoint->>'sha256' IS DISTINCT FROM v_asset->>'sha256' THEN
        RAISE EXCEPTION 'Audio review provenance mismatch' USING ERRCODE = '40001';
      END IF;
    ELSE
      IF v_asset->>'path' !~ ('^' || p_user_id::text || '/' || p_job_id::text || '/[A-Za-z0-9][A-Za-z0-9_-]{0,119}\.mp4$')
        OR v_asset->>'mimeType' IS DISTINCT FROM 'video/mp4'
        OR v_asset->'durationSeconds' IS DISTINCT FROM to_jsonb(CASE WHEN v_key = 'preview30' THEN 30 ELSE 180 END)
        OR v_job.checkpoints #>> '{render,state}' IS DISTINCT FROM 'ready'
        OR v_job.checkpoints #>> '{render,generationSpecSha256}' IS DISTINCT FROM p_spec_sha256 THEN
        RAISE EXCEPTION 'Preview review provenance mismatch' USING ERRCODE = '40001';
      END IF;
    END IF;
    v_hashes := v_hashes || jsonb_build_object(v_key, v_asset->>'sha256');
  END LOOP;
  IF v_hashes IS DISTINCT FROM p_asset_hashes THEN
    RAISE EXCEPTION 'Review original hashes changed' USING ERRCODE = '40001';
  END IF;
  v_prior := v_job.review_records->p_kind;
  IF v_prior IS NOT NULL THEN
    IF v_prior->>'decision' IS DISTINCT FROM p_decision OR v_prior->>'userId' IS DISTINCT FROM p_user_id::text
      OR v_prior->>'jobId' IS DISTINCT FROM p_job_id::text OR v_prior->>'generationSpecSha256' IS DISTINCT FROM p_spec_sha256
      OR v_prior->'assetHashes' IS DISTINCT FROM v_hashes THEN
      RAISE EXCEPTION 'A different review is already recorded' USING ERRCODE = '40001';
    END IF;
    RETURN NEXT v_job; RETURN;
  END IF;
  IF v_job.claim_token IS NOT NULL OR v_job.lease_expires_at IS NOT NULL
    OR (p_kind = 'audio' AND (v_job.status <> 'needs_attention' OR v_job.stage <> 'audio_review_required'))
    OR (p_kind = 'preview' AND (v_job.status <> 'ready' OR v_job.stage <> 'preview_ready'
      OR v_job.review_records #>> '{audio,decision}' IS DISTINCT FROM 'approve')) THEN
    RAISE EXCEPTION 'Generation is not awaiting this review' USING ERRCODE = '40001';
  END IF;
  IF p_kind = 'audio' AND p_decision = 'approve'
    AND (SELECT count(*) FROM public.healing_rain_generations g WHERE g.status = 'queued') >= p_global_queue_limit THEN
    RAISE EXCEPTION 'Generation queue occupied' USING ERRCODE = 'P0001';
  END IF;
  v_record := jsonb_build_object('decision',p_decision,'userId',p_user_id::text,'jobId',p_job_id::text,
    'generationSpecSha256',p_spec_sha256,'assetHashes',v_hashes,'reviewedAt',clock_timestamp());
  RETURN QUERY UPDATE public.healing_rain_generations g SET
    review_records = g.review_records || jsonb_build_object(p_kind, v_record),
    status = CASE WHEN p_decision = 'reject' THEN 'failed' WHEN p_kind = 'audio' THEN 'queued' ELSE 'ready' END,
    stage = p_kind || CASE WHEN p_decision = 'reject' THEN '_rejected' ELSE '_approved' END,
    error_code = CASE WHEN p_decision = 'reject' THEN p_kind || '_rejected' ELSE NULL END,
    error_message = NULL, updated_at = clock_timestamp(),
    completed_at = CASE WHEN p_decision = 'reject' THEN clock_timestamp() WHEN p_kind = 'audio' THEN NULL ELSE g.completed_at END
    WHERE g.id = p_job_id AND g.user_id = p_user_id RETURNING g.*;
END;
$$;
REVOKE ALL ON FUNCTION public.review_healing_rain_generation(UUID, UUID, TEXT, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_healing_rain_generation(UUID, UUID, TEXT, TEXT, TEXT, JSONB, INTEGER) TO service_role;
COMMIT;
