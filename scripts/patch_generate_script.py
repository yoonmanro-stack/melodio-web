import os

file_path = 'generate_n8n_workflow.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace telegram-drafts paths
content = content.replace(
    "'/data/vault/04_Context/Melodio/Music-Wiki/.telegram-drafts'",
    "'/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts'"
)
content = content.replace(
    "`/data/vault/04_Context/Melodio/Music-Wiki/.telegram-drafts`",
    "`/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts`"
)

# 2. Update Wiki GPT prompt
wiki_gpt_prompt_old = r'"text": "=NotebookLM이 분석한 최신 트렌드 지식을 바탕으로 아래 장르에 대한 최상의 음악 백과사전(Playbook) 데이터를 JSON 포맷으로 생성해주세요.\n\n장르명: {{ $node[\"Wiki Aggregate YouTube\"].json.genre }}\n\nNotebookLM 분석 정보:\n{{ $node[\"Wiki Query Notebook\"].json.data }}\n\n출력 스키마:\n{\n  \"category\": \"genre\",\n  \"key_name\": \"영문 소문자 및 하이픈 구조의 키명 (예: dream-garage)\",\n  \"title\": \"장르명 (한글명) (예: 드림 개러지 (Dream Garage))\",\n  \"content\": \"## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n...\\n\\n## 🚀 채널 운영 전략\\n...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n...\\n\\n## 🎵 음악적 특징\\n...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n...\",\n  \"metadata\": {\n    \"bpm_range\": \"예: 120-130\",\n    \"suno_tags\": \"Suno AI에 입력할 최적의 쉼표 구분 태그들\",\n    \"instruments\": \"사용 악기들\",\n    \"moods\": \"무드 단어들\",\n    \"logo_prompt\": \"이 장르 음악에 어울리는 최적의 1:1 이미지 생성용 영문 프롬프트\"\n  }\n}"'

wiki_gpt_prompt_new = r'"text": "=NotebookLM이 분석한 최신 트렌드 지식을 바탕으로 아래 장르에 대한 최상의 음악 백과사전(Playbook) 데이터를 JSON 포맷으로 생성해주세요.\n\n장르명: {{ $node[\"Wiki Aggregate YouTube\"].json.genre }}\n\nNotebookLM 분석 정보:\n{{ $node[\"Wiki Query Notebook\"].json.data }}\n\n출력 스키마:\n{\n  \"category\": \"genre\",\n  \"key_name\": \"영문 소문자 및 하이픈 구조의 키명 (예: dream-garage)\",\n  \"title\": \"장르명 (한글명) (예: 드림 개러지 (Dream Garage))\",\n  \"content\": \"## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n...\\n\\n## 🚀 채널 운영 전략\\n...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n...\\n\\n## 🎵 음악적 특징\\n...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n...\",\n  \"metadata\": {\n    \"bpm_range\": \"예: 120-130\",\n    \"sub_genres\": \"예: [Outrun, Cyberpunk] (배열 구조 또는 콤마로 구분된 문자열)\",\n    \"suno_tags\": \"Suno AI에 입력할 최적의 쉼표 구분 스타일 태그들 (예: 1980s retro-futuristic, neon-lit, warm analog saturation)\",\n    \"audio_engineering\": \"Suno/Udio 음질 극대화를 위한 엔지니어링 믹싱/마스터링 용어들 (예: High-fidelity, modern mastering, sidechain compression, 80s gated reverb on snare)\",\n    \"instruments\": \"사용 악기들\",\n    \"moods\": \"무드 단어들\",\n    \"logo_prompt\": \"이 장르 음악에 어울리는 최적의 1:1 이미지 생성용 영문 프롬프트\"\n  }\n}"'

content = content.replace(wiki_gpt_prompt_old, wiki_gpt_prompt_new)

