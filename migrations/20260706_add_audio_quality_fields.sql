-- Alter generations table to add physical audio quality fields
ALTER TABLE generations ADD COLUMN IF NOT EXISTS clipping_count integer DEFAULT 0;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS dissonance_score integer DEFAULT 0;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS audio_grade varchar(5) DEFAULT 'A';
ALTER TABLE generations ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
