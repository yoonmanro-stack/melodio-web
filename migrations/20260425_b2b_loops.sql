-- ============================================================
-- Melodio — B2B Loops 테이블 추가 마이그레이션
-- 기존 supabase_schema.sql 적용 후 실행
-- 1시간 루프 컴파일레이션 + IP 증명서 기능 지원
-- Date: 2026-04-25
-- ============================================================

-- 1. B2B Loops Table — 1시간 루프 컴파일레이션 결과물
CREATE TABLE IF NOT EXISTS public.b2b_loops (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  
  -- 트랙 구성
  track_count     INTEGER NOT NULL DEFAULT 0,
  track_ids       UUID[] DEFAULT '{}',          -- generations.id 참조 배열
  total_duration  INTEGER NOT NULL DEFAULT 0,   -- 총 재생시간 (초)
  target_duration INTEGER NOT NULL DEFAULT 3600, -- 목표 시간 (기본 1시간=3600초)
  
  -- 출력 파일
  output_url      TEXT,                         -- 최종 컴파일 오디오 URL (Storage)
  video_url       TEXT,                         -- 비디오 렌더 URL (선택)
  format          TEXT DEFAULT 'mp3' CHECK (format IN ('mp3', 'wav', 'flac', 'aac')),
  
  -- 상태 관리
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'compiling', 'completed', 'failed')),
  compile_started_at  TIMESTAMPTZ,
  compile_finished_at TIMESTAMPTZ,
  error_message   TEXT,
  
  -- IP 증명서
  license_hash    TEXT,                         -- SHA-256 해시 (IP 증명용)
  license_type    TEXT DEFAULT 'commercial' CHECK (license_type IN ('commercial', 'exclusive', 'custom')),
  certificate_url TEXT,                         -- PDF 증명서 다운로드 URL
  
  -- 메타데이터
  genre           TEXT,
  mood            TEXT,
  bpm_range       TEXT,                         -- "100-120" 형식
  tags            TEXT[] DEFAULT '{}',
  
  -- 타임스탬프
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_b2b_loops_user_id ON public.b2b_loops (user_id);
CREATE INDEX IF NOT EXISTS idx_b2b_loops_status  ON public.b2b_loops (user_id, status);

-- RLS
ALTER TABLE public.b2b_loops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own b2b loops" 
  ON public.b2b_loops FOR ALL 
  USING (auth.uid() = user_id);

-- service_role 풀 액세스 (워커용)
CREATE POLICY "Service can manage all b2b loops"
  ON public.b2b_loops FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_b2b_loops_updated_at
  BEFORE UPDATE ON public.b2b_loops
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- ✅ b2b_loops 테이블 생성 완료
-- Supabase Dashboard → SQL Editor에서 이 파일 전체를 실행하세요
-- ============================================================
