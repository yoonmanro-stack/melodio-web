-- Prepared, rollback-only PostgreSQL test. Not run by the offline Node suite.
-- Apply the migration to a DISPOSABLE TEST database first. Replace the two
-- placeholders with distinct existing auth.users IDs in that database only.
-- Run the WHOLE script in one session as postgres; all fixture writes roll back.
BEGIN;

CREATE TEMP TABLE rain_project_test_context (
  owner_id UUID, other_id UUID, request_id TEXT, original_plan JSONB
) ON COMMIT DROP;
GRANT SELECT ON rain_project_test_context TO authenticated, service_role;

INSERT INTO rain_project_test_context
SELECT '__TEST_OWNER_UUID__'::uuid, '__TEST_OTHER_UUID__'::uuid, 'z-regression-' || gen_random_uuid()::text,
  jsonb_build_object(
    'id', gen_random_uuid(), 'createdAt', '2026-10-12T00:00:00.000Z',
    'schemaVersion', 1, 'recipeVersion', 1,
    'input', jsonb_build_object('title', 'Synthetic rollback-only recipe'),
    'prompts', jsonb_build_object('image', 'Synthetic', 'video', 'Synthetic', 'audio', 'Synthetic'),
    'layers', '[]'::jsonb, 'checks', '[]'::jsonb,
    'generation', jsonb_build_object('status', 'draft', 'freshAssets', true)
  );

DO $$
DECLARE v_context RECORD;
BEGIN
  SELECT * INTO v_context FROM rain_project_test_context;
  IF v_context.owner_id = v_context.other_id OR
    (SELECT count(*) FROM auth.users WHERE id IN (v_context.owner_id, v_context.other_id)) <> 2 THEN
    RAISE EXCEPTION 'Two distinct existing test account IDs are required';
  END IF;
  IF has_table_privilege('authenticated', 'public.healing_rain_projects', 'INSERT')
    OR has_table_privilege('authenticated', 'public.healing_rain_projects', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.healing_rain_projects', 'DELETE')
    OR has_table_privilege('anon', 'public.healing_rain_projects', 'SELECT')
    OR has_function_privilege('authenticated', 'public.save_healing_rain_projects(uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.save_healing_rain_projects(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Unsafe browser table/function privileges';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_context RECORD; v_result RECORD; v_rejected BOOLEAN; v_new_request TEXT;
  v_new_plan JSONB; v_changed_plan JSONB;
BEGIN
  SELECT * INTO v_context FROM rain_project_test_context;
  SELECT * INTO v_result FROM public.save_healing_rain_projects(v_context.owner_id,
    jsonb_build_array(jsonb_build_object('client_request_id', v_context.request_id, 'plan', v_context.original_plan)));
  IF NOT v_result.created OR v_result.plan IS DISTINCT FROM v_context.original_plan THEN
    RAISE EXCEPTION 'First save did not return the created snapshot';
  END IF;
  v_new_plan := jsonb_set(v_context.original_plan, '{id}', to_jsonb(gen_random_uuid()::text));
  SELECT * INTO v_result FROM public.save_healing_rain_projects(v_context.owner_id,
    jsonb_build_array(jsonb_build_object('client_request_id', v_context.request_id, 'plan', v_new_plan)));
  IF v_result.created OR v_result.plan IS DISTINCT FROM v_context.original_plan THEN
    RAISE EXCEPTION 'Retry did not return the original immutable snapshot';
  END IF;

  -- The other owner may independently use the same request ID.
  SELECT * INTO v_result FROM public.save_healing_rain_projects(v_context.other_id,
    jsonb_build_array(jsonb_build_object('client_request_id', v_context.request_id, 'plan', v_new_plan)));
  IF NOT v_result.created THEN RAISE EXCEPTION 'Idempotence leaked across owners'; END IF;

  -- An earlier sorted insert must roll back when a later request conflicts.
  v_new_request := 'a-regression-' || gen_random_uuid()::text;
  v_new_plan := jsonb_set(v_context.original_plan, '{id}', to_jsonb(gen_random_uuid()::text));
  v_changed_plan := jsonb_set(v_context.original_plan, '{input,title}', '"Changed recipe"'::jsonb);
  v_changed_plan := jsonb_set(v_changed_plan, '{id}', to_jsonb(gen_random_uuid()::text));
  v_rejected := false;
  BEGIN
    PERFORM public.save_healing_rain_projects(v_context.owner_id, jsonb_build_array(
      jsonb_build_object('client_request_id', v_new_request, 'plan', v_new_plan),
      jsonb_build_object('client_request_id', v_context.request_id, 'plan', v_changed_plan)));
  EXCEPTION WHEN unique_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected OR EXISTS (SELECT 1 FROM public.healing_rain_projects WHERE client_request_id = v_new_request) THEN
    RAISE EXCEPTION 'Conflicting import did not fully roll back';
  END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.save_healing_rain_projects(v_context.owner_id,
      jsonb_build_array(jsonb_build_object('client_request_id', v_new_request, 'plan', v_new_plan),
        jsonb_build_object('client_request_id', v_new_request, 'plan', v_new_plan)));
  EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Duplicate import request IDs accepted'; END IF;

  v_rejected := false;
  BEGIN
    UPDATE public.healing_rain_projects SET plan = plan WHERE user_id = v_context.owner_id;
  EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Service role can update snapshots'; END IF;
END;
$$;
RESET ROLE;

-- Table owner can test the trigger independently of denied UPDATE grants.
DO $$
DECLARE v_rejected BOOLEAN := false;
BEGIN
  BEGIN
    UPDATE public.healing_rain_projects SET plan = plan
      WHERE id = (SELECT (original_plan->>'id')::uuid FROM rain_project_test_context);
  EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Immutable snapshot trigger failed'; END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub',
    (SELECT owner_id FROM rain_project_test_context))::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', (SELECT owner_id::text FROM rain_project_test_context), true);
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE v_context RECORD; v_count INTEGER; v_rejected BOOLEAN := false;
BEGIN
  SELECT * INTO v_context FROM rain_project_test_context;
  SELECT count(*) INTO v_count FROM public.healing_rain_projects WHERE client_request_id = v_context.request_id;
  IF v_count <> 1 OR EXISTS (SELECT 1 FROM public.healing_rain_projects WHERE user_id = v_context.other_id) THEN
    RAISE EXCEPTION 'Owner RLS leaked another account';
  END IF;
  BEGIN
    PERFORM public.save_healing_rain_projects(v_context.owner_id, '[]'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Authenticated client bypassed server compilation'; END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
