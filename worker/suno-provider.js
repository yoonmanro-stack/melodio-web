/** Shared by the Next.js submission route and the Mac mini music worker. */
const { prepareLyricsSubmission, assertSafeVocalLyrics } = require('./lyrics-policy');
const KIE_MODEL = 'ai-music-api/generate';
const KIE_API_ORIGIN = 'https://api.kie.ai';
const SUNO_TIMEOUT_MS = 15 * 60 * 1000;

function resolveSunoModel(version) {
  const normalized = String(version || '').trim().toUpperCase().replace(/[ .-]+/g, '_');
  if (normalized === 'V6_MINI') return 'V6_MINI';
  if (normalized === 'V6_WILD') return 'V6_WILD';
  // Retired V4/V5 settings in saved presets and queue items use the current model.
  return 'V6';
}

function sunoVersionLabel(model) {
  return resolveSunoModel(model).toLowerCase().replace('_', '-');
}

function resolveDurationSeconds(value, fallback = 195) {
  const text = String(value ?? '').trim();
  const clock = text.match(/^(\d+):(\d{2})$/);
  const seconds = clock ? Number(clock[1]) * 60 + Number(clock[2]) : Number(text);
  return Number.isFinite(seconds) && seconds >= 10 && seconds <= 360 ? seconds : fallback;
}

function kieTaskReference(taskId) {
  return `suno:kie:${taskId}`;
}

function parseSunoTaskReference(reference) {
  const match = String(reference).match(/^suno:(kie:)?([^\s:]+)$/);
  if (!match) throw new Error('Invalid Suno task reference');
  return { provider: match[1] ? 'kie' : 'legacy', taskId: match[2] };
}

function normalizeKieConfig(config) {
  const apiKey = String(config?.apiKey || '').trim();
  if (!apiKey) throw new Error('KIE_API_KEY 환경 변수가 설정되지 않았습니다.');
  let url;
  try { url = new URL(config?.apiBaseUrl || KIE_API_ORIGIN); } catch { /* handled below */ }
  if (!url || url.origin !== KIE_API_ORIGIN || url.pathname !== '/' || url.search || url.hash
    || url.username || url.password) {
    throw new Error('KIE_API_URL은 공식 Kie API 호스트만 사용할 수 있습니다.');
  }
  return { apiKey, apiBaseUrl: KIE_API_ORIGIN };
}

function getKieConfig() {
  return normalizeKieConfig({
    apiKey: process.env.KIE_API_KEY,
    apiBaseUrl: process.env.KIE_API_URL || KIE_API_ORIGIN,
  });
}

function buildKieSunoRequest(options) {
  const instrumental = options.instrumental === true;
  const prepared = Array.isArray(options.lyricsSections)
    ? prepareLyricsSubmission({ stylePrompt: options.style, lyricsPrompt: options.lyrics,
      lyricsSections: options.lyricsSections, isInstrumental: instrumental, vocalGender: options.vocalGender })
    : { stylePrompt: String(options.style || ''), lyricsPrompt: String(options.lyrics || '') };
  const style = prepared.stylePrompt.trim();
  const lyrics = prepared.lyricsPrompt.trim();
  if (!instrumental) assertSafeVocalLyrics(lyrics);
  if (!style) throw new Error('음악 스타일 프롬프트를 입력해 주세요.');
  if (lyrics.length > 5000) throw new Error('Suno V6 가사는 5,000자 이내로 입력해 주세요.');
  const customMode = instrumental || lyrics.length > 0;
  const requestedPersona = String(options.personaId || '').trim();
  if (!instrumental && requestedPersona && !customMode) throw new Error('목소리 참조를 사용하려면 가사가 필요합니다.');
  if (options.personaModel && !['style_persona', 'voice_persona'].includes(options.personaModel)) throw new Error('목소리 참조 유형이 올바르지 않습니다.');
  const input = {
    model: resolveSunoModel(options.model),
    custom_mode: customMode,
    instrumental,
    prompt: customMode ? lyrics : `${style}${options.exclude ? `, avoid: ${options.exclude}` : ''}`.slice(0, 3000),
  };
  if (customMode) {
    input.style = style.slice(0, 1000);
    input.title = (String(options.title || '').trim() || 'Untitled').slice(0, 80);
    input.duration = resolveDurationSeconds(options.durationSeconds);
    if (options.exclude?.trim()) input.negative_tags = options.exclude.trim();
    if (!instrumental && ['m', 'f'].includes(options.vocalGender)) input.vocal_gender = options.vocalGender;
    const personaId = String(options.personaId || '').trim();
    if (!instrumental && personaId) {
      if (!/^[A-Za-z0-9_-]{6,160}$/.test(personaId)) throw new Error('등록 목소리 ID 형식이 올바르지 않습니다.');
      input.persona_id = personaId;
      input.persona_model = options.personaModel || 'voice_persona';
    }
  }
  return { model: KIE_MODEL, input };
}

