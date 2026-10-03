/** Offline story-core analysis regressions. No provider calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
const { parsePetQualityAssessment, reviewPetAsset, openingImageAnalysis } = require('../src/lib/video/petQuality.ts');
const { PET_QUALITY_POLICY_VERSION, PET_OBSOLETE_OPENING_IMAGE_POLICY_VERSIONS, PET_OBSOLETE_C2_VIDEO_POLICY_VERSION } = require('../src/lib/video/petQualityPolicy.ts');
const keys = ['hook', 'story_core', 'reversal', 'identity', 'clarity'];
const good = () => ({ checks: Object.fromEntries(keys.map(key => [key, { verdict: 'pass', evidence: '표본에서 작성된 행동과 반응의 연결을 읽을 수 있습니다.' }])) });
const job = () => ({ episode: { version: 'pet-v4', sourceTopic: '고양이가 슬리퍼를 숨기고 주인의 반응을 본다.', character: { species: 'cat', owner: 'adult owner' }, production: { mode: 'two-clips', clips: [{ id: 'C1', startSeconds: 0, durationSeconds: 15, beatIds: ['S1'] }], actors: [], inventory: [{ description: 'Unneeded geometry and details', count: 3 }], actorId: 'A1', actor: 'pet and owner', coreAction: 'hide a slipper', payoff: 'owner notices the cat' }, shots: [{ id: 'S1', startSeconds: 0, durationSeconds: 15, beat: 'setup', action: 'Cat hides the slipper.' }] } });
test('all negative story-core verdicts remain advisory with meaningful improvements', () => {
  for (const key of keys) for (const verdict of ['fail', 'uncertain']) {
    const assessment = good();
    assessment.checks[key] = { verdict, evidence: '숨긴 행동과 주인의 반응이 연결되지 않습니다. 반응 직전에 숨긴 위치를 보여주세요.' };
    const result = parsePetQualityAssessment(assessment, 'video');
    assert.equal(result.status, 'advisory'); assert.equal(result.decision, 'advisory');
    assert.equal(result.analysisStatus, 'complete'); assert.equal(result.scope, 'sampled_frames');
    assert.equal(result.continuityScope, 'current_clip_samples_only'); assert.match(result.reason, /C1→C2의 전체 연속성/);
    assert.equal(result.issues.length, 1); assert.match(result.issues[0], /반응 직전에/);
  }
});
test('any check may be outside a clip and not_applicable never creates a concern', () => {
  const assessment = good();
  for (const key of keys) assessment.checks[key] = { verdict: 'not_applicable', evidence: '이 클립의 해당 비트에는 포함되지 않습니다.' };
  const result = parsePetQualityAssessment(assessment);
  assert.equal(result.status, 'advisory'); assert.deepEqual(result.issues, []);
});
test('malformed and obsolete detail checks are rejected without reporting a successful analysis', () => {
  for (const assessment of [{}, { checks: {} }, { checks: { inventory: { verdict: 'pass', evidence: '소품' } } }]) assert.throws(() => parsePetQualityAssessment(assessment), error => error.code === 'QUALITY_RESPONSE');
  const extra = good(); extra.checks.inventory = { verdict: 'pass', evidence: '소품' };
  assert.throws(() => parsePetQualityAssessment(extra), error => error.code === 'QUALITY_RESPONSE');
  const oversized = good(); oversized.checks.hook.evidence = '긴'.repeat(701);
  assert.throws(() => parsePetQualityAssessment(oversized), error => error.code === 'QUALITY_RESPONSE');
});
test('analysis evidence and displayed issues fit the pipeline storage bounds', () => {
  const assessment = good(); assessment.checks.story_core = { verdict: 'uncertain', evidence: '한'.repeat(450) };
  assert.ok(parsePetQualityAssessment(assessment).issues.every(issue => issue.length <= 500));
  assessment.checks.story_core.evidence += '한';
  assert.throws(() => parsePetQualityAssessment(assessment), error => error.code === 'QUALITY_RESPONSE');
});
test('opening image helper is pure and image review reads neither frames nor provider configuration', async () => {
  const fixture = job(), before = structuredClone(fixture);
  const dependencies = { get apiKey() { throw new Error('A still must not read a key'); }, fetch: async () => { throw new Error('A still must not request a provider'); } };
  const expected = openingImageAnalysis(fixture, 0);
  for (const frames of [[], ['not a media URL'], ['unused', 'unused']]) assert.deepEqual(await reviewPetAsset(fixture, 0, 'image', frames, dependencies), expected);
  assert.equal(expected.status, 'advisory'); assert.equal(expected.analysisStatus, 'not_applicable');
  assert.equal(expected.scope, 'not_evaluated'); assert.equal(expected.frameCount, 0); assert.deepEqual(expected.usage, { inputTokens: 0, outputTokens: 0 });
  assert.deepEqual(expected.issues, []); assert.match(expected.reason, /판단할 수 없습니다/); assert.deepEqual(fixture, before);
  assert.deepEqual(openingImageAnalysis(fixture, 0), expected);
});
test('policy marks both known opening gate versions obsolete and preserves the deployed C2 guard', () => {
  assert.equal(PET_QUALITY_POLICY_VERSION, 'pet-story-core-analysis-v1');
  assert.deepEqual(PET_OBSOLETE_OPENING_IMAGE_POLICY_VERSIONS, ['pet-asset-review-v2-opening-actor', 'pet-asset-review-v3-physical-beats']);
  assert.equal(PET_OBSOLETE_C2_VIDEO_POLICY_VERSION, 'pet-asset-review-v2-opening-actor');
});
test('video uses the same model and exactly three supplied samples once, without added references', async () => {
  const frames = [1,2,3].map(id => `https://images.x.ai/offline-story-${id}.jpg`); let calls = 0;
  const response = await reviewPetAsset(job(), 0, 'video', frames, { apiKey: 'fixture', fetch: async (url, options) => {
    calls++; const body = JSON.parse(options.body);
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(body.model, 'gpt-5.6-sol'); assert.equal(body.max_output_tokens, 5000); assert.deepEqual(body.reasoning, { effort: 'low' });
    assert.deepEqual(body.input[0].content.slice(1), frames.map(image_url => ({ type: 'input_image', image_url, detail: 'high' })));
    assert.deepEqual(body.text.format.schema.properties.checks.required, keys);
    assert.match(body.instructions, /no finding blocks production/); assert.match(body.instructions, /not pen details, object counts/);
    assert.match(body.instructions, /Do not claim to have seen motion between stills/); assert.match(body.instructions, /or promise viral performance/);
    assert.doesNotMatch(body.input[0].content[0].text, /inventory|geometry|count|keyframePrompt|videoPrompt|before|after/);
    return new Response(JSON.stringify({ status: 'completed', model: 'gpt-5.6-sol', output: [{ content: [{ type: 'output_text', text: JSON.stringify(good()) }] }], usage: { input_tokens: 100, output_tokens: 50 } }));
  } });
  assert.equal(calls, 1); assert.equal(response.status, 'advisory'); assert.equal(response.frameCount, 3); assert.deepEqual(response.usage, { inputTokens: 100, outputTokens: 50 });
  await assert.rejects(reviewPetAsset(job(), 0, 'video', frames, { apiKey: 'fixture', fetch: async () => { calls++; throw new Error('network'); } }), error => error.code === 'QUALITY_NETWORK');
  assert.equal(calls, 2);
});
test('Sol advisory refuses mislabeled or unaccounted responses without retrying a lower model', async () => {
  const frames = [1,2,3].map(id => `https://images.x.ai/offline-model-${id}.jpg`);
  for (const replacement of [{ model: 'gpt-4o-mini' }, { model: undefined }, { usage: undefined }, { status: 'incomplete' }]) {
    let calls = 0;
    await assert.rejects(reviewPetAsset(job(), 0, 'video', frames, { apiKey: 'fixture', fetch: async (url, options) => {
      calls++; assert.equal(JSON.parse(options.body).model, 'gpt-5.6-sol');
      return new Response(JSON.stringify({ status: 'completed', model: 'gpt-5.6-sol', output: [{ content: [{ type: 'output_text', text: JSON.stringify(good()) }] }], usage: { input_tokens: 100, output_tokens: 50 }, ...replacement }));
    } }), error => error.code === 'QUALITY_RESPONSE');
    assert.equal(calls, 1);
  }
});
