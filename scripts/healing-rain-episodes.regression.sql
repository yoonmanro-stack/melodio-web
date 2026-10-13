-- Rollback-only regression for a DISPOSABLE TEST database, never production.
-- Apply 20261013_create_healing_rain_episodes.sql first, replace the two UUID
-- placeholders with distinct existing auth.users IDs, then execute this WHOLE
-- script as postgres in one session with psql -v ON_ERROR_STOP=1 -f <this file>.
-- No providers, queues, Storage objects, or publishing operations are involved.
BEGIN;

CREATE TEMP TABLE rain_episode_test_context (
  owner_id UUID, other_id UUID, request_id TEXT, review_request_id TEXT,
  original_plan JSONB, second_plan JSONB, other_plan JSONB, original_comparison JSONB
) ON COMMIT DROP;
GRANT SELECT ON rain_episode_test_context TO authenticated, service_role;
INSERT INTO rain_episode_test_context
SELECT '__TEST_OWNER_UUID__'::uuid, '__TEST_OTHER_UUID__'::uuid,
  'episode-test-' || gen_random_uuid()::text, 'review-test-' || gen_random_uuid()::text,
  jsonb_build_object(
    'id', gen_random_uuid(), 'createdAt', '2026-10-13T00:00:00.000Z',
    'version', 'healing-rain-episode-v1', 'input', jsonb_build_object('title', 'Rollback-only creative plan'),
    'execution', jsonb_build_object('providerCallsAllowed', false, 'longFormEnabled', false, 'policyApproval', false)
  ), NULL, NULL, jsonb_build_object('status', 'synthetic', 'comparedEpisodeCount', 0);
UPDATE rain_episode_test_context SET
  second_plan = jsonb_set(original_plan, '{id}', to_jsonb(gen_random_uuid()::text)),
  other_plan = jsonb_set(original_plan, '{id}', to_jsonb(gen_random_uuid()::text));

DO $$
DECLARE v_context RECORD; v_table TEXT; v_role TEXT; v_privilege TEXT; v_function TEXT;
BEGIN
  SELECT * INTO v_context FROM rain_episode_test_context;
  IF v_context.owner_id = v_context.other_id OR
    (SELECT count(*) FROM auth.users WHERE id IN (v_context.owner_id, v_context.other_id)) <> 2 THEN
    RAISE EXCEPTION 'Two distinct existing test account IDs are required';
  END IF;
  FOREACH v_table IN ARRAY ARRAY['healing_rain_episodes', 'healing_rain_episode_reviews'] LOOP
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = ('public.' || v_table)::regclass) THEN
      RAISE EXCEPTION 'RLS must be enabled and forced on %', v_table;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['authenticated', 'service_role', 'anon'] LOOP
      FOREACH v_privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(v_role, 'public.' || v_table, v_privilege) THEN
          RAISE EXCEPTION 'Unsafe direct table privilege: % % %', v_role, v_table, v_privilege;
        END IF;
      END LOOP;
    END LOOP;
    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT') OR
      NOT has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') OR
      NOT has_table_privilege('service_role', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION 'Incorrect reader grants on %', v_table;
    END IF;
  END LOOP;
  FOREACH v_function IN ARRAY ARRAY[
    'public.save_healing_rain_episode(uuid,text,jsonb,jsonb)',
    'public.review_healing_rain_episode(uuid,uuid,text,text,text)'
  ] LOOP
    IF has_function_privilege('authenticated', v_function, 'EXECUTE') OR
      has_function_privilege('anon', v_function, 'EXECUTE') OR
      NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'Incorrect RPC grants on %', v_function;
    END IF;
    IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = v_function::regprocedure) THEN
      RAISE EXCEPTION 'RPC requires SECURITY DEFINER and an empty search_path';
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_context RECORD; v_result RECORD; v_review RECORD; v_rejected BOOLEAN;
  v_plan JSONB; v_bad JSONB; v_comparison JSONB; v_episode_id UUID; v_verdict TEXT; v_reason TEXT;
  v_table TEXT; v_statement TEXT;
