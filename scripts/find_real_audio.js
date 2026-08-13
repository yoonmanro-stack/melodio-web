import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

function loadEnv() {
  if (fs.existsSync('./.env.local')) {
    const lines = fs.readFileSync('./.env.local', 'utf-8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    });
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findAudio() {
  console.log("Searching for real completed audio tracks in Supabase...");
  
  const { data: gens, error: genErr } = await supabase
    .from('generations')
    .select('id, title, audio_url, status, created_at')
    .eq('status', 'completed')
    .not('audio_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (genErr) {
    console.error("Error fetching generations:", genErr);
  } else {
    console.log(`Found ${gens?.length || 0} completed generations:`);
    gens?.forEach(g => {
      console.log(`- [${g.title}] -> ${g.audio_url}`);
    });
  }
}

findAudio();
