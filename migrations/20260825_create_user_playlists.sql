-- 20260825_create_user_playlists.sql
-- Melodio 개인 감상용 플레이리스트 v1
--
-- Channel Builder의 YouTube Episode/Assembly와 별개인 사용자 라이브러리다.
-- 원곡 정보는 복제하지 않고 public.generations를 참조해 항상 최신 제목·커버·URL을 사용한다.

-- ─── 공통 updated_at 트리거 ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_user_playlist_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── 1. 사용자 플레이리스트 ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_playlists_unique_name
  ON public.user_playlists (user_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_user_playlists_user_updated
  ON public.user_playlists (user_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_user_playlists_updated_at ON public.user_playlists;
CREATE TRIGGER trg_user_playlists_updated_at
  BEFORE UPDATE ON public.user_playlists
  FOR EACH ROW EXECUTE FUNCTION public.set_user_playlist_updated_at();

-- ─── 2. 플레이리스트 곡 ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_playlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES public.user_playlists(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_playlist_items_unique_generation
    UNIQUE (playlist_id, generation_id),
  CONSTRAINT user_playlist_items_unique_position
    UNIQUE (playlist_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_user_playlist_items_order
  ON public.user_playlist_items (playlist_id, position, added_at);

CREATE INDEX IF NOT EXISTS idx_user_playlist_items_generation
  ON public.user_playlist_items (generation_id);

-- 원곡 삭제의 FK cascade도 플레이리스트 최근 수정 시각에 반영한다.
-- position의 간격은 허용하며, 다음 명시적 재정렬 때 0부터 다시 정규화한다.
CREATE OR REPLACE FUNCTION public.touch_user_playlist_after_item_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.user_playlists
  SET updated_at = NOW()
  WHERE id = OLD.playlist_id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_user_playlist_after_item_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_touch_user_playlist_after_item_delete
  ON public.user_playlist_items;
CREATE TRIGGER trg_touch_user_playlist_after_item_delete
  AFTER DELETE ON public.user_playlist_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_playlist_after_item_delete();

-- ─── 3. 일반 완성곡 자격 판정 ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_user_playlist_eligible_generation(
  p_generation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_generation RECORD;
  v_metadata JSONB := '{}'::jsonb;
  v_duration_text TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT
    generation.user_id,
    generation.status,
    generation.audio_url,
    generation.source_audio_url,
    generation.license_hash
  INTO v_generation
  FROM public.generations AS generation
  WHERE generation.id = p_generation_id
    AND generation.user_id = v_user_id;

  IF NOT FOUND
    OR v_generation.status IS DISTINCT FROM 'completed'
    OR COALESCE(v_generation.audio_url, v_generation.source_audio_url) IS NULL
    OR COALESCE(v_generation.audio_url, v_generation.source_audio_url) !~* '^https?://'
  THEN
    RETURN FALSE;
  END IF;

  IF v_generation.license_hash IS NOT NULL THEN
    BEGIN
      v_metadata := v_generation.license_hash::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      v_metadata := '{}'::jsonb;
    END;
  END IF;

  -- 패러디/바이럴 숏폼은 개인 일반 음원 플레이리스트와 분리한다.
  IF lower(COALESCE(v_metadata ->> 'sourceMenu', '')) IN ('viral', 'viral-cf')
    OR lower(COALESCE(v_metadata ->> 'viralMode', 'false')) = 'true'
  THEN
    RETURN FALSE;
  END IF;

  -- 일반 감상 목록은 완곡용이다. 현재 Lyria/바이럴의 30초 산출물은
  -- 실제 길이를 metadata에 기록하고 90초 이하를 별도 도메인으로 유지한다.
  v_duration_text := COALESCE(
    v_metadata ->> 'durationSeconds',
    v_metadata ->> 'duration'
  );
  IF lower(COALESCE(v_metadata ->> 'engine', '')) = 'lyria3'
    AND NULLIF(btrim(COALESCE(v_duration_text, '')), '') IS NULL
  THEN
    RETURN FALSE;
  END IF;
  IF v_duration_text ~ '^\d+(\.\d+)?$' AND v_duration_text::NUMERIC <= 90 THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.is_user_playlist_eligible_generation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_user_playlist_eligible_generation(UUID) TO authenticated;

-- ─── 4. RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.user_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_playlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own playlists"
  ON public.user_playlists;
CREATE POLICY "Users can manage own playlists"
  ON public.user_playlists
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can read own playlist items"
  ON public.user_playlist_items;
CREATE POLICY "Users can read own playlist items"
  ON public.user_playlist_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_playlists AS playlist
      WHERE playlist.id = user_playlist_items.playlist_id
        AND playlist.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create own playlist items"
  ON public.user_playlist_items;
CREATE POLICY "Users can create own playlist items"
  ON public.user_playlist_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_playlists AS playlist
      WHERE playlist.id = user_playlist_items.playlist_id
        AND playlist.user_id = (SELECT auth.uid())
    )
    AND public.is_user_playlist_eligible_generation(generation_id)
  );

DROP POLICY IF EXISTS "Users can update own playlist items"
  ON public.user_playlist_items;
CREATE POLICY "Users can update own playlist items"
  ON public.user_playlist_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_playlists AS playlist
      WHERE playlist.id = user_playlist_items.playlist_id
        AND playlist.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_playlists AS playlist
      WHERE playlist.id = user_playlist_items.playlist_id
        AND playlist.user_id = (SELECT auth.uid())
    )
    AND public.is_user_playlist_eligible_generation(generation_id)
  );

DROP POLICY IF EXISTS "Users can delete own playlist items"
  ON public.user_playlist_items;
CREATE POLICY "Users can delete own playlist items"
  ON public.user_playlist_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_playlists AS playlist
      WHERE playlist.id = user_playlist_items.playlist_id
        AND playlist.user_id = (SELECT auth.uid())
    )
  );

