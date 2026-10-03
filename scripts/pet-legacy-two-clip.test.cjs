const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative) {
  const filename = path.resolve(__dirname, '..', relative);
  const moduleUnderTest = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', compiled)(name => {
    if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${name}.ts`)));
    throw new Error(`Unexpected runtime dependency: ${name}`);
  }, moduleUnderTest, moduleUnderTest.exports);
  return moduleUnderTest.exports;
}
const { compileLegacyPetClips, getLegacyPetStoryContract, PetLegacyCompilationError } = load('src/lib/vle/petLegacyTwoClip.ts');
const { PET_HUMAN_REACTION_DIRECTION, PET_ANIMAL_REACTION_DIRECTION } = load('src/lib/vle/petPerformanceDirection.ts');

function fixture() {
  let start = 0;
  const actions = [
    'The adult dog lifts slipper A in its mouth; slipper B stays beside the sofa.',
    'The dog carries slipper A toward the sofa while slipper B stays in place.',
    'The dog places slipper A on the floor in front of the sofa.',
    'The dog slowly pushes slipper A under the sofa with its nose; only the dog moves it.',
    'The dog pulls slipper A out from under the sofa; slipper B does not move.',
    'The dog holds slipper A in its mouth and looks at the camera.',
  ];
  return {
    version: 'pet-v3', id: 'legacy-fixture', title: '기존 콘티', sourceTopic: '강아지와 슬리퍼',
    story: '강아지가 숨겼던 슬리퍼를 직접 물고 돌아온다.', pov: 'owner_inner_voice',
    fingerprint: { prop: 'slippers', conflict: 'missing', twist: 'self_exposure' }, candidates: [],
    character: {
      species: 'dog', appearance: 'One adult tan dog with natural proportions.',
      owner: 'One owner entirely off screen; no human body part enters the frame.',
      setting: 'One beige sofa in the same living room.',
      continuity: ['Exactly two blue slippers exist: A and B.', 'Only the dog moves slipper A; B remains beside the sofa.'],
    },
    lyrics: '[Verse]\n기존 녹음 가사는 그대로', stylePrompt: 'Existing recorded style', models: [], createdAt: '2026-09-15T00:00:00Z',
    shots: [4, 5, 5, 6, 6, 4].map((durationSeconds, index) => {
      const shot = {
        id: `S${index + 1}`, startSeconds: start, durationSeconds, beat: `비트 ${index + 1}`,
        caption: `기존 자막 ${index + 1}`, action: actions[index],
        camera: ['Low wide shot.', 'Gently track the dog.', 'Close view of the floor.', 'Low view of the sofa gap.', 'Widen from the gap.', 'Hold the dog and both slippers in frame.'][index],
        keyframePrompt: `Original S${index + 1} starting-frame prompt`,
        videoPrompt: `REDUNDANT ORIGINAL PROMPT ${index + 1} `.repeat(100),
      };
      start += durationSeconds;
      return shot;
    }),
  };
}

test('compilation preserves source identity, recorded lyrics, captions and all editorial timings', () => {
  const episode = fixture();
  const original = structuredClone(episode);
  const clips = compileLegacyPetClips(episode);
  assert.deepEqual(episode, original);
  assert.deepEqual(clips.map(clip => [clip.id, clip.startSeconds, clip.durationSeconds]), [['C1', 0, 15], ['C2', 15, 15]]);
  assert.equal(clips[0].keyframePrompt, original.shots[0].keyframePrompt);
  assert.match(clips[1].keyframePrompt, /frame extracted from C1/);
  assert.match(clips[1].keyframePrompt, /Do not generate a new image/);
  clips[0].action = 'caller edit';
  assert.deepEqual(episode, original);
});

test('opening and both clips retain a concrete owner profile and natural animal reaction direction', () => {
  const episode = fixture();
  const profile = 'H1, one woman in her 30s, chin-length black bob, oval face, pale grey collared pajamas.';
  episode.character.owner = profile;
  episode.shots[0].keyframePrompt = `${profile} H1 sleeps in bed behind the dog.`;
  const original = structuredClone(episode);
  const clips = compileLegacyPetClips(episode);
  assert.deepEqual(episode, original);
  assert.ok(clips[0].keyframePrompt.includes(profile));
  for (const clip of clips) {
    assert.ok(clip.videoPrompt.includes(`OWNER: ${profile}`));
    assert.match(clip.videoPrompt, /gender, age, face, hair and clothes/);
    assert.ok(clip.videoPrompt.includes(PET_HUMAN_REACTION_DIRECTION));
    assert.ok(clip.videoPrompt.includes(PET_ANIMAL_REACTION_DIRECTION));
    assert.doesNotMatch(clip.videoPrompt, /without human facial expressions/);
  }
});

test('literal caption or inner-thought endings stay in the episode but not generated visual ending directives', () => {
  const episode = sleepingCatFixture();
  episode.fingerprint.payoff = '속마음은 ‘왜 깨워? 난 계속 잤는데.’';
  const lock = `SOURCE CONTRACT LOCK: ${JSON.stringify({
    version: 'pet-source-contract-v1',
    cast: { pet: 'cat', humans: [{ id: 'H1', role: 'owner', adult: true }], requiredVisibleAdults: 1, humanPolicy: 'recognizable owner' },
    relationship: 'owner and cat', coreAction: 'cat zoomies',
    reversal: '자막과 마지막 가사: 왜 깨워', payoff: '자막과 마지막 가사: 왜 깨워',
  })}`;
  episode.shots.forEach(shot => { shot.videoPrompt = lock; });
  const original = structuredClone(episode);
  const [, second] = compileLegacyPetClips(episode);
  assert.deepEqual(episode, original);
  assert.equal(getLegacyPetStoryContract(episode).reversal, '자막과 마지막 가사: 왜 깨워');
  assert.doesNotMatch(second.videoPrompt, /왜 깨워|난 계속 잤는데/);
  assert.match(second.videoPrompt, /REVERSAL: Use the physical change and reaction authored in the timed S5–S6 actions/);
  assert.match(second.videoPrompt, /ACTION: H1 wakes and looks at the cup/);
  assert.match(second.videoPrompt, /ACTION: The cat loafs on H1 chest/);
});

test('exact interval intersections cover 30 seconds without retiming or replaying S4', () => {
  const clips = compileLegacyPetClips(fixture());
  const parse = clip => [...clip.videoPrompt.matchAll(/\[(\d+)-(\d+)s\] (S\d); source (\d+)-(\d+)\/(\d+)s\./g)]
    .map(match => ({ localStart: +match[1], localEnd: +match[2], id: match[3], sourceStart: +match[4], sourceEnd: +match[5], duration: +match[6] }));
  const first = parse(clips[0]);
  const second = parse(clips[1]);
  assert.deepEqual(first.map(segment => [segment.id, segment.localStart, segment.localEnd, segment.sourceStart, segment.sourceEnd]),
    [['S1', 0, 4, 0, 4], ['S2', 4, 9, 0, 5], ['S3', 9, 14, 0, 5], ['S4', 14, 15, 0, 1]]);
  assert.deepEqual(second.map(segment => [segment.id, segment.localStart, segment.localEnd, segment.sourceStart, segment.sourceEnd]),
    [['S4', 0, 5, 1, 6], ['S5', 5, 11, 0, 6], ['S6', 11, 15, 0, 4]]);
  assert.equal([...first, ...second].reduce((sum, segment) => sum + segment.sourceEnd - segment.sourceStart, 0), 30);
  assert.match(clips[0].videoPrompt, /PARTIAL:.*first second here/);
  assert.match(clips[0].videoPrompt, /SOURCE ACTION CONTEXT \(6s total\):/);
  assert.match(clips[0].videoPrompt, /ACTION: Begin only source seconds 0-1; leave the action in progress for C2/);
  assert.doesNotMatch(clips[0].videoPrompt, /(?:^|\n)ACTION: The dog slowly pushes slipper A under the sofa/);
  assert.match(clips[1].videoPrompt, /finish S4 without replaying completed movement/);
  assert.match(clips[1].videoPrompt, /CONTINUATION: perform only the remaining part/);
  assert.match(clips[1].videoPrompt, /ACTION: Continue only source seconds 1-6 from the bridge frame/);
});

test('every action, camera and actor/object lock survives verbatim; redundant motion prompts are excluded', () => {
  const episode = fixture();
  const clips = compileLegacyPetClips(episode);
  for (const [index, clip] of clips.entries()) {
    assert.match(clip.videoPrompt, /RELATIONSHIP:/);
    assert.match(clip.videoPrompt, /CORE ACTION:/);
    if (index === 0) {
      assert.doesNotMatch(clip.videoPrompt, /(?:^|\n)(?:REVERSAL|PAYOFF):/);
    } else {
      assert.match(clip.videoPrompt, /REVERSAL:/);
      assert.match(clip.videoPrompt, /PAYOFF:/);
    }
    for (const lock of [episode.character.appearance, episode.character.owner, episode.character.setting, ...episode.character.continuity]) {
      assert.ok(clip.videoPrompt.includes(lock));
    }
    for (const shot of episode.shots.filter(shot => shot.startSeconds < (index + 1) * 15 && shot.startSeconds + shot.durationSeconds > index * 15)) {
      assert.ok(clip.videoPrompt.includes(shot.action));
      assert.ok(clip.videoPrompt.includes(shot.camera));
    }
    assert.doesNotMatch(clip.videoPrompt, /REDUNDANT ORIGINAL PROMPT/);
    assert.match(clip.videoPrompt, /body movement, reactions and camera behavior feel natural/i);
    assert.match(clip.videoPrompt, /Hands, crops, POV and off-screen presence are allowed elsewhere/i);
    assert.match(clip.videoPrompt, /anonymous limbs throughout the film/i);
    assert.ok(clip.videoPrompt.length <= 4096);
  }
  assert.match(clips[0].videoPrompt, /Do not perform S5 or S6 in this clip/);
  assert.match(clips[1].videoPrompt, /perform S5–S6 only in their listed timed intervals/);
});

test('both clips preserve the required full adult cast while global story prose stays in the late clip', () => {
  const episode = fixture();
  const sourceContract = {
    version: 'pet-source-contract-v1',
    cast: {
      pet: 'one adult tan dog',
      humans: [{ id: 'H1', role: 'grandmother', adult: true }],
      requiredVisibleAdults: 1,
      humanPolicy: 'Show the grandmother clearly in the early relationship view and late payoff view.',
    },
    relationship: 'The dog carefully helps its grandmother.',
    coreAction: 'The dog carries her slipper back to her.',
    reversal: 'The missing slipper was hidden by the dog itself.',
    payoff: 'The dog returns it and stays beside the grandmother.',
  };
  const lock = `SOURCE CONTRACT LOCK: ${JSON.stringify(sourceContract)}`;
  episode.character.owner = sourceContract.cast.humanPolicy;
  episode.shots.forEach(shot => {
    shot.keyframePrompt = `${lock}\n${shot.keyframePrompt}`;
    shot.videoPrompt = `${lock}\n${shot.videoPrompt}`;
  });
  const clips = compileLegacyPetClips(episode);
  for (const clip of clips) {
    assert.doesNotMatch(clip.videoPrompt, /SOURCE CONTRACT LOCK:/);
    assert.match(clip.videoPrompt, /CAST: pet=one adult tan dog; humans=H1:grandmother/);
    assert.match(clip.videoPrompt, /Same identity for every required person/);
    assert.match(clip.videoPrompt, /Sleeping, covered or background figures are valid; faces are not mandatory/);
  }
  assert.doesNotMatch(clips[0].videoPrompt, /The dog carefully helps its grandmother/);
  assert.ok(clips[1].videoPrompt.includes(sourceContract.relationship));
  assert.equal(getLegacyPetStoryContract(episode).coreAction, sourceContract.coreAction, 'Quality callers still receive the original source contract');
  assert.ok(clips.every(clip => clip.videoPrompt.includes('CORE ACTION: Perform only the action portion assigned to each timed beat below.')));
  assert.doesNotMatch(clips[0].videoPrompt, /The missing slipper was hidden/);
  assert.doesNotMatch(clips[0].videoPrompt, /returns it and stays beside/);
  assert.ok(clips[1].videoPrompt.includes(sourceContract.reversal));
  assert.ok(clips[1].videoPrompt.includes(sourceContract.payoff));
});

function sleepingCatFixture() {
  const episode = fixture();
  episode.sourceTopic = 'A cat races around the bedroom, drops a cup, and finally loafs on its owner chest.';
  episode.story = 'The cat races around, drops the cup onto the cushion and wakes H1, then loafs on H1 chest.';
  episode.character = {
    species: 'cat', appearance: 'One adult orange tabby with a white chin and amber eyes.',
    owner: 'H1 is the sleeping adult owner with short dark hair and a blue cotton nightshirt; the same person wakes after the cup lands on the cushion.',
    setting: 'One moonlit bedroom with a bed, bedside table, white cup and green cushion.',
    continuity: [
      'The same orange tabby markings, white chin and amber eyes remain consistent.',
      'H1 keeps the same short dark hair and blue cotton nightshirt.',
      'Exactly one white cup and one green cushion exist.',
      'H1 sleeps beneath the blanket in S1–S2; H1 wakes in S5; H1 lies under the cat in S6.',
      'The cat races toward the bedside table in S3; the cat loafs on H1 chest in S6.',
    ],
  };
  const actions = [
    'The cat wakes at the bed foot while H1 sleeps under the blanket.',
    'The cat springs from the bed foot; H1 remains asleep in the background.',
    'The cat races toward the bedside table and its white cup.',
    'The cat pushes the white cup off the table onto the green cushion.',
    'H1 wakes and looks at the cup on the cushion while the cat holds eye contact.',
    'The cat loafs on H1 chest, pretending innocence.',
  ];
  episode.shots.forEach((shot, index) => {
    shot.action = actions[index];
    shot.camera = index < 4 ? 'Keep the cat and the authored sleeping owner in the bedroom composition.'
      : 'Frame the cat and the same adult H1 in the late relationship view.';
  });
  return episode;
}

test('C1 keeps cat and owner identity but excludes later continuity and full-story fallback payoff', () => {
  const episode = sleepingCatFixture();
  const original = structuredClone(episode);
  assert.equal(getLegacyPetStoryContract(episode).coreAction, episode.story, 'Exercise the whole-story fallback');
  const [first, second] = compileLegacyPetClips(episode);
  assert.deepEqual(episode, original);
  assert.match(first.videoPrompt, /H1 is the sleeping adult owner with short dark hair and a blue cotton nightshirt/);
  assert.match(first.videoPrompt, /H1 keeps the same short dark hair and blue cotton nightshirt/);
  assert.match(first.videoPrompt, /same orange tabby markings, white chin and amber eyes/);
  assert.match(first.videoPrompt, /H1 sleeps beneath the blanket in S1–S2/);
  assert.match(first.videoPrompt, /H1 remains asleep in the background/);
  assert.doesNotMatch(first.videoPrompt, /same person wakes|H1 wakes|under the cat|loafs|H1 chest|pretending innocence/);
  assert.doesNotMatch(first.videoPrompt, /(?:^|\n)ACTION: The cat pushes the white cup off/);
  assert.match(first.videoPrompt, /ACTION: Begin only source seconds 0-1; leave the action in progress for C2/);
  assert.match(second.videoPrompt, /H1 wakes in S5/);
  assert.match(second.videoPrompt, /H1 lies under the cat in S6/);
  assert.match(second.videoPrompt, /cat loafs on H1 chest in S6/);
  assert.match(second.videoPrompt, /PAYOFF: The cat loafs on H1 chest, pretending innocence/);
  assert.doesNotMatch(second.videoPrompt, /H1 sleeps beneath the blanket in S1–S2/);
  assert.ok(first.videoPrompt.length <= 4096 && second.videoPrompt.length <= 4096);
});

test('locked relationship and core action cannot reintroduce a late chest payoff into C1', () => {
  const episode = sleepingCatFixture();
  const sourceContract = {
    version: 'pet-source-contract-v1',
    cast: { pet: 'one adult orange tabby', humans: [{ id: 'H1', role: 'owner', adult: true }], requiredVisibleAdults: 1, humanPolicy: 'H1 appears where the authored relationship needs the same adult owner.' },
    relationship: 'The cat rests on H1 chest after waking its sleeping owner.',
    coreAction: episode.story,
    reversal: 'H1 wakes and meets the cat gaze after the cup lands.',
    payoff: 'The cat loafs on H1 chest, pretending innocence.',
  };
  const lock = `SOURCE CONTRACT LOCK: ${JSON.stringify(sourceContract)}`;
  episode.shots.forEach(shot => { shot.videoPrompt = lock; });
  const [first, second] = compileLegacyPetClips(episode);
  assert.match(first.videoPrompt, /CAST: pet=one adult orange tabby; humans=H1:owner/);
  assert.doesNotMatch(first.videoPrompt, /H1 chest|H1 wakes|loafs|pretending innocence/);
  assert.ok(second.videoPrompt.includes(sourceContract.relationship));
  assert.ok(second.videoPrompt.includes(sourceContract.reversal));
  assert.ok(second.videoPrompt.includes(sourceContract.payoff));
});

test('prior pilot mixed continuity keeps the initial prop and H1 without copying waking or loafing into C1', () => {
  const episode = sleepingCatFixture();
  episode.character.appearance = 'adult short-haired silver tabby cat, round face, green eyes, natural proportions';
  episode.character.owner = 'H1, adult owner with short dark hair, sleeping in navy pajamas';
  episode.character.continuity = [
    'Core prop is a clear water glass on the dining table until the cat pushes it in S5.',
    'A thick cushion lies on the floor below the dining table before the glass falls.',
    'H1 is recognizable in bed in S1, waking in S5, and lying under the cat in S6.',
    "The cat begins curled at the foot of the bed and ends loafing on H1's chest.",
  ];
  const [first, second] = compileLegacyPetClips(episode);
  assert.ok(first.videoPrompt.includes(episode.character.appearance));
  assert.ok(first.videoPrompt.includes(episode.character.owner));
  assert.match(first.videoPrompt, /Core prop is a clear water glass on the dining table/);
  assert.match(first.videoPrompt, /thick cushion lies on the floor below the dining table/);
  assert.match(first.videoPrompt, /H1 is recognizable in bed in S1/);
  assert.match(first.videoPrompt, /cat begins curled at the foot of the bed/);
  assert.doesNotMatch(first.videoPrompt, /cat pushes it in S5|waking in S5|lying under the cat|loafing|H1's chest/);
  assert.match(second.videoPrompt, /cat pushes it in S5/);
  assert.match(second.videoPrompt, /waking in S5/);
  assert.match(second.videoPrompt, /lying under the cat in S6/);
  assert.match(second.videoPrompt, /ends loafing on H1's chest/);
  assert.doesNotMatch(second.videoPrompt, /H1 is recognizable in bed in S1|cat begins curled at the foot of the bed/);
});

test('the actual normal-site modern pet plan fits without dropping authored action, camera or identity', () => {
  const episode = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/modern-pet-plan-20260916.json'), 'utf8'));
  const original = structuredClone(episode);
  const clips = compileLegacyPetClips(episode);
  assert.deepEqual(episode, original);
  assert.deepEqual(clips.map(clip => [clip.startSeconds, clip.durationSeconds]), [[0, 15], [15, 15]]);
  for (const [index, clip] of clips.entries()) {
    assert.ok(clip.videoPrompt.length <= 4096);
    assert.ok(clip.videoPrompt.includes(episode.character.owner));
    assert.ok(clip.videoPrompt.includes(episode.character.setting));
    for (const shot of episode.shots.filter(shot => shot.startSeconds < (index + 1) * 15 && shot.startSeconds + shot.durationSeconds > index * 15)) {
      assert.ok(clip.videoPrompt.includes(shot.action), `${shot.id} action survives`);
      assert.ok(clip.videoPrompt.includes(shot.camera), `${shot.id} camera survives`);
    }
  }
  assert.match(clips[0].videoPrompt, /H1 sleeps in the bed/);
  assert.match(clips[0].videoPrompt, /H1’s eyes open slowly/);
  assert.doesNotMatch(clips[0].videoPrompt, /then lies back down at the end|final loaf pose|giving one slow blink/);
  assert.match(clips[0].videoPrompt, /Begin only source seconds 0-1/);
  assert.match(clips[1].videoPrompt, /Continue only source seconds 1-6/);
  assert.doesNotMatch(clips[1].videoPrompt, /(?:^|\n)REVERSAL:|(?:^|\n)PAYOFF:/);
  assert.match(clips[1].videoPrompt, /FULL-STORY CONTEXT ONLY \(not action cues; never replay completed C1 movement\)/);
  assert.equal(getLegacyPetStoryContract(episode).reversal, '고양이는 갑자기 우다다를 시작해 침실을 뛰어다닌다');
  assert.match(clips[1].videoPrompt, /giving one slow blink/);
  assert.equal(clips[0].keyframePrompt, episode.shots[0].keyframePrompt);
});

test('long distinct adult identities, prop ownership and unique affect cues survive compression', () => {
  const episode = fixture();
  episode.character.owner = 'H1 wife: adult woman in her thirties, oval face, dark bob, ivory cotton pajamas. H2 husband: adult man in his thirties, square face, short black hair, navy pajamas. Both are recognizable in the sofa view.';
  episode.character.setting = 'Contemporary Korean apartment living room, oatmeal sofa, light oak floor, cream rug, slim warm table lamp, nighttime window reflections.';
  episode.character.continuity.push('H1 and H2 remain seated together on the sofa; neither person moves slipper A or B.');
  episode.shots[0].action += ' H1 and H2 watch from the sofa; the dog keeps its ears forward and eyes fixed on slipper A.';
  episode.shots[5].action += ' The dog tilts its head once, tail relaxed; H1 and H2 exchange a look of disbelief.';
  const original = structuredClone(episode);
  const clips = compileLegacyPetClips(episode);
  assert.deepEqual(episode, original);
  for (const clip of clips) {
    assert.ok(clip.videoPrompt.length <= 4096);
    assert.ok(clip.videoPrompt.includes(episode.character.owner));
    assert.ok(clip.videoPrompt.includes(episode.character.setting));
    for (const lock of episode.character.continuity) assert.ok(clip.videoPrompt.includes(lock));
  }
  assert.ok(clips[0].videoPrompt.includes(episode.shots[0].action));
  assert.ok(clips[1].videoPrompt.includes(episode.shots[5].action));
});

test('4096-character boundary is accepted, 4097 is refused without changing the source', () => {
  const episode = fixture();
  const firstLength = compileLegacyPetClips(episode)[0].videoPrompt.length;
  episode.shots[0].action += 'x'.repeat(4096 - firstLength);
  const exact = structuredClone(episode);
  assert.equal(compileLegacyPetClips(episode)[0].videoPrompt.length, 4096);
  assert.deepEqual(episode, exact);
  episode.shots[0].action += 'x';
  const oversized = structuredClone(episode);
  assert.throws(() => compileLegacyPetClips(episode), error => error instanceof PetLegacyCompilationError
    && error.code === 'PET_LEGACY_PROMPT_LENGTH' && error.status === 422 && error.actualLength === 4097);
  assert.deepEqual(episode, oversized);
});

test('refuses a second-clip overflow even when C1 fits', () => {
  const episode = fixture();
  episode.shots[5].camera += 'x'.repeat(4096);
  assert.throws(() => compileLegacyPetClips(episode), error => error.code === 'PET_LEGACY_PROMPT_LENGTH' && /C2/.test(error.message));
});

test('refuses V4, malformed source descriptions and retimed legacy beats', () => {
  const episode = fixture();
  assert.throws(() => compileLegacyPetClips({ ...episode, version: 'pet-v4' }), error => error.code === 'PET_LEGACY_EPISODE');
  const retimed = structuredClone(episode);
  retimed.shots[2].durationSeconds = 6;
  retimed.shots[3].startSeconds = 15;
  retimed.shots[3].durationSeconds = 5;
  assert.throws(() => compileLegacyPetClips(retimed), error => error.code === 'PET_LEGACY_TIMELINE');
  const invalid = structuredClone(episode);
  invalid.character.continuity = ['encoded base64 media'];
  assert.throws(() => compileLegacyPetClips(invalid), error => error.code === 'PET_LEGACY_EPISODE');
  const missingAction = structuredClone(episode);
  delete missingAction.shots[3].action;
  assert.throws(() => compileLegacyPetClips(missingAction), error => error.code === 'PET_LEGACY_EPISODE');
});
