/**
 * Melodio — 음악 생성 API Route (비동기 아키텍처)
 * POST /api/generate
 *
 * 동작 원리:
 * 1. Suno API에 작업 제출만 수행 (폴링 없음 → 2초 이내 응답)
 * 2. DB에 status='generating', suno_task_id 저장
 * 3. 맥미니 워커가 주기적으로 generating 상태 곡을 폴링하여 완료 처리
 */

import { NextRequest, NextResponse } from 'next/server'
import type { PromptPayload } from '@/types'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { GoogleAuth } from 'google-auth-library'
import { titlePlaybooks } from '@/data/titlePlaybooks'
import { scrubConflictingVocalTags } from '@/lib/voice-dna-scrubber'

// 제출만 하므로 긴 타임아웃 불필요 (Vercel 타임아웃 60초로 확장)
export const maxDuration = 60;

async function generateSongMetadata(stylePrompt: string, lyricsPrompt: string): Promise<{ title: string; description: string; tags: string }> {
  const openaiApiKey = process.env.OPENAI_API_KEY
  const pLower = stylePrompt.toLowerCase();

  // Dynamic Context Blender Archetype Helper for Fallbacks
  const generateDynamicFallbackTitle = (style: string): string => {
    const p = style.toLowerCase();
    if (p.includes('joseon') || p.includes('조선') || p.includes('gugak') || p.includes('국악')) {
      const pool = ['먹빛 깃발', '달빛 아래 칼춤', '한과 흥', '새벽 안개속 나그네', '바람의 궤적'];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (p.includes('trot') || p.includes('트로트') || p.includes('뽕짝') || p.includes('7080')) {
      const pool = ['청춘의 첫사랑', '빗속의 가로등', '마지막 편지', '세월이 가면', '연인의 바다'];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (p.includes('city') || p.includes('synth') || p.includes('시티팝') || p.includes('레트로')) {
      const pool = ['Midnight Highway 1986', 'Neon Sunset', 'Tokyo Rain', 'Plastic Heart', 'Retro Cassette'];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (p.includes('chanson') || p.includes('샹송') || p.includes('french')) {
      const pool = ['Café de Paris', 'Sous le Ciel', 'Whispering Seine', 'Midnight Accordion'];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (p.includes('japan') || p.includes('j-pop') || p.includes('anime')) {
      const pool = ['夜の雨音 (밤의 빗소리)', '星空の記憶', 'Midnight Serenade', 'Cherry Blossom Winds'];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    const generalPool = ['Midnight Compiler', 'Coffee & Terminal', 'Bugfix Serenade', 'Echoes of Solitude', 'Quiet Raindrops'];
    return generalPool[Math.floor(Math.random() * generalPool.length)];
  };

  const fallback = {
    title: generateDynamicFallbackTitle(stylePrompt),
    description: 'Professional studio master mix, poetic track aesthetics',
    tags: stylePrompt.split(',').slice(0, 4).join(', ')
  }

  if (!openaiApiKey) return fallback;

  const systemPrompt = `You are a world-class music director and title blender (Dynamic Context Blender).
Analyze the style prompt ("${stylePrompt}") and lyrics ("${lyricsPrompt}").

Determine the EXACT genre, era, and language context (e.g. Joseon Gugak Fusion, 7080 Korean Retro, City Pop, French Chanson, J-Pop, Lofi, Epic OST).
Output a JSON object with:
1. "title": A poetic, artistic, and evocative SINGLE TRACK song title (1-4 words). Matches the exact language/era of the music (e.g. "먹빛 깃발" for Joseon Gugak, "Midnight Highway 1986" for City Pop, "Café de Paris" for Chanson, "夜の雨音" for J-Pop). NEVER use generic genre labels or duration tags like "[2시간]".
2. "description": A beautiful, engaging description of the song's style and vibe (1 sentence).
3. "tags": A comma-separated list of 3-5 key genre/mood tags.

Output ONLY valid raw JSON.`

  const models = ['gpt-5.6-sol', 'gpt-5.5', 'gpt-5.6-terra', 'gpt-4o', 'gpt-4o-mini']
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com'
  const url = `${apiBase}/v1/chat/completions`

  for (const model of models) {
    try {
      console.log(`[API/generate] Generating song metadata using OpenAI ${model}...`)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Style Prompt: "${stylePrompt}"\nLyrics: "${lyricsPrompt}"` }
          ],
          response_format: { type: "json_object" },
          temperature: 0.8,
          max_tokens: 200
        }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (res.ok) {
        const data = await res.json()
        const content = data.choices?.[0]?.message?.content?.trim()
        if (content) {
          const parsed = JSON.parse(content);
          return {
            title: (parsed.title || fallback.title).replace(/['"“”]/g, '').trim(),
            description: (parsed.description || fallback.description).trim(),
            tags: (parsed.tags || fallback.tags).trim()
          }
        }
      }
    } catch (err: any) {
      console.warn(`[API/generate] Metadata generation model ${model} error:`, err.message)
    }
  }

  return fallback;
}

// ─── Suno 엔진 맵핑 ──────────────────────────────────────────────────────────
function mapSunoVersionToModel(version?: string): string {
  if (!version) return 'chirp-fenix'
  const n = version.toLowerCase()
  switch (n) {
    case 'v5.5':
      return 'chirp-fenix' // Suno v5.5
    case 'v5':
      return 'chirp-crow'  // Suno v5.0
    case 'v4.5+':
      return 'chirp-bluejay'
    case 'v4.5':
      return 'chirp-auk'
    default:
      return 'chirp-fenix'
  }
}

// ─── Suno 작업 제출 (폴링 없이 task_id만 반환) ──────────────────────────────────
async function submitSunoJob(payload: PromptPayload, matchedPlaybook?: any): Promise<{ taskId: string; engine: string }> {
  const apiKey = process.env.SUNO_API_KEY
  const apiBaseUrl = process.env.SUNO_API_URL || 'https://api.302.ai'

  if (!apiKey) {
    throw new Error('SUNO_API_KEY 환경 변수가 설정되지 않았습니다.')
  }

  // Exclude 프롬프트 처리
  const baseStylePrompt = payload.excludePrompt?.trim()
    ? `${payload.stylePrompt}, ${payload.excludePrompt.trim()}`
    : payload.stylePrompt

  // Match playbooks from DB (Obsidian synced) to enrich tags ONLY if prompt is short and unmastered
  let effectiveStylePrompt = baseStylePrompt
  const isAlreadyStudioMastered = baseStylePrompt.includes('[High-fidelity studio mastering') || baseStylePrompt.length > 250;
  if (!isAlreadyStudioMastered) {
    if (matchedPlaybook) {
      const extraTags = matchedPlaybook.metadata?.suno_tags
      if (extraTags) {
        effectiveStylePrompt = `${baseStylePrompt}, ${extraTags}`
        console.log(`[API/generate] Enriched style tags with Obsidian playbook: "${extraTags}"`)
      }
    } else {
      try {
        const { matchPlaybooksByPrompt } = await import('@/lib/db/knowledge')
        const matched = await matchPlaybooksByPrompt(payload.stylePrompt)
        if (matched && matched.length > 0) {
          const extraTags = matched
            .map(pb => pb.metadata?.suno_tags)
            .filter(Boolean)
            .join(', ')
          if (extraTags) {
            effectiveStylePrompt = `${baseStylePrompt}, ${extraTags}`
            console.log(`[API/generate] Enriched style tags with Obsidian playbook: "${extraTags}"`)
          }
        }
      } catch (err) {
        console.error('[API/generate] Error matching curation playbooks:', err)
      }
    }
  }

  // ── [Duration Control Injection] ──────────────────────────────────────────
  const isShortsTrack = (payload as any).isViral || (payload as any).isViralTrack || baseStylePrompt.toLowerCase().includes('viral') || baseStylePrompt.toLowerCase().includes('short') || baseStylePrompt.toLowerCase().includes('parody');

  if (!effectiveStylePrompt.toLowerCase().includes('fade out') && !effectiveStylePrompt.toLowerCase().includes('clean ending')) {
    if (isShortsTrack) {
      effectiveStylePrompt = `${effectiveStylePrompt}, target duration 0:28, clean 0:28 ending, abrupt finish`
    } else {
      effectiveStylePrompt = `${effectiveStylePrompt}, target duration 3:15, fade out at 3:20, clean ending`
    }
  }

  // ── [Suno v5.5 Selective Engine Fidelity Cap Injection] ───────────────────────
  // 기존 프롬프트를 100% 보존하면서, 최상단 헤더 캡만 얇게 주입하여 고음 뭉개짐(Slop) 방어
  if (!effectiveStylePrompt.includes('[Hyper-Realistic')) {
    effectiveStylePrompt = `[Hyper-Realistic 24-bit 96kHz, studio master production] ${effectiveStylePrompt}`
  }

  // ── [Vocal-Centric Forced Header for Viral Tracks] ───────────────────────────
  // 보컬 묻힘 방지: 바이럴/풍자곡의 경우 최상단 고정 1순위에 보컬 최우선 강조 태그 주입
  const isViralTrack = (payload as any).isViral || baseStylePrompt.toLowerCase().includes('viral') || baseStylePrompt.toLowerCase().includes('parody') || baseStylePrompt.toLowerCase().includes('comical') || baseStylePrompt.toLowerCase().includes('vocal-centric');
  if (isViralTrack && !effectiveStylePrompt.toLowerCase().startsWith('vocal-centric mix')) {
    effectiveStylePrompt = `vocal-centric mix, dry upfront vocals close to mic, minimal backing beat, crystal clear vocal delivery, ${effectiveStylePrompt}`;
  }

  // ── [Vocal Gender Conflict Scrubber] ──────────────────────────────────────────
  // Viral & Trend Zone 및 Voice Lab 옵션 결합 시 성별 상충 태그 정화
  const promptLower = effectiveStylePrompt.toLowerCase()
  const hasFemaleKeyword = /\b(female|woman|soprano|alto|lady|girl|여성)\b/i.test(promptLower)
  const hasMaleKeyword = /\b(male|man|baritone|tenor|gentleman|boy|남성)\b/i.test(promptLower)

  if (hasFemaleKeyword && !hasMaleKeyword) {
    effectiveStylePrompt = scrubConflictingVocalTags(effectiveStylePrompt, 'female')
  } else if (hasMaleKeyword && !hasFemaleKeyword) {
    effectiveStylePrompt = scrubConflictingVocalTags(effectiveStylePrompt, 'male')
  }

  const model = mapSunoVersionToModel(payload.sunoVersion)

  console.log(`[API/generate] Suno 제출 (model: ${model})`)

  const submitRes = await fetch(`${apiBaseUrl}/suno/submit/music`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: payload.lyricsPrompt ?? '',
      tags: effectiveStylePrompt ?? '',
      title: payload.title ?? 'Untitled',
      mv: model,
      make_instrumental: payload.isInstrumental ?? false,
    }),
  })

  if (!submitRes.ok) {
    const errorText = await submitRes.text()
    console.error('[API/generate] Suno 제출 실패:', errorText)
    throw new Error(`Suno API 제출 실패: ${submitRes.status}`)
  }

  const submitData = await submitRes.json()
  if (submitData.code !== 200 && submitData.code !== 'success' && submitData.message !== 'success') {
    throw new Error(`Suno API 에러: ${submitData.message || JSON.stringify(submitData)}`)
  }

  const taskId = typeof submitData.data === 'string'
    ? submitData.data
    : (submitData.data?.task_id || submitData.data?.id)

  if (!taskId) {
    throw new Error('Suno API에서 작업 ID를 받지 못했습니다.')
  }

  console.log(`[API/generate] Suno 제출 성공. Task ID: ${taskId}`)
  return { taskId, engine: 'suno_v5' }
}

// ─── 앨범 커버 이미지 생성 및 업로드 ──────────────────────────────────────────
async function blendVisualPromptWithMetadata(
  payload: PromptPayload,
  playbook: any
): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey) {
    if (playbook?.metadata?.logo_prompt) {
      return `${playbook.metadata.logo_prompt}. Designed as a high-resolution 1:1 square album cover art, representing the music. Keep the edges clean.`
    }
    return `Beautiful 1:1 square album cover art for a song. Style: ${payload.stylePrompt}. Clean aesthetic, high resolution, digital art.`
  }

  const basePrompt = playbook?.metadata?.logo_prompt || `Beautiful 1:1 square album cover art for a song. Style: ${payload.stylePrompt}. Clean aesthetic, high resolution, digital art.`
  const title = payload.title || 'Untitled'
  const lyricsPrompt = payload.lyricsPrompt || ''
  const stylePrompt = payload.stylePrompt || ''

  const systemPrompt = `You are a creative visual director for a music streaming platform.
Your task is to take a base brand visual style and dynamically adapt/enrich it to match the specific song's title, lyrics, and style.
This ensures that while the core brand identity is preserved, each song gets a unique, relevant album cover variation, avoiding repetitive visual penalties on platforms like YouTube.

INPUTS:
1. Base Brand Style Prompt: "${basePrompt}"
2. Song Title: "${title}"
3. Style Prompt: "${stylePrompt}"
4. Song Lyrics: "${lyricsPrompt}"

RULES:
1. PRESERVE THE BRAND: Strictly keep the medium, color schemes, and core aesthetic of the Base Brand Style Prompt (e.g. if it specifies "traditional Korean ink wash painting (soomuk-hwa)", the output MUST still be that exact medium and style).
2. INTRODUCE VARIATION: Extract 1 or 2 specific visual metaphors, weather conditions, times of day, seasons, or background details from the Title and Lyrics, and blend them naturally into the scene (e.g., if rain/rainy is mentioned, make the scene rainy; if winter/snow is mentioned, add snow; if coffee/cafe is mentioned, add a warm mug or cafe steam).
3. KEEP IT SIMPLE: Output ONLY the final generated English prompt of 60 to 100 words. No explanations, no formatting, no markdown, no quotes. Just the raw prompt string.`

  const models = ['gpt-5.6-sol', 'gpt-5.5', 'gpt-5.6-terra', 'gpt-4o', 'gpt-4o-mini']
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com'
  const url = `${apiBase}/v1/chat/completions`

  for (const model of models) {
    try {
      console.log(`[API/generate] Visual Blender calling OpenAI ${model}...`)
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Blend the prompt for song title: "${title}"` }
          ],
          temperature: 0.7,
          max_tokens: 200
        })
      })

      if (res.ok) {
        const data = await res.json()
        const blended = data.choices?.[0]?.message?.content?.trim()
        if (blended && blended.length > 10) {
          console.log(`[API/generate] Dynamic visual blending successful: "${blended}"`)
          return `${blended}. Designed as a high-resolution 1:1 square album cover art. Keep the edges clean.`
        }
      } else {
        const errText = await res.text()
        console.warn(`[API/generate] Visual Blender model ${model} failed:`, errText)
      }
    } catch (err: any) {
      console.warn(`[API/generate] Visual Blender model ${model} error:`, err.message)
    }
  }

  return `${basePrompt}. Designed as a high-resolution 1:1 square album cover art. Keep the edges clean.`
}

