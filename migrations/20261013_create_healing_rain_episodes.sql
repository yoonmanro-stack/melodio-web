-- Immutable creative plans and append-only plan reviews. These RPCs never queue
-- media generation or grant publishing, YouTube policy, or long-form approval.
BEGIN;

CREATE TABLE public.healing_rain_episodes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL CHECK (client_request_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$'),
  plan JSONB NOT NULL,
  comparison JSONB NOT NULL CHECK (jsonb_typeof(comparison) = 'object' AND octet_length(comparison::text) <= 16000),
  created_at TIMESTAMPTZ NOT NULL CHECK (isfinite(created_at)),
  CONSTRAINT healing_rain_episodes_owner_request UNIQUE (user_id, client_request_id),
  CONSTRAINT healing_rain_episodes_owner_id UNIQUE (user_id, id),
  CONSTRAINT healing_rain_episodes_snapshot_shape CHECK (COALESCE((
    jsonb_typeof(plan) = 'object'
    AND jsonb_typeof(plan->'id') = 'string' AND plan->>'id' = id::text
    AND jsonb_typeof(plan->'createdAt') = 'string' AND (plan->>'createdAt')::timestamptz = created_at
    AND plan->>'version' = 'healing-rain-episode-v1'
    AND jsonb_typeof(plan->'input') = 'object'
    AND jsonb_typeof(plan->'execution') = 'object'
    AND plan #> '{execution,providerCallsAllowed}' = 'false'::jsonb
    AND plan #> '{execution,longFormEnabled}' = 'false'::jsonb
    AND plan #> '{execution,policyApproval}' = 'false'::jsonb
    AND octet_length(plan::text) <= 48000
  ), FALSE))
);
CREATE INDEX healing_rain_episodes_owner_created
  ON public.healing_rain_episodes (user_id, created_at DESC, id DESC);