BEGIN
  SELECT * INTO v_context FROM rain_episode_test_context;
  SELECT * INTO v_result FROM public.save_healing_rain_episode(v_context.owner_id,
    v_context.request_id, v_context.original_plan, v_context.original_comparison);
  IF NOT v_result.created OR v_result.id <> (v_context.original_plan->>'id')::uuid OR
    v_result.plan IS DISTINCT FROM v_context.original_plan OR v_result.comparison IS DISTINCT FROM v_context.original_comparison THEN
    RAISE EXCEPTION 'First save did not return the created snapshot';
  END IF;
  -- A new compiler ID, timestamp, and comparison cannot overwrite a saved retry.
  v_plan := jsonb_set(v_context.second_plan, '{createdAt}', '"2026-10-14T00:00:00.000Z"');
  SELECT * INTO v_result FROM public.save_healing_rain_episode(v_context.owner_id,
    v_context.request_id, v_plan, '{"status":"changed"}');
  IF v_result.created OR v_result.id <> (v_context.original_plan->>'id')::uuid OR
    v_result.plan IS DISTINCT FROM v_context.original_plan OR v_result.comparison IS DISTINCT FROM v_context.original_comparison THEN
    RAISE EXCEPTION 'Retry did not preserve the original plan and comparison';
  END IF;
  v_rejected := false;
  BEGIN
    PERFORM public.save_healing_rain_episode(v_context.owner_id, v_context.request_id,
      jsonb_set(v_plan, '{input,title}', '"Changed input"'), v_context.original_comparison);
  EXCEPTION WHEN unique_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Changed input reused an episode request ID'; END IF;
  PERFORM public.save_healing_rain_episode(v_context.owner_id, v_context.request_id || '-second',
    v_context.second_plan, v_context.original_comparison);
  SELECT * INTO v_result FROM public.save_healing_rain_episode(v_context.other_id, v_context.request_id,
    v_context.other_plan, v_context.original_comparison);
  IF NOT v_result.created THEN RAISE EXCEPTION 'Episode idempotency leaked across owners'; END IF;

  FOR v_bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
    NULL, '[]'::jsonb, v_plan - 'version', jsonb_set(v_plan, '{version}', '"wrong"'),
    v_plan - 'input', jsonb_set(v_plan, '{input}', 'null'),
    v_plan - 'execution', jsonb_set(v_plan, '{execution,providerCallsAllowed}', 'true'),
    jsonb_set(v_plan, '{execution,longFormEnabled}', 'true'), jsonb_set(v_plan, '{execution,policyApproval}', 'true'),
    jsonb_set(v_plan, '{execution,policyApproval}', 'null'), jsonb_set(v_plan, '{execution,providerCallsAllowed}', '"false"'),
    jsonb_set(v_plan, '{id}', '"not-a-uuid"'), jsonb_set(v_plan, '{createdAt}', '"not-a-date"'),
    jsonb_set(v_plan, '{createdAt}', '"infinity"'), v_plan || jsonb_build_object('oversized', repeat('x', 48001))
  )) LOOP
    v_rejected := false;
    BEGIN
      PERFORM public.save_healing_rain_episode(v_context.owner_id, v_context.request_id || '-invalid', v_bad, v_context.original_comparison);
    EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Invalid planning snapshot accepted'; END IF;
  END LOOP;
  FOR v_comparison IN SELECT value FROM jsonb_array_elements(jsonb_build_array(NULL, '[]'::jsonb,
    jsonb_build_object('oversized', repeat('x', 16001)))) LOOP
    v_rejected := false;
    BEGIN
      PERFORM public.save_healing_rain_episode(v_context.owner_id, v_context.request_id || '-invalid', v_plan, v_comparison);
    EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Invalid comparison accepted'; END IF;
  END LOOP;
  v_rejected := false;
  BEGIN
    PERFORM public.save_healing_rain_episode(v_context.owner_id, 'bad', v_plan, v_context.original_comparison);
  EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Invalid request ID accepted'; END IF;

  SELECT * INTO v_review FROM public.review_healing_rain_episode(v_context.owner_id,
    (v_context.original_plan->>'id')::uuid, v_context.review_request_id, 'approve_plan', E'  Plan\n\tlooks good.  ');
  IF NOT v_review.created OR v_review.reason <> 'Plan looks good.' OR v_review.verdict <> 'approve_plan' THEN
    RAISE EXCEPTION 'Review was not created with a tidy reason';
  END IF;
  SELECT * INTO v_result FROM public.review_healing_rain_episode(v_context.owner_id,
    (v_context.original_plan->>'id')::uuid, v_context.review_request_id, 'approve_plan', 'Plan looks good.');
  IF v_result.created OR v_result.id <> v_review.id OR v_result.created_at <> v_review.created_at THEN
    RAISE EXCEPTION 'Review retry did not return the original record';
  END IF;
  -- A fresh request appends feedback without changing the earlier approval.
  PERFORM public.review_healing_rain_episode(v_context.owner_id, (v_context.original_plan->>'id')::uuid,
    v_context.review_request_id || '-next', 'needs_revision', 'Vary the story beat.');
  PERFORM public.review_healing_rain_episode(v_context.other_id, (v_context.other_plan->>'id')::uuid,
    v_context.review_request_id, 'needs_revision', 'Separate account feedback.');
  FOR v_episode_id, v_verdict, v_reason IN VALUES
    ((v_context.second_plan->>'id')::uuid, 'approve_plan', 'Plan looks good.'),
    ((v_context.original_plan->>'id')::uuid, 'needs_revision', 'Plan looks good.'),
    ((v_context.original_plan->>'id')::uuid, 'approve_plan', 'Different reason.')
  LOOP
    v_rejected := false;
    BEGIN
      PERFORM public.review_healing_rain_episode(v_context.owner_id, v_episode_id,
        v_context.review_request_id, v_verdict, v_reason);
    EXCEPTION WHEN unique_violation THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Changed review reused a request ID'; END IF;
  END LOOP;
  FOREACH v_episode_id IN ARRAY ARRAY[(v_context.other_plan->>'id')::uuid, gen_random_uuid()] LOOP
    v_rejected := false;
    BEGIN
      PERFORM public.review_healing_rain_episode(v_context.owner_id, v_episode_id,
        v_context.review_request_id, 'approve_plan', 'Plan looks good.');
    EXCEPTION WHEN no_data_found THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Foreign or missing episode was reviewable'; END IF;
  END LOOP;
  FOREACH v_reason IN ARRAY ARRAY[NULL, '', E' \n\t ', repeat('x', 1201), E'bad\001reason'] LOOP
    v_rejected := false;
    BEGIN
      PERFORM public.review_healing_rain_episode(v_context.owner_id, (v_context.original_plan->>'id')::uuid,
        v_context.review_request_id || '-invalid', 'approve_plan', v_reason);
    EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Invalid review reason accepted'; END IF;
  END LOOP;
  v_rejected := false;
  BEGIN
    PERFORM public.review_healing_rain_episode(v_context.owner_id, (v_context.original_plan->>'id')::uuid,
      v_context.review_request_id || '-invalid', 'publish', 'Not a publishing approval.');
  EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Invalid review verdict accepted'; END IF;
  IF (SELECT count(*) FROM public.healing_rain_episode_reviews WHERE user_id = v_context.owner_id
      AND episode_id = (v_context.original_plan->>'id')::uuid) <> 2 OR
    NOT EXISTS (SELECT 1 FROM public.healing_rain_episode_reviews WHERE id = v_review.id AND verdict = 'approve_plan') OR
    (SELECT plan FROM public.healing_rain_episodes WHERE id = (v_context.original_plan->>'id')::uuid)
      IS DISTINCT FROM v_context.original_plan THEN
    RAISE EXCEPTION 'Plan reviews must append without mutating plans or prior reviews';
  END IF;
  FOREACH v_table IN ARRAY ARRAY['healing_rain_episodes', 'healing_rain_episode_reviews'] LOOP
    FOREACH v_statement IN ARRAY ARRAY[
      'INSERT INTO public.' || v_table || ' DEFAULT VALUES',
      'UPDATE public.' || v_table || ' SET user_id = user_id WHERE false',
      'DELETE FROM public.' || v_table || ' WHERE false'
    ] LOOP
      v_rejected := false;
      BEGIN EXECUTE v_statement;
      EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
      END;
      IF NOT v_rejected THEN RAISE EXCEPTION 'Service role bypassed the exclusive RPC writer'; END IF;
    END LOOP;
  END LOOP;
  -- The RPC role guard remains effective independently of the EXECUTE ACL.
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  v_rejected := false;
  BEGIN
    PERFORM public.save_healing_rain_episode(v_context.owner_id, v_context.request_id, v_plan, v_context.original_comparison);
  EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'RPC accepted a browser JWT role'; END IF;