-- 브라우저 세션은 플레이리스트 자체 CRUD와 목록 조회만 직접 수행한다.
-- 곡 추가·삭제·재정렬은 아래 SECURITY DEFINER RPC로만 허용해 순서를 원자적으로 보존한다.
REVOKE ALL ON TABLE public.user_playlists FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_playlist_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_playlists TO authenticated;
GRANT SELECT ON TABLE public.user_playlist_items TO authenticated;

-- ─── 5. 원자적 추가·삭제·재정렬 RPC ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_generation_to_user_playlist(
  p_playlist_id UUID,
  p_generation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing public.user_playlist_items%ROWTYPE;
  v_created public.user_playlist_items%ROWTYPE;
  v_item_count INTEGER;
  v_position INTEGER;
  v_updated_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.user_playlists AS playlist
  WHERE playlist.id = p_playlist_id
    AND playlist.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_user_playlist_eligible_generation(p_generation_id) THEN
    RAISE EXCEPTION 'Track not available' USING ERRCODE = 'P0002';
  END IF;

  SELECT item.*
  INTO v_existing
  FROM public.user_playlist_items AS item
  WHERE item.playlist_id = p_playlist_id
    AND item.generation_id = p_generation_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'added', FALSE,
      'itemId', v_existing.id,
      'position', v_existing.position
    );
  END IF;

  SELECT COUNT(*), COALESCE(MAX(item.position), -1) + 1
  INTO v_item_count, v_position
  FROM public.user_playlist_items AS item
  WHERE item.playlist_id = p_playlist_id;

  IF v_item_count >= 500 THEN
    RAISE EXCEPTION 'Playlist track limit reached' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.user_playlist_items (
    playlist_id,
    generation_id,
    position
  ) VALUES (
    p_playlist_id,
    p_generation_id,
    v_position
  )
  RETURNING * INTO v_created;

  UPDATE public.user_playlists
  SET updated_at = NOW()
  WHERE id = p_playlist_id
  RETURNING updated_at INTO v_updated_at;

  RETURN jsonb_build_object(
    'added', TRUE,
    'itemId', v_created.id,
    'position', v_created.position,
    'updatedAt', v_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_generation_to_user_playlist(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_generation_to_user_playlist(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_user_playlist_item(
  p_playlist_id UUID,
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_deleted_id UUID;
  v_updated_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.user_playlists AS playlist
  WHERE playlist.id = p_playlist_id
    AND playlist.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.user_playlist_items
  WHERE id = p_item_id
    AND playlist_id = p_playlist_id
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'Playlist item not found' USING ERRCODE = 'P0002';
  END IF;

  WITH ordered AS (
    SELECT
      item.id,
      (ROW_NUMBER() OVER (ORDER BY item.position, item.added_at, item.id) - 1)::INTEGER
        AS next_position
    FROM public.user_playlist_items AS item
    WHERE item.playlist_id = p_playlist_id
  )
  UPDATE public.user_playlist_items AS item
  SET position = ordered.next_position
  FROM ordered
  WHERE item.id = ordered.id;

  UPDATE public.user_playlists
  SET updated_at = NOW()
  WHERE id = p_playlist_id
  RETURNING updated_at INTO v_updated_at;

  RETURN jsonb_build_object(
    'removed', TRUE,
    'itemId', v_deleted_id,
    'updatedAt', v_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_user_playlist_item(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_user_playlist_item(UUID, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.reorder_user_playlist_items(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.reorder_user_playlist_items(
  p_playlist_id UUID,
  p_item_ids UUID[],
  p_expected_updated_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_expected_count INTEGER;
  v_requested_count INTEGER;
  v_distinct_count INTEGER;
  v_current_updated_at TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) > 500 THEN
    RAISE EXCEPTION 'Invalid playlist order' USING ERRCODE = '22023';
  END IF;

  SELECT playlist.updated_at
  INTO v_current_updated_at
  FROM public.user_playlists AS playlist
  WHERE playlist.id = p_playlist_id
    AND playlist.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Playlist not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Playlist revision conflict' USING ERRCODE = '40001';
  END IF;

  SELECT COUNT(*)
  INTO v_expected_count
  FROM public.user_playlist_items AS item
  WHERE item.playlist_id = p_playlist_id;

  v_requested_count := cardinality(p_item_ids);
  SELECT COUNT(DISTINCT requested.item_id)
  INTO v_distinct_count
  FROM unnest(p_item_ids) AS requested(item_id);

  IF v_requested_count <> v_expected_count
    OR v_distinct_count <> v_requested_count
    OR EXISTS (
      SELECT 1
      FROM unnest(p_item_ids) AS requested(item_id)
      LEFT JOIN public.user_playlist_items AS item
        ON item.id = requested.item_id
       AND item.playlist_id = p_playlist_id
      WHERE item.id IS NULL
    )
  THEN
    RAISE EXCEPTION 'Playlist order does not match its items' USING ERRCODE = '22023';
  END IF;

  WITH requested AS (
    SELECT
      input.item_id,
      (input.ordinality - 1)::INTEGER AS next_position
    FROM unnest(p_item_ids) WITH ORDINALITY AS input(item_id, ordinality)
  )
  UPDATE public.user_playlist_items AS item
  SET position = requested.next_position
  FROM requested
  WHERE item.id = requested.item_id
    AND item.playlist_id = p_playlist_id;

  UPDATE public.user_playlists
  SET updated_at = NOW()
  WHERE id = p_playlist_id
  RETURNING updated_at INTO v_current_updated_at;

  RETURN jsonb_build_object(
    'reordered', TRUE,
    'count', v_requested_count,
    'updatedAt', v_current_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_user_playlist_items(UUID, UUID[], TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_user_playlist_items(UUID, UUID[], TIMESTAMPTZ) TO authenticated;