# 3. Update Set GPT prompt
set_gpt_prompt_old = r'"text": "=NotebookLM이 분석한 음악 지식을 바탕으로 아래 장르에 대한 최상의 음악 큐레이션 플레이북 데이터를 JSON 포맷으로 생성해주세요.\n\n장르명: {{ $node[\"Set Clear State\"].json.genre }}\n\nNotebookLM 분석 정보:\n{{ $node[\"Set Query Notebook\"].json.data }}\n\n출력 스키마:\n{\n  \"category\": \"curation\",\n  \"key_name\": \"영문 소문자 및 하이픈 구조의 키명 (예: joseon-hiphop)\",\n  \"title\": \"장르명 (한글명) (예: 조선힙합 (Joseon Hip Hop))\",\n  \"content\": \"## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n...\\n\\n## 🚀 채널 운영 전략\\n...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n...\\n\\n## 🎵 음악적 특징\\n...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n...\",\n  \"metadata\": {\n    \"bpm_range\": \"예: 90-110\",\n    \"suno_tags\": \"Suno AI에 입력할 최적의 쉼표 구분 태그들\",\n    \"instruments\": \"사용 악기들\",\n    \"moods\": \"무드 단어들\",\n    \"logo_prompt\": \"이 장르 음악에 어울리는 최적의 1:1 이미지 생성용 영문 프롬프트\"\n  }\n}"'

set_gpt_prompt_new = r'"text": "=NotebookLM이 분석한 음악 지식을 바탕으로 아래 장르에 대한 최상의 음악 큐레이션 플레이북 데이터를 JSON 포맷으로 생성해주세요.\n\n장르명: {{ $node[\"Set Clear State\"].json.genre }}\n\nNotebookLM 분석 정보:\n{{ $node[\"Set Query Notebook\"].json.data }}\n\n출력 스키마:\n{\n  \"category\": \"curation\",\n  \"key_name\": \"영문 소문자 및 하이픈 구조의 키명 (예: joseon-hiphop)\",\n  \"title\": \"장르명 (한글명) (예: 조선힙합 (Joseon Hip Hop))\",\n  \"content\": \"## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n...\\n\\n## 🚀 채널 운영 전략\\n...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n...\\n\\n## 🎵 음악적 특징\\n...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n...\",\n  \"metadata\": {\n    \"bpm_range\": \"예: 90-110\",\n    \"sub_genres\": \"예: [Outrun, Cyberpunk] (배열 구조 또는 콤마로 구분된 문자열)\",\n    \"suno_tags\": \"Suno AI에 입력할 최적의 쉼표 구분 스타일 태그들 (예: 1980s retro-futuristic, neon-lit, warm analog saturation)\",\n    \"audio_engineering\": \"Suno/Udio 음질 극대화를 위한 엔지니어링 믹싱/마스터링 용어들 (예: High-fidelity, modern mastering, sidechain compression, 80s gated reverb on snare)\",\n    \"instruments\": \"사용 악기들\",\n    \"moods\": \"무드 단어들\",\n    \"logo_prompt\": \"이 장르 음악에 어울리는 최적의 1:1 이미지 생성용 영문 프롬프트\"\n  }\n}"'

content = content.replace(set_gpt_prompt_old, set_gpt_prompt_new)

# 4. Update Manual GPT prompt
manual_gpt_prompt_old = r'"text": "=NotebookLM이 분석한 최신 트렌드 지식을 바탕으로 아래 장르에 대한 최상의 음악 백과사전(Playbook) 데이터를 JSON 포맷으로 생성해주세요.\n\n장르명: {{ $node[\"Manual Aggregate YouTube\"].json.genre }}\n\nNotebookLM 분석 정보:\n{{ $node[\"Manual Query Notebook\"].json.data }}\n\n출력 스키마:\n{\n  \"category\": \"genre\",\n  \"key_name\": \"영문 소문자 및 하이픈 구조의 키명 (예: dream-garage)\",\n  \"title\": \"장르명 (한글명) (예: 드림 개러지 (Dream Garage))\",\n  \"content\": \"## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n...\\n\\n## 🚀 채널 운영 전략\\n...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n...\\n\\n## 🎵 음악적 특징\\n...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n...\",\n  \"metadata\": {\n    \"bpm_range\": \"예: 120-130\",\n    \"suno_tags\": \"Suno AI에 입력할 최적의 쉼표 구분 태그들\",\n    \"instruments\": \"사용 악기들\",\n    \"moods\": \"무드 단어들\",\n    \"logo_prompt\": \"이 장르 음악에 어울리는 최적의 1:1 이미지 생성용 영문 프롬프트\"\n  }\n}"'

