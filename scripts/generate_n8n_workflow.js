const fs = require('fs');
const path = require('path');

const workflow = {
  "id": "sPOw8LQclffBU0QC",
  "name": "Melodio Telegram Muse Bot Curation",
  "nodes": [
    // 1. Telegram Trigger (converted to Webhook for HTTP activation)
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "telegram-events",
        "options": {}
      },
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 0],
      "id": "telegram-trigger",
      "name": "Telegram Trigger",
      "webhookId": "e5015e12-4c22-421c-a991-f92e5ba6e7b1"
    },
    // 2. Security Filter
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "typeValidation": "loose",
            "version": 3
          },
          "conditions": [
            {
              "id": "security-check",
              "leftValue": "={{ $json.body.message ? $json.body.message.from.id : $json.body.callback_query.from.id }}",
              "rightValue": 814032806,
              "operator": {
                "type": "number",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "type": "n8n-nodes-base.if",
      "typeVersion": 2.3,
      "position": [180, 0],
      "id": "security-filter",
      "name": "Security Filter"
    },
    // 3. Code Router
    {
      "parameters": {
        "jsCode": `const triggerNode = $input.first().json.body;
const chatId = triggerNode.message ? triggerNode.message.from.id : triggerNode.callback_query.from.id;

const fs = require('fs');
const path = require('path');
const dirPath = '/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts';
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}
const stateFile = path.join(dirPath, \`state_\${chatId}.json\`);
let state = null;
let savedCategory = 'curation';
if (fs.existsSync(stateFile)) {
  try {
    const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    state = stateData.state;
    savedCategory = stateData.category || 'curation';
  } catch (e) {}
}

let action = 'invalid';
let payload = {};

if (triggerNode.callback_query) {
  const data = triggerNode.callback_query.data;
  if (data === 'approve_music_set') {
    action = 'approve_set';
  } else if (data === 'cancel') {
    action = 'cancel';
  } else if (data.startsWith('list_genres')) {
    action = 'list_genres';
    const parts = data.split(':');
    payload = { 
      offset: parts[1] ? parseInt(parts[1], 10) : 0,
      category: parts[2] || 'all'
    };
  } else if (data === 'cancel_delete') {
    action = 'cancel_delete';
  } else if (data.startsWith('delete:')) {
    action = 'delete_genre';
    const parts = data.split(':');
    payload = { category: parts[1], key_name: parts[2] };
  }
} else if (triggerNode.message) {
  const text = (triggerNode.message.text || '').trim();
  const lowerText = text.toLowerCase();
  const parts = text.split(' ');
  
  if (lowerText === 'add wiki' || lowerText === '/add_wiki' || lowerText === '/add_wiki(a)' || lowerText === '/wiki(a)') {
    action = 'add_wiki';
  } else if (lowerText === '/wiki(s)' || lowerText === '/add_wiki(s)') {
    action = 'manual_genre_prompt';
  } else if (lowerText === 'add set' || lowerText === '/add_set' || lowerText === '/set') {
    action = 'add_set';
    payload = { category: 'curation' };
  } else if (lowerText === 'add j-set' || lowerText === '/add_j-set' || lowerText === '/j-set' || lowerText === 'j-set') {
    action = 'add_set';
    payload = { category: 'japan' };
  } else if (lowerText === 'delete' || lowerText === '/delete') {
    action = 'list_genres';
    payload = { category: 'all', is_delete_flow: true };
    fs.writeFileSync(stateFile, JSON.stringify({ state: 'AWAITING_DELETE_KEY_NAME' }), 'utf-8');
  } else if (parts[0].toLowerCase() === '/delete' && parts[1]) {
    action = 'delete_genre';
    payload = { key_name: parts[1].trim() };
    if (fs.existsSync(stateFile)) {
      try { fs.unlinkSync(stateFile); } catch (e) {}
    }
  } else if (lowerText.startsWith('/wiki(s)') || lowerText.startsWith('/add_wiki(s)') || lowerText.startsWith('/genre')) {
    let prefixLen = 6; // /genre
    if (lowerText.startsWith('/wiki(s)')) prefixLen = 8;
    else if (lowerText.startsWith('/add_wiki(s)')) prefixLen = 12;
    const rawText = text.substring(prefixLen).trim();
    if (rawText) {
      action = 'manual_genre';
      payload = { text: rawText };
    } else {
      action = 'manual_genre_prompt';
    }
  } else {
    if (state === 'AWAITING_SET_GENRE') {
      action = 'process_set_genre';
      payload = { genre: text, category: savedCategory };
    } else if (state === 'AWAITING_MANUAL_GENRE') {
      action = 'manual_genre';
      payload = { text: text };
    } else if (state === 'AWAITING_DELETE_KEY_NAME') {
      if (lowerText === '취소' || lowerText === '/cancel') {
        action = 'cancel_delete';
      } else {
        action = 'delete_genre';
        payload = { key_name: text };
      }
      if (fs.existsSync(stateFile)) {
        try { fs.unlinkSync(stateFile); } catch (e) {}
      }
    } else {
      action = 'invalid';
    }
  }
}

return { json: { action, chatId, payload, trigger: triggerNode } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [360, 0],
      "id": "code-router",
      "name": "Code Router"
    },
    // 4. Action Switch
    {
      "parameters": {
        "rules": {
          "values": [
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "add_wiki",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "add_set",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "process_set_genre",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "approve_set",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "cancel",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "delete",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "list_genres",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "delete_genre",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "cancel_delete",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "manual_genre",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "manual_genre_prompt",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            },
            {
              "conditions": {
                "options": {
                  "caseSensitive": true,
                  "typeValidation": "loose"
                },
                "conditions": [
                  {
                    "leftValue": "={{ $json.action }}",
                    "rightValue": "invalid",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ],
                "combinator": "and"
              }
            }
          ]
        }
      },
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [540, 0],
      "id": "action-switch",
      "name": "Action Switch"
    },

    // ── BRANCH 0: add_wiki ────────────────────────────────
    {
      "parameters": {
        "method": "GET",
        "url": "https://jfsfxzhunkrjyibsdswb.supabase.co/rest/v1/curation_playbooks?select=key_name,title,category",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpCustomAuth",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [750, -450],
      "id": "wiki-fetch-genres",
      "name": "Wiki Fetch Genres",
      "credentials": {
        "httpCustomAuth": {
          "id": "melodio-supabase-custom-auth",
          "name": "Melodio - Supabase Custom Auth"
        }
      }
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "=우리는 AI 음악 생성에 사용할 음악 장르 백과사전(Music Genre Encyclopedia)을 빌드하고 있습니다.\n\n현재 등록된 장르 목록:\n{{ JSON.stringify($input.all().map(item => item.json)) }}\n\n이 목록에 없는 새로운 음악 장르(또는 세부 서브 장르, 최근 바이럴 트렌드 스타일)를 1개 선정해 주세요.\n절대 중복되지 않아야 하며, 트렌디하거나 깊이 있는 장르여야 합니다.\n\n해당 장르에 대한 정보 수집을 위한 영어 유튜브 검색 쿼리도 같이 작성해 주세요.\n\n출력 형식(반드시 이 형식의 JSON만 출력할 것):\n{\n  \"genre\": \"장르명 (예: Dream Garage, Plugg, Vaporwave)\",\n  \"search_query\": \"유튜브 검색 키워드 (예: Dream Garage electronic music history characteristics)\"\n}",
        "options": {
          "systemMessage": "You are a professional music trend spotter. You output only valid JSON matching the requested schema."
        }
      },
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 1.6,
      "position": [950, -450],
      "id": "wiki-gpt-discover",
      "name": "Wiki GPT Discover"
    },
    {
      "parameters": {
        "jsCode": `const output = $('Wiki GPT Discover').first().json.output;
let parsed = output;
if (typeof output === 'string') {
  let cleaned = output.trim();
  if (cleaned.startsWith('\`\`\`')) {
    cleaned = cleaned.replace(/^\\\`\\\`\\\`(?:json)?\\n/, '').replace(/\\n\\\`\\\`\\\`$/, '');
  }
  parsed = JSON.parse(cleaned.trim());
}
const chatId = $('Code Router').first().json.chatId;
return { json: { genre: parsed.genre, search_query: parsed.search_query, chatId } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1150, -450],
      "id": "wiki-parse-discovery",
      "name": "Wiki Parse Discovery"
    },
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=🔍 **신규 트렌디 장르 발굴**\n\n*   **발굴 장르**: **{{ $json.genre }}**\n*   **검색 키워드**: `{{ $json.search_query }}`\n\n유튜브에서 최신 음악 분석 정보를 크롤링하여 NotebookLM 지식 베이스를 갱신 중입니다... (약 20초 소요)",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1350, -450],
      "id": "wiki-send-status",
      "name": "Wiki Send Status",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "method": "GET",
        "url": "=http://host.docker.internal:3001/api/youtube?action=search_videos&q={{ encodeURIComponent($node[\"Wiki Parse Discovery\"].json.search_query) }}&maxResults=5",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [1550, -450],
      "id": "wiki-yt-crawl",
      "name": "Wiki YouTube Crawl"
    },
    {
      "parameters": {
        "jsCode": `const videos = $input.first().json.videos || [];
const discovery = $('Wiki Parse Discovery').first().json;

let docText = \`# Music Genre Trend Analysis: \${discovery.genre}
Gathered search query: \${discovery.search_query}

\`;

videos.forEach((v, idx) => {
  docText += \`## Video \${idx + 1}: \${v.title}
Channel: \${v.channelTitle}
Description: \${v.description}
Tags: \${(v.tags || []).join(', ')}

\`;
});

return { json: { text: docText, title: \`\${discovery.genre} Trend Source\`, notebookId: "16216b66-3584-4565-b568-77648ab8f20f", chatId: discovery.chatId, genre: discovery.genre } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1750, -450],
      "id": "wiki-aggregate-yt",
      "name": "Wiki Aggregate YouTube"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "=http://host.docker.internal:3001/api/autopilot/query-notebooklm",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({\n  \"notebookId\": $json.notebookId,\n  \"action\": \"add_text\",\n  \"text\": $json.text,\n  \"title\": $json.title\n}) }}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [1950, -450],
      "id": "wiki-add-notebook-source",
      "name": "Wiki Add Notebook Source",
      "credentials": {
        "httpHeaderAuth": {
          "id": "melodio-supabase-key",
          "name": "Melodio - Supabase Key"
        }
      }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "=http://host.docker.internal:3001/api/autopilot/query-notebooklm",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({\n  \"notebookId\": $node[\"Wiki Aggregate YouTube\"].json.notebookId,\n  \"action\": \"query\",\n  \"query\": \"다음 음악 장르에 대한 역사, 대표 악기, 템포(BPM), Suno AI용 프롬프트 태그(suno_tags), 어울리는 이미지 앨범 커버용 프롬프트(logo_prompt), 음악적 무드를 정리해줘: \" + $node[\"Wiki Aggregate YouTube\"].json.genre\n}) }}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [2150, -450],
      "id": "wiki-query-notebook",
      "name": "Wiki Query Notebook",
      "credentials": {
        "httpHeaderAuth": {
          "id": "melodio-supabase-key",
          "name": "Melodio - Supabase Key"
        }
      }
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "=NotebookLM이 분석한 최신 트렌드 지식을 바탕으로 아래 장르에 대한 최상의 음악 백과사전(Playbook) 데이터를 JSON 포맷으로 생성해주세요.\n\n장르명: {{ $node[\"Wiki Aggregate YouTube\"].json.genre }}\n\nNotebookLM 분석 정보:\n{{ $node[\"Wiki Query Notebook\"].json.data }}\n\n출력 스키마:\n{\n  \"category\": \"genre\",\n  \"key_name\": \"영문 소문자 및 하이픈 구조의 키명 (예: dream-garage)\",\n  \"title\": \"장르명 (한글명) (예: 드림 개러지 (Dream Garage))\",\n  \"content\": \"## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n...\\n\\n## 🚀 채널 운영 전략\\n...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n...\\n\\n## 🎵 음악적 특징\\n...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n...\",\n  \"metadata\": {\n    \"bpm_range\": \"예: 120-130\",\n    \"sub_genres\": \"예: [Outrun, Cyberpunk] (배열 구조 또는 콤마로 구분된 문자열)\",\n    \"suno_tags\": \"Suno AI에 입력할 최적의 쉼표 구분 스타일 태그들 (예: 1980s retro-futuristic, neon-lit, warm analog saturation)\",\n    \"audio_engineering\": \"Suno/Udio 음질 극대화를 위한 엔지니어링 믹싱/마스터링 용어들 (예: High-fidelity, modern mastering, sidechain compression, 80s gated reverb on snare)\",\n    \"instruments\": \"사용 악기들\",\n    \"moods\": \"무드 단어들\",\n    \"logo_prompt\": \"이 장르 음악에 어울리는 최적의 1:1 이미지 생성용 영문 프롬프트\"\n  }\n}",
        "options": {
          "systemMessage": "You are a professional music curator and database engineer. You output only clean JSON playbooks following the strict schema requested."
        }
      },
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 1.6,
      "position": [2350, -450],
      "id": "wiki-gpt-playbook",
      "name": "Wiki GPT Playbook"
    },
    {
      "parameters": {
        "jsCode": `const output = $('Wiki GPT Playbook').first().json.output;
let playbook = output;
if (typeof output === 'string') {
  let cleaned = output.trim();
  if (cleaned.startsWith('\`\`\`')) {
    cleaned = cleaned.replace(/^\\\`\\\`\\\`(?:json)?\\n/, '').replace(/\\n\\\`\\\`\\\`$/, '');
  }
  playbook = JSON.parse(cleaned.trim());
}
const chatId = $('Wiki Aggregate YouTube').first().json.chatId;
return { json: { ...playbook, chatId } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2550, -450],
      "id": "wiki-parse-playbook",
      "name": "Wiki Parse Playbook"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://jfsfxzhunkrjyibsdswb.supabase.co/rest/v1/curation_playbooks?on_conflict=key_name",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpCustomAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" },
            { "name": "Prefer", "value": "resolution=merge-duplicates" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({\n  \"category\": $json.category,\n  \"key_name\": $json.key_name,\n  \"title\": $json.title,\n  \"content\": $json.content,\n  \"metadata\": $json.metadata,\n  \"updated_at\": new Date().toISOString()\n}) }}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [2750, -450],
      "id": "wiki-supabase-upsert",
      "name": "Wiki Supabase Upsert",
      "credentials": {
        "httpCustomAuth": {
          "id": "melodio-supabase-custom-auth",
          "name": "Melodio - Supabase Custom Auth"
        }
      }
    },
    {
      "parameters": {
        "jsCode": `const fs = require('fs');
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
  const imgRes = await fetch(\`\${siteUrl}/api/autopilot/generate-image\`, {
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

const mdContent = \`--- 
category: \${category}
key_name: \${key_name}
title: \${title}
bpm_range: \${bpm_range}
sub_genres: \${sub_genres}
suno_tags: \${suno_tags}
audio_engineering: \${audio_engineering}
instruments: \${instruments}
moods: \${moods}
logo_prompt: \${logo_prompt}
thumbnail_url: \${thumbnail_url}
rendering_version: 2026_Latest
source: \${category === 'genre' ? (is_manual ? 'User-Insight' : 'YouTube_Trend') : 'Curation'}
---
# \${title}

\${content}
\`;

const folderName = (category === 'curation' || category === 'japan') ? '300_Prompts' : '100_Genres & Styles';
const dirPath = path.join('/data/vault/04_Context/Melodio', folderName);
const filePath = path.join(dirPath, \`\${key_name}.md\`);
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
    const titleMatch = content.match(/^title:\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    genreLinks.push(\`- [[\${key}|\${title}]]\`);
  });
}
genreLinks.sort();

let promptLinks = [];
if (fs.existsSync(promptsDir)) {
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const filePath = path.join(promptsDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^title:\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    promptLinks.push(\`- [[\${key}|\${title}]]\`);
  });
}
promptLinks.sort();

const dashboardContent = \`# 🗺️ Melodio Master Dashboard

## 📂 100_Genres & Styles (음악 장르 백과사전)
\\\${genreLinks.length > 0 ? genreLinks.join('\\n') : '- 등록된 장르가 없습니다.'}

## 📂 300_Prompts (큐레이션 플레이북)
\\\${promptLinks.length > 0 ? promptLinks.join('\\n') : '- 등록된 플레이북이 없습니다.'}
\`;

fs.writeFileSync(path.join(mocsDir, 'Dashboard.md'), dashboardContent, 'utf-8');

return {
  success: true,
  file_written: filePath,
  is_update: fileExists,
  chatId: playbook.chatId,
  title: playbook.title,
  genres_count: genreLinks.length,
  prompts_count: promptLinks.length
};`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2950, -450],
      "id": "wiki-write-obsidian",
      "name": "Wiki Write Obsidian"
    },
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=✅ **신규 장르 백과사전 {{ $json.is_update ? '업데이트' : '등록' }} 완료!**\n\n장르 프리셋 **'{{ $json.title }}'**이 Supabase DB와 옵시디언 음악위키(100_Genres & Styles)에 성공적으로 {{ $json.is_update ? '갱신' : '배포 및 기록' }}되었습니다! 📚🎉\n\n유튜브 트렌드 분석 지식이 NotebookLM에 성공적으로 주입되었습니다.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [3150, -450],
      "id": "wiki-send-success",
      "name": "Wiki Send Success",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },

    // ── BRANCH 1: add_set ────────────────────────────────
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=추가하실 음악 장르 또는 컨셉을 입력해 주시면 바로 '{{ $('Code Router').first().json.payload.category === 'japan' ? '일본 특화 BGM 프리셋' : '일반 프리셋' }}'으로 등록해 드리겠습니다. 시간은 약 30초 정도 걸립니다.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [750, -250],
      "id": "set-prompt-genre",
      "name": "Set Prompt Genre",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "jsCode": `const fs = require('fs');
const path = require('path');
const chatId = $('Code Router').first().json.chatId;
const category = $('Code Router').first().json.payload.category || 'curation';

const dirPath = '/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts';
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}
const stateFile = path.join(dirPath, \`state_\${chatId}.json\`);
fs.writeFileSync(stateFile, JSON.stringify({ state: 'AWAITING_SET_GENRE', category }), 'utf-8');

return { json: { success: true, chatId } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [950, -250],
      "id": "set-write-state",
      "name": "Set Write State"
    },

    // ── BRANCH 2: process_set_genre ──────────────────────
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=🤖 Melodio Muse가 NotebookLM 지식을 기반으로 장르 및 컨셉 프리셋 초안을 작성 중입니다... (약 30초 소요)",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [750, -50],
      "id": "set-send-status",
      "name": "Set Send Status",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "jsCode": `const fs = require('fs');
const path = require('path');
const chatId = $('Code Router').first().json.chatId;

const dirPath = '/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts';
const stateFile = path.join(dirPath, \`state_\${chatId}.json\`);
if (fs.existsSync(stateFile)) {
  fs.unlinkSync(stateFile);
}

return { json: { success: true, chatId, genre: $('Code Router').first().json.payload.genre, category: $('Code Router').first().json.payload.category || 'curation' } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [950, -50],
      "id": "set-clear-state",
      "name": "Set Clear State"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "=http://host.docker.internal:3001/api/autopilot/query-notebooklm",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({\n  \"notebookId\": \"16216b66-3584-4565-b568-77648ab8f20f\",\n  \"action\": \"query\",\n  \"query\": \"다음 음악 장르 또는 음악적 컨셉에 대한 역사, 대표 악기, 템포(BPM), Suno AI용 프롬프트 태그(suno_tags), 어울리는 이미지 앨범 커버용 프롬프트(logo_prompt), 음악적 무드를 정리해줘: \" + $node[\"Set Clear State\"].json.genre\n}) }}",
        "options": {
          "timeout": 120000
        }
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [1150, -50],
      "id": "set-query-notebook",
      "name": "Set Query Notebook",
      "credentials": {
        "httpHeaderAuth": {
          "id": "melodio-supabase-key",
          "name": "Melodio - Supabase Key"
        }
      }
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "=NotebookLM이 분석한 음악 지식을 바탕으로 아래 장르에 대한 최상의 음악 큐레이션 플레이북 데이터를 JSON 포맷으로 생성해주세요.\n\n장르명: {{ $node[\"Set Clear State\"].json.genre }}\n\nNotebookLM 분석 정보:\n{{ $node[\"Set Query Notebook\"].json.data }}\n\n출력 스키마:\n{\n  \"category\": \"curation\",\n  \"key_name\": \"영문 소문자 및 하이픈 구조의 키명 (예: joseon-hiphop)\",\n  \"title\": \"장르명 (한글명) (예: 조선힙합 (Joseon Hip Hop))\",\n  \"content\": \"## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n...\\n\\n## 🚀 채널 운영 전략\\n...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n...\\n\\n## 🎵 음악적 특징\\n...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n...\",\n  \"metadata\": {\n    \"bpm_range\": \"예: 90-110\",\n    \"sub_genres\": \"예: [Outrun, Cyberpunk] (배열 구조 또는 콤마로 구분된 문자열)\",\n    \"suno_tags\": \"Suno AI에 입력할 최적의 쉼표 구분 스타일 태그들 (예: 1980s retro-futuristic, neon-lit, warm analog saturation)\",\n    \"audio_engineering\": \"Suno/Udio 음질 극대화를 위한 엔지니어링 믹싱/마스터링 용어들 (예: High-fidelity, modern mastering, sidechain compression, 80s gated reverb on snare)\",\n    \"instruments\": \"사용 악기들\",\n    \"moods\": \"무드 단어들\",\n    \"logo_prompt\": \"이 장르 음악에 어울리는 최적의 1:1 이미지 생성용 영문 프롬프트\"\n  }\n}",
        "options": {
          "systemMessage": "You are a professional music curator and database engineer. You output only clean JSON playbooks following the strict schema requested."
        }
      },
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 1.6,
      "position": [1350, -50],
      "id": "set-gpt-playbook",
      "name": "Set GPT Playbook"
    },
    {
      "parameters": {
        "jsCode": `const output = $('Set GPT Playbook').first().json.output;
let playbook = output;
if (typeof output === 'string') {
  let cleaned = output.trim();
  if (cleaned.startsWith('\`\`\`')) {
    cleaned = cleaned.replace(/^\\\`\\\`\\\`(?:json)?\\n/, '').replace(/\\n\\\`\\\`\\\`$/, '');
  }
  playbook = JSON.parse(cleaned.trim());
}
const chatId = $('Set Clear State').first().json.chatId;
const category = $('Set Clear State').first().json.category || 'curation';
return { json: { ...playbook, category, chatId } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1550, -50],
      "id": "set-parse-playbook",
      "name": "Set Parse Playbook"
    },
    {
      "parameters": {
        "jsCode": `const fs = require('fs');
const path = require('path');

const triggerNode = $('Code Router').first().json;
const chatId = triggerNode.chatId;
const playbook = $('Set Parse Playbook').first().json;

const dirPath = '/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts';
if (!fs.existsSync(dirPath)) {
  fs.mkdirSync(dirPath, { recursive: true });
}

const cacheFile = path.join(dirPath, \`draft_\${chatId}.json\`);
fs.writeFileSync(cacheFile, JSON.stringify(playbook, null, 2), 'utf-8');

return { 
  json: { 
    success: true, 
    chatId, 
    playbook 
  } 
};`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1750, -50],
      "id": "set-save-cache",
      "name": "Set Save Cache"
    },
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=📝 **Melodio Muse - 장르 및 컨셉 프리셋 초안**\n\n*   **장르 및 컨셉명**: {{ $json.playbook.title }}\n*   **Key Name**: `{{ $json.playbook.key_name }}`\n*   **BPM 범위**: `{{ $json.playbook.metadata.bpm_range }}`\n*   **Suno 태그**: `{{ $json.playbook.metadata.suno_tags }}`\n\n**💡 핵심 컨셉**:\n{{ $json.playbook.content.split('\\n\\n').find(p => p.includes('## 💡 핵심 컨셉')) || '상세 보기 확인' }}\n\n해당 장르 및 컨셉 프리셋을 서비스 데이터베이스 및 옵시디언 큐레이션 폴더에 배포할까요?",
        "replyMarkup": "inlineKeyboard",
        "inlineKeyboard": "={{ JSON.stringify({ rows: [ { buttons: [ { text: '👍 승인 및 배포', callback_data: 'approve_music_set' }, { text: '❌ 취소', callback_data: 'cancel' } ] } ] }) }}",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1950, -50],
      "id": "set-send-preview",
      "name": "Set Send Preview",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },

    // ── BRANCH 3: approve_set ───────────────────────────
    {
      "parameters": {
        "jsCode": `const fs = require('fs');
const path = require('path');

const triggerNode = $('Code Router').first().json;
const chatId = triggerNode.chatId;

const dirPath = '/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts';
const cacheFile = path.join(dirPath, \`draft_\${chatId}.json\`);

if (!fs.existsSync(cacheFile)) {
  throw new Error('보류 중인 프리셋 초안을 찾을 수 없습니다.');
}

const playbook = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
playbook.category = 'curation';
return { json: { ...playbook, chatId } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [750, 150],
      "id": "approve-read-cache",
      "name": "Approve Read Cache"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://jfsfxzhunkrjyibsdswb.supabase.co/rest/v1/curation_playbooks?on_conflict=key_name",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpCustomAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" },
            { "name": "Prefer", "value": "resolution=merge-duplicates" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({\n  \"category\": $json.category,\n  \"key_name\": $json.key_name,\n  \"title\": $json.title,\n  \"content\": $json.content,\n  \"metadata\": $json.metadata,\n  \"updated_at\": new Date().toISOString()\n}) }}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [950, 150],
      "id": "approve-supabase-upsert",
      "name": "Approve Supabase Upsert",
      "credentials": {
        "httpCustomAuth": {
          "id": "melodio-supabase-custom-auth",
          "name": "Melodio - Supabase Custom Auth"
        }
      }
    },
    {
      "parameters": {
        "jsCode": `const fs = require('fs');
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
  const imgRes = await fetch(\`\${siteUrl}/api/autopilot/generate-image\`, {
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

const mdContent = \`--- 
category: \${category}
key_name: \${key_name}
title: \${title}
bpm_range: \${bpm_range}
sub_genres: \${sub_genres}
suno_tags: \${suno_tags}
audio_engineering: \${audio_engineering}
instruments: \${instruments}
moods: \${moods}
logo_prompt: \${logo_prompt}
thumbnail_url: \${thumbnail_url}
rendering_version: 2026_Latest
source: \${category === 'genre' ? (is_manual ? 'User-Insight' : 'YouTube_Trend') : 'Curation'}
---
# \${title}

\${content}
\`;

const folderName = (category === 'curation' || category === 'japan') ? '300_Prompts' : '100_Genres & Styles';
const dirPath = path.join('/data/vault/04_Context/Melodio', folderName);
const filePath = path.join(dirPath, \`\${key_name}.md\`);
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
    const titleMatch = content.match(/^title:\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    genreLinks.push(\`- [[\${key}|\${title}]]\`);
  });
}
genreLinks.sort();

let promptLinks = [];
if (fs.existsSync(promptsDir)) {
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const filePath = path.join(promptsDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^title:\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    promptLinks.push(\`- [[\${key}|\${title}]]\`);
  });
}
promptLinks.sort();

const dashboardContent = \`# 🗺️ Melodio Master Dashboard

## 📂 100_Genres & Styles (음악 장르 백과사전)
\\\${genreLinks.length > 0 ? genreLinks.join('\\n') : '- 등록된 장르가 없습니다.'}

## 📂 300_Prompts (큐레이션 플레이북)
\\\${promptLinks.length > 0 ? promptLinks.join('\\n') : '- 등록된 플레이북이 없습니다.'}
\`;

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
};`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1150, 150],
      "id": "approve-write-obsidian",
      "name": "Approve Write Obsidian"
    },
    {
      "parameters": {
        "jsCode": `const fs = require('fs');
const path = require('path');

const chatId = $('Code Router').first().json.chatId;

const dirPath = '/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts';
const cacheFile = path.join(dirPath, \`draft_\${chatId}.json\`);

if (fs.existsSync(cacheFile)) {
  fs.unlinkSync(cacheFile);
}

return { json: $('Approve Write Obsidian').first().json };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1350, 150],
      "id": "approve-delete-cache",
      "name": "Approve Delete Cache"
    },
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=✅ **배포 완료!**\n\n프리셋 **'{{ $json.title }}'**이 Supabase DB와 옵시디언 큐레이션(300_Prompts) 폴더에 정상 배포되었습니다! 🎉",
        "replyMarkup": "inlineKeyboard",
        "inlineKeyboard": "={{ { rows: [ { buttons: [ { text: '🗑️ 장르 즉시 삭제', callback_data: 'delete:' + $json.category + ':' + $json.key_name } ] } ] } }}",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1550, 150],
      "id": "approve-send-success",
      "name": "Approve Send Success",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "chatId": "={{ $('Code Router').first().json.chatId }}",
        "text": "프리셋 배포에 성공했습니다!",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1750, 150],
      "id": "approve-answer-query",
      "name": "Approve Answer Query",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },

    // ── BRANCH 4: cancel ────────────────────────────────
    {
      "parameters": {
        "jsCode": `const fs = require('fs');
const path = require('path');
const chatId = $('Code Router').first().json.chatId;

const dirPath = '/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts';
const cacheFile = path.join(dirPath, \`state_\${chatId}.json\`);
if (fs.existsSync(cacheFile)) {
  fs.unlinkSync(cacheFile);
}
return { json: { success: true, chatId } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [750, 350],
      "id": "cancel-delete-cache",
      "name": "Cancel Delete Cache"
    },
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "❌ 프리셋 생성이 취소되었습니다. 캐시를 비웠습니다.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [950, 350],
      "id": "cancel-send-message",
      "name": "Cancel Send Message",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "chatId": "={{ $('Code Router').first().json.chatId }}",
        "text": "취소 완료되었습니다.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1150, 350],
      "id": "cancel-answer-query",
      "name": "Cancel Answer Query",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },

    // ── BRANCH 5: delete_prompt ──────────────────────────
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "🗑️ **삭제하실 프리셋의 영문 키명(key_name)을 입력해 주세요:**\n(예: `rainy-day-enka`, `deep-house`)\n\n취소하려면 `취소` 또는 `/cancel`을 입력해 주세요.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [750, 550],
      "id": "delete-send-prompt",
      "name": "Delete Send Prompt",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    // ── BRANCH 6: list_genres ───────────────────────────
    {
      "parameters": {
        "method": "GET",
        "url": "=https://jfsfxzhunkrjyibsdswb.supabase.co/rest/v1/curation_playbooks?select=key_name,title,category&order=updated_at.desc&limit=9&offset={{ $json.payload.offset || 0 }}{{ $json.payload.category && $json.payload.category !== 'all' ? '&category=eq.' + $json.payload.category : '' }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpCustomAuth",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [750, 750],
      "id": "list-fetch-genres",
      "name": "List Fetch Genres",
      "credentials": {
        "httpCustomAuth": {
          "id": "melodio-supabase-custom-auth",
          "name": "Melodio - Supabase Custom Auth"
        }
      }
    },
    {
      "parameters": {
        "jsCode": `const list = $input.all();
const router = $('Code Router').first().json;
const offset = router.payload.offset || 0;
const category = router.payload.category || 'all';
const chatId = router.chatId;

const displayLimit = 8;
const hasMore = list.length > displayLimit;
const pageItems = list.slice(0, displayLimit);

let categoryLabel = '콘텐츠';
if (category === 'curation') categoryLabel = '일반 장르 프리셋 (Set)';
else if (category === 'japan') categoryLabel = '일본 특화 BGM 프리셋 (J-Set)';
else if (category === 'genre') categoryLabel = '스타일 라이브러리 백과사전 (Wiki)';

let text = \`📂 **삭제하실 \${categoryLabel}을 아래 목록에서 선택해 주세요:**\\n*(한 페이지에 최대 8개씩 표시됩니다)*\`;
const keyboard = [];

// Add items
pageItems.forEach((item) => {
  const data = item.json;
  let typeLabel = 'Wiki';
  if (data.category === 'curation') typeLabel = 'Set';
  else if (data.category === 'japan') typeLabel = 'J-Set';
  
  keyboard.push([
    {
      text: \`🗑️ [\${typeLabel}] \${data.title} (\${data.key_name})\`,
      callback_data: \`delete:\${data.category}:\${data.key_name}\`
    }
  ]);
});

// Add navigation row if offset > 0 or hasMore is true
const navRow = [];
if (offset > 0) {
  navRow.push({
    text: "⬅️ 이전 페이지",
    callback_data: \`list_genres:\${Math.max(0, offset - displayLimit)}:\${category}\`
  });
}
if (hasMore) {
  navRow.push({
    text: "➕ 더보기",
    callback_data: \`list_genres:\${offset + displayLimit}:\${category}\`
  });
}

if (navRow.length > 0) {
  keyboard.push(navRow);
}

// Cancel button row
keyboard.push([{
  text: "❌ 취소",
  callback_data: "cancel_delete"
}]);

const rows = keyboard.map(row => ({ buttons: row }));
return { json: { text, keyboard: { rows }, chatId } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [950, 750],
      "id": "list-format-data",
      "name": "List Format Data"
    },
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "={{ $json.text }}",
        "replyMarkup": "inlineKeyboard",
        "inlineKeyboard": "={{ { rows: $json.keyboard.rows } }}",
        "additionalFields": {
          "parse_mode": "Markdown"
        }
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1150, 750],
      "id": "list-send-telegram",
      "name": "List Send Telegram",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "chatId": "={{ $('Code Router').first().json.chatId }}",
        "text": "장르 목록을 조회했습니다.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1350, 750],
      "id": "list-answer-query",
      "name": "List Answer Query",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },

    // ── BRANCH 7: delete_genre ──────────────────────────
    {
      "parameters": {
        "method": "DELETE",
        "url": "=https://jfsfxzhunkrjyibsdswb.supabase.co/rest/v1/curation_playbooks?key_name=eq.{{ $json.payload.key_name }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpCustomAuth",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [750, 950],
      "id": "delete-supabase-call",
      "name": "Delete Supabase Call",
      "credentials": {
        "httpCustomAuth": {
          "id": "melodio-supabase-custom-auth",
          "name": "Melodio - Supabase Custom Auth"
        }
      }
    },
    {
      "parameters": {
        "jsCode": `const fs = require('fs');
const path = require('path');
const router = $('Code Router').first().json;
const payload = router.payload;

let filePath = path.join('/data/vault/04_Context/Melodio/100_Genres & Styles', \`\${payload.key_name}.md\`);
if (!fs.existsSync(filePath)) {
  filePath = path.join('/data/vault/04_Context/Melodio/300_Prompts', \`\${payload.key_name}.md\`);
}

if (fs.existsSync(filePath)) {
  fs.unlinkSync(filePath);
}

return { json: { success: true, key_name: payload.key_name, chatId: router.chatId } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [950, 950],
      "id": "delete-obsidian-file",
      "name": "Delete Obsidian File"
    },
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=🗑️ **삭제 완료!**\n\n장르 프리셋 **'{{ $json.key_name }}'**이 Supabase DB와 옵시디언에서 완전히 삭제되었습니다.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1150, 950],
      "id": "delete-send-success",
      "name": "Delete Send Success",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "chatId": "={{ $('Code Router').first().json.chatId }}",
        "text": "장르가 완전히 삭제되었습니다.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1350, 950],
      "id": "delete-answer-query",
      "name": "Delete Answer Query",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },

    // ── BRANCH 8: cancel_delete ─────────────────────────
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "❌ 취소가 완료 되었습니다.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [750, 1150],
      "id": "cancel-delete-send-message",
      "name": "Cancel Delete Send Message",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "chatId": "={{ $('Code Router').first().json.chatId }}",
        "text": "삭제 작업이 취소되었습니다.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [950, 1150],
      "id": "cancel-delete-answer-query",
      "name": "Cancel Delete Answer Query",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },

    // ── BRANCH 9: invalid ───────────────────────────────
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=⚠️ 하단의 메뉴 버튼(/Wiki(A), /Wiki(S), /Set, /Delete)을 먼저 클릭하고 진행해 주세요.\n\nThis message was sent automatically with n8n",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [750, 1350],
      "id": "invalid-send-message",
      "name": "Invalid Send Message",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    // ── BRANCH 10: manual_genre ─────────────────────────
    {
      "parameters": {
        "promptType": "define",
        "text": "=대표님이 직접 입력한 신규 장르/사운드 특징에 대한 유튜브 검색 쿼리와 정리된 영문/한글 혼합 장르명을 작성해 주세요.\n\n입력 내용: {{ $('Code Router').first().json.payload.text }}\n\n출력 형식(반드시 이 형식의 JSON만 출력할 것):\n{\n  \"genre\": \"장르명 (예: Dream Garage, Plugg, Vaporwave)\",\n  \"search_query\": \"유튜브 검색 키워드 (예: Dream Garage electronic music history characteristics)\"\n}",
        "options": {
          "systemMessage": "You are a professional music trend spotter. You output only valid JSON matching the requested schema."
        }
      },
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 1.6,
      "position": [750, 1550],
      "id": "manual-gpt-query",
      "name": "Manual GPT Query"
    },
    {
      "parameters": {
        "jsCode": `const output = $('Manual GPT Query').first().json.output;
let parsed = output;
if (typeof output === 'string') {
  let cleaned = output.trim();
  if (cleaned.startsWith('\`\`\`')) {
    cleaned = cleaned.replace(/^\\\`\\\`\\\`(?:json)?\\n/, '').replace(/\\n\\\`\\\`\\\`$/, '');
  }
  parsed = JSON.parse(cleaned.trim());
}
const chatId = $('Code Router').first().json.chatId;

// Clear the manual input state
const fs = require('fs');
const path = require('path');
const dirPath = '/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts';
const stateFile = path.join(dirPath, \`state_\${chatId}.json\`);
if (fs.existsSync(stateFile)) {
  try {
    fs.unlinkSync(stateFile);
  } catch (e) {}
}

return { json: { genre: parsed.genre, search_query: parsed.search_query, chatId } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [950, 1550],
      "id": "manual-parse-query",
      "name": "Manual Parse Query"
    },
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=🔍 **신규 직접 장르 등록 시작**\n\n*   **입력 장르**: **{{ $json.genre }}**\n*   **검색 키워드**: `{{ $json.search_query }}`\n\n유튜브에서 최신 음악 분석 정보를 크롤링하여 NotebookLM 지식 베이스를 갱신 중입니다... (약 20초 소요)",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1150, 1550],
      "id": "manual-send-status",
      "name": "Manual Send Status",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "method": "GET",
        "url": "=http://host.docker.internal:3001/api/youtube?action=search_videos&q={{ encodeURIComponent($node[\"Manual Parse Query\"].json.search_query) }}&maxResults=5",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [1350, 1550],
      "id": "manual-yt-crawl",
      "name": "Manual YouTube Crawl"
    },
    {
      "parameters": {
        "jsCode": `const videos = $input.first().json.videos || [];
const discovery = $('Manual Parse Query').first().json;

let docText = \`# Music Genre Trend Analysis: \${discovery.genre}
Gathered search query: \${discovery.search_query}

\`;

videos.forEach((v, idx) => {
  docText += \`## Video \${idx + 1}: \${v.title}
Channel: \${v.channelTitle}
Description: \${v.description}
Tags: \${(v.tags || []).join(', ')}

\`;
});

return { json: { text: docText, title: \`\${discovery.genre} Trend Source\`, notebookId: "16216b66-3584-4565-b568-77648ab8f20f", chatId: discovery.chatId, genre: discovery.genre } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1550, 1550],
      "id": "manual-aggregate-yt",
      "name": "Manual Aggregate YouTube"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "=http://host.docker.internal:3001/api/autopilot/query-notebooklm",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({\n  \"notebookId\": $json.notebookId,\n  \"action\": \"add_text\",\n  \"text\": $json.text,\n  \"title\": $json.title\n}) }}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [1750, 1550],
      "id": "manual-add-notebook-source",
      "name": "Manual Add Notebook Source",
      "credentials": {
        "httpHeaderAuth": {
          "id": "melodio-supabase-key",
          "name": "Melodio - Supabase Key"
        }
      }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "=http://host.docker.internal:3001/api/autopilot/query-notebooklm",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({\n  \"notebookId\": $node[\"Manual Aggregate YouTube\"].json.notebookId,\n  \"action\": \"query\",\n  \"query\": \"다음 음악 장르에 대한 역사, 대표 악기, 템포(BPM), Suno AI용 프롬프트 태그(suno_tags), 어울리는 이미지 앨범 커버용 프롬프트(logo_prompt), 음악적 무드를 정리해줘: \" + $node[\"Manual Aggregate YouTube\"].json.genre\n}) }}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [1950, 1550],
      "id": "manual-query-notebook",
      "name": "Manual Query Notebook",
      "credentials": {
        "httpHeaderAuth": {
          "id": "melodio-supabase-key",
          "name": "Melodio - Supabase Key"
        }
      }
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "=NotebookLM이 분석한 최신 트렌드 지식을 바탕으로 아래 장르에 대한 최상의 음악 백과사전(Playbook) 데이터를 JSON 포맷으로 생성해주세요.\n\n장르명: {{ $node[\"Manual Aggregate YouTube\"].json.genre }}\n\nNotebookLM 분석 정보:\n{{ $node[\"Manual Query Notebook\"].json.data }}\n\n출력 스키마:\n{\n  \"category\": \"genre\",\n  \"key_name\": \"영문 소문자 및 하이픈 구조의 키명 (예: dream-garage)\",\n  \"title\": \"장르명 (한글명) (예: 드림 개러지 (Dream Garage))\",\n  \"content\": \"## 📊 채널 적합성 및 예상 평점\\n- 예상 평점: X/10\\n- 분석: ...\\n\\n## 💡 핵심 컨셉\\n...\\n\\n## 🚀 채널 운영 전략\\n...\\n\\n## 🏷️ 추천 브랜드명 & 핸들\\n...\\n\\n## 🎵 음악적 특징\\n...\\n\\n## ✍️ 가사 테마 및 은유 가이드\\n...\",\n  \"metadata\": {\n    \"bpm_range\": \"예: 120-130\",\n    \"sub_genres\": \"예: [Outrun, Cyberpunk] (배열 구조 또는 콤마로 구분된 문자열)\",\n    \"suno_tags\": \"Suno AI에 입력할 최적의 쉼표 구분 스타일 태그들 (예: 1980s retro-futuristic, neon-lit, warm analog saturation)\",\n    \"audio_engineering\": \"Suno/Udio 음질 극대화를 위한 엔지니어링 믹싱/마스터링 용어들 (예: High-fidelity, modern mastering, sidechain compression, 80s gated reverb on snare)\",\n    \"instruments\": \"사용 악기들\",\n    \"moods\": \"무드 단어들\",\n    \"logo_prompt\": \"이 장르 음악에 어울리는 최적의 1:1 이미지 생성용 영문 프롬프트\"\n  }\n}",
        "options": {
          "systemMessage": "You are a professional music curator and database engineer. You output only clean JSON playbooks following the strict schema requested."
        }
      },
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 1.6,
      "position": [2150, 1550],
      "id": "manual-gpt-playbook",
      "name": "Manual GPT Playbook"
    },
    {
      "parameters": {
        "jsCode": `const output = $('Manual GPT Playbook').first().json.output;
let playbook = output;
if (typeof output === 'string') {
  let cleaned = output.trim();
  if (cleaned.startsWith('\`\`\`')) {
    cleaned = cleaned.replace(/^\\\`\\\`\\\`(?:json)?\\n/, '').replace(/\\n\\\`\\\`\\\`$/, '');
  }
  playbook = JSON.parse(cleaned.trim());
}
const chatId = $('Manual Aggregate YouTube').first().json.chatId;

// source: User_Insight 태그 강제화
playbook.metadata = {
  ...playbook.metadata,
  source: 'User_Insight'
};

return { json: { ...playbook, chatId } };`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2350, 1550],
      "id": "manual-parse-playbook",
      "name": "Manual Parse Playbook"
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://jfsfxzhunkrjyibsdswb.supabase.co/rest/v1/curation_playbooks?on_conflict=key_name",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpCustomAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Content-Type",
              "value": "application/json"
            },
            {
              "name": "Prefer",
              "value": "resolution=merge-duplicates"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({\n  \"category\": $json.category,\n  \"key_name\": $json.key_name,\n  \"title\": $json.title,\n  \"content\": $json.content,\n  \"metadata\": $json.metadata,\n  \"updated_at\": new Date().toISOString()\n}) }}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.1,
      "position": [2550, 1550],
      "id": "manual-supabase-upsert",
      "name": "Manual Supabase Upsert",
      "credentials": {
        "httpCustomAuth": {
          "id": "melodio-supabase-custom-auth",
          "name": "Melodio - Supabase Custom Auth"
        }
      }
    },
    {
      "parameters": {
        "jsCode": `const fs = require('fs');
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
  const imgRes = await fetch(\`\${siteUrl}/api/autopilot/generate-image\`, {
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

const mdContent = \`--- 
category: \${category}
key_name: \${key_name}
title: \${title}
bpm_range: \${bpm_range}
sub_genres: \${sub_genres}
suno_tags: \${suno_tags}
audio_engineering: \${audio_engineering}
instruments: \${instruments}
moods: \${moods}
logo_prompt: \${logo_prompt}
thumbnail_url: \${thumbnail_url}
rendering_version: 2026_Latest
source: \${category === 'genre' ? 'User-Insight' : 'Curation'}
---
# \${title}

\${content}
\`;

const folderName = (category === 'curation' || category === 'japan') ? '300_Prompts' : '100_Genres & Styles';
const dirPath = path.join('/data/vault/04_Context/Melodio', folderName);
const filePath = path.join(dirPath, \`\${key_name}.md\`);
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
    const titleMatch = content.match(/^title:\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    genreLinks.push(\`- [[\${key}|\${title}]]\`);
  });
}
genreLinks.sort();

let promptLinks = [];
if (fs.existsSync(promptsDir)) {
  const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'));
  files.forEach(f => {
    const filePath = path.join(promptsDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    const titleMatch = content.match(/^title:\\s*(.*)$/m);
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md');
    const key = path.basename(f, '.md');
    promptLinks.push(\`- [[\${key}|\${title}]]\`);
  });
}
promptLinks.sort();

const dashboardContent = \`# 🗺️ Melodio Master Dashboard

## 📂 100_Genres & Styles (음악 장르 백과사전)
\\\${genreLinks.length > 0 ? genreLinks.join('\\n') : '- 등록된 장르가 없습니다.'}

## 📂 300_Prompts (큐레이션 플레이북)
\\\${promptLinks.length > 0 ? promptLinks.join('\\n') : '- 등록된 플레이북이 없습니다.'}
\`;

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
};`
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [2750, 1550],
      "id": "manual-write-obsidian",
      "name": "Manual Write Obsidian"
    },
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=✅ **직접 입력 장르 백과사전 {{ $json.is_update ? '업데이트' : '등록' }} 완료!**\n\n대표님의 고순도 인사이트 프리셋 **'{{ $json.title }}'**이 Supabase DB와 옵시디언 음악위키(100_Genres & Styles)에 성공적으로 {{ $json.is_update ? '갱신' : '배포 및 기록' }}되었습니다! 📚🎉\n\n**태그**: `source: User-Insight` 가 강제 부여되었습니다.",
        "replyMarkup": "inlineKeyboard",
        "inlineKeyboard": "={{ { rows: [ { buttons: [ { text: '🗑️ 장르 즉시 삭제', callback_data: 'delete:' + $json.category + ':' + $json.key_name } ] } ] } }}",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [2950, 1550],
      "id": "manual-send-success",
      "name": "Manual Send Success",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },

    // ── BRANCH 11: manual_genre_prompt ──────────────────
    {
      "parameters": {
        "chatId": "={{ $json.chatId }}",
        "text": "=Music WiKi에 추가하고 싶은 음악에 대한 정보(장르)를 편하게 입력해 주세요.",
        "additionalFields": {}
      },
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [750, 1750],
      "id": "manual-invalid-prompt",
      "name": "Manual Invalid Prompt",
      "credentials": {
        "telegramApi": {
          "id": "melodio-telegram-key",
          "name": "Melodio - Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const fs = require('fs');\nconst path = require('path');\nconst chatId = $('Code Router').first().json.chatId;\n\nconst dirPath = '/data/vault/04_Context/Melodio/100_Genres & Styles/.telegram-drafts';\nif (!fs.existsSync(dirPath)) {\n  fs.mkdirSync(dirPath, { recursive: true });\n}\nconst stateFile = path.join(dirPath, `state_${chatId}.json`);\nfs.writeFileSync(stateFile, JSON.stringify({ state: 'AWAITING_MANUAL_GENRE' }), 'utf-8');\n\nreturn { json: { success: true, chatId } };"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [950, 1750],
      "id": "manual-write-state",
      "name": "Manual Write State"
    },
    // OpenAI Chat Model Node
    {
      "parameters": {
        "model": "gpt-4o-mini",
        "options": {
          "temperature": 0.3
        }
      },
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "typeVersion": 1,
      "position": [1150, -250],
      "id": "openai-model",
      "name": "OpenAI Chat Model",
      "credentials": {
        "openAiApi": {
          "id": "melodio-openai-key",
          "name": "Melodio - OpenAI Key"
        }
      }
    }
  ],
  "connections": {
    "OpenAI Chat Model": {
      "ai_languageModel": [
        [
          {
            "node": "Wiki GPT Discover",
            "type": "ai_languageModel",
            "index": 0
          },
          {
            "node": "Wiki GPT Playbook",
            "type": "ai_languageModel",
            "index": 0
          },
          {
            "node": "Set GPT Playbook",
            "type": "ai_languageModel",
            "index": 0
          },
          {
            "node": "Manual GPT Playbook",
            "type": "ai_languageModel",
            "index": 0
          },
          {
            "node": "Manual GPT Query",
            "type": "ai_languageModel",
            "index": 0
          }
        ]
      ]
    },
    "Telegram Trigger": {
      "main": [
        [
          {
            "node": "Security Filter",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Security Filter": {
      "main": [
        [
          {
            "node": "Code Router",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Code Router": {
      "main": [
        [
          {
            "node": "Action Switch",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Action Switch": {
      "main": [
        [
          {
            "node": "Wiki Fetch Genres",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Set Prompt Genre",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Set Send Status",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Approve Read Cache",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Cancel Delete Cache",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Delete Send Prompt",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "List Fetch Genres",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Delete Supabase Call",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Cancel Delete Send Message",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Manual GPT Query",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Manual Invalid Prompt",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Invalid Send Message",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },

    // ── Connections: BRANCH 0: add_wiki ──────────────────
    "Wiki Fetch Genres": {
      "main": [
        [
          {
            "node": "Wiki GPT Discover",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki GPT Discover": {
      "main": [
        [
          {
            "node": "Wiki Parse Discovery",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki Parse Discovery": {
      "main": [
        [
          {
            "node": "Wiki Send Status",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki Send Status": {
      "main": [
        [
          {
            "node": "Wiki YouTube Crawl",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki YouTube Crawl": {
      "main": [
        [
          {
            "node": "Wiki Aggregate YouTube",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki Aggregate YouTube": {
      "main": [
        [
          {
            "node": "Wiki Add Notebook Source",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki Add Notebook Source": {
      "main": [
        [
          {
            "node": "Wiki Query Notebook",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki Query Notebook": {
      "main": [
        [
          {
            "node": "Wiki GPT Playbook",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki GPT Playbook": {
      "main": [
        [
          {
            "node": "Wiki Parse Playbook",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki Parse Playbook": {
      "main": [
        [
          {
            "node": "Wiki Supabase Upsert",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki Supabase Upsert": {
      "main": [
        [
          {
            "node": "Wiki Write Obsidian",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wiki Write Obsidian": {
      "main": [
        [
          {
            "node": "Wiki Send Success",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },

    // ── Connections: BRANCH 1: add_set ───────────────────
    "Set Prompt Genre": {
      "main": [
        [
          {
            "node": "Set Write State",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },

    // ── Connections: BRANCH 2: process_set_genre ─────────
    "Set Send Status": {
      "main": [
        [
          {
            "node": "Set Clear State",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Set Clear State": {
      "main": [
        [
          {
            "node": "Set Query Notebook",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Set Query Notebook": {
      "main": [
        [
          {
            "node": "Set GPT Playbook",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Set GPT Playbook": {
      "main": [
        [
          {
            "node": "Set Parse Playbook",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Set Parse Playbook": {
      "main": [
        [
          {
            "node": "Set Save Cache",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Set Save Cache": {
      "main": [
        [
          {
            "node": "Set Send Preview",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },

    // ── Connections: BRANCH 3: approve_set ───────────────
    "Approve Read Cache": {
      "main": [
        [
          {
            "node": "Approve Supabase Upsert",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Approve Supabase Upsert": {
      "main": [
        [
          {
            "node": "Approve Write Obsidian",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Approve Write Obsidian": {
      "main": [
        [
          {
            "node": "Approve Delete Cache",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Approve Delete Cache": {
      "main": [
        [
          {
            "node": "Approve Send Success",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Approve Send Success": {
      "main": [
        [
          {
            "node": "Approve Answer Query",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },

    // ── Connections: BRANCH 4: cancel ────────────────────
    "Cancel Delete Cache": {
      "main": [
        [
          {
            "node": "Cancel Send Message",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Cancel Send Message": {
      "main": [
        [
          {
            "node": "Cancel Answer Query",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },

    // ── Connections: BRANCH 6: list_genres ───────────────
    "List Fetch Genres": {
      "main": [
        [
          {
            "node": "List Format Data",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "List Format Data": {
      "main": [
        [
          {
            "node": "List Send Telegram",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "List Send Telegram": {
      "main": [
        [
          {
            "node": "List Answer Query",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },

    // ── Connections: BRANCH 7: delete_genre ──────────────
    "Delete Supabase Call": {
      "main": [
        [
          {
            "node": "Delete Obsidian File",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Delete Obsidian File": {
      "main": [
        [
          {
            "node": "Delete Send Success",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Delete Send Success": {
      "main": [
        [
          {
            "node": "Delete Answer Query",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },

    // ── Connections: BRANCH 8: cancel_delete ─────────────
    "Cancel Delete Send Message": {
      "main": [
        [
          {
            "node": "Cancel Delete Answer Query",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    // ── Connections: BRANCH 10: manual_genre ─────────────
    "Manual GPT Query": {
      "main": [
        [
          {
            "node": "Manual Parse Query",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual Parse Query": {
      "main": [
        [
          {
            "node": "Manual Send Status",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual Send Status": {
      "main": [
        [
          {
            "node": "Manual YouTube Crawl",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual YouTube Crawl": {
      "main": [
        [
          {
            "node": "Manual Aggregate YouTube",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual Aggregate YouTube": {
      "main": [
        [
          {
            "node": "Manual Add Notebook Source",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual Add Notebook Source": {
      "main": [
        [
          {
            "node": "Manual Query Notebook",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual Query Notebook": {
      "main": [
        [
          {
            "node": "Manual GPT Playbook",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual GPT Playbook": {
      "main": [
        [
          {
            "node": "Manual Parse Playbook",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual Parse Playbook": {
      "main": [
        [
          {
            "node": "Manual Supabase Upsert",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual Supabase Upsert": {
      "main": [
        [
          {
            "node": "Manual Write Obsidian",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual Write Obsidian": {
      "main": [
        [
          {
            "node": "Manual Send Success",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Manual Invalid Prompt": {
      "main": [
        [
          {
            "node": "Manual Write State",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": false,
  "settings": {
    "executionOrder": "v1"
  }
};

const VERSION = '1.9.3';

let jsonStr = JSON.stringify(workflow, null, 2);
jsonStr = jsonStr.replaceAll('melodio-telegram-key', process.env.N8N_TELEGRAM_CREDENTIAL_ID || '');
jsonStr = jsonStr.replaceAll('melodio-supabase-custom-auth', process.env.N8N_SUPABASE_CUSTOM_AUTH_CREDENTIAL_ID || '');
jsonStr = jsonStr.replaceAll('melodio-openai-key', process.env.N8N_OPENAI_CREDENTIAL_ID || '');
jsonStr = jsonStr.replaceAll('melodio-supabase-key', process.env.N8N_SUPABASE_CREDENTIAL_ID || '');

fs.writeFileSync(
  path.resolve(__dirname, 'n8n_wiki_automation_telegram.json'),
  jsonStr,
  'utf-8'
);

fs.writeFileSync(
  path.resolve(__dirname, `n8n_wiki_automation_telegram_v${VERSION}.json`),
  jsonStr,
  'utf-8'
);

console.log(`Successfully compiled and wrote n8n_wiki_automation_telegram.json & v${VERSION}.json!`);
