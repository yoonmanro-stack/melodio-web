/** Offline pet-v3 planner regression tests. Every provider response is injected. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const timeoutSignals = new WeakMap();
/** Observe real requested deadlines without creating multi-minute test timers. */
class OfflineAbortSignal extends AbortSignal {
  static timeout(timeoutMs) {
    const controller = new AbortController();
    timeoutSignals.set(controller.signal, { timeoutMs, controller });
    return controller.signal;
  }
}
function load(relative) {
  const file = path.join(root, relative);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const scopedRequire = name => {
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), `${name}.ts`)));
    if (name === 'node:crypto') return require(name);
    throw new Error(`Unexpected dependency: ${name}`);
  };
  new Function('require', 'module', 'exports', 'process', 'AbortSignal', js)(scopedRequire, module, module.exports, process, OfflineAbortSignal);
  return module.exports;
}

const {
  createPetEpisode,
  inferPetPlanningHints,
  PetPlannerError,
  PET_COMPILATION_MODEL,
  PET_LYRIC_TOTAL_MIN,
  PET_PLANNING_MODEL,
  PET_SOURCE_CONTRACT_LOCK_PREFIX,
  derivePetSourceContract,
} = load('src/lib/vle/petPlanner.ts');
const { PET_HUMAN_REACTION_DIRECTION, PET_ANIMAL_REACTION_DIRECTION } = load('src/lib/vle/petPerformanceDirection.ts');

function assertPerformance(prompts, hasHumans) {
  for (const prompt of prompts) {
    assert.ok(prompt.includes(PET_ANIMAL_REACTION_DIRECTION), 'The animal-specific performance direction reaches the actual prompt.');
    assert.equal(prompt.includes(PET_HUMAN_REACTION_DIRECTION), hasHumans, 'Human performance follows the authored cast.');
    assert.doesNotMatch(prompt, /without human facial expressions/);
  }
}

const validLines = [
  '산책인 줄 알았지',
  '목줄 먼저 챙겼어',
  '문 열자 비가 온다',
  '이건 산책 약속과 달라',
  '목줄 다시 받아라',
  '소파가 좋다',
];

function beats(setup, escalation, reversal, punchline) {
  return { setup, escalation, reversal, punchline };
}

function plan(lines = validLines, sourceTopic = '') {
  return {
    sourceTopic,
    candidates: [
      { prop: 'leash', conflict: 'rain_cancels_walk', twist: 'owner_misreads', title: '산책 취소 통보', premise: '강아지가 비를 보고 목줄을 돌려준 뒤 소파로 돌아간다.', storyBeats: beats('강아지가 목줄을 문다.', '현관으로 달려간다.', '비를 보고 목줄을 돌려준다.', '소파로 돌아간다.') },
      { prop: 'front_door', conflict: 'wet_threshold', twist: 'sensory_difference', title: '문턱 기상청', premise: '강아지가 문턱에서 빗소리를 확인하고 즉시 후퇴한다.', storyBeats: beats('문 앞으로 간다.', '문이 열린다.', '비를 확인한다.', '마른 소파로 돌아간다.') },
      { prop: 'sofa', conflict: 'indoor_backup_plan', twist: 'unexpected_care', title: '오늘은 소파 산책', premise: '강아지가 젖은 집사를 걱정해 함께 소파에 머문다.', storyBeats: beats('목줄을 챙긴다.', '비가 내린다.', '산책을 포기한다.', '함께 소파에 머문다.') },
    ],
    selectedCandidateIndex: 0,
    title: '산책 취소 통보',
    story: '강아지가 목줄을 물고 현관으로 달려간다. 문이 열리자 비를 보고 목줄을 집사에게 돌려준 뒤 소파에서 눈을 감는다.',
    pov: 'pet_inner_voice',
    character: {
      species: 'dog',
      appearance: 'Natural-proportion adult beige dog with a white chest and brown ears.',
      owner: 'H1 is one recognizable adult owner with a visible face and short black hair, wearing a navy sweater.',
      setting: 'One small living room with the front door and a grey sofa in the same view.',
      continuity: ['same adult beige dog', 'one red leash', 'H1 keeps the same face, hair and navy sweater', 'soft overcast daylight'],
    },
    lyricLines: [...lines],
    shots: lines.map((line, index) => ({
      id: `wrong-${index}`,
      beat: ['목줄 선점', '현관 질주', '비 확인', '즉시 판단', '목줄 반납', '소파 복귀'][index],
      caption: `old caption ${index}`,
      action: [
        'The adult dog grips the single red leash in its mouth.',
        'The adult dog walks quickly to the closed front door with the leash while H1 stands recognizably beside it with a visible face and upper body.',
        'Close detail: H1 right hand opens the door while the dog pauses at the threshold and looks at the rain.',
        'The adult dog steps backward from the rainy doorway while still holding the leash.',
        'The adult dog presses the leash into H1 hand while H1 reacts with a clear face and visible upper body, then releases it.',
        'Result cut: the adult dog closes its eyes while settled on the grey sofa; H1 sits beside it in the same navy sweater.',
      ][index],
      camera: [
        'Fixed low medium shot containing the dog and leash.',
        'Gentle side follow containing the dog, leash, H1 visible face and upper body, and front door.',
        'Fixed close-up containing the dog, threshold, rain and H1 attached right hand.',
        'Fixed low medium shot containing the dog backing away from the threshold.',
        'Medium shot containing the dog muzzle, leash, and H1 recognizable face and upper body.',
        'Fixed medium shot containing the dog and H1 on the sofa.',
      ][index],
    })),
  };
}

