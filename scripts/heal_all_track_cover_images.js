import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let sunoApiKey = process.env.SUNO_API_KEY;
let openAiApiKey = process.env.OPENAI_API_KEY;

if (!serviceRoleKey) {
  try {
    const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
    for (const line of envText.split('\n')) {
      if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim();
      if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceRoleKey = line.split('=')[1].trim();
      if (line.startsWith('SUNO_API_KEY=')) sunoApiKey = line.split('=')[1].trim();
      if (line.startsWith('OPENAI_API_KEY=')) openAiApiKey = line.split('=')[1].trim();
    }
  } catch (e) {
    console.error('Failed to read .env.local:', e.message);
  }
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Supabase credentials missing!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const sunoApiBase = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '');

async function generateCoverImage(title, stylePrompt, lyricsPrompt) {
  const prompt = `Album cover art for song titled "${title}". Music style: ${stylePrompt || 'K-Pop/Pop'}. Story & Lyrics theme: ${lyricsPrompt ? lyricsPrompt.slice(0, 150) : 'emotional music'}. Vibrant 1:1 square ratio concept art, highly detailed, clean edges, studio masterpiece, no text on image.`;

  // 1. Try 302.ai gpt-image-2
  if (sunoApiKey) {
    try {
      console.log(`  └─ Trying 302.ai gpt-image-2 for "${title}"...`);
      const res = await fetch(`${sunoApiBase}/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sunoApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt,
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        })
      });
      if (res.ok) {
        const data = await res.json();
        const b64 = data.data?.[0]?.b64_json;
        if (b64) {
          console.log(`  └─ 302.ai gpt-image-2 SUCCESS!`);
          return Buffer.from(b64, 'base64');
        }
      }
    } catch (e) {
      console.warn(`  └─ 302.ai failed: ${e.message}`);
    }
  }

  // 2. Try OpenAI DALL-E 3
  if (openAiApiKey) {
    try {
      console.log(`  └─ Trying OpenAI DALL-E 3 for "${title}"...`);
      const res = await fetch(`https://api.openai.com/v1/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: `Album cover art for song titled "${title}". Style: ${stylePrompt || 'Pop'}. Clean 1:1 concept art`,
          n: 1,
          size: '1024x1024',
        })
      });
      if (res.ok) {
        const data = await res.json();
        const url = data.data?.[0]?.url;
        if (url) {
          const imgRes = await fetch(url);
          if (imgRes.ok) {
            console.log(`  └─ OpenAI DALL-E 3 SUCCESS!`);
            return Buffer.from(await imgRes.arrayBuffer());
          }
        }
      }
    } catch (e) {
      console.warn(`  └─ OpenAI DALL-E 3 failed: ${e.message}`);
    }
  }

  // 3. Fallback: Pollinations AI
  try {
    console.log(`  └─ Trying Pollinations AI for "${title}"...`);
    const polUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 200))}?width=1024&height=1024&seed=${Math.floor(Math.random() * 900000) + 100000}&nologo=true`;
    const res = await fetch(polUrl);
    if (res.ok) {
      console.log(`  └─ Pollinations AI SUCCESS!`);
      return Buffer.from(await res.arrayBuffer());
    }
  } catch (e) {
    console.warn(`  └─ Pollinations AI failed: ${e.message}`);
  }

  return null;
}

async function healAllCoverImages() {
  console.log('=== 🎨 Starting DB Track Cover Image Healing ===');

  const { data: tracks, error } = await supabase
    .from('generations')
    .select('id, title, cover_art_url, license_hash, status')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch generations:', error.message);
    process.exit(1);
  }

  console.log(`Total tracks in DB: ${tracks.length}`);

  let healedCount = 0;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const isUnsplash = (url) => url && url.includes('unsplash.com');
    const needsHealing = !track.cover_art_url || isUnsplash(track.cover_art_url);

    if (!needsHealing) {
      continue;
    }

    console.log(`\n[${i + 1}/${tracks.length}] Healing Track ID ${track.id}: "${track.title}" (Current URL: ${track.cover_art_url?.slice(0, 45)}...)`);

    let stylePrompt = '';
    let lyricsPrompt = '';
    if (track.license_hash) {
      try {
        const meta = JSON.parse(track.license_hash);
        stylePrompt = meta.stylePrompt || '';
        lyricsPrompt = meta.lyricsPrompt || '';
      } catch {}
    }

    const imgBuffer = await generateCoverImage(track.title || 'Melodio Master Track', stylePrompt, lyricsPrompt);

    if (imgBuffer) {
      const filePath = `covers/${track.id}.png`;
      const { error: uploadError } = await supabase.storage
        .from('melodio-assets')
        .upload(filePath, imgBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.error(`  ❌ Storage upload failed for track ${track.id}:`, uploadError.message);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('melodio-assets')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('generations')
        .update({
          cover_art_url: publicUrl,
        })
        .eq('id', track.id);

      if (updateError) {
        console.error(`  ❌ DB update failed for track ${track.id}:`, updateError.message);
      } else {
        console.log(`  ✅ HEALED! Updated public URL: ${publicUrl}`);
        healedCount++;
      }
    }
  }

  console.log(`\n=== 🎉 DB Cover Image Healing Complete! Total Healed: ${healedCount} tracks ===`);
}

healAllCoverImages();
