/* eslint-disable @typescript-eslint/no-require-imports */
/** Real component, hooks and transport; all replies are offline fixtures. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const existing = fs.readFileSync(path.join(__dirname, 'dance-ui.test.cjs'), 'utf8');
const boundary = existing.indexOf("\ntest('guest fresh entry");
assert.ok(boundary > 0, 'Shared real-component harness must exist');
const shared = { exports: {} };
new Function('require', 'module', '__dirname', `${existing.slice(0, boundary)}\nmodule.exports = { harness, track, walk, label, select, button, selectedTrack, deferred, creativeDirection };`)(require, shared, __dirname);
const { harness, track, walk, label, select, button, selectedTrack, deferred, creativeDirection } = shared.exports;
function storageHarness(storage, options) {
  const scoped = { exports: {} };
  const injected = existing.slice(0, boundary).replace('module: mod, exports: mod.exports, console, AbortController, Error,',
    'module: mod, exports: mod.exports, console, AbortController, Error, localStorage: receiptStorage,');
  new Function('require', 'module', '__dirname', 'receiptStorage', `${injected}\nmodule.exports = { harness };`)(require, scoped, __dirname, storage);
  return scoped.exports.harness(options);
}
const context = ui => walk(ui.tree, node => node.type === 'textarea' && node.props['aria-label'] === '새 음원의 핵심 컨셉과 맥락')[0];
const visual = ui => walk(ui.tree, node => node.type === 'textarea' && node.props['aria-label'] === '영상의 핵심 컨셉과 맥락')[0];
const rawContext = '  영업이 끝난 카페에서 동료 셋이 마무리하며 춤춘다.\n일을 끝낸 해방감을 담는다.  ';
const canonical = rawContext.trim();
const posts = ui => ui.requests.filter(request => request.body);
async function enterContext(ui, value = rawContext) { context(ui).props.onChange({ target: { value } }); await ui.settle(); }
function conceptTrack(id, instrumental = false, extra = {}) {
  return track(id, { title: '마감 뒤 자유', musicMode: 'concept', coreContext: canonical, musicPlanningState: 'planned',
    musicLabel: '컨셉에 맞춘 새 음악', instrumental, vocalPreference: 'recommended', ...extra });
}

test('fresh entry is concept-first with inferred style and vocal mode, and never selects an owned song', async () => {
  const ui = harness({ reply: () => ({ tracks: [track('owned-song')] }) }); await ui.settle();
  assert.equal(selectedTrack(ui.tree).props.value, ''); assert.equal(context(ui).props.value, '');
  assert.equal(button(ui.tree, '새 댄스 음원 만들기').props.disabled, true);
  assert.equal(select(ui.tree, '댄스 음악').props.value, ''); assert.equal(select(ui.tree, '보컬').props.value, 'recommended');
  assert.equal(walk(select(ui.tree, '댄스 음악'), node => node.type === 'option' && node.props.value).length, 6);
  const ordered = walk(ui.tree, node => node.type === 'textarea' || node.type === 'button');
  assert.ok(ordered.indexOf(context(ui)) < ordered.indexOf(button(ui.tree, '새 댄스 음원 만들기')));
  assert.match(label(ui.tree), /음악 스타일을 설계하고 새 음원을/);
  await ui.runTimers(); assert.equal(posts(ui).length, 0); assert.equal(ui.uuidCount, 0);
});

test('one create captures exact canonical context, optional locks and UUID before waiting; duplicate clicks submit once', async () => {
  const pending = deferred();
  const ui = harness({ reply: request => request.body ? pending.promise : { tracks: [] } }); await ui.settle();
  await enterContext(ui); select(ui.tree, '댄스 음악').props.onChange({ target: { value: 'house-footwork' } });
  select(ui.tree, '보컬').props.onChange({ target: { value: 'on' } }); await ui.settle();
  const create = button(ui.tree, '새 댄스 음원 만들기'); create.props.onClick(); create.props.onClick(); await ui.settle();
  assert.equal(posts(ui).length, 1); assert.equal(ui.uuidCount, 1);
  assert.deepEqual(posts(ui)[0].body, { requestId: 'd0000000-0000-4000-8000-000000000001', isPublic: true,
    musicMode: 'concept', coreContext: canonical, musicProfileId: 'house-footwork', vocalPreference: 'on' });
  assert.equal(context(ui).props.disabled, true); assert.equal(select(ui.tree, '댄스 음악').props.disabled, true);
  pending.resolve({ track: conceptTrack(posts(ui)[0].body.requestId, false, { status: 'generating', audioUrl: null }) }); await ui.settle();
  assert.equal(posts(ui).length, 1);
});

test('empty and oversized context cannot reserve a UUID or call a planner', async () => {
  const ui = harness(); await ui.settle();
  for (const value of ['   ', '가'.repeat(1001)]) {
    await enterContext(ui, value); button(ui.tree, '새 댄스 음원 만들기').props.onClick(); await ui.settle();
    assert.equal(posts(ui).length, 0); assert.equal(ui.uuidCount, 0);
  }
});

test('uncertain music retry sends the same frozen context, privacy, inferred mode and UUID without selecting a preset', async () => {
  let attempts = 0;
  const ui = harness({ reply: request => {
    if (!request.body) return request.url.includes('dance-video') ? { job: null } : { tracks: [] };
    if (++attempts === 1) throw new Error('응답 확인 필요');
    return { track: conceptTrack(request.body.requestId, true, { status: 'generating', audioUrl: null }) };
  } }); await ui.settle(); await enterContext(ui);
  walk(ui.tree, node => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange({ target: { checked: false } }); await ui.settle();
  const staleContext = context(ui).props.onChange;
  button(ui.tree, '새 댄스 음원 만들기').props.onClick(); await ui.settle();
  assert.equal(context(ui).props.disabled, true); staleContext({ target: { value: '다른 입력' } }); await ui.settle();
  button(ui.tree, '같은 음원 요청 상태 확인').props.onClick(); await ui.settle();
  assert.equal(posts(ui).length, 2); assert.deepEqual(posts(ui)[0].body, posts(ui)[1].body); assert.equal(ui.uuidCount, 1);
  assert.equal(posts(ui)[0].body.coreContext, canonical); assert.equal(posts(ui)[0].body.isPublic, false);
  assert.equal(posts(ui)[0].body.vocalPreference, 'recommended'); assert.equal(Object.hasOwn(posts(ui)[0].body, 'musicProfileId'), false);
});

test('reload restores saved concept for ideas, displays actual inferred vocal mode and preserves saved audio hashes', async () => {
  for (const instrumental of [false, true]) {
    const song = conceptTrack('new-original', instrumental);
    const sourceHash = 'a'.repeat(64), clipHash = 'b'.repeat(64);
    const ui = harness({ props: { initialTrackId: song.id }, reply: request => {
      if (request.body) return { job: { id: 'new-ideas', trackId: song.id, status: 'ideas', startSeconds: 0, durationSeconds: 30,
        visualBrief: request.body.visualBrief, creativePreferences: request.body.creativePreferences, audioUrl: 'https://storage.test/clip.wav',
        sourceAudioHash: sourceHash, audioHash: clipHash, ideas: [] } };
      return request.url.includes('dance-video') ? { job: null } : { tracks: [song] };
    } }); await ui.settle();
    assert.equal(context(ui), undefined); assert.equal(visual(ui).props.value, canonical);
    assert.match(label(ui.tree), /이 음원에 사용한 핵심 컨셉과 맥락/);
    assert.ok(label(ui.tree).includes(instrumental ? '보컬 없음' : '보컬 포함'));
    await ui.runTimers(); assert.equal(posts(ui).length, 0);
    button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
    assert.equal(posts(ui).length, 1); assert.equal(posts(ui)[0].body.trackId, song.id); assert.equal(posts(ui)[0].body.visualBrief, canonical);
    assert.equal(posts(ui)[0].url, '/api/viral-cf/dance-video');
    const savedClip = walk(ui.tree, node => node.type === 'audio' && node.props['aria-label'] === '저장된 30초 음원')[0];
    assert.equal(savedClip.props.src, 'https://storage.test/clip.wav');
    assert.equal(Object.hasOwn(posts(ui)[0].body, 'sourceAudioHash'), false, 'Client must use server-owned source identity');
    assert.equal(Object.hasOwn(posts(ui)[0].body, 'audioHash'), false, 'Client cannot rewrite server-owned clip identity');
  }
});

test('existing video signature takes priority over music context and remains ready without another prepare request', async () => {
  const song = conceptTrack('existing-original');
  const ready = { id: 'saved-ready', trackId: song.id, status: 'ready', startSeconds: 12, durationSeconds: 30,
    visualBrief: '저장된 영상에만 사용한 다른 맥락', creativePreferences: { performer: 'man', location: 'rooftop', danceStyle: 'shuffle', visualStyle: 'stylized3d', difficulty: 'medium' } };
  const ui = harness({ props: { initialTrackId: song.id }, reply: request => request.url.includes('dance-video') ? { job: ready } : { tracks: [song] } });
  await ui.settle(); assert.equal(visual(ui).props.value, ready.visualBrief);
  assert.equal(select(ui.tree, '출연자').props.value, 'man'); assert.equal(button(ui.tree, '장면 설계 완료').props.disabled, true);
  await ui.runTimers(); assert.equal(posts(ui).length, 0);
});

test('held music planning only reads saved state, and a late account-A creation cannot restore its private context', async () => {
  const held = conceptTrack('held-plan', false, { status: 'failed', audioUrl: null, musicPlanningState: 'attention', error: '음악 기획 상태 확인 필요' });
  const holdUi = harness({ props: { initialTrackId: held.id }, reply: request => request.url.includes('dance-video') ? { job: null } : { tracks: [held] } });
  await holdUi.settle(); await holdUi.runTimers(); assert.equal(posts(holdUi).length, 0); assert.equal(visual(holdUi), undefined);
  assert.match(label(holdUi.tree), /음악 기획 상태 확인 필요/);
  const late = deferred();
  const ui = harness({ reply: request => request.body ? late.promise : { tracks: [] } }); await ui.settle(); await enterContext(ui);
  button(ui.tree, '새 댄스 음원 만들기').props.onClick(); await ui.settle(); await ui.settle({ userId: 'owner-B' });
  late.resolve({ track: conceptTrack('private-A') }); await ui.settle();
  assert.equal(context(ui).props.value, ''); assert.doesNotMatch(label(ui.tree), /private-A|마감 뒤 자유|동료 셋/);
});

test('explicit legacy owned-audio selection preserves the original audio and blank story fallback without creating music', async () => {
  const legacy = track('legacy-owned', { musicLabel: '기존 연주곡', instrumental: true });
  const ui = harness({ reply: request => {
    if (request.body) return { job: { id: 'legacy-ideas', trackId: legacy.id, status: 'ideas', startSeconds: 0, durationSeconds: 30,
      visualBrief: request.body.visualBrief, creativePreferences: request.body.creativePreferences, ideas: [] } };
    return request.url.includes('dance-video') ? { job: null } : { tracks: [legacy] };
  } }); await ui.settle(); assert.equal(selectedTrack(ui.tree).props.value, '');
  selectedTrack(ui.tree).props.onChange({ target: { value: legacy.id } }); await ui.settle();
  assert.equal(context(ui), undefined); assert.equal(visual(ui).props.value, '');
  const fullSong = walk(ui.tree, node => node.type === 'audio' && node.props['aria-label'] === '곡 전체 듣기')[0];
  assert.equal(fullSong.props.src, legacy.audioUrl); assert.ok(label(ui.tree).includes('보컬 없음'));
  button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
  assert.equal(posts(ui).length, 1); assert.equal(posts(ui)[0].url, '/api/viral-cf/dance-video');
  assert.equal(posts(ui)[0].body.trackId, legacy.id); assert.equal(posts(ui)[0].body.visualBrief, '');
});

test('explicit concept-audio reuse keeps the saved clip identity and starts a fresh blank video context', async () => {
  const sourceHash = 'a'.repeat(64), clipHash = 'b'.repeat(64), clipUrl = 'https://storage.test/original-clip.wav';
  const original = conceptTrack('original');
  const sourceJob = { id: 'original-job', trackId: original.id, status: 'ready', startSeconds: 22, durationSeconds: 30,
    visualBrief: canonical, audioUrl: clipUrl, sourceAudioHash: sourceHash, audioHash: clipHash };
  const fork = conceptTrack('fork', false, { reused: true, rootTrackId: original.id,
    savedClip: { audioUrl: clipUrl, audioHash: clipHash, startSeconds: 22, durationSeconds: 30 } });
  const ui = harness({ props: { initialTrackId: original.id }, reply: request => {
    if (request.body) return { trackId: fork.id };
    if (request.url.includes('dance-video')) return { job: request.url.endsWith(`trackId=${fork.id}`) ? null : sourceJob };
    if (request.url.endsWith(`trackId=${fork.id}`)) return { tracks: [fork] };
    return { tracks: [original] };
  } }); await ui.settle();
  const reuse = button(ui.tree, '같은 음원으로 새 챌린지 만들기'); reuse.props.onClick(); reuse.props.onClick(); await ui.settle();
  assert.equal(posts(ui).length, 1); assert.deepEqual(posts(ui)[0].body, { action: 'reuse', trackId: original.id,
    jobId: sourceJob.id, requestId: 'd0000000-0000-4000-8000-000000000001' });
  assert.equal(selectedTrack(ui.tree).props.value, fork.id); assert.equal(visual(ui).props.value, '');
  assert.equal(walk(ui.tree, node => node.type === 'audio' && node.props['aria-label'] === '선택 구간 미리듣기')[0].props.src, clipUrl);
  assert.equal(walk(ui.tree, node => node.type === 'input' && node.props['aria-label'] === '30초 구간 시작 위치')[0].props.disabled, true);
  await ui.runTimers(); assert.equal(posts(ui).length, 1, 'Explicit reuse never creates music or automatically prepares a story');
});

const ownerA = 'a0000000-0000-4000-8000-000000000001', ownerB = 'b0000000-0000-4000-8000-000000000001';
const receiptId = 'd0000000-0000-4000-8000-000000000001', paidReference = 'suno:kie:fixture-paid-id';
const receiptNamespace = owner => `melodio:dance-music-receipt:v1:${owner}`;
const storedReceipt = () => ({ version: 1, ownerId: ownerA, id: receiptId, trackId: receiptId, musicMode: 'concept', coreContext: canonical,
  isPublic: true, vocalPreference: 'recommended', acceptedTaskReference: paidReference });
function storageMap(failed = false) {
  const values = new Map();
  return { values, getItem(key) { if (failed) throw Error('STORAGE_UNAVAILABLE'); return values.get(key) || null; },
    setItem(key, value) { if (failed) throw Error('STORAGE_UNAVAILABLE'); values.set(key, value); },
    removeItem(key) { if (failed) throw Error('STORAGE_UNAVAILABLE'); values.delete(key); } };
}
const olderReservation = () => conceptTrack(receiptId, false, { requestId: receiptId, status: 'generating', audioUrl: null });

test('known paid-task receipt survives older DB reads and reload without resubmission; unavailable storage keeps attention in memory', async () => {
  for (const failedStorage of [false, true]) {
    const storage = storageMap(failedStorage);
    const ui = storageHarness(storage, { props: { userId: ownerA }, reply: request => {
      if (request.body) return { track: conceptTrack(request.body.requestId, false, { requestId: request.body.requestId, status: 'attention', audioUrl: null,
        acceptedTaskReference: paidReference, error: '제출 후 DB 저장 상태 확인 필요' }) };
      return request.url.includes('dance-video') ? { job: null } : { tracks: request.owner === ownerA ? [olderReservation()] : [] };
    } }); await ui.settle(); await enterContext(ui);
    button(ui.tree, '새 댄스 음원 만들기').props.onClick(); await ui.settle();
    assert.equal(posts(ui).length, 1); assert.ok(label(ui.tree).includes(paidReference));
    button(ui.tree, '음원 상태 확인').props.onClick(); await ui.settle(); await ui.runTimers();
    assert.equal(posts(ui).length, 1); assert.ok(button(ui.tree, '같은 음원 요청 상태 확인'));
    assert.ok(label(ui.tree).includes(paidReference)); assert.doesNotMatch(label(ui.tree), /음원 생성 중…/);
    button(ui.tree, '같은 음원 요청 상태 확인').props.onClick(); await ui.settle();
    assert.equal(posts(ui).length, 1); assert.ok(ui.requests.some(request => request.url === `/api/viral-cf/dance-music?trackId=${receiptId}` && request.body === null));
    if (failedStorage) {
      assert.match(label(ui.tree), /브라우저에 복구 영수증을 저장하지 못했습니다/);
      await ui.settle({ userId: ownerB }); assert.doesNotMatch(label(ui.tree), /fixture-paid-id|동료 셋/);
      await ui.settle({ userId: ownerA }); assert.ok(label(ui.tree).includes(paidReference));
      assert.match(label(ui.tree), /브라우저에 복구 영수증을 저장하지 못했습니다/); assert.equal(posts(ui).length, 1);
    }
    else {
      assert.deepEqual(JSON.parse(storage.values.get(receiptNamespace(ownerA))), storedReceipt());
      const reload = storageHarness(storage, { props: { userId: ownerA }, reply: request => request.url.includes('dance-video') ? { job: null } : { tracks: [olderReservation()] } });
      await reload.settle(); await reload.runTimers();
      assert.equal(posts(reload).length, 0); assert.equal(reload.uuidCount, 0); assert.equal(selectedTrack(reload.tree).props.value, receiptId);
      assert.ok(label(reload.tree).includes(paidReference)); assert.ok(button(reload.tree, '같은 음원 요청 상태 확인'));
      button(reload.tree, '같은 음원 요청 상태 확인').props.onClick(); await reload.settle();
      assert.equal(posts(reload).length, 0); assert.equal(reload.uuidCount, 0);
    }
  }
});

test('cross-owner and malformed receipts cannot leak or restore a captured music request', async () => {
  const storage = storageMap(); storage.values.set(receiptNamespace(ownerB), JSON.stringify(storedReceipt()));
  const ui = storageHarness(storage, { props: { userId: ownerB }, reply: () => ({ tracks: [] }) }); await ui.settle(); await ui.runTimers();
  assert.equal(context(ui).props.value, ''); assert.doesNotMatch(label(ui.tree), /fixture-paid-id|동료 셋|같은 음원 요청 상태 확인/);
  assert.equal(posts(ui).length, 0); assert.equal(ui.uuidCount, 0);
  for (const mutation of [{ id: 'not-a-uuid', trackId: 'not-a-uuid' }, { trackId: ownerB }, { acceptedTaskReference: 'invalid-provider-reference' }]) {
    storage.values.set(receiptNamespace(ownerA), JSON.stringify({ ...storedReceipt(), ...mutation }));
    const malformed = storageHarness(storage, { props: { userId: ownerA }, reply: () => ({ tracks: [] }) }); await malformed.settle();
    assert.doesNotMatch(label(malformed.tree), /같은 음원 요청 상태 확인|fixture-paid-id/); assert.equal(posts(malformed).length, 0);
  }
});

test('matching completed DB audio supersedes and removes the local receipt while the actual source remains authoritative', async () => {
  const storage = storageMap(); storage.values.set(receiptNamespace(ownerA), JSON.stringify(storedReceipt()));
  let completed = false;
  const sourceUrl = 'https://storage.test/verified-completed-original.mp3';
  const ui = storageHarness(storage, { props: { userId: ownerA }, reply: request => request.url.includes('dance-video') ? { job: null } : {
    tracks: [completed ? conceptTrack(receiptId, true, { requestId: receiptId, audioUrl: sourceUrl, status: 'completed' }) : olderReservation()],
  } }); await ui.settle(); assert.ok(label(ui.tree).includes(paidReference));
  completed = true; button(ui.tree, '음원 상태 확인').props.onClick(); await ui.settle();
  assert.equal(storage.values.has(receiptNamespace(ownerA)), false); assert.doesNotMatch(label(ui.tree), /fixture-paid-id|같은 음원 요청 상태 확인/);
  const audio = walk(ui.tree, node => node.type === 'audio' && node.props['aria-label'] === '곡 전체 듣기')[0];
  assert.equal(audio.props.src, sourceUrl); assert.ok(label(ui.tree).includes('보컬 없음'));
  await ui.runTimers(); assert.equal(posts(ui).length, 0); assert.equal(ui.uuidCount, 0);
});

test('idea cards render exact stored anchor IDs as readable cast labels without changing the selected idea or saved identity', async () => {
  const preferences = { performer: 'duo', ensemble: 'duo', species: 'auto', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' };
  const seed = creativeDirection.resolveDanceProductionSeedV3(preferences, 'display-label-seed');
  const idea = { version: 3, id: 'stored-idea', conceptFamily: 'interaction', title: 'performer_1의 첫 인사',
    visibleHook: 'performer_1이 performer_2를 바라보고 손을 든다.', characterGoal: 'performer_2가 먼저 웃도록 기다린다.',
    emotionalReaction: 'performer_1은 어깨를 들고 performer_2는 고개를 끄덕인다.', turn: 'performer_2가 먼저 한 걸음 내딛는다.',
    payoff: 'performer_1과 performer_2가 함께 웃는다.', participation: '둘의 인사를 따라 해 본다.',
    productionRisk: '두 사람의 간격을 유지한다. performer_10은 별도 문자열이다.', musicConnection: 'performer_1이 짧은 훅에 손을 펼친다.' };
  const job = { id: 'display-job', trackId: 'song', status: 'ideas', startSeconds: 0, durationSeconds: 30,
    visualBrief: '', productionSeed: seed, creativePreferences: preferences, ideas: [idea] };
  const original = JSON.stringify(job);
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => request.body
    ? { job: { ...job, status: 'ready', selectedIdea: idea } }
    : request.url.includes('dance-video') ? { job } : { tracks: [track('song')] } });
  await ui.settle();
  const card = walk(ui.tree, node => node.type === 'article')[0];
  assert.ok(label(card).includes('출연자 1이 출연자 2를 바라보고 손을 든다.'));
  assert.ok(label(card).includes('출연자 2가 먼저 웃도록 기다린다.')); assert.ok(label(card).includes('performer_10은 별도 문자열이다.'));
  assert.doesNotMatch(label(card), /performer_[12](?![0-9_])/); assert.equal(card.props['aria-label'], '아이디어 1 · 출연자 1의 첫 인사');
  const choose = walk(card, node => node.type === 'button')[0]; assert.equal(choose.props['aria-label'], '출연자 1의 첫 인사 선택하고 장면 설계');
  choose.props.onClick(); await ui.settle();
  assert.deepEqual(posts(ui)[0].body, { action: 'select-idea', trackId: 'song', jobId: job.id, ideaId: idea.id });
  assert.ok(label(ui.tree).includes('선택한 아이디어 · 출연자 1의 첫 인사')); assert.equal(JSON.stringify(job), original);
  assert.equal(seed.anchors[0].id, 'performer_1'); assert.equal(idea.visibleHook, 'performer_1이 performer_2를 바라보고 손을 든다.');
});

test('saved V3 scene place overrides a conflicting direction label and all rendered plan actions use aliases without changing source data', async () => {
  const preferences = { performer: 'duo', ensemble: 'duo', species: 'auto', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' };
  const idea = { version: 3, id: 'saved-scene', conceptFamily: 'interaction', title: '두 사람의 기다림',
    visibleHook: 'performer_1이 performer_2를 바라본다.', characterGoal: 'performer_2가 손을 들기를 기다린다.', emotionalReaction: 'performer_1이 고개를 기울인다.',
    turn: 'performer_2가 먼저 발을 옮긴다.', payoff: 'performer_1과 performer_2가 함께 웃는다.', participation: '둘의 반응을 따라 한다.',
    productionRisk: '두 출연자 사이의 간격을 유지한다.', musicConnection: 'performer_1이 짧은 박자에 반응한다.',
    sceneContext: { place: '심야 빨래방', ongoingActivity: '두 사람이 세탁이 끝나기를 기다린다.', immediateTrigger: '세탁 완료 신호등이 켜진다.' } };
  const job = { id: 'saved-scene-job', trackId: 'song', status: 'ready', startSeconds: 0, durationSeconds: 30, visualBrief: '', creativePreferences: preferences,
    productionSeed: creativeDirection.resolveDanceProductionSeedV3(preferences, 'saved-scene-seed'), selectedIdea: idea,
    direction: { castLabel: 'performer_1과 performer_2', locationLabel: '레트로 아케이드', danceStyleLabel: 'performer_2의 작은 스텝',
      cast: { count: 2, kind: 'human', members: [{ id: 'performer_1', position: '왼쪽', identity: 'performer_1의 고유 외형' }] } },
    plan: { title: 'performer_1의 기다림', summary: 'performer_1과 performer_2가 박자를 주고받는다.', identity: 'performer_1 raw identity',
      imagePrompt: 'performer_1 raw image prompt', clips: ['performer_1 raw clip', 'performer_2 raw clip'], choreography: {
        hookName: 'performer_1의 손 신호', steps: [{ count: 1, action: 'performer_1이 손을 들고 performer_2가 발을 옮긴다.', focus: 'combined' }],
        segments: [{ startSeconds: 0, endSeconds: 30, action: 'performer_2가 performer_1에게 손을 내민다.', repeatHook: true }],
        firstPose: 'performer_1이 손을 모은다.', endPose: 'performer_2가 고개를 끄덕인다.' } } };
  const original = JSON.stringify(job);
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => request.url.includes('dance-video') ? { job } : { tracks: [track('song')] } });
  await ui.settle();
  const sceneRow = walk(ui.tree, node => node.type === 'div' && Array.isArray(node.props.children)
    && node.props.children.some(child => child?.type === 'dt' && label(child) === '장소'))[0];
  assert.equal(label(sceneRow), '장소심야 빨래방'); assert.doesNotMatch(label(ui.tree), /performer_[12]\b/);
  for (const text of ['출연자 1과 출연자 2가 박자를 주고받는다.', '출연자 1이 손을 들고 출연자 2가 발을 옮긴다.',
    '출연자 2가 출연자 1에게 손을 내민다.', '시작 포즈 · 출연자 1이 손을 모은다.', '마지막 포즈 · 출연자 2가 고개를 끄덕인다.']) assert.ok(label(ui.tree).includes(text));
  assert.equal(JSON.stringify(job), original); await ui.runTimers(); assert.equal(posts(ui).length, 0);
  const legacyIdea = { ...idea }; delete legacyIdea.sceneContext;
  const fallback = harness({ props: { initialTrackId: 'song' }, reply: request => request.url.includes('dance-video')
    ? { job: { ...job, selectedIdea: legacyIdea } } : { tracks: [track('song')] } });
  await fallback.settle(); assert.ok(label(fallback.tree).includes('장소레트로 아케이드')); assert.equal(JSON.stringify(job), original);
});