function compilation() {
  return { shots: Array.from({ length: 6 }, (_, index) => ({
    id: `S${index + 1}`,
    keyframePrompt: index === 1 || index === 4
      ? `Photoreal starting frame ${index + 1} with the locked adult dog, red leash, and H1 recognizable face and upper body in the navy sweater.`
      : index === 2
        ? 'Photoreal hand-detail starting frame 3 with the adult dog and H1 attached right hand opening the door.'
      : `Photoreal starting frame ${index + 1} with the locked adult dog and red leash.`,
    videoPrompt: `Only the supplied modest action ${index + 1} occurs with restrained natural motion.`,
  })) };
}

function couplePlan(sourceTopic) {
  const value = plan(validLines, sourceTopic);
  value.story = '부부가 강아지와 가족사진을 찍으려 한다. 강아지가 두 사람 사이로 비집고 들어오자 부부가 웃는다.';
  value.candidates[0].premise = value.story;
  value.candidates[0].storyBeats = beats('부부와 강아지가 소파에 모인다.', '부부가 가족사진을 찍으려 한다.', '강아지가 두 사람 사이로 비집고 들어온다.', '부부가 함께 웃는다.');
  value.character.owner = 'H1 is an adult husband with a visible face, short hair and navy sweater; H2 is an adult wife with a visible face, long hair and cream cardigan.';
  value.character.continuity = ['same adult beige dog', 'H1 keeps the same face, hair and navy sweater', 'H2 keeps the same face, hair and cream cardigan', 'soft daylight'];
  value.shots[1].action = 'H1 and H2 sit beside the adult dog, both with visible faces and upper bodies, preparing a family photo.';
  value.shots[1].camera = 'Fixed medium-wide relationship shot containing H1, H2, both visible faces and upper bodies, and the adult dog.';
  value.shots[2].action = 'Detail close-up: the adult dog noses H1 attached hand as it reaches toward the camera timer.';
  value.shots[2].camera = 'Close detail on the dog and H1 hand; the established identities remain unchanged.';
  value.shots[4].action = 'H2 reacts with a visible smiling face and upper body as the dog settles between the couple.';
  value.shots[4].camera = 'Medium reaction shot containing H2 recognizable face and upper body with the adult dog.';
  value.shots[5].action = 'The adult dog calmly looks into the camera while H1 and H2 remain beside it.';
  value.shots[5].camera = 'Low pet-centered payoff detail with the established couple beside the dog.';
  return value;
}

function coupleCompilation() {
  return { shots: Array.from({ length: 6 }, (_, index) => ({
    id: `S${index + 1}`,
    keyframePrompt: index === 1
      ? 'S2 relationship frame: adult dog with H1 and H2, both recognizable faces and upper bodies, navy sweater and cream cardigan.'
      : index === 2
        ? 'S3 permitted detail close-up of the adult dog and H1 attached hand at the timer.'
        : index === 4
          ? 'S5 payoff reaction: adult dog with H2 recognizable smiling face and upper body in the cream cardigan.'
          : `Photoreal pet-centered starting frame ${index + 1}.`,
    videoPrompt: `Only the authored modest action ${index + 1} occurs.`,
  })) };
}

const zoomiesLines = [
  '새벽에 눈이 번쩍',
  '이불 끝이 출발선',
  '온 방을 뛰어다녀',
  '컵은 방석 위로 툭 떨어져',
  '눈 마주쳐도 난 모른 척',
  '가슴 위에 잠든 척',
];

