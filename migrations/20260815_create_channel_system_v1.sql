-- 20260815_create_channel_system_v1.sql
-- Melodio Channel System v1
--
-- 기존 Preset / generations 플로우를 변경하지 않는 추가형 마이그레이션이다.
-- Channel Project -> DNA Version / Listener Intent -> Episode -> Track Blueprint
-- 계층을 영속화한다.

-- ─── 공통 updated_at 트리거 ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_channel_system_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── 1. 채널 프로젝트 ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.channel_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel_name TEXT NOT NULL CHECK (char_length(btrim(channel_name)) BETWEEN 1 AND 120),
  concept_preset_id TEXT,
  promise TEXT NOT NULL DEFAULT '',
  discovery_concepts TEXT[] NOT NULL DEFAULT '{}'
    CHECK (discovery_concepts <@ ARRAY[
      'healing', 'focus', 'retro', 'cafe', 'drive', 'story'
    ]::TEXT[]),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_blueprints_user_updated
  ON public.channel_blueprints (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_blueprints_status
  ON public.channel_blueprints (user_id, status);

DROP TRIGGER IF EXISTS trg_channel_blueprints_updated_at ON public.channel_blueprints;
CREATE TRIGGER trg_channel_blueprints_updated_at
  BEFORE UPDATE ON public.channel_blueprints
  FOR EACH ROW EXECUTE FUNCTION public.set_channel_system_updated_at();

-- ─── 2. Channel DNA 불변 버전 ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.channel_dna_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channel_blueprints(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  identity_dna JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(identity_dna) = 'object'),
  music_dna JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(music_dna) = 'object'),
  visual_dna JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(visual_dna) = 'object'),
  editorial_dna JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(editorial_dna) = 'object'),
  field_locks JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(field_locks) = 'object'),
  change_summary TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, channel_id),
  UNIQUE (channel_id, version),
  FOREIGN KEY (created_by) REFERENCES public.profiles(id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_channel_dna_versions_channel_version
  ON public.channel_dna_versions (channel_id, version DESC);

-- ─── 3. Listener Intent ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.listener_intent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channel_blueprints(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  primary_purpose TEXT NOT NULL
    CHECK (primary_purpose IN (
      'recovery',
      'focus',
      'space_atmosphere',
      'movement',
      'memory_emotion',
      'story_immersion'
    )),
  secondary_purposes TEXT[] NOT NULL DEFAULT '{}',
  discovery_concepts TEXT[] NOT NULL DEFAULT '{}'
    CHECK (discovery_concepts <@ ARRAY[
      'healing', 'focus', 'retro', 'cafe', 'drive', 'story'
    ]::TEXT[]),
  listener_persona TEXT NOT NULL DEFAULT '',
  activity TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT '',
  dayparts TEXT[] NOT NULL DEFAULT '{}',
  current_state TEXT NOT NULL DEFAULT '',
  desired_state TEXT NOT NULL DEFAULT '',
  desired_behavior TEXT NOT NULL DEFAULT '',
  session_minutes INTEGER NOT NULL DEFAULT 120
    CHECK (session_minutes BETWEEN 1 AND 1440),
  attention_mode TEXT NOT NULL DEFAULT 'background'
    CHECK (attention_mode IN ('background', 'semi_background', 'listening', 'immersive')),
  vocal_tolerance TEXT NOT NULL DEFAULT 'none'
    CHECK (vocal_tolerance IN ('none', 'minimal', 'allowed', 'preferred')),
  interruption_tolerance SMALLINT NOT NULL DEFAULT 20
    CHECK (interruption_tolerance BETWEEN 0 AND 100),
  target_energy SMALLINT NOT NULL DEFAULT 40
    CHECK (target_energy BETWEEN 0 AND 100),
  target_energy_curve TEXT NOT NULL DEFAULT 'flat'
    CHECK (target_energy_curve IN ('flat', 'rise', 'fall', 'arc', 'multi_arc')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, channel_id),
  UNIQUE (channel_id, name)
);

CREATE INDEX IF NOT EXISTS idx_listener_intent_profiles_channel
  ON public.listener_intent_profiles (channel_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_listener_intent_profiles_updated_at
  ON public.listener_intent_profiles;
CREATE TRIGGER trg_listener_intent_profiles_updated_at
  BEFORE UPDATE ON public.listener_intent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_channel_system_updated_at();

-- ─── 4. 업로드 Episode ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.channel_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channel_blueprints(id) ON DELETE CASCADE,
  dna_version_id UUID NOT NULL,
  listener_intent_profile_id UUID NOT NULL,
  episode_title TEXT NOT NULL
    CHECK (char_length(btrim(episode_title)) BETWEEN 1 AND 200),
  situation TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  daypart TEXT NOT NULL DEFAULT '',
  season TEXT,
  weather TEXT,
  emotional_arc TEXT NOT NULL DEFAULT '',
  listener_intent_overrides JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(listener_intent_overrides) = 'object'),
  accent_presets JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(accent_presets) = 'array'),
  target_duration_seconds INTEGER NOT NULL DEFAULT 7200
    CHECK (target_duration_seconds BETWEEN 60 AND 86400),
  planned_track_count SMALLINT NOT NULL DEFAULT 20
    CHECK (planned_track_count BETWEEN 1 AND 200),
  vocal_track_percent SMALLINT NOT NULL DEFAULT 0
    CHECK (vocal_track_percent BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'planned',
      'approved',
      'generating',
      'assembling',
      'completed',
      'archived'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (dna_version_id, channel_id)
    REFERENCES public.channel_dna_versions(id, channel_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (listener_intent_profile_id, channel_id)
    REFERENCES public.listener_intent_profiles(id, channel_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_channel_episodes_channel_updated
  ON public.channel_episodes (channel_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_episodes_status
  ON public.channel_episodes (channel_id, status);

DROP TRIGGER IF EXISTS trg_channel_episodes_updated_at ON public.channel_episodes;
CREATE TRIGGER trg_channel_episodes_updated_at
  BEFORE UPDATE ON public.channel_episodes
  FOR EACH ROW EXECUTE FUNCTION public.set_channel_system_updated_at();

-- ─── 5. 생성 전 곡별 Track Blueprint ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.track_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES public.channel_episodes(id) ON DELETE CASCADE,
  track_number SMALLINT NOT NULL CHECK (track_number BETWEEN 1 AND 200),
  song_title TEXT NOT NULL CHECK (char_length(btrim(song_title)) BETWEEN 1 AND 200),
  role TEXT NOT NULL
    CHECK (role IN (
      'opening',
      'immersion',
      'steady',
      'rise',
      'peak',
      'release',
      'reprise',
      'closing'
    )),
  energy SMALLINT NOT NULL CHECK (energy BETWEEN 0 AND 100),
  bpm SMALLINT NOT NULL CHECK (bpm BETWEEN 20 AND 300),
  musical_key TEXT NOT NULL DEFAULT '',
  lead_instrument TEXT NOT NULL DEFAULT '',
  support_instruments TEXT[] NOT NULL DEFAULT '{}',
  is_instrumental BOOLEAN NOT NULL DEFAULT TRUE,
  vocal_gender TEXT,
  lyric_language TEXT,
  lyric_theme TEXT,
  narrative_beat TEXT,
  arrangement_variation TEXT NOT NULL DEFAULT '',
  target_duration_seconds INTEGER NOT NULL DEFAULT 180
    CHECK (target_duration_seconds BETWEEN 15 AND 3600),
  actual_duration_seconds NUMERIC(10, 3)
    CHECK (actual_duration_seconds IS NULL OR actual_duration_seconds > 0),
  style_prompt TEXT CHECK (style_prompt IS NULL OR char_length(style_prompt) <= 1000),
  exclude_prompt TEXT CHECK (exclude_prompt IS NULL OR char_length(exclude_prompt) <= 200),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'generating', 'generated', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (episode_id, track_number)
);

CREATE INDEX IF NOT EXISTS idx_track_blueprints_episode_order
  ON public.track_blueprints (episode_id, track_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_track_blueprints_unique_normalized_title
  ON public.track_blueprints (episode_id, lower(btrim(song_title)));

CREATE INDEX IF NOT EXISTS idx_track_blueprints_status
  ON public.track_blueprints (episode_id, status);

DROP TRIGGER IF EXISTS trg_track_blueprints_updated_at ON public.track_blueprints;
CREATE TRIGGER trg_track_blueprints_updated_at
  BEFORE UPDATE ON public.track_blueprints
  FOR EACH ROW EXECUTE FUNCTION public.set_channel_system_updated_at();

-- ─── 6. 승인 후 Generation Queue ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.episode_generation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL UNIQUE REFERENCES public.channel_episodes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_tier TEXT NOT NULL CHECK (prompt_tier IN ('compact', 'studio')),
  status TEXT NOT NULL DEFAULT 'compiling'
    CHECK (status IN ('compiling', 'ready', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
  total_blueprints SMALLINT NOT NULL CHECK (total_blueprints BETWEEN 1 AND 200),
  raw_candidate_count SMALLINT NOT NULL CHECK (raw_candidate_count BETWEEN 2 AND 400),
  ready_items SMALLINT NOT NULL DEFAULT 0 CHECK (ready_items BETWEEN 0 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.generation_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.episode_generation_batches(id) ON DELETE CASCADE,
  track_blueprint_id UUID NOT NULL UNIQUE REFERENCES public.track_blueprints(id) ON DELETE CASCADE,
  track_number SMALLINT NOT NULL CHECK (track_number BETWEEN 1 AND 200),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  prompt_tier TEXT NOT NULL CHECK (prompt_tier IN ('compact', 'studio')),
  style_prompt TEXT NOT NULL CHECK (char_length(style_prompt) BETWEEN 1 AND 1000),
  exclude_prompt TEXT NOT NULL DEFAULT '' CHECK (char_length(exclude_prompt) <= 200),
  lyrics_prompt TEXT NOT NULL DEFAULT '',
  lyrics_sections JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lyrics_sections) = 'array'),
  is_instrumental BOOLEAN NOT NULL,
  candidate_count SMALLINT NOT NULL DEFAULT 2 CHECK (candidate_count = 2),
  engine TEXT NOT NULL DEFAULT 'suno_v5' CHECK (engine = 'suno_v5'),
  model TEXT NOT NULL DEFAULT 'v5.5',
  status TEXT NOT NULL
    CHECK (status IN ('awaiting_lyrics', 'compiling_lyrics', 'ready', 'queued', 'submitting', 'generating', 'awaiting_selection', 'completed', 'failed', 'submission_failed', 'generation_failed', 'cancelled')),
  generation_id UUID REFERENCES public.generations(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  selected_at TIMESTAMPTZ,
  content_hash TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  compiled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, track_number)
);

CREATE TABLE IF NOT EXISTS public.generation_queue_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id UUID NOT NULL REFERENCES public.generation_queue_items(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL UNIQUE REFERENCES public.generations(id) ON DELETE CASCADE,
  candidate_slot TEXT NOT NULL CHECK (candidate_slot IN ('A', 'B')),
  audio_url TEXT NOT NULL,
  duration_seconds NUMERIC(8,2),
  audio_grade TEXT,
  clipping_count INTEGER,
  dissonance_score INTEGER,
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (queue_item_id, candidate_slot)
);

ALTER TABLE public.generation_queue_items
  ADD COLUMN IF NOT EXISTS selected_candidate_id UUID
    REFERENCES public.generation_queue_candidates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.episode_assemblies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL UNIQUE REFERENCES public.channel_episodes(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL UNIQUE REFERENCES public.episode_generation_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'assembling', 'completed', 'failed', 'cancelled')),
  assembly_mode TEXT NOT NULL DEFAULT 'gapless' CHECK (assembly_mode = 'gapless'),
  track_count SMALLINT NOT NULL CHECK (track_count BETWEEN 1 AND 200),
  total_duration_seconds NUMERIC(10,2) NOT NULL DEFAULT 0,
  tracklist_text TEXT NOT NULL DEFAULT '',
  output_audio_url TEXT,
  error_message TEXT,
  queued_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.episode_assembly_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id UUID NOT NULL REFERENCES public.episode_assemblies(id) ON DELETE CASCADE,
  queue_item_id UUID NOT NULL UNIQUE REFERENCES public.generation_queue_items(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL UNIQUE REFERENCES public.generation_queue_candidates(id) ON DELETE RESTRICT,
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE RESTRICT,
  track_number SMALLINT NOT NULL CHECK (track_number BETWEEN 1 AND 200),
  title TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  duration_seconds NUMERIC(8,2) NOT NULL CHECK (duration_seconds > 0),
  start_seconds NUMERIC(10,2) NOT NULL CHECK (start_seconds >= 0),
  end_seconds NUMERIC(10,2) NOT NULL CHECK (end_seconds > start_seconds),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assembly_id, track_number)
);

CREATE TABLE IF NOT EXISTS public.episode_publish_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL UNIQUE REFERENCES public.channel_episodes(id) ON DELETE CASCADE,
  assembly_id UUID NOT NULL UNIQUE REFERENCES public.episode_assemblies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'published', 'archived')),
  upload_title TEXT NOT NULL CHECK (char_length(btrim(upload_title)) BETWEEN 1 AND 200),
  description TEXT NOT NULL,
  tracklist_text TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(tags) = 'array'),
  hashtags JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(hashtags) = 'array'),
  audio_url TEXT NOT NULL,
  cover_prompt TEXT NOT NULL CHECK (char_length(btrim(cover_prompt)) BETWEEN 1 AND 2000),
  selected_cover_asset_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.episode_cover_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.episode_publish_packages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'upload')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
  prompt TEXT NOT NULL,
  image_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.episode_publish_packages
  DROP CONSTRAINT IF EXISTS episode_publish_packages_selected_cover_asset_id_fkey;
