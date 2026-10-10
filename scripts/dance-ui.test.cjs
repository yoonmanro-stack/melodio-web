/** Real component handlers/effects with offline hooks, fetch and timers. No browser or provider access. */
/* eslint-disable @typescript-eslint/no-require-imports */
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
const danceModule = filename => {
  const mod = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/lib/dance', filename), 'utf8'), filename), {
    module: mod, exports: mod.exports, require(name) { if (name === './preset') return presetModule.exports; if (name.startsWith('./')) return danceModule(`${name.slice(2)}.ts`); return require(name); },
  });
  return mod.exports;
};
const musicProfiles = danceModule('musicProfiles.ts');
const creativeDirection = danceModule('creativeDirection.ts');
const performancePremises = danceModule('premises.ts');
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
const select = (tree, name) => walk(tree, node => node.type === 'select' && node.props['aria-label'] === name)[0];
const selectedTrack = tree => select(tree, '내 댄스 음원');
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
      if (name === 'next/image') return 'img';
      if (name === '@/lib/dance/preset') return presetModule.exports;
      if (name === '@/lib/dance/musicProfiles') return musicProfiles;
      if (name === '@/lib/dance/creativeDirection') return creativeDirection;
      if (name === '@/lib/dance/premises') return performancePremises;
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
  assert.equal(selectedTrack(ui.tree).props.value, '');
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
  assert.equal(selectedTrack(ui.tree).props.value, 'old-track');
  assert.equal(walk(selectedTrack(ui.tree), node => node.type === 'option' && node.props.value).length, 31);
  await ui.runTimers();
  assert.equal(selectedTrack(ui.tree).props.value, 'old-track');
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
  assert.equal(button(ui.tree, '장면 설계 완료').props.disabled, true);
  const start = button(ui.tree, '첫 장면 만들기'); assert.equal(start.props.disabled, false);
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
  assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, false);
  button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
  const posts = ui.requests.filter(r => r.body); assert.equal(posts.length, 1);
  assert.equal(posts[0].body.action, 'prepare'); assert.equal(posts[0].body.startSeconds, 37.5); assert.equal(posts[0].body.visualBrief, '');
  assert.equal(button(ui.tree, '장면 설계 완료').props.disabled, true);
  assert.equal(ui.requests.filter(r => r.body?.action === 'start').length, 0);
});

test('custom situation is forwarded as written and changing it invalidates video approval', async () => {
  const ui = completedMusicUi(request => ({ job: { id: 'job', trackId: 'song', status: 'ready',
    startSeconds: request.body.startSeconds, visualBrief: request.body.visualBrief, durationSeconds: 30 } }));
  await ui.settle(); const full = mountMedia(ui, '곡 전체 듣기');
  mediaNode(ui, '곡 전체 듣기').props.onLoadedMetadata({ currentTarget: full }); await ui.settle();
  element(ui.tree, 'textarea').props.onChange({ target: { value: '  작은 로봇이 현대적인 주방에서 빗자루를 들고 춤춘다.  ' } }); await ui.settle();
  button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
  assert.equal(ui.requests.find(r => r.body)?.body.visualBrief, '작은 로봇이 현대적인 주방에서 빗자루를 들고 춤춘다.');
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, false);
  element(ui.tree, 'textarea').props.onChange({ target: { value: '고양이가 춤춘다.' } }); await ui.settle();
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, true);
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
  assert.equal(selectedTrack(ui.tree).props.value, 'variant');
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
  assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, false);
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
  assert.equal(selectedTrack(ui.tree).props.value, 'song');
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
    const retry = button(ui.tree, '아이디어 다시 받기');
    retry.props.onClick(); retry.props.onClick(); await ui.settle(); await ui.runTimers();
    const posts = ui.requests.filter(r => r.body);
    assert.deepEqual(posts.map(r => r.body.action), ['reuse', 'prepare']);
    assert.equal(posts[0].body.trackId, 'song'); assert.equal(posts[0].body.jobId, 'failed-job');
    assert.equal(posts[1].body.trackId, 'retry-track'); assert.equal(posts[1].body.startSeconds, 22);
    assert.equal(posts[1].body.planningVersion, 3);
    assert.equal(posts[1].body.visualBrief, brief);
    assert.equal(selectedTrack(ui.tree).props.value, 'retry-track');
    assert.equal(element(ui.tree, 'textarea').props.value, brief);
    assert.equal(mediaNode(ui, '저장된 30초 음원').props.src, failed.audioUrl);
    assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, false);
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
  await ui.settle(); button(ui.tree, '아이디어 다시 받기').props.onClick(); await ui.settle(); await ui.runTimers();
  assert.equal(selectedTrack(ui.tree).props.value, 'retry-track');
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
    assert.equal(button(ui.tree, '아이디어 다시 받기'), undefined);
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
  assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, false);
  assert.equal(button(ui.tree, '선택 구간 듣기').props.disabled, false);
  assert.ok(button(ui.tree, '저장된 작업 상태 확인'));
  assert.match(label(ui.tree), /전체 3:15/);
  assert.deepEqual(ui.requests.filter(r => r.body).map(r => r.body.action), ['reuse']);
});

test('existing saved-clip fork opens with planning enabled even without full-song duration metadata', async () => {
  const variant = track('fork', { durationSeconds: null, savedClip: { audioUrl: 'https://storage.test/exact30.wav', startSeconds: 22, durationSeconds: 30 } });
  const ui = harness({ props: { initialTrackId: 'fork' }, reply: request => request.url.includes('dance-video') ? { job: null } : { tracks: [variant] } });
  await ui.settle();
  assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, false);
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
    button(ui.tree, '아이디어 다시 받기').props.onClick(); await ui.settle(); await ui.runTimers();
    assert.equal(selectedTrack(ui.tree).props.value, 'fork');
    assert.equal(element(ui.tree, 'textarea').props.value, failed.visualBrief);
    assert.equal(mediaNode(ui, '저장된 30초 음원').props.src, failed.audioUrl);
    assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, true);
    assert.ok(walk(ui.tree, node => node.props?.role === 'alert').length);
    button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
    assert.deepEqual(ui.requests.filter(r => r.body).map(r => r.body.action), ['reuse', 'prepare']);
    button(ui.tree, '저장된 작업 상태 확인').props.onClick(); await ui.settle();
    assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, false);
    assert.equal(element(ui.tree, 'textarea').props.value, failed.visualBrief);
    assert.deepEqual(ui.requests.filter(r => r.body).map(r => r.body.action), ['reuse', 'prepare']);
    button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
    const requests = ui.requests.filter(r => r.body);
    assert.equal(requests.length, 3);
    assert.equal(requests[2].body.trackId, 'fork');
    assert.equal(requests[2].body.startSeconds, 22);
    assert.equal(requests[2].body.visualBrief, failed.visualBrief);
    assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, true, 'null or rejected direct preparation is not success');
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
  await ui.settle(); button(ui.tree, '아이디어 다시 받기').props.onClick(); await ui.settle();
  await ui.settle({ userId: 'owner-B' });
  late.resolve({ job: { ...failed, id: 'retry-job', trackId: 'A-private-fork', status: 'ready' } });
  await ui.settle(); await ui.runTimers();
  assert.equal(selectedTrack(ui.tree).props.value, '');
  assert.doesNotMatch(label(ui.tree), /A-private/);
  assert.deepEqual(ui.requests.filter(r => r.body).map(r => r.body.action), ['reuse', 'prepare']);
});

