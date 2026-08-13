import fs from 'fs';
import path from 'path';

let sunoApiKey = process.env.SUNO_API_KEY;
let openAiApiKey = process.env.OPENAI_API_KEY;

if (!sunoApiKey) {
  try {
    const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
    for (const line of envText.split('\n')) {
      if (line.startsWith('SUNO_API_KEY=')) {
        sunoApiKey = line.replace('SUNO_API_KEY=', '').trim();
      }
      if (line.startsWith('OPENAI_API_KEY=')) {
        openAiApiKey = line.replace('OPENAI_API_KEY=', '').trim();
      }
    }
  } catch {}
}

const sunoApiBase = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '');

console.log('Testing 302.ai Image Generation API...');
console.log('SUNO_API_KEY:', sunoApiKey ? sunoApiKey.slice(0, 15) + '...' : 'MISSING');
console.log('OPENAI_API_KEY:', openAiApiKey ? openAiApiKey.slice(0, 15) + '...' : 'MISSING');

async function testImageGen(modelName) {
  try {
    const res = await fetch(`${sunoApiBase}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sunoApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        prompt: 'Album cover art for K-pop song, cute kitten wearing headphones, vibrant neon studio lighting, 1:1 square ratio, high resolution',
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      })
    });
    console.log(`[Model: ${modelName}] HTTP Status: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`[Model: ${modelName}] SUCCESS! Has b64_json: ${!!data.data?.[0]?.b64_json}, Has url: ${!!data.data?.[0]?.url}`);
    } else {
      const errText = await res.text();
      console.log(`[Model: ${modelName}] ERROR Response: ${errText.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[Model: ${modelName}] Exception:`, err.message);
  }
}

async function testOpenAIDalle3() {
  try {
    const res = await fetch(`https://api.openai.com/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: 'Album cover art for K-pop song, cute kitten wearing headphones, vibrant neon studio lighting, 1:1 square ratio, high resolution',
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      })
    });
    console.log(`[Official OpenAI DALL-E 3] HTTP Status: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`[Official OpenAI DALL-E 3] SUCCESS! Has b64_json: ${!!data.data?.[0]?.b64_json}, Has url: ${!!data.data?.[0]?.url}`);
    } else {
      const errText = await res.text();
      console.log(`[Official OpenAI DALL-E 3] ERROR Response: ${errText.slice(0, 200)}`);
    }
  } catch (err) {
    console.error(`[Official OpenAI DALL-E 3] Exception:`, err.message);
  }
}

async function main() {
  await testImageGen('gpt-image-2');
  await testImageGen('dall-e-3');
  await testImageGen('flux-1-schnell');
  await testOpenAIDalle3();
}

main();
