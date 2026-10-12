-- Durable preview queue. No provider calls occur in this migration or its RPCs.
-- Requires 20261012_create_healing_rain_projects.sql first.
BEGIN;

CREATE TABLE public.healing_rain_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.healing_rain_projects(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL CHECK (client_request_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$'),
  request_snapshot JSONB NOT NULL CHECK (jsonb_typeof(request_snapshot) = 'object' AND octet_length(request_snapshot::text) <= 24000),
  quote_version TEXT NOT NULL CHECK (quote_version ~ '^[A-Za-z0-9._-]{1,100}$'),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'ready', 'needs_attention', 'failed')),
  stage TEXT NOT NULL DEFAULT 'queued' CHECK (stage ~ '^[a-z][a-z0-9_]{0,59}$'),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  checkpoints JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(checkpoints) = 'object' AND octet_length(checkpoints::text) <= 32000),
  assets JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(assets) = 'object' AND octet_length(assets::text) <= 16000),
  estimated_cost JSONB NOT NULL CHECK (jsonb_typeof(estimated_cost) = 'object' AND octet_length(estimated_cost::text) <= 8000),
  actual_usage JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(actual_usage) = 'object' AND octet_length(actual_usage::text) <= 8000),
  error_code TEXT CHECK (error_code ~ '^[a-z0-9_]{1,64}$'),
  error_message TEXT CHECK (length(error_message) <= 240),
  claim_token UUID,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT healing_rain_generations_owner_request UNIQUE (user_id, client_request_id),
  CONSTRAINT healing_rain_generations_lease_pair CHECK ((claim_token IS NULL) = (lease_expires_at IS NULL)),
  CONSTRAINT healing_rain_generations_snapshot_shape CHECK (COALESCE((
    request_snapshot->>'id' = project_id::text
    AND request_snapshot #>> '{input,sceneId}' = 'train'
    AND request_snapshot #>> '{input,thunder}' = 'none'
    AND request_snapshot #> '{input,takes}' = '6'::jsonb
    AND request_snapshot #> '{generation,audioTakes}' = '6'::jsonb
    AND request_snapshot #> '{generation,freshAssets}' = 'true'::jsonb
  ), false))
);
CREATE INDEX healing_rain_generations_owner_created ON public.healing_rain_generations(user_id, created_at DESC, id DESC);
CREATE INDEX healing_rain_generations_project_created ON public.healing_rain_generations(project_id, created_at DESC);
CREATE INDEX healing_rain_generations_claimable ON public.healing_rain_generations(status, lease_expires_at, created_at) WHERE status IN ('queued', 'running');
-- DB constraint supplements the transactional owner lock even for service code.
CREATE UNIQUE INDEX healing_rain_generations_one_active_owner ON public.healing_rain_generations(user_id) WHERE status IN ('queued', 'running', 'needs_attention');

ALTER TABLE public.healing_rain_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.healing_rain_generations FORCE ROW LEVEL SECURITY;
CREATE POLICY healing_rain_generations_owner_read ON public.healing_rain_generations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.healing_rain_generations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.healing_rain_generations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.healing_rain_generations TO service_role;

CREATE FUNCTION public.guard_healing_rain_generation_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ROW(NEW.id, NEW.user_id, NEW.project_id, NEW.client_request_id, NEW.request_snapshot, NEW.quote_version, NEW.estimated_cost, NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.user_id, OLD.project_id, OLD.client_request_id, OLD.request_snapshot, OLD.quote_version, OLD.estimated_cost, OLD.created_at) THEN
    RAISE EXCEPTION 'Generation request snapshots are immutable' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_healing_rain_generation_snapshot() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER healing_rain_generations_snapshot_guard BEFORE UPDATE ON public.healing_rain_generations
  FOR EACH ROW EXECUTE FUNCTION public.guard_healing_rain_generation_snapshot();

