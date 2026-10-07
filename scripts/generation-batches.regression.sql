-- Rollback-only integration fixture. Run only after the migration is verified.
-- Replace __EXISTING_OWNER_UUID__ with one verified auth.users + profiles owner.
-- Execute the WHOLE script in one database session as postgres/management SQL.
-- All fixture rows are private, completed, synthetic and uncommitted. No queue,
-- provider task reference, provider request, audio download, or permanent seed.
-- Any assertion failure aborts the transaction; issue ROLLBACK before reuse.
BEGIN;

CREATE TEMP TABLE generation_batch_regression_context (
  owner_id UUID NOT NULL, other_id UUID NOT NULL, batch_id UUID NOT NULL,
  input_count INTEGER NOT NULL, output_count INTEGER NOT NULL
) ON COMMIT DROP;
GRANT SELECT ON generation_batch_regression_context TO authenticated;

DO $$
DECLARE
  v_owner UUID := '__EXISTING_OWNER_UUID__'::uuid;
  v_other UUID := gen_random_uuid();
  v_batch UUID; v_input_count INTEGER; v_output_count INTEGER; v_index INTEGER;
  v_rejected BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner)
    OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner) THEN
    RAISE EXCEPTION 'Fixture owner must be a verified existing auth user and profile';
  END IF;
  IF has_function_privilege('authenticated', 'public.claim_generation_batch_track(uuid,uuid,integer,text,integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.claim_generation_batch_track(uuid,uuid,integer,text,integer)', 'EXECUTE')
    OR has_table_privilege('authenticated', 'public.generation_batches', 'INSERT')
    OR has_table_privilege('authenticated', 'public.generation_batches', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.generation_batches', 'DELETE') THEN
    RAISE EXCEPTION 'Unsafe batch write privilege';
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role', 'sub', v_owner)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  FOR v_input_count, v_output_count IN SELECT * FROM (VALUES (10,20), (15,30), (20,40), (10,19), (9,18)) cases LOOP
    v_batch := gen_random_uuid();
    INSERT INTO generation_batch_regression_context VALUES (v_owner, v_other, v_batch, v_input_count, v_output_count);
    FOR v_index IN 0..v_input_count - 1 LOOP
      PERFORM public.claim_generation_batch_track(v_batch, v_owner, v_input_count, 'preset-studio', v_index);
    END LOOP;
    INSERT INTO public.generations (
      id, user_id, title, status, is_public, is_stem_extracted,
      audio_url, source_audio_url, license_hash,
      generation_batch_id, generation_batch_index, generation_candidate_slot
    ) SELECT gen_random_uuid(), v_owner, 'Rollback batch regression', 'completed', false, false,
        'https://generation-batch-regression.invalid/' || v_batch || '/' || output_index || '.mp3',
        'https://generation-batch-regression.invalid/' || v_batch || '/' || output_index || '.mp3',
        jsonb_build_object('duration', 100.1, 'durationSeconds', 999,
          'audioPersistence', jsonb_build_object('selectedClipKey', v_batch || '-' || output_index))::text,
        v_batch, output_index / 2, CASE WHEN output_index % 2 = 0 THEN 'A' ELSE 'B' END
      FROM generate_series(0, v_output_count - 1) output_index;

    v_rejected := false;
    BEGIN
      PERFORM public.claim_generation_batch_track(v_batch, v_owner, v_input_count, 'preset-studio', 0);
    EXCEPTION WHEN unique_violation THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Duplicate claim was admitted'; END IF;
    v_rejected := false;
    BEGIN
      PERFORM public.claim_generation_batch_track(v_batch, v_other, v_input_count, 'preset-studio', 0);
    EXCEPTION WHEN unique_violation THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Foreign owner reused a batch'; END IF;
    v_rejected := false;
    BEGIN
      UPDATE public.generations SET generation_candidate_slot = CASE WHEN generation_candidate_slot = 'A' THEN 'B' ELSE 'A' END
        WHERE generation_batch_id = v_batch AND generation_batch_index = 0;
    EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Existing membership could be rewritten'; END IF;
  END LOOP;
  IF public.generation_batch_metadata('not json') <> '{}'::jsonb
    OR public.generation_batch_metadata('{"duration":"\u0000"}') <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Malformed legacy metadata did not fail closed';
  END IF;
END;
$$;

-- Actual authenticated role: no service bypass, real RLS and function grants.
DO $$ BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub',
    (SELECT owner_id FROM generation_batch_regression_context LIMIT 1))::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', (SELECT owner_id::text FROM generation_batch_regression_context LIMIT 1), true);
