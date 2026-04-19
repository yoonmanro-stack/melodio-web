-- 1. Profiles Table (유저 정보 및 토큰 과금 연동용)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  stripe_customer_id TEXT,
  tokens_balance INTEGER DEFAULT 1000 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- RLS Security for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- 2. Generations Table (음원 분리 백그라운드 작업 및 IP Vault 저작권 기록용)
CREATE TABLE public.generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_audio_url TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  is_stem_extracted BOOLEAN DEFAULT FALSE,
  -- 4채널 스템 URL (melodio-worker가 Supabase Storage 업로드 후 기록)
  stem_vocals_url TEXT,  -- vocals 채널
  stem_drums_url  TEXT,  -- drums 채널
  stem_bass_url   TEXT,  -- bass 채널
  stem_other_url  TEXT,  -- guitar/other 채널 (구 stem_melody_url → 변경)
  license_hash TEXT, -- IP Vault 증명용 해시값
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- RLS Security for generations
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own generations" ON public.generations FOR ALL USING (auth.uid() = user_id);

-- 3. Storage Bucket 생성 (음원 파일 저장소)
INSERT INTO storage.buckets (id, name, public) VALUES ('melodio-assets', 'melodio-assets', true);

-- Storage Security Policy (누구나 읽을 수 있으나 쓰기는 인증된 유저만)
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'melodio-assets');
CREATE POLICY "Auth Insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'melodio-assets' AND auth.uid() = owner);
