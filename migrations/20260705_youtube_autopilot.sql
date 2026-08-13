-- 1. 연동된 유튜브 채널 정보 테이블
CREATE TABLE IF NOT EXISTS youtube_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id TEXT UNIQUE NOT NULL,
  channel_title TEXT NOT NULL,
  refresh_token TEXT NOT NULL, -- 암호화 후 대입할 공간
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 유튜브 채널 자율운영 설정 테이블
CREATE TABLE IF NOT EXISTS youtube_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES youtube_channels(channel_id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  audio_preset_id TEXT NOT NULL,
  target_region TEXT DEFAULT 'KR', -- 'KR', 'JP', 'EN'
  variation_strength TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
  upload_days TEXT[] NOT NULL, -- ['MON', 'WED', 'FRI']
  upload_time TIME NOT NULL, -- '21:00:00'
  longform_active BOOLEAN DEFAULT TRUE,
  shorts_active BOOLEAN DEFAULT FALSE,
  monetization_links TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 자동화 작업 수행 로그 테이블
CREATE TABLE IF NOT EXISTS youtube_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID REFERENCES youtube_automations(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'ready', 'generating_audio', 'rendering_video', 'uploading', 'success', 'failed'
  youtube_video_id TEXT,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- RLS (Row Level Security) 설정 추가
ALTER TABLE youtube_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_automation_logs ENABLE ROW LEVEL SECURITY;

-- Select/Insert/Update/Delete 정책 추가
CREATE POLICY "Allow users to read their own youtube channels"
  ON youtube_channels FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own youtube channels"
  ON youtube_channels FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own youtube channels"
  ON youtube_channels FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Allow users to manage their own automations"
  ON youtube_automations FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Allow users to read their own automation logs"
  ON youtube_automation_logs FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM youtube_automations 
      WHERE youtube_automations.id = youtube_automation_logs.automation_id 
      AND youtube_automations.user_id = auth.uid()
    )
  );