function zoomiesPlan(sourceTopic) {
  const value = plan(zoomiesLines, sourceTopic);
  value.title = '새벽 질주범';
  value.story = sourceTopic;
  value.candidates[0] = {
    prop: 'cup', conflict: 'nighttime_zoomies', twist: 'owner_misreads', title: value.title,
    premise: sourceTopic,
    storyBeats: beats('The cat wakes at the bed foot beside its sleeping owner.', 'The cat races around the bedroom.', 'The cat pushes the cup onto a cushion and meets the awakened owner gaze.', 'The cat loafs on the owner chest, pretending innocence.'),
  };
  value.candidates[1] = {
    prop: 'blanket', conflict: 'nighttime_racing_route', twist: 'sensory_difference', title: '이불 끝 출발선',
    premise: 'The cat follows the blanket edge on its nighttime route before the same cup-and-chest ending.',
    storyBeats: beats('The owner sleeps under the blanket.', 'The cat races along the bed edge.', 'The cup lands on the cushion and wakes the owner.', 'The cat rests on the owner chest.'),
  };
  value.candidates[2] = {
    prop: 'cushion', conflict: 'soft_landing_wakes_owner', twist: 'unexpected_care', title: '방석 위 착지',
    premise: 'The cat drops the cup onto the soft cushion, then settles on the awakened owner chest.',
    storyBeats: beats('The cat wakes beside its sleeping owner.', 'The cat runs toward the bedside cup.', 'The cup lands safely on the cushion.', 'The cat loafs on the owner chest.'),
  };
  value.character = {
    species: 'cat',
    appearance: 'Natural-proportion adult orange tabby cat with a white chin and amber eyes.',
    owner: 'H1 is the sleeping adult owner with short dark hair and a blue cotton nightshirt; the same person wakes after the cup lands on the cushion.',
    setting: 'One moonlit bedroom with the same bed, bedside table, white cup and green floor cushion.',
    continuity: ['Same adult orange tabby markings.', 'The owner keeps the same short dark hair and blue nightshirt.', 'One white cup starts on the bedside table.', 'One green cushion stays beside the bed.'],
  };
  const actions = [
    'The cat wakes at the foot of the bed while its sleeping owner lies on the pillow, head in profile and torso mostly covered by the blanket.',
    'The cat springs from the bed foot and starts racing; the sleeping owner remains beneath the blanket in the background.',
    'The cat races across the bedroom toward the bedside table where the white cup still stands.',
    'The cat pushes the white cup off the bedside table onto the green floor cushion.',
    'The cat holds eye contact with the awakened owner, whose sleepy eyes look down at the cup resting on the cushion.',
    'The cat loafs on the owner chest, pretending innocence; the owner lies on the same pillow in the same blue nightshirt.',
  ];
  const cameras = [
    'Wide bedroom composition containing the cat at the bed foot and its sleeping owner beneath the blanket.',
    'Low side view containing the cat leaving the bed foot and the sleeping owner in the background.',
    'Low tracking view containing the racing cat and bedside table.',
    'Close detail containing the cat paw, cup, bedside table edge and green cushion.',
    'Medium bedside view containing the cat, awakened owner eyes, cup and cushion.',
    'Quiet overhead view containing the loafing cat, owner chest, blue nightshirt and pillow.',
  ];
  value.shots = zoomiesLines.map((caption, index) => ({ id: `S${index + 1}`, beat: ['새벽 기상', '질주 시작', '침실 질주', '컵 착지', '눈 마주침', '모른 척'][index], caption, action: actions[index], camera: cameras[index] }));
  return value;
}

function naturalCompilation(value) {
  return { shots: value.shots.map((shot, index) => ({
    id: `S${index + 1}`,
    keyframePrompt: `Photoreal vertical starting composition: ${shot.camera}`,
    videoPrompt: `${shot.action} Natural supporting motion follows the approved beat.`,
  })) };
}

function petOnlyPlan(sourceTopic, species) {
  const value = plan(validLines, sourceTopic);
  value.title = '공 숨기기';
  value.story = `An adult ${species} carries a red ball across the room, hides it under the sofa and rests alone.`;
  value.candidates[0].premise = value.story;
  value.candidates[0].storyBeats = beats(`The adult ${species} picks up the red ball.`, 'It carries the ball across the room.', 'It hides the ball under the sofa.', 'It rests alone beside the sofa.');
  value.character = {
    species,
    appearance: `Natural-proportion adult beige ${species} with a white chest and brown ears.`,
    owner: `No humans. The adult ${species} acts alone throughout the film.`,
    setting: 'One small living room with a grey sofa and red ball.',
    continuity: [`Same adult beige ${species}.`, 'Exactly one red ball.', 'Same grey sofa and soft daylight.'],
  };
  const actions = [
    `The adult ${species} picks up the red ball.`,
    `The adult ${species} carries the red ball across the living room.`,
    `The adult ${species} stops beside the grey sofa while holding the red ball.`,
    `The adult ${species} nudges the red ball under the sofa.`,
    `The adult ${species} checks the red ball hidden under the sofa.`,
    `The adult ${species} rests alone beside the grey sofa.`,
  ];
  value.shots = validLines.map((caption, index) => ({ id: `S${index + 1}`, beat: '공 숨기기', caption, action: actions[index], camera: `Pet-centered shot ${index + 1} containing only the adult ${species}, red ball and grey sofa. No humans are visible.` }));
  return value;
}

function providerResponse(value, model) {
  return new Response(JSON.stringify({
    status: 'completed',
    model,
    usage: { input_tokens: 120, output_tokens: 240 },
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
  }), { status: 200 });
}

function runner(responses) {
  const requests = [];
  return {
    requests,
    dependencies: {
      apiKey: 'offline-key',
      createId: () => 'offline-episode',
      now: () => new Date('2026-09-15T00:00:00Z'),
      fetch: async (url, init) => {
        assert.equal(url, 'https://api.openai.com/v1/responses');
        requests.push(JSON.parse(init.body));
        const next = responses.shift();
        assert.ok(next, 'Unexpected provider call');
        return next;
      },
    },
  };
}