test('music profile and optional vocal choice are submitted and frozen for an uncertain retry', async () => {
  let submits = 0;
  const ui = harness({ reply: request => {
    if (!request.body) return { tracks: [] };
    if (++submits === 1) throw new Error('음원 응답 확인 필요');
    return { track: track(request.body.requestId, { status: 'generating', audioUrl: null }) };
  } });
  await ui.settle();
  assert.equal(walk(select(ui.tree, '댄스 음악'), node => node.type === 'option').length, 6);
  select(ui.tree, '댄스 음악').props.onChange({ target: { value: 'house-footwork' } });
  select(ui.tree, '보컬').props.onChange({ target: { value: 'on' } });
  await ui.settle();
  button(ui.tree, '새 댄스 음원 만들기').props.onClick(); await ui.settle();
  assert.equal(select(ui.tree, '댄스 음악').props.disabled, true);
  assert.equal(select(ui.tree, '보컬').props.disabled, true);
  button(ui.tree, '새 댄스 음원 만들기').props.onClick(); await ui.settle();
  const posts = ui.requests.filter(request => request.body);
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0].body, posts[1].body);
  assert.equal(posts[0].body.musicProfileId, 'house-footwork');
  assert.equal(posts[0].body.vocalPreference, 'on');
});

test('saved creative choices restore, edits require a new plan, and prepare carries all choices', async () => {
  const preferences = { performer: 'man', location: 'rooftop', danceStyle: 'shuffle', visualStyle: 'stylized3d', difficulty: 'medium' };
  const ready = { id: 'job', trackId: 'song', status: 'ready', startSeconds: 0, durationSeconds: 30,
    visualBrief: '편안한 표정으로 춤춘다.', creativePreferences: preferences };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) return { job: { ...ready, creativePreferences: request.body.creativePreferences } };
    return request.url.includes('dance-video') ? { job: ready } : { tracks: [track('song')] };
  } });
  await ui.settle();
  assert.equal(select(ui.tree, '출연자').props.value, 'man');
  assert.equal(select(ui.tree, '장소').props.value, 'rooftop');
  assert.equal(select(ui.tree, '안무 스타일').props.value, 'shuffle');
  assert.equal(select(ui.tree, '영상 표현').props.value, 'stylized3d');
  assert.equal(select(ui.tree, '따라 추기 난이도').props.value, 'medium');
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, false);
  select(ui.tree, '장소').props.onChange({ target: { value: 'studio' } }); await ui.settle();
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, true);
  button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
  const post = ui.requests.find(request => request.body);
  assert.equal(post.body.action, 'prepare');
  assert.deepEqual(post.body.creativePreferences, { ...preferences, location: 'studio' });
  assert.equal(post.body.visualBrief, ready.visualBrief);
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, false);
});

test('first frame review stays idle until one explicit approval and shows the chosen scene', async () => {
  const review = { id: 'review-job', trackId: 'song', status: 'image-review', startSeconds: 0, durationSeconds: 30,
    visualBrief: '', imageUrl: 'https://storage.test/first-frame.jpg' };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) return { job: { ...review, status: 'clip1' } };
    return request.url.includes('dance-video') ? { job: review } : { tracks: [track('song')] };
  } });
  await ui.settle(); await ui.runTimers(); await ui.runTimers();
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  assert.equal(ui.timers.size, 0);
  assert.equal(element(ui.tree, 'img').props.src, review.imageUrl);
  assert.equal(select(ui.tree, '출연자').props.disabled, true);
  const approve = button(ui.tree, '이 장면으로 영상 만들기');
  assert.equal(approve.props.disabled, false);
  approve.props.onClick(); approve.props.onClick(); await ui.settle();
  const posts = ui.requests.filter(request => request.body);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { action: 'approve-frame', trackId: 'song', jobId: review.id });
});

test('automatic image completion stops at first frame review without submitting a video', async () => {
  const image = { id: 'image-job', trackId: 'song', status: 'image', startSeconds: 0, durationSeconds: 30,
    visualBrief: '', imageReviewRequired: true };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) {
      assert.equal(request.body.action, 'advance');
      return { job: { ...image, status: 'image-review', imageUrl: 'https://storage.test/frame.jpg' } };
    }
    return request.url.includes('dance-video') ? { job: image } : { tracks: [track('song')] };
  } });
  await ui.settle(); await ui.runTimers(); await ui.runTimers();
  assert.equal(ui.requests.filter(request => request.body).length, 1);
  assert.equal(ui.timers.size, 0);
  assert.ok(button(ui.tree, '이 장면으로 영상 만들기'));
});

test('v2 plan shows cast, place and count-based choreography without exposing generation prompts', async () => {
  const plan = { version: 2, title: '옥상 셔플', summary: '성인 남성이 넓은 옥상에서 셔플 훅을 춥니다.',
    identity: 'hidden-performer-prompt', imagePrompt: 'hidden-image-prompt', clips: ['hidden-clip-one', 'hidden-clip-two'],
    choreography: { hookName: '두 걸음 셔플', steps: [{ count: 1, action: '왼쪽으로 두 걸음', focus: 'feet' }],
      segments: [{ startSeconds: 0, endSeconds: 8, action: '발 스텝으로 훅 시작', repeatHook: true }], firstPose: '발을 어깨 너비로 벌린 자세', endPose: '시작 자세로 돌아오기' } };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => request.url.includes('dance-video') ? { job: {
    id: 'job', trackId: 'song', status: 'ready', startSeconds: 0, durationSeconds: 30, visualBrief: '', plan,
    direction: { castLabel: '성인 남성', locationLabel: '도시 루프톱', danceStyleLabel: '좌우 셔플' },
  } } : { tracks: [track('song')] } });
  await ui.settle();
  assert.match(label(ui.tree), /성인 남성/); assert.match(label(ui.tree), /도시 루프톱/); assert.match(label(ui.tree), /좌우 셔플/);
  assert.match(label(ui.tree), /두 걸음 셔플/); assert.match(label(ui.tree), /왼쪽으로 두 걸음/); assert.match(label(ui.tree), /0–8초/);
  assert.doesNotMatch(label(ui.tree), /hidden-/);
});

test('lost retry response preserves creative choices in the fork and account switching clears them', async () => {
  const preferences = { performer: 'robot', location: 'arcade', danceStyle: 'robot', visualStyle: 'stylized3d', difficulty: 'medium' };
  const failed = { id: 'failed-job', trackId: 'song', status: 'attention', startSeconds: 22, durationSeconds: 30,
    audioUrl: 'https://storage.test/exact.wav', visualBrief: '로봇 팝핑', creativePreferences: preferences };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body?.action === 'reuse') return { trackId: 'fork' };
    if (request.body?.action === 'prepare') throw new Error('기획 응답 확인 필요');
    if (request.url.includes('dance-music?trackId=fork')) return { tracks: [track('fork', { savedClip: { audioUrl: failed.audioUrl, startSeconds: 22, durationSeconds: 30 } })] };
    return request.url.includes('dance-video') ? { job: request.url.includes('trackId=song') ? failed : null } : { tracks: [track('song')] };
  } });
  await ui.settle(); button(ui.tree, '아이디어 다시 받기').props.onClick(); await ui.settle();
  assert.deepEqual(ui.requests.find(request => request.body?.action === 'prepare').body.creativePreferences, preferences);
  assert.equal(select(ui.tree, '출연자').props.value, 'robot'); assert.equal(select(ui.tree, '장소').props.value, 'arcade');
  assert.equal(select(ui.tree, '안무 스타일').props.value, 'robot');
  await ui.settle({ userId: 'owner-B' });
  assert.equal(selectedTrack(ui.tree).props.value, '');
  assert.doesNotMatch(label(ui.tree), /로봇 팝핑/);
});

