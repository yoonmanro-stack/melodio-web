-- 20260720_create_voice_dnas.sql
-- Create public.voice_dnas table for Virtual Artist voice design IP

CREATE TABLE IF NOT EXISTS public.voice_dnas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  vd_code VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'VD-1004', 'VD-82F4-91A7'
  name VARCHAR(255) NOT NULL,
  physical_layers JSONB DEFAULT '{}'::jsonb, -- e.g., { gender: "female", pitch: 70, brightness: 80 }
  textures JSONB DEFAULT '[]'::jsonb, -- e.g., ["Velvet", "Crystal"]
  emotions JSONB DEFAULT '[]'::jsonb, -- e.g., ["Hopeful", "Dreamy"]
  performance JSONB DEFAULT '{}'::jsonb, -- e.g., { power: 80, dynamics: 75, groove: 70 }
  style VARCHAR(100) DEFAULT 'Pop',
  noise_entropy INTEGER DEFAULT 15 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.voice_dnas ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own voice dnas
DROP POLICY IF EXISTS "Users can manage own voice dnas" ON public.voice_dnas;
CREATE POLICY "Users can manage own voice dnas" ON public.voice_dnas FOR ALL USING (auth.uid() = user_id);

-- Allow users to read system voice dnas (user_id IS NULL) and their own dnas
DROP POLICY IF EXISTS "Users can read own and system voice dnas" ON public.voice_dnas;
CREATE POLICY "Users can read own and system voice dnas" ON public.voice_dnas FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

-- Pre-populate default system Voice DNA presets
INSERT INTO public.voice_dnas (vd_code, name, physical_layers, textures, emotions, performance, style, noise_entropy, user_id)
VALUES 
  (
    'VD-1004', 
    'Aria', 
    '{"gender": "female", "age": "young", "pitch": 80, "brightness": 85, "chest": 40, "head": 80}', 
    '["Crystal", "Breathy"]', 
    '["Dreamy", "Hopeful"]', 
    '{"power": 65, "dynamics": 70, "vibrato": 60}', 
    'Pop', 
    15, 
    NULL
  ),
  (
    'VD-3802', 
    'Kaelen', 
    '{"gender": "male", "age": "mature", "pitch": 35, "brightness": 45, "chest": 85, "head": 30}', 
    '["Smoky", "Velvet"]', 
    '["Lonely", "Dark"]', 
    '{"power": 80, "dynamics": 85, "vibrato": 75}', 
    'Soul', 
    10, 
    NULL
  ),
  (
    'VD-7705', 
    'Moe', 
    '{"gender": "female", "age": "childish", "pitch": 90, "brightness": 95, "chest": 20, "head": 90}', 
    '["Silky", "Clean"]', 
    '["Passionate", "Happy"]', 
    '{"power": 60, "dynamics": 65, "vibrato": 50}', 
    'EDM', 
    20, 
    NULL
  )
ON CONFLICT (vd_code) DO NOTHING;