END; $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_context RECORD; v_ids UUID[]; v_reversed UUID[]; v_revision INTEGER; v_count INTEGER; v_rejected BOOLEAN;
BEGIN
  FOR v_context IN SELECT * FROM generation_batch_regression_context LOOP
    SELECT count(*) INTO v_count FROM public.read_generation_batch_outputs(v_context.batch_id);
    IF v_count <> v_context.output_count THEN RAISE EXCEPTION 'Owner output projection count mismatch'; END IF;
    IF EXISTS (SELECT 1 FROM public.read_generation_batch_outputs(v_context.batch_id) WHERE actual_duration_seconds <> 100.1) THEN
      RAISE EXCEPTION 'Requested duration substituted for actual duration';
    END IF;
    SELECT array_agg(id ORDER BY generation_batch_index) INTO v_ids
      FROM public.read_generation_batch_outputs(v_context.batch_id) WHERE generation_candidate_slot = 'A';
    IF v_context.output_count >= 20 THEN
      v_revision := public.save_generation_batch_selection(v_context.batch_id, 0, v_ids);
      IF v_revision <> 1 OR cardinality(v_ids) <> v_context.input_count THEN
        RAISE EXCEPTION '20/30/40 output selection count or revision mismatch';
      END IF;
      SELECT array_agg(id ORDER BY generation_batch_index DESC) INTO v_reversed
        FROM public.read_generation_batch_outputs(v_context.batch_id) WHERE generation_candidate_slot = 'B';
      v_revision := public.save_generation_batch_selection(v_context.batch_id, 1, v_reversed);
      IF v_revision <> 2 OR NOT EXISTS (
        SELECT 1 FROM public.generation_batches WHERE id = v_context.batch_id AND selected_generation_ids = v_reversed
      ) THEN RAISE EXCEPTION 'B replacement/order was not preserved'; END IF;
      v_rejected := false;
      BEGIN
        PERFORM public.save_generation_batch_selection(v_context.batch_id, 1, v_ids);
      EXCEPTION WHEN serialization_failure THEN v_rejected := true;
      END;
      IF NOT v_rejected THEN RAISE EXCEPTION 'Stale selection revision accepted'; END IF;
      v_ids[2] := v_ids[1];
      v_rejected := false;
      BEGIN
        PERFORM public.save_generation_batch_selection(v_context.batch_id, 2, v_ids);
      EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
      END;
      IF NOT v_rejected THEN RAISE EXCEPTION 'Duplicate selected ID accepted'; END IF;
      SELECT array_agg(id ORDER BY generation_batch_index) INTO v_ids
        FROM public.read_generation_batch_outputs(v_context.batch_id) WHERE generation_candidate_slot = 'A';
      v_ids[2] := (SELECT id FROM public.read_generation_batch_outputs(v_context.batch_id)
        WHERE generation_candidate_slot = 'B' AND generation_batch_index = 0);
      v_rejected := false;
      BEGIN
        PERFORM public.save_generation_batch_selection(v_context.batch_id, 2, v_ids);
      EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
      END;
      IF NOT v_rejected THEN RAISE EXCEPTION 'Both candidates from one input accepted'; END IF;
    ELSE
      v_rejected := false;
      BEGIN
        PERFORM public.save_generation_batch_selection(v_context.batch_id, 0, v_ids);
      EXCEPTION WHEN invalid_parameter_value THEN v_rejected := true;
      END;
      IF NOT v_rejected THEN RAISE EXCEPTION 'Fewer than 20 completed outputs accepted'; END IF;
    END IF;
  END LOOP;
  SELECT * INTO v_context FROM generation_batch_regression_context LIMIT 1;
  v_rejected := false;
  BEGIN
    PERFORM public.claim_generation_batch_track(v_context.batch_id, v_context.owner_id, v_context.input_count, 'preset-studio', 0);
  EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Authenticated role called admission RPC'; END IF;
  v_rejected := false;
  BEGIN
    UPDATE public.generation_batches SET selected_generation_ids = NULL WHERE id = v_context.batch_id;
  EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Authenticated role bypassed selection RPC'; END IF;
  v_rejected := false;
  BEGIN
    UPDATE public.generations SET generation_candidate_slot = 'B'
      WHERE generation_batch_id = v_context.batch_id AND generation_candidate_slot = 'A';
  EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Authenticated role edited grouped membership'; END IF;