ALTER TABLE public.episode_publish_packages
  ADD CONSTRAINT episode_publish_packages_selected_cover_asset_id_fkey
  FOREIGN KEY (selected_cover_asset_id) REFERENCES public.episode_cover_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generation_queue_items_batch_order
  ON public.generation_queue_items (batch_id, track_number);
CREATE INDEX IF NOT EXISTS idx_generation_queue_items_status
  ON public.generation_queue_items (batch_id, status);
CREATE INDEX IF NOT EXISTS idx_generation_queue_candidates_item
  ON public.generation_queue_candidates (queue_item_id, candidate_slot);
CREATE INDEX IF NOT EXISTS idx_episode_assemblies_status
  ON public.episode_assemblies (status, created_at);
CREATE INDEX IF NOT EXISTS idx_episode_assembly_items_order
  ON public.episode_assembly_items (assembly_id, track_number);
CREATE INDEX IF NOT EXISTS idx_episode_cover_assets_package
  ON public.episode_cover_assets (package_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_queue_items_unique_lyrics
  ON public.generation_queue_items (batch_id, content_hash)
  WHERE content_hash <> '';

DROP TRIGGER IF EXISTS trg_episode_generation_batches_updated_at
  ON public.episode_generation_batches;
CREATE TRIGGER trg_episode_generation_batches_updated_at
  BEFORE UPDATE ON public.episode_generation_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_channel_system_updated_at();
DROP TRIGGER IF EXISTS trg_generation_queue_items_updated_at
  ON public.generation_queue_items;
CREATE TRIGGER trg_generation_queue_items_updated_at
  BEFORE UPDATE ON public.generation_queue_items
  FOR EACH ROW EXECUTE FUNCTION public.set_channel_system_updated_at();
DROP TRIGGER IF EXISTS trg_episode_assemblies_updated_at ON public.episode_assemblies;
CREATE TRIGGER trg_episode_assemblies_updated_at
  BEFORE UPDATE ON public.episode_assemblies
  FOR EACH ROW EXECUTE FUNCTION public.set_channel_system_updated_at();
DROP TRIGGER IF EXISTS trg_episode_publish_packages_updated_at ON public.episode_publish_packages;
CREATE TRIGGER trg_episode_publish_packages_updated_at
  BEFORE UPDATE ON public.episode_publish_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_channel_system_updated_at();
DROP TRIGGER IF EXISTS trg_episode_cover_assets_updated_at ON public.episode_cover_assets;
CREATE TRIGGER trg_episode_cover_assets_updated_at
  BEFORE UPDATE ON public.episode_cover_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_channel_system_updated_at();

-- ─── RLS: 모든 하위 권한은 channel_blueprints.user_id로 판정 ─────────────

ALTER TABLE public.channel_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_dna_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listener_intent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_generation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_queue_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_assemblies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_assembly_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_publish_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episode_cover_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own channel blueprints"
  ON public.channel_blueprints;
CREATE POLICY "Users can manage own channel blueprints"
  ON public.channel_blueprints
  FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own channel DNA versions"
  ON public.channel_dna_versions;
DROP POLICY IF EXISTS "Users can read own channel DNA versions"
  ON public.channel_dna_versions;
DROP POLICY IF EXISTS "Users can create own channel DNA versions"
  ON public.channel_dna_versions;

-- DNA 버전은 감사 가능한 불변 스냅샷이다. 수정/직접 삭제 정책을 만들지 않는다.
CREATE POLICY "Users can read own channel DNA versions"
  ON public.channel_dna_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.channel_blueprints AS channel
      WHERE channel.id = channel_dna_versions.channel_id
        AND channel.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can create own channel DNA versions"
  ON public.channel_dna_versions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.channel_blueprints AS channel
      WHERE channel.id = channel_dna_versions.channel_id
        AND channel.user_id = (SELECT auth.uid())
    )
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage own listener intent profiles"
  ON public.listener_intent_profiles;