manual_gpt_prompt_new = r'"text": "=NotebookLM이 분석한 최신 트렌드 지식을 바탕으로 아래 장르에 대한 최상의 음악 백과사전(Playbook) 데이터를 JSON 포맷으로 생성해주세요.\n\n장르명: {{ $node[\"Manual Aggregate YouTube\"].json.genre }}\n\nNotebookLM 분석 정보:\n{{ $node[\"Manual Query Notebook\"].json.data }}\n\n출력 스키마:\n{\n  \"category\": \"genre\",\n  \"key_name\": \"영문 소문자 및 하이픈 구조의 키명 (예: dream-garage)\",\n  \"title\": \"장르명 (한글명) (예: 드림 개러지 (Dream Garage))\",\n  \"content\": \"## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n...\\n\\n## 🚀 채널 운영 전략\\n...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n...\\n\\n## 🎵 음악적 특징\\n...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n...\",\n  \"metadata\": {\n    \"bpm_range\": \"예: 120-130\",\n    \"sub_genres\": \"예: [Outrun, Cyberpunk] (배열 구조 또는 콤마로 구분된 문자열)\",\n    \"suno_tags\": \"Suno AI에 입력할 최적의 쉼표 구분 스타일 태그들 (예: 1980s retro-futuristic, neon-lit, warm analog saturation)\",\n    \"audio_engineering\": \"Suno/Udio 음질 극대화를 위한 엔지니어링 믹싱/마스터링 용어들 (예: High-fidelity, modern mastering, sidechain compression, 80s gated reverb on snare)\",\n    \"instruments\": \"사용 악기들\",\n    \"moods\": \"무드 단어들\",\n    \"logo_prompt\": \"이 장르 음악에 어울리는 최적의 1:1 이미지 생성용 영문 프롬프트\"\n  }\n}"'

content = content.replace(manual_gpt_prompt_old, manual_gpt_prompt_new)

# Helper function to find and replace jsCode for a node with a given id
def replace_js_code_for_node(content, node_id, new_js_code):
    id_pattern = f'"id": "{node_id}"'
    id_pos = content.find(id_pattern)
    if id_pos == -1:
        print(f"Error: Node {node_id} not found!")
        return content
        
    js_code_start_pattern = '"jsCode": `'
    start_pos = content.rfind(js_code_start_pattern, 0, id_pos)
    if start_pos == -1:
        print(f"Error: jsCode start not found for node {node_id}!")
        return content
        
    code_content_start = start_pos + len(js_code_start_pattern)
    
    end_pos = content.find('`\n      },', code_content_start)
    if end_pos == -1:
        end_pos = content.find('`\n    },', code_content_start)
    if end_pos == -1:
        end_pos = content.find('`},', code_content_start)
        
    if end_pos == -1:
        print(f"Error: jsCode end not found for node {node_id}!")
        return content
        
    new_content = content[:code_content_start] + new_js_code + content[end_pos:]
    print(f"Successfully replaced jsCode for node {node_id}.")
    return new_content

# 5. Define target JS Code for each node (including genres_count and prompts_count in return object)

