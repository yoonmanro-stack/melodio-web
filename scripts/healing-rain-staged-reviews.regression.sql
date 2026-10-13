-- Isolated PostgreSQL regression for projects + generations + staged reviews + branding.
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$
DECLARE
  owner_id UUID := '__TEST_OWNER_UUID__'; other_id UUID := '__TEST_OTHER_UUID__';
  project_id UUID := gen_random_uuid(); job public.healing_rain_generations%ROWTYPE;
  result public.healing_rain_generations%ROWTYPE; token UUID; previous_token UUID;
  plan JSONB; spec_hash TEXT := repeat('a',64); key TEXT; original JSONB;
  checkpoints JSONB; assets JSONB; hashes JSONB; preview_hashes JSONB;
  decision JSONB; first_decision JSONB; counter INTEGER; count_rows INTEGER;
  branding JSONB; branding_config JSONB := '{"enabled":false,"mode":"none","channelName":"Saved channel","tagline":"","logoPath":null,"preset":"minimal","font":"sans","size":"medium","color":"ivory","position":"center","fadeInSeconds":1,"holdSeconds":5,"fadeOutSeconds":1}';
BEGIN
  branding := public.mutate_healing_rain_branding(owner_id,'staged-branding-profile','create',NULL,NULL,'Saved profile',branding_config);
  PERFORM public.mutate_healing_rain_branding(owner_id,'staged-branding-select','select',(branding #>> '{profile,id}')::uuid,0,NULL,NULL);
  plan := jsonb_build_object('id',project_id,'createdAt',now(),'schemaVersion',1,'recipeVersion',1,'input',jsonb_build_object('sceneId','train','thunder','none','takes',6),'prompts','{}'::jsonb,'layers','[]'::jsonb,'checks','[]'::jsonb,'generation',jsonb_build_object('status','draft','audioTakes',6,'freshAssets',true));
  PERFORM public.save_healing_rain_projects(owner_id,jsonb_build_array(jsonb_build_object('client_request_id','staged-project-one','plan',plan)));
  PERFORM public.enqueue_healing_rain_generation(owner_id,project_id,'staged-job-one','test-v1','{}',10);
  SELECT * INTO job FROM public.claim_healing_rain_generation(180);
  token := job.claim_token;
  IF job.status <> 'running' OR token IS NULL OR job.lease_expires_at <= clock_timestamp() OR job.branding_snapshot #>> '{config,channelName}' <> 'Saved channel' THEN RAISE EXCEPTION 'claim or branding snapshot invalid'; END IF;
  SELECT count(*) INTO count_rows FROM public.update_healing_rain_generation(job.id,gen_random_uuid(),'{"stage":"forged"}',180);
  IF count_rows <> 0 THEN RAISE EXCEPTION 'wrong lease accepted'; END IF;
  BEGIN
    PERFORM public.update_healing_rain_generation(job.id,token,'{"review_records":{"audio":{"decision":"approve"}}}',180);
    RAISE EXCEPTION 'worker forged review';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  checkpoints := jsonb_build_object('generationSpec',jsonb_build_object('state','frozen','sha256',spec_hash)); assets := '{}'; hashes := '{}';
  FOR counter IN 1..6 LOOP
    key := 'audio' || counter;
    original := jsonb_build_object('policyVersion','healing-rain-fresh-audio-v1','jobId',job.id::text,'userId',owner_id::text,'takeIndex',counter,'seconds',30);
    checkpoints := checkpoints || jsonb_build_object(key,jsonb_build_object('state','ready','provider','elevenlabs','model','eleven_text_to_sound_v2','sha256',repeat(counter::text,64),'generationSpecSha256',spec_hash,'audioOrigin',original));
    assets := assets || jsonb_build_object(key,jsonb_build_object('path',owner_id::text || '/' || job.id::text || '/' || key || '.mp3','mimeType','audio/mpeg','durationSeconds',30,'sha256',repeat(counter::text,64),'audioOrigin',original));
    hashes := hashes || jsonb_build_object(key,repeat(counter::text,64));
  END LOOP;
  SELECT * INTO job FROM public.update_healing_rain_generation(job.id,token,jsonb_build_object('checkpoints',checkpoints,'assets',assets),180);
  BEGIN
    PERFORM public.review_healing_rain_generation(owner_id,job.id,'audio','approve',spec_hash,hashes);
    RAISE EXCEPTION 'running job accepted human review';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  SELECT * INTO job FROM public.update_healing_rain_generation(job.id,token,'{"status":"needs_attention","stage":"audio_review_required","progress":40}',180);
  IF job.claim_token IS NOT NULL OR job.lease_expires_at IS NOT NULL OR job.status <> 'needs_attention' THEN RAISE EXCEPTION 'audio hold retains lease'; END IF;
  SELECT count(*) INTO count_rows FROM public.claim_healing_rain_generation(180);
  IF count_rows <> 0 THEN RAISE EXCEPTION 'audio hold automatically reclaimed'; END IF;
  SELECT count(*) INTO count_rows FROM public.update_healing_rain_generation(job.id,token,'{"stage":"late-worker"}',180);
  IF count_rows <> 0 THEN RAISE EXCEPTION 'released lease still writable'; END IF;
  BEGIN
    PERFORM public.review_healing_rain_generation(other_id,job.id,'audio','approve',spec_hash,hashes);
    RAISE EXCEPTION 'foreign review allowed';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM public.review_healing_rain_generation(owner_id,job.id,'audio','approve',repeat('b',64),hashes);
    RAISE EXCEPTION 'changed spec hash approved';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.review_healing_rain_generation(owner_id,job.id,'audio','approve',spec_hash,hashes || jsonb_build_object('audio1',repeat('b',64)));
    RAISE EXCEPTION 'changed original hash approved';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.review_healing_rain_generation(owner_id,job.id,'audio','approve',spec_hash,hashes - 'audio6');
    RAISE EXCEPTION 'incomplete take set approved';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  SELECT * INTO job FROM public.review_healing_rain_generation(owner_id,job.id,'audio','approve',spec_hash,hashes);
  first_decision := job.review_records->'audio';
  IF job.status <> 'queued' OR job.stage <> 'audio_approved' OR job.claim_token IS NOT NULL OR first_decision->'assetHashes' IS DISTINCT FROM hashes THEN RAISE EXCEPTION 'audio approval did not queue exact originals'; END IF;
  SELECT * INTO result FROM public.review_healing_rain_generation(owner_id,job.id,'audio','approve',spec_hash,hashes);
  IF result.review_records->'audio' IS DISTINCT FROM first_decision THEN RAISE EXCEPTION 'approval retry changed evidence'; END IF;
  BEGIN
    PERFORM public.review_healing_rain_generation(owner_id,job.id,'audio','reject',spec_hash,hashes);
    RAISE EXCEPTION 'conflicting review accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  SELECT * INTO job FROM public.claim_healing_rain_generation(180); token := job.claim_token;
  BEGIN
    PERFORM public.update_healing_rain_generation(job.id,token,jsonb_build_object('checkpoints',jsonb_set(checkpoints,'{generationSpec,sha256}',to_jsonb(repeat('b',64)))),180);
    RAISE EXCEPTION 'reviewed spec changed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.update_healing_rain_generation(job.id,token,jsonb_build_object('assets',jsonb_set(assets,'{audio1,sha256}',to_jsonb(repeat('b',64)))),180);
    RAISE EXCEPTION 'reviewed audio asset changed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.update_healing_rain_generation(job.id,token,jsonb_build_object('checkpoints',jsonb_set(checkpoints,'{audio1,state}','"intent"')),180);
    RAISE EXCEPTION 'reviewed audio checkpoint changed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    UPDATE public.healing_rain_generations SET branding_snapshot = NULL WHERE id = job.id;
    RAISE EXCEPTION 'branding changed during reviewed production';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  preview_hashes := jsonb_build_object('preview30',repeat('b',64),'preview180',repeat('c',64));
  assets := assets || jsonb_build_object('preview30',jsonb_build_object('path',owner_id::text || '/' || job.id::text || '/preview-30.mp4','mimeType','video/mp4','durationSeconds',30,'sha256',repeat('b',64)), 'preview180',jsonb_build_object('path',owner_id::text || '/' || job.id::text || '/preview-180.mp4','mimeType','video/mp4','durationSeconds',180,'sha256',repeat('c',64)));
  checkpoints := checkpoints || jsonb_build_object('render',jsonb_build_object('state','ready','generationSpecSha256',spec_hash));
  SELECT * INTO job FROM public.update_healing_rain_generation(job.id,token,jsonb_build_object('status','ready','stage','preview_ready','assets',assets,'checkpoints',checkpoints),180);
  IF job.claim_token IS NOT NULL OR job.lease_expires_at IS NOT NULL OR job.completed_at IS NULL THEN RAISE EXCEPTION 'ready preview still leased'; END IF;
  SELECT * INTO job FROM public.review_healing_rain_generation(owner_id,job.id,'preview','approve',spec_hash,preview_hashes);
  IF job.status <> 'ready' OR job.stage <> 'preview_approved' OR job.review_records #>> '{preview,decision}' <> 'approve' THEN RAISE EXCEPTION 'preview approval incorrectly queued work'; END IF;
  first_decision := job.review_records->'preview';
  SELECT * INTO result FROM public.review_healing_rain_generation(owner_id,job.id,'preview','approve',spec_hash,preview_hashes);
  IF result.review_records->'preview' IS DISTINCT FROM first_decision THEN RAISE EXCEPTION 'preview retry mutated review'; END IF;
  BEGIN
    UPDATE public.healing_rain_generations AS target SET assets = jsonb_set(target.assets,'{preview30,sha256}',to_jsonb(repeat('d',64))) WHERE target.id = job.id;
    RAISE EXCEPTION 'reviewed preview changed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- Completed preview frees the owner queue. Rejecting next audio hold also frees it.
  PERFORM public.enqueue_healing_rain_generation(owner_id,project_id,'staged-job-two','test-v1','{}',10);
  SELECT * INTO job FROM public.claim_healing_rain_generation(180); token := job.claim_token;
  checkpoints := jsonb_build_object('generationSpec',jsonb_build_object('state','frozen','sha256',spec_hash)); assets := '{}';
  FOR counter IN 1..6 LOOP
    key := 'audio' || counter;
    original := jsonb_build_object('policyVersion','healing-rain-fresh-audio-v1','jobId',job.id::text,'userId',owner_id::text,'takeIndex',counter,'seconds',30);
    checkpoints := checkpoints || jsonb_build_object(key,jsonb_build_object('state','ready','provider','elevenlabs','model','eleven_text_to_sound_v2','sha256',repeat(counter::text,64),'generationSpecSha256',spec_hash,'audioOrigin',original));
    assets := assets || jsonb_build_object(key,jsonb_build_object('path',owner_id::text || '/' || job.id::text || '/' || key || '.mp3','mimeType','audio/mpeg','durationSeconds',30,'sha256',repeat(counter::text,64),'audioOrigin',original));
  END LOOP;
  SELECT * INTO job FROM public.update_healing_rain_generation(job.id,token,jsonb_build_object('status','needs_attention','stage','audio_review_required','checkpoints',checkpoints,'assets',assets),180);
  SELECT * INTO job FROM public.review_healing_rain_generation(owner_id,job.id,'audio','reject',spec_hash,hashes);
  IF job.status <> 'failed' OR job.stage <> 'audio_rejected' OR job.claim_token IS NOT NULL OR job.completed_at IS NULL OR job.assets IS DISTINCT FROM assets THEN RAISE EXCEPTION 'rejection did not preserve/free production'; END IF;
  PERFORM public.enqueue_healing_rain_generation(owner_id,project_id,'staged-job-three','test-v1','{}',10);
  SELECT * INTO job FROM public.claim_healing_rain_generation(180); previous_token := job.claim_token;
  -- Expiry replaces the token; prior worker cannot alter a reclaimed job or add a paid intent.
  UPDATE public.healing_rain_generations SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE id = job.id;
  SELECT count(*) INTO count_rows FROM public.update_healing_rain_generation(job.id,previous_token,'{"checkpoints":{"image":{"state":"intent"}}}',180);
  IF count_rows <> 0 THEN RAISE EXCEPTION 'expired lease accepted paid intent'; END IF;
  SELECT * INTO job FROM public.claim_healing_rain_generation(180);
  IF job.claim_token = previous_token THEN RAISE EXCEPTION 'reclaim reused token'; END IF;
  SELECT count(*) INTO count_rows FROM public.update_healing_rain_generation(job.id,previous_token,'{"stage":"late-worker"}',180);
  IF count_rows <> 0 THEN RAISE EXCEPTION 'reclaimed lease accepted old token'; END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','__TEST_OTHER_UUID__',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.healing_rain_generations) <> 0 THEN RAISE EXCEPTION 'foreign account read review originals'; END IF;
  BEGIN
    PERFORM public.review_healing_rain_generation('__TEST_OWNER_UUID__',gen_random_uuid(),'audio','approve',repeat('a',64),'{}');
    RAISE EXCEPTION 'browser invoked review RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
ROLLBACK;
