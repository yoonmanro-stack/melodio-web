import { resolveMusicDuration, buildInstrumentalArrangement, removeClockDurationInstructions } from '@/lib/music-duration'
import { resolveOfficialVoice } from '@/lib/voice/official-voice-selection'
import { officialVoicePersona } from '@/lib/voice/official-voice-registry'
import { assertExclusiveVoiceSelection, resolveDiscoveryVoice } from '@/lib/voice/discovery-voice-selection'
import { discoveryVoicePersona } from '@/lib/voice/discovery-voice-registry'
import { compileVoiceDesign } from '@/lib/voice/voice-design-prompt'
import { readDesignedVoice } from '@/lib/voice/designed-voice-repository'
import { suppressIneligibleVoice } from "@/lib/voice/studio-selection"
import { ArtistGenerationError, hasArtistSelection, resolveArtistGeneration } from '@/lib/artists/generation'
import { readArtist } from '@/lib/artists/repository'
import { resolveArtistVoice } from '@/lib/artists/voice-reference'
import { signArtistIdentity } from '@/lib/artists/identity-signature'
import type { ArtistGenerationSnapshot } from '@/lib/artists/types'
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
import { submitKieSunoJob, kieTaskReference, sunoVersionLabel, fitSunoStylePrompt } from '../../../../worker/suno-provider'
import { validatePetEpisode, type PetEpisode } from '@/lib/vle/petEpisode'
import { registeredVoicePersona } from '@/lib/voice/custom-voice-integrity'
import { readCustomVoice } from '@/lib/voice/custom-voice-repository'
import { compileLyricsSections, prepareLyricsSubmission, assertSafeVocalLyrics, LyricsInstructionError } from '@/lib/lyrics/compile-sections'

type ViralBriefSnapshot = {
  sourceTopic: string
  categoryId: string
  title: string
  hook: string
  lyrics: string
  stylePrompt: string
}

function readViralBriefSnapshot(value: unknown): ViralBriefSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const brief = value as Record<string, unknown>
  const limits: Record<keyof ViralBriefSnapshot, number> = {
    sourceTopic: 1500,
    categoryId: 40,
    title: 200,
    hook: 500,
    lyrics: 10_000,
    stylePrompt: 5_000,
  }
  for (const [key, max] of Object.entries(limits) as Array<[keyof ViralBriefSnapshot, number]>) {
    const field = brief[key]
    if (typeof field !== 'string' || field.length > max || /data:|base64/i.test(field)) return null
  }
  return {
    sourceTopic: brief.sourceTopic as string,
    categoryId: brief.categoryId as string,
    title: brief.title as string,
    hook: brief.hook as string,
    lyrics: brief.lyrics as string,
    stylePrompt: brief.stylePrompt as string,
  }
}

// 제출만 하므로 긴 타임아웃 불필요 (Vercel 타임아웃 60초로 확장)
export const maxDuration = 60;

