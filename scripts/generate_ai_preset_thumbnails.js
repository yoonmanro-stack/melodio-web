import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let sunoApiKey = process.env.SUNO_API_KEY;

if (!serviceRoleKey) {
  try {
    const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
    for (const line of envText.split('\n')) {
      if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
      if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceRoleKey = line.split('=')[1].trim();
      if (line.startsWith('SUNO_API_KEY=')) sunoApiKey = line.split('=')[1].trim();
    }
  } catch (e) {}
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const sunoApiBase = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '');

const PRESET_PROMPTS = {
  'developer-debugging': 'A high-tech cyberpunk developer workspace, neon glowing code screens, synthwave aesthetic, 1:1 square album art',
  'iced-oolong-tea': 'A tranquil Japanese tea house garden, iced oolong tea glass with mint leaves, warm afternoon sunlight, lofi chill aesthetic, 1:1 square album art',
  'tokyo-midnight-1984': 'Tokyo city highway at midnight 1984, vintage 80s city pop aesthetic, neon lights and sports car, retro anime style 1:1 square album art',
  'matcha-kyoto-jazz': 'Kyoto bamboo forest jazz cafe, steaming matcha latte cup, wooden piano and saxophone, cozy jazz bar 1:1 square album art',
  'french-vintage-chanson': 'Parisian cafe terrace on rainy evening, vintage accordion and red wine glass, Eiffel Tower in soft foggy background, vintage french chanson 1:1 square album art',
  'deep-sleep-drift': 'Cosmic starry night sky over peaceful floating clouds, glowing crescent moon, dreamy ambient lofi 1:1 square album art',
  'dead-mall-nostalgia': 'Nostalgic 90s vaporwave indoor mall, pink neon glow, retro palm trees, dreamy memory aesthetic 1:1 square album art',
  'joseon-hip-hop': 'Joseon dynasty palace at moonlight, traditional Korean black flag (soomuk-hwa), royal warrior holding sword, epic gugak hip-hop fusion 1:1 square album art'
};

async function generateAndSavePresetCovers() {
  console.log('=== 🎨 Generating AI Covers for Core Presets ===');
  const results = {};

  for (const [id, prompt] of Object.entries(PRESET_PROMPTS)) {
    console.log(`Generating cover for preset "${id}"...`);
    try {
      const res = await fetch(`${sunoApiBase}/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sunoApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: `${prompt}. Masterpiece album cover art, 1:1 ratio, high resolution, no text`,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        })
      });

      if (res.ok) {
        const data = await res.json();
        const b64 = data.data?.[0]?.b64_json;
        if (b64) {
          const buf = Buffer.from(b64, 'base64');
          const filePath = `presets/${id}.png`;
          const { error: uploadErr } = await supabase.storage
            .from('melodio-assets')
            .upload(filePath, buf, { contentType: 'image/png', upsert: true });

          if (!uploadErr) {
            const publicUrl = supabase.storage.from('melodio-assets').getPublicUrl(filePath).data.publicUrl;
            console.log(`  ✅ Preset "${id}" URL: ${publicUrl}`);
            results[id] = publicUrl;
          }
        }
      }
    } catch (err) {
      console.error(`  ❌ Error for ${id}:`, err.message);
    }
  }

  console.log('\nGenerated Preset URLs Result:');
  console.log(JSON.stringify(results, null, 2));
}

generateAndSavePresetCovers();