CREATE POLICY "Users can manage own listener intent profiles"
  ON public.listener_intent_profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.channel_blueprints AS channel
      WHERE channel.id = listener_intent_profiles.channel_id
        AND channel.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.channel_blueprints AS channel
      WHERE channel.id = listener_intent_profiles.channel_id
        AND channel.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage own channel episodes"
  ON public.channel_episodes;
CREATE POLICY "Users can manage own channel episodes"
  ON public.channel_episodes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.channel_blueprints AS channel
      WHERE channel.id = channel_episodes.channel_id
        AND channel.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.channel_blueprints AS channel
      WHERE channel.id = channel_episodes.channel_id
        AND channel.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage own track blueprints"
  ON public.track_blueprints;
CREATE POLICY "Users can manage own track blueprints"
  ON public.track_blueprints
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.channel_episodes AS episode
      JOIN public.channel_blueprints AS channel ON channel.id = episode.channel_id
      WHERE episode.id = track_blueprints.episode_id
        AND channel.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.channel_episodes AS episode
      JOIN public.channel_blueprints AS channel ON channel.id = episode.channel_id
      WHERE episode.id = track_blueprints.episode_id
        AND channel.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage own generation batches"
  ON public.episode_generation_batches;
CREATE POLICY "Users can manage own generation batches"
  ON public.episode_generation_batches
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can manage own generation queue items"
  ON public.generation_queue_items;