class SunoProviderError extends Error {
  constructor(operation, code) {
    // Never include provider bodies, prompts or credentials in errors.
    super(`Suno ${operation} 실패 (code: ${Number(code) || 'invalid_response'})`);
    this.name = 'SunoProviderError';
    this.code = Number(code) || 0;
  }
}

async function readProviderJson(response, operation) {
  if (!response.ok) throw new SunoProviderError(operation, response.status);
  try {
    return await response.json();
  } catch {
    throw new SunoProviderError(operation, 0);
  }
}

async function submitKieSunoJob(options, config, fetchImpl = fetch) {
  const kieConfig = normalizeKieConfig(config || getKieConfig());
  const body = buildKieSunoRequest(options);
  const response = await fetchImpl(`${kieConfig.apiBaseUrl}/api/v1/jobs/createTask`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${kieConfig.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await readProviderJson(response, '제출');
  if (Number(result.code) !== 200) throw new SunoProviderError('제출', result.code);
  const taskId = result.data?.task_id || result.data?.taskId;
  if (typeof taskId !== 'string' || !/^[^\s:]+$/.test(taskId)) throw new SunoProviderError('작업 ID 확인', 0);
  return { taskId, model: body.input.model };
}

function httpUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? value : undefined;
  } catch { return undefined; }
}

function resultTracks(result) {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== 'object') return [];
  for (const key of ['sunoData', 'lyricsData', 'tracks', 'data', 'resultUrls']) {
    if (Array.isArray(result[key])) return result[key];
  }
  for (const key of ['resultObject', 'response']) {
    if (result[key]) {
      const tracks = resultTracks(result[key]);
      if (tracks.length) return tracks;
    }
  }
  return [];
}

function normalizeKieSunoStatus(result, taskId) {
  const data = result.data || {};
  const state = String(data.state || data.status || '').toLowerCase();
  if (['fail', 'failed', 'error', 'create_task_failed', 'generate_audio_failed', 'callback_exception', 'sensitive_word_error'].includes(state)) {
    return { state: 'failed', clips: [] };
  }
  if (state !== 'success') return { state: 'processing', clips: [], progress: data.progress };
  let output = data.resultJson ?? data.response ?? data;
  if (typeof output === 'string') {
    try { output = JSON.parse(output); } catch { return { state: 'failed', clips: [] }; }
  }
  const clips = resultTracks(output).map((track, index) => {
    if (typeof track === 'string') track = { audio_url: track };
    const duration = Number(track?.duration ?? track?.metadata?.duration);
    return {
      id: track?.id || `${taskId}-${index + 1}`,
      title: track?.title,
      audio_url: httpUrl(track?.audio_url || track?.audioUrl),
      image_url: httpUrl(track?.image_url || track?.imageUrl),
      duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
      status: 'complete',
    };
  });
  if (!clips.length || clips.some(clip => !clip.audio_url)) return { state: 'failed', clips: [] };
  return { state: 'complete', clips };
}

async function fetchSunoTask(reference, config, fetchImpl = fetch) {
  const { provider, taskId } = parseSunoTaskReference(reference);
  // References created by the retired provider must never be sent to Kie or
  // any legacy endpoint. The worker persists this terminal hold explicitly.
  if (provider === 'legacy') return { state: 'held', reason: 'legacy_not_supported', clips: [] };
  const kieConfig = normalizeKieConfig(config || getKieConfig());
  const response = await fetchImpl(`${kieConfig.apiBaseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${kieConfig.apiKey}` },
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  });
  const result = await readProviderJson(response, '결과 조회');
  if (Number(result.code) !== 200) throw new SunoProviderError('결과 조회', result.code);
  return normalizeKieSunoStatus(result, taskId);
}

module.exports = { SUNO_TIMEOUT_MS, SunoProviderError, resolveSunoModel, sunoVersionLabel, resolveDurationSeconds,
  kieTaskReference, parseSunoTaskReference, normalizeKieConfig, getKieConfig, buildKieSunoRequest, submitKieSunoJob,
  normalizeKieSunoStatus, fetchSunoTask };