test('first frame review can reuse only the saved music for a fresh creative plan', async () => {
  const review = { id: 'review-job', trackId: 'song', status: 'image-review', startSeconds: 22, durationSeconds: 30,
    audioUrl: 'https://storage.test/exact.wav', imageUrl: 'https://storage.test/frame.jpg', visualBrief: '기존 로봇 기획',
    creativePreferences: { performer: 'robot', location: 'arcade', danceStyle: 'robot', visualStyle: 'stylized3d', difficulty: 'medium' } };
  const original = track('song', { musicLabel: '바운스 · 힙합', instrumental: false });
  const fork = track('fork', { musicLabel: original.musicLabel, instrumental: false,
    savedClip: { audioUrl: review.audioUrl, startSeconds: 22, durationSeconds: 30 } });
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) { assert.equal(request.body.action, 'reuse'); return { trackId: 'fork' }; }
    if (request.url.includes('dance-music?trackId=fork')) return { tracks: [fork] };
    return request.url.includes('dance-video') ? { job: request.url.includes('trackId=song') ? review : null } : { tracks: [original] };
  } });
  await ui.settle(); await ui.runTimers();
  assert.match(label(ui.tree), /선택한 음원의 음악 · 바운스 · 힙합 · 보컬 포함/);
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  const reuse = button(ui.tree, '같은 음원으로 새 챌린지 만들기');
  assert.equal(reuse.props.disabled, false);
  reuse.props.onClick(); await ui.settle(); await ui.runTimers();
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['reuse']);
  assert.equal(selectedTrack(ui.tree).props.value, 'fork');
  assert.equal(element(ui.tree, 'textarea').props.value, '');
  assert.equal(select(ui.tree, '출연자').props.value, 'auto');
  assert.equal(select(ui.tree, '장소').props.value, 'auto');
  assert.equal(select(ui.tree, '안무 스타일').props.value, 'auto');
  assert.equal(mediaNode(ui, '저장된 30초 음원').props.src, review.audioUrl);
  assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, false);
});

test('recoverable attention work resumes saved results only after one explicit click', async () => {
  const held = { id: 'held-job', trackId: 'song', status: 'attention', startSeconds: 0, durationSeconds: 30,
    visualBrief: '', audioUrl: 'https://storage.test/exact.wav', canResume: true, clip1RequestId: 'saved-request' };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) return { job: { ...held, status: 'clip1', canResume: false } };
    return request.url.includes('dance-video') ? { job: held } : { tracks: [track('song')] };
  } });
  await ui.settle(); await ui.runTimers();
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  const resume = button(ui.tree, '저장된 결과로 이어 만들기');
  assert.equal(resume.props.disabled, false);
  resume.props.onClick(); resume.props.onClick(); await ui.settle();
  const posts = ui.requests.filter(request => request.body);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { action: 'resume', trackId: 'song', jobId: held.id });
});

test('server-approved expired planning reuses only saved audio into a separate unstarted challenge', async () => {
  const held = { id: 'held-plan', trackId: 'song', status: 'attention', startSeconds: 40, durationSeconds: 30,
    visualBrief: '이전 기획', audioUrl: 'https://storage.test/selected.wav', audioHash: 'a'.repeat(64),
    planningSubmitted: true, canResume: false, canReuseAudio: true,
    inFlight: { action: 'select-idea', token: 'previous-lease', at: '2026-09-18T00:55:00Z' } };
  const before = structuredClone(held);
  const duplicate = track('fork', { savedClip: { audioUrl: held.audioUrl, audioHash: held.audioHash, startSeconds: 40, durationSeconds: 30 }, reused: true });
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) { assert.equal(request.body.action, 'reuse'); return { trackId: 'fork' }; }
    if (request.url.includes('dance-music?trackId=fork')) return { tracks: [duplicate] };
    if (request.url.includes('dance-video')) return { job: request.url.includes('trackId=song') ? held : null };
    return { tracks: [track('song')] };
  } });
  await ui.settle(); await ui.runTimers();
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  assert.match(label(ui.tree), /이전 기획은 결과 확인이 필요한 상태로 보존/);
  assert.equal(button(ui.tree, '이 아이디어로 기획 다시 시도'), undefined);
  assert.equal(button(ui.tree, '아이디어 다시 받기'), undefined);
  assert.equal(button(ui.tree, '저장된 결과로 이어 만들기'), undefined);
  const reuse = button(ui.tree, '같은 음원으로 새 챌린지 만들기');
  assert.equal(reuse.props.disabled, false);
  reuse.props.onClick(); reuse.props.onClick(); await ui.settle();
  assert.equal(selectedTrack(ui.tree).props.value, 'fork');
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['reuse']);
  assert.equal(mediaNode(ui, '저장된 30초 음원').props.src, held.audioUrl);
  assert.equal(element(ui.tree, 'textarea').props.disabled, false);
  assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, false);
  assert.deepEqual(held, before, 'the held original is not rewritten or resumed');
});

test('reuse capability comes from the server; stale lease dates do not enable the client button', async () => {
  for (const canReuseAudio of [false, undefined]) {
    const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
      if (request.body) assert.fail('An unapproved lease cannot fork or retry automatically');
      return request.url.includes('dance-video') ? { job: { id: 'held-plan', trackId: 'song', status: 'attention',
        startSeconds: 40, durationSeconds: 30, visualBrief: '', audioUrl: 'https://storage.test/selected.wav',
        canReuseAudio, inFlight: { action: 'prepare', token: 'held', at: '2020-01-01T00:00:00Z' } } } : { tracks: [track('song')] };
    } });
    await ui.settle(); await ui.runTimers();
    assert.equal(button(ui.tree, '같은 음원으로 새 챌린지 만들기'), undefined);
    assert.equal(ui.requests.filter(request => request.body).length, 0);
  }
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => request.url.includes('dance-video') ? { job: {
    id: 'ready-plan', trackId: 'song', status: 'ready', startSeconds: 40, durationSeconds: 30, visualBrief: '',
    audioUrl: 'https://storage.test/selected.wav', canReuseAudio: false,
  } } : { tracks: [track('song')] } });
  await ui.settle();
  assert.equal(button(ui.tree, '같은 음원으로 새 챌린지 만들기'), undefined, 'an explicit server refusal overrides legacy idle status');
});

test('unknown submission cannot offer resume or automatically issue another generation request', async () => {
  for (const canResume of [false, undefined]) {
    const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
      if (request.body) assert.fail('Unknown submission must remain idle');
      return request.url.includes('dance-video') ? { job: { id: 'unknown-job', trackId: 'song', status: 'attention',
        startSeconds: 0, durationSeconds: 30, visualBrief: '', audioUrl: 'https://storage.test/exact.wav', canResume,
        plan: { title: '저장된 기획', summary: '영상 제출 결과 확인 중', identity: 'hidden', imagePrompt: 'hidden', clips: ['hidden', 'hidden'] } } } : { tracks: [track('song')] };
    } });
    await ui.settle(); await ui.runTimers();
    assert.equal(button(ui.tree, '저장된 결과로 이어 만들기'), undefined);
    assert.equal(ui.requests.filter(request => request.body).length, 0);
    assert.ok(button(ui.tree, '같은 음원으로 새 챌린지 만들기'));
  }
});

test('ending review offers a listening reminder without exposing raw rhythm confidence or beats', async () => {
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => request.url.includes('dance-video') ? { job: {
    id: 'job', trackId: 'song', status: 'ready', startSeconds: 0, durationSeconds: 30, visualBrief: '',
    audioUrl: 'https://storage.test/exact.wav', rhythm: { endingStatus: 'review', confidence: 0.43271, beatSeconds: [0.13729], method: 'energy-autocorrelation' },
  } } : { tracks: [track('song')] } });
  await ui.settle();
  assert.match(label(ui.tree), /마지막 보컬이나 음악이 잘리지 않는지 선택 구간을 확인하세요/);
  assert.doesNotMatch(label(ui.tree), /0\.43271|0\.13729|energy-autocorrelation/);
});

