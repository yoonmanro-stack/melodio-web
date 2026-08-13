const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['\"]|['\"]$/g, '');
    env[key] = val;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
    .from('generations')
    .select('id, title, license_hash')
    .order('created_at', { ascending: false });

  if (error) return console.error(error);

  console.log(`--- DIAGNOSTIC RESULT FOR ${data.length} RECORDS ---`);
  data.forEach((g, i) => {
    let parsed = {};
    try { parsed = JSON.parse(g.license_hash || '{}'); } catch {}
    const lyrics = (parsed.lyrics || parsed.lyricsPrompt || parsed.prompt || '').replace(/\n/g, ' ');
    const topic = parsed.customTopic || parsed.topic || parsed.prompt || '';
    const presetId = parsed.presetId || parsed.tab_type || '';

    console.log(`[${i + 1}] ID: ${g.id.slice(0, 8)} | Title: "${g.title}" | Preset: ${presetId}`);
    console.log(`    Topic: "${topic.slice(0, 80)}"`);
    console.log(`    Lyrics: "${lyrics.slice(0, 100)}..."`);
    console.log('----------------------------------------------------');
  });
}

run();
