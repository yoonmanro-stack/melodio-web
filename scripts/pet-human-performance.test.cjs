/** Offline performance routing and persisted-production regression tests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(relative) {
  const filename = path.join(root, relative);
  const module = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', 'process', compiled)(name => {
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
    if (name === 'node:crypto') return require(name);
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports, process);
  return module.exports;
}

const { compileLegacyPetClips } = load('src/lib/vle/petLegacyTwoClip.ts');
const { getPetProductionShots } = load('src/lib/vle/petEpisode.ts');
const { derivePetSourceContract, petSourceContractLock } = load('src/lib/vle/petPlanner.ts');
const {
  PET_PERFORMANCE_POLICY, PET_HUMAN_REACTION_DIRECTION, PET_ANIMAL_REACTION_DIRECTION,
  buildPetPerformanceDirection,
} = load('src/lib/vle/petPerformanceDirection.ts');

function fixture() {
  let startSeconds = 0;
  const actions = [
    'The adult cat approaches the single red ball.',
    'The cat gently nudges the ball toward the sofa.',
    'The cat carries the ball in its mouth.',
    'The cat places the ball beside the sofa.',
    'The cat looks at the ball.',
    'The cat rests beside the ball.',
  ];
  return {
    version: 'pet-v3', id: 'performance-fixture', title: '반응 테스트',
    sourceTopic: 'Without humans, an adult cat moves a red ball beside the sofa and rests.',
    story: actions.join(' '), pov: 'pet_inner_voice', candidates: [],
    fingerprint: { prop: 'ball', conflict: 'play', twist: 'rest' },
    character: {
      species: 'cat', appearance: 'One adult orange tabby with a white chin and amber eyes.',
      owner: 'No humans. The cat acts alone.', setting: 'One living room with a grey sofa.',
      continuity: ['Same orange tabby markings.', 'One red ball.'],
    },
    lyrics: '[Verse]\n저장된 가사', stylePrompt: 'Recorded style', models: [], createdAt: '2026-09-17T00:00:00Z',
    shots: [4, 5, 5, 6, 6, 4].map((durationSeconds, index) => {
      const shot = {
        id: `S${index + 1}`, startSeconds, durationSeconds, beat: `비트 ${index + 1}`, caption: `가사 ${index + 1}`,
        action: actions[index], camera: 'Low natural view of the cat, ball and sofa.',
        keyframePrompt: `Saved starting arrangement ${index + 1}.`, videoPrompt: `Authored motion ${index + 1}.`,
      };
      startSeconds += durationSeconds;
      return shot;
    }),
  };
}

function lockSource(episode) {
  const lock = petSourceContractLock(derivePetSourceContract(episode.sourceTopic, episode.character.species));
  for (const shot of episode.shots) {
    shot.keyframePrompt = `${lock}\n${shot.keyframePrompt}`;
    shot.videoPrompt = `${lock}\n${shot.videoPrompt}`;
  }
  return episode;
}

function assertDirections(clips, hasHumans) {
  for (const clip of clips) {
    assert.equal(clip.videoPrompt.includes(PET_HUMAN_REACTION_DIRECTION), hasHumans);
    assert.ok(clip.videoPrompt.includes(PET_ANIMAL_REACTION_DIRECTION));
    assert.doesNotMatch(clip.videoPrompt, /without human facial expressions/);
    assert.ok(clip.videoPrompt.length <= 4096);
  }
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('performance defaults distinguish human response from species-native animal affect', () => {
  assert.equal(PET_PERFORMANCE_POLICY, 'pet-human-reaction-v1');
  assert.match(buildPetPerformanceDirection(true), /authored sleep, serious emotions and off-screen presence/i);
  assert.match(buildPetPerformanceDirection(true), /no speech lip-sync/i);
  assert.match(buildPetPerformanceDirection(true), /never human smiles, frowns or talking lips on the pet/i);
  assert.doesNotMatch(buildPetPerformanceDirection(false), /HUMAN PERFORMANCE:/);
  assert.match(buildPetPerformanceDirection(false), /ANIMAL AFFECT:/);
});

test('future compilation of a saved sleeping-owner plan allows earned human reactions without rewriting the plan', () => {
  const episode = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/modern-pet-plan-20260916.json'), 'utf8'));
  const original = structuredClone(episode);
  const [first, second] = compileLegacyPetClips(freeze(episode));
  assertDirections([first, second], true);
  assert.deepEqual(episode, original);
  assert.equal(first.keyframePrompt, original.shots[0].keyframePrompt, 'Saved opening arrangement stays authored.');
  assert.match(first.videoPrompt, /H1 sleeps in the bed/);
  assert.match(first.videoPrompt, /H1’s eyes open slowly/);
  for (const clip of [first, second]) {
    assert.ok(clip.videoPrompt.includes(original.character.owner), 'The same frozen owner profile survives both clips.');
  }
});

test('a source-locked no-human story keeps animal reactions without introducing human performance', () => {
  const episode = lockSource(fixture());
  const original = structuredClone(episode);
  const clips = compileLegacyPetClips(freeze(episode));
  assertDirections(clips, false);
  assert.deepEqual(episode, original);
  assert.equal(clips[0].keyframePrompt, original.shots[0].keyframePrompt);
  for (const clip of clips) assert.ok(clip.videoPrompt.includes(original.character.appearance));
});

test('two authored adults keep their individual identities and readable reactions through C1 and C2', () => {
  const episode = fixture();
  episode.sourceTopic = 'A husband and wife watch their cat move a red ball beside the sofa, then exchange an amused smile.';
  episode.character.owner = 'H1 husband: adult man, square face, short black hair, navy sweater. H2 wife: adult woman, oval face, black bob, cream cardigan.';
  episode.character.continuity.push('H1 and H2 keep these same identities throughout.');
  episode.shots[1].action += ' H1 raises his brows while H2 follows the cat with her gaze.';
  episode.shots[5].action += ' H1 and H2 exchange an amused smile.';
  lockSource(episode);
  const original = structuredClone(episode);
  const clips = compileLegacyPetClips(freeze(episode));
  assertDirections(clips, true);
  assert.deepEqual(episode, original);
  for (const clip of clips) assert.ok(clip.videoPrompt.includes(original.character.owner));
  assert.ok(clips[0].videoPrompt.includes(original.shots[1].action));
  assert.ok(clips[1].videoPrompt.includes(original.shots[5].action));
});

test('retrieving stored legacyProduction preserves its exact prompts and saved opening assets', () => {
  const episode = fixture();
  episode.legacyProduction = { mode: 'two-clips', version: 'legacy-adapter-v1', clips: [
    { id: 'C1', startSeconds: 0, durationSeconds: 15, action: 'Stored action one.', camera: 'Stored camera one.', beat: '기존 비트', caption: '', keyframePrompt: 'Saved opening image prompt.', videoPrompt: 'Persisted older direction: without human facial expressions.', keyframeUrl: 'saved-opening-image' },
    { id: 'C2', startSeconds: 15, durationSeconds: 15, action: 'Stored action two.', camera: 'Stored camera two.', beat: '기존 끝', caption: '', keyframePrompt: 'Saved extracted bridge prompt.', videoPrompt: 'Persisted older continuation.', keyframeUrl: 'saved-bridge-image' },
  ] };
  const original = structuredClone(episode);
  freeze(episode);
  const production = getPetProductionShots(episode);
  assert.strictEqual(production, episode.legacyProduction.clips, 'Existing stored clips are returned directly.');
  assert.deepEqual(production, original.legacyProduction.clips);
  assert.deepEqual(episode, original);
  assert.ok(!production.some(clip => clip.videoPrompt.includes(PET_HUMAN_REACTION_DIRECTION)));
});