function timedRunner(steps) {
  let elapsed = 0;
  const requests = [];
  const dependencies = {
    apiKey: 'offline-key', createId: () => 'offline-timed-episode', now: () => new Date('2026-09-17T00:00:00Z'),
    clock: () => elapsed,
    async fetch(url, init) {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const deadline = timeoutSignals.get(init.signal);
      assert.ok(deadline, 'Every paid call must use the observed bounded abort signal');
      requests.push({ body: JSON.parse(init.body), timeoutMs: deadline.timeoutMs });
      const step = steps.shift();
      assert.ok(step, 'Unexpected extra provider request');
      elapsed += step.elapsedMs || 0;
      if (step.timeout) {
        const reason = new DOMException('Offline timeout', 'TimeoutError');
        deadline.controller.abort(reason);
        throw reason;
      }
      if (step.error) throw step.error;
      if (step.bodyAbort) {
        deadline.controller.abort(new DOMException('Offline body timeout', 'TimeoutError'));
        return { ok: true, json: async () => { throw new DOMException('Offline body interrupted', 'AbortError'); } };
      }
      if (step.bodyError) return { ok: true, json: async () => { throw step.bodyError; } };
      return providerResponse(step.value, step.model || PET_PLANNING_MODEL);
    },
  };
  return { requests, dependencies, setElapsed(value) { elapsed = value; } };
}

function assertDiagnostics(error, { phase, kind, elapsedMs, timeoutMs, totalElapsedMs }) {
  assert.ok(error instanceof PetPlannerError);
  assert.equal(error.code, kind === 'timeout' ? 'pet_provider_timeout' : 'pet_provider_unavailable');
  assert.equal(error.status, kind === 'timeout' ? 504 : 502);
  assert.deepEqual(error.diagnostics, { phase, kind, elapsedMs, timeoutMs, totalElapsedMs });
  return true;
}