CREATE POLICY "Users can manage own generation queue items"
  ON public.generation_queue_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.episode_generation_batches AS batch
      WHERE batch.id = generation_queue_items.batch_id
        AND batch.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.episode_generation_batches AS batch
      WHERE batch.id = generation_queue_items.batch_id
        AND batch.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage own generation queue candidates"
  ON public.generation_queue_candidates;
CREATE POLICY "Users can manage own generation queue candidates"
  ON public.generation_queue_candidates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.generation_queue_items AS item
      JOIN public.episode_generation_batches AS batch ON batch.id = item.batch_id
      WHERE item.id = generation_queue_candidates.queue_item_id
        AND batch.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.generation_queue_items AS item
      JOIN public.episode_generation_batches AS batch ON batch.id = item.batch_id
      WHERE item.id = generation_queue_candidates.queue_item_id
        AND batch.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage own episode assemblies" ON public.episode_assemblies;
CREATE POLICY "Users can manage own episode assemblies"
  ON public.episode_assemblies FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can manage own episode assembly items" ON public.episode_assembly_items;
CREATE POLICY "Users can manage own episode assembly items"
  ON public.episode_assembly_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.episode_assemblies AS assembly
      WHERE assembly.id = episode_assembly_items.assembly_id
        AND assembly.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.episode_assemblies AS assembly
      WHERE assembly.id = episode_assembly_items.assembly_id
        AND assembly.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can manage own publish packages" ON public.episode_publish_packages;
CREATE POLICY "Users can manage own publish packages"
  ON public.episode_publish_packages FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can manage own cover assets" ON public.episode_cover_assets;
CREATE POLICY "Users can manage own cover assets"
  ON public.episode_cover_assets FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ─── 원자적 Channel Builder 저장 RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_channel_system_draft(
  p_channel JSONB,
  p_dna JSONB,
  p_listener JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_channel_id UUID;
  v_dna_version_id UUID;
  v_listener_intent_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.channel_blueprints (
    user_id,
    channel_name,
    concept_preset_id,
    promise,
    discovery_concepts
  )
  VALUES (
    v_user_id,
    p_channel->>'channelName',
    NULLIF(p_channel->>'conceptPresetId', ''),
    COALESCE(p_channel->>'promise', ''),
    ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(p_channel->'discoveryConcepts', '[]'::jsonb)
      )
    )
  )
  RETURNING id INTO v_channel_id;

  INSERT INTO public.channel_dna_versions (
    channel_id,
    version,
    identity_dna,
    music_dna,
    visual_dna,
    editorial_dna,
    field_locks,
    change_summary,
    created_by
  )
  VALUES (
    v_channel_id,
    1,
    COALESCE(p_dna->'identity', '{}'::jsonb),
    COALESCE(p_dna->'music', '{}'::jsonb),
    COALESCE(p_dna->'visual', '{}'::jsonb),
    COALESCE(p_dna->'editorial', '{}'::jsonb),
    COALESCE(p_dna->'fieldLocks', '{}'::jsonb),
    'Initial Channel DNA',
    v_user_id
  )
  RETURNING id INTO v_dna_version_id;

  INSERT INTO public.listener_intent_profiles (
    channel_id,
    name,
    primary_purpose,
    secondary_purposes,
    discovery_concepts,
    listener_persona,
    activity,
    environment,
    dayparts,
    current_state,
    desired_state,
    desired_behavior,
    session_minutes,
    attention_mode,
    vocal_tolerance,
    interruption_tolerance,
    target_energy,
    target_energy_curve
  )
  VALUES (
    v_channel_id,
    p_listener->>'name',
    p_listener->>'primaryPurpose',
    ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(p_listener->'secondaryPurposes', '[]'::jsonb)
      )
    ),
    ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(p_listener->'discoveryConcepts', '[]'::jsonb)
      )
    ),
    COALESCE(p_listener->>'listenerPersona', ''),
    COALESCE(p_listener->>'activity', ''),
    COALESCE(p_listener->>'environment', ''),
    ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(p_listener->'dayparts', '[]'::jsonb)
      )
    ),
    COALESCE(p_listener->>'currentState', ''),
    COALESCE(p_listener->>'desiredState', ''),
    COALESCE(p_listener->>'desiredBehavior', ''),
    COALESCE((p_listener->>'sessionMinutes')::INTEGER, 120),
    COALESCE(p_listener->>'attentionMode', 'background'),
    COALESCE(p_listener->>'vocalTolerance', 'none'),
    COALESCE((p_listener->>'interruptionTolerance')::SMALLINT, 20),
    COALESCE((p_listener->>'targetEnergy')::SMALLINT, 40),
    COALESCE(p_listener->>'targetEnergyCurve', 'flat')
  )
  RETURNING id INTO v_listener_intent_id;

  RETURN jsonb_build_object(
    'channelId', v_channel_id,
    'dnaVersionId', v_dna_version_id,
    'dnaVersion', 1,
    'listenerIntentProfileId', v_listener_intent_id
  );
