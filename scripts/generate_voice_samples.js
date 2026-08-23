const fs = require('fs');
const path = require('path');

// Manually parse .env.local
let OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('OPENAI_API_KEY=')) {
        OPENAI_API_KEY = line.split('=')[1].trim();
        break;
      }
    }
  }
}

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not defined in .env.local");
  process.exit(1);
}

const VOICES_DATA = [
  {
    code: 'VD-1004',
    name: 'Aria',
    voice: 'nova',
    text: "Hi, I'm Aria. My voice brings calm, ethereal, and crystal clear soprano melodies to your music."
  },
  {
    code: 'VD-3802',
    name: 'Kaelen',
    voice: 'onyx',
    text: "Hey, this is Kaelen. Deep, soulful baritone with a smoky vintage groove. Let's make something timeless."
  },
  {
    code: 'VD-7705',
    name: 'Moe',
    voice: 'shimmer',
    text: "こんにちは！モエです。明るくキュートなハイトーンボイスで、あなたの曲を最高に盛り上げます！"
  },
  {
    code: 'VD-2001',
    name: 'Anna Kim',
    voice: 'shimmer',
    text: "안녕하세요, 안나 킴입니다. 따뜻하고 감성적인 보컬로 당신의 플레이리스트에 깊은 울림을 전해드릴게요."
  },
  {
    code: 'VD-2002',
    name: 'Yeon Taek',
    voice: 'onyx',
    text: "반갑습니다, 연택입니다. 거칠고 파워풀한 빈티지 록 보컬로 당신의 트랙을 가득 채워보세요."
  },
  {
    code: 'VD-2003',
    name: 'Junho',
    voice: 'echo',
    text: "안녕하세요, 준호입니다. 부드럽고 그루비한 R&B 소울 톤으로 멜로디에 깊은 감성을 더합니다."
  },
  {
    code: 'VD-2004',
    name: 'Britney',
    voice: 'nova',
    text: "Greetings. I am Britney. Precise, cold, and atmospheric vocal textures for your futuristic soundscape."
  },
  {
    code: 'VD-2005',
    name: 'Drew',
    voice: 'fable',
    text: "Hello there, I'm Drew. Smooth, laid-back retro jazz baritone. Sit back and enjoy the vibe."
  },
  {
    code: 'VD-2006',
    name: 'Sora',
    voice: 'alloy',
    text: "はじめまして、ソラです。心に染み渡る透明感あふれるアルトボイスをお届けします。"
  },
  {
    code: 'VD-2007',
    name: 'Leo',
    voice: 'echo',
    text: "Bonjour, I'm Leo. Bringing bright acoustic energy and warm tenor melodies to your songs."
  },
  {
    code: 'VD-2008',
    name: 'Ji-Eun',
    voice: 'shimmer',
    text: "안녕하세요, 지은입니다. 맑고 청아한 인디 팝 보이스로 기분 좋은 멜로디를 선물할게요."
  },
  {
    code: 'VD-2009',
    name: 'Mateo',
    voice: 'onyx',
    text: "Hola, I am Mateo. Rich, passionate baritone full of acoustic warmth and Spanish emotion."
  },
  {
    code: 'VD-2010',
    name: 'Sakura',
    voice: 'nova',
    text: "サクラです。静けさと情熱が交差する、エモーショナルなウィスパーロックをお届けします。"
  },
  {
    code: 'VD-2011',
    name: 'Minho',
    voice: 'echo',
    text: "안녕하세요, 민호입니다. 감미롭고 트렌디한 음색으로 트랙의 감정을 극대화해 드립니다."
  },
  {
    code: 'VD-2012',
    name: 'Chloe',
    voice: 'alloy',
    text: "Hey darling, I'm Chloe. Rich, velvety contralto with deep blues and jazz feeling."
  },
  {
    code: 'VD-2013',
    name: 'Kenji',
    voice: 'fable',
    text: "ケンジです！エネルギッシュでハイトーンなアニソン・J-Popボーカルで疾走感をお届けします！"
  },
  {
    code: 'VD-2014',
    name: 'Oliver',
    voice: 'fable',
    text: "Hello, I'm Oliver. Warm, acoustic British folk storytelling with authentic character."
  },
  {
    code: 'VD-2015',
    name: 'Sophia',
    voice: 'shimmer',
    text: "Greetings, I am Sophia. Majestic operatic soprano with soaring, powerful high notes."
  }
];

const outDir = path.join(__dirname, '../public/assets/voices');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function generateSample(item) {
  const filePath = path.join(outDir, `${item.code.toLowerCase()}.mp3`);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
    console.log(`[Skip] ${item.code} (${item.name}) already exists.`);
    return;
  }

  console.log(`[Generating] ${item.code} (${item.name}) via OpenAI TTS (${item.voice})...`);
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: item.voice,
      input: item.text
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to generate ${item.code}: ${response.status} ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(filePath, buffer);
  console.log(`[Saved] ${item.code} (${item.name}) -> ${filePath} (${buffer.length} bytes)`);
}

async function main() {
  console.log(`Starting generation of ${VOICES_DATA.length} voice samples...`);
  for (const item of VOICES_DATA) {
    try {
      await generateSample(item);
    } catch (e) {
      console.error(`Error generating ${item.code}:`, e.message);
    }
  }
  console.log("All voice samples generation completed!");
}

main();
