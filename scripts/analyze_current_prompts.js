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
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function analyze() {
  const { data, error } = await supabase
    .from('curation_playbooks')
    .select('*')
    .limit(5);

  if (error) {
    console.error("Error fetching playbooks:", error);
    return;
  }

  console.log(`Fetched ${data.length} playbooks. Columns available:`, Object.keys(data[0] || {}));
  data.forEach((p, idx) => {
    console.log(`\n--- [${idx + 1}] Title: ${p.title} | Category: ${p.category} ---`);
    console.log("Studio Grade Prompt:", p.metadata?.studio_grade_prompt || "N/A");
    console.log("Suno Tags:", p.metadata?.suno_tags || "N/A");
    console.log("Audio Engineering:", p.metadata?.audio_engineering || "N/A");
  });
}

analyze();
