-- 20260708_add_cover_art_url_to_generations.sql
-- generations 테이블에 1:1 앨범 커버 이미지 URL을 수록하기 위한 컬럼 추가
ALTER TABLE public.generations ADD COLUMN IF NOT EXISTS cover_art_url TEXT;