CREATE TABLE public.healing_rain_episode_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  episode_id UUID NOT NULL,
  client_request_id TEXT NOT NULL CHECK (client_request_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$'),
  verdict TEXT NOT NULL CHECK (verdict IN ('approve_plan', 'needs_revision')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 1200 AND reason !~ '^[[:space:]]|[[:space:]]$|[[:space:]]{2,}' AND reason !~ '[[:cntrl:]]'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT healing_rain_episode_reviews_owner_request UNIQUE (user_id, client_request_id),
  CONSTRAINT healing_rain_episode_reviews_owner_episode FOREIGN KEY (user_id, episode_id)
    REFERENCES public.healing_rain_episodes(user_id, id) ON DELETE CASCADE
);
CREATE INDEX healing_rain_episode_reviews_owner_created
  ON public.healing_rain_episode_reviews (user_id, created_at DESC, id DESC);
CREATE INDEX healing_rain_episode_reviews_episode_created
  ON public.healing_rain_episode_reviews (episode_id, created_at DESC, id DESC);

ALTER TABLE public.healing_rain_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.healing_rain_episodes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.healing_rain_episode_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.healing_rain_episode_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY healing_rain_episodes_owner_read ON public.healing_rain_episodes
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY healing_rain_episode_reviews_owner_read ON public.healing_rain_episode_reviews
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Even service_role must write through the two validated RPCs. Browser clients
-- cannot write either table or execute these functions.
REVOKE ALL ON public.healing_rain_episodes, public.healing_rain_episode_reviews FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.healing_rain_episodes, public.healing_rain_episode_reviews TO authenticated, service_role;

CREATE FUNCTION public.guard_healing_rain_episode_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Healing Rain plans and reviews are immutable' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_healing_rain_episode_snapshot() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER healing_rain_episodes_snapshot_guard BEFORE UPDATE ON public.healing_rain_episodes
  FOR EACH ROW EXECUTE FUNCTION public.guard_healing_rain_episode_snapshot();
CREATE TRIGGER healing_rain_episode_reviews_snapshot_guard BEFORE UPDATE ON public.healing_rain_episode_reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_healing_rain_episode_snapshot();

CREATE FUNCTION public.save_healing_rain_episode(
  p_user_id UUID, p_client_request_id TEXT, p_plan JSONB, p_comparison JSONB
)
RETURNS TABLE (id UUID, plan JSONB, comparison JSONB, created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_saved public.healing_rain_episodes%ROWTYPE;
  v_id UUID;
  v_created_at TIMESTAMPTZ;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Server compilation required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_client_request_id IS NULL
    OR p_client_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$'
    OR NOT COALESCE((jsonb_typeof(p_plan) = 'object' AND octet_length(p_plan::text) <= 48000
      AND jsonb_typeof(p_plan->'id') = 'string' AND jsonb_typeof(p_plan->'createdAt') = 'string'
      AND p_plan->>'version' = 'healing-rain-episode-v1'
      AND jsonb_typeof(p_plan->'input') = 'object' AND jsonb_typeof(p_plan->'execution') = 'object'
      AND p_plan #> '{execution,providerCallsAllowed}' = 'false'::jsonb
      AND p_plan #> '{execution,longFormEnabled}' = 'false'::jsonb
      AND p_plan #> '{execution,policyApproval}' = 'false'::jsonb), FALSE)
    OR NOT COALESCE((jsonb_typeof(p_comparison) = 'object' AND octet_length(p_comparison::text) <= 16000), FALSE) THEN
    RAISE EXCEPTION 'Invalid planning snapshot' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_id := (p_plan->>'id')::uuid;
    v_created_at := (p_plan->>'createdAt')::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Invalid planning snapshot identity or timestamp' USING ERRCODE = '22023';
  END;
  IF v_id::text <> p_plan->>'id' OR NOT isfinite(v_created_at) THEN
    RAISE EXCEPTION 'Invalid planning snapshot identity or timestamp' USING ERRCODE = '22023';
  END IF;

  -- Serialize request retries before reading; different users remain independent.
  PERFORM pg_advisory_xact_lock(hashtextextended('healing-rain-episode:' || p_user_id::text || ':' || p_client_request_id, 0));
  SELECT saved.* INTO v_saved FROM public.healing_rain_episodes AS saved
    WHERE saved.user_id = p_user_id AND saved.client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_saved.plan->'input' IS DISTINCT FROM p_plan->'input' THEN
      RAISE EXCEPTION 'Episode request ID belongs to different input' USING ERRCODE = '23505';
    END IF;
    id := v_saved.id; plan := v_saved.plan; comparison := v_saved.comparison; created := false;
    RETURN NEXT; RETURN;
  END IF;
  INSERT INTO public.healing_rain_episodes AS saved (id, user_id, client_request_id, plan, comparison, created_at)
    VALUES (v_id, p_user_id, p_client_request_id, p_plan, p_comparison, v_created_at)
    RETURNING saved.* INTO v_saved;
  id := v_saved.id; plan := v_saved.plan; comparison := v_saved.comparison; created := true;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.save_healing_rain_episode(UUID, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_healing_rain_episode(UUID, TEXT, JSONB, JSONB) TO service_role;

CREATE FUNCTION public.review_healing_rain_episode(
  p_user_id UUID, p_episode_id UUID, p_client_request_id TEXT, p_verdict TEXT, p_reason TEXT
)
RETURNS TABLE (id UUID, episode_id UUID, verdict TEXT, reason TEXT, created_at TIMESTAMPTZ, created BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_saved public.healing_rain_episode_reviews%ROWTYPE;
  v_reason TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Server review authorization required' USING ERRCODE = '42501';
  END IF;
  v_reason := btrim(regexp_replace(p_reason, '[[:space:]]+', ' ', 'g'));
  IF p_user_id IS NULL OR p_episode_id IS NULL OR p_client_request_id IS NULL
    OR p_client_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$'
    OR p_verdict IS NULL OR p_verdict NOT IN ('approve_plan', 'needs_revision')
    OR v_reason IS NULL OR length(v_reason) NOT BETWEEN 1 AND 1200 OR v_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Invalid plan review' USING ERRCODE = '22023';
  END IF;
  -- An owned episode is required even for retries; foreign IDs are indistinguish-
  -- able from missing IDs. This check is authoritative, not caller-supplied data.
  PERFORM 1 FROM public.healing_rain_episodes AS saved WHERE saved.id = p_episode_id AND saved.user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Episode not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('healing-rain-episode-review:' || p_user_id::text || ':' || p_client_request_id, 0));
  SELECT saved.* INTO v_saved FROM public.healing_rain_episode_reviews AS saved
    WHERE saved.user_id = p_user_id AND saved.client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_saved.episode_id <> p_episode_id OR v_saved.verdict <> p_verdict OR v_saved.reason <> v_reason THEN
      RAISE EXCEPTION 'Review request ID belongs to a different review' USING ERRCODE = '23505';
    END IF;
    created := false;
  ELSE
    INSERT INTO public.healing_rain_episode_reviews AS saved (user_id, episode_id, client_request_id, verdict, reason)
      VALUES (p_user_id, p_episode_id, p_client_request_id, p_verdict, v_reason) RETURNING saved.* INTO v_saved;
    created := true;
  END IF;
  id := v_saved.id; episode_id := v_saved.episode_id; verdict := v_saved.verdict;
  reason := v_saved.reason; created_at := v_saved.created_at;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.review_healing_rain_episode(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_healing_rain_episode(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.healing_rain_episode_reviews IS
  'Append-only editorial plan feedback. approve_plan does not approve YouTube policy, media generation, long-form production, or publishing.';

COMMIT;