wiki_new_js = """const fs = require('fs');
const path = require('path');

const playbook = $('Wiki Parse Playbook').first().json;

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
const is_manual = playbook.is_manual || false;
const content = playbook.content;

// Generate visual thumbnail in background using logo_prompt
let thumbnail_url = '';
try {
  const siteUrl = 'http://host.docker.internal:3000';
  const imgRes = await fetch(\`\\${siteUrl}/api/autopilot/generate-image\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: logo_prompt,
      size: '1:1',
      imageType: 'thumbnail',
      channelTitle: title,
      key_name: key_name
    })
  });
  if (imgRes.ok) {
    const imgData = await imgRes.json();
    if (imgData.success && imgData.imageUrl) {
      thumbnail_url = imgData.imageUrl;
    }
  }
} catch (err) {
  console.error('Failed to generate/upload thumbnail image:', err.message);
}

const mdContent = \\`--- 
category: \\${category}
key_name: \\${key_name}
title: \\${title}
bpm_range: \\${bpm_range}
sub_genres: \\${sub_genres}
suno_tags: \\${suno_tags}
audio_engineering: \\${audio_engineering}
instruments: \\${instruments}
moods: \\${moods}
logo_prompt: \\${logo_prompt}
thumbnail_url: \\${thumbnail_url}
rendering_version: 2026_Latest
source: \\${category === 'genre' ? (is_manual ? 'User-Insight' : 'YouTube_Trend') : 'Curation'}
---
# \\${title}

\\${content}
\\`;

const folderName = category === 'curation' ? '300_Prompts' : '100_Genres & Styles';
const dirPath = path.join('/data/vault/04_Context/Melodio', folderName);
const filePath = path.join(dirPath, \\`\\${key_name}.md\\`);
const fileExists = fs.existsSync(filePath);

if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

fs.writeFileSync(filePath, mdContent, 'utf-8');

// ── MOC Dashboard Auto-generation ──────────────────────────
const mocsDir = '/data/vault/04_Context/Melodio/000_MOCs';
const genresDir = '/data/vault/04_Context/Melodio/100_Genres & Styles';
const promptsDir = '/data/vault/04_Context/Melodio/300_Prompts';

if (!fs.existsSync(mocsDir)) {
  fs.mkdirSync(mocsDir, { recursive: true });
}

let genreLinks = [];
if (fs.existsSync(genresDir)) {
  const files = fs.readdirSync(genresDir).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const filePath = path.join(genresDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^title:\\\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    genreLinks.push(\`- [[\\${key}|\\${title}]]\`);
  });
}
genreLinks.sort();

let promptLinks = [];
if (fs.existsSync(promptsDir)) {
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const filePath = path.join(promptsDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^title:\\\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    promptLinks.push(\`- [[\\${key}|\\${title}]]\`);
  });
}
promptLinks.sort();

const dashboardContent = \\`# 🗺️ Melodio Master Dashboard

## 📂 100_Genres & Styles (음악 장르 백과사전)
\\\\\\${genreLinks.length > 0 ? genreLinks.join('\\\\n') : '- 등록된 장르가 없습니다.'}

## 📂 300_Prompts (큐레이션 플레이북)
\\\\\\${promptLinks.length > 0 ? promptLinks.join('\\\\n') : '- 등록된 플레이북이 없습니다.'}
\\`;

fs.writeFileSync(path.join(mocsDir, 'Dashboard.md'), dashboardContent, 'utf-8');

return {
  success: true,
  file_written: filePath,
  is_update: fileExists,
  chatId: playbook.chatId,
  title: playbook.title,
  genres_count: genreLinks.length,
  prompts_count: promptLinks.length
};"""

