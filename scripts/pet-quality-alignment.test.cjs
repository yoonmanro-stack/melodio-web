/** Offline integration: advisory intervals follow the actual saved v3 motion timing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, filename);
const { reviewPetAsset } = require('../src/lib/video/petQuality.ts');
const { measurePetAudioAlignment } = require('../src/lib/video/petAudioAlignment.ts');
const { compileLegacyPetClips } = require('../src/lib/vle/petLegacyTwoClip.ts');
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('External fetch forbidden in this offline test'); };
test.after(() => { globalThis.fetch = originalFetch; });
const frames = [1, 2, 3].map(index => `https://images.x.ai/offline-timing-${index}.jpg`);
function fixture() {
  let startSeconds = 0;
  const episode = { version: 'pet-v3', id: 'timed-v3-review', title: '고양이와 집사', sourceTopic: '고양이가 집사를 깨운 뒤 다시 눕는다',
    story: '고양이가 집사를 깨운 뒤 다시 눕는다', pov: 'owner_inner_voice', fingerprint: { prop: '담요', conflict: '늦잠', twist: '다시 잠듦' }, candidates: [],
    character: { species: 'cat', appearance: 'One adult tabby cat.', owner: 'H1, one adult owner in grey pajamas.', setting: 'One bedroom.', continuity: [] },
    shots: [4, 5, 5, 6, 6, 4].map((durationSeconds, index) => {
      const shot = { id: `S${index + 1}`, startSeconds, durationSeconds, beat: `Beat ${index + 1}`, action: `Authored physical action ${index + 1}.`,
        caption: `장면 ${index + 1}`, camera: 'Steady medium view.', keyframePrompt: `Original image ${index + 1}`, videoPrompt: `Original motion ${index + 1}` };
      startSeconds += durationSeconds; return shot;
    }),
  };
  episode.legacyProduction = { mode: 'two-clips', version: 'legacy-adapter-v1', clips: compileLegacyPetClips(episode) };
  const events = Array.from({ length: 52 }, (_, index) => Number((index * 0.5 + 0.12).toFixed(3)));
  const alignment = measurePetAudioAlignment(episode, 26, { onsetSeconds: events, beatSeconds: events, bpm: 120, confidence: 0.8,
    method: 'energy-autocorrelation', ending: { status: 'clean', reasons: ['decaying-ending'], tailRmsRatio: 0.1, terminalRms: 0.001 } });
  return { episode, state: { audio: { alignment },
    productionMotionPrompts: compileLegacyPetClips(episode, { actionStartSeconds: alignment.actionStarts.map(action => action.seconds) }).map(clip => clip.videoPrompt),
    shots: [{ keyframeUrl: 'https://images.x.ai/offline-opening-identity.jpg' }, {}],
  } };
}
function responder() {
  const calls = [];
  return { calls, apiKey: 'offline-stub', fetch: async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const assessment = { checks: Object.fromEntries(['hook', 'story_core', 'reversal', 'identity', 'clarity'].map(key => [key, { verdict: 'pass', evidence: '표본에서 핵심 행동이 보입니다.' }])) };
    return Response.json({ status: 'completed', model: 'gpt-5.6-sol', output: [{ content: [{ type: 'output_text', text: JSON.stringify(assessment) }] }],
      usage: { input_tokens: 100, output_tokens: 50 } });
  } };
}

test('v3 review uses persisted measured action windows and preserves frozen editorial timing plus opening identity', async () => {
  const job = fixture(), before = structuredClone(job);
  for (const index of [0, 1]) {
    const deps = responder(); await reviewPetAsset(job, index, 'video', frames, deps);
    assert.equal(deps.calls.length, 1);
    const body = deps.calls[0], expected = JSON.parse(body.input[0].content[0].text);
    assert.equal(expected.evaluationScope.actionTimingBasis, 'persisted_measured_production_intent');
    for (const beat of expected.beats) {
      const source = job.episode.shots.find(shot => shot.id === beat.id);
      const timing = job.state.audio.alignment.actionStarts.find(action => action.shotId === beat.id);
      assert.equal(beat.clipStartSeconds, Math.max(0, Number((timing.seconds - index * 15).toFixed(3))));
      assert.deepEqual(beat.sourceEditorialTiming, { startSeconds: source.startSeconds, durationSeconds: source.durationSeconds });
    }
    if (index === 1) {
      const finale = expected.beats.find(beat => beat.id === 'S6');
      assert.equal(finale.clipStartSeconds, 8.62); assert.equal(finale.sourceEditorialTiming.startSeconds, 26);
      assert.deepEqual(body.input[0].content.filter(item => item.type === 'input_image').map(item => item.image_url), [...frames, job.state.shots[0].keyframeUrl]);
    }
  }
  assert.deepEqual(job, before);
});

test('saved/fallback or unapplied timing retains old editorial intervals without invented synchronization', async () => {
  for (const mutation of [job => { delete job.state.audio.alignment; }, job => { job.state.audio.alignment.appliedToMotionPrompts = false; },
    job => { delete job.state.productionMotionPrompts; }, job => { job.state.audio.alignment.actionStarts[3].seconds = 15.5; }]) {
    const job = fixture(); mutation(job); const before = structuredClone(job), deps = responder();
    await reviewPetAsset(job, 1, 'video', frames, deps);
    const expected = JSON.parse(deps.calls[0].input[0].content[0].text), finale = expected.beats.find(beat => beat.id === 'S6');
    assert.equal(expected.evaluationScope.actionTimingBasis, undefined); assert.equal(finale.clipStartSeconds, 11);
    assert.equal(finale.sourceEditorialTiming, undefined); assert.deepEqual(job, before);
  }
});
