/* eslint-disable @typescript-eslint/no-require-imports */
/** Offline contract tests: no provider, storage, audio or media generation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = name => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
  new Function('require', 'module', 'exports', 'process', 'fetch', code)(localRequire, mod, mod.exports,
    { env: { OPENAI_API_KEY: 'offline-contract-key' } }, () => { throw Error('NETWORK_FORBIDDEN'); });
  return mod.exports;
}
const { resolveDanceCreativeDirection } = load('src/lib/dance/creativeDirection.ts');
const { createDanceIdeas, danceCastRoster, validateDanceIdeas } = load('src/lib/dance/ideas.ts');
const { createDancePlan, validateDancePlan } = load('src/lib/dance/videoPlan.ts');
const { buildDancePreviewPrompt, buildDancePacedClipPrompt, createDanceVideoService } = load('src/lib/dance/videoService.ts');
const { resolveDanceMusicSpec } = load('src/lib/dance/musicProfiles.ts');
const preferences = (performer, ensemble, species = 'auto') => ({ performer, ensemble, species, location: 'studio', danceStyle: 'bounce', visualStyle: 'realistic', difficulty: 'easy' });
const music = { id: 'hook-pop', label: '팝 훅', style: 'original pop with kick, syncopated bass and vocal hook', rhythmPurpose: '체중 이동과 응답 훅', bpm: 138 };
function jobFor(prefs, seed = 'hook-contract', crowdCount = 6) {
  let direction = resolveDanceCreativeDirection(prefs, seed, '', [], music);
  if (prefs.ensemble === 'crowd') for (let i = 0; i < 100 && direction.cast.count !== crowdCount; i++) direction = resolveDanceCreativeDirection(prefs, `${seed}-${i}`, '', [], music);
  return { visualBrief: '기대한 규칙이 몸의 반응 때문에 달라지는 장면', musicSpec: music, bpm: 138, direction, creativePreferences: prefs };
}
function actorActions(cast, second = false) {
  return cast.members.map((member, index) => ({ memberId: member.id, action: second ? '몸통을 흔들기'
    : member.kind === 'animal' ? member.species === 'penguin' ? '지느러미 펴기' : '앞발 옆 딛기'
      : index ? '고개 끄덕이기' : '발 옆 딛기' }));
}
function story(index) {
  return { openingExpectation: ['엄숙한 규칙에 뜻밖의 작은 신체 반응이 끼어든다.', '큰 동작이 이길 것 같지만 작은 응답이 반대 방향을 이끈다.', '닫힌 자세 안에서 기대와 다른 움직임이 펼쳐진다.'][index],
    watchReason: ['누가 다음 몸짓을 받아 규칙을 바꿀까?', '작은 반응이 큰 움직임을 어디까지 뒤집을까?', '닫힌 자세에서 어떤 몸 모양이 드러날까?'][index],
    development: '몸통을 반대쪽으로 기울여 응답 방향을 바꾼다.', payoff: '발을 중앙에 딛고 몸통을 펼쳐 바뀐 응답을 마친다.', restart: '몸통을 낮추고 고개를 돌려 처음의 기대를 다시 연다.' };
}
function ideaPayload(job) {
  const cast = job.direction.cast;
  return { selection: { musicProfileId: job.musicSpec.id, castLabel: job.direction.castLabel, locationLabel: job.direction.locationLabel },
    castRoster: danceCastRoster(cast), ideas: ['interaction', 'contrast', 'rhythm_reveal'].map((family, index) => ({
      id: `mechanism_${index}`, title: ['작은 응답의 역전', '큰 몸짓의 작은 패배', '숨은 모양의 공개'][index], conceptFamily: family,
      firstTwoSeconds: { startSeconds: 0, endSeconds: 2, action: ['몸통을 기울여 상대의 응답을 받고 발을 옆으로 딛는다.', '몸통을 왼쪽으로 돌리고 발을 오른쪽으로 딛어 반대 방향을 만든다.', '몸통을 낮추고 지느러미를 접었다 펼쳐 닫힌 모양을 연다.'][index] },
      signatureSteps: [{ count: 4, action: '몸통을 기울이며 발을 옆으로 딛기', focus: 'body', actors: actorActions(cast) },
        { count: 4, action: '몸통을 작게 흔들어 응답 방향 바꾸기', focus: 'body', actors: actorActions(cast, true) }],
      musicConnection: '짧은 킥과 베이스 응답에 체중 이동과 몸통의 반대 방향을 연결한다.', visualPayoff: '발을 중앙에 딛고 몸통을 펼쳐 응답 방향을 뒤집는다.',
      seriesPotential: '같은 응답 규칙을 유지하고 다음 편에서는 시작 방향을 바꾼다.', productionRisk: '인원과 위치가 섞일 수 있어 몸통 이동 폭을 작게 제한한다.', hookStory: story(index),
    })) };
}
function planPayload(job) {
  const cast = job.direction.cast;
  return { version: 2, title: '응답으로 뒤집힌 기대', summary: '작은 신체 반응이 시작의 규칙을 바꾸고 다시 첫 자세로 돌아간다.', identity: `${cast.count} original performers with the exact saved identities`,
    castRoster: danceCastRoster(cast), imagePrompt: 'Show the complete saved cast in their stable slots, full bodies visible. Opening mismatch is legible through posture and gaze.',
    clips: ['0-2s reveal the expectation through the first moving hook; develop a changed physical response.', 'Continue the real final frame; resolve the changed response and restore the opening rule.'],
    choreography: { hookName: '방향을 바꾸는 응답', firstPose: '몸통을 약간 기울이고 서로 다른 응답을 준비한다.', endPose: '몸통을 낮추고 고개를 돌려 첫 규칙으로 돌아간다.',
      steps: [{ count: 4, action: '발과 몸통으로 첫 응답을 보내기', focus: 'body', actors: actorActions(cast) }, { count: 4, action: '몸통을 흔들어 응답 방향 바꾸기', focus: 'body', actors: actorActions(cast, true) }],
      segments: [{ startSeconds: 0, endSeconds: 2, phase: 'opening', action: '몸통을 기울이며 뜻밖의 첫 응답을 보낸다.', repeatHook: true },
        { startSeconds: 2, endSeconds: 22, phase: 'development', action: '몸통을 반대 방향으로 돌려 응답 역할을 바꾼다.', repeatHook: true },
        { startSeconds: 22, endSeconds: 28, phase: 'payoff', action: '발을 중앙에 딛고 몸통을 펼쳐 새 응답을 마친다.', repeatHook: true },
        { startSeconds: 28, endSeconds: 30, phase: 'restart', action: '몸통을 낮추고 고개를 돌려 처음의 기대를 다시 연다.', repeatHook: true }] } };
}
const response = payload => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }] });

test('three causal candidates preserve solo, duo, trio, crowd, mixed and animals-only casts in one bounded call', async () => {
  for (const prefs of [preferences('woman', 'solo'), preferences('man', 'duo'), preferences('woman', 'trio'), preferences('crowd', 'crowd'), preferences('human_animal', 'duo', 'dog'), preferences('animal', 'duo', 'penguin')]) {
    const job = jobFor(prefs); let calls = 0;
    const result = await createDanceIdeas(job, async (_url, options) => {
      calls++; const request = JSON.parse(options.body), input = JSON.parse(request.messages[1].content);
      assert.deepEqual(input.selectedCastRoster, danceCastRoster(job.direction.cast));
      assert.match(request.messages[0].content, /no fixed character, costume or prop template/);
      assert.match(request.messages[0].content, /vocals\/instrumental status is not a creative quality gate/);
      assert.equal(request.response_format.json_schema.schema.properties.castRoster.minItems, job.direction.cast.count);
      return response(ideaPayload(job));
    });
    assert.equal(calls, 1); assert.equal(result.length, 3); assert.equal(new Set(result.map(idea => idea.hookStory.watchReason)).size, 3);
    for (const idea of result) {
      assert.deepEqual(idea.cast, job.direction.cast); assert.equal(idea.signatureActors[0].actors.length, job.direction.cast.count);
      assert.deepEqual(validateDanceIdeas(result, job.direction.cast), result);
    }
  }
});
test('wrong roster, missing actor and duplicated watch reasons are held without a paid retry', async () => {
  const job = jobFor(preferences('human_animal', 'duo', 'dog'));
  for (const change of [p => p.castRoster.pop(), p => p.castRoster[1].species = 'human', p => p.ideas[0].signatureSteps[0].actors.pop(), p => p.ideas[1].hookStory.watchReason = p.ideas[0].hookStory.watchReason]) {
    const payload = ideaPayload(job); change(payload); let calls = 0;
    await assert.rejects(createDanceIdeas(job, async () => { calls++; return response(payload); }), { code: 'PLAN_INVALID' }); assert.equal(calls, 1);
  }
});
test('new plan preserves actor roles, physical development/payoff/restart and exact image/cast contracts', async () => {
  for (const prefs of [preferences('human_animal', 'trio', 'dog'), preferences('animal', 'duo', 'penguin'), preferences('crowd', 'crowd')]) {
    const job = jobFor(prefs); let calls = 0;
    const ideas = await createDanceIdeas(job, async () => response(ideaPayload(job))); job.selectedIdea = ideas[0];
    const plan = await createDancePlan(job, async (_url, options) => {
      calls++; const request = JSON.parse(options.body);
      assert.deepEqual(JSON.parse(request.messages[1].content).selectedCastRoster, danceCastRoster(job.direction.cast));
      assert.match(request.messages[0].content, /opening.*development.*payoff.*restart/); return response(planPayload(job));
    });
    assert.equal(calls, 1); assert.deepEqual(plan.cast, job.direction.cast);
    for (const member of plan.cast.members) {
      assert.ok(plan.imagePrompt.includes(member.identity)); assert.ok(plan.clips.every(clip => clip.includes(member.id)));
    }
    assert.match(plan.clips[0], /0-2s opening/); assert.match(plan.clips[1], /actual final frame/); assert.match(plan.clips[1], /payoff.*restart/);
    assert.ok(plan.clips.every(clip => Buffer.byteLength(clip, 'utf8') <= 4096)); assert.ok(Buffer.byteLength(plan.imagePrompt, 'utf8') <= 4096);
    job.plan = plan;
    assert.ok(Buffer.byteLength(buildDancePreviewPrompt(job), 'utf8') <= 4096);
    assert.match(buildDancePreviewPrompt(job), /later payoff\/restart is outside this test/);
    assert.ok(plan.clips.every(clip => buildDancePacedClipPrompt(job, clip) === clip));
    if (plan.cast.kind === 'animal') assert.match(plan.clips[0], /species-native|flipper|waddl/i);
  }
});
test('a roster echo cannot excuse contradictory solo/count prose or an unchanged repetitive timeline', () => {
  const job = jobFor(preferences('man', 'duo'));
  for (const change of [p => p.identity = 'one original adult man', p => p.clips[1] = 'The solo dancer dances alone.', p => p.choreography.segments[1].phase = 'opening', p => p.choreography.segments[0].endSeconds = 3,
    p => p.choreography.segments[2].action = p.choreography.segments[1].action, p => p.choreography.steps[0].actors[1].memberId = 'performer_1']) {
    const payload = planPayload(job); change(payload); assert.throws(() => validateDancePlan(payload, job.direction, 138), { code: 'PLAN_INVALID' });
  }
  const animal = jobFor(preferences('animal', 'duo', 'penguin')), payload = planPayload(animal); payload.identity = 'two penguins with an adult man';
  assert.throws(() => validateDancePlan(payload, animal.direction, 138), { code: 'PLAN_INVALID' });
});
test('clip 2 continues the actual bridge frame and applies the final pose only at its end, including legacy plans', () => {
  const job = jobFor(preferences('human_animal', 'duo', 'dog'));
  for (const withCast of [true, false]) {
    const payload = planPayload(job);
    if (!withCast) {
      delete payload.castRoster;
      payload.choreography.steps = payload.choreography.steps.map(({ count, action, focus }) => ({ count, action, focus }));
      payload.choreography.segments = payload.choreography.segments.map(({ startSeconds, endSeconds, action, repeatHook }) => ({ startSeconds, endSeconds, action, repeatHook }));
    }
    const plan = validateDancePlan(payload, withCast ? job.direction : undefined, 138);
    const endMarker = `Final pose at local15s only: ${payload.choreography.endPose}.`;
    assert.match(plan.clips[1], /Continue clip1's actual final frame at local0s; no early reset\./);
    assert.ok(plan.clips[1].includes(endMarker));
    assert.ok(!plan.clips[0].includes(payload.choreography.endPose));
    assert.ok(!plan.clips[1].slice(0, plan.clips[1].indexOf(endMarker)).includes(payload.choreography.endPose));
    assert.equal(plan.clips[1].split(payload.choreography.endPose).length, 2);
    assert.doesNotMatch(plan.clips[1], /Restart:|Start:|Opening pose:|Finish pose:/);
    assert.ok(plan.clips.every(clip => Buffer.byteLength(clip, 'utf8') <= 4096));
  }
  const legacy = planPayload(job);
  delete legacy.version; delete legacy.castRoster; delete legacy.choreography;
  assert.equal(validateDancePlan(legacy, undefined, 138).clips.length, 2);
});
test('UTF8 bytes cap Korean prompts and the six-actor prompt contract without truncation', () => {
  const job = jobFor(preferences('crowd', 'crowd')); const plan = validateDancePlan(planPayload(job), job.direction, 138);
  assert.equal(plan.cast.count, 6); job.plan = plan;
  assert.throws(() => buildDancePacedClipPrompt(job, '가'.repeat(1500)), { code: 'PLAN_LENGTH' });
  const long = planPayload(job); long.clips[0] = '가'.repeat(1200);
  assert.throws(() => validateDancePlan(long, job.direction, 138), { code: 'PLAN_INVALID' });
});
test('four- and six-actor provider envelopes retain every ID within the compiled UTF8 budget', t => {
  for (const count of [4, 6]) {
    const job = jobFor(preferences('crowd', 'crowd'), `envelope-${count}`, count), payload = planPayload(job);
    assert.equal(job.direction.cast.count, count);
    payload.clips = ['x'.repeat(300), 'y'.repeat(300)]; payload.imagePrompt = 'x'.repeat(1000);
    const pad = (text, limit) => text.padEnd(limit, '가');
    payload.choreography.firstPose = pad('몸통을 기울인 첫 자세', 40); payload.choreography.endPose = pad('몸통을 낮춘 재시작 자세', 40);
    payload.choreography.steps = Array.from({ length: 4 }, (_, index) => ({ count: 2, action: pad(`몸통을 ${index} 방향으로 흔들기`, 60), focus: 'body',
      actors: job.direction.cast.members.map(member => ({ memberId: member.id, action: pad('몸통 흔들기', Math.max(8, Math.floor(48 / count))) })) }));
    payload.choreography.segments = [[0, 2, 'opening'], [2, 5, 'development'], [5, 8, 'development'], [8, 12, 'development'], [12, 22, 'payoff'], [22, 30, 'restart']].map(([startSeconds, endSeconds, phase], index) =>
      ({ startSeconds, endSeconds, phase, action: pad(`몸통을 ${index} 방향으로 기울이기`, 40), repeatHook: true }));
    const plan = validateDancePlan(payload, job.direction, 138); job.plan = plan;
    const idea = { id: 'envelope', title: '범위 검사', firstTwoSeconds: pad('0~2초: 몸통을 기울인다.', 220), signatureMove: '4카운트: 발을 옆으로 딛기 / 4카운트: 몸통을 흔들기',
      signatureActors: payload.choreography.steps.map(step => ({ count: step.count, actors: step.actors })), cast: job.direction.cast, hookStory: { ...story(0), development: pad('몸통을 반대로 기울인다.', 160) } };
    job.selectedIdea = idea;
    const sizes = [plan.imagePrompt, ...plan.clips, buildDancePreviewPrompt(job)].map(prompt => Buffer.byteLength(prompt, 'utf8'));
    assert.ok(sizes.every(size => size <= 4096));
    assert.match(plan.clips[1], /Continue clip1's actual final frame at local0s; no early reset\./);
    assert.ok(plan.clips[1].includes(`Final pose at local15s only: ${payload.choreography.endPose}.`));
    for (const member of plan.cast.members) assert.ok(plan.clips.every(clip => clip.includes(member.id)));
    payload.clips[0] = '가'.repeat(300); // Same character limit, three times the UTF8 bytes.
    assert.throws(() => validateDancePlan(payload, job.direction, 138), { code: 'PLAN_LENGTH' });
    t.diagnostic(`${count}-actor image/clip1/clip2/preview UTF8 bytes: ${sizes.join('/')}`);
  }
});
test('site service persists the mixed cast through idea choice, preview and both clips with a fixed reference', async () => {
  const userId = 'a0000000-0000-4000-8000-000000000001', trackId = 'a0000000-0000-4000-8000-000000000002';
  const metadata = { workflow: 'dance-music-first-v1', presetId: 'dance_challenge', danceMusic: resolveDanceMusicSpec('hook-pop', 'on', 'contract-service') };
  let row = { id: trackId, userId, status: 'completed', title: '오프라인 원곡', isPublic: false, createdAt: '2026-10-09T00:00:00Z', audioUrl: 'https://offline.test/original.mp3', metadata, licenseHash: JSON.stringify(metadata) };
  const submissions = [], forbidden = async () => { throw Error('NETWORK_FORBIDDEN'); };
  const store = { load: async () => structuredClone(row), compareAndSwap: async (previous, job) => { if (previous.licenseHash !== row.licenseHash) return null;
    const metadata = { ...row.metadata, danceVideo: structuredClone(job) }; row = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; return structuredClone(row); } };
  let now = Date.now();
  const service = createDanceVideoService({ store, now: () => now, videoModel: 'grok-imagine-video-1.5', reuseSnapshot: forbidden,
    snapshot: async () => ({ audioUrl: 'https://offline.test/30s.wav', audioHash: 'a'.repeat(64), sourceAudioHash: 'b'.repeat(64), sourceDurationSeconds: 180, bpm: 138 }),
    ideas: job => createDanceIdeas(job, async () => response(ideaPayload(job))), plan: job => createDancePlan(job, async () => response(planPayload(job))),
    generateImage: async () => ({ url: 'https://offline.test/provider-image.png' }), copyAsset: async (_job, _kind, _url, name) => `https://offline.test/${name}`,
    startVideo: async (prompt, duration, frame, options) => { submissions.push({ prompt, duration, frame, options }); return { requestId: `offline-${submissions.length}` }; },
    pollVideo: async () => ({ status: 'done', url: 'https://offline.test/clip.mp4' }), bridge: async () => 'https://offline.test/actual-final-frame.jpg', preview: async () => 'https://offline.test/preview.mp4', render: async () => 'https://offline.test/final.mp4' });
  let job = await service.prepare(userId, trackId, 0, '', preferences('human_animal', 'duo', 'dog')); assert.equal(job.status, 'ideas');
  job = await service.selectIdea(userId, trackId, job.id, job.ideas[0].id); assert.equal(job.status, 'ready');
  job = await service.start(userId, trackId, job.id);
  const advance = async () => { now += 5000; job = await service.advance(userId, trackId, job.id); };
  await advance(); assert.equal(job.status, 'image-review'); job = await service.approveFrame(userId, trackId, job.id);
  await advance(); await advance(); assert.equal(job.status, 'preview-review'); job = await service.approvePreview(userId, trackId, job.id);
  for (let i = 0; i < 8 && job.status !== 'completed'; i++) await advance();
  assert.equal(job.status, 'completed'); assert.deepEqual(job.direction.cast, job.selectedIdea.cast); assert.deepEqual(job.plan.cast, job.direction.cast);
  assert.deepEqual(submissions.map(item => item.duration), [5, 15, 15]);
  for (const submission of submissions) { assert.equal(submission.options.referenceImageUrl, job.imageUrl); assert.equal(submission.options.generateAudio, false); assert.match(submission.prompt, /performer_1.*performer_2/); assert.ok(Buffer.byteLength(submission.prompt, 'utf8') <= 4096); }
  assert.equal(submissions[2].frame, 'https://offline.test/actual-final-frame.jpg');
});
