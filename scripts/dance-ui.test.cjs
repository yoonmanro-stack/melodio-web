/** Real component handlers/effects with offline hooks, fetch and timers. No browser or provider access. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const componentPath = path.join(root, 'src/components/viral/DanceChallengeStudio.tsx');
const compile = (source, filename) => ts.transpileModule(source, { fileName: filename, compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
const componentCode = compile(fs.readFileSync(componentPath, 'utf8'), componentPath);
const presetModule = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/dance/preset.ts'), 'utf8'), 'preset.ts'), { module: presetModule, exports: presetModule.exports });
const tick = () => new Promise(resolve => setImmediate(resolve));
const sameDeps = (left, right) => left && right && left.length === right.length && right.every((value, i) => Object.is(value, left[i]));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function walk(node, predicate, found = []) {
  if (Array.isArray(node)) { node.forEach(item => walk(item, predicate, found)); return found; }
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  walk(node.props?.children, predicate, found); return found;
}
function label(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(label).join('');
  return typeof node === 'object' ? label(node.props?.children) : String(node);
}
const element = (tree, type) => walk(tree, node => node.type === type)[0];
const button = (tree, text) => walk(tree, node => node.type === 'button' && label(node).includes(text))[0];
function track(id, overrides = {}) {
  return { id, title: `음원 ${id}`, status: 'completed', audioUrl: `https://storage.test/${id}.mp3`,
    durationSeconds: 195, createdAt: '2026-09-18T00:00:00.000Z', isPublic: false, ...overrides };
}
function harness({ props: initialProps = {}, reply = () => ({ tracks: [] }) } = {}) {
  const states = [], refs = [], effectDeps = [], cleanups = [], callbacks = [], effects = [], requests = [];
  const timers = new Map(); let timerId = 0, uuidCount = 0, dirty = true, tree;
  let stateCursor = 0, refCursor = 0, effectCursor = 0, callbackCursor = 0;
  const props = { userId: 'owner-A', initialTrackId: '', onBusyChange() {}, onCompleted() {}, ...initialProps };
  const hooks = { ...React,
    useState(initial) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], next => {
        const value = typeof next === 'function' ? next(states[index]) : next;
        if (!Object.is(states[index], value)) { states[index] = value; dirty = true; }
      }];
    },
    useRef(initial) { const index = refCursor++; return refs[index] || (refs[index] = { current: initial }); },
    useCallback(callback, deps) {
      const index = callbackCursor++;
      if (!callbacks[index] || !sameDeps(callbacks[index].deps, deps)) callbacks[index] = { callback, deps };
      return callbacks[index].callback;
    },
    useEffect(callback, deps) {
      const index = effectCursor++;
      if (!sameDeps(effectDeps[index], deps)) {
        effectDeps[index] = deps;
        effects.push(() => { cleanups[index]?.(); cleanups[index] = callback(); });
      }
    },
  };
  const audioModule = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/globalAudio.ts'), 'utf8'), 'globalAudio.ts'), {
    module: audioModule, exports: audioModule.exports, window: { dispatchEvent() {} }, CustomEvent: class {},
  });
  const mod = { exports: {} };
  vm.runInNewContext(componentCode, {
    module: mod, exports: mod.exports, console, AbortController, Error,
    crypto: { randomUUID() { uuidCount++; return `d0000000-0000-4000-8000-${String(uuidCount).padStart(12, '0')}`; } },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, options = {}) {
      const request = { url, body: options.body ? JSON.parse(options.body) : null, signal: options.signal, owner: props.userId };
      requests.push(request);
      const result = await reply(request, requests);
      return { ok: true, json: async () => ({ success: true, ...result }) };
    },
    require(name) {
      if (name === 'react') return hooks;
      if (name === '@/lib/dance/preset') return presetModule.exports;
      if (name === '@/lib/globalAudio') return audioModule.exports;
      return require(name);
    },
  }, { filename: componentPath });
  const component = mod.exports.default;
  function render() {
    dirty = false; stateCursor = refCursor = effectCursor = callbackCursor = 0;
    tree = component(props); effects.splice(0).forEach(run => run());
  }
  async function settle(nextProps) {
    if (nextProps) { Object.assign(props, nextProps); dirty = true; }
    let idle = 0;
    for (let rounds = 0; rounds < 40; rounds++) {
      if (dirty) { render(); idle = 0; }
      await tick();
      if (!dirty && ++idle >= 2) return tree;
    }
    assert.fail('Component did not settle; possible effect loop');
  }
  async function runTimers() {
    const batch = [...timers.values()]; timers.clear();
    for (const timer of batch) await timer.callback();
    return settle();
  }
  return { settle, runTimers, requests, timers, get tree() { return tree; }, get uuidCount() { return uuidCount; } };
}

test('guest fresh entry disables creation and performs no requests', async () => {
  const ui = harness({ props: { userId: null } });
  const tree = await ui.settle();
  assert.equal(button(tree, '새 댄스 음원 만들기').props.disabled, true);
  assert.equal(ui.requests.length, 0); assert.equal(ui.uuidCount, 0);
});

test('manual account-A response cannot restore private tracks after switching to account B', async () => {
  const lateA = deferred(); let aLists = 0;
  const ui = harness({ props: { initialTrackId: 'A' }, reply: request => {
    if (request.url.startsWith('/api/viral-cf/dance-video')) return { job: null };
    if (request.owner === 'owner-A') {
      aLists++;
      return aLists === 1 ? { tracks: [track('A', { status: 'generating', audioUrl: null })] } : lateA.promise;
    }
    return { tracks: [track('B')] };
  } });
  await ui.settle();
  button(ui.tree, '음원 상태 확인').props.onClick();
  await ui.settle({ userId: 'owner-B' });
  assert.match(label(ui.tree), /음원 B/);
  lateA.resolve({ tracks: [track('A-secret')] });
  await ui.settle();
  assert.doesNotMatch(label(ui.tree), /A-secret|음원 A/);
  assert.match(label(ui.tree), /음원 B/);
  assert.equal(element(ui.tree, 'select').props.value, '');
});

test('network failure reuses the same music request ID and chosen privacy on retry', async () => {
  let submits = 0;
  const ui = harness({ reply: request => {
    if (!request.body) return request.url.includes('dance-video') ? { job: null } : { tracks: [] };
    submits++;
    if (submits === 1) throw new Error('테스트 연결 끊김');
    return { track: track(request.body.requestId, { status: 'generating', audioUrl: null, isPublic: request.body.isPublic }) };
  } });
  await ui.settle();
  walk(ui.tree, node => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange({ target: { checked: false } });
  await ui.settle();
  button(ui.tree, '새 댄스 음원 만들기').props.onClick(); await ui.settle();
  assert.match(label(ui.tree), /테스트 연결 끊김/);
  button(ui.tree, '새 댄스 음원 만들기').props.onClick(); await ui.settle();
  const posts = ui.requests.filter(request => request.body);
  assert.equal(posts.length, 2); assert.equal(posts[0].body.requestId, posts[1].body.requestId);
  assert.equal(posts[0].body.isPublic, false); assert.equal(posts[1].body.isPublic, false); assert.equal(ui.uuidCount, 1);
});

test('old selected deep-link track is merged into the newest 30 and retained during music polling', async () => {
  const newest = Array.from({ length: 30 }, (_, i) => track(`recent-${i}`));
  const ui = harness({ props: { initialTrackId: 'old-track' }, reply: request => {
    if (request.url.includes('dance-video')) return { job: null };
    if (request.url.includes('?trackId=old-track')) return { tracks: [track('old-track', { status: 'generating', audioUrl: null })] };
    return { tracks: newest };
  } });
  await ui.settle();
  assert.equal(element(ui.tree, 'select').props.value, 'old-track');
  assert.equal(walk(ui.tree, node => node.type === 'option' && node.props.value).length, 31);
  await ui.runTimers();
  assert.equal(element(ui.tree, 'select').props.value, 'old-track');
  assert.match(label(ui.tree), /음원 old-track/);
  assert.equal(ui.requests.filter(request => request.url.includes('dance-music?trackId=old-track')).length, 2);
  assert.equal(ui.requests.filter(request => request.body).length, 0);
});

test('ready plan stays idle until explicit start and unchanged preparation is disabled', async () => {
  const ready = { id: 'job-1', trackId: 'song', status: 'ready', startSeconds: 12, durationSeconds: 30,
    visualBrief: '밝은 광장에서 춤추는 성인', createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z' };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) return { job: { ...ready, status: 'image' } };
    return request.url.includes('dance-video') ? { job: ready } : { tracks: [track('song')] };
  } });
  await ui.settle();
  element(ui.tree, 'audio').props.onLoadedMetadata({ currentTarget: { duration: 195 } });
  await ui.settle(); await ui.runTimers();
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  assert.equal(button(ui.tree, 'AI 기획 완료').props.disabled, true);
  const start = button(ui.tree, '30초 영상 생성하기'); assert.equal(start.props.disabled, false);
  start.props.onClick(); start.props.onClick(); await ui.settle();
  const posts = ui.requests.filter(request => request.body);
  assert.equal(posts.length, 1); assert.equal(posts[0].body.action, 'start'); assert.equal(posts[0].body.jobId, ready.id);
});

function mediaNode(ui, name) { return walk(ui.tree, node => node.type === 'audio' && node.props['aria-label'] === name)[0]; }
function mountMedia(ui, name) {
  const node = mediaNode(ui, name);
  const media = { paused: true, currentTime: 0, duration: 195, pauses: 0,
    pause() { this.paused = true; this.pauses++; node.props.onPause?.({ currentTarget: this }); },
    async play() { this.paused = false; node.props.onPlay?.({ currentTarget: this }); },
  };
  node.props.ref.current = media; return media;
}
function completedMusicUi(reply) {
  return harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) return reply?.(request) || { job: null };
    return request.url.includes('dance-video') ? { job: null } : { tracks: [track('song')] };
  } });
}

test('full song plays beyond30seconds; range preview alone stops, and actual global manager prevents overlapping audio', async () => {
  const ui = completedMusicUi(); await ui.settle();
  const full = mountMedia(ui, '곡 전체 듣기'); const preview = mountMedia(ui, '선택 구간 미리듣기');
  const fullNode = mediaNode(ui, '곡 전체 듣기');
  assert.equal(fullNode.props.controls, true); assert.notEqual(fullNode.props.loop, true); assert.notEqual(fullNode.props.autoPlay, true);
  fullNode.props.onLoadedMetadata({ currentTarget: full }); await ui.settle();
  await full.play(); full.currentTime = 82.4;
  mediaNode(ui, '곡 전체 듣기').props.onTimeUpdate({ currentTarget: full }); await ui.settle();
  assert.equal(full.paused, false); assert.equal(full.pauses, 0);
  button(ui.tree, '현재 위치부터 30초 선택').props.onClick(); await ui.settle();
  assert.equal(walk(ui.tree, n => n.props?.['aria-label'] === '시작 시간(초)')[0].props.value, 82.4);
  assert.equal(full.paused, false, 'marking a start does not interrupt full listening');
  button(ui.tree, '선택 구간 듣기').props.onClick(); await ui.settle();
  assert.equal(preview.currentTime, 82.4); assert.equal(preview.paused, false); assert.equal(full.paused, true);
  preview.currentTime = 112.4; mediaNode(ui, '선택 구간 미리듣기').props.onTimeUpdate({ currentTarget: preview }); await ui.settle();
  assert.equal(preview.paused, true);
  await preview.play(); await full.play(); assert.equal(preview.paused, true); assert.equal(full.paused, false);
  full.currentTime = 170; mediaNode(ui, '곡 전체 듣기').props.onTimeUpdate({ currentTarget: full }); await ui.settle();
  assert.equal(full.paused, false);
});

test('mark current full-song position clamps to last complete30seconds and blank brief can request AI planning', async () => {
  const ui = completedMusicUi(request => ({ job: { id: 'job', trackId: 'song', status: 'ready',
    startSeconds: request.body.startSeconds, visualBrief: request.body.visualBrief, durationSeconds: 30 } }));
  await ui.settle(); const full = mountMedia(ui, '곡 전체 듣기');
  full.duration = 195.04; full.currentTime = 194.98;
  mediaNode(ui, '곡 전체 듣기').props.onLoadedMetadata({ currentTarget: full }); await ui.settle();
  button(ui.tree, '현재 위치부터 30초 선택').props.onClick(); await ui.settle();
  const start = walk(ui.tree, n => n.props?.['aria-label'] === '시작 시간(초)')[0];
  assert.equal(start.props.value, 165.04); assert.ok(start.props.value + 30 <= full.duration);
  start.props.onChange({ target: { value: '37.5' } }); await ui.settle();
  assert.equal(element(ui.tree, 'textarea').props.value, '');
  assert.equal(button(ui.tree, 'AI 기획하기').props.disabled, false);
  button(ui.tree, 'AI 기획하기').props.onClick(); await ui.settle();
  const posts = ui.requests.filter(r => r.body); assert.equal(posts.length, 1);
  assert.equal(posts[0].body.action, 'prepare'); assert.equal(posts[0].body.startSeconds, 37.5); assert.equal(posts[0].body.visualBrief, '');
  assert.equal(button(ui.tree, 'AI 기획 완료').props.disabled, true);
  assert.equal(ui.requests.filter(r => r.body?.action === 'start').length, 0);
});

test('custom situation is forwarded as written and changing it invalidates video approval', async () => {
  const ui = completedMusicUi(request => ({ job: { id: 'job', trackId: 'song', status: 'ready',
    startSeconds: request.body.startSeconds, visualBrief: request.body.visualBrief, durationSeconds: 30 } }));
  await ui.settle(); const full = mountMedia(ui, '곡 전체 듣기');
  mediaNode(ui, '곡 전체 듣기').props.onLoadedMetadata({ currentTarget: full }); await ui.settle();
  element(ui.tree, 'textarea').props.onChange({ target: { value: '  작은 로봇이 현대적인 주방에서 빗자루를 들고 춤춘다.  ' } }); await ui.settle();
  button(ui.tree, 'AI 기획하기').props.onClick(); await ui.settle();
  assert.equal(ui.requests.find(r => r.body)?.body.visualBrief, '작은 로봇이 현대적인 주방에서 빗자루를 들고 춤춘다.');
  assert.equal(button(ui.tree, '30초 영상 생성하기').props.disabled, false);
  element(ui.tree, 'textarea').props.onChange({ target: { value: '고양이가 춤춘다.' } }); await ui.settle();
  assert.equal(button(ui.tree, '30초 영상 생성하기').props.disabled, true);
});

test('completed work retains full and30second downloads; reuse forks once without music or video generation', async () => {
  const saved = { id: 'job-original', trackId: 'song', status: 'completed', startSeconds: 45, durationSeconds: 30,
    audioUrl: 'https://storage.test/exact30.wav', audioHash: 'a'.repeat(64), visualBrief: '기존 상황', videoUrl: 'https://storage.test/old.mp4' };
  const duplicate = track('variant', { savedClip: { audioUrl: saved.audioUrl, audioHash: saved.audioHash, startSeconds: 45, durationSeconds: 30 }, reused: true });
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) { assert.equal(request.body.action, 'reuse'); return { trackId: 'variant' }; }
    if (request.url.includes('dance-music?trackId=variant')) return { tracks: [duplicate] };
    if (request.url.includes('dance-video')) return { job: request.url.includes('trackId=song') ? saved : null };
    return { tracks: [track('song')] };
  } });
  await ui.settle();
  const links = walk(ui.tree, n => n.type === 'a');
  assert.ok(links.some(n => label(n).includes('전체 음원 MP3 다운로드') && decodeURIComponent(n.props.href).includes('song.mp3')));
  assert.ok(links.some(n => label(n).includes('30초 음원 WAV 다운로드') && decodeURIComponent(n.props.href).includes('exact30.wav')));
  assert.ok(links.some(n => label(n).includes('MP4 다운로드') && decodeURIComponent(n.props.href).includes('old.mp4')));
  const reuse = button(ui.tree, '같은 음원으로 새 챌린지 만들기');
  reuse.props.onClick(); reuse.props.onClick(); await ui.settle();
  assert.equal(element(ui.tree, 'select').props.value, 'variant');
  assert.equal(ui.requests.filter(r => r.body).length, 1);
  assert.equal(element(ui.tree, 'textarea').props.value, '');
  assert.equal(element(ui.tree, 'textarea').props.disabled, false);
  assert.equal(walk(ui.tree, n => n.props?.['aria-label'] === '시작 시간(초)')[0].props.value, 45);
  assert.equal(walk(ui.tree, n => n.props?.['aria-label'] === '시작 시간(초)')[0].props.disabled, true);
  assert.equal(mediaNode(ui, '저장된 30초 음원').props.src, saved.audioUrl);
  assert.equal(mediaNode(ui, '선택 구간 미리듣기').props.src, saved.audioUrl);
  const preview = mountMedia(ui, '선택 구간 미리듣기');
  mediaNode(ui, '곡 전체 듣기').props.onLoadedMetadata({ currentTarget: { duration: 195 } }); await ui.settle();
  button(ui.tree, '선택 구간 듣기').props.onClick(); await ui.settle();
  assert.equal(preview.currentTime, 0, 'saved file starts at0, never at45');
  preview.currentTime = 30; mediaNode(ui, '선택 구간 미리듣기').props.onTimeUpdate({ currentTarget: preview });
  assert.equal(preview.paused, true);
  assert.equal(button(ui.tree, 'AI 기획하기').props.disabled, false);
  assert.equal(ui.requests.filter(r => r.body).length, 1, 'noautomaticpaidplanning or newmusic');
});

test('reuse transport uncertainty retries same requestID and never replaces source work', async () => {
  const saved = { id: 'job-source', trackId: 'song', status: 'ready', startSeconds: 10, durationSeconds: 30,
    audioUrl: 'https://storage.test/saved.wav', visualBrief: '', audioHash: 'b'.repeat(64) };
  let attempts = 0;
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) { attempts++; if (attempts === 1) throw new Error('응답 확인 필요'); return { trackId: 'fork' }; }
    if (request.url.includes('dance-music?trackId=fork')) return { tracks: [track('fork', { savedClip: {audioUrl:saved.audioUrl, audioHash:saved.audioHash,startSeconds:10,durationSeconds:30} })] };
    if (request.url.includes('dance-video')) return { job: request.url.includes('trackId=song') ? saved : null };
    return { tracks: [track('song')] };
  } });
  await ui.settle(); button(ui.tree, '같은 음원으로 새 챌린지 만들기').props.onClick(); await ui.settle();
  assert.equal(element(ui.tree, 'select').props.value, 'song');
  button(ui.tree, '같은 음원으로 새 챌린지 만들기').props.onClick(); await ui.settle();
  const posts = ui.requests.filter(r => r.body);
  assert.equal(posts[0].body.requestId, posts[1].body.requestId); assert.equal(ui.uuidCount, 1);
  assert.ok(posts.every(r => r.body.trackId === 'song' && r.body.jobId === saved.id && r.body.action === 'reuse'));
});

for (const brief of ['', '로봇이 박자에 맞춰 춤추고 마지막에 윙크한다.']) {
  test(`explicit failed-plan retry preserves saved audio and ${brief ? 'custom' : 'blank'} brief, never auto-starts video`, async () => {
    const failed = { id: 'failed-job', trackId: 'song', status: 'attention', startSeconds: 22, durationSeconds: 30,
      audioUrl: 'https://storage.test/exact30.wav', audioHash: 'b'.repeat(64), visualBrief: brief, planningSubmitted: true };
    const variant = track('retry-track', { savedClip: { audioUrl: failed.audioUrl, audioHash: failed.audioHash, startSeconds: 22, durationSeconds: 30 } });
    let prepared = false;
    const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
      if (request.body?.action === 'reuse') return { trackId: 'retry-track' };
      if (request.body?.action === 'prepare') { prepared = true; return { job: { ...failed, id: 'retry-job', status: 'ready', trackId: 'retry-track' } }; }
      if (request.body) assert.fail('Unexpected paid operation');
      if (request.url.includes('dance-music?trackId=retry-track')) return { tracks: [variant] };
      if (request.url.includes('dance-video')) return { job: request.url.includes('trackId=song') ? failed : prepared ? { ...failed, id: 'retry-job', trackId: 'retry-track', status: 'ready' } : null };
      return { tracks: [track('song')] };
    } });
    await ui.settle(); await ui.runTimers();
    assert.equal(ui.requests.filter(r => r.body).length, 0);
    const retry = button(ui.tree, 'AI 기획 다시 시도');
    retry.props.onClick(); retry.props.onClick(); await ui.settle(); await ui.runTimers();
    const posts = ui.requests.filter(r => r.body);
    assert.deepEqual(posts.map(r => r.body.action), ['reuse', 'prepare']);
    assert.equal(posts[0].body.trackId, 'song'); assert.equal(posts[0].body.jobId, 'failed-job');
    assert.equal(posts[1].body.trackId, 'retry-track'); assert.equal(posts[1].body.startSeconds, 22);
    assert.equal(posts[1].body.visualBrief, brief);
    assert.equal(element(ui.tree, 'select').props.value, 'retry-track');
    assert.equal(element(ui.tree, 'textarea').props.value, brief);
    assert.equal(mediaNode(ui, '저장된 30초 음원').props.src, failed.audioUrl);
    assert.equal(button(ui.tree, '30초 영상 생성하기').props.disabled, false);
    assert.equal(failed.status, 'attention');
  });
}

test('lost retry-plan response opens its saved attempt and checks state without resubmitting', async () => {
  const failed = { id: 'failed-job', trackId: 'song', status: 'attention', startSeconds: 22, durationSeconds: 30,
    audioUrl: 'https://storage.test/exact30.wav', audioHash: 'b'.repeat(64), visualBrief: '', planningSubmitted: true };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body?.action === 'reuse') return { trackId: 'retry-track' };
    if (request.body?.action === 'prepare') throw new Error('응답 연결 끊김');
    if (request.body) assert.fail('Must not advance or start video');
    if (request.url.includes('dance-music?trackId=retry-track')) return { tracks: [track('retry-track', { savedClip: { audioUrl: failed.audioUrl, startSeconds: 22, durationSeconds: 30 } })] };
    if (request.url.includes('dance-video')) return { job: request.url.includes('trackId=song') ? failed : { ...failed, id: 'retry-job', trackId: 'retry-track', status: 'attention' } };
    return { tracks: [track('song')] };
  } });
  await ui.settle(); button(ui.tree, 'AI 기획 다시 시도').props.onClick(); await ui.settle(); await ui.runTimers();
  assert.equal(element(ui.tree, 'select').props.value, 'retry-track');
  assert.deepEqual(ui.requests.filter(r => r.body).map(r => r.body.action), ['reuse', 'prepare']);
  button(ui.tree, '저장된 작업 상태 확인').props.onClick(); await ui.settle();
  assert.equal(ui.requests.filter(r => r.body).length, 2);
});

test('planning retry is unavailable once image or video generation has begun', async () => {
  for (const extra of [{ imageUrl: 'https://storage.test/image.jpg' }, { clip1RequestId: 'paid-video' }, { plan: { title: '기획 완료' } }, { inFlight: { at: '2026-09-18T00:00:00Z' } }]) {
    const ui = harness({ props: { initialTrackId: 'song' }, reply: request => request.url.includes('dance-video') ? { job: {
      id: 'job', trackId: 'song', status: 'attention', audioUrl: 'https://storage.test/exact.wav', startSeconds: 22,
      durationSeconds: 30, visualBrief: '', ...extra,
    } } : { tracks: [track('song')] } });
    await ui.settle();
    assert.equal(button(ui.tree, 'AI 기획 다시 시도'), undefined);
    assert.equal(ui.requests.filter(r => r.body).length, 0);
  }
});

test('ordinary reuse of the same MP3 enables planning without another metadata event or a job', async () => {
  const original = track('song');
  const saved = { id: 'source-job', trackId: 'song', status: 'attention', startSeconds: 22, durationSeconds: 30,
    audioUrl: 'https://storage.test/exact30.wav', visualBrief: '', planningSubmitted: true };
  const variant = track('fork', { audioUrl: original.audioUrl, savedClip: { audioUrl: saved.audioUrl, startSeconds: 22, durationSeconds: 30 } });
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body?.action === 'reuse') return { trackId: 'fork' };
    if (request.body) assert.fail('No automatic planning or video');
    if (request.url.includes('dance-music?trackId=fork')) return { tracks: [variant] };
    if (request.url.includes('dance-video')) return { job: request.url.includes('trackId=song') ? saved : null };
    return { tracks: [original] };
  } });
  await ui.settle();
  const originalAudio = mediaNode(ui, '곡 전체 듣기');
  originalAudio.props.onLoadedMetadata({ currentTarget: { duration: 195 } }); await ui.settle();
  button(ui.tree, '같은 음원으로 새 챌린지 만들기').props.onClick(); await ui.settle(); await ui.runTimers();
  assert.equal(mediaNode(ui, '곡 전체 듣기').key, originalAudio.key);
  assert.equal(mediaNode(ui, '곡 전체 듣기').props.src, originalAudio.props.src);
  assert.equal(button(ui.tree, 'AI 기획하기').props.disabled, false);
  assert.equal(button(ui.tree, '선택 구간 듣기').props.disabled, false);
  assert.ok(button(ui.tree, '저장된 작업 상태 확인'));
  assert.match(label(ui.tree), /전체 3:15/);
  assert.deepEqual(ui.requests.filter(r => r.body).map(r => r.body.action), ['reuse']);
});

test('existing saved-clip fork opens with planning enabled even without full-song duration metadata', async () => {
  const variant = track('fork', { durationSeconds: null, savedClip: { audioUrl: 'https://storage.test/exact30.wav', startSeconds: 22, durationSeconds: 30 } });
  const ui = harness({ props: { initialTrackId: 'fork' }, reply: request => request.url.includes('dance-video') ? { job: null } : { tracks: [variant] } });
  await ui.settle();
  assert.equal(button(ui.tree, 'AI 기획하기').props.disabled, false);
  assert.equal(button(ui.tree, '선택 구간 듣기').props.disabled, false);
  assert.equal(walk(ui.tree, node => node.props?.['aria-label'] === '시작 시간(초)')[0].props.value, 22);
  assert.equal(ui.requests.filter(r => r.body).length, 0);
});

for (const response of ['null', 'rejected']) {
  test(`${response} retry preparation and null saved job keep the brief and require an explicit read before another plan`, async () => {
    const original = track('song');
    const failed = { id: 'failed-job', trackId: 'song', status: 'attention', startSeconds: 22, durationSeconds: 30,
      audioUrl: 'https://storage.test/exact30.wav', visualBrief: '보존할 로봇 댄스 요청', planningSubmitted: true };
    const variant = track('fork', { audioUrl: original.audioUrl, durationSeconds: null, savedClip: { audioUrl: failed.audioUrl, startSeconds: 22, durationSeconds: 30 } });
    const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
      if (request.body?.action === 'reuse') return { trackId: 'fork' };
      if (request.body?.action === 'prepare') {
        if (response === 'rejected') throw new Error('기획 응답 연결 끊김');
        return { job: null };
      }
      if (request.body) assert.fail('No automatic video or advance');
      if (request.url.includes('dance-music?trackId=fork')) return { tracks: [variant] };
      if (request.url.includes('dance-video')) return { job: request.url.includes('trackId=song') ? failed : null };
      return { tracks: [original] };
    } });
    await ui.settle();
    button(ui.tree, 'AI 기획 다시 시도').props.onClick(); await ui.settle(); await ui.runTimers();
    assert.equal(element(ui.tree, 'select').props.value, 'fork');
    assert.equal(element(ui.tree, 'textarea').props.value, failed.visualBrief);
    assert.equal(mediaNode(ui, '저장된 30초 음원').props.src, failed.audioUrl);
    assert.equal(button(ui.tree, 'AI 기획하기').props.disabled, true);
    assert.ok(walk(ui.tree, node => node.props?.role === 'alert').length);
    button(ui.tree, 'AI 기획하기').props.onClick(); await ui.settle();
    assert.deepEqual(ui.requests.filter(r => r.body).map(r => r.body.action), ['reuse', 'prepare']);
    button(ui.tree, '저장된 작업 상태 확인').props.onClick(); await ui.settle();
    assert.equal(button(ui.tree, 'AI 기획하기').props.disabled, false);
    assert.equal(element(ui.tree, 'textarea').props.value, failed.visualBrief);
    assert.deepEqual(ui.requests.filter(r => r.body).map(r => r.body.action), ['reuse', 'prepare']);
    button(ui.tree, 'AI 기획하기').props.onClick(); await ui.settle();
    const requests = ui.requests.filter(r => r.body);
    assert.equal(requests.length, 3);
    assert.equal(requests[2].body.trackId, 'fork');
    assert.equal(requests[2].body.startSeconds, 22);
    assert.equal(requests[2].body.visualBrief, failed.visualBrief);
    assert.equal(button(ui.tree, 'AI 기획하기').props.disabled, true, 'null or rejected direct preparation is not success');
  });
}

test('late retry preparation cannot restore the private fork after an account switch', async () => {
  const late = deferred();
  const failed = { id: 'failed-job', trackId: 'song', status: 'attention', startSeconds: 22, durationSeconds: 30,
    audioUrl: 'https://storage.test/private.wav', visualBrief: 'A-private-brief', planningSubmitted: true };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body?.action === 'reuse') return { trackId: 'A-private-fork' };
    if (request.body?.action === 'prepare') return late.promise;
    if (request.body) assert.fail('No additional paid request');
    if (request.url.includes('dance-music?trackId=A-private-fork')) return { tracks: [track('A-private-fork', { savedClip: { audioUrl: failed.audioUrl, startSeconds: 22, durationSeconds: 30 } })] };
    if (request.url.includes('dance-video')) return { job: request.owner === 'owner-A' ? failed : null };
    return { tracks: [track(request.owner === 'owner-A' ? 'song' : 'B')] };
  } });
  await ui.settle(); button(ui.tree, 'AI 기획 다시 시도').props.onClick(); await ui.settle();
  await ui.settle({ userId: 'owner-B' });
  late.resolve({ job: { ...failed, id: 'retry-job', trackId: 'A-private-fork', status: 'ready' } });
  await ui.settle(); await ui.runTimers();
  assert.equal(element(ui.tree, 'select').props.value, '');
  assert.doesNotMatch(label(ui.tree), /A-private/);
  assert.deepEqual(ui.requests.filter(r => r.body).map(r => r.body.action), ['reuse', 'prepare']);
});