const ideaChoices = tree => walk(tree, node => node.type === 'button' && node.props['aria-label']?.endsWith('선택하고 장면 설계'));
function ideasJob(overrides = {}) {
  return { id: 'ideas-job', trackId: 'song', status: 'ideas', startSeconds: 0, durationSeconds: 30,
    visualBrief: '', audioUrl: 'https://storage.test/selected30.wav',
    ideas: ['한 박자 얼음', '발끝 신호', '어깨 릴레이'].map((title, index) => ({
      id: `idea-${index + 1}`, title, firstTwoSeconds: `${title} 시작 순간`, signatureMove: `${title} 반복 동작`,
      musicConnection: `${title} 리듬 포인트`, visualPayoff: `${title} 마지막 변화`,
      seriesPotential: `${title} 다음 편`, productionRisk: `${title} 제작 주의`, conceptFamily: `internal-family-${index + 1}`,
    })), ...overrides };
}

function premisesJob(overrides = {}) {
  return ideasJob({ planningVersion: 3, qualityPreviewRequired: true,
    creativePreferences: { performer: 'woman', ensemble: 'duo', species: 'auto', location: 'auto', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' },
    planningSeed: { automaticHints: { locationLabel: '임시 자동 장소 표식', wardrobe: '임시 자동 의상 표식' } },
    ideas: ['첫 눈길', '뜻밖의 반응', '마지막 표정'].map((title, index) => ({
      version: 3, id: `premise-${index + 1}`, title, conceptFamily: ['interaction', 'contrast', 'rhythm_reveal'][index],
      visibleHook: `${title} 눈에 보이는 첫 장면`, characterGoal: `${title} 출연자의 구체적인 목표`, emotionalReaction: `${title} 알아볼 수 있는 감정과 반응`,
      turn: `${title} 상황을 바꾸는 전개`, payoff: `${title} 기대를 해소하는 마지막 변화`, participation: `${title} 관객이 참여할 부분`,
      productionRisk: `${title} 제작할 때 확인할 위험`, musicConnection: `${title} 음악의 리듬과 연결되는 부분`,
    })), ...overrides });
}

test('V3 preparation preserves fixed preferences and renders three truthful premise cards without provisional production or invented choreography', async () => {
  const saved = premisesJob();
  assert.ok(saved.ideas.every(performancePremises.isDancePerformancePremiseV3));
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) { assert.equal(request.body.action, 'prepare'); return { job: saved }; }
    return request.url.includes('dance-video') ? { job: null } : { tracks: [track('song')] };
  } });
  await ui.settle();
  const fixed = select(ui.tree, '영상 표현');
  assert.equal(fixed.props.value, 'realistic');
  assert.ok(walk(fixed, node => node.type === 'option').every(option => option.props.value !== 'auto'));
  assert.equal(select(ui.tree, '따라 추기 난이도').props.value, 'easy');
  select(ui.tree, '출연자').props.onChange({ target: { value: 'woman' } });
  select(ui.tree, '출연 규모').props.onChange({ target: { value: 'duo' } }); await ui.settle();
  button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle(); await ui.runTimers();
  const posts = ui.requests.filter(request => request.body);
  assert.equal(posts.length, 1); assert.equal(posts[0].body.planningVersion, 3);
  assert.deepEqual(posts[0].body.creativePreferences, saved.creativePreferences);
  const cards = walk(ui.tree, node => node.type === 'article'); assert.equal(cards.length, 3);
  for (const [index, card] of cards.entries()) {
    for (const key of ['title', 'visibleHook', 'characterGoal', 'emotionalReaction', 'turn', 'payoff', 'participation', 'productionRisk', 'musicConnection']) assert.ok(label(card).includes(saved.ideas[index][key]), key);
    assert.doesNotMatch(label(card), /8카운트|따라 할 동작|반복 훅|대기 중/);
  }
  assert.doesNotMatch(label(ui.tree), /임시 자동 장소 표식|임시 자동 의상 표식|8카운트 따라 추기/);
  assert.equal(ideaChoices(ui.tree).length, 3); assert.ok(ideaChoices(ui.tree).every(choice => !choice.props.disabled));
  assert.equal(element(ui.tree, 'img'), undefined); assert.equal(element(ui.tree, 'video'), undefined);
  assert.equal(button(ui.tree, '첫 장면 만들기'), undefined); assert.equal(ui.timers.size, 0);
});

test('V3 selection sends only stored IDs and exposes production and counted choreography only from the returned plan', async () => {
  const saved = premisesJob(), chosen = saved.ideas[1], late = deferred();
  const finalDirection = { castLabel: '확정된 여성 듀오', locationLabel: '확정된 장소 표식', danceStyleLabel: '확정된 안무 표식' };
  const choreography = { hookName: '확정된 실전 훅', steps: [{ count: 4, action: '발 옆 딛기·발 앞뒤 딛기', focus: 'feet' }, { count: 4, action: '몸통 돌리기·무릎 튕기기', focus: 'body' }],
    segments: [{ startSeconds: 0, endSeconds: 2, action: '발을 딛고 몸통을 틀기', repeatHook: true, phase: 'opening' },
      { startSeconds: 2, endSeconds: 22, action: '발을 교대하며 몸통을 기울이기', repeatHook: true, phase: 'development' },
      { startSeconds: 22, endSeconds: 28, action: '발을 중앙에 딛고 몸통을 펴기', repeatHook: true, phase: 'payoff' },
      { startSeconds: 28, endSeconds: 30, action: '발을 옆에 딛고 몸통을 낮추기', repeatHook: true, phase: 'restart' }],
    firstPose: '몸통을 기울이고 발을 딛은 자세', endPose: '몸통을 펴고 발을 중앙에 딛은 자세' };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) return late.promise;
    return request.url.includes('dance-video') ? { job: saved } : { tracks: [track('song')] };
  } });
  await ui.settle(); const choose = ideaChoices(ui.tree)[1]; choose.props.onClick(); choose.props.onClick(); await ui.settle();
  assert.ok(ideaChoices(ui.tree).every(choice => choice.props.disabled));
  assert.doesNotMatch(label(ui.tree), /확정된 장소 표식|확정된 안무 표식|확정된 실전 훅|8카운트 따라 추기/);
  late.resolve({ job: { ...saved, status: 'ready', selectedIdea: chosen, direction: finalDirection,
    plan: { title: '선택한 공연 설계', summary: '확인된 출연자의 동작과 흐름', identity: 'two original adult women', imagePrompt: 'saved action still', clips: ['first motion', 'second motion'], choreography } } });
  await ui.settle(); await ui.runTimers(); choose.props.onClick(); await ui.settle();
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body), [{ action: 'select-idea', trackId: 'song', jobId: saved.id, ideaId: chosen.id }]);
  for (const key of ['title', 'visibleHook', 'characterGoal', 'emotionalReaction', 'turn', 'payoff', 'participation']) assert.ok(label(ui.tree).includes(chosen[key]), key);
  assert.match(label(ui.tree), /확정된 장소 표식|확정된 안무 표식/);
  assert.match(label(ui.tree), /8카운트 따라 추기/);
  for (const step of choreography.steps) assert.ok(label(ui.tree).includes(`${step.count} · ${step.action}`));
  assert.doesNotMatch(label(ui.tree), /임시 자동 장소 표식|임시 자동 의상 표식|따라 할 동작 ·/);
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, false);
  assert.equal(element(ui.tree, 'img'), undefined); assert.equal(element(ui.tree, 'video'), undefined); assert.equal(ui.timers.size, 0);
});

