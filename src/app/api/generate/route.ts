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

function buildLyricsPromptFromSections(sections: unknown): string {
  if (!Array.isArray(sections)) return ''
  return sections
    .filter((section: any) => section && typeof section === 'object' && String(section.content || '').trim())
    .map((section: any) => {
      const rawType = String(section.type || 'verse')
      const label = rawType.charAt(0).toUpperCase() + rawType.slice(1)
      const description = String(section.description || '').trim()
      const content = String(section.content || '').trim()
      return `[${label}]\n${description ? `[${description}]\n` : ''}${content}`
    })
    .join('\n\n')
}

function inferVocalLabel(payload: PromptPayload, selections: any, vdCode?: string): string {
  if (payload.isInstrumental) return 'Instrumental'
  if (vdCode) return `Voice DNA ${vdCode}`
  const selected = Array.isArray(selections?.vocal) ? selections.vocal.filter(Boolean) : []
  if (selected.length > 0) return selected.join(' / ')

  const style = payload.stylePrompt.toLowerCase()
  if (/\b(duet|duo|male and female|mixed vocal)\b/.test(style)) return 'Duet / Mixed Vocal'
  if (/\b(female|woman|girl|soprano|alto)\b/.test(style)) return 'Female Vocal'
  if (/\b(male|man|boy|tenor|baritone)\b/.test(style)) return 'Male Vocal'
  if (/\b(choir|choral|group vocal)\b/.test(style)) return 'Choir / Group Vocal'
  return 'Vocal (unspecified)'
}