END;
$$;
RESET ROLE;

DO $$
DECLARE v_context RECORD; v_rejected BOOLEAN; v_table TEXT; v_id UUID;
BEGIN
  SELECT * INTO v_context FROM rain_episode_test_context;
  FOREACH v_table IN ARRAY ARRAY['healing_rain_episodes', 'healing_rain_episode_reviews'] LOOP
    v_rejected := false;
    BEGIN
      EXECUTE format('UPDATE public.%I SET user_id = user_id WHERE user_id = $1', v_table) USING v_context.owner_id;
    EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Immutable update trigger failed on %', v_table; END IF;
  END LOOP;
  v_rejected := false;
  BEGIN
    INSERT INTO public.healing_rain_episode_reviews(user_id, episode_id, client_request_id, verdict, reason)
      VALUES (v_context.other_id, (v_context.original_plan->>'id')::uuid,
        v_context.review_request_id || '-foreign', 'approve_plan', 'Cross-owner reference must fail.');
  EXCEPTION WHEN foreign_key_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Composite owner/episode foreign key failed'; END IF;
  v_rejected := false;
  v_id := gen_random_uuid();
  BEGIN
    INSERT INTO public.healing_rain_episodes(id, user_id, client_request_id, plan, comparison, created_at)
      VALUES (v_id, v_context.owner_id, v_context.request_id || '-shape',
        jsonb_set(v_context.original_plan - 'execution', '{id}', to_jsonb(v_id::text)), '{}', '2026-10-13T00:00:00Z');
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Snapshot constraint accepted an incomplete plan'; END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_context.owner_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_context.owner_id::text, true);
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE v_context RECORD; v_rejected BOOLEAN; v_statement TEXT;
BEGIN
  SELECT * INTO v_context FROM rain_episode_test_context;
  IF (SELECT count(*) FROM public.healing_rain_episodes WHERE client_request_id IN (v_context.request_id, v_context.request_id || '-second')) <> 2 OR
    EXISTS (SELECT 1 FROM public.healing_rain_episodes WHERE user_id <> v_context.owner_id) OR
    (SELECT count(*) FROM public.healing_rain_episode_reviews WHERE client_request_id IN (v_context.review_request_id, v_context.review_request_id || '-next')) <> 2 OR
    EXISTS (SELECT 1 FROM public.healing_rain_episode_reviews WHERE user_id <> v_context.owner_id) THEN
    RAISE EXCEPTION 'Owner SELECT RLS failed';
  END IF;
  FOREACH v_statement IN ARRAY ARRAY[
    'SELECT public.save_healing_rain_episode(NULL, NULL, NULL, NULL)',
    'SELECT public.review_healing_rain_episode(NULL, NULL, NULL, NULL, NULL)',
    'INSERT INTO public.healing_rain_episodes DEFAULT VALUES',
    'INSERT INTO public.healing_rain_episode_reviews DEFAULT VALUES'
  ] LOOP
    v_rejected := false;
    BEGIN EXECUTE v_statement;
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Browser bypassed a table or RPC write boundary'; END IF;
  END LOOP;
