const { test } = require('node:test');
const assert = require('node:assert/strict');
const { submitKieSunoJob, fetchSunoTask, buildKieSunoRequest, resolveSunoModel, resolveDurationSeconds,
  kieTaskReference, parseSunoTaskReference, normalizeKieConfig, getKieConfig,
  normalizeKieSunoStatus } = require('./suno-provider');
const { LyricsInstructionError } = require('./lyrics-policy');

const config = { apiKey: 'test-only-credential', apiBaseUrl: 'https://api.kie.ai' };
const successResponse = data => new Response(JSON.stringify({ code: 200, data }));

test('structured music directions reach style and never the sung provider prompt', () => {
  const direction = 'male vocal, [부드러운 통기타 스트로크] [브러시 드럼과 따뜻한 콘트라베이스], 가까운 마이크 질감의 진솔한 서사, 깊은 트로트 비브라토와 섬세한 꺾기';
  const input = buildKieSunoRequest({ style: 'Trot, male vocal', lyrics: `[Verse]\n[${direction}]\n오늘을 노래해`,
    lyricsSections: [{ type: 'verse', description: direction, content: '오늘을 노래해' }],
    vocalGender: 'm', personaId: 'offline_artist_123', durationSeconds: 195 }).input;
  assert.equal(input.prompt, '[Verse]\n오늘을 노래해');
  assert.ok(input.style.includes('부드러운 통기타 스트로크'));
  assert.equal(input.vocal_gender, 'm');
  assert.equal(input.persona_id, 'offline_artist_123');
  assert.equal(input.duration, 195);
});

test('unsafe unstructured legacy lyrics are rejected before any provider call', async () => {
  let calls = 0;
  await assert.rejects(submitKieSunoJob({ style: 'Trot', lyrics: '[male vocal, [gentle guitar] [brush drums]]\nSing tonight' },
    config, async () => { calls++; return successResponse({ task_id: 'must_not_submit' }); }), LyricsInstructionError);
  assert.equal(calls, 0);
});

test('automatic lyric mode retains the existing 3000 character style budget', () => {
  assert.equal(buildKieSunoRequest({ style: 'x'.repeat(2800), instrumental: false }).input.prompt.length, 2800);
});

test('instrumental preset submits V6 to the Market API with a real duration and exclusions', async () => {
  const result = await submitKieSunoJob({ style: 'Japanese city pop', title: 'Tokyo', instrumental: true,
    lyrics: '[Instrumental Intro]', exclude: 'vocals, distortion', durationSeconds: 210 }, config, async (url, init) => {
    assert.equal(url, 'https://api.kie.ai/api/v1/jobs/createTask');
    assert.equal(init.headers.Authorization, 'Bearer test-only-credential');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'ai-music-api/generate');
    assert.equal(body.input.model, 'V6');
    assert.equal(body.input.custom_mode, true);
    assert.equal(body.input.instrumental, true);
    assert.equal(body.input.style, 'Japanese city pop');
    assert.equal(body.input.negative_tags, 'vocals, distortion');
    assert.equal(body.input.duration, 210);
    return successResponse({ task_id: 'new-task' });
  });
  assert.deepEqual(result, { taskId: 'new-task', model: 'V6' });
});

test('custom vocal lyrics and shortform duration survive submission unchanged', () => {
  const input = buildKieSunoRequest({ style: 'Baile funk', lyrics: '[Verse]\n하루를 노래해', title: 'Funk',
    instrumental: false, vocalGender: 'f', durationSeconds: 28, model: 'v6-wild' }).input;
  assert.equal(input.prompt, '[Verse]\n하루를 노래해');
  assert.equal(input.custom_mode, true);
  assert.equal(input.vocal_gender, 'f');
  assert.equal(input.instrumental, false);
  assert.equal(input.duration, 28);
  assert.equal(input.model, 'V6_WILD');
});

test('registered voices use the documented V6 voice persona fields', () => {
  const input = buildKieSunoRequest({ style: 'Modern pop', lyrics: '[Verse]\nHello', title: 'Voice Test',
    instrumental: false, personaId: 'voice_profile_123456' }).input;
  assert.equal(input.persona_id, 'voice_profile_123456');
  assert.equal(input.persona_model, 'voice_persona');
});

test('instrumentals never receive a voice persona and malformed IDs are rejected', () => {
  const instrumental = buildKieSunoRequest({ style: 'Modern piano', instrumental: true,
    personaId: 'voice_profile_123456' }).input;
  assert.equal(instrumental.persona_id, undefined);
  assert.equal(instrumental.persona_model, undefined);
  assert.throws(() => buildKieSunoRequest({ style: 'Pop', lyrics: 'Hello', personaId: 'bad id!' }), /ID/);
});

test('vocal requests without lyrics use documented automatic lyric mode', () => {
  const input = buildKieSunoRequest({ style: 'Bossa nova', exclude: 'distortion', instrumental: false }).input;
  assert.equal(input.custom_mode, false);
  assert.equal(input.prompt, 'Bossa nova, avoid: distortion');
  assert.equal(input.style, undefined);
  assert.equal(input.duration, undefined);
});

