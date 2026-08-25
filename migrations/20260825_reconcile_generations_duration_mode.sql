-- 운영 DB에는 존재하지만 기존 버전 관리 SQL에서 누락된 컬럼을 복구 가능하게 기록한다.
-- 생성 API, 스템 업로드, 개인 플레이리스트가 이미 이 컬럼들을 사용하므로
-- 신규/복구 환경에서도 동일한 스키마가 필요하다.

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS duration_mode TEXT,
  ADD COLUMN IF NOT EXISTS audio_url TEXT;

COMMENT ON COLUMN public.generations.duration_mode IS
  'Legacy generation duration/storage mode marker used by current generation and stem pipelines.';

COMMENT ON COLUMN public.generations.audio_url IS
  'Canonical generated audio URL used by playback, download, and personal playlists.';