END;
$$;
RESET ROLE;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub',
    (SELECT other_id FROM rain_episode_test_context))::text, true);
  PERFORM set_config('request.jwt.claim.sub', (SELECT other_id::text FROM rain_episode_test_context), true);
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_context RECORD;
BEGIN
  SELECT * INTO v_context FROM rain_episode_test_context;
  IF (SELECT count(*) FROM public.healing_rain_episodes WHERE client_request_id = v_context.request_id) <> 1 OR
    EXISTS (SELECT 1 FROM public.healing_rain_episodes WHERE user_id <> v_context.other_id) OR
    (SELECT count(*) FROM public.healing_rain_episode_reviews WHERE client_request_id = v_context.review_request_id) <> 1 OR
    EXISTS (SELECT 1 FROM public.healing_rain_episode_reviews WHERE user_id <> v_context.other_id) THEN
    RAISE EXCEPTION 'Other-account SELECT RLS failed';
  END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE v_statement TEXT; v_rejected BOOLEAN;
BEGIN
  FOREACH v_statement IN ARRAY ARRAY[
    'SELECT count(*) FROM public.healing_rain_episodes',
    'SELECT count(*) FROM public.healing_rain_episode_reviews',
    'SELECT public.save_healing_rain_episode(NULL, NULL, NULL, NULL)',
    'SELECT public.review_healing_rain_episode(NULL, NULL, NULL, NULL, NULL)'
  ] LOOP
    v_rejected := false;
    BEGIN EXECUTE v_statement;
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Anonymous access was permitted'; END IF;
  END LOOP;
END;
$$;
RESET ROLE;

ROLLBACK;
