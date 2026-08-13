-- 20260709_add_viral_autopilot.sql
-- youtube_automations 테이블에 BGM 플레이리스트 자율주행('standard')과 쇼츠/CM 자율주행('viral_cf') 구분을 위한 타입 컬럼 추가
ALTER TABLE youtube_automations ADD COLUMN IF NOT EXISTS automation_type TEXT DEFAULT 'standard';
