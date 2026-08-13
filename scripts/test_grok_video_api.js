const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const apiKey = envVars.XAI_API_KEY || process.env.XAI_API_KEY;
const apiBase = envVars.XAI_API_BASE || 'https://api.x.ai/v1';

async function pollTask(requestId) {
  console.log(`\n2. Polling task status for requestId: ${requestId}...`);
  for (let i = 1; i <= 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`${apiBase}/videos/${requestId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    console.log(`Poll #${i} HTTP Status:`, res.status);
    const json = await res.json();
    console.log(`Poll #${i} Data:`, JSON.stringify(json));
    if (json.status === 'done' || json.status === 'completed' || json.status === 'succeeded' || json.state === 'completed') {
      console.log('SUCCESS! Video URL:', json.video?.url || json.url || json.data?.[0]?.url);
      break;
    }
    if (json.status === 'failed' || json.status === 'error') {
      console.error('FAILED:', json);
      break;
    }
  }
}

async function main() {
  const prompt = "Hyper-kinetic 9:16 vertical short-form video of a hilarious cat wearing sunglasses dancing in a neon kitchen, fast whip pan, crash zoom, high energy viral comedy";
  const res = await fetch(`${apiBase}/videos/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'grok-imagine-video',
      prompt: prompt,
      duration: 15,
      aspect_ratio: '9:16',
      watermark: false,
      silent: true,
      audio: false
    })
  });
  const data = await res.json();
  console.log('Init Response:', data);
  if (data.request_id) {
    await pollTask(data.request_id);
  }
}

main().catch(console.error);