END;
$$;
RESET ROLE;

-- Another signed-in identity gets neither header nor outputs and cannot select.
DO $$ BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub',
    (SELECT other_id FROM generation_batch_regression_context LIMIT 1))::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', (SELECT other_id::text FROM generation_batch_regression_context LIMIT 1), true);
END; $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_context RECORD; v_rejected BOOLEAN;
BEGIN
  FOR v_context IN SELECT * FROM generation_batch_regression_context LOOP
    IF EXISTS (SELECT 1 FROM public.generation_batches WHERE id = v_context.batch_id)
      OR EXISTS (SELECT 1 FROM public.read_generation_batch_outputs(v_context.batch_id)) THEN
      RAISE EXCEPTION 'Foreign owner read fixture data';
    END IF;
    v_rejected := false;
    BEGIN
      PERFORM public.save_generation_batch_selection(v_context.batch_id, 0, ARRAY[gen_random_uuid()]);
    EXCEPTION WHEN no_data_found THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'Foreign owner changed selection'; END IF;
  END LOOP;
END;
$$;
RESET ROLE;

-- Scalar duration projection remains non-throwing and never uses request length.
DO $$
DECLARE v_context RECORD; v_id UUID;
BEGIN
  SELECT * INTO v_context FROM generation_batch_regression_context WHERE output_count = 20;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role', 'sub', v_context.owner_id)::text, true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', v_context.owner_id::text, true);
  SELECT id INTO v_id FROM public.generations WHERE generation_batch_id = v_context.batch_id LIMIT 1;
  UPDATE public.generations SET license_hash = '{"durationSeconds":999}' WHERE id = v_id;
  IF EXISTS (SELECT 1 FROM public.read_generation_batch_outputs(v_context.batch_id) WHERE id = v_id AND actual_duration_seconds IS NOT NULL) THEN
    RAISE EXCEPTION 'Missing measured duration was synthesized';
  END IF;
  UPDATE public.generations SET license_hash = '{"duration":"\u0000"}' WHERE id = v_id;
  IF EXISTS (SELECT 1 FROM public.read_generation_batch_outputs(v_context.batch_id) WHERE id = v_id AND actual_duration_seconds IS NOT NULL) THEN
    RAISE EXCEPTION 'Malformed metadata duration was accepted';
  END IF;
END;
$$;

ROLLBACK;
SELECT jsonb_build_object('status', 'passed', 'fixtures', 5,
  'fixture_rows_remaining', (SELECT count(*) FROM public.generations
    WHERE audio_url LIKE 'https://generation-batch-regression.invalid/%'),
  'checks', '20/30/40 selection, 19/18 rejection, owner RLS, claim duplication, membership protection, A/B order, revision CAS, actual duration') AS generation_batch_regression;
