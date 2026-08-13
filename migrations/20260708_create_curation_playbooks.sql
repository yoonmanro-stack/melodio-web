-- 20260708_create_curation_playbooks.sql
-- Curation Playbooks and Music Wiki Database Table

CREATE TABLE IF NOT EXISTS public.curation_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL, -- 'genre', 'visual', 'seo', 'lyrics'
  key_name VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'dead-mall-nostalgia', 'liquid-dnb', 'mallsoft'
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL, -- Detailed markdown/text playbook content
  metadata JSONB DEFAULT '{}'::jsonb, -- e.g., { bpm_range: "70-80", default_tags: "..." }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.curation_playbooks ENABLE ROW LEVEL SECURITY;

-- Allow public read access to playbooks
DROP POLICY IF EXISTS "Public Read Access to Curation Playbooks" ON public.curation_playbooks;
CREATE POLICY "Public Read Access to Curation Playbooks" ON public.curation_playbooks FOR SELECT USING (true);
