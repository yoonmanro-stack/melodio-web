-- Immutable account-owned recipe snapshots. This migration makes no media or
-- provider calls. Apply separately after reviewing the application release.
BEGIN;

CREATE TABLE public.healing_rain_projects (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_request_id TEXT NOT NULL CHECK (client_request_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$'),
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT healing_rain_projects_owner_request UNIQUE (user_id, client_request_id),
  CONSTRAINT healing_rain_projects_snapshot_shape CHECK (COALESCE((
    jsonb_typeof(plan) = 'object'
    AND plan ?& ARRAY['id', 'createdAt', 'schemaVersion', 'recipeVersion', 'input', 'prompts', 'layers', 'checks', 'generation']
    AND plan->>'id' = id::text
    AND (plan->>'createdAt')::timestamptz = created_at
    AND plan->'schemaVersion' = '1'::jsonb AND plan->'recipeVersion' = '1'::jsonb
    AND jsonb_typeof(plan->'input') = 'object'
    AND jsonb_typeof(plan->'prompts') = 'object'
    AND jsonb_typeof(plan->'layers') = 'array' AND jsonb_typeof(plan->'checks') = 'array'
    AND plan #>> '{generation,status}' = 'draft'
    AND plan #> '{generation,freshAssets}' = 'true'::jsonb
    AND octet_length(plan::text) <= 24000
  ), FALSE))
);

CREATE INDEX healing_rain_projects_owner_created
  ON public.healing_rain_projects (user_id, created_at DESC, id DESC);

ALTER TABLE public.healing_rain_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.healing_rain_projects FORCE ROW LEVEL SECURITY;
CREATE POLICY healing_rain_projects_owner_read ON public.healing_rain_projects
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- No browser INSERT/UPDATE/DELETE grant or write policy. All snapshots must pass
-- authenticated server-side recipe compilation. Service role only adds/reads.
REVOKE ALL ON public.healing_rain_projects FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.healing_rain_projects TO authenticated;
GRANT SELECT, INSERT ON public.healing_rain_projects TO service_role;

CREATE FUNCTION public.guard_healing_rain_project_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Healing Rain snapshots are immutable' USING ERRCODE = '22023';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_healing_rain_project_snapshot() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER healing_rain_projects_snapshot_guard BEFORE UPDATE ON public.healing_rain_projects
  FOR EACH ROW EXECUTE FUNCTION public.guard_healing_rain_project_snapshot();

CREATE FUNCTION public.save_healing_rain_projects(p_user_id UUID, p_projects JSONB)
RETURNS TABLE (client_request_id TEXT, plan JSONB, created BOOLEAN)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_item JSONB;
  v_request_id TEXT;
  v_plan JSONB;
  v_stored JSONB;
  v_created BOOLEAN;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Server compilation required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_projects IS NULL OR jsonb_typeof(p_projects) <> 'array' THEN
    RAISE EXCEPTION 'Invalid project import' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_projects) NOT BETWEEN 1 AND 50 OR
    (SELECT count(DISTINCT item->>'client_request_id') FROM jsonb_array_elements(p_projects) AS item) <> jsonb_array_length(p_projects) THEN
    RAISE EXCEPTION 'Invalid project count or duplicate request ID' USING ERRCODE = '22023';
  END IF;

  -- Stable lock order avoids deadlocks for overlapping concurrent imports.
  FOR v_item IN SELECT item FROM jsonb_array_elements(p_projects) AS item ORDER BY item->>'client_request_id' LOOP
    v_request_id := v_item->>'client_request_id';
    v_plan := v_item->'plan';
    IF v_request_id IS NULL OR v_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$'
      OR v_plan IS NULL OR jsonb_typeof(v_plan) <> 'object' THEN
      RAISE EXCEPTION 'Invalid project snapshot' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.healing_rain_projects AS target (id, user_id, client_request_id, plan, created_at)
      VALUES ((v_plan->>'id')::uuid, p_user_id, v_request_id, v_plan, (v_plan->>'createdAt')::timestamptz)
      ON CONFLICT ON CONSTRAINT healing_rain_projects_owner_request DO NOTHING
      RETURNING target.plan INTO v_stored;
    v_created := FOUND;
    IF NOT v_created THEN
      SELECT saved.plan INTO v_stored FROM public.healing_rain_projects AS saved
        WHERE saved.user_id = p_user_id AND saved.client_request_id = v_request_id;
      IF v_stored IS NULL OR v_stored->'input' IS DISTINCT FROM v_plan->'input' THEN
        -- Raising aborts the entire import, including earlier inserts.
        RAISE EXCEPTION 'Project request ID belongs to a different recipe' USING ERRCODE = '23505';
      END IF;
    END IF;
    client_request_id := v_request_id;
    plan := v_stored;
    created := v_created;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.save_healing_rain_projects(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_healing_rain_projects(UUID, JSONB) TO service_role;

COMMIT;