function getGenreFallback(pStr: string, pb: any) {
  if (pb?.metadata?.thumbnail_url) return pb.metadata.thumbnail_url;
  const p = (pStr || '').toLowerCase();
  if (p.includes('joseon') || p.includes('조선') || p.includes('gugak') || p.includes('국악') || p.includes('pansori') || p.includes('판소리')) {
    return 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop';
  }
  if (p.includes('boom bap') || p.includes('hip hop') || p.includes('hiphop') || p.includes('rap')) {
    return 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=600&auto=format&fit=crop';
  }
  if (p.includes('synthwave') || p.includes('cyberpunk') || p.includes('retro')) {
    return 'https://images.unsplash.com/photo-1607799279861-4dd421887fb3?q=80&w=600&auto=format&fit=crop';
  }
  if (p.includes('city pop') || p.includes('tokyo') || p.includes('japan')) {
    return 'https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?q=80&w=600&auto=format&fit=crop';
  }
  if (p.includes('jazz')) {
    return 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=600&auto=format&fit=crop';
  }
  if (p.includes('lofi') || p.includes('lo-fi') || p.includes('chill') || p.includes('tea')) {
    return 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?q=80&w=600&auto=format&fit=crop';
  }
  return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop';
}

async function generateAndUploadCoverArt(
  payload: PromptPayload,
  playbook: any,
  serviceSupabase: any
): Promise<string> {
  const defaultFallback = getGenreFallback(payload.stylePrompt, playbook);
  try {
    let imageUrl = ''
    const finalPrompt = await blendVisualPromptWithMetadata(payload, playbook)

    console.log(`[API/generate] Generating cover art with prompt: "${finalPrompt.slice(0, 100)}..."`)

    // ─────────────────────────────────────────────────────────────────────
    // 이미지 엔진: gpt-image-2 via 302.ai (타임아웃 30초로 확장)
    // ─────────────────────────────────────────────────────────────────────
    const sunoApiKey = process.env.SUNO_API_KEY
    const sunoApiBase = (process.env.SUNO_API_URL || 'https://api.302.ai').replace(/\/+$/, '')

    if (sunoApiKey) {
      try {
        console.log(`[API/generate] gpt-image-2 via 302.ai 호출 시도 중...`)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        const res = await fetch(`${sunoApiBase}/v1/images/generations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sunoApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-image-2',
            prompt: finalPrompt,
            n: 1,
            size: '1024x1024',
            quality: 'auto',
            response_format: 'b64_json',
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (res.ok) {
          const gptImageData = await res.json()
          const b64Data = gptImageData.data?.[0]?.b64_json
          const rawUrl = gptImageData.data?.[0]?.url
          if (b64Data) {
            imageUrl = `data:image/png;base64,${b64Data}`
            console.log(`[API/generate] gpt-image-2 이미지 생성 성공 (Base64)!`)
          } else if (rawUrl) {
            imageUrl = rawUrl
            console.log(`[API/generate] gpt-image-2 이미지 생성 성공 (URL)!`)
          }
        } else {
          const errorText = await res.text()
          console.warn(`[API/generate] gpt-image-2 실패:`, errorText)
        }
      } catch (err: any) {
        console.error(`[API/generate] gpt-image-2 에러:`, err.message)
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Fallback 1: OpenAI DALL-E-3 (공식 OpenAI Key 사용)
    // ─────────────────────────────────────────────────────────────────────
    if (!imageUrl && process.env.OPENAI_API_KEY) {
      try {
        console.log(`[API/generate] OpenAI DALL-E 3 커버 아트 생성 시도 중...`)
        const openAiRes = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: `Professional music album cover art, 1:1 square ratio, vivid concept art matching lyrics: ${finalPrompt.slice(0, 400)}`,
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json',
          })
        })
        if (openAiRes.ok) {
          const openAiData = await openAiRes.json()
          const b64 = openAiData.data?.[0]?.b64_json
          if (b64) {
            imageUrl = `data:image/png;base64,${b64}`
            console.log(`[API/generate] OpenAI DALL-E 3 커버 이미지 생성 성공!`)
          }
        }
      } catch (dalleErr: any) {
        console.warn(`[API/generate] DALL-E 3 생성 예외:`, dalleErr.message)
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Fallback 2: Pollinations AI (초고속 실시간 맞춤 앨범 커버 생성)
    // ─────────────────────────────────────────────────────────────────────
    if (!imageUrl) {
      console.log(`[API/generate] Pollinations AI 고품질 커버아트 실시간 생성 중...`)
      imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(`album cover art, ${finalPrompt.slice(0, 250)}`)}?width=1024&height=1024&seed=${Math.floor(Math.random() * 900000) + 100000}&nologo=true`
    }

    if (imageUrl) {
      const fileId = crypto.randomUUID()
      const filePath = `covers/${fileId}.png`
      
      let uploadBuf: Buffer
      let contentType = 'image/png'

      if (imageUrl.startsWith('data:image')) {
        const base64Data = imageUrl.split(',')[1]
        uploadBuf = Buffer.from(base64Data, 'base64')
      } else {
        const imgRes = await fetch(imageUrl)
        if (!imgRes.ok) throw new Error(`Generated image download failed: ${imgRes.status}`)
        const arrayBuf = await imgRes.arrayBuffer()
        uploadBuf = Buffer.from(arrayBuf)
        contentType = imgRes.headers.get('content-type') || 'image/png'
      }

      console.log(`[API/generate] Uploading cover art to storage: ${filePath}`)
      const { error: uploadError } = await serviceSupabase.storage
        .from('melodio-assets')
        .upload(filePath, uploadBuf, {
          contentType,
          upsert: true
        })

      if (uploadError) {
        console.error('[API/generate] Storage upload error:', uploadError.message)
        return defaultFallback
      }

      const { data: { publicUrl } } = serviceSupabase.storage
        .from('melodio-assets')
        .getPublicUrl(filePath)

      console.log(`[API/generate] Cover art upload success. Public URL: ${publicUrl}`)
      return publicUrl
    }

    if (!imageUrl) {
      console.log(`[API/generate] Fallback: Pollinations AI 커버 이미지 100% 즉시 생성...`)
      imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
    }

    return imageUrl || defaultFallback;
  } catch (err: any) {
    console.error(`[API/generate] 커버 이미지 생성 예외 발생:`, err.message);
    return defaultFallback;
  }
}

// ─── Lyria 엔진 (기존 동기 방식 유지 — 즉시 반환) ──────────────────────────────
async function handleLyria(payload: PromptPayload) {
  const { generateWithLyria3 } = await import('@/lib/engines/lyria3')
  return generateWithLyria3({
    prompt: payload.stylePrompt,
    durationSeconds: 30,
    sampleRate: 48000,
  })
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json()
    const payload = rawBody as PromptPayload
    const selections = rawBody.selections
    const lyricsSections = rawBody.lyricsSections
    const vdCode = rawBody.vdCode
    const noiseRatio = rawBody.noiseRatio

    if (!payload.stylePrompt) {
      return NextResponse.json({ error: 'stylePrompt가 필요합니다' }, { status: 400 })
    }

    // Apply Voice DNA Scrubber
    if (vdCode) {
      const { scrubAndComposeVoiceDna } = await import('@/lib/voice-dna-scrubber')
      const scrubbed = await scrubAndComposeVoiceDna(payload.stylePrompt, vdCode, noiseRatio)
      console.log(`[API/generate] Voice DNA applied: "${vdCode}", Original stylePrompt: "${payload.stylePrompt}", Scrubbed: "${scrubbed}"`)
      payload.stylePrompt = scrubbed
    }

    let generatedDescription = '';
    let generatedTags = '';

    const needTitle = !payload.title || !payload.title.trim();
    const generated = await generateSongMetadata(payload.stylePrompt, payload.lyricsPrompt || '');
    if (needTitle) {
      payload.title = generated.title;
    }
    generatedDescription = generated.description;
    generatedTags = generated.tags;
    console.log(`[API/generate] Auto-generated catchy metadata:`, generated);

    // Supabase 클라이언트
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) {
      throw new Error('Supabase 환경 변수 누락')
    }
    const serviceSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // 0. 장르 플레이북 매칭
    let matchedPlaybook: any = null
    try {
      const presetId = rawBody.presetId
      if (presetId) {
        const { getPlaybookByKey } = await import('@/lib/db/knowledge')
        matchedPlaybook = await getPlaybookByKey(presetId)
      }
      
      if (!matchedPlaybook) {
        const { matchPlaybooksByPrompt } = await import('@/lib/db/knowledge')
        const matched = await matchPlaybooksByPrompt(payload.stylePrompt)
        if (matched && matched.length > 0) {
          matchedPlaybook = matched[0]
        }
      }
    } catch (err) {
      console.error('[API/generate] Error matching playbooks in POST:', err)
    }

    // 1. 앨범 커버 이미지 결정 (Vercel 15초 타임아웃 방지를 위해 즉시 고화질 커버 할당)
    let coverArtUrl1 = rawBody.coverArtUrl1;
    let coverArtUrl2 = rawBody.coverArtUrl2;

    const defaultFallback = getGenreFallback(payload.stylePrompt, matchedPlaybook);
    if (!coverArtUrl1) coverArtUrl1 = defaultFallback;
    if (!coverArtUrl2) coverArtUrl2 = defaultFallback;

    // 엔진 분기
    const engine = payload.engine === 'auto'
      ? 'suno_v5' // 연주곡 여부와 관계없이 진짜 Suno v5.5 Pro를 가동
      : payload.engine

    if (engine === 'lyria3') {
      // Lyria는 빠르므로 동기 처리
      const track = await handleLyria(payload)
      const { data: genData, error: genError } = await serviceSupabase
        .from('generations')
        .insert({
          user_id: user?.id || null,
          title: track.title,
          audio_url: track.audioUrl,
          source_audio_url: track.audioUrl,
          status: 'completed',
          is_stem_extracted: false,
          cover_art_url: coverArtUrl1,
          license_hash: JSON.stringify({
            stylePrompt: payload.stylePrompt,
            engine: 'lyria3',
            sourceMenu: rawBody.sourceMenu || null,
            isPublic: rawBody.isPublic !== undefined ? rawBody.isPublic : true,
          }),
        })
        .select().single()

      if (genError) console.error('[API/generate] INSERT 에러:', genError.message)

      return NextResponse.json({ 
        success: true, 
        track: { 
          ...track, 
          id: genData?.id || track.id,
          cover_art_url: coverArtUrl1
        } 
      })
    }

    // ─── Suno: 비동기 제출 ────────────────────────────────────────────────────
    const { taskId } = await submitSunoJob(payload, matchedPlaybook)

    // DB에 'generating' 상태로 저장 (워커가 폴링하여 완료 처리)
    // source_audio_url에 'suno:{taskId}' 형식으로 Suno task ID 저장
    // duration_mode에 메타데이터 JSON 저장 (스타일프롬프트, 가사, 엔진 등)
    const metadata = JSON.stringify({
      stylePrompt: payload.stylePrompt,
      lyricsPrompt: payload.lyricsPrompt || '',
      excludePrompt: payload.excludePrompt || '',
      engine: payload.engine || 'suno_v5',
      isInstrumental: payload.isInstrumental,
      sunoVersion: payload.sunoVersion || 'v5.5',
      genre: payload.metadata?.primaryGenre || '',
      subGenre: payload.metadata?.subGenre || '',
      bpm: payload.metadata?.bpm || '',
      mood: payload.metadata?.mood || '',
      selections: selections || {},
      lyricsSections: lyricsSections || [],
      duration: rawBody.metadata?.duration || '',
      durationSeconds: rawBody.metadata?.durationSeconds || null,
      coverArtUrl2: coverArtUrl2, // 두 번째 곡용 커버 이미지 보관
      description: generatedDescription,
      tags: generatedTags,
      presetId: rawBody.presetId || null,
      presetName: rawBody.presetName || null,
      sourceMenu: rawBody.sourceMenu || null,
      isPublic: rawBody.isPublic !== undefined ? rawBody.isPublic : true,
      youtubeMainTitle: rawBody.youtubeMainTitle || null,
      tracklistText: rawBody.tracklistText || null,
    })

    const trackTitle = payload.title?.trim() || payload.stylePrompt.slice(0, 60)

    const { data: genData, error: genError } = await serviceSupabase
      .from('generations')
      .insert({
        user_id: user?.id || null,
        title: trackTitle,
        status: 'generating',
        source_audio_url: `suno:${taskId}`,
        duration_mode: 'clip',
        license_hash: metadata,
        is_stem_extracted: false,
        cover_art_url: coverArtUrl1,
      })
      .select().single()

    if (genError) {
      console.error('[API/generate] INSERT 에러:', genError.message, genError.details)
      throw new Error(`데이터베이스 저장 실패: ${genError.message}`)
    }

    return NextResponse.json({
      success: true,
      generating: true,
      message: '음원 생성이 시작되었습니다. 약 1~2분 후 Track Library에 표시됩니다.',
      track: {
        id: genData?.id || taskId,
        title: payload.title || payload.stylePrompt.slice(0, 60),
        engine: 'suno_v5',
        status: 'generating',
        cover_art_url: coverArtUrl1,
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류'
    console.error('[API/generate] 에러:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
