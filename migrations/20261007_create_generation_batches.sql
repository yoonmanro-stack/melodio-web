-- Ordinary multi-track generation. Separate from Channel Builder's
-- episode_generation_batches; deliberately do not infer legacy membership.
BEGIN;

CREATE TABLE IF NOT EXISTS public.generation_batches (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_count INTEGER NOT NULL CHECK (input_count BETWEEN 1 AND 40),
  source_menu TEXT NOT NULL CHECK (char_length(source_menu) BETWEEN 1 AND 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  selection_revision INTEGER NOT NULL DEFAULT 0 CHECK (selection_revision >= 0),
  selected_generation_ids UUID[],
  claimed_indices INTEGER[] NOT NULL DEFAULT '{}',
  CHECK (selected_generation_ids IS NULL OR cardinality(selected_generation_ids) = input_count)
);

CREATE INDEX IF NOT EXISTS idx_generation_batches_owner_created
  ON public.generation_batches (user_id, created_at DESC);

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS generation_batch_id UUID REFERENCES public.generation_batches(id),
  ADD COLUMN IF NOT EXISTS generation_batch_index INTEGER,
  ADD COLUMN IF NOT EXISTS generation_candidate_slot TEXT;

ALTER TABLE public.generations ADD CONSTRAINT generations_batch_shape CHECK (
  (generation_batch_id IS NULL AND generation_batch_index IS NULL AND generation_candidate_slot IS NULL)
  OR (generation_batch_id IS NOT NULL AND generation_batch_index IS NOT NULL
      AND generation_candidate_slot IS NOT NULL
      AND generation_batch_index BETWEEN 0 AND 39 AND generation_candidate_slot IN ('A', 'B'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_generations_batch_candidate
  ON public.generations (generation_batch_id, generation_batch_index, generation_candidate_slot)
  WHERE generation_batch_id IS NOT NULL;

ALTER TABLE public.generation_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY generation_batches_owner_read ON public.generation_batches
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.generation_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.generation_batches TO authenticated;
GRANT ALL ON public.generation_batches TO service_role;

-- Persist admission BEFORE any paid metadata/music request. A duplicate request
-- cannot claim an input again, even before its provider task has been persisted.
-- Failed/ambiguous submissions stay claimed for explicit operator reconciliation.
CREATE OR REPLACE FUNCTION public.claim_generation_batch_track(
  p_batch_id UUID, p_user_id UUID, p_input_count INTEGER, p_source_menu TEXT, p_track_index INTEGER
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_batch public.generation_batches%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Batch admission requires service role' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_batch_id IS NULL OR p_input_count IS NULL OR p_track_index IS NULL
    OR p_input_count NOT BETWEEN 1 AND 40 OR p_track_index NOT BETWEEN 0 AND p_input_count - 1
    OR p_source_menu IS NULL OR p_source_menu NOT IN ('style-library', 'preset-studio', 'audio-forge', 'audio', 'japan', 'channel-builder') THEN
    RAISE EXCEPTION 'Invalid generation batch request' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.generation_batches(id, user_id, input_count, source_menu)
    VALUES (p_batch_id, p_user_id, p_input_count, p_source_menu) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO v_batch FROM public.generation_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_batch.user_id IS DISTINCT FROM p_user_id OR v_batch.input_count IS DISTINCT FROM p_input_count
    OR v_batch.source_menu IS DISTINCT FROM p_source_menu THEN
    RAISE EXCEPTION 'Generation batch identity conflict' USING ERRCODE = '23505';
  END IF;
  IF p_track_index = ANY(v_batch.claimed_indices) THEN
    RAISE EXCEPTION 'Generation batch input already claimed' USING ERRCODE = '23505';
  END IF;
  UPDATE public.generation_batches SET claimed_indices = array_append(claimed_indices, p_track_index)
    WHERE id = p_batch_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_generation_batch_track(UUID, UUID, INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_batch_track(UUID, UUID, INTEGER, TEXT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_generation_batch_identity()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF ROW(NEW.id, NEW.user_id, NEW.input_count, NEW.source_menu, NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id, OLD.user_id, OLD.input_count, OLD.source_menu, OLD.created_at) THEN
    RAISE EXCEPTION 'Generation batch identity is immutable' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER generation_batches_identity_guard BEFORE UPDATE ON public.generation_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_generation_batch_identity();

CREATE OR REPLACE FUNCTION public.guard_generation_batch_membership()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_batch RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.generation_batch_id, NEW.generation_batch_index, NEW.generation_candidate_slot)
      IS DISTINCT FROM ROW(OLD.generation_batch_id, OLD.generation_batch_index, OLD.generation_candidate_slot) THEN
      RAISE EXCEPTION 'Generation batch membership is immutable' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NEW.generation_batch_id IS NULL THEN RETURN NEW; END IF;
  -- Admission is service-only. An update that preserves membership and owner
  -- retains the existing generations grants/RLS for titles, favorites, etc.
  IF TG_OP = 'INSERT' AND COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Batch admission requires service role' USING ERRCODE = '42501';
  END IF;
  SELECT user_id, input_count, claimed_indices INTO v_batch FROM public.generation_batches WHERE id = NEW.generation_batch_id;
  IF NOT FOUND OR NEW.user_id IS DISTINCT FROM v_batch.user_id OR NEW.generation_batch_index >= v_batch.input_count
    OR NOT (NEW.generation_batch_index = ANY(v_batch.claimed_indices)) THEN
    RAISE EXCEPTION 'Invalid generation batch membership' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER generations_batch_membership_guard BEFORE INSERT OR UPDATE ON public.generations
  FOR EACH ROW EXECUTE FUNCTION public.guard_generation_batch_membership();

-- Parsing legacy license_hash text is non-throwing. Only scalar fields leave SQL.
CREATE OR REPLACE FUNCTION public.generation_batch_metadata(p_text TEXT)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  RETURN COALESCE(p_text::jsonb, '{}'::jsonb);
EXCEPTION WHEN invalid_text_representation OR untranslatable_character THEN RETURN '{}'::jsonb;
END;
$$;
REVOKE ALL ON FUNCTION public.generation_batch_metadata(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generation_batch_metadata(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.read_generation_batch_outputs(p_batch_id UUID)
RETURNS TABLE (
  id UUID, generation_batch_index INTEGER, generation_candidate_slot TEXT,
  title TEXT, status TEXT, audio_url TEXT, cover_art_url TEXT,
  actual_duration_seconds NUMERIC, provider_clip_key TEXT
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT g.id, g.generation_batch_index, g.generation_candidate_slot,
    g.title, g.status,
    CASE WHEN g.audio_url ~* '^https?://' THEN g.audio_url
      WHEN g.source_audio_url ~* '^https?://' THEN g.source_audio_url ELSE NULL END,
    g.cover_art_url,
    CASE WHEN (m.value ->> 'duration') ~ '^\d{1,7}(\.\d{1,9})?$'
      THEN CASE WHEN (m.value ->> 'duration')::numeric > 0 THEN (m.value ->> 'duration')::numeric ELSE NULL END
      ELSE NULL END,
    NULLIF(m.value #>> '{audioPersistence,selectedClipKey}', '')
  FROM public.generations g
  JOIN public.generation_batches b ON b.id = g.generation_batch_id AND b.user_id = g.user_id
  CROSS JOIN LATERAL (SELECT public.generation_batch_metadata(g.license_hash) AS value) m
  WHERE g.generation_batch_id = p_batch_id AND b.user_id = auth.uid()
  ORDER BY g.generation_batch_index, g.generation_candidate_slot
  LIMIT 80;
$$;
REVOKE ALL ON FUNCTION public.read_generation_batch_outputs(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_generation_batch_outputs(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_generation_batch_selection(
  p_batch_id UUID, p_expected_revision INTEGER, p_selected_generation_ids UUID[]
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_batch public.generation_batches%ROWTYPE;
  v_count INTEGER; v_indices INTEGER; v_urls INTEGER; v_clips INTEGER; v_clip_count INTEGER;
  v_output_ids UUID[];
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_batch FROM public.generation_batches
    WHERE id = p_batch_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Generation batch not found' USING ERRCODE = 'P0002'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision <> v_batch.selection_revision THEN
    RAISE EXCEPTION 'Selection revision conflict' USING ERRCODE = '40001';
  END IF;
  IF p_selected_generation_ids IS NULL OR cardinality(p_selected_generation_ids) <> v_batch.input_count
    OR v_batch.input_count < 10 THEN
    RAISE EXCEPTION 'Incomplete batch selection' USING ERRCODE = '22023';
  END IF;

  -- Lock candidates against concurrent deletes/status changes while validating.
  PERFORM g.id FROM public.generations g WHERE g.generation_batch_id = p_batch_id FOR SHARE;
  SELECT count(*), count(DISTINCT o.generation_batch_index),
    count(DISTINCT regexp_replace(o.audio_url, '[?#].*$', '')),
    count(DISTINCT o.provider_clip_key), count(o.provider_clip_key), array_agg(o.id)
  INTO v_count, v_indices, v_urls, v_clips, v_clip_count, v_output_ids
  FROM public.read_generation_batch_outputs(p_batch_id) o
  WHERE o.status = 'completed' AND o.audio_url ~* '^https?://[^/@[:space:]]+(/|$)'
    AND o.audio_url !~ '^https?://[^/]*@';
  IF v_count <> 2 * v_batch.input_count OR v_indices <> v_batch.input_count
    OR v_urls <> v_count OR v_clips <> v_clip_count THEN
    RAISE EXCEPTION 'Batch outputs are incomplete or duplicated' USING ERRCODE = '22023';
  END IF;
  SELECT count(*), count(DISTINCT g.generation_batch_index) INTO v_count, v_indices
  FROM public.generations g
  WHERE g.id = ANY(p_selected_generation_ids) AND g.id = ANY(v_output_ids)
    AND g.user_id = v_user_id AND g.generation_batch_id = p_batch_id;
  IF v_count <> v_batch.input_count OR v_indices <> v_batch.input_count THEN
    RAISE EXCEPTION 'Choose one output per input' USING ERRCODE = '22023';
  END IF;
  UPDATE public.generation_batches SET selected_generation_ids = p_selected_generation_ids,
    selection_revision = selection_revision + 1 WHERE id = p_batch_id AND user_id = v_user_id;
  RETURN v_batch.selection_revision + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_generation_batch_selection(UUID, INTEGER, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_generation_batch_selection(UUID, INTEGER, UUID[]) TO authenticated;

COMMIT;