test('42 syllables and a five-syllable final line pass while IDs and captions normalize locally', async () => {
  const topic = '강아지가 목줄을 물고 현관으로 달려간다. 비를 보자 목줄을 집사에게 돌려주고 소파로 간다. 강아지 속마음으로 노래해 줘.';
  assert.deepEqual(inferPetPlanningHints(topic), { species: 'dog', pov: 'pet_inner_voice' });
  const r = runner([
    providerResponse(plan(validLines, topic), PET_PLANNING_MODEL),
    providerResponse(compilation(), PET_COMPILATION_MODEL),
  ]);
  const episode = await createPetEpisode({ topic }, r.dependencies);
  assertPerformance(r.requests.map(request => request.instructions), true);
  assertPerformance(episode.shots.flatMap(shot => [shot.keyframePrompt, shot.videoPrompt]), true);
  assert.equal(PET_LYRIC_TOTAL_MIN, 42);
  assert.equal(episode.pov, 'pet_inner_voice');
  assert.equal(episode.character.species, 'dog');
  assert.deepEqual(episode.shots.map(shot => shot.id), ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
  assert.deepEqual(episode.shots.map(shot => shot.caption), validLines);
  assert.deepEqual(r.requests.map(request => request.model), [PET_PLANNING_MODEL, PET_COMPILATION_MODEL]);
  assert.equal(PET_PLANNING_MODEL, 'gpt-5.6-sol');
  assert.equal(PET_COMPILATION_MODEL, 'gpt-5.6-sol');
  assert.deepEqual(r.requests.map(request => request.reasoning.effort), ['high', 'low']);
  assert.deepEqual(r.requests.map(request => request.max_output_tokens), [16000, 8000]);
  const planningInput = JSON.parse(r.requests[0].input);
  assert.equal(planningInput.sourceTopic, topic);
  assert.equal(planningInput.sourceContract.sourceTopic, topic);
  assert.equal(planningInput.sourceContract.cast.humans[0].id, 'H1');
  assert.equal(planningInput.species, 'dog');
  assert.equal(planningInput.pov, 'pet_inner_voice');
  assert.deepEqual(planningInput.recentEpisodesNewestFirst, []);
  const compilationInput = JSON.parse(r.requests[1].input);
  assert.deepEqual(compilationInput.sourceContract, planningInput.sourceContract);
  assert.deepEqual(compilationInput.selectedStoryBeats, plan(validLines, topic).candidates[0].storyBeats);
  for (const shot of episode.shots) {
    assert.match(shot.keyframePrompt, new RegExp(`^${PET_SOURCE_CONTRACT_LOCK_PREFIX}`));
    assert.match(shot.videoPrompt, new RegExp(`^${PET_SOURCE_CONTRACT_LOCK_PREFIX}`));
  }
});

test('a 41-syllable draft receives a measured repair and the valid repair compiles', async () => {
  const short = [...validLines];
  short[3] = '이건 산책약속 달라';
  const r = runner([
    providerResponse(plan(short), PET_PLANNING_MODEL),
    providerResponse(plan(), PET_PLANNING_MODEL),
    providerResponse(compilation(), PET_COMPILATION_MODEL),
  ]);
  const episode = await createPetEpisode({}, r.dependencies);
  assert.equal(episode.id, 'offline-episode');
  assert.match(r.requests[1].input, /Total=41 \(allowed 42–78\)/);
  assert.deepEqual(r.requests.map(request => request.model), [PET_PLANNING_MODEL, PET_PLANNING_MODEL, PET_COMPILATION_MODEL]);
});

test('an invalid repair still fails closed before compilation', async () => {
  const short = [...validLines];
  short[5] = '소파 좋다';
  const r = runner([
    providerResponse(plan(short), PET_PLANNING_MODEL),
    providerResponse(plan(short), PET_PLANNING_MODEL),
  ]);
  await assert.rejects(createPetEpisode({}, r.dependencies), error =>
    error instanceof PetPlannerError
      && error.code === 'pet_plan_invalid'
      && error.issues.some(issue => issue.includes('장면 6 가사 4음절')),
  );
  assert.equal(r.requests.length, 2);
});

test('per-shot upper limits remain enforced', async () => {
  const long = [...validLines];
  long[0] = '오늘은 산책인 줄 알았는데';
  const r = runner([
    providerResponse(plan(long), PET_PLANNING_MODEL),
    providerResponse(plan(long), PET_PLANNING_MODEL),
  ]);
  await assert.rejects(createPetEpisode({}, r.dependencies), error =>
    error instanceof PetPlannerError
      && error.issues.some(issue => issue.includes('장면 1 가사')),
  );
  assert.equal(r.requests.length, 2);
});

test('couple stories keep two identities with S2/S5 anchors while allowing an intermediate hand close-up', async () => {
  const topic = '부부가 강아지와 소파에서 가족사진을 찍으려 한다. 강아지가 두 사람 사이로 비집고 들어오자 부부가 웃는다.';
  const contract = derivePetSourceContract(topic, 'dog');
  assert.equal(contract.cast.requiredVisibleAdults, 2);
  assert.deepEqual(contract.cast.humans.map(human => human.id), ['H1', 'H2']);
  const r = runner([
    providerResponse(couplePlan(topic), PET_PLANNING_MODEL),
    providerResponse(coupleCompilation(), PET_COMPILATION_MODEL),
  ]);
  const episode = await createPetEpisode({ topic }, r.dependencies);
  assert.match(episode.shots[2].keyframePrompt, /detail close-up.*H1 attached hand/i);
  assertPerformance(r.requests.map(request => request.instructions), true);
  assertPerformance(episode.shots.flatMap(shot => [shot.keyframePrompt, shot.videoPrompt]), true);
  assert.deepEqual(episode.character, couplePlan(topic).character);
  assert.doesNotMatch(episode.shots[0].keyframePrompt, /S1.*both recognizable/i);
  assert.match(episode.shots[4].keyframePrompt, /S5 payoff reaction/);
});

test('a couple collapsed to one anonymous owner hand fails closed before compilation', async () => {
  const topic = '부부가 강아지와 소파에서 가족사진을 찍으려 한다. 강아지가 두 사람 사이로 들어오자 부부가 웃는다.';
  const collapsed = couplePlan(topic);
  collapsed.character.owner = 'One owner represented only by one visible right hand and forearm.';
  collapsed.character.continuity = ['same adult beige dog', 'one owner hand', 'same sofa'];
  collapsed.shots[1].action = 'One owner hand reaches toward the adult dog.';
  collapsed.shots[1].camera = 'Close-up of one hand and the dog.';
  collapsed.shots[4].action = 'The dog looks at one owner hand.';
  collapsed.shots[4].camera = 'Close-up of one hand.';
  const r = runner([
    providerResponse(collapsed, PET_PLANNING_MODEL),
    providerResponse(collapsed, PET_PLANNING_MODEL),
  ]);
  await assert.rejects(createPetEpisode({ topic }, r.dependencies), error =>
    error instanceof PetPlannerError
      && error.code === 'pet_plan_invalid'
      && error.issues.some(issue => /H2|두 성인|손이나 팔/.test(issue)),
  );
  assert.equal(r.requests.length, 2);
});

test('compiler omission is allowed but an explicit whole-film cast exclusion fails', async () => {
  const topic = '부부가 강아지와 소파에서 가족사진을 찍으려 한다. 강아지가 두 사람 사이로 들어오자 부부가 웃는다.';
  const compiled = coupleCompilation();
  compiled.shots[0].videoPrompt = 'Throughout the film, all humans remain off-screen and only hands represent them.';
  const r = runner([
    providerResponse(couplePlan(topic), PET_PLANNING_MODEL),
    providerResponse(compiled, PET_COMPILATION_MODEL),
  ]);
  await assert.rejects(createPetEpisode({ topic }, r.dependencies), error =>
    error instanceof PetPlannerError && error.code === 'pet_compilation_invalid'
      && error.issues.some(issue => /영화 전체/.test(issue)),
  );
  assert.equal(r.requests.length, 2);
});

test('sleeping and blanket-covered owner plus chest payoff preserve cast without repeated identity or framing keywords', async () => {
  const topic = 'At 3 AM the cat wakes at the foot of the bed while its owner sleeps. The cat races around the bedroom, pushes a cup onto a cushion and meets the awakened owner gaze. Finally the cat loafs on the owner chest pretending innocence.';
  const value = zoomiesPlan(topic);
  const compiled = naturalCompilation(value);
  for (const shot of value.shots) assert.doesNotMatch(`${shot.action} ${shot.camera}`, /\bH[1-4]\b|recognizable|upper[- ]body|full[- ]body|\bface\b/i);
  for (const shot of compiled.shots) assert.doesNotMatch(`${shot.keyframePrompt} ${shot.videoPrompt}`, /\bH[1-4]\b|recognizable|upper[- ]body|full[- ]body|\bface\b/i);
  const r = runner([providerResponse(value, PET_PLANNING_MODEL), providerResponse(compiled, PET_COMPILATION_MODEL)]);
  const episode = await createPetEpisode({ topic, species: 'cat' }, r.dependencies);
  assert.equal(r.requests.length, 2, 'Natural source-cast framing must not trigger a planner repair.');
  assert.deepEqual(episode.character, value.character);
  assertPerformance(r.requests.map(request => request.instructions), true);
  assertPerformance(episode.shots.flatMap(shot => [shot.keyframePrompt, shot.videoPrompt]), true);
  episode.shots.forEach((shot, index) => {
    assert.equal(shot.action, value.shots[index].action);
    assert.equal(shot.camera, value.shots[index].camera);
    assert.ok(shot.keyframePrompt.includes(`HUMANS: ${value.character.owner}`));
    assert.ok(shot.videoPrompt.includes(`HUMANS: ${value.character.owner}`));
    assert.ok(shot.keyframePrompt.includes(`CURRENT SHOT STARTING FRAME: ${value.shots[index].action}`));
    assert.ok(shot.videoPrompt.includes(`CURRENT SHOT LOCKED ACTION: ${value.shots[index].action}`));
    assert.ok(shot.keyframePrompt.includes(`Camera: ${value.shots[index].camera}`));
    assert.ok(shot.videoPrompt.includes(`Camera: ${value.shots[index].camera}`));
  });
  assert.match(episode.shots[0].action, /sleeping owner.*mostly covered by the blanket/);
  assert.match(episode.shots[4].action, /eye contact with the awakened owner/);
  assert.match(episode.shots[5].action, /loafs on the owner chest, pretending innocence/);
});

test('source relationship may appear in S3 and S4 while pet-only opening and ending follow the requested story', async () => {
  const topic = 'An adult cat nudges its owner during a nap. The owner checks and fills the empty water bowl. Finally the cat drinks alone beside the sofa.';
  const value = petOnlyPlan(topic, 'cat');
  value.story = topic;
  value.character.owner = 'H1 is the adult owner with short dark hair and a blue cotton shirt, resting beneath a blanket before filling the bowl.';
  value.character.continuity = ['Same adult beige cat.', 'The owner keeps the same dark hair and blue shirt.', 'Exactly one white water bowl beside the grey sofa.'];
  value.candidates[0].premise = topic;
  value.candidates[0].storyBeats = beats('The cat approaches the empty water bowl.', 'The cat nudges its sleeping owner.', 'The owner fills the water bowl.', 'The cat drinks alone.');
  value.shots[0] = { ...value.shots[0], action: 'The adult cat approaches the empty white water bowl.', camera: 'Low view containing only the cat and empty bowl.' };
  value.shots[1] = { ...value.shots[1], action: 'The adult cat looks from the empty bowl toward the sofa.', camera: 'Close detail containing only the cat and bowl.' };
  value.shots[2] = { ...value.shots[2], action: 'The adult cat nudges the sleeping owner, whose head rests on the sofa pillow and torso stays beneath the blanket.', camera: 'Medium sofa view containing the cat, sleeping owner and blanket.' };
  value.shots[3] = { ...value.shots[3], action: 'The awakened owner in the blue shirt fills the cat water bowl.', camera: 'Side view containing the owner, cat and white water bowl.' };
  value.shots[4] = { ...value.shots[4], action: 'The adult cat drinks from the full white water bowl alone.', camera: 'Low bowl detail containing only the drinking cat and bowl.' };
  value.shots[5] = { ...value.shots[5], action: 'The adult cat rests alone beside the full white water bowl.', camera: 'Quiet pet-centered view containing only the cat, bowl and sofa.' };
  const r = runner([providerResponse(value, PET_PLANNING_MODEL), providerResponse(naturalCompilation(value), PET_COMPILATION_MODEL)]);
  const episode = await createPetEpisode({ topic, species: 'cat' }, r.dependencies);
  assert.equal(r.requests.length, 2, 'The source story must not be rewritten to force early or late human anchors.');
  assert.match(episode.shots[2].action, /sleeping owner/);
  assert.match(episode.shots[3].action, /awakened owner/);
  for (const index of [0, 1, 4, 5]) assert.doesNotMatch(`${episode.shots[index].action} ${episode.shots[index].camera}`, /owner|human|person|\bH1\b/i);
});

for (const species of ['cat', 'dog']) {
  test(`explicit no-human adult ${species} story passes without treating pet adulthood or negated humans as cast`, async () => {
    const topic = `Without humans, an adult ${species} carries a red ball across the room and hides it under the sofa. Finally it rests alone beside the sofa.`;
    const value = petOnlyPlan(topic, species);
    const r = runner([providerResponse(value, PET_PLANNING_MODEL), providerResponse(naturalCompilation(value), PET_COMPILATION_MODEL)]);
    const episode = await createPetEpisode({ topic, species }, r.dependencies);
    assert.equal(r.requests.length, 2);
    assert.equal(episode.character.species, species);
    assert.deepEqual(derivePetSourceContract(topic, species).cast.humans, []);
    assert.equal(derivePetSourceContract(topic, species).cast.humanPolicy, 'source_pet_only');
    assert.match(episode.shots[0].videoPrompt, new RegExp(`adult ${species}`));
    assertPerformance(episode.shots.flatMap(shot => [shot.keyframePrompt, shot.videoPrompt]), false);
  });

  test(`optional-human adult ${species} story can keep all shots pet-only`, async () => {
    const topic = `An adult ${species} carries a red ball across the room and hides it under the sofa. Finally it rests alone beside the sofa.`;
    const value = petOnlyPlan(topic, species);
    const r = runner([providerResponse(value, PET_PLANNING_MODEL), providerResponse(naturalCompilation(value), PET_COMPILATION_MODEL)]);
    const episode = await createPetEpisode({ topic, species }, r.dependencies);
    assert.equal(r.requests.length, 2);
    assert.deepEqual(derivePetSourceContract(topic, species).cast.humans, []);
    assert.equal(derivePetSourceContract(topic, species).cast.humanPolicy, 'planner_may_choose_recognizable_humans');
    assert.equal(episode.shots.length, 6);
  });
}

test('explicit no-human topics forbid floating hands while ordinary pet topics leave human choice open', () => {
  const petOnly = derivePetSourceContract('사람 없이 강아지가 빨간 공을 소파 밑에 숨긴다.', 'dog');
  assert.equal(petOnly.cast.humanPolicy, 'source_pet_only');
  assert.deepEqual(petOnly.cast.humans, []);
  const unspecified = derivePetSourceContract('강아지가 빨간 공을 소파 밑에 숨긴다.', 'dog');
  assert.equal(unspecified.cast.humanPolicy, 'planner_may_choose_recognizable_humans');
  assert.deepEqual(derivePetSourceContract('An adult dog hides a red ball under the sofa.', 'dog').cast.humans, []);
});

test('generic Korean person mentions become a required recognizable source human', () => {
  const contract = derivePetSourceContract('사람이 고양이와 창가에서 쉬다가 함께 하품한다.', 'cat');
  assert.equal(contract.cast.humans.length, 1);
  assert.equal(contract.cast.humans[0].role, 'person');
  const specific = derivePetSourceContract('성인 남자가 강아지와 벤치에 앉는다.', 'dog');
  assert.deepEqual(specific.cast.humans.map(human => human.role), ['man']);
});

test('the pet response metadata reads the shared 42–78 syllable constants', () => {
  const route = fs.readFileSync(path.join(root, 'src/app/api/viral-cf/producer-brief/route.ts'), 'utf8');
  assert.match(route, /min: PET_LYRIC_TOTAL_MIN, max: PET_LYRIC_TOTAL_MAX/);
  assert.doesNotMatch(route, /syllableBudget:\s*\{[^}]*min:\s*56/);
});

test('a plan exceeding the former 90-second limit completes within the new overall budget', async () => {
  const r = timedRunner([
    { value: plan(), elapsedMs: 100_000 },
    { value: compilation(), model: PET_COMPILATION_MODEL, elapsedMs: 10_000 },
  ]);
  const episode = await createPetEpisode({}, r.dependencies);
  assert.equal(episode.id, 'offline-timed-episode');
  assert.deepEqual(r.requests.map(request => request.timeoutMs), [180_000, 60_000]);
  assert.deepEqual(r.requests.map(request => request.body.model), ['gpt-5.6-sol', 'gpt-5.6-sol']);
  assert.deepEqual(r.requests.map(request => request.body.reasoning.effort), ['high', 'low']);
});

test('repair uses only the remaining planning time and preserves the full compilation reserve', async () => {
  const short = [...validLines];
  short[3] = '이건 산책약속 달라';
  const r = timedRunner([
    { value: plan(short), elapsedMs: 150_000 },
    { value: plan(), elapsedMs: 45_000 },
    { value: compilation(), model: PET_COMPILATION_MODEL, elapsedMs: 10_000 },
  ]);
  const episode = await createPetEpisode({}, r.dependencies);
  assert.equal(episode.shots.length, 6);
  assert.deepEqual(r.requests.map(request => request.timeoutMs), [180_000, 60_000, 60_000]);
  assert.match(r.requests[1].body.input, /Total=41/);
  assert.deepEqual(r.requests.map(request => request.body.model), Array(3).fill('gpt-5.6-sol'));
});

for (const phase of ['planning', 'repair', 'compilation']) {
  test(`${phase} deadline is a diagnosed 504 and never starts another paid request`, async () => {
    const short = [...validLines];
    short[3] = '이건 산책약속 달라';
    const r = timedRunner(phase === 'planning'
      ? [{ timeout: true, elapsedMs: 180_000 }]
      : [{ value: phase === 'repair' ? plan(short) : plan(), elapsedMs: 150_000 }, { timeout: true, elapsedMs: 60_000 }]);
    await assert.rejects(createPetEpisode({}, r.dependencies), error => {
      assertDiagnostics(error, {
        phase, kind: 'timeout', elapsedMs: phase === 'planning' ? 180_000 : 60_000,
        timeoutMs: phase === 'planning' ? 180_000 : 60_000,
        totalElapsedMs: phase === 'planning' ? 180_000 : 210_000,
      });
      assert.equal(error.models.length, phase === 'planning' ? 0 : 1, 'Prior completed usage is retained');
      return true;
    });
    assert.equal(r.requests.length, phase === 'planning' ? 1 : 2);
    assert.ok(r.requests.every(request => request.body.model === 'gpt-5.6-sol'));
  });
}

test('a transport connection failure remains 502 and does not retry or downgrade', async () => {
  const r = timedRunner([{ error: new TypeError('Offline connection interrupted'), elapsedMs: 125 }]);
  await assert.rejects(createPetEpisode({}, r.dependencies), error => assertDiagnostics(error, {
    phase: 'planning', kind: 'connection', elapsedMs: 125, timeoutMs: 180_000, totalElapsedMs: 125,
  }));
  assert.equal(r.requests.length, 1);
});

test('a response-body abort after successful headers is classified as a timeout', async () => {
  const r = timedRunner([{ bodyAbort: true, elapsedMs: 180_000 }]);
  await assert.rejects(createPetEpisode({}, r.dependencies), error => assertDiagnostics(error, {
    phase: 'planning', kind: 'timeout', elapsedMs: 180_000, timeoutMs: 180_000, totalElapsedMs: 180_000,
  }));
  assert.equal(r.requests.length, 1);
});

test('a response-body connection interruption is diagnosed separately from malformed JSON', async () => {
  const r = timedRunner([{ bodyError: new TypeError('Offline body stream interrupted'), elapsedMs: 400 }]);
  await assert.rejects(createPetEpisode({}, r.dependencies), error => assertDiagnostics(error, {
    phase: 'planning', kind: 'connection', elapsedMs: 400, timeoutMs: 180_000, totalElapsedMs: 400,
  }));
  assert.equal(r.requests.length, 1);
});

test('malformed response JSON remains invalid output rather than a timeout', async () => {
  const r = timedRunner([{ bodyError: new SyntaxError('Offline malformed JSON'), elapsedMs: 400 }]);
  await assert.rejects(createPetEpisode({}, r.dependencies), error =>
    error instanceof PetPlannerError && error.code === 'pet_invalid_output' && error.status === 502 && error.diagnostics === undefined);
  assert.equal(r.requests.length, 1);
});

test('an exhausted total budget prevents even the first provider request', async () => {
  let clockReads = 0;
  const r = timedRunner([]);
  r.dependencies.clock = () => clockReads++ === 0 ? 0 : 270_000;
  await assert.rejects(createPetEpisode({}, r.dependencies), error => assertDiagnostics(error, {
    phase: 'planning', kind: 'timeout', elapsedMs: 0, timeoutMs: 0, totalElapsedMs: 270_000,
  }));
  assert.equal(r.requests.length, 0);
});

test('a budget exhausted during local draft processing refuses repair without another request', async () => {
  const short = [...validLines];
  short[3] = '이건 산책약속 달라';
  const r = timedRunner([{ value: plan(short), elapsedMs: 150_000 }]);
  const originalFetch = r.dependencies.fetch;
  r.dependencies.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const originalJson = response.json.bind(response);
    response.json = async () => {
      const parsed = await originalJson();
      // Simulate local suspension/processing before the next phase, without violating the paid call deadline.
      r.setElapsed(210_000);
      return parsed;
    };
    return response;
  };
  await assert.rejects(createPetEpisode({}, r.dependencies), error => {
    assertDiagnostics(error, { phase: 'repair', kind: 'timeout', elapsedMs: 0, timeoutMs: 0, totalElapsedMs: 210_000 });
    assert.equal(error.models.length, 1);
    return true;
  });
  assert.equal(r.requests.length, 1);
});

