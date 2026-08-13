-- ============================================================
-- Melodio Pioneer: 공간 개척 테이블 생성 마이그레이션
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================================

-- 1. place_cells (개척된 장소 셀)
CREATE TABLE IF NOT EXISTS public.place_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. h3_modules (list-flags API에서 조회하는 H3 모듈)
CREATE TABLE IF NOT EXISTS public.h3_modules (
  h3_index TEXT PRIMARY KEY,
  place_cell_id UUID REFERENCES public.place_cells(id) ON DELETE CASCADE,
  is_center BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. place_cell_h3_mappings (claim-flag API에서 upsert하는 H3 매핑)
CREATE TABLE IF NOT EXISTS public.place_cell_h3_mappings (
  h3_index_id TEXT PRIMARY KEY,
  place_cell_id UUID REFERENCES public.place_cells(id) ON DELETE CASCADE,
  is_center BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. flags (깃발 데이터)
CREATE TABLE IF NOT EXISTS public.flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_cell_id UUID REFERENCES public.place_cells(id) ON DELETE CASCADE,
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  spot_fingerprint JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS 활성화 및 정책 설정
-- ============================================================
ALTER TABLE public.place_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.h3_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_cell_h3_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flags ENABLE ROW LEVEL SECURITY;

-- Place Cells Policy
DROP POLICY IF EXISTS "allow_all_place_cells" ON public.place_cells;
CREATE POLICY "allow_all_place_cells" ON public.place_cells FOR ALL USING (true) WITH CHECK (true);

-- H3 Modules Policy
DROP POLICY IF EXISTS "allow_all_h3_modules" ON public.h3_modules;
CREATE POLICY "allow_all_h3_modules" ON public.h3_modules FOR ALL USING (true) WITH CHECK (true);

-- H3 Mappings Policy
DROP POLICY IF EXISTS "allow_all_h3_mappings" ON public.place_cell_h3_mappings;
CREATE POLICY "allow_all_h3_mappings" ON public.place_cell_h3_mappings FOR ALL USING (true) WITH CHECK (true);

-- Flags Policy
DROP POLICY IF EXISTS "allow_all_flags" ON public.flags;
CREATE POLICY "allow_all_flags" ON public.flags FOR ALL USING (true) WITH CHECK (true);