approve_new_js = """const fs = require('fs');
const path = require('path');

const playbook = $('Approve Read Cache').first().json;

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
const is_manual = playbook.is_manual || false;
const content = playbook.content;

// Generate visual thumbnail in background using logo_prompt
let thumbnail_url = '';
try {
  const siteUrl = 'http://host.docker.internal:3000';
  const imgRes = await fetch(\`\\${siteUrl}/api/autopilot/generate-image\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: logo_prompt,
      size: '1:1',
      imageType: 'thumbnail',
      channelTitle: title,
      key_name: key_name
    })
  });
  if (imgRes.ok) {
    const imgData = await imgRes.json();
    if (imgData.success && imgData.imageUrl) {
      thumbnail_url = imgData.imageUrl;
    }
  }
} catch (err) {
  console.error('Failed to generate/upload thumbnail image:', err.message);
}

const mdContent = \\`--- 
category: \\${category}
key_name: \\${key_name}
title: \\${title}
bpm_range: \\${bpm_range}
sub_genres: \\${sub_genres}
suno_tags: \\${suno_tags}
audio_engineering: \\${audio_engineering}
instruments: \\${instruments}
moods: \\${moods}
logo_prompt: \\${logo_prompt}
thumbnail_url: \\${thumbnail_url}
rendering_version: 2026_Latest
source: \\${category === 'genre' ? (is_manual ? 'User-Insight' : 'YouTube_Trend') : 'Curation'}
---
# \\${title}

\\${content}
\\`;

const folderName = category === 'curation' ? '300_Prompts' : '100_Genres & Styles';
const dirPath = path.join('/data/vault/04_Context/Melodio', folderName);
const filePath = path.join(dirPath, \\`\\${key_name}.md\\`);
const fileExists = fs.existsSync(filePath);

if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

fs.writeFileSync(filePath, mdContent, 'utf-8');

// ── MOC Dashboard Auto-generation ──────────────────────────
const mocsDir = '/data/vault/04_Context/Melodio/000_MOCs';
const genresDir = '/data/vault/04_Context/Melodio/100_Genres & Styles';
const promptsDir = '/data/vault/04_Context/Melodio/300_Prompts';

if (!fs.existsSync(mocsDir)) {
  fs.mkdirSync(mocsDir, { recursive: true });
}

let genreLinks = [];
if (fs.existsSync(genresDir)) {
  const files = fs.readdirSync(genresDir).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const filePath = path.join(genresDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^title:\\\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    genreLinks.push(\`- [[\\${key}|\\${title}]]\`);
  });
}
genreLinks.sort();

let promptLinks = [];
if (fs.existsSync(promptsDir)) {
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const filePath = path.join(promptsDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^title:\\\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    promptLinks.push(\`- [[\\${key}|\\${title}]]\`);
  });
}
promptLinks.sort();

const dashboardContent = \\`# 🗺️ Melodio Master Dashboard

## 📂 100_Genres & Styles (음악 장르 백과사전)
\\\\\\${genreLinks.length > 0 ? genreLinks.join('\\\\n') : '- 등록된 장르가 없습니다.'}

## 📂 300_Prompts (큐레이션 플레이북)
\\\\\\${promptLinks.length > 0 ? promptLinks.join('\\\\n') : '- 등록된 플레이북이 없습니다.'}
\\`;

fs.writeFileSync(path.join(mocsDir, 'Dashboard.md'), dashboardContent, 'utf-8');

return {
  success: true,
  file_written: filePath,
  chatId: playbook.chatId,
  title: playbook.title,
  key_name: playbook.key_name,
  category: playbook.category,
  genres_count: genreLinks.length,
  prompts_count: promptLinks.length
};"""