test('retired presets move to V6 and active V6 variants stay selected', () => {
  for (const old of [undefined, 'v4.5+', 'v5.5', 'chirp-fenix', 'v6.0']) assert.equal(resolveSunoModel(old), 'V6');
  assert.equal(resolveSunoModel('v6-mini'), 'V6_MINI');
  assert.equal(resolveSunoModel('V6_WILD'), 'V6_WILD');
});

test('model limits do not silently truncate vocal lyrics', () => {
  assert.throws(() => buildKieSunoRequest({ style: 'Pop', lyrics: 'x'.repeat(5001) }), /5,000/);
  const body = buildKieSunoRequest({ style: 'a'.repeat(1200), title: 'b'.repeat(90), instrumental: true });
  assert.equal(body.input.style.length, 1000);
  assert.equal(body.input.title.length, 80);
});

test('natural full songs omit duration despite old metadata and retain voice persona and complete lyrics', () => {
  for (const instrumental of [false, true]) {
    const input = buildKieSunoRequest({ style: 'Organic complete composition', lyrics: '[Verse]\nAn original complete lyric',
      instrumental, naturalFullSong: true, durationSeconds: 195, personaId: 'offline_artist_123', vocalGender: 'm' }).input;
    assert.equal(Object.hasOwn(input, 'duration'), false);
    assert.equal(input.custom_mode, true);
    assert.equal(input.prompt, '[Verse]\nAn original complete lyric');
    assert.equal(input.persona_id, instrumental ? undefined : 'offline_artist_123');
  }
});

test('durations respect the 10–360 second bounds and do not default to a 20 second sketch', () => {
  assert.equal(resolveDurationSeconds('3:30'), 210);
  assert.equal(resolveDurationSeconds(360), 360);
  for (const value of [undefined, '', 0, 9, 361, 'full']) assert.equal(resolveDurationSeconds(value), 195);
});

test('API errors inside HTTP 200 do not accept a task and do not expose provider details', async () => {
  await assert.rejects(submitKieSunoJob({ style: 'Pop', instrumental: true }, config,
    async () => new Response(JSON.stringify({ code: 402, msg: 'PRIVATE_PROVIDER_DETAIL', data: { task_id: 'not-accepted' } }))), error => {
      assert.match(error.message, /402/);
      assert.ok(!error.message.includes('PRIVATE_PROVIDER_DETAIL'));
      return true;
    });
});

test('invalid or absent task IDs are rejected instead of storing a stuck generation', async () => {
  for (const task_id of [undefined, '', 'kie:bad', 'space bad']) {
    await assert.rejects(submitKieSunoJob({ style: 'Pop', instrumental: true }, config, async () => successResponse({ task_id })));
  }
});

test('both documented task ID spellings are accepted', async () => {
  const result = await submitKieSunoJob({ style: 'Pop', instrumental: true }, config, async () => successResponse({ taskId: 'camel-task' }));
  assert.equal(result.taskId, 'camel-task');
});

