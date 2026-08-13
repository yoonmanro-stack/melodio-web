const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error("Missing .env.local file");
  process.exit(1);
}

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error("Required env keys missing in .env.local");
  process.exit(1);
}

// Read genres from genres.txt if exists, otherwise use a default core list
const genresFile = path.resolve(__dirname, 'genres.txt');
let genres = [
  "City Pop",
  "Synthwave",
  "Deep House",
  "K-Indie",
  "Acoustic Folk",
  "Jazz Hop",
  "Cinematic Ambient",
  "Celtic Folk",
  "Melodic Techno",
  "Future Bass"
];

if (fs.existsSync(genresFile)) {
  genres = fs.readFileSync(genresFile, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

console.log(`Starting batch import for ${genres.length} genres...`);

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function queryNotebookLM(genre) {
  const query = `다음 음악 장르에 대한 역사, 대표 악기, 템포(BPM), Suno AI용 프롬프트 태그(suno_tags), 어울리는 이미지 앨범 커버용 프롬프트(logo_prompt), 음악적 무드를 정리해줘: ${genre}`;
  
  const response = await fetch('http://localhost:3001/api/autopilot/query-notebooklm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SUPABASE_SERVICE_ROLE_KEY
    },
    body: JSON.stringify({
      notebookId: "16216b66-3584-4565-b568-77648ab8f20f",
      query: query
    })
  });
  
  if (!response.ok) {
    throw new Error(`NotebookLM API returned ${response.status}: ${await response.text()}`);
  }
  
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "NotebookLM query failed");
  }
  return result.data.answer;
}

async function generatePlaybook(genre, notebookAnalysis) {
  const prompt = `NotebookLM이 분석한 음악 지식을 바탕으로 아래 장르에 대한 최상의 음악 큐레이션 플레이북 데이터를 JSON 포맷으로 생성해주세요.

장르명: ${genre}

NotebookLM 분석 정보:
${notebookAnalysis}

출력 스키마:
{
  "category": "genre",
  "key_name": "영문 소문자 및 하이픈 구조의 키명 (예: joseon-hiphop)",
  "title": "장르명 (한글명) (예: 조선힙합 (Joseon Hip Hop))",
  "content": "## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n...\\n\\n## 🚀 채널 운영 전략\\n...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n...\\n\\n## 🎵 음악적 특징\\n...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n...",
  "metadata": {
    "bpm_range": "예: 90-110",
    "sub_genres": "예: [Outrun, Cyberpunk] (배열 구조 또는 콤마로 구분된 문자열)",
    "suno_tags": "Suno AI에 입력할 최적의 쉼표 구분 스타일 태그들 (예: 1980s retro-futuristic, neon-lit, warm analog saturation)",
    "audio_engineering": "Suno/Udio 음질 극대화를 위한 엔지니어링 믹싱/마스터링 용어들 (예: High-fidelity, modern mastering, sidechain compression, 80s gated reverb on snare)",
    "instruments": "사용 악기들",
    "moods": "무드 단어들",
    "logo_prompt": "이 장르 음악에 어울리는 최적의 1:1 이미지 생성용 영문 프롬프트"
  }
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional music curator and database engineer. You output only clean, valid JSON playbooks matching the requested schema. Do not output markdown code blocks, just raw JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API returned ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  const text = result.choices[0].message.content.trim();
  let cleaned = text;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
  }
  return JSON.parse(cleaned.trim());
}

async function upsertToSupabase(playbook) {
  const response = await fetch('https://jfsfxzhunkrjyibsdswb.supabase.co/rest/v1/curation_playbooks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({
      category: playbook.category,
      key_name: playbook.key_name,
      title: playbook.title,
      content: playbook.content,
      metadata: playbook.metadata,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(`Supabase Upsert returned ${response.status}: ${await response.text()}`);
  }
}

async function writeToObsidian(playbook) {
  const category = playbook.category;
  const key_name = playbook.key_name;
  const title = playbook.title;
  const bpm_range = playbook.metadata.bpm_range;
  const sub_genres = playbook.metadata.sub_genres || '';
  const suno_tags = playbook.metadata.suno_tags;
  const audio_engineering = playbook.metadata.audio_engineering || '';
  const instruments = playbook.metadata.instruments;
  const moods = playbook.metadata.moods;
  const logo_prompt = playbook.metadata.logo_prompt;
  const content = playbook.content;

  const mdContent = `--- 
category: ${category}
key_name: ${key_name}
title: ${title}
bpm_range: ${bpm_range}
sub_genres: ${sub_genres}
suno_tags: ${suno_tags}
audio_engineering: ${audio_engineering}
instruments: ${instruments}
moods: ${moods}
logo_prompt: ${logo_prompt}
rendering_version: 2026_Latest
source: User-Insight
---
# ${title}

${content}
`;

  const os = require('os');
  const username = os.userInfo().username;
  const VAULT_ROOT = username === 'yoonmanro'
    ? '/Users/yoonmanro/Desktop/project/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio'
    : '/Users/muse/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio';

  const folderName = category === 'curation' ? '300_Prompts' : '100_Genres & Styles';
  const dirPath = path.join(VAULT_ROOT, folderName);
  const filePath = path.join(dirPath, `${key_name}.md`);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  fs.writeFileSync(filePath, mdContent, 'utf-8');
}

async function main() {
  for (let i = 0; i < genres.length; i++) {
    const genre = genres[i];
    console.log(`[${i + 1}/${genres.length}] Processing "${genre}"...`);
    try {
      console.log(`  - Querying NotebookLM...`);
      const analysis = await queryNotebookLM(genre);
      
      console.log(`  - Generating Playbook JSON via GPT...`);
      const playbook = await generatePlaybook(genre, analysis);
      
      console.log(`  - Upserting to Supabase...`);
      await upsertToSupabase(playbook);
      
      console.log(`  - Writing to Obsidian Vault...`);
      await writeToObsidian(playbook);
      
      console.log(`  ✓ Successfully imported "${playbook.title}" (${playbook.key_name})`);
    } catch (err) {
      console.error(`  ✗ Failed to process "${genre}":`, err.message);
    }
    
    if (i < genres.length - 1) {
      console.log(`  - Waiting 5 seconds before next genre...`);
      await delay(5000);
    }
  }
  console.log("Batch import completed.");
}

main().catch(err => {
  console.error("Fatal error in main loop:", err);
});
