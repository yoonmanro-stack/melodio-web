-- Account-owned opt-in channel branding. Requires projects + generations migrations.
-- Uses the private healing-rain bucket created by the generations migration.
-- No existing jobs are changed, and no media/provider calls occur here.
BEGIN;
CREATE FUNCTION public.valid_healing_rain_branding_config(p_config JSONB, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  RETURN COALESCE(jsonb_typeof(p_config) = 'object' AND octet_length(p_config::text) <= 4096
    AND (SELECT count(*) FROM jsonb_object_keys(p_config)) = 13
    AND p_config ?& ARRAY['enabled','mode','channelName','tagline','logoPath','preset','font','size','color','position','fadeInSeconds','holdSeconds','fadeOutSeconds']
    AND jsonb_typeof(p_config->'enabled') = 'boolean'
    AND p_config->>'mode' IN ('none','title','channel-title','logo-title')
    AND jsonb_typeof(p_config->'channelName') = 'string' AND length(p_config->>'channelName') <= 80 AND p_config->>'channelName' !~ '[[:cntrl:]]'
    AND jsonb_typeof(p_config->'tagline') = 'string' AND length(p_config->>'tagline') <= 160 AND p_config->>'tagline' !~ '[[:cntrl:]]'
    AND (p_config->'logoPath' = 'null'::jsonb OR (jsonb_typeof(p_config->'logoPath') = 'string' AND p_config->>'logoPath' ~ ('^' || p_user_id::text || '/branding/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$')))
    AND p_config->>'preset' IN ('minimal','classic','natural','modern') AND p_config->>'font' IN ('sans','serif')
    AND p_config->>'size' IN ('small','medium','large') AND p_config->>'color' IN ('ivory','white','warm')
    AND p_config->>'position' IN ('center','lower-third','upper-third')
    AND jsonb_typeof(p_config->'fadeInSeconds') = 'number' AND (p_config->>'fadeInSeconds')::numeric BETWEEN 0 AND 15
    AND jsonb_typeof(p_config->'holdSeconds') = 'number' AND (p_config->>'holdSeconds')::numeric BETWEEN 0.5 AND 15
    AND jsonb_typeof(p_config->'fadeOutSeconds') = 'number' AND (p_config->>'fadeOutSeconds')::numeric BETWEEN 0 AND 15
    AND (p_config->>'fadeInSeconds')::numeric + (p_config->>'holdSeconds')::numeric + (p_config->>'fadeOutSeconds')::numeric <= 15, FALSE);
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.valid_healing_rain_branding_config(JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valid_healing_rain_branding_config(JSONB, UUID) TO service_role;

CREATE TABLE public.healing_rain_branding_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80 AND name !~ '[[:cntrl:]]'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  config JSONB NOT NULL CHECK (public.valid_healing_rain_branding_config(config, user_id)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);
CREATE INDEX healing_rain_branding_owner_created ON public.healing_rain_branding_profiles(user_id, created_at, id);
CREATE TABLE public.healing_rain_branding_selection (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  FOREIGN KEY (user_id, profile_id) REFERENCES public.healing_rain_branding_profiles(user_id, id)
);
CREATE TABLE public.healing_rain_branding_requests (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL CHECK (request_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$'),
  payload JSONB NOT NULL CHECK (octet_length(payload::text) <= 8192),
  result JSONB NOT NULL CHECK (octet_length(result::text) <= 8192),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, request_id)
);
ALTER TABLE public.healing_rain_branding_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.healing_rain_branding_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.healing_rain_branding_selection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.healing_rain_branding_selection FORCE ROW LEVEL SECURITY;
ALTER TABLE public.healing_rain_branding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.healing_rain_branding_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY healing_rain_branding_profile_owner_read ON public.healing_rain_branding_profiles FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY healing_rain_branding_selection_owner_read ON public.healing_rain_branding_selection FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.healing_rain_branding_profiles, public.healing_rain_branding_selection, public.healing_rain_branding_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.healing_rain_branding_profiles, public.healing_rain_branding_selection TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.healing_rain_branding_profiles, public.healing_rain_branding_selection TO service_role;
GRANT SELECT, INSERT ON public.healing_rain_branding_requests TO service_role;

CREATE FUNCTION public.mutate_healing_rain_branding(p_user_id UUID, p_request_id TEXT, p_action TEXT, p_profile_id UUID, p_expected_version INTEGER, p_name TEXT, p_config JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_payload JSONB; v_previous public.healing_rain_branding_requests%ROWTYPE;
  v_profile public.healing_rain_branding_profiles%ROWTYPE;
  v_selection public.healing_rain_branding_selection%ROWTYPE;
  v_result JSONB;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'Server authorization required' USING ERRCODE = '42501'; END IF;
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$' OR p_action IS NULL OR p_action NOT IN ('create','update','select') THEN
    RAISE EXCEPTION 'Invalid branding request' USING ERRCODE = '22023';
  END IF;
  -- One owner lock serializes the profile cap, selection and all idempotent writes.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('healing-rain-branding:' || p_user_id::text, 0));
  v_payload := jsonb_build_object('action',p_action,'profileId',p_profile_id,'expectedVersion',p_expected_version,'name',p_name,'config',p_config);
  SELECT r.* INTO v_previous FROM public.healing_rain_branding_requests r WHERE r.user_id = p_user_id AND r.request_id = p_request_id;
  IF FOUND THEN
    IF v_previous.payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Request ID belongs to another change' USING ERRCODE = '23505'; END IF;
    RETURN v_previous.result;
  END IF;
  IF p_action IN ('create','update') THEN
    IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80 OR p_name ~ '[[:cntrl:]]' OR NOT public.valid_healing_rain_branding_config(p_config, p_user_id) THEN
      RAISE EXCEPTION 'Invalid branding config' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'create' THEN
      IF p_profile_id IS NOT NULL OR p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'Invalid creation version' USING ERRCODE = '22023'; END IF;
      IF (SELECT count(*) FROM public.healing_rain_branding_profiles p WHERE p.user_id = p_user_id) >= 30 THEN RAISE EXCEPTION 'Profile limit reached' USING ERRCODE = '54000'; END IF;
      INSERT INTO public.healing_rain_branding_profiles(user_id,name,config) VALUES (p_user_id,p_name,p_config) RETURNING * INTO v_profile;
    ELSE
      SELECT p.* INTO v_profile FROM public.healing_rain_branding_profiles p WHERE p.user_id = p_user_id AND p.id = p_profile_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002'; END IF;
      IF p_expected_version IS NULL OR p_expected_version <> v_profile.version THEN RAISE EXCEPTION 'Stale profile version' USING ERRCODE = '40001'; END IF;
      UPDATE public.healing_rain_branding_profiles p SET name = p_name, config = p_config, version = p.version + 1, updated_at = clock_timestamp() WHERE p.id = v_profile.id RETURNING * INTO v_profile;
    END IF;
    v_result := jsonb_build_object('profile',to_jsonb(v_profile),'created',p_action = 'create');
  ELSE
    IF p_expected_version IS NULL OR p_expected_version < 0 OR p_name IS NOT NULL OR p_config IS NOT NULL THEN RAISE EXCEPTION 'Invalid selection' USING ERRCODE = '22023'; END IF;
    IF p_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.healing_rain_branding_profiles p WHERE p.user_id = p_user_id AND p.id = p_profile_id) THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002'; END IF;
    INSERT INTO public.healing_rain_branding_selection(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT s.* INTO v_selection FROM public.healing_rain_branding_selection s WHERE s.user_id = p_user_id;
    IF v_selection.version <> p_expected_version THEN RAISE EXCEPTION 'Stale selection version' USING ERRCODE = '40001'; END IF;
    UPDATE public.healing_rain_branding_selection s SET profile_id = p_profile_id, version = s.version + 1 WHERE s.user_id = p_user_id RETURNING * INTO v_selection;
    v_result := jsonb_build_object('selectedProfileId',v_selection.profile_id,'selectionVersion',v_selection.version);
  END IF;
  INSERT INTO public.healing_rain_branding_requests(user_id,request_id,payload,result) VALUES (p_user_id,p_request_id,v_payload,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.mutate_healing_rain_branding(UUID, TEXT, TEXT, UUID, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_healing_rain_branding(UUID, TEXT, TEXT, UUID, INTEGER, TEXT, JSONB) TO service_role;

ALTER TABLE public.healing_rain_generations ADD COLUMN branding_snapshot JSONB;
CREATE FUNCTION public.freeze_healing_rain_generation_branding()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.branding_snapshot IS DISTINCT FROM OLD.branding_snapshot THEN RAISE EXCEPTION 'Generation branding is immutable' USING ERRCODE = '22023'; END IF;
    RETURN NEW;
  END IF;
  -- Only new jobs capture a profile; no selection is NULL, including all legacy jobs.
  SELECT jsonb_build_object('schemaVersion',1,'profileId',p.id,'profileVersion',p.version,'profileName',p.name,'config',p.config)
    INTO NEW.branding_snapshot FROM public.healing_rain_branding_selection s
    JOIN public.healing_rain_branding_profiles p ON p.user_id = s.user_id AND p.id = s.profile_id
    WHERE s.user_id = NEW.user_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.freeze_healing_rain_generation_branding() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER healing_rain_generation_branding_freeze BEFORE INSERT OR UPDATE ON public.healing_rain_generations FOR EACH ROW EXECUTE FUNCTION public.freeze_healing_rain_generation_branding();
COMMIT;
