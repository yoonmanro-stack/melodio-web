-- 비디오 생성 자산 관리 테이블
CREATE TABLE IF NOT EXISTS video_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  video_url TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) 활성화
ALTER TABLE video_assets ENABLE ROW LEVEL SECURITY;

-- RLS 정책 선언
CREATE POLICY "Allow users to read their own video assets"
  ON video_assets FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Allow users to insert their own video assets"
  ON video_assets FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to update their own video assets"
  ON video_assets FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Allow users to delete their own video assets"
  ON video_assets FOR DELETE USING (auth.uid() = user_id);

-- Supabase Realtime 활성화 (워커 구독용)
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_assets;
