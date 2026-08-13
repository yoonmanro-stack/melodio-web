-- 1. youtube_channels 테이블 user_id 인덱스
CREATE INDEX IF NOT EXISTS idx_youtube_channels_user_id ON youtube_channels(user_id);

-- 2. youtube_automations 테이블 user_id 및 channel_id 인덱스
CREATE INDEX IF NOT EXISTS idx_youtube_automations_user_id ON youtube_automations(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_automations_channel_id ON youtube_automations(channel_id);

-- 3. youtube_automation_logs 테이블 automation_id 및 started_at 인덱스 (정렬 최적화)
CREATE INDEX IF NOT EXISTS idx_youtube_automation_logs_automation_id ON youtube_automation_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_youtube_automation_logs_started_at ON youtube_automation_logs(started_at DESC);