manual_new_js = """const fs = require('fs');
const path = require('path');

const playbook = $('Manual Parse Playbook').first().json;

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
const source = playbook.metadata.source || 'User-Insight';
const content = playbook.content;

// Generate visual thumbnail in background using logo_prompt
let thumbnail_url = '';
try {
  const siteUrl = 'http://host.docker.internal:3000';
  const imgRes = await fetch(\`\\${siteUrl}/api/autopilot/generate-image\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: logo_prompt,
      size: '1:1',
      imageType: 'thumbnail',
      channelTitle: title,
      key_name: key_name
    })
  });
  if (imgRes.ok) {
    const imgData = await imgRes.json();
    if (imgData.success && imgData.imageUrl) {
      thumbnail_url = imgData.imageUrl;
    }
  }
} catch (err) {
  console.error('Failed to generate/upload thumbnail image:', err.message);
}

const mdContent = \\`--- 
category: \\${category}
key_name: \\${key_name}
title: \\${title}
bpm_range: \\${bpm_range}
sub_genres: \\${sub_genres}
suno_tags: \\${suno_tags}
audio_engineering: \\${audio_engineering}
instruments: \\${instruments}
moods: \\${moods}
logo_prompt: \\${logo_prompt}
thumbnail_url: \\${thumbnail_url}
rendering_version: 2026_Latest
source: \\${category === 'genre' ? 'User-Insight' : 'Curation'}
---
# \\${title}

\\${content}
\\`;

const folderName = category === 'curation' ? '300_Prompts' : '100_Genres & Styles';
const dirPath = path.join('/data/vault/04_Context/Melodio', folderName);
const filePath = path.join(dirPath, \\`\\${key_name}.md\\`);
const fileExists = fs.existsSync(filePath);

if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

fs.writeFileSync(filePath, mdContent, 'utf-8');

// ── MOC Dashboard Auto-generation ──────────────────────────
const mocsDir = '/data/vault/04_Context/Melodio/000_MOCs';
const genresDir = '/data/vault/04_Context/Melodio/100_Genres & Styles';
const promptsDir = '/data/vault/04_Context/Melodio/300_Prompts';

if (!fs.existsSync(mocsDir)) {
  fs.mkdirSync(mocsDir, { recursive: true });
}

let genreLinks = [];
if (fs.existsSync(genresDir)) {
  const files = fs.readdirSync(genresDir).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const filePath = path.join(genresDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^title:\\\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    genreLinks.push(\`- [[\\${key}|\\${title}]]\`);
  });
}
genreLinks.sort();

let promptLinks = [];
if (fs.existsSync(promptsDir)) {
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const filePath = path.join(promptsDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^title:\\\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    promptLinks.push(\`- [[\\${key}|\\${title}]]\`);
  });
}
promptLinks.sort();

const dashboardContent = \\`# 🗺️ Melodio Master Dashboard

## 📂 100_Genres & Styles (음악 장르 백과사전)
\\\\\\${genreLinks.length > 0 ? genreLinks.join('\\\\n') : '- 등록된 장르가 없습니다.'}

## 📂 300_Prompts (큐레이션 플레이북)
\\\\\\${promptLinks.length > 0 ? promptLinks.join('\\\\n') : '- 등록된 플레이북이 없습니다.'}
\\`;

fs.writeFileSync(path.join(mocsDir, 'Dashboard.md'), dashboardContent, 'utf-8');

return {
  success: true,
  file_written: filePath,
  is_update: fileExists,
  chatId: playbook.chatId,
  title: playbook.title,
  key_name: playbook.key_name,
  category: playbook.category,
  genres_count: genreLinks.length,
  prompts_count: promptLinks.length
};"""

content = replace_js_code_for_node(content, "wiki-write-obsidian", wiki_new_js)
content = replace_js_code_for_node(content, "approve-write-obsidian", approve_new_js)
content = replace_js_code_for_node(content, "manual-write-obsidian", manual_new_js)

# 6. Update folder references in Delete node
delete_node_old = "const folder = payload.category === 'curation' ? 'Curation' : 'Music-Wiki';"
delete_node_new = "const folder = payload.category === 'curation' ? '300_Prompts' : '100_Genres & Styles';"
content = content.replace(delete_node_old, delete_node_new)

# 7. Update messages to CEO (큐레이션 -> 300_Prompts, 음악위키 -> 100_Genres & Styles)
content = content.replace("옵시디언 음악위키(Music-Wiki)", "옵시디언 음악위키(100_Genres & Styles)")
content = content.replace("옵시디언 큐레이션(Curation) 폴더", "옵시디언 큐레이션(300_Prompts) 폴더")
content = content.replace("Curation 폴더", "300_Prompts 폴더")
content = content.replace("Music-Wiki 폴더", "100_Genres & Styles 폴더")

