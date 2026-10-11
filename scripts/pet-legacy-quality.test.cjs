/** Offline v3 two-clip story-core analysis. All vision requests use injected fetch. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, filename);
const { reviewPetAsset, openingImageAnalysis } = require('../src/lib/video/petQuality.ts');
const { PET_QUALITY_POLICY_VERSION } = require('../src/lib/video/petQualityPolicy.ts');
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('External fetch forbidden in this offline test'); };
test.after(() => { globalThis.fetch = originalFetch; });
const keys = ['hook', 'story_core', 'reversal', 'identity', 'clarity'];
const frames = ['opening', 'middle', 'ending'].map(name => `https://images.x.ai/offline-${name}.jpg`);
function legacyJob() {
  const sourceContract = { version: 'pet-source-contract-v1',
    cast: { pet: 'silver tabby', humans: [{ id: 'H1', role: 'exhausted owner', adult: true }], requiredVisibleAdults: 1, humanPolicy: 'source_humans_must_be_recognizable' },
    relationship: 'The cat races beside its sleeping owner H1 and watches H1 wake.',
    coreAction: 'The cat races around at night while H1 sleeps.',
    reversal: 'H1 wakes and the cat abruptly acts innocent.',
    payoff: 'The cat holds an innocent calm loaf as exhausted H1 looks at it in disbelief.',
  };
  const actions = ['The cat dashes beside the bed while H1 sleeps.', 'The cat curves around the rug while H1 sleeps.', 'The cat hops onto the rug and dashes off while H1 sleeps.',
    'The cat makes its final curved dash and finishes alert at the rug edge; H1 remains asleep.',
    'H1 sits up awake while the cat freezes into a calm loaf; the music leaves a tiny silent reaction gap.',
    'The cat holds its calm loaf and slowly blinks at H1 while H1 looks down in fatigue and disbelief.'];
  let startSeconds = 0;
  const shots = [4, 5, 5, 6, 6, 4].map((durationSeconds, index) => {
    const shot = { id: `S${index + 1}`, startSeconds, durationSeconds, beat: `Beat ${index + 1}`, action: actions[index],
      camera: `Unneeded exact camera geometry ${index}`, keyframePrompt: `Unneeded opening pose ${index}`, videoPrompt: `SOURCE CONTRACT LOCK: ${JSON.stringify(sourceContract)}\n${actions[index]}`, caption: 'Original caption' };
    startSeconds += durationSeconds; return shot;
  });
  return { episode: { version: 'pet-v3', id: 'legacy-core-fixture', title: '새벽 세 시 무죄 오페라',
    sourceTopic: '새벽에 뛰어다니던 고양이가 지친 집사가 깨자 얌전해진다.', story: 'The cat performs a secret opera, then acts innocent when H1 wakes.', pov: 'owner_inner_voice',
    fingerprint: { prop: 'rug', conflict: 'night zoomies', twist: 'acts innocent' }, candidates: [],
    character: { species: 'cat', appearance: 'Detailed coat appearance specification', owner: 'H1, same adult owner in pajamas.', setting: 'Whole background lock and exact furniture geometry', continuity: ['Exactly one small rug beside the bed.', 'Precise pen appearance detail'] },
    shots, legacyProduction: { mode: 'two-clips', version: 'legacy-adapter-v1', clips: [
      { id: 'C1', startSeconds: 0, durationSeconds: 15, keyframePrompt: shots[0].keyframePrompt, videoPrompt: 'Full scene lock with 2 props and precise pen geometry' },
      { id: 'C2', startSeconds: 15, durationSeconds: 15, keyframePrompt: 'Extract C1 continuation frame', videoPrompt: 'Keep all detailed room locks; opera performer remains innocent' },
    ] },
  } };
}
function assessment(overrides = {}) {
  return { checks: Object.fromEntries(keys.map(key => [key, overrides[key] || { verdict: 'pass', evidence: '작성된 행동과 관계의 연결을 표본에서 읽을 수 있습니다.' }])) };
}
function responder(value = assessment()) {
  const calls = [];
  return { calls, apiKey: 'offline-fixture-key', fetch: async (url, options) => {
    calls.push({ url, options, request: JSON.parse(options.body) });
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-5.6-sol', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 123, output_tokens: 45 } }));
  } };
}

test('v3 analysis keeps story intent and only the timed actions included in each clip', async () => {
  const job = legacyJob(), original = structuredClone(job);
  for (const [index, selectedIds] of [[0, ['S1', 'S2', 'S3', 'S4']], [1, ['S4', 'S5', 'S6']]]) {
    const dependencies = responder();
    const result = await reviewPetAsset(job, index, 'video', frames, dependencies);
    assert.equal(dependencies.calls.length, 1);
    const { url, options, request } = dependencies.calls[0];
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.method, 'POST');
    assert.equal(request.model, 'gpt-5.6-sol'); assert.equal(request.max_output_tokens, 5000); assert.deepEqual(request.reasoning, { effort: 'low' });
    const expected = JSON.parse(request.input[0].content[0].text);
    assert.equal(expected.kind, 'video'); assert.equal(expected.clip, `C${index + 1}`);
    assert.equal(expected.sourceIntent, original.episode.sourceTopic);
    assert.deepEqual(expected.beats.map(beat => beat.id), selectedIds);
    assert.deepEqual(expected.evaluationScope, { type: 'clip_story_core', sourceStartSeconds: index * 15, durationSeconds: 15, sampledFrameCount: 3, identityReference: 'No opening image reference is supplied.' });
    const seam = expected.beats.find(beat => beat.id === 'S4');
    assert.equal(seam.sourceOffsetSeconds, index === 0 ? 0 : 1); assert.equal(seam.includedDurationSeconds, index === 0 ? 1 : 5);
    assert.equal(expected.coreStory.setup, original.episode.shots[0].action);
    assert.equal(expected.coreStory.coreAction, 'The cat races around at night while H1 sleeps.');
    assert.match(expected.coreStory.relationship, /sleeping owner H1/); assert.match(expected.coreStory.payoff, /looks at it in disbelief/);
    for (const field of ['inventory', 'character', 'frozenMotionPlan', 'castPlan', 'coreActor', 'title']) assert.equal(field in expected, false);
    assert.doesNotMatch(JSON.stringify(expected), /Whole background|Precise pen|exact camera|opening pose|scene lock|2 props|SOURCE CONTRACT LOCK/);
    assert.deepEqual(expected.cast.chosenIdentityContext, { pet: original.episode.character.appearance, humans: original.episode.character.owner });
    assert.deepEqual(request.input[0].content.slice(1), frames.map(image_url => ({ type: 'input_image', image_url, detail: 'high' })));
    assert.equal(request.input[0].content.length, 4);
    assert.equal(result.status, 'advisory'); assert.equal(result.decision, 'advisory'); assert.equal(result.analysisStatus, 'complete');
    assert.equal(result.frameCount, 3); assert.equal(result.scope, 'sampled_frames'); assert.equal(result.policyVersion, PET_QUALITY_POLICY_VERSION);
    assert.equal(result.model, 'gpt-5.6-sol'); assert.deepEqual(result.usage, { inputTokens: 123, outputTokens: 45 });
  }
  assert.deepEqual(job, original, 'Analysis does not alter saved generation prompts, character or audio');
});
test('H1 remains an explicit human role, separate from the cat and its authored reaction', async () => {
  const dependencies = responder();
  await reviewPetAsset(legacyJob(), 1, 'video', frames, dependencies);
  const request = dependencies.calls[0].request, expected = JSON.parse(request.input[0].content[0].text);
  assert.deepEqual(expected.cast.pet, { kind: 'pet', species: 'cat' });
  assert.deepEqual(expected.cast.humans, [{ id: 'H1', kind: 'human', role: 'exhausted owner' }]);
  assert.match(expected.beats[1].action, /^H1 sits up awake/); assert.match(expected.beats[1].action, /cat freezes into a calm loaf/);
  assert.doesNotMatch(expected.beats[1].action, /music|silent reaction gap/);
  assert.match(request.instructions, /including H1, are HUMAN roles, separate from the pet/);
  assert.match(request.instructions, /never assign it to the pet/); assert.match(request.instructions, /A calm or held reaction can be appropriate/);
});
test('an empty old source human list still maps the authored H1 owner to a human', async () => {
  const job = legacyJob();
  for (const shot of job.episode.shots) {
    const prefix = 'SOURCE CONTRACT LOCK: ';
    const [line, ...rest] = shot.videoPrompt.split('\n');
    const contract = JSON.parse(line.slice(prefix.length)); contract.cast.humans = [];
    shot.videoPrompt = `${prefix}${JSON.stringify(contract)}\n${rest.join('\n')}`;
  }
  const dependencies = responder();
  await reviewPetAsset(job, 1, 'video', frames, dependencies);
  const expected = JSON.parse(dependencies.calls[0].request.input[0].content[0].text);
  assert.deepEqual(expected.cast.humans, [{ id: 'H1', kind: 'human', role: 'authored owner' }]);
  assert.equal(expected.cast.pet.kind, 'pet');
});
test('analysis instructions focus on causal story suggestions without prop inspection or guarantees', async () => {
  const dependencies = responder();
  await reviewPetAsset(legacyJob(), 1, 'video', frames, dependencies);
  const instructions = dependencies.calls[0].request.instructions;
  assert.match(instructions, /connection to the user's authored core story/); assert.match(instructions, /concrete improvement/);
  assert.match(instructions, /not pen details, incidental duplicate props, fine appearance specifications, furniture geometry, whole-background locks/);
  assert.match(instructions, /A story metaphor does not require literal props/);
  assert.match(instructions, /only an obvious visible change.*that confuses that relationship/);
  assert.match(instructions, /do not infer hidden features or require a face/);
  assert.match(instructions, /chosenIdentityContext and optional image reference/);
  assert.match(instructions, /not exact hairstyle, wardrobe, markings or beauty requirements/);
  assert.match(instructions, /cannot verify complete C1-to-C2 continuity/);
  assert.match(instructions, /Do not claim to have seen motion between stills/); assert.match(instructions, /or promise viral performance/);
  assert.match(instructions, /If these samples cannot establish/); assert.match(instructions, /C1 need not contain a later reversal\/payoff/);
  assert.doesNotMatch(instructions, /Inspect inventory|fails continuity|fails progression|exact seating.*requirements/);
});
test('all legacy story concerns remain advisory; unclear frames suggest improvements without blocking', async () => {
  for (const [key, verdict, evidence] of [
    ['story_core', 'fail', '야간 질주의 원인과 반응이 끊깁니다. 집사가 깨기 전 질주의 결과를 보여주세요.'],
    ['identity', 'fail', '집사가 다른 사람처럼 보여 관계가 흐려집니다. 반응 장면에서 동일 인물임을 읽히게 해주세요.'],
    ['reversal', 'uncertain', '깨어난 집사와 얌전해진 고양이의 연결은 세 표본만으로 불명확합니다. 두 반응을 함께 보여주세요.'],
  ]) {
    const dependencies = responder(assessment({ [key]: { verdict, evidence } }));
    const result = await reviewPetAsset(legacyJob(), 1, 'video', frames, dependencies);
    assert.equal(result.status, 'advisory'); assert.equal(result.decision, 'advisory');
    assert.equal(result.checks[key].verdict, verdict); assert.equal(result.issues.length, 1); assert.ok(result.issues[0].includes(evidence));
    assert.equal(dependencies.calls.length, 1);
  }
});
test('both legacy opening slots are unexamined with zero paid requests and no extra reference samples', async () => {
  const job = legacyJob(), original = structuredClone(job);
  for (const index of [0, 1]) {
    const dependencies = responder();
    const result = await reviewPetAsset(job, index, 'image', [], dependencies);
    assert.deepEqual(result, openingImageAnalysis(job, index)); assert.equal(dependencies.calls.length, 0);
    assert.equal(result.status, 'advisory'); assert.equal(result.analysisStatus, 'not_applicable'); assert.equal(result.scope, 'not_evaluated');
    assert.equal(result.frameCount, 0); assert.equal(result.usage.inputTokens, 0); assert.equal(result.usage.outputTokens, 0); assert.deepEqual(result.issues, []);
  }
  assert.deepEqual(job, original);
});
test('video rejects wrong frame counts and unsafe URLs before a request', async () => {
  for (const count of [0,1,2,4]) {
    const dependencies = responder();
    await assert.rejects(reviewPetAsset(legacyJob(), 0, 'video', Array.from({ length: count }, (_, i) => frames[i % 3]), dependencies), error => error.code === 'QUALITY_FRAMES');
    assert.equal(dependencies.calls.length, 0);
  }
  const dependencies = responder();
  await assert.rejects(reviewPetAsset(legacyJob(), 0, 'video', ['https://127.0.0.1/private.jpg', ...frames.slice(1)], dependencies), error => error.code === 'MEDIA_HOST');
  assert.equal(dependencies.calls.length, 0);
});
test('missing checks, invalid provider JSON and network errors retain bounded quality errors without retry', async () => {
  const malformed = responder({ checks: {} });
  await assert.rejects(reviewPetAsset(legacyJob(), 0, 'video', frames, malformed), error => error.code === 'QUALITY_RESPONSE');
  assert.equal(malformed.calls.length, 1);
  let jsonCalls = 0;
  await assert.rejects(reviewPetAsset(legacyJob(), 0, 'video', frames, { apiKey: 'fixture', fetch: async () => { jsonCalls++; return new Response('invalid provider JSON'); } }), error => error.code === 'QUALITY_RESPONSE');
  assert.equal(jsonCalls, 1);
  let networkCalls = 0;
  await assert.rejects(reviewPetAsset(legacyJob(), 0, 'video', frames, { apiKey: 'fixture', fetch: async () => { networkCalls++; throw new Error('offline simulated failure'); } }), error => error.code === 'QUALITY_NETWORK');
  assert.equal(networkCalls, 1);
});