function inferGenreLabel(payload: PromptPayload, selections: any): string {
  const selected = Array.isArray(selections?.genre) ? selections.genre.filter(Boolean) : []
  if (selected.length > 0) return selected.join(' / ')
  return payload.stylePrompt.split(',')[0]?.trim() || payload.metadata?.primaryGenre || 'Unspecified'
}

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
    ? `${payload.stylePrompt}, avoid: ${payload.excludePrompt.trim()}`
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
  let finalLyricsPrompt = payload.lyricsPrompt ?? ''
  if (payload.isInstrumental) {
    effectiveStylePrompt = effectiveStylePrompt
      .replace(/vocal-centric mix,?\s*/gi, '')
      .replace(/dry upfront vocals close to mic,?\s*/gi, '')
      .replace(/minimal backing beat,?\s*/gi, '')
      .replace(/crystal clear vocal delivery,?\s*/gi, '')
      .trim()
    if (!effectiveStylePrompt.includes('[Full Instrumental Master')) {
      effectiveStylePrompt = `[Full Instrumental Master, rich melodic lead, lush arrangement, dynamic progression] ${effectiveStylePrompt}`
    }
    if (!finalLyricsPrompt.trim()) {
      finalLyricsPrompt = `[Target Duration: 3:30, Full Extended Instrumental Master]\n[Instrumental Intro]\n[Melodic Main Theme - Piano & Bass]\n[Instrumental Verse 1]\n[Rich Melodic Chorus 1]\n[Instrumental Verse 2 - Dynamic Lead Development]\n[Extended Solo & Piano Bridge]\n[Rich Melodic Chorus 2 - Full Climax]\n[Outro & Gradual Fade Out]`
    }
  }

  const isViralTrack = !payload.isInstrumental && ((payload as any).isViral || baseStylePrompt.toLowerCase().includes('viral') || baseStylePrompt.toLowerCase().includes('parody') || baseStylePrompt.toLowerCase().includes('comical') || baseStylePrompt.toLowerCase().includes('vocal-centric'));
  if (isViralTrack && !effectiveStylePrompt.toLowerCase().startsWith('vocal-centric mix')) {
    effectiveStylePrompt = `vocal-centric mix, dry upfront vocals close to mic, minimal backing beat, crystal clear vocal delivery, ${effectiveStylePrompt}`;
  }

  // ── [Vocal Gender Conflict Scrubber] ──────────────────────────────────────────
  // Viral & Trend Zone 및 Voice Lab 옵션 결합 시 성별 상충 태그 정화
  const promptLower = effectiveStylePrompt.toLowerCase()
  const hasFemaleKeyword = /\b(female|woman|soprano|alto|lady|girl|여성)\b/i.test(promptLower)
  const hasMaleKeyword = /\b(male|man|baritone|tenor|gentleman|boy|남성)\b/i.test(promptLower)

  if (!payload.isInstrumental && hasFemaleKeyword && !hasMaleKeyword) {
    effectiveStylePrompt = scrubConflictingVocalTags(effectiveStylePrompt, 'female')
  } else if (!payload.isInstrumental && hasMaleKeyword && !hasFemaleKeyword) {
    effectiveStylePrompt = scrubConflictingVocalTags(effectiveStylePrompt, 'male')
  }

  if (effectiveStylePrompt.length > 1000) {
    effectiveStylePrompt = effectiveStylePrompt.slice(0, 1000)
  }

  const model = mapSunoVersionToModel(payload.sunoVersion)

  console.log(`[API/generate] Suno 제출 (model: ${model}, isInstrumental: ${Boolean(payload.isInstrumental)})`)

  const submitRes = await fetch(`${apiBaseUrl}/suno/submit/music`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: finalLyricsPrompt,
      tags: effectiveStylePrompt ?? '',
      title: payload.title ?? 'Untitled',
      mv: model,
      make_instrumental: false,
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

// ─── 앨범 커버 생성은 melodio-worker 로 이관됨 ────────────────────────────────
// blendVisualPromptWithMetadata / generateAndUploadCoverArt 는 워커의
// buildCoverPrompt / generateCoverArt 로 옮겼다. Vercel 서버리스에서는 응답 후
// 백그라운드 프로미스 완료가 보장되지 않아 여기서는 절대 동작할 수 없었다.
//
// 아래 getGenreFallback 은 남는다 — 생성 중 잠시 걸어둘 자리표시자를 고르는 용도.
// 곡이 완성되면 워커가 Suno 커버 또는 AI 커버로 교체한다.

/**
 * 생성 중에 임시로 걸어둘 커버.
 *
 * 단어 경계 필수: 예전에는 p.includes('rap') 이었는데, 스타일 프롬프트의
 * "avoid: aggressive rap" 이 걸려 모든 바이럴곡이 개발자 그림을 받았다.
 * 'dev' 도 device/development 에 걸린다.
 */
const FALLBACK_PRESET_BASE =
  'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets';

function getGenreFallback(pStr: string, pb: any) {
  // ⚠️ playbook 썸네일을 곡 커버로 쓰지 않는다.
  // /preset-thumbs/ 는 Preset Studio 장르 카탈로그 이미지이고, 곡 내용과 무관하다.
  // (강아지 노래에 vocaloid_pop.png 가 붙던 사고 — 2026-08-09)
  const pbThumb = pb?.metadata?.thumbnail_url;
  if (pbThumb && !pbThumb.includes('unsplash.com') && !pbThumb.includes('/preset-thumbs/')) {
    return pbThumb;
  }
  const p = (pStr || '').toLowerCase();
  const has = (...words: string[]) =>
    words.some((w) => new RegExp(`(^|[^a-z가-힣])${w.replace(/[-\s]/g, '[-\\s]?')}([^a-z가-힣]|$)`, 'i').test(p));

  if (has('joseon', '조선', 'gugak', '국악', 'pansori', '판소리')) return `${FALLBACK_PRESET_BASE}/joseon-hip-hop.png`;
  if (has('boom bap', 'hip hop', 'hiphop', 'rap', 'developer')) return `${FALLBACK_PRESET_BASE}/developer-debugging.png`;
  if (has('synthwave', 'cyberpunk', 'retro')) return `${FALLBACK_PRESET_BASE}/dead-mall-nostalgia.png`;
  if (has('city pop', 'tokyo', 'japan')) return `${FALLBACK_PRESET_BASE}/tokyo-midnight-1984.png`;
  if (has('jazz', 'kyoto', 'matcha')) return `${FALLBACK_PRESET_BASE}/matcha-kyoto-jazz.png`;
  if (has('lofi', 'lo-fi', 'chill', 'tea')) return `${FALLBACK_PRESET_BASE}/iced-oolong-tea.png`;
  return `${FALLBACK_PRESET_BASE}/deep-sleep-drift.png`;
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
  let claimedQueueItemId: string | null = null
  let sunoTaskAccepted = false
  try {
    const rawBody = await request.json()
    const payload = rawBody as PromptPayload
    const selections = rawBody.selections
    let lyricsSections = rawBody.lyricsSections
    const vdCode = rawBody.vdCode
    const noiseRatio = rawBody.noiseRatio
    const queueItemId = typeof rawBody.queueItemId === 'string' ? rawBody.queueItemId : null
    // 화면의 구조화된 가사 섹션을 서버의 단일 기준으로 사용한다. 클라이언트에서
    // 조립한 lyricsPrompt가 비었거나 오래된 상태여도 화면에 표시된 섹션과 동일한
    // 프롬프트를 서버에서 다시 만든다.
    const canonicalLyricsPrompt = buildLyricsPromptFromSections(lyricsSections)
    if (!payload.isInstrumental && canonicalLyricsPrompt) {
      payload.lyricsPrompt = canonicalLyricsPrompt
    }

    if (!payload.stylePrompt) {
      return NextResponse.json({ error: 'stylePrompt가 필요합니다' }, { status: 400 })
    }

    // 일본 BGM 보컬곡은 Suno의 임의 가사 생성을 허용하지 않는다.
    // 빈 가사로 제출하면 같은 작업의 두 후보가 서로 다른 구성으로 생성되어
    // 길이가 1분 이상 벌어지는 사례가 확인됐다.
    if (rawBody.sourceMenu === 'japan' && !payload.isInstrumental && !canonicalLyricsPrompt) {
      return NextResponse.json({ error: '보컬곡 가사가 비어 있습니다. 가사를 먼저 생성해주세요.' }, { status: 400 })
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
    const generated = queueItemId
      ? {
          title: payload.title || 'Untitled',
          description: 'Channel Builder에서 승인된 Episode Track Blueprint',
          tags: payload.stylePrompt.split(',').slice(0, 4).join(', '),
        }
      : await generateSongMetadata(payload.stylePrompt, payload.lyricsPrompt || '');
    if (needTitle) {
      payload.title = generated.title;
    }
    generatedDescription = generated.description;
    generatedTags = generated.tags;
    console.log(`[API/generate] Auto-generated catchy metadata:`, generated);

    // Supabase 클라이언트
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (queueItemId) {
      if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
      const { data: queueItem, error: queueError } = await supabase
        .from('generation_queue_items')
        .select('id,title,style_prompt,exclude_prompt,lyrics_prompt,lyrics_sections,is_instrumental,status')
        .eq('id', queueItemId)
        .single()
      if (queueError || !queueItem) {
        return NextResponse.json({ error: 'Generation Queue Item을 찾을 수 없습니다.' }, { status: 404 })
      }
      const canonicalMatch = queueItem.title === payload.title
        && queueItem.style_prompt === payload.stylePrompt
        && queueItem.exclude_prompt === (payload.excludePrompt || '')
        && queueItem.is_instrumental === payload.isInstrumental
      if (!canonicalMatch) {
        return NextResponse.json({ error: '승인된 Queue 생성 패키지와 요청 내용이 일치하지 않습니다.' }, { status: 409 })
      }
      payload.lyricsPrompt = queueItem.lyrics_prompt
      lyricsSections = queueItem.lyrics_sections
      if (queueItem.status !== 'ready') {
        return NextResponse.json({ error: '이미 제출되었거나 아직 준비되지 않은 Queue Item입니다.' }, { status: 409 })
      }
      const { data: claimed, error: claimError } = await supabase
        .from('generation_queue_items')
        .update({ status: 'submitting', error_message: null })
        .eq('id', queueItemId).eq('status', 'ready').select('id').maybeSingle()
      if (claimError || !claimed) {
        return NextResponse.json({ error: '다른 요청이 이 곡을 먼저 제출했습니다.' }, { status: 409 })
      }
      claimedQueueItemId = queueItemId
    }

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
    sunoTaskAccepted = true

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
      genreLabel: inferGenreLabel(payload, selections),
      subGenre: payload.metadata?.subGenre || '',
      bpm: payload.metadata?.bpm || '',
      mood: payload.metadata?.mood || '',
      selections: selections || {},
      vocal: inferVocalLabel(payload, selections, vdCode),
      voiceDna: vdCode || null,
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
      queueItemId,
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

    if (claimedQueueItemId && genData?.id) {
      const { error: queueUpdateError } = await serviceSupabase
        .from('generation_queue_items')
        .update({
          generation_id: genData.id,
          status: 'generating',
          submitted_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', claimedQueueItemId)
      if (queueUpdateError) console.error('[API/generate] Queue 연결 실패:', queueUpdateError.message)
    }

    /*
     * 🎨 커버 아트 생성은 melodio-worker 로 이관됐다.
     *
     * 이 자리에 있던 코드는 응답을 반환한 뒤 .then() 으로 도는 fire-and-forget
     * 이었다. Vercel 서버리스는 응답을 보내는 순간 함수를 얼리므로 그 프로미스가
     * 완료된다는 보장이 없다 — 맥미니(상시 실행)에서는 되고 프로덕션에서는 안 되는
     * 구조였고, 그래서 공개 플레이리스트의 커버가 전부 자리표시자로 남았다.
     *
     * 지금은 위에서 coverArtUrl1(자리표시자)만 걸어두고, 곡이 완성되는 시점에
     * 워커가 Suno 커버 → AI 생성 순으로 교체한다. (isPlaceholderCover 참조)
     */

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
    if (claimedQueueItemId) {
      try {
        const supabase = await createClient()
        await supabase.from('generation_queue_items').update({
          status: sunoTaskAccepted ? 'submission_failed' : 'ready',
          error_message: message,
        }).eq('id', claimedQueueItemId).eq('status', 'submitting')
      } catch (queueError) {
        console.error('[API/generate] Queue 실패 상태 기록 오류:', queueError)
      }
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
