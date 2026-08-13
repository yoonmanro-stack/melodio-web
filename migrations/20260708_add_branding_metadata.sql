-- 20260708_add_branding_metadata.sql
-- youtube_automations 테이블에 AI 브랜드 기획 결과물(컨설팅 패키지)을 저장하기 위한 JSONB 컬럼 추가
ALTER TABLE youtube_automations ADD COLUMN IF NOT EXISTS branding_metadata JSONB DEFAULT '{}'::jsonb;