# 8. Append Stats to Success Telegram node messages
success_wiki_old = r'"text": "=✅ **신규 장르 백과사전 {{ $json.is_update ? \'업데이트\' : \'등록\' }} 완료!**\n\n장르 프리셋 **\'{{ $json.title }}\'**이 Supabase DB와 옵시디언 음악위키(100_Genres & Styles)에 성공적으로 {{ $json.is_update ? \'갱신\' : \'배포 및 기록\' }}되었습니다! 📚🎉\n\n유튜브 트렌드 분석 지식이 NotebookLM에 성공적으로 주입되었습니다."'
success_wiki_new = r'"text": "=✅ **신규 장르 백과사전 {{ $json.is_update ? \'업데이트\' : \'등록\' }} 완료!**\n\n장르 프리셋 **\'{{ $json.title }}\'**이 Supabase DB와 옵시디언 음악위키(100_Genres & Styles)에 성공적으로 {{ $json.is_update ? \'갱신\' : \'배포 및 기록\' }}되었습니다! 📚🎉\n\n유튜브 트렌드 분석 지식이 NotebookLM에 성공적으로 주입되었습니다.\n\n📊 **옵시디언 위키 보관소 현황**:\n- 📂 음악 장르 (100_Genres & Styles): {{ $json.genres_count }}개\n- 📂 큐레이션 플레이북 (300_Prompts): {{ $json.prompts_count }}개"'
content = content.replace(success_wiki_old, success_wiki_new)

success_approve_old = r'"text": "=✅ **배포 완료!**\n\n프리셋 **\'{{ $json.title }}\'**이 Supabase DB와 옵시디언 큐레이션(300_Prompts) 폴더에 정상 배포되었습니다! 🎉"'
success_approve_new = r'"text": "=✅ **배포 완료!**\n\n프리셋 **\'{{ $json.title }}\'**이 Supabase DB와 옵시디언 큐레이션(300_Prompts) 폴더에 정상 배포되었습니다! 🎉\n\n📊 **옵시디언 위키 보관소 현황**:\n- 📂 음악 장르 (100_Genres & Styles): {{ $json.genres_count }}개\n- 📂 큐레이션 플레이북 (300_Prompts): {{ $json.prompts_count }}개"'
content = content.replace(success_approve_old, success_approve_new)

success_manual_old = r'"text": "=✅ **직접 입력 장르 백과사전 {{ $json.is_update ? \'업데이트\' : \'등록\' }} 완료!**\n\n대표님의 고순도 인사이트 프리셋 **\'{{ $json.title }}\'**이 Supabase DB와 옵시디언 음악위키(100_Genres & Styles)에 성공적으로 {{ $json.is_update ? \'갱신\' : \'배포 및 기록\' }}되었습니다! 📚🎉\n\n**태그**: \`source: User-Insight\` 가 강제 부여되었습니다."'
success_manual_new = r'"text": "=✅ **직접 입력 장르 백과사전 {{ $json.is_update ? \'업데이트\' : \'등록\' }} 완료!**\n\n대표님의 고순도 인사이트 프리셋 **\'{{ $json.title }}\'**이 Supabase DB와 옵시디언 음악위키(100_Genres & Styles)에 성공적으로 {{ $json.is_update ? \'갱신\' : \'배포 및 기록\' }}되었습니다! 📚🎉\n\n**태그**: \`source: User-Insight\` 가 강제 부여되었습니다.\n\n📊 **옵시디언 위키 보관소 현황**:\n- 📂 음악 장르 (100_Genres & Styles): {{ $json.genres_count }}개\n- 📂 큐레이션 플레이북 (300_Prompts): {{ $json.prompts_count }}개"'
content = content.replace(success_manual_old, success_manual_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Patching generate_n8n_workflow.js completed.")