test('Kie references poll the Kie endpoint and complete both URL-only candidates', async () => {
  const result = await fetchSunoTask(kieTaskReference('kie-task'), config, async (url, init) => {
    assert.equal(url, 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=kie-task');
    assert.equal(init.cache, 'no-store');
    return successResponse({ state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://example.com/a.mp3', 'https://example.com/b.mp3'] }) });
  });
  assert.equal(result.state, 'complete');
  assert.equal(result.clips.length, 2);
  assert.equal(result.clips[1].audio_url, 'https://example.com/b.mp3');
  assert.equal(result.clips[0].duration, undefined);
});

test('Kie track metadata is normalized for the existing quality and cover pipeline', () => {
  const result = normalizeKieSunoStatus({ data: { state: 'success', resultJson: JSON.stringify({ resultObject: { data: [
    { id: 'a', audio_url: 'https://example.com/a.mp3', image_url: 'https://example.com/a.jpg', duration: 198.44 },
    { id: 'b', audioUrl: 'https://example.com/b.mp3', imageUrl: 'https://example.com/b.jpg', duration: '210' },
  ] } }) } }, 'task');
  assert.equal(result.state, 'complete');
  assert.equal(result.clips[0].duration, 198.44);
  assert.equal(result.clips[1].duration, 210);
  assert.equal(result.clips[1].image_url, 'https://example.com/b.jpg');
});

test('completed Kie V6 lyricsData yields both 28-second clips from resultJson and response', async () => {
  const output = { resultObject: { code: 200, message: 'success', taskId: 'v6-task', lyricsData: [
    { id: 'v6-a', title: '슬리퍼 배달 작전', audio_url: 'https://example.com/v6-a.mp3',
      image_url: 'https://example.com/v6-a.jpg', duration: 28 },
    { id: 'v6-b', title: '슬리퍼 배달 작전', audio_url: 'https://example.com/v6-b.mp3',
      image_url: 'https://example.com/v6-b.jpg', duration: 28 },
  ] } };
  for (const results of [{ resultJson: JSON.stringify(output), response: output }, { response: output }]) {
    const result = await fetchSunoTask('suno:kie:v6-task', config, async url => {
      assert.equal(url, 'https://api.kie.ai/api/v1/jobs/recordInfo?taskId=v6-task');
      return successResponse({ state: 'success', ...results });
    });
    assert.equal(result.state, 'complete');
    assert.equal(result.clips.length, 2);
    assert.deepEqual(result.clips.map(clip => ({ id: clip.id, status: clip.status,
      duration: clip.duration, audio_url: clip.audio_url, image_url: clip.image_url })), [
      { id: 'v6-a', status: 'complete', duration: 28, audio_url: 'https://example.com/v6-a.mp3', image_url: 'https://example.com/v6-a.jpg' },
      { id: 'v6-b', status: 'complete', duration: 28, audio_url: 'https://example.com/v6-b.mp3', image_url: 'https://example.com/v6-b.jpg' },
    ]);
  }
});

test('lyricsData still requires a downloadable audio URL for every completed candidate', () => {
  const result = normalizeKieSunoStatus({ data: { state: 'success', response: {
    resultObject: { lyricsData: [{ id: 'a', audio_url: 'https://example.com/a.mp3', duration: 28 },
      { id: 'b', stream_audio_url: 'https://example.com/b-stream', duration: 28 }] },
  } } }, 'task');
  assert.equal(result.state, 'failed');
  assert.equal(result.clips.length, 0);
});

test('queued and partially generated tasks wait until final success', () => {
  for (const state of ['waiting', 'queuing', 'generating']) {
    assert.equal(normalizeKieSunoStatus({ data: { state, resultJson: '{"resultUrls":["https://example.com/a.mp3"]}' } }, 'task').state, 'processing');
  }
});

test('terminal failures, corrupt results and missing downloadable URLs terminate generation', () => {
  for (const data of [{ state: 'fail' }, { state: 'success', resultJson: 'invalid' },
    { state: 'success', resultJson: '{"resultUrls":[]}' },
    { state: 'success', resultJson: '{"resultUrls":["data:invalid"]}' },
    { state: 'success', resultJson: '{"data":[{"stream_audio_url":"https://example.com/stream"}]}' }]) {
    assert.equal(normalizeKieSunoStatus({ data }, 'task').state, 'failed');
  }
});

test('legacy task references are held without any provider request', async () => {
  let networkCalls = 0;
  assert.deepEqual(parseSunoTaskReference('suno:old-task'), { provider: 'legacy', taskId: 'old-task' });
  const result = await fetchSunoTask('suno:old-task', undefined, async () => {
    networkCalls++;
    throw new Error('legacy network must stay disabled');
  });
  assert.deepEqual(result, { state: 'held', reason: 'legacy_not_supported', clips: [] });
  assert.equal(networkCalls, 0);
});

test('Kie configuration never falls back to the legacy SUNO_API_KEY', () => {
  const previous = { KIE_API_KEY: process.env.KIE_API_KEY, KIE_API_URL: process.env.KIE_API_URL,
    SUNO_API_KEY: process.env.SUNO_API_KEY, SUNO_API_URL: process.env.SUNO_API_URL };
  try {
    delete process.env.KIE_API_KEY;
    delete process.env.KIE_API_URL;
    process.env.SUNO_API_KEY = 'legacy-key-must-not-be-used';
    process.env.SUNO_API_URL = 'https://api.302.ai';
    assert.throws(() => getKieConfig(), /KIE_API_KEY/);
    process.env.KIE_API_KEY = 'kie-only-key';
    assert.deepEqual(getKieConfig(), { apiKey: 'kie-only-key', apiBaseUrl: 'https://api.kie.ai' });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Kie requests fail closed before fetch when configured for any non-official host', async () => {
  let networkCalls = 0;
  for (const apiBaseUrl of ['https://api.302.ai', 'https://api.kie.ai.evil.test',
    'http://api.kie.ai', 'https://api.kie.ai/v1']) {
    assert.throws(() => normalizeKieConfig({ apiKey: 'test-key', apiBaseUrl }), /공식 Kie API/);
    await assert.rejects(submitKieSunoJob({ style: 'Pop', instrumental: true },
      { apiKey: 'test-key', apiBaseUrl }, async () => { networkCalls++; return successResponse({ task_id: 'bad' }); }),
    /공식 Kie API/);
  }
  assert.equal(networkCalls, 0);
});

test('network/HTTP failures are surfaced without body contents', async () => {
  await assert.rejects(fetchSunoTask('suno:kie:task', config, async () => new Response('PRIVATE_BODY', { status: 401 })),
    error => error.code === 401 && !error.message.includes('PRIVATE_BODY'));
});

// PCM measurement belongs to the independently deployed worker analyzer, not this web release baseline.