CREATE FUNCTION public.enqueue_healing_rain_generation(
  p_user_id UUID, p_project_id UUID, p_client_request_id TEXT,
  p_quote_version TEXT, p_estimated_cost JSONB, p_global_queue_limit INTEGER DEFAULT 10
)
RETURNS TABLE (job JSONB, created BOOLEAN)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_job public.healing_rain_generations%ROWTYPE;
  v_plan JSONB;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Server authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_project_id IS NULL OR p_client_request_id IS NULL
    OR p_client_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$'
    OR p_quote_version IS NULL OR p_quote_version !~ '^[A-Za-z0-9._-]{1,100}$'
    OR p_estimated_cost IS NULL OR jsonb_typeof(p_estimated_cost) <> 'object'
    OR p_global_queue_limit IS NULL OR p_global_queue_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid generation request' USING ERRCODE = '22023';
  END IF;
  -- Fixed global lock makes the queue cap atomic. Owner lock scopes retry/active checks.
  PERFORM pg_advisory_xact_lock(hashtextextended('healing-rain-generation-queue', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('healing-rain-generation-owner:' || p_user_id::text, 0));
  SELECT g.* INTO v_job FROM public.healing_rain_generations g
    WHERE g.user_id = p_user_id AND g.client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_job.project_id <> p_project_id THEN
      RAISE EXCEPTION 'Generation request ID belongs to another project' USING ERRCODE = '23505';
    END IF;
    job := to_jsonb(v_job); created := false; RETURN NEXT; RETURN;
  END IF;
  SELECT p.plan INTO v_plan FROM public.healing_rain_projects p WHERE p.id = p_project_id AND p.user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002'; END IF;
  IF COALESCE((v_plan #>> '{input,sceneId}' = 'train' AND v_plan #>> '{input,thunder}' = 'none'
    AND v_plan #> '{input,takes}' = '6'::jsonb AND v_plan #> '{generation,audioTakes}' = '6'::jsonb), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Unsupported preview recipe' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.healing_rain_generations g WHERE g.user_id = p_user_id AND g.status IN ('queued', 'running', 'needs_attention'))
    OR (SELECT count(*) FROM public.healing_rain_generations g WHERE g.status = 'queued') >= p_global_queue_limit THEN
    RAISE EXCEPTION 'Generation queue occupied' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.healing_rain_generations(user_id, project_id, client_request_id, request_snapshot, quote_version, estimated_cost)
    VALUES (p_user_id, p_project_id, p_client_request_id, v_plan, p_quote_version, p_estimated_cost) RETURNING * INTO v_job;
  job := to_jsonb(v_job); created := true; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_healing_rain_generation(UUID, UUID, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_healing_rain_generation(UUID, UUID, TEXT, TEXT, JSONB, INTEGER) TO service_role;

-- Expired jobs may be reclaimed, but their existing checkpoints remain intact.
-- A worker MUST hold an ambiguous paid intent instead of resubmitting it.
CREATE FUNCTION public.claim_healing_rain_generation(p_lease_seconds INTEGER DEFAULT 180)
RETURNS SETOF public.healing_rain_generations
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_id UUID;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Worker authorization required' USING ERRCODE = '42501'; END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RAISE EXCEPTION 'Invalid lease' USING ERRCODE = '22023'; END IF;
  SELECT g.id INTO v_id FROM public.healing_rain_generations g
    WHERE g.status = 'queued' OR (g.status = 'running' AND g.lease_expires_at <= clock_timestamp())
    ORDER BY g.created_at, g.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE public.healing_rain_generations g SET
    status = 'running', claim_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
    started_at = COALESCE(g.started_at, clock_timestamp()), updated_at = clock_timestamp()
    WHERE g.id = v_id RETURNING g.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_healing_rain_generation(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_healing_rain_generation(INTEGER) TO service_role;

-- Whole checkpoint/assets objects replace their prior values. Worker carries
-- forward previous entries and must check that exactly one row was returned.
CREATE FUNCTION public.update_healing_rain_generation(
  p_job_id UUID, p_claim_token UUID, p_patch JSONB, p_lease_seconds INTEGER DEFAULT 180
)
RETURNS SETOF public.healing_rain_generations
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_status TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Worker authorization required' USING ERRCODE = '42501'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR octet_length(p_patch::text) > 64000
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 900
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) AS k(key) WHERE key NOT IN ('status','stage','progress','checkpoints','assets','actual_usage','error_code','error_message')) THEN
    RAISE EXCEPTION 'Invalid worker patch' USING ERRCODE = '22023';
  END IF;
  v_status := COALESCE(p_patch->>'status', 'running');
  IF v_status NOT IN ('running','ready','needs_attention','failed') THEN RAISE EXCEPTION 'Invalid transition' USING ERRCODE = '22023'; END IF;
  RETURN QUERY UPDATE public.healing_rain_generations g SET
    status = v_status,
    stage = CASE WHEN p_patch ? 'stage' THEN p_patch->>'stage' ELSE g.stage END,
    progress = CASE WHEN p_patch ? 'progress' THEN (p_patch->>'progress')::integer ELSE g.progress END,
    checkpoints = CASE WHEN p_patch ? 'checkpoints' THEN p_patch->'checkpoints' ELSE g.checkpoints END,
    assets = CASE WHEN p_patch ? 'assets' THEN p_patch->'assets' ELSE g.assets END,
    actual_usage = CASE WHEN p_patch ? 'actual_usage' THEN p_patch->'actual_usage' ELSE g.actual_usage END,
    error_code = CASE WHEN p_patch ? 'error_code' THEN p_patch->>'error_code' ELSE g.error_code END,
    error_message = CASE WHEN p_patch ? 'error_message' THEN p_patch->>'error_message' ELSE g.error_message END,
    updated_at = clock_timestamp(),
    completed_at = CASE WHEN v_status IN ('ready','failed') THEN clock_timestamp() ELSE g.completed_at END,
    claim_token = CASE WHEN v_status = 'running' THEN g.claim_token ELSE NULL END,
    lease_expires_at = CASE WHEN v_status = 'running' THEN clock_timestamp() + make_interval(secs => p_lease_seconds) ELSE NULL END
    WHERE g.id = p_job_id AND g.claim_token = p_claim_token AND g.status = 'running' AND g.lease_expires_at > clock_timestamp()
    RETURNING g.*;
END;
$$;
REVOKE ALL ON FUNCTION public.update_healing_rain_generation(UUID, UUID, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_healing_rain_generation(UUID, UUID, JSONB, INTEGER) TO service_role;

-- No browser Storage policy: read access is through short-lived URLs signed by
-- the authenticated API for validated <owner UUID>/<job UUID>/<filename> keys.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('healing-rain', 'healing-rain', false, 524288000, ARRAY['image/png','image/jpeg','image/webp','video/mp4','audio/wav','audio/mpeg','audio/mp4'])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Existing broad permissive Storage policies must not expose this new bucket.
CREATE POLICY healing_rain_storage_server_only ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'healing-rain') WITH CHECK (bucket_id <> 'healing-rain');

COMMIT;