test('prepare saves three text ideas and stays idle without choosing a concept or creating paid media', async () => {
  const saved = ideasJob();
  const busy = [];
  const ui = harness({ props: { initialTrackId: 'song', onBusyChange(value) { busy.push(value); } }, reply: request => {
    if (request.body) { assert.equal(request.body.action, 'prepare'); return { job: saved }; }
    return request.url.includes('dance-video') ? { job: null } : { tracks: [track('song')] };
  } });
  await ui.settle(); button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle(); await ui.runTimers();
  assert.equal(walk(ui.tree, node => node.type === 'article').length, 3);
  assert.equal(ideaChoices(ui.tree).length, 3);
  assert.ok(ideaChoices(ui.tree).every(choice => choice.props.disabled === false));
  for (const idea of saved.ideas) {
    for (const key of ['title', 'firstTwoSeconds', 'signatureMove', 'musicConnection', 'visualPayoff', 'seriesPotential', 'productionRisk']) {
      assert.ok(label(ui.tree).includes(idea[key]));
    }
  }
  assert.doesNotMatch(label(ui.tree), /internal-family-|선택한 아이디어 ·/);
  assert.match(label(ui.tree), /기획 비용/);
  assert.equal(element(ui.tree, 'img'), undefined);
  assert.equal(element(ui.tree, 'video'), undefined);
  assert.equal(button(ui.tree, '첫 장면 만들기'), undefined);
  assert.equal(button(ui.tree, '아이디어 준비 완료').props.disabled, true);
  button(ui.tree, '아이디어 준비 완료').props.onClick(); await ui.settle();
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['prepare']);
  assert.equal(ui.timers.size, 0); assert.equal(busy.at(-1), false);
});

test('explicit concept selection submits once, locks choices while waiting and stops at scene review', async () => {
  const saved = ideasJob(); const late = deferred();
  const chosen = saved.ideas[1];
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) return late.promise;
    return request.url.includes('dance-video') ? { job: saved } : { tracks: [track('song')] };
  } });
  await ui.settle(); const choose = ideaChoices(ui.tree)[1];
  choose.props.onClick(); choose.props.onClick(); await ui.settle();
  assert.ok(ideaChoices(ui.tree).every(choice => choice.props.disabled));
  assert.equal(ideaChoices(ui.tree)[1].props['aria-busy'], true);
  assert.equal(select(ui.tree, '장소').props.disabled, true);
  assert.equal(selectedTrack(ui.tree).props.disabled, true);
  button(ui.tree, '아이디어 준비 완료').props.onClick(); await ui.settle();
  late.resolve({ job: { ...saved, status: 'ready', selectedIdea: chosen, plan: { title: '선택한 장면 설계', summary: '8카운트 동작을 반복합니다.' } } });
  await ui.settle(); await ui.runTimers();
  choose.props.onClick(); await ui.settle();
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body), [
    { action: 'select-idea', trackId: 'song', jobId: saved.id, ideaId: chosen.id },
  ]);
  assert.match(label(ui.tree), /선택한 아이디어 · 발끝 신호/);
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, false);
  assert.equal(element(ui.tree, 'img'), undefined); assert.equal(ui.timers.size, 0);
});

test('editing idea preferences blocks old choices until one explicit new preparation', async () => {
  const saved = ideasJob();
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body?.action === 'prepare') return { job: { ...saved, id: 'new-ideas-job', creativePreferences: request.body.creativePreferences } };
    if (request.body?.action === 'select-idea') return { job: { ...saved, id: 'new-ideas-job', status: 'ready', selectedIdea: saved.ideas[0] } };
    return request.url.includes('dance-video') ? { job: saved } : { tracks: [track('song')] };
  } });
  await ui.settle(); const oldChoice = ideaChoices(ui.tree)[0];
  select(ui.tree, '장소').props.onChange({ target: { value: 'studio' } }); await ui.settle();
  assert.ok(ideaChoices(ui.tree).every(choice => choice.props.disabled));
  oldChoice.props.onClick(); ideaChoices(ui.tree)[0].props.onClick(); await ui.settle();
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  assert.match(label(ui.tree), /설정이 바뀌었습니다/);
  button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
  assert.equal(ui.requests.find(request => request.body).body.creativePreferences.location, 'studio');
  assert.equal(ideaChoices(ui.tree)[0].props.disabled, false);
  oldChoice.props.onClick(); await ui.settle();
  assert.equal(ui.requests.filter(request => request.body).length, 1, 'stale job choices cannot select a new preparation');
  ideaChoices(ui.tree)[0].props.onClick(); await ui.settle();
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['prepare', 'select-idea']);
  assert.equal(ui.requests.at(-1).body.jobId, 'new-ideas-job');
});

test('uncertain concept selection requires a saved-state read and cannot resubmit from an old callback', async () => {
  const saved = ideasJob(); let submitted = false;
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) { assert.equal(request.body.action, 'select-idea'); submitted = true; throw new Error('선택 응답 연결 끊김'); }
    return request.url.includes('dance-video') ? { job: submitted ? { ...saved, status: 'ready', selectedIdea: saved.ideas[2] } : saved } : { tracks: [track('song')] };
  } });
  await ui.settle(); const choose = ideaChoices(ui.tree)[2];
  choose.props.onClick(); await ui.settle(); await ui.runTimers();
  assert.ok(ideaChoices(ui.tree).every(choice => choice.props.disabled));
  choose.props.onClick(); ideaChoices(ui.tree)[2].props.onClick(); await ui.settle();
  assert.equal(ui.requests.filter(request => request.body).length, 1);
  button(ui.tree, '저장된 작업 상태 확인').props.onClick(); await ui.settle(); await ui.runTimers();
  assert.match(label(ui.tree), /선택한 아이디어 · 어깨 릴레이/);
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, false);
  assert.equal(ui.requests.filter(request => request.body).length, 1);
});

test('late concept response and old choice callback cannot restore account-A private content for account B', async () => {
  const saved = ideasJob({ visualBrief: 'A-private-concept' }); const late = deferred();
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) return late.promise;
    return request.url.includes('dance-video') ? { job: request.owner === 'owner-A' ? saved : null } : { tracks: [track(request.owner === 'owner-A' ? 'song' : 'B')] };
  } });
  await ui.settle(); const choose = ideaChoices(ui.tree)[0]; choose.props.onClick(); await ui.settle();
  await ui.settle({ userId: 'owner-B' });
  late.resolve({ job: { ...saved, status: 'ready', selectedIdea: saved.ideas[0] } });
  await ui.settle(); choose.props.onClick(); await ui.settle(); await ui.runTimers();
  assert.equal(selectedTrack(ui.tree).props.value, '');
  assert.doesNotMatch(label(ui.tree), /A-private-concept|선택한 아이디어 · 한 박자 얼음/);
  assert.equal(ui.requests.filter(request => request.body).length, 1);
});

test('switching tracks from the idle ideas stage prevents a stale concept choice from submitting', async () => {
  const saved = ideasJob();
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) assert.fail('No concept selection for a previously selected track');
    return request.url.includes('dance-video') ? { job: request.url.includes('trackId=song') ? saved : null } : { tracks: [track('song'), track('other')] };
  } });
  await ui.settle(); const choose = ideaChoices(ui.tree)[0];
  assert.equal(selectedTrack(ui.tree).props.disabled, false);
  selectedTrack(ui.tree).props.onChange({ target: { value: 'other' } }); await ui.settle();
  choose.props.onClick(); await ui.settle(); await ui.runTimers();
  assert.equal(selectedTrack(ui.tree).props.value, 'other');
  assert.equal(ideaChoices(ui.tree).length, 0);
  assert.equal(ui.requests.filter(request => request.body).length, 0);
});

test('the selected concept remains visible in the plan, first image and finished video', async () => {
  const saved = ideasJob();
  for (const status of ['ready', 'image-review', 'completed']) {
    const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
      if (request.body) assert.fail('Review stages stay idle');
      return request.url.includes('dance-video') ? { job: { ...saved, status, selectedIdea: saved.ideas[1],
        imageUrl: status === 'ready' ? undefined : 'https://storage.test/frame.jpg', videoUrl: status === 'completed' ? 'https://storage.test/final.mp4' : undefined } } : { tracks: [track('song')] };
    } });
    await ui.settle(); await ui.runTimers();
    assert.match(label(ui.tree), /선택한 아이디어 · 발끝 신호/);
    assert.match(label(ui.tree), /발끝 신호 시작 순간/);
    assert.match(label(ui.tree), /발끝 신호 반복 동작/);
    assert.equal(ui.requests.filter(request => request.body).length, 0);
  }
});