test('pet music is inferred in its existing planning call and compiles after the selected event without changing native contracts', async () => {
  const proposal = plan();
  proposal.music = { genreEn: 'dry swing', vocalEn: 'natural adult Korean close voice', moodEn: 'wry anticipation', styleEn: 'brushed snare and plucked bass answer the visible consequence', rationale: '동물의 행동과 집사의 짧은 반응을 가볍고 또렷하게 들려준다.', targetBpm: 114, isInstrumental: false };
  const r = runner([providerResponse(proposal, PET_PLANNING_MODEL), providerResponse(compilation(), PET_COMPILATION_MODEL)]);
  const episode = await createPetEpisode({}, r.dependencies);
  assert.equal(r.requests.length, 2, 'existing planner and compilation only');
  assert.deepEqual(JSON.parse(r.requests[0].input).musicOverrides, { genreEn: '', vocalEn: '', moodEn: '' });
  assert.match(episode.stylePrompt, /dry swing/); assert.doesNotMatch(episode.stylePrompt, /light rhythmic indie pop/);
  assert.equal(episode.version, 'pet-v3'); assert.deepEqual(episode.shots.map(shot => shot.id), ['S1','S2','S3','S4','S5','S6']);
  assert.deepEqual(episode.shots.map(shot => shot.durationSeconds), [4,5,5,6,6,4]);
  const selected = runner([providerResponse(proposal, PET_PLANNING_MODEL), providerResponse(compilation(), PET_COMPILATION_MODEL)]);
  const override = await createPetEpisode({ genreEn: 'acoustic jazz', vocalEn: 'expressive adult male Korean voice', moodEn: 'deadpan amusement' }, selected.dependencies);
  assert.match(override.stylePrompt, /acoustic jazz/); assert.match(override.stylePrompt, /adult male Korean voice/); assert.match(override.stylePrompt, /deadpan amusement/);
  assert.doesNotMatch(override.stylePrompt, /dry swing|wry anticipation/);
});