function inferVocalLabel(payload: PromptPayload, selections: any, vdCode?: string): string {
  if (payload.isInstrumental) return 'Instrumental'
  if (vdCode) return `보컬 음색 스타일 ${vdCode}`
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

async function generateSongMetadata(stylePrompt: string, lyricsPrompt: string): Promise<{ title: string; description: string; tags: string; source: 'ai' | 'basic'; model: string | null }> {
  const openaiApiKey = process.env.OPENAI_API_KEY

  const fallback = {
    title: (stylePrompt.split(',')[0]?.trim() || '제목 없는 곡').slice(0, 80),
    description: '',
    tags: stylePrompt.split(',').slice(0, 4).join(', '),
    source: 'basic' as const,
    model: null
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

  const models = ['gpt-5.6-sol']
  const url = 'https://api.openai.com/v1/chat/completions'

  for (const model of models) {
    const controller = new AbortController()
    // Optional metadata leaves time for the music submission within this route's 60-second budget.
    const timeoutId = setTimeout(() => controller.abort(), 15_000)
    try {
      console.log(`[API/generate] Generating song metadata using OpenAI ${model}...`)

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
          reasoning_effort: 'low',
          max_completion_tokens: 4096
        }),
        signal: controller.signal
      })
      if (res.ok) {
        const data = await res.json()
        if (typeof data.model !== 'string' || (data.model !== model && !data.model.startsWith(`${model}-`))
            || data.choices?.[0]?.finish_reason !== 'stop' || data.choices?.[0]?.message?.refusal) return fallback;
        const content = data.choices?.[0]?.message?.content?.trim()
        if (content) {
          const parsed = JSON.parse(content);
          if (![parsed.title, parsed.description, parsed.tags].every(value => typeof value === 'string' && value.trim())) return fallback;
          return {
            title: parsed.title.replace(/['"“”]/g, '').trim() || fallback.title,
            description: parsed.description.trim(),
            tags: parsed.tags.trim(),
            source: 'ai',
            model: data.model
          }
        }
      } else { await res.body?.cancel(); }
    } catch {
      console.warn(`[API/generate] ${model} metadata unavailable; using basic metadata`)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return fallback;
}

// ─── Suno 작업 제출 (폴링 없이 task_id만 반환) ──────────────────────────────────
async function submitSunoJob(payload: PromptPayload, matchedPlaybook?: any, personaId?: string, personaModel?: 'style_persona' | 'voice_persona') {
  // Kie has a dedicated negative_tags field; keep exclusions out of positive style.
  const baseStylePrompt = payload.stylePrompt

  // Match playbooks from DB (Obsidian synced) to enrich tags ONLY if prompt is short and unmastered
  let effectiveStylePrompt = baseStylePrompt
  const isAlreadyStudioMastered = baseStylePrompt.includes('[High-fidelity studio mastering') || baseStylePrompt.length > 250;
  const selectedPresetId = (payload as PromptPayload & { presetId?: unknown }).presetId
  const hasSelectedPreset = typeof selectedPresetId === 'string' && Boolean(selectedPresetId.trim())
  if (!isAlreadyStudioMastered && !hasSelectedPreset) {
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

  const durationPlan = resolveMusicDuration(payload)

  // ── [Suno V6 Selective Engine Fidelity Cap Injection] ───────────────────────
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
      finalLyricsPrompt = buildInstrumentalArrangement(durationPlan.seconds)
    }
  }

  const isViralTrack = !payload.isInstrumental && ((payload as any).isViral === true || (payload as any).isViralTrack === true
    || (payload as any).sourceMenu === 'viral' || (payload as any).sourceMenu === 'viral-cf');
  if (isViralTrack && !effectiveStylePrompt.toLowerCase().startsWith('vocal-centric mix')) {
    effectiveStylePrompt = `vocal-centric mix, dry upfront vocals close to mic, minimal backing beat, crystal clear vocal delivery, ${effectiveStylePrompt}`;
  }

  // ── [Vocal Gender Conflict Scrubber] ──────────────────────────────────────────
  // Viral & Trend Zone 및 Voice Lab 옵션 결합 시 성별 상충 태그 정화 및 보컬 고정
  let vocalGender: string | undefined
  if (!payload.isInstrumental) {
    const explicitGender = (payload as any).vocalGender || ((payload as any).activeVoice?.gender) || (
      Array.isArray((payload.metadata as any)?.vocal) ? ((payload.metadata as any).vocal.includes('Male') ? 'male' : (payload.metadata as any).vocal.includes('Female') ? 'female' : undefined) : undefined
    )
    const promptLower = effectiveStylePrompt.toLowerCase()
    const hasFemaleKeyword = /\b(female|woman|soprano|alto|lady|girl|여성)\b/i.test(promptLower)
    const hasMaleKeyword = /\b(male|man|baritone|tenor|gentleman|boy|남성)\b/i.test(promptLower)

    const resolvedGender = explicitGender || (hasMaleKeyword && !hasFemaleKeyword ? 'male' : hasFemaleKeyword && !hasMaleKeyword ? 'female' : undefined)
    vocalGender = resolvedGender === 'male' ? 'm' : resolvedGender === 'female' ? 'f' : undefined

    if (resolvedGender === 'male') {
      effectiveStylePrompt = scrubConflictingVocalTags(effectiveStylePrompt, 'male')
      if (!effectiveStylePrompt.toLowerCase().includes('male vocal') && !effectiveStylePrompt.toLowerCase().includes('baritone') && !effectiveStylePrompt.toLowerCase().includes('tenor')) {
        effectiveStylePrompt = `male vocals, ${effectiveStylePrompt}`
      }
    } else if (resolvedGender === 'female') {
      effectiveStylePrompt = scrubConflictingVocalTags(effectiveStylePrompt, 'female')
      if (!effectiveStylePrompt.toLowerCase().includes('female vocal') && !effectiveStylePrompt.toLowerCase().includes('soprano') && !effectiveStylePrompt.toLowerCase().includes('alto')) {
        effectiveStylePrompt = `female vocals, ${effectiveStylePrompt}`
      }
    }
  }

  if (durationPlan.naturalFullSong) {
    effectiveStylePrompt = removeClockDurationInstructions(effectiveStylePrompt)
    if (payload.isInstrumental) finalLyricsPrompt = removeClockDurationInstructions(finalLyricsPrompt)
    effectiveStylePrompt = `${payload.isInstrumental ? 'Follow the supplied instrumental arrangement' : 'Perform all supplied lyric sections'}; allow the final musical phrase to resolve with a natural ending; no abrupt cutoff. ${effectiveStylePrompt}`
  } else if (durationPlan.seconds !== undefined) {
    const targetClock = `${Math.floor(durationPlan.seconds / 60)}:${String(Math.round(durationPlan.seconds % 60)).padStart(2, '0')}`
    effectiveStylePrompt = `Target duration ${durationPlan.seconds} seconds (${targetClock}); complete song; finish the final sung phrase; natural ending. ${effectiveStylePrompt}`
  }

  if (effectiveStylePrompt.length > 1000) {
    effectiveStylePrompt = fitSunoStylePrompt(effectiveStylePrompt)
  }

  const result = await submitKieSunoJob({
    style: effectiveStylePrompt,
    lyrics: finalLyricsPrompt,
    title: payload.title,
    model: payload.sunoVersion,
    instrumental: payload.isInstrumental,
    exclude: payload.excludePrompt,
    vocalGender,
    personaId,
    personaModel,
    durationSeconds: durationPlan.seconds,
    naturalFullSong: durationPlan.naturalFullSong,
  })
  console.log(`[API/generate] Kie Suno 제출 성공 (model: ${result.model})`)
  return { ...result, requestedDurationSeconds: durationPlan.seconds, durationMode: durationPlan.mode, durationSource: durationPlan.source, requestedPreferredSeconds: durationPlan.preferredSeconds }
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

function getGenreFallback(pStr: string) {
  // A playbook thumbnail is a catalog asset, never a finished track cover.
  // Use only recognizable temporary placeholders until the worker adopts clip artwork.
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

function applyVoiceDesignRequest(body: Record<string, any>) {
  if (body.voiceDesign == null && body.sourceMenu !== 'voice-discovery-design') return null
  if (body.sourceMenu !== 'voice-discovery-design') throw new Error('음색 디자인은 가창 샘플 메뉴에서 생성해 주세요.')
  if (body.isInstrumental || body.activeVoice || body.officialVoiceId != null || body.discoveryVoiceId != null || body.customVoiceId != null || body.designedVoiceId != null || body.queueItemId) {
    throw new Error('음색 디자인과 다른 보컬 선택을 함께 사용할 수 없습니다.')
  }
  const model = String(body.sunoVersion || 'V6').toUpperCase().replace(/[ .-]+/g, '_')
  if (model !== 'V6' || (body.engine != null && !['suno_v5', 'suno_v6'].includes(body.engine))) throw new Error('음색 디자인은 Suno V6에서 생성해 주세요.')
  const design = compileVoiceDesign(body.voiceDesign)
  const duration = resolveMusicDuration(body)
  if ((body.metadata?.durationSeconds != null || body.metadata?.duration != null) && duration.source !== 'explicit-duration') throw new Error('가창 샘플 길이를 확인해 주세요.')
  const seconds = duration.source === 'explicit-duration' ? duration.seconds ?? 45 : 45
  if (![30, 40, 45].includes(seconds)) throw new Error('가창 샘플 길이는 30초, 40초 또는 45초로 요청해 주세요.')
  Object.assign(body, {
    title: design.title, stylePrompt: design.sampleStylePrompt, lyricsPrompt: design.lyricsPrompt, lyricsSections: [],
    vocalGender: design.gender, sunoVersion: 'V6', engine: 'suno_v5', isInstrumental: false, isPublic: false,
    isViral: false, isViralTrack: false, voicePrompt: undefined, vdCode: undefined, presetId: undefined,
    excludePrompt: 'choir, doubled lead, backing vocal ensemble, long instrumental intro',
    metadata: { primaryGenre: 'Vocal sample', bpm: String(design.bpm), durationSeconds: seconds },
  })
  return design
}

export async function POST(request: NextRequest) {
  let claimedQueueItemId: string | null = null
  let sunoTaskAccepted = false
  try {
    const rawBody = await request.json()
    let voiceDesign: ReturnType<typeof compileVoiceDesign> | null
    try { voiceDesign = applyVoiceDesignRequest(rawBody) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '음색 디자인 설정을 확인해 주세요.' }, { status: 400 }) }
    let artistIdentity: ArtistGenerationSnapshot | null = null
    let artistOwnerUserId: string | null = null
    let artistIdentitySignature: string | undefined
    if (hasArtistSelection(rawBody)) {
      const ownerClient = await createClient()
      const { data: { user: artistOwner } } = await ownerClient.auth.getUser()
      if (!artistOwner) return NextResponse.json({ error: '아티스트로 작곡하려면 로그인이 필요합니다.', code: 'artist_auth_required' }, { status: 401 })
      const artistUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const artistServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!artistUrl || !artistServiceKey) return NextResponse.json({ error: '아티스트 저장 정보를 확인하지 못했습니다.' }, { status: 503 })
      const artistAdmin = createSupabaseClient(artistUrl, artistServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
      try {
        artistIdentity = await resolveArtistGeneration(rawBody, artistOwner.id, {
          readArtist: (userId, id) => readArtist(artistAdmin, userId, id),
          resolveVoice: (userId, voice) => resolveArtistVoice(artistAdmin, userId, voice),
        })
        artistOwnerUserId = artistOwner.id
        if (artistIdentity) artistIdentitySignature = signArtistIdentity(artistIdentity, artistOwner.id)
      } catch (error) {
        return NextResponse.json({ error: error instanceof ArtistGenerationError ? error.message : '아티스트 저장 정보를 확인하지 못했습니다. 다시 시도해 주세요.',
          code: error instanceof ArtistGenerationError ? error.code : 'artist_unavailable' },
        { status: error instanceof ArtistGenerationError ? error.httpStatus : 503 })
      }
    }
    suppressIneligibleVoice(rawBody)
    const payload = rawBody as PromptPayload
    if (payload.engine === 'lyria3') {
      return NextResponse.json({ error: 'Lyria 3 생성은 현재 제공되지 않습니다. Suno V6를 선택해 주세요.' }, { status: 400 })
    }
    const requestedCustomVoiceId = typeof rawBody.activeVoice?.customVoiceId === 'string'
      ? rawBody.activeVoice.customVoiceId
      : typeof rawBody.customVoiceId === 'string' ? rawBody.customVoiceId : null
    const requestedViralBrief = rawBody.metadata?.viralBrief
    const viralBrief = requestedViralBrief === undefined ? null : readViralBriefSnapshot(requestedViralBrief)
    if (requestedViralBrief !== undefined && !viralBrief) {
      return NextResponse.json({ error: '바이럴 기획 정보 형식을 확인해 주세요.' }, { status: 400 })
    }
    const petEpisode = rawBody.sourceMenu === 'viral' && rawBody.presetId === 'pet'
      ? rawBody.metadata?.petEpisode as PetEpisode | undefined
      : undefined
    if (petEpisode) {
      const issues = validatePetEpisode(petEpisode)
      if (issues.length) {
        return NextResponse.json({ error: issues[0] }, { status: 400 })
      }
      // Pet v3 must remain a short even when the chosen music genre has no "viral" tag.
      rawBody.isViral = true
    }
    const selections = rawBody.selections
    let lyricsSections = rawBody.lyricsSections
    const vdCode = rawBody.vdCode
    const noiseRatio = rawBody.noiseRatio
    const queueItemId = typeof rawBody.queueItemId === 'string' ? rawBody.queueItemId : null
    // 공개 여부는 DB 컬럼과 license_hash 메타데이터가 반드시 같은 값을 갖도록
    // 요청 초기에 한 번만 정규화한다. 이전 요청처럼 값이 없으면 공개가 기본이다.
    const isPublic = typeof rawBody.isPublic === 'boolean' ? rawBody.isPublic : true
    // 화면의 구조화된 가사 섹션을 서버의 단일 기준으로 사용한다. 클라이언트에서
    // 조립한 lyricsPrompt가 비었거나 오래된 상태여도 화면에 표시된 섹션과 동일한
    // 프롬프트를 서버에서 다시 만든다.
    const canonicalLyricsPrompt = compileLyricsSections(lyricsSections).lyricsPrompt
    if (!payload.isInstrumental && canonicalLyricsPrompt) {
      payload.lyricsPrompt = canonicalLyricsPrompt
    }

    // Compare snapshots only after lyricsSections has been canonicalized. Otherwise a
    // caller could validate one lyricsPrompt and submit different structured lyrics.
    if (petEpisode && petEpisode.lyrics !== payload.lyricsPrompt) {
      return NextResponse.json({ error: '콘티의 가사와 음원 가사가 다릅니다. 콘티를 다시 확인해 주세요.' }, { status: 400 })
    }
    if (viralBrief && (rawBody.sourceMenu !== 'viral' || rawBody.presetId === 'pet'
      || viralBrief.categoryId !== rawBody.presetId || viralBrief.lyrics !== payload.lyricsPrompt
      || viralBrief.stylePrompt !== payload.stylePrompt)) {
      return NextResponse.json({ error: '기획한 상황·가사·음악 스타일이 다릅니다. 다시 기획해 주세요.' }, { status: 400 })
    }

    if (!payload.isInstrumental && !queueItemId) assertSafeVocalLyrics(payload.lyricsPrompt || '')

    if (!payload.stylePrompt) {
      return NextResponse.json({ error: 'stylePrompt가 필요합니다' }, { status: 400 })
    }

    // 일본 BGM 보컬곡은 Suno의 임의 가사 생성을 허용하지 않는다.
    // 빈 가사로 제출하면 같은 작업의 두 후보가 서로 다른 구성으로 생성되어
    // 길이가 1분 이상 벌어지는 사례가 확인됐다.
    if (rawBody.sourceMenu === 'japan' && !payload.isInstrumental && !canonicalLyricsPrompt) {
      return NextResponse.json({ error: '보컬곡 가사가 비어 있습니다. 가사를 먼저 생성해주세요.' }, { status: 400 })
    }

    let officialVoice: ReturnType<typeof resolveOfficialVoice> = null
    let officialPersonaId: string | undefined
    let discoveryVoice: ReturnType<typeof resolveDiscoveryVoice> = null
    let discoveryPersonaId: string | undefined
    let designedVoice: Awaited<ReturnType<typeof readDesignedVoice>> = null
    let designedPersonaId: string | undefined
    let designedOwner: { id: string } | null = null
    try {
      assertExclusiveVoiceSelection(rawBody)
      officialVoice = resolveOfficialVoice(rawBody)
      discoveryVoice = resolveDiscoveryVoice(rawBody)
      const designedId = rawBody.activeVoice?.designedVoiceId ?? rawBody.designedVoiceId
      if (designedId != null) {
        if (typeof designedId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(designedId)) throw new Error('저장한 음색 선택값이 올바르지 않습니다.')
        if (!['style-library', 'preset-studio', 'audio-forge', 'audio', 'japan', 'voice-discovery-sample'].includes(rawBody.sourceMenu)) throw new Error('저장한 음색은 가창 샘플 또는 뮤직·프리셋·일본 BGM 스튜디오에서 사용해 주세요.')
        if (String(rawBody.sunoVersion || 'V6').toUpperCase().replace(/[ .-]+/g, '_') !== 'V6') throw new Error('저장한 음색은 Suno V6에서 사용해 주세요.')
        if (typeof payload.lyricsPrompt !== 'string' || !payload.lyricsPrompt.trim()) throw new Error('저장한 음색을 사용하려면 가사를 먼저 준비해 주세요.')
        const ownerClient = await createClient()
        const { data: { user: owner } } = await ownerClient.auth.getUser()
        if (!owner) return NextResponse.json({ error: '저장한 음색을 사용하려면 로그인이 필요합니다.' }, { status: 401 })
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('designed_voice_not_ready')
        const ownerAdmin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
        try { designedVoice = await readDesignedVoice(ownerAdmin, owner.id, designedId) }
        catch { throw new Error('designed_voice_not_ready') }
        if (!designedVoice || designedVoice.userId !== owner.id || designedVoice.id !== designedId) return NextResponse.json({ error: '저장한 음색을 찾을 수 없습니다.' }, { status: 404 })
        if (designedVoice.status !== 'ready' || typeof designedVoice.providerPersonaId !== 'string' || !/^[A-Za-z0-9_-]{6,160}$/.test(designedVoice.providerPersonaId)
          || !designedVoice.voicePrompt?.trim()) throw new Error('designed_voice_not_ready')
        if (rawBody.vocalGender !== designedVoice.gender) throw new Error('저장한 음색과 보컬 성별이 다릅니다. 다시 선택해 주세요.')
        designedPersonaId = designedVoice.providerPersonaId
        designedOwner = { id: owner.id }
        rawBody.voicePrompt = designedVoice.voicePrompt
        rawBody.activeVoice = { id: designedVoice.id, designedVoiceId: designedVoice.id, gender: designedVoice.gender, stylePrompt: designedVoice.voicePrompt }
      }
      if (officialVoice) {
        officialPersonaId = officialVoicePersona(officialVoice.id)
        rawBody.voicePrompt = officialVoice.stylePrompt
        rawBody.activeVoice = { id: officialVoice.id, officialVoiceId: officialVoice.id, gender: officialVoice.gender, stylePrompt: officialVoice.stylePrompt }
      }
      if (discoveryVoice) {
        discoveryPersonaId = discoveryVoicePersona(discoveryVoice.id)
        rawBody.voicePrompt = discoveryVoice.stylePrompt
        rawBody.activeVoice = { id: discoveryVoice.id, discoveryVoiceId: discoveryVoice.id, gender: discoveryVoice.gender, stylePrompt: discoveryVoice.stylePrompt }
      }
    } catch (error) {
      const unavailable = error instanceof Error && ['official_voice_not_ready', 'discovery_voice_not_ready', 'designed_voice_not_ready'].includes(error.message)
      return NextResponse.json({ error: unavailable ? '선택한 보컬의 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' : error instanceof Error ? error.message : '보컬 선택을 확인해 주세요.' }, { status: unavailable ? 503 : 400 })
    }

    // Apply Voice Prompt / Voice DNA
    const rawVoicePrompt = rawBody.voicePrompt || (rawBody.activeVoice?.stylePrompt)
    const rawVocalGender = rawBody.vocalGender || rawBody.activeVoice?.gender
    const { scrubConflictingVocalTags } = await import('@/lib/voice-dna-scrubber')

    let detectedTargetGender: 'male' | 'female' | 'duet' | undefined = undefined
    if (rawVocalGender === 'male' || rawVocalGender === 'female' || rawVocalGender === 'duet') {
      detectedTargetGender = rawVocalGender
    } else if (rawVoicePrompt) {
      const lower = rawVoicePrompt.toLowerCase()
      if (lower.includes('male') && !lower.includes('female')) detectedTargetGender = 'male'
      else if (lower.includes('female')) detectedTargetGender = 'female'
      else if (lower.includes('duet')) detectedTargetGender = 'duet'
    }

    if (rawVoicePrompt && typeof rawVoicePrompt === 'string' && rawVoicePrompt.trim()) {
      let cleanedStyle = payload.stylePrompt
      if (detectedTargetGender && detectedTargetGender !== 'duet') {
        cleanedStyle = scrubConflictingVocalTags(cleanedStyle, detectedTargetGender)
      }
      const parts = cleanedStyle.split(',')
      const genre = parts[0]?.trim() || ''
      const remainder = parts.slice(1).map((p: string) => p.trim()).filter(Boolean).join(', ')
      if (genre) {
        payload.stylePrompt = `${genre}, ${rawVoicePrompt.trim()}${remainder ? `, ${remainder}` : ''}`
      } else {
        payload.stylePrompt = `${rawVoicePrompt.trim()}, ${cleanedStyle}`
      }
      console.log(`[API/generate] Direct Voice Prompt applied: "${rawVoicePrompt.trim()}", Final stylePrompt: "${payload.stylePrompt}"`)
    } else if (vdCode) {
      const { scrubAndComposeVoiceDna } = await import('@/lib/voice-dna-scrubber')
      const scrubbed = await scrubAndComposeVoiceDna(payload.stylePrompt, vdCode, noiseRatio)
      console.log(`[API/generate] Voice DNA applied: "${vdCode}", Original stylePrompt: "${payload.stylePrompt}", Scrubbed: "${scrubbed}"`)
      payload.stylePrompt = scrubbed
    }

    let generatedDescription = '';
    let generatedTags = '';

    const needTitle = !payload.title || !payload.title.trim();
    const generated = queueItemId || voiceDesign
      ? {
          title: payload.title || 'Untitled',
          description: voiceDesign ? '선택한 음색 특성을 바탕으로 만든 가창 샘플' : 'Channel Builder에서 승인된 Episode Track Blueprint',
          tags: payload.stylePrompt.split(',').slice(0, 4).join(', '),
          source: 'approved-blueprint' as const,
          model: null,
        }
      : await generateSongMetadata(payload.stylePrompt, payload.lyricsPrompt || '');
    if (needTitle) {
      payload.title = generated.title;
    }
    generatedDescription = generated.description;
    generatedTags = generated.tags;
    console.log(`[API/generate] Metadata source: ${generated.source}`);

    // Supabase 클라이언트
    const supabase = await createClient()
    const user = designedOwner || (artistOwnerUserId ? { id: artistOwnerUserId } : (await supabase.auth.getUser()).data.user)
    if (voiceDesign && !user) return NextResponse.json({ error: '가창 샘플을 생성하려면 로그인이 필요합니다.' }, { status: 401 })

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceRoleKey || !supabaseUrl) {
      throw new Error('Supabase 환경 변수 누락')
    }
    const serviceSupabase = createSupabaseClient(supabaseUrl, serviceRoleKey)

    // The browser sends only Melodio's registration UUID. Resolve the provider
    // Voice ID server-side after checking ownership and readiness.
    let registeredVoicePersonaId: string | undefined
    let registeredVoiceName: string | undefined
    if (requestedCustomVoiceId && !payload.isInstrumental) {
      if (!user) return NextResponse.json({ error: '등록 목소리를 사용하려면 로그인이 필요합니다.' }, { status: 401 })
      if (!/^[0-9a-f-]{36}$/i.test(requestedCustomVoiceId)) {
        return NextResponse.json({ error: '등록 목소리 선택값이 올바르지 않습니다.' }, { status: 400 })
      }
      let registeredVoice: Awaited<ReturnType<typeof readCustomVoice>>
      try {
        registeredVoice = await readCustomVoice(serviceSupabase, user.id, requestedCustomVoiceId)
      } catch (error) {
        return NextResponse.json({ error: '등록 목소리 저장 정보를 확인하지 못했습니다.' }, {
          status: error instanceof Error && error.message === 'invalid_voice_registration' ? 409 : 503,
        })
      }
      if (!registeredVoice) {
        return NextResponse.json({ error: '선택한 등록 목소리를 찾을 수 없습니다.' }, { status: 404 })
      }
      try {
        registeredVoicePersonaId = registeredVoicePersona(registeredVoice, user.id)
      } catch {
        return NextResponse.json({ error: '선택한 목소리는 아직 Suno V6에서 사용할 수 없습니다.' }, { status: 409 })
      }
      registeredVoiceName = registeredVoice.name
    }

    if (queueItemId) {
      if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
      const { data: queueItem, error: queueError } = await (supabase as any)
        .from('generation_queue_items')
        .select('id,title,style_prompt,exclude_prompt,lyrics_prompt,lyrics_sections,is_instrumental,status')
        .eq('id', queueItemId)
        .single()
      if (queueError || !queueItem) {
        return NextResponse.json({ error: 'Generation Queue Item을 찾을 수 없습니다.' }, { status: 404 })
      }
      const queueItemData = queueItem as any
      const canonicalMatch = queueItemData.title === payload.title
        && queueItemData.style_prompt === payload.stylePrompt
        && queueItemData.exclude_prompt === (payload.excludePrompt || '')
        && queueItemData.is_instrumental === payload.isInstrumental
      if (!canonicalMatch) {
        return NextResponse.json({ error: '승인된 Queue 생성 패키지와 요청 내용이 일치하지 않습니다.' }, { status: 409 })
      }
      payload.lyricsPrompt = queueItemData.lyrics_prompt
      lyricsSections = queueItemData.lyrics_sections
      if (queueItemData.status !== 'ready') {
        return NextResponse.json({ error: '이미 제출되었거나 아직 준비되지 않은 Queue Item입니다.' }, { status: 409 })
      }
      const { data: claimed, error: claimError } = await (supabase as any)
        .from('generation_queue_items')
        .update({ status: 'submitting', error_message: null })
        .eq('id', queueItemId).eq('status', 'ready').select('id').maybeSingle()
      if (claimError || !claimed) {
        return NextResponse.json({ error: '다른 요청이 이 곡을 먼저 제출했습니다.' }, { status: 409 })
      }
      claimedQueueItemId = queueItemId
    }

    // Restore approved Queue content before separating lyrics and production notes.
    // Keep independently approved short-form snapshots exact.
    if (!viralBrief && !petEpisode) {
      const preparedLyrics = prepareLyricsSubmission({ stylePrompt: payload.stylePrompt,
        lyricsPrompt: payload.lyricsPrompt, lyricsSections, isInstrumental: payload.isInstrumental,
        vocalGender: rawBody.vocalGender || rawBody.activeVoice?.gender })
      payload.stylePrompt = preparedLyrics.stylePrompt
      payload.lyricsPrompt = preparedLyrics.lyricsPrompt
    }
    if (!payload.isInstrumental) assertSafeVocalLyrics(payload.lyricsPrompt || '')

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

    const defaultFallback = getGenreFallback(payload.stylePrompt);
    if (!coverArtUrl1) coverArtUrl1 = defaultFallback;
    if (!coverArtUrl2) coverArtUrl2 = defaultFallback;

    // ─── Suno: 비동기 제출 ────────────────────────────────────────────────────
    const samplePersonaId = officialPersonaId || discoveryPersonaId || designedPersonaId
    const { taskId, model, requestedDurationSeconds, durationMode, durationSource, requestedPreferredSeconds } = await submitSunoJob(payload, matchedPlaybook, samplePersonaId || registeredVoicePersonaId, samplePersonaId ? 'style_persona' : 'voice_persona')
    sunoTaskAccepted = true

    // DB에 'generating' 상태로 저장 (워커가 폴링하여 완료 처리)
    // provider 표시로 기존 302.ai 작업과 Kie 작업을 구분한다.
    // duration_mode에 메타데이터 JSON 저장 (스타일프롬프트, 가사, 엔진 등)
    // 실제 음성 등록·변환 기능은 준비 중이다. 기존 스타일 코드는 프롬프트
    // 합성에만 사용하며, Mac mini의 과거 자동 변환 조건(yoon/custom)이
    // 오작동하지 않도록 해당 값은 voiceDna 필드에 전달하지 않는다.
    const storedVoiceStyleCode = typeof vdCode === 'string' && !/(?:yoon|^custom)/i.test(vdCode)
      ? vdCode
      : null

    const metadata = JSON.stringify({
      artistId: artistIdentity?.id,
      artistRevision: artistIdentity?.revision,
      artistIdentity: artistIdentity || undefined,
      artistIdentitySignature,
      stylePrompt: payload.stylePrompt,
      vocalGender: rawBody.vocalGender || rawBody.activeVoice?.gender,
      lyricsPrompt: payload.lyricsPrompt || '',
      excludePrompt: payload.excludePrompt || '',
      engine: payload.engine || 'suno_v5',
      isInstrumental: payload.isInstrumental,
      sunoVersion: sunoVersionLabel(model),
      sunoModel: model,
      sunoProvider: 'kie',
      sunoSubmittedAt: new Date().toISOString(),
      genre: payload.metadata?.primaryGenre || '',
      genreLabel: inferGenreLabel(payload, selections),
      subGenre: payload.metadata?.subGenre || '',
      bpm: payload.metadata?.bpm || '',
      mood: payload.metadata?.mood || '',
      selections: selections || {},
      vocal: inferVocalLabel(payload, selections, vdCode),
      voiceDna: storedVoiceStyleCode,
      vocalToneStyleCode: vdCode || null,
      officialVoiceId: officialVoice?.id || null,
      officialVoiceName: officialVoice?.name || null,
      discoveryVoiceId: discoveryVoice?.id || null,
      discoveryVoiceName: discoveryVoice?.name || null,
      designedVoiceId: designedVoice?.id || null,
      designedVoiceName: designedVoice?.name || null,
      voiceDesign: voiceDesign ? { gender: voiceDesign.gender, age: voiceDesign.age, language: voiceDesign.language, traits: voiceDesign.traits, designCode: voiceDesign.designCode } : undefined,
      voiceDesignCode: voiceDesign?.designCode,
      voiceFeatureMode: samplePersonaId ? 'suno_style_persona' : registeredVoicePersonaId ? 'suno_voice_persona' : 'prompt_style_only',
      auto_voice_convert: false,
      voice_model_id: null,
      customVoiceRegistrationId: registeredVoicePersonaId ? requestedCustomVoiceId : null,
      customVoiceName: registeredVoiceName || null,
      lyricsSections: lyricsSections || [],
      duration: durationSource === 'studio-natural' ? '' : rawBody.metadata?.duration || '',
      durationSeconds: requestedDurationSeconds,
      requestedDurationSeconds,
      requestedDurationMode: durationMode,
      requestedDurationSource: durationSource,
      naturalFullSong: durationSource === 'studio-natural',
      naturalPreferredRange: requestedPreferredSeconds ? {
        minimumSeconds: requestedPreferredSeconds.minimum,
        maximumSeconds: requestedPreferredSeconds.maximum,
        ...(requestedPreferredSeconds.target !== undefined ? { targetSeconds: requestedPreferredSeconds.target } : {}),
        enforcement: 'preference',
      } : undefined,
      coverArtUrl2: coverArtUrl2, // 두 번째 곡용 커버 이미지 보관
      description: generatedDescription,
      tags: generatedTags,
      metadataSource: generated.source,
      metadataModel: generated.model,
      presetId: rawBody.presetId || null,
      presetName: rawBody.presetName || null,
      sourceMenu: rawBody.sourceMenu || null,
      isPublic,
      youtubeMainTitle: rawBody.youtubeMainTitle || null,
      tracklistText: rawBody.tracklistText || null,
      queueItemId,
      ...(petEpisode ? { petEpisode, formatVersion: 'pet-v3', targetVideoSeconds: 30 } : {}),
      ...(viralBrief ? { viralBrief, targetVideoSeconds: 30 } : {}),
    })

    const trackTitle = payload.title?.trim() || payload.stylePrompt.slice(0, 60)

    const { data: genData, error: genError } = await serviceSupabase
      .from('generations')
      .insert({
        user_id: user?.id || null,
        title: trackTitle,
        status: 'generating',
        is_public: isPublic,
        source_audio_url: kieTaskReference(taskId),
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
      const { error: queueUpdateError } = await (serviceSupabase as any)
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
        await (supabase as any).from('generation_queue_items').update({
          status: sunoTaskAccepted ? 'submission_failed' : 'ready',
          error_message: message,
        }).eq('id', claimedQueueItemId).eq('status', 'submitting')
      } catch (queueError) {
        console.error('[API/generate] Queue 실패 상태 기록 오류:', queueError)
      }
    }
    return NextResponse.json({ error: message, ...(error instanceof LyricsInstructionError ? { code: error.code } : {}) },
      { status: error instanceof LyricsInstructionError ? 400 : 500 })
  }
}