test('the idle ideas stage reuses its saved music with one explicit fork and no automatic generation', async () => {
  const saved = ideasJob();
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) { assert.equal(request.body.action, 'reuse'); return { trackId: 'fork' }; }
    if (request.url.includes('dance-music?trackId=fork')) return { tracks: [track('fork', { savedClip: { audioUrl: saved.audioUrl, startSeconds: 0, durationSeconds: 30 } })] };
    return request.url.includes('dance-video') ? { job: request.url.includes('trackId=song') ? saved : null } : { tracks: [track('song')] };
  } });
  await ui.settle(); button(ui.tree, '같은 음원으로 새 챌린지 만들기').props.onClick(); await ui.settle(); await ui.runTimers();
  assert.equal(selectedTrack(ui.tree).props.value, 'fork');
  assert.equal(mediaNode(ui, '저장된 30초 음원').props.src, saved.audioUrl);
  assert.equal(ideaChoices(ui.tree).length, 0);
  assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, false);
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['reuse']);
});

test('failed selected concept can retry the same saved idea once without forking or creating media', async () => {
  const ideas = ideasJob();
  const failed = { ...ideas, status: 'attention', selectedIdea: ideas.ideas[1], conceptPlanAttempts: 1, planningSubmitted: true, error: '장면 설계 확인 필요' };
  const late = deferred();
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) return late.promise;
    return request.url.includes('dance-video') ? { job: failed } : { tracks: [track('song')] };
  } });
  await ui.settle(); await ui.runTimers();
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  assert.equal(select(ui.tree, '장소').props.disabled, true);
  const retry = button(ui.tree, '이 아이디어로 기획 다시 시도');
  assert.equal(retry.props.disabled, false);
  retry.props.onClick(); retry.props.onClick(); await ui.settle();
  assert.equal(button(ui.tree, '같은 아이디어 기획 중…').props.disabled, true);
  late.resolve({ job: { ...failed, status: 'ready', conceptPlanAttempts: 2 } });
  await ui.settle(); await ui.runTimers(); retry.props.onClick(); await ui.settle();
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body), [
    { action: 'select-idea', trackId: 'song', jobId: failed.id, ideaId: failed.selectedIdea.id },
  ]);
  assert.match(label(ui.tree), /선택한 아이디어 · 발끝 신호/);
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, false);
  assert.equal(element(ui.tree, 'img'), undefined); assert.equal(element(ui.tree, 'video'), undefined);
});

test('a second failed concept plan hides its retry and uses the saved-audio fork for new ideas only on click', async () => {
  const ideas = ideasJob();
  const failed = { ...ideas, status: 'attention', selectedIdea: ideas.ideas[0], conceptPlanAttempts: 1, planningSubmitted: true };
  let prepared = false;
  const fork = track('fork', { savedClip: { audioUrl: failed.audioUrl, startSeconds: 0, durationSeconds: 30 } });
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body?.action === 'select-idea') return { job: { ...failed, conceptPlanAttempts: 2, error: '두 번째 장면 설계 실패' } };
    if (request.body?.action === 'reuse') return { trackId: 'fork' };
    if (request.body?.action === 'prepare') { prepared = true; return { job: ideasJob({ id: 'fork-job', trackId: 'fork' }) }; }
    if (request.body) assert.fail('No automatic paid media');
    if (request.url.includes('dance-music?trackId=fork')) return { tracks: [fork] };
    return request.url.includes('dance-video') ? { job: request.url.includes('trackId=song') ? failed : prepared ? ideasJob({ id: 'fork-job', trackId: 'fork' }) : null } : { tracks: [track('song')] };
  } });
  await ui.settle(); const retry = button(ui.tree, '이 아이디어로 기획 다시 시도'); retry.props.onClick();
  await ui.settle(); await ui.runTimers();
  assert.equal(button(ui.tree, '이 아이디어로 기획 다시 시도'), undefined);
  assert.match(label(ui.tree), /두 번 시도했습니다/);
  retry.props.onClick(); await ui.settle();
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['select-idea']);
  assert.equal(button(ui.tree, '같은 음원으로 새 챌린지 만들기').props.disabled, false);
  button(ui.tree, '아이디어 다시 받기').props.onClick(); await ui.settle(); await ui.runTimers();
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['select-idea', 'reuse', 'prepare']);
  assert.equal(selectedTrack(ui.tree).props.value, 'fork');
  assert.equal(mediaNode(ui, '저장된 30초 음원').props.src, failed.audioUrl);
  assert.equal(ideaChoices(ui.tree).length, 3);
  assert.equal(element(ui.tree, 'img'), undefined); assert.equal(element(ui.tree, 'video'), undefined);
});

test('selected concept retry is absent for existing media, in-flight work or incomplete saved idea state', async () => {
  const ideas = ideasJob();
  const failed = { ...ideas, status: 'attention', selectedIdea: ideas.ideas[0], conceptPlanAttempts: 1, planningSubmitted: true };
  for (const override of [
    { imageUrl: 'https://storage.test/frame.jpg' }, { clip1RequestId: 'request-1' }, { clip2RequestId: 'request-2' },
    { clip1Url: 'https://storage.test/clip.mp4' }, { clip2Url: 'https://storage.test/clip.mp4' },
    { bridgeUrl: 'https://storage.test/bridge.jpg' }, { videoUrl: 'https://storage.test/final.mp4' },
    { inFlight: { action: 'select-idea', token: 'saved-token', at: '2026-10-08T00:00:00.000Z' } },
    { plan: { title: 'saved plan', summary: 'saved plan' } }, { ideas: undefined }, { selectedIdea: undefined },
  ]) {
    const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
      if (request.body) assert.fail('No automatic retries for existing or uncertain work');
      return request.url.includes('dance-video') ? { job: { ...failed, ...override } } : { tracks: [track('song')] };
    } });
    await ui.settle(); await ui.runTimers();
    assert.equal(button(ui.tree, '이 아이디어로 기획 다시 시도'), undefined);
    assert.equal(ui.requests.filter(request => request.body).length, 0);
  }
});

function previewJob(overrides = {}) {
  const ideas = ideasJob();
  return { ...ideas, status: 'preview-review', selectedIdea: ideas.ideas[1], qualityPreviewRequired: true,
    imageUrl: 'https://storage.test/approved-frame.jpg', previewUrl: 'https://storage.test/preview5.mp4', previewSeconds: 5,
    plan: { title: '선택한 장면 설계', summary: '훅 동작을 반복합니다.' }, ...overrides };
}