END;
$$;

-- 채널 행을 잠근 뒤 다음 버전 번호를 계산하여 동시 생성 충돌을 방지한다.
CREATE OR REPLACE FUNCTION public.create_channel_dna_version(
  p_channel_id UUID,
  p_dna JSONB,
  p_change_summary TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_version_id UUID;
  v_next_version INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.channel_blueprints
  WHERE id = p_channel_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found or access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_next_version
  FROM public.channel_dna_versions
  WHERE channel_id = p_channel_id;

  INSERT INTO public.channel_dna_versions (
    channel_id,
    version,
    identity_dna,
    music_dna,
    visual_dna,
    editorial_dna,
    field_locks,
    change_summary,
    created_by
  )
  VALUES (
    p_channel_id,
    v_next_version,
    COALESCE(p_dna->'identity', '{}'::jsonb),
    COALESCE(p_dna->'music', '{}'::jsonb),
    COALESCE(p_dna->'visual', '{}'::jsonb),
    COALESCE(p_dna->'editorial', '{}'::jsonb),
    COALESCE(p_dna->'fieldLocks', '{}'::jsonb),
    COALESCE(p_change_summary, ''),
    v_user_id
  )
  RETURNING id INTO v_version_id;

  RETURN jsonb_build_object(
    'channelId', p_channel_id,
    'dnaVersionId', v_version_id,
    'dnaVersion', v_next_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_channel_system_draft(JSONB, JSONB, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_channel_dna_version(UUID, JSONB, TEXT)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_channel_system_draft(JSONB, JSONB, JSONB)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_channel_dna_version(UUID, JSONB, TEXT)
  TO authenticated, service_role;

-- Episode와 전체 Track Blueprint를 하나의 제작 계획으로 원자적으로 저장한다.
CREATE OR REPLACE FUNCTION public.create_channel_episode_blueprint(
  p_channel_id UUID,
  p_dna_version_id UUID,
  p_listener_intent_profile_id UUID,
  p_episode JSONB,
  p_tracks JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_episode_id UUID;
  v_track JSONB;
  v_track_ids UUID[] := '{}';
  v_track_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.channel_blueprints AS channel
  WHERE channel.id = p_channel_id
    AND channel.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel not found or access denied' USING ERRCODE = '42501';
  END IF;

  IF p_tracks IS NULL OR jsonb_typeof(p_tracks) <> 'array' OR jsonb_array_length(p_tracks) = 0 THEN
    RAISE EXCEPTION 'At least one track blueprint is required' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_tracks) <> (p_episode->>'plannedTrackCount')::INTEGER THEN
    RAISE EXCEPTION 'Track count does not match episode plan' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.channel_episodes (
    channel_id,
    dna_version_id,
    listener_intent_profile_id,
    episode_title,
    situation,
    location,
    daypart,
    season,
    weather,
    emotional_arc,
    listener_intent_overrides,
    accent_presets,
    target_duration_seconds,
    planned_track_count,
    vocal_track_percent,
    status
  )
  VALUES (
    p_channel_id,
    p_dna_version_id,
    p_listener_intent_profile_id,
    p_episode->>'episodeTitle',
    COALESCE(p_episode->>'situation', ''),
    COALESCE(p_episode->>'location', ''),
    COALESCE(p_episode->>'daypart', ''),
    NULLIF(p_episode->>'season', ''),
    NULLIF(p_episode->>'weather', ''),
    COALESCE(p_episode->>'emotionalArc', ''),
    COALESCE(p_episode->'listenerIntentOverrides', '{}'::jsonb),
    COALESCE(p_episode->'accentPresets', '[]'::jsonb),
    (p_episode->>'targetDurationSeconds')::INTEGER,
    (p_episode->>'plannedTrackCount')::SMALLINT,
    (p_episode->>'vocalTrackPercent')::SMALLINT,
    'planned'
  )
  RETURNING id INTO v_episode_id;

  FOR v_track IN SELECT value FROM jsonb_array_elements(p_tracks)
  LOOP
    INSERT INTO public.track_blueprints (
      episode_id,
      track_number,
      song_title,
      role,
      energy,
      bpm,
      musical_key,
      lead_instrument,
      support_instruments,
      is_instrumental,
      vocal_gender,
      lyric_language,
      lyric_theme,
      narrative_beat,
      arrangement_variation,
      target_duration_seconds,
      style_prompt,
      exclude_prompt,
      status
    )
    VALUES (
      v_episode_id,
      (v_track->>'trackNumber')::SMALLINT,
      v_track->>'songTitle',
      v_track->>'role',
      (v_track->>'energy')::SMALLINT,
      (v_track->>'bpm')::SMALLINT,
      COALESCE(v_track->>'musicalKey', ''),
      COALESCE(v_track->>'leadInstrument', ''),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_track->'supportInstruments', '[]'::jsonb))),
      COALESCE((v_track->>'isInstrumental')::BOOLEAN, TRUE),
      NULLIF(v_track->>'vocalGender', ''),
      NULLIF(v_track->>'lyricLanguage', ''),
      NULLIF(v_track->>'lyricTheme', ''),
      NULLIF(v_track->>'narrativeBeat', ''),
      COALESCE(v_track->>'arrangementVariation', ''),
      (v_track->>'targetDurationSeconds')::INTEGER,
      NULLIF(v_track->>'stylePrompt', ''),
      NULLIF(v_track->>'excludePrompt', ''),
      'draft'
    )
    RETURNING id INTO v_track_id;
    v_track_ids := array_append(v_track_ids, v_track_id);
  END LOOP;

  RETURN jsonb_build_object(
    'channelId', p_channel_id,
    'episodeId', v_episode_id,
    'trackBlueprintIds', to_jsonb(v_track_ids),
    'status', 'planned'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_channel_episode_blueprint(UUID, UUID, UUID, JSONB, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_channel_episode_blueprint(UUID, UUID, UUID, JSONB, JSONB)
  TO authenticated, service_role;

-- 모든 편성 조건이 유지된 경우에만 Episode와 소속 Track을 함께 승인한다.
CREATE OR REPLACE FUNCTION public.approve_channel_episode_blueprint(
  p_channel_id UUID,
  p_episode_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_planned_count INTEGER;
  v_target_duration INTEGER;
  v_track_count INTEGER;
  v_track_duration INTEGER;
  v_approvable_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT episode.planned_track_count, episode.target_duration_seconds
  INTO v_planned_count, v_target_duration
  FROM public.channel_episodes AS episode
  JOIN public.channel_blueprints AS channel ON channel.id = episode.channel_id
  WHERE episode.id = p_episode_id
    AND episode.channel_id = p_channel_id
    AND channel.user_id = v_user_id
    AND episode.status = 'planned'
  FOR UPDATE OF episode;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Planned episode not found or access denied' USING ERRCODE = '42501';
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM(target_duration_seconds), 0),
    COUNT(*) FILTER (WHERE status IN ('draft', 'approved'))
  INTO v_track_count, v_track_duration, v_approvable_count
  FROM public.track_blueprints
  WHERE episode_id = p_episode_id;

  IF v_track_count <> v_planned_count THEN
    RAISE EXCEPTION 'Track count does not match episode plan' USING ERRCODE = '22023';
  END IF;

  IF v_track_duration <> v_target_duration THEN
    RAISE EXCEPTION 'Track duration does not match episode duration' USING ERRCODE = '22023';
  END IF;

  IF v_approvable_count <> v_track_count THEN
    RAISE EXCEPTION 'Episode contains tracks that cannot be approved' USING ERRCODE = '22023';
  END IF;

  UPDATE public.track_blueprints
  SET status = 'approved'
  WHERE episode_id = p_episode_id
    AND status IN ('draft', 'approved');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No approvable tracks found' USING ERRCODE = '22023';
  END IF;

  UPDATE public.channel_episodes
  SET status = 'approved'
  WHERE id = p_episode_id;

  RETURN jsonb_build_object(
    'channelId', p_channel_id,
    'episodeId', p_episode_id,
    'approvedTrackCount', v_track_count,
    'status', 'approved'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_channel_episode_blueprint(UUID, UUID)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_channel_episode_blueprint(UUID, UUID)
  TO authenticated, service_role;

-- 승인 이후에는 직접 API 호출로도 제작 명세를 우회 수정할 수 없다.
CREATE OR REPLACE FUNCTION public.protect_reviewed_track_blueprint()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IN ('approved', 'generating', 'generated') AND (
    NEW.song_title IS DISTINCT FROM OLD.song_title
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.energy IS DISTINCT FROM OLD.energy
    OR NEW.bpm IS DISTINCT FROM OLD.bpm
    OR NEW.musical_key IS DISTINCT FROM OLD.musical_key
    OR NEW.lead_instrument IS DISTINCT FROM OLD.lead_instrument
    OR NEW.support_instruments IS DISTINCT FROM OLD.support_instruments
    OR NEW.is_instrumental IS DISTINCT FROM OLD.is_instrumental
    OR NEW.vocal_gender IS DISTINCT FROM OLD.vocal_gender
    OR NEW.lyric_language IS DISTINCT FROM OLD.lyric_language
    OR NEW.lyric_theme IS DISTINCT FROM OLD.lyric_theme
    OR NEW.narrative_beat IS DISTINCT FROM OLD.narrative_beat
    OR NEW.arrangement_variation IS DISTINCT FROM OLD.arrangement_variation
    OR NEW.target_duration_seconds IS DISTINCT FROM OLD.target_duration_seconds
    OR NEW.style_prompt IS DISTINCT FROM OLD.style_prompt
    OR NEW.exclude_prompt IS DISTINCT FROM OLD.exclude_prompt
  ) THEN
    RAISE EXCEPTION 'Approved Track Blueprint content is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_reviewed_track_blueprint
  ON public.track_blueprints;
CREATE TRIGGER trg_protect_reviewed_track_blueprint
  BEFORE UPDATE ON public.track_blueprints
  FOR EACH ROW EXECUTE FUNCTION public.protect_reviewed_track_blueprint();

CREATE OR REPLACE FUNCTION public.create_episode_generation_queue(
  p_channel_id UUID,
  p_episode_id UUID,
  p_prompt_tier TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_batch_id UUID;
  v_item JSONB;
  v_track RECORD;
  v_total INTEGER;
  v_ready INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_prompt_tier NOT IN ('compact', 'studio') THEN
    RAISE EXCEPTION 'Invalid prompt tier' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Queue items must be an array' USING ERRCODE = '22023';
  END IF;

  SELECT batch.id INTO v_batch_id
  FROM public.episode_generation_batches AS batch
  WHERE batch.episode_id = p_episode_id
    AND batch.user_id = v_user_id;
  IF FOUND THEN
    RETURN jsonb_build_object('batchId', v_batch_id, 'created', FALSE);
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.track_blueprints AS track
  JOIN public.channel_episodes AS episode ON episode.id = track.episode_id
  JOIN public.channel_blueprints AS channel ON channel.id = episode.channel_id
  WHERE episode.id = p_episode_id
    AND episode.channel_id = p_channel_id
    AND episode.status = 'approved'
    AND track.status = 'approved'
    AND channel.user_id = v_user_id;

  IF v_total = 0 OR v_total <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'Approved Track count does not match queue items' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.episode_generation_batches (
    episode_id, user_id, prompt_tier, status, total_blueprints, raw_candidate_count
  ) VALUES (
    p_episode_id, v_user_id, p_prompt_tier, 'compiling', v_total, v_total * 2
  ) RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT track.id, track.track_number, track.song_title, track.is_instrumental
    INTO v_track
    FROM public.track_blueprints AS track
    WHERE track.id = (v_item->>'trackBlueprintId')::UUID
      AND track.episode_id = p_episode_id
      AND track.status = 'approved';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid approved Track Blueprint' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.generation_queue_items (
      batch_id,
      track_blueprint_id,
      track_number,
      title,
      prompt_tier,
      style_prompt,
      exclude_prompt,
      is_instrumental,
      candidate_count,
      engine,
      model,
      status,
      compiled_at
    ) VALUES (
      v_batch_id,
      v_track.id,
      v_track.track_number,
      v_track.song_title,
      p_prompt_tier,
      v_item->>'stylePrompt',
      COALESCE(v_item->>'excludePrompt', ''),
      v_track.is_instrumental,
      2,
      'suno_v5',
      'v5.5',
      CASE WHEN v_track.is_instrumental THEN 'ready' ELSE 'awaiting_lyrics' END,
      CASE WHEN v_track.is_instrumental THEN NOW() ELSE NULL END
    );
    IF v_track.is_instrumental THEN v_ready := v_ready + 1; END IF;
  END LOOP;

  UPDATE public.episode_generation_batches
  SET ready_items = v_ready,
      status = CASE WHEN v_ready = v_total THEN 'ready' ELSE 'compiling' END
  WHERE id = v_batch_id;

  RETURN jsonb_build_object('batchId', v_batch_id, 'created', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.create_episode_generation_queue(UUID, UUID, TEXT, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_episode_generation_queue(UUID, UUID, TEXT, JSONB)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_generation_batch_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_ready INTEGER;
  v_total INTEGER;
  v_completed INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'ready'),
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_ready, v_total, v_completed
  FROM public.generation_queue_items
  WHERE batch_id = NEW.batch_id;

  UPDATE public.episode_generation_batches
  SET ready_items = v_ready,
      status = CASE
        WHEN v_total > 0 AND v_completed = v_total THEN 'completed'
        WHEN v_ready = v_total THEN 'ready'
        WHEN EXISTS (
          SELECT 1 FROM public.generation_queue_items
          WHERE batch_id = NEW.batch_id AND status IN ('failed', 'submission_failed', 'generation_failed')
        ) THEN 'failed'
        WHEN EXISTS (
          SELECT 1 FROM public.generation_queue_items
          WHERE batch_id = NEW.batch_id
            AND status IN ('queued', 'submitting', 'generating', 'awaiting_selection', 'completed')
        ) THEN 'processing'
        ELSE 'compiling'
      END
  WHERE id = NEW.batch_id
    AND status <> 'cancelled';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_generation_batch_progress
  ON public.generation_queue_items;
CREATE TRIGGER trg_refresh_generation_batch_progress
  AFTER UPDATE OF status ON public.generation_queue_items
  FOR EACH ROW EXECUTE FUNCTION public.refresh_generation_batch_progress();

CREATE OR REPLACE FUNCTION public.select_generation_queue_master(
  p_queue_item_id UUID,
  p_candidate_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_item RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT item.id, item.batch_id, item.status
  INTO v_item
  FROM public.generation_queue_items AS item
  JOIN public.episode_generation_batches AS batch ON batch.id = item.batch_id
  WHERE item.id = p_queue_item_id
    AND batch.user_id = v_user_id
  FOR UPDATE OF item;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue Item not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.generation_queue_candidates AS candidate
    WHERE candidate.id = p_candidate_id
      AND candidate.queue_item_id = p_queue_item_id
  ) THEN
    RAISE EXCEPTION 'Candidate does not belong to Queue Item' USING ERRCODE = '22023';
  END IF;

  UPDATE public.generation_queue_items
  SET selected_candidate_id = p_candidate_id,
      selected_at = NOW(),
      status = 'completed'
  WHERE id = p_queue_item_id;

  UPDATE public.generations AS generation
  SET is_public = (candidate.id = p_candidate_id),
      license_hash = jsonb_set(
        COALESCE(NULLIF(generation.license_hash, '')::JSONB, '{}'::JSONB),
        '{isPublic}',
        TO_JSONB(candidate.id = p_candidate_id),
        TRUE
      )::TEXT
  FROM public.generation_queue_candidates AS candidate
  WHERE candidate.queue_item_id = p_queue_item_id
    AND generation.id = candidate.generation_id;

  UPDATE public.episode_generation_batches AS batch
  SET status = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM public.generation_queue_items AS item
          WHERE item.batch_id = v_item.batch_id
            AND item.selected_candidate_id IS NULL
        ) THEN 'completed'
        ELSE 'processing'
      END
  WHERE batch.id = v_item.batch_id;

  RETURN jsonb_build_object(
    'queueItemId', p_queue_item_id,
    'candidateId', p_candidate_id,
    'status', 'completed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.select_generation_queue_master(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.select_generation_queue_master(UUID, UUID)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.format_playlist_timestamp(p_seconds NUMERIC)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_total BIGINT := FLOOR(GREATEST(p_seconds, 0));
  v_hours BIGINT;
  v_minutes BIGINT;
  v_seconds BIGINT;
BEGIN
  v_hours := v_total / 3600;
  v_minutes := (v_total % 3600) / 60;
  v_seconds := v_total % 60;
  IF v_hours > 0 THEN
    RETURN v_hours::TEXT || ':' || LPAD(v_minutes::TEXT, 2, '0') || ':' || LPAD(v_seconds::TEXT, 2, '0');
  END IF;
  RETURN v_minutes::TEXT || ':' || LPAD(v_seconds::TEXT, 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_episode_assembly(
  p_channel_id UUID,
  p_episode_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_batch_id UUID;
  v_assembly_id UUID;
  v_total INTEGER;
  v_cursor NUMERIC(10,2) := 0;
  v_tracklist TEXT := '';
  v_item RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT assembly.id INTO v_assembly_id
  FROM public.episode_assemblies AS assembly
  WHERE assembly.episode_id = p_episode_id AND assembly.user_id = v_user_id;
  IF FOUND THEN
    RETURN jsonb_build_object('assemblyId', v_assembly_id, 'created', FALSE);
  END IF;

  SELECT batch.id, batch.total_blueprints
  INTO v_batch_id, v_total
  FROM public.episode_generation_batches AS batch
  JOIN public.channel_episodes AS episode ON episode.id = batch.episode_id
  JOIN public.channel_blueprints AS channel ON channel.id = episode.channel_id
  WHERE batch.episode_id = p_episode_id
    AND episode.channel_id = p_channel_id
    AND batch.status = 'completed'
    AND channel.user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Every Track needs a selected Master' USING ERRCODE = '22023';
  END IF;

  IF v_total <> (
    SELECT COUNT(*) FROM public.generation_queue_items
    WHERE batch_id = v_batch_id AND selected_candidate_id IS NOT NULL AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Selected Master count does not match Episode' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.episode_assemblies (
    episode_id, batch_id, user_id, status, assembly_mode, track_count
  ) VALUES (
    p_episode_id, v_batch_id, v_user_id, 'draft', 'gapless', v_total
  ) RETURNING id INTO v_assembly_id;

  FOR v_item IN
    SELECT item.id AS queue_item_id, item.track_number, item.title,
           candidate.id AS candidate_id, candidate.generation_id,
           candidate.audio_url, candidate.duration_seconds
    FROM public.generation_queue_items AS item
    JOIN public.generation_queue_candidates AS candidate
      ON candidate.id = item.selected_candidate_id
    WHERE item.batch_id = v_batch_id
    ORDER BY item.track_number
  LOOP
    IF v_item.duration_seconds IS NULL OR v_item.duration_seconds <= 0 THEN
      RAISE EXCEPTION 'Master duration is missing for Track %', v_item.track_number USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.episode_assembly_items (
      assembly_id, queue_item_id, candidate_id, generation_id, track_number,
      title, audio_url, duration_seconds, start_seconds, end_seconds
    ) VALUES (
      v_assembly_id, v_item.queue_item_id, v_item.candidate_id, v_item.generation_id,
      v_item.track_number, v_item.title, v_item.audio_url, v_item.duration_seconds,
      v_cursor, v_cursor + v_item.duration_seconds
    );
    v_tracklist := v_tracklist
      || CASE WHEN v_tracklist = '' THEN '' ELSE E'\n' END
      || public.format_playlist_timestamp(v_cursor) || ' ' || v_item.title;
    v_cursor := v_cursor + v_item.duration_seconds;
  END LOOP;

  UPDATE public.episode_assemblies
  SET total_duration_seconds = v_cursor, tracklist_text = v_tracklist
  WHERE id = v_assembly_id;

  RETURN jsonb_build_object('assemblyId', v_assembly_id, 'created', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.create_episode_assembly(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_episode_assembly(UUID, UUID)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.queue_episode_assembly(p_assembly_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.episode_assemblies
  SET status = 'queued', queued_at = NOW(), error_message = NULL
  WHERE id = p_assembly_id AND user_id = v_user_id AND status IN ('draft', 'failed');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assembly cannot be queued' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('assemblyId', p_assembly_id, 'status', 'queued');
END;
$$;

REVOKE ALL ON FUNCTION public.queue_episode_assembly(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_episode_assembly(UUID)
  TO authenticated, service_role;

-- ─── YouTube Autopilot 점진 연동 ───────────────────────────────────────────
-- 기존 audio_preset_id 기반 자동화는 그대로 유지한다. 새 자동화만 Channel
-- Project를 선택적으로 연결하고, 실행 시점에 고정 DNA + 새 Episode 전략을 쓴다.

ALTER TABLE public.youtube_automations
  ADD COLUMN IF NOT EXISTS channel_blueprint_id UUID
    REFERENCES public.channel_blueprints(id) ON DELETE SET NULL;

ALTER TABLE public.youtube_automations
  ADD COLUMN IF NOT EXISTS channel_episode_strategy JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_youtube_automations_channel_blueprint
  ON public.youtube_automations (channel_blueprint_id)
  WHERE channel_blueprint_id IS NOT NULL;
