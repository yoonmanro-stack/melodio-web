-- Run after the projects, generations and branding migrations in an isolated DB.
-- Replace test UUID tokens with existing isolated fixture auth.users rows.
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE
  owner_id UUID := '__TEST_OWNER_UUID__'; other_id UUID := '__TEST_OTHER_UUID__';
  config JSONB := '{"enabled":false,"mode":"none","channelName":"My channel","tagline":"A quiet place","logoPath":null,"preset":"classic","font":"serif","size":"medium","color":"ivory","position":"center","fadeInSeconds":1,"holdSeconds":5,"fadeOutSeconds":1}';
  created JSONB; replayed JSONB; updated JSONB; selected JSONB; job JSONB; profile_id UUID; project_id UUID := gen_random_uuid(); job_id UUID;
  plan JSONB; counter INTEGER;
BEGIN
  IF NOT public.valid_healing_rain_branding_config(config, owner_id) THEN RAISE EXCEPTION 'valid config rejected'; END IF;
  IF public.valid_healing_rain_branding_config(config || '{"holdSeconds":"5"}',owner_id) OR public.valid_healing_rain_branding_config(config || '{"fadeInSeconds":15}',owner_id) OR public.valid_healing_rain_branding_config(config || '{"logoPath":"https://external.test/logo.png"}',owner_id) THEN RAISE EXCEPTION 'invalid config accepted'; END IF;
  created := public.mutate_healing_rain_branding(owner_id,'test-branding-create','create',NULL,NULL,'My profile',config);
  profile_id := (created #>> '{profile,id}')::uuid;
  replayed := public.mutate_healing_rain_branding(owner_id,'test-branding-create','create',NULL,NULL,'My profile',config);
  IF replayed IS DISTINCT FROM created THEN RAISE EXCEPTION 'create retry changed response'; END IF;
  BEGIN
    PERFORM public.mutate_healing_rain_branding(owner_id,'test-branding-create','create',NULL,NULL,'Different',config);
    RAISE EXCEPTION 'mismatched retry accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  selected := public.mutate_healing_rain_branding(owner_id,'test-branding-select','select',profile_id,0,NULL,NULL);
  IF selected->>'selectionVersion' <> '1' OR (selected->>'selectedProfileId')::uuid <> profile_id THEN RAISE EXCEPTION 'selection not persisted'; END IF;
  IF public.mutate_healing_rain_branding(owner_id,'test-branding-select','select',profile_id,0,NULL,NULL) IS DISTINCT FROM selected THEN RAISE EXCEPTION 'selection retry changed'; END IF;
  BEGIN
    PERFORM public.mutate_healing_rain_branding(other_id,'test-branding-foreign','select',profile_id,0,NULL,NULL);
    RAISE EXCEPTION 'cross-owner selection allowed';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.mutate_healing_rain_branding(other_id,'test-branding-edit','update',profile_id,1,'Foreign',config);
    RAISE EXCEPTION 'cross-owner update allowed';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.mutate_healing_rain_branding(owner_id,'test-branding-stale','update',profile_id,0,'Stale',config);
    RAISE EXCEPTION 'stale update allowed';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.mutate_healing_rain_branding(owner_id,'test-branding-stale-select','select',NULL,0,NULL,NULL);
    RAISE EXCEPTION 'stale selection allowed';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  -- Freeze a disabled profile with its saved values, while replacing caller spoofing.
  plan := jsonb_build_object('id',project_id,'createdAt',now(),'schemaVersion',1,'recipeVersion',1,'input',jsonb_build_object('sceneId','train','thunder','none','takes',6),'prompts','{}'::jsonb,'layers','[]'::jsonb,'checks','[]'::jsonb,'generation',jsonb_build_object('status','draft','audioTakes',6,'freshAssets',true));
  PERFORM public.save_healing_rain_projects(owner_id,jsonb_build_array(jsonb_build_object('client_request_id','test-branding-project','plan',plan)));
  SELECT result.job INTO job FROM public.enqueue_healing_rain_generation(owner_id,project_id,'test-branding-job-one','test-v1','{}',10) result;
  job_id := (job->>'id')::uuid;
  IF job #>> '{branding_snapshot,profileId}' <> profile_id::text OR job #>> '{branding_snapshot,profileVersion}' <> '1' OR job #>> '{branding_snapshot,config,enabled}' <> 'false' OR job #>> '{branding_snapshot,config,channelName}' <> 'My channel' THEN RAISE EXCEPTION 'profile snapshot missing'; END IF;
  updated := public.mutate_healing_rain_branding(owner_id,'test-branding-enable','update',profile_id,1,'My profile',config || '{"enabled":true,"mode":"channel-title"}');
  IF updated #>> '{profile,version}' <> '2' THEN RAISE EXCEPTION 'profile version not incremented'; END IF;
  IF (SELECT g.branding_snapshot #>> '{profileVersion}' FROM public.healing_rain_generations g WHERE g.id = job_id) <> '1' THEN RAISE EXCEPTION 'saved job changed after profile edit'; END IF;
  BEGIN
    UPDATE public.healing_rain_generations SET branding_snapshot = NULL WHERE id = job_id;
    RAISE EXCEPTION 'frozen snapshot mutation accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  UPDATE public.healing_rain_generations SET status = 'failed' WHERE id = job_id;
  PERFORM public.mutate_healing_rain_branding(owner_id,'test-branding-disable','update',profile_id,2,'My profile',config);
  IF (SELECT p.config FROM public.healing_rain_branding_profiles p WHERE p.id = profile_id) IS DISTINCT FROM config THEN RAISE EXCEPTION 'disabling lost profile fields'; END IF;
  PERFORM public.mutate_healing_rain_branding(owner_id,'test-branding-clear','select',NULL,1,NULL,NULL);
  SELECT result.job INTO job FROM public.enqueue_healing_rain_generation(owner_id,project_id,'test-branding-job-two','test-v1','{}',10) result;
  IF job->'branding_snapshot' <> 'null'::jsonb THEN RAISE EXCEPTION 'no selection produced branding'; END IF;
  FOR counter IN 2..30 LOOP
    PERFORM public.mutate_healing_rain_branding(owner_id,'test-branding-cap-' || counter,'create',NULL,NULL,'Channel ' || counter,config);
  END LOOP;
  BEGIN
    PERFORM public.mutate_healing_rain_branding(owner_id,'test-branding-cap-31','create',NULL,NULL,'Too many',config);
    RAISE EXCEPTION 'profile cap exceeded';
  EXCEPTION WHEN program_limit_exceeded THEN NULL; END;
  IF public.mutate_healing_rain_branding(owner_id,'test-branding-create','create',NULL,NULL,'My profile',config) IS DISTINCT FROM created THEN RAISE EXCEPTION 'retry at cap failed'; END IF;
  PERFORM public.mutate_healing_rain_branding(other_id,'test-branding-other-profile','create',NULL,NULL,'Other account',config);
END;
$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','__TEST_OTHER_UUID__',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.healing_rain_branding_profiles) <> 1 THEN RAISE EXCEPTION 'RLS profile isolation failed'; END IF;
  IF (SELECT count(*) FROM public.healing_rain_branding_selection) <> 0 THEN RAISE EXCEPTION 'RLS selection isolation failed'; END IF;
  BEGIN
    PERFORM public.mutate_healing_rain_branding('__TEST_OTHER_UUID__','test-browser-write','select',NULL,0,NULL,NULL);
    RAISE EXCEPTION 'browser RPC access allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.healing_rain_branding_profiles SET name = 'Forged';
    RAISE EXCEPTION 'browser direct update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM count(*) FROM public.healing_rain_branding_requests;
    RAISE EXCEPTION 'browser request history access allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
ROLLBACK;