test('new frame approval produces a 5-second test and full video waits for one explicit preview approval', async () => {
  const preview = previewJob();
  const frame = { ...preview, status: 'image-review', previewUrl: undefined };
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body?.action === 'approve-frame') return { job: { ...frame, status: 'preview' } };
    if (request.body?.action === 'advance') return { job: preview };
    if (request.body?.action === 'approve-preview') return { job: { ...preview, status: 'clip1', previewApprovedAt: '2026-10-08T00:00:00.000Z' } };
    if (request.body) assert.fail('No unsupported generation action');
    return request.url.includes('dance-video') ? { job: frame } : { tracks: [track('song')] };
  } });
  await ui.settle(); await ui.runTimers();
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  const approveFrame = button(ui.tree, '이 장면으로 5초 동작 테스트');
  approveFrame.props.onClick(); approveFrame.props.onClick(); await ui.settle();
  assert.match(label(ui.tree), /5초 동작 테스트 영상 만드는 중/);
  assert.equal(button(ui.tree, '이 동작으로 30초 영상 만들기'), undefined);
  await ui.runTimers(); await ui.runTimers();
  assert.equal(element(ui.tree, 'video').props.src, preview.previewUrl);
  assert.equal(element(ui.tree, 'video').props['aria-label'], '5초 동작 테스트');
  assert.equal(element(ui.tree, 'video').props.autoPlay, undefined);
  assert.match(label(ui.tree), /처음 5초/); assert.match(label(ui.tree), /첫 2초/);
  assert.match(label(ui.tree), /각 출연자의 동작과 주고받는 반응/); assert.match(label(ui.tree), /인원·동물 종류·의상·위치/);
  assert.match(label(ui.tree), /선택한 아이디어 · 발끝 신호/);
  assert.equal(ui.timers.size, 0);
  approveFrame.props.onClick(); await ui.settle();
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['approve-frame', 'advance']);
  const approvePreview = button(ui.tree, '이 동작으로 30초 영상 만들기');
  assert.equal(approvePreview.props.disabled, false);
  approvePreview.props.onClick(); approvePreview.props.onClick(); await ui.settle();
  approvePreview.props.onClick(); await ui.settle();
  const posts = ui.requests.filter(request => request.body);
  assert.deepEqual(posts.map(request => request.body.action), ['approve-frame', 'advance', 'approve-preview']);
  assert.deepEqual(posts.at(-1).body, { action: 'approve-preview', trackId: 'song', jobId: preview.id });
});

test('preview review can fork the saved audio without automatically buying another image or video', async () => {
  const preview = previewJob();
  const fork = track('preview-fork', { savedClip: { audioUrl: preview.audioUrl, startSeconds: 0, durationSeconds: 30 } });
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) { assert.equal(request.body.action, 'reuse'); return { trackId: fork.id }; }
    if (request.url.includes('dance-music?trackId=preview-fork')) return { tracks: [fork] };
    return request.url.includes('dance-video') ? { job: request.url.includes('trackId=song') ? preview : null } : { tracks: [track('song')] };
  } });
  await ui.settle(); await ui.runTimers();
  assert.equal(selectedTrack(ui.tree).props.disabled, false);
  const approve = button(ui.tree, '이 동작으로 30초 영상 만들기');
  button(ui.tree, '같은 음원으로 새 챌린지 만들기').props.onClick(); await ui.settle(); await ui.runTimers();
  approve.props.onClick(); await ui.settle();
  assert.equal(selectedTrack(ui.tree).props.value, fork.id);
  assert.equal(mediaNode(ui, '저장된 30초 음원').props.src, preview.audioUrl);
  assert.equal(element(ui.tree, 'video'), undefined);
  assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, false);
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['reuse']);
});

test('lost preview approval requires a saved-state read and cannot repeat a full-video purchase from an old callback', async () => {
  const preview = previewJob(); let submitted = false;
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) { assert.equal(request.body.action, 'approve-preview'); submitted = true; throw new Error('영상 요청 응답 확인 필요'); }
    return request.url.includes('dance-video') ? { job: submitted ? { ...preview, status: 'attention', canResume: false, clip1RequestId: 'unknown-submission' } : preview } : { tracks: [track('song')] };
  } });
  await ui.settle(); const approve = button(ui.tree, '이 동작으로 30초 영상 만들기');
  approve.props.onClick(); await ui.settle(); await ui.runTimers();
  assert.equal(button(ui.tree, '이 동작으로 30초 영상 만들기').props.disabled, true);
  approve.props.onClick(); button(ui.tree, '이 동작으로 30초 영상 만들기').props.onClick(); await ui.settle();
  assert.equal(ui.requests.filter(request => request.body).length, 1);
  button(ui.tree, '저장된 작업 상태 확인').props.onClick(); await ui.settle(); await ui.runTimers();
  assert.equal(button(ui.tree, '이 동작으로 30초 영상 만들기'), undefined);
  assert.equal(button(ui.tree, '저장된 결과로 이어 만들기'), undefined);
  assert.equal(ui.requests.filter(request => request.body).length, 1);
});

test('late preview approval and account-A callback cannot restore private content after account switching', async () => {
  const preview = previewJob({ visualBrief: 'A-private-preview' }); const late = deferred();
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body) return late.promise;
    return request.url.includes('dance-video') ? { job: request.owner === 'owner-A' ? preview : null } : { tracks: [track(request.owner === 'owner-A' ? 'song' : 'B')] };
  } });
  await ui.settle(); const approve = button(ui.tree, '이 동작으로 30초 영상 만들기'); approve.props.onClick(); await ui.settle();
  await ui.settle({ userId: 'owner-B' });
  late.resolve({ job: { ...preview, status: 'clip1' } });
  await ui.settle(); approve.props.onClick(); await ui.settle(); await ui.runTimers();
  assert.equal(selectedTrack(ui.tree).props.value, '');
  assert.equal(element(ui.tree, 'video'), undefined);
  assert.doesNotMatch(label(ui.tree), /A-private-preview/);
  assert.equal(ui.requests.filter(request => request.body).length, 1);
});

test('missing image or preview assets keep the matching approval disabled and do not buy video', async () => {
  for (const saved of [previewJob({ status: 'image-review', imageUrl: undefined, previewUrl: undefined }), previewJob({ previewUrl: undefined })]) {
    const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
      if (request.body) assert.fail('Missing review media cannot be approved');
      return request.url.includes('dance-video') ? { job: saved } : { tracks: [track('song')] };
    } });
    await ui.settle(); await ui.runTimers();
    const approve = button(ui.tree, saved.status === 'image-review' ? '이 장면으로 5초 동작 테스트' : '이 동작으로 30초 영상 만들기');
    assert.equal(approve.props.disabled, true);
    approve.props.onClick(); await ui.settle();
    assert.equal(ui.requests.filter(request => request.body).length, 0);
  }
});

test('site mixed trio and penguin choices reach preparation and switching to women clears the animal species', async () => {
  const prepared = [];
  const ui = completedMusicUi(request => {
    assert.equal(request.body.action, 'prepare');
    const preferences = request.body.creativePreferences;
    const direction = creativeDirection.resolveDanceCreativeDirection(preferences, `ui-cast-${prepared.length}`);
    prepared.push(direction);
    return { job: ideasJob({ creativePreferences: preferences, direction }) };
  });
  await ui.settle();
  assert.ok(walk(select(ui.tree, '출연자'), node => node.type === 'option').some(option => option.props.value === 'human_animal'));
  assert.deepEqual(walk(select(ui.tree, '출연 규모'), node => node.type === 'option').map(option => option.props.value), ['auto', 'solo', 'duo', 'trio', 'crowd']);
  select(ui.tree, '출연자').props.onChange({ target: { value: 'human_animal' } });
  select(ui.tree, '출연 규모').props.onChange({ target: { value: 'trio' } });
  select(ui.tree, '동물 종류').props.onChange({ target: { value: 'penguin' } });
  select(ui.tree, '장소').props.onChange({ target: { value: 'park' } });
  await ui.settle();
  assert.equal(select(ui.tree, '출연자').props.value, 'human_animal');
  assert.equal(select(ui.tree, '출연 규모').props.value, 'trio');
  assert.equal(select(ui.tree, '동물 종류').props.value, 'penguin');
  button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle(); await ui.runTimers();
  const firstPost = ui.requests.find(request => request.body);
  assert.deepEqual(firstPost.body.creativePreferences, { performer: 'human_animal', ensemble: 'trio', species: 'penguin', location: 'park', danceStyle: 'auto', visualStyle: 'realistic', difficulty: 'easy' });
  assert.equal(prepared[0].cast.count, 3); assert.equal(prepared[0].cast.kind, 'human_animal');
  assert.ok(prepared[0].cast.members.some(member => member.kind === 'human'));
  assert.ok(prepared[0].cast.members.filter(member => member.kind === 'animal').every(member => member.species === 'penguin'));
  assert.equal(button(ui.tree, '첫 장면 만들기'), undefined);
  select(ui.tree, '출연자').props.onChange({ target: { value: 'woman' } }); await ui.settle();
  assert.equal(select(ui.tree, '동물 종류'), undefined);
  assert.equal(select(ui.tree, '출연 규모').props.value, 'trio');
  assert.ok(ideaChoices(ui.tree).every(choice => choice.props.disabled));
  button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
  const posts = ui.requests.filter(request => request.body);
  assert.deepEqual(posts.map(request => request.body.action), ['prepare', 'prepare']);
  assert.equal(posts[1].body.creativePreferences.species, 'auto');
  assert.equal(posts[1].body.creativePreferences.performer, 'woman');
  assert.equal(prepared[1].cast.kind, 'human'); assert.equal(prepared[1].cast.count, 3);
  assert.ok(prepared[1].cast.members.every(member => /attractive adult woman/.test(member.identity)));
});

test('legacy human ensembles keep a coherent count and mixed performers replace a solo choice with a duo', async () => {
  const ui = completedMusicUi(); await ui.settle();
  select(ui.tree, '출연 규모').props.onChange({ target: { value: 'solo' } }); await ui.settle();
  select(ui.tree, '출연자').props.onChange({ target: { value: 'human_animal' } }); await ui.settle();
  assert.equal(select(ui.tree, '출연 규모').props.value, 'duo');
  assert.equal(select(ui.tree, '출연 규모').props.disabled, false);
  assert.equal(walk(select(ui.tree, '출연 규모'), node => node.type === 'option' && node.props.value === 'solo').length, 0);
  assert.ok(select(ui.tree, '동물 종류'));
  for (const [performer, ensemble] of [['duo', 'duo'], ['group', 'trio'], ['crowd', 'crowd']]) {
    select(ui.tree, '출연자').props.onChange({ target: { value: performer } }); await ui.settle();
    assert.equal(select(ui.tree, '출연 규모').props.value, ensemble);
    assert.equal(select(ui.tree, '출연 규모').props.disabled, true);
    assert.equal(select(ui.tree, '동물 종류'), undefined);
  }
  select(ui.tree, '출연자').props.onChange({ target: { value: 'animal' } }); await ui.settle();
  assert.equal(select(ui.tree, '출연 규모').props.value, 'auto');
  assert.equal(select(ui.tree, '출연 규모').props.disabled, false);
  assert.equal(ui.requests.filter(request => request.body).length, 0);
});

test('legacy saved preferences missing count and species still allow frame and preview approval', async () => {
  const preferences = { performer: 'animal', location: 'park', danceStyle: 'bounce', visualStyle: 'stylized3d', difficulty: 'easy' };
  for (const [status, action, approvalText, nextStatus] of [
    ['image-review', 'approve-frame', '이 장면으로 5초 동작 테스트', 'preview'],
    ['preview-review', 'approve-preview', '이 동작으로 30초 영상 만들기', 'clip1'],
  ]) {
    const saved = previewJob({ status, creativePreferences: preferences });
    const snapshot = JSON.stringify(saved);
    const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
      if (request.body) return { job: { ...saved, status: nextStatus } };
      return request.url.includes('dance-video') ? { job: saved } : { tracks: [track('song')] };
    } });
    await ui.settle(); await ui.runTimers();
    assert.equal(select(ui.tree, '출연 규모').props.value, 'auto');
    assert.equal(select(ui.tree, '동물 종류').props.value, 'auto');
    assert.doesNotMatch(label(ui.tree), /구간 또는 영상 선택이 바뀌었습니다/);
    const approve = button(ui.tree, approvalText); assert.equal(approve.props.disabled, false);
    approve.props.onClick(); approve.props.onClick(); await ui.settle();
    assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body), [{ action, trackId: 'song', jobId: saved.id }]);
    assert.equal(JSON.stringify(saved), snapshot);
  }
});

test('a new count invalidates an old ready plan and stale image callbacks until preparation completes', async () => {
  const preferences = { performer: 'animal', location: 'park', danceStyle: 'bounce', visualStyle: 'stylized3d', difficulty: 'easy' };
  const saved = { id: 'old-ready', trackId: 'song', status: 'ready', startSeconds: 0, durationSeconds: 30, visualBrief: '', creativePreferences: preferences };
  let current = saved;
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body?.action === 'prepare') {
      current = { ...saved, id: 'new-ready', creativePreferences: request.body.creativePreferences };
      return { job: current };
    }
    if (request.body?.action === 'start') return { job: { ...current, status: 'image' } };
    if (request.body) assert.fail('Unexpected operation');
    return request.url.includes('dance-video') ? { job: saved } : { tracks: [track('song')] };
  } });
  await ui.settle();
  const staleStart = button(ui.tree, '첫 장면 만들기'); assert.equal(staleStart.props.disabled, false);
  select(ui.tree, '출연 규모').props.onChange({ target: { value: 'trio' } }); await ui.settle();
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, true);
  assert.equal(button(ui.tree, '아이디어 3개 받기').props.disabled, false);
  staleStart.props.onClick(); button(ui.tree, '첫 장면 만들기').props.onClick(); await ui.settle();
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, false);
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['prepare']);
  button(ui.tree, '첫 장면 만들기').props.onClick(); await ui.settle();
  const posts = ui.requests.filter(request => request.body);
  assert.deepEqual(posts.map(request => request.body.action), ['prepare', 'start']);
  assert.equal(posts[0].body.creativePreferences.ensemble, 'trio');
  assert.equal(posts[1].body.jobId, 'new-ready');
});

test('a changed species disables old ideas and stale selection handlers before a new idea batch', async () => {
  const preferences = { performer: 'animal', ensemble: 'duo', species: 'cat', location: 'park', danceStyle: 'bounce', visualStyle: 'stylized3d', difficulty: 'easy' };
  const saved = ideasJob({ creativePreferences: preferences });
  let current = saved;
  const ui = harness({ props: { initialTrackId: 'song' }, reply: request => {
    if (request.body?.action === 'prepare') {
      current = ideasJob({ id: 'new-ideas', creativePreferences: request.body.creativePreferences });
      return { job: current };
    }
    if (request.body?.action === 'select-idea') return { job: { ...current, status: 'ready', selectedIdea: current.ideas[0] } };
    if (request.body) assert.fail('No media is generated while changing ideas');
    return request.url.includes('dance-video') ? { job: saved } : { tracks: [track('song')] };
  } });
  await ui.settle(); const oldChoice = ideaChoices(ui.tree)[0];
  assert.equal(oldChoice.props.disabled, false);
  select(ui.tree, '동물 종류').props.onChange({ target: { value: 'penguin' } }); await ui.settle();
  assert.ok(ideaChoices(ui.tree).every(choice => choice.props.disabled));
  oldChoice.props.onClick(); ideaChoices(ui.tree)[0].props.onClick(); await ui.settle();
  assert.equal(ui.requests.filter(request => request.body).length, 0);
  button(ui.tree, '아이디어 3개 받기').props.onClick(); await ui.settle();
  assert.ok(ideaChoices(ui.tree).every(choice => !choice.props.disabled));
  assert.deepEqual(ui.requests.filter(request => request.body).map(request => request.body.action), ['prepare']);
  assert.equal(button(ui.tree, '첫 장면 만들기'), undefined);
  ideaChoices(ui.tree)[0].props.onClick(); await ui.settle();
  const posts = ui.requests.filter(request => request.body);
  assert.deepEqual(posts.map(request => request.body.action), ['prepare', 'select-idea']);
  assert.equal(posts[0].body.creativePreferences.species, 'penguin');
  assert.equal(posts[1].body.jobId, 'new-ideas');
  assert.equal(button(ui.tree, '첫 장면 만들기').props.disabled, false);
});
