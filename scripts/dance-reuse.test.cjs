/* eslint-disable @typescript-eslint/no-require-imports */
/** Ownership, immutable audio and idempotency checks with memory storage only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(overrides = {}) {
  const cache = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} }; cache.set(filename, mod);
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => Object.hasOwn(overrides, name) ? overrides[name]
      : name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) : require(name);
    new Function('require', 'module', 'exports', 'process', 'fetch', compiled)(localRequire, mod, mod.exports, { env: {} }, () => { throw Error('NETWORK_FORBIDDEN'); });
    return mod.exports;
  }
  return load;
}
const load = loader();
const { createDanceVideoService, DanceVideoError } = load('src/lib/dance/videoService.ts');
const { toDanceTrack } = load('src/lib/dance/music.ts');
const { DANCE_CATEGORY_ID, DANCE_WORKFLOW } = load('src/lib/dance/preset.ts');
const USER = 'a0000000-0000-4000-8000-000000000001';
const TRACK = 'a0000000-0000-4000-8000-000000000002';
const JOB = 'a0000000-0000-4000-8000-000000000003';
const FORK = 'a0000000-0000-4000-8000-000000000004';
const OTHER = 'a0000000-0000-4000-8000-000000000005';
const AGAIN = 'a0000000-0000-4000-8000-000000000006';
const storage = 'https://storage.test';
const selection = { audioUrl: `${storage}/storage/v1/object/public/melodio-assets/dance_challenge/${USER}/${TRACK}/${JOB}/audio.wav`, audioHash: 'a'.repeat(64), sourceAudioHash: 'b'.repeat(64), sourceDurationSeconds: 180, startSeconds: 40, durationSeconds: 30, bpm: 138, onsetSeconds: [0.4, 0.8] };
const PLAN = { title: '새 춤', summary: '새 상황', identity: 'original character', imagePrompt: 'new image', clips: ['first motion', 'second motion'] };
function fixture(options = {}) {
  const calls = []; let insertCount = 0;
  const job = { ...selection, id: JOB, trackId: TRACK, status: 'completed', visualBrief: '기존 영상', createdAt: '2026-09-18T00:00:00Z', updatedAt: '2026-09-18T00:00:00Z', videoUrl: `${storage}/old-video.mp4` };
  const metadata = { workflow: DANCE_WORKFLOW, presetId: DANCE_CATEGORY_ID, isPublic: true, originalMusicTitle: '원곡 제목', danceVideo: job,
    sourceMenu: 'viral', video_url: job.videoUrl, danceSubmission: { state: 'submitted' }, audioPersistence: { shouldNotCopy: true }, stems: { secret: 'omit' } };
  const initial = { id: TRACK, userId: USER, title: '이전 영상 제목', isPublic: false, createdAt: job.createdAt, status: 'completed',
    audioUrl: `${storage}/storage/v1/object/public/melodio-assets/generated_audio/full.mp3`, metadata, licenseHash: JSON.stringify(metadata) };
  const rows = new Map([[TRACK, initial]]);
  const store = {
    async load(user, id) { const row = rows.get(id); return row?.userId === user ? structuredClone(row) : null; },
    async insert(row) { if (rows.has(row.id)) return false; rows.set(row.id, structuredClone(row)); insertCount++; return true; },
    async compareAndSwap(previous, nextJob) {
      const row = rows.get(previous.id);
      if (!row || row.userId !== previous.userId || row.licenseHash !== previous.licenseHash) return null;
      const metadata = { ...row.metadata, danceVideo: structuredClone(nextJob) };
      const next = { ...row, metadata, licenseHash: JSON.stringify(metadata) }; rows.set(row.id, next); return structuredClone(next);
    },
  };
  const deps = { store, now: () => Date.parse('2026-09-18T01:00:00Z'),
    reuseSnapshot: async clip => { calls.push(['verify', structuredClone(clip)]); if (options.rejectClip) throw new DanceVideoError('hash mismatch', 'AUDIO_HASH'); },
    snapshot: async () => { calls.push(['snapshot']); throw Error('RETRIM_FORBIDDEN'); },
    plan: async job => { calls.push(['plan', structuredClone(job)]); return structuredClone(PLAN); },
    generateImage: async () => { throw Error('PROVIDER_FORBIDDEN'); }, startVideo: async () => { throw Error('PROVIDER_FORBIDDEN'); },
    pollVideo: async () => { throw Error('PROVIDER_FORBIDDEN'); }, copyAsset: async () => { throw Error('PROVIDER_FORBIDDEN'); },
    bridge: async () => { throw Error('PROVIDER_FORBIDDEN'); }, render: async () => { throw Error('PROVIDER_FORBIDDEN'); },
  };
  return { service: createDanceVideoService(deps), rows, calls, store, deps, inserts: () => insertCount, original: structuredClone(initial) };
}
const fork = c => c.service.reuse(USER, TRACK, JOB, FORK);
test('reuse reserves a separate private record with exact saved bytes reference and no paid calls', async () => {
  const c = fixture();
  assert.deepEqual(await fork(c), { trackId: FORK, job: null });
  assert.deepEqual(c.rows.get(TRACK), c.original, 'source video and original remain unchanged');
  const row = c.rows.get(FORK);
  assert.equal(row.audioUrl, c.original.audioUrl); assert.equal(row.isPublic, false); assert.equal(row.metadata.isPublic, false);
  assert.equal(row.metadata.sourceMenu, 'dance'); assert.equal(row.metadata.originalMusicTitle, '원곡 제목');
  assert.deepEqual(row.metadata.danceAudioSelection, selection);
  assert.deepEqual(row.metadata.danceVariant, { sourceTrackId: TRACK, sourceJobId: JOB, rootTrackId: TRACK });
  for (const field of ['danceVideo', 'video_url', 'danceSubmission', 'audioPersistence', 'stems']) assert.equal(row.metadata[field], undefined);
  assert.deepEqual(c.calls.map(c => c[0]), ['verify']);
  assert.equal(await c.service.get(USER, FORK), null);
});
test('concurrent retries insert once and return the same owned variant', async () => {
  const c = fixture(); const result = await Promise.all([fork(c), fork(c), fork(c)]);
  assert.ok(result.every(value => value.trackId === FORK)); assert.equal(c.inserts(), 1); assert.equal(c.rows.size, 2);
  const count = c.calls.length;
  assert.deepEqual(await fork(c), result[0]); assert.equal(c.calls.length, count);
  assert.deepEqual(c.rows.get(TRACK), c.original);
});
test('colliding request IDs, another owner, wrong source job and mismatched source IDs fail closed', async () => {
  const c = fixture();
  await assert.rejects(c.service.reuse(OTHER, TRACK, JOB, FORK), { code: 'TRACK_NOT_FOUND' });
  await assert.rejects(c.service.reuse(USER, TRACK, OTHER, FORK), { code: 'JOB_NOT_FOUND' });
  await assert.rejects(c.service.reuse(USER, TRACK, JOB, TRACK), { code: 'REUSE_CONFLICT' });
  c.rows.set(FORK, { ...structuredClone(c.original), id: FORK, userId: OTHER });
  await assert.rejects(fork(c), { code: 'REUSE_CONFLICT' });
  assert.equal(c.rows.get(FORK).userId, OTHER);
  c.rows.set(FORK, { ...structuredClone(c.original), id: FORK });
  await assert.rejects(fork(c), { code: 'REUSE_CONFLICT' });
  c.rows.delete(FORK); await fork(c);
  await assert.rejects(c.service.reuse(USER, TRACK, OTHER, FORK), { code: 'REUSE_CONFLICT' });
  assert.equal(c.inserts(), 1);
});
test('only saved ready/completed/attention sources with valid snapshots can be reused', async () => {
  for (const status of ['preparing', 'image', 'clip1', 'bridge', 'clip2', 'render']) {
    const c = fixture(); c.rows.get(TRACK).metadata.danceVideo.status = status;
    await assert.rejects(fork(c), { code: 'REUSE_NOT_READY' }); assert.equal(c.calls.length, 0);
  }
  for (const status of ['ready', 'completed', 'attention']) {
    const c = fixture(); c.rows.get(TRACK).metadata.danceVideo.status = status; await fork(c);
  }
  const c = fixture(); c.rows.get(TRACK).metadata.danceVideo.inFlight = { token: FORK, action: 'render', at: '2026-09-18T00:00:00Z' };
  await assert.rejects(fork(c), { code: 'REUSE_NOT_READY' });
  delete c.rows.get(TRACK).metadata.danceVideo.inFlight;
  delete c.rows.get(TRACK).metadata.danceVideo.audioHash;
  await assert.rejects(fork(c), { code: 'AUDIO_SELECTION' }); assert.equal(c.inserts(), 0);
});
test('hash/storage verification failure creates no variant and spends no planning call', async () => {
  const c = fixture({ rejectClip: true }); await assert.rejects(fork(c), { code: 'AUDIO_HASH' });
  assert.equal(c.rows.size, 1); assert.equal(c.inserts(), 0); assert.deepEqual(c.calls.map(c => c[0]), ['verify']);
});
test('prepare locks reused range, validates exact snapshot before planning and never retrims', async () => {
  const c = fixture(); await fork(c);
  await assert.rejects(c.service.prepare(USER, FORK, 41, '새 설정'), { code: 'AUDIO_SELECTION_LOCKED' });
  assert.equal(c.rows.get(FORK).metadata.danceVideo, undefined);
  const job = await c.service.prepare(USER, FORK, 40, '새 설정');
  assert.equal(job.status, 'ready'); assert.equal(job.audioUrl, selection.audioUrl); assert.equal(job.audioHash, selection.audioHash);
  assert.equal(job.startSeconds, 40); assert.equal(job.durationSeconds, 30); assert.equal(job.visualBrief, '새 설정');
  assert.deepEqual(c.calls.map(c => c[0]), ['verify', 'verify', 'plan']);
  assert.deepEqual(c.rows.get(TRACK), c.original);
  assert.deepEqual(c.rows.get(FORK).metadata.danceAudioSelection, selection);
  await c.service.reuse(USER, FORK, job.id, AGAIN);
  assert.equal(c.rows.get(AGAIN).metadata.danceVariant.rootTrackId, TRACK);
  assert.deepEqual(c.rows.get(AGAIN).metadata.danceAudioSelection, selection);
});
test('prepare detects mutated snapshot before paid planning and preserves the pinned selection', async () => {
  const c = fixture(); await fork(c); c.deps.reuseSnapshot = async () => { throw new DanceVideoError('hash mismatch', 'AUDIO_HASH'); };
  const job = await c.service.prepare(USER, FORK, 40, '새 설정');
  assert.equal(job.status, 'attention'); assert.equal(job.planningSubmitted, undefined);
  assert.equal(c.calls.filter(call => call[0] === 'plan').length, 0);
  assert.deepEqual(c.rows.get(FORK).metadata.danceAudioSelection, selection);
});
test('changing only the original ready visual brief preserves its saved clip without trimming', async () => {
  const c = fixture(); c.rows.get(TRACK).metadata.danceVideo.status = 'ready';
  const job = await c.service.prepare(USER, TRACK, 40, '다른 무대');
  assert.equal(job.status, 'ready'); assert.equal(job.audioHash, selection.audioHash); assert.equal(job.audioUrl, selection.audioUrl);
  assert.deepEqual(c.calls.map(c => c[0]), ['verify', 'plan']);
});
test('track projection exposes only safe saved preview fields and keeps database privacy', async () => {
  const c = fixture(); await fork(c); const row = c.rows.get(FORK);
  const dbRow = { id: row.id, user_id: row.userId, title: row.title, status: row.status, is_public: row.isPublic,
    created_at: row.createdAt, audio_url: row.audioUrl, source_audio_url: null, license_hash: row.licenseHash };
  const track = toDanceTrack(dbRow, storage);
  assert.deepEqual(track.savedClip, { audioUrl: selection.audioUrl, audioHash: selection.audioHash, startSeconds: 40, durationSeconds: 30 });
  assert.equal(track.reused, true); assert.equal(track.rootTrackId, TRACK); assert.equal(track.isPublic, false);
  assert.doesNotMatch(JSON.stringify(track), /sourceAudioHash|danceSubmission|onsetSeconds|audioPersistence/);
  for (const audioUrl of ['https://attacker.test/file.wav', `${selection.audioUrl}?token=secret`, `${storage}/storage/v1/object/public/melodio-assets/generated_audio/file.wav`]) {
    const meta = { ...row.metadata, danceAudioSelection: { ...selection, audioUrl } };
    assert.equal(toDanceTrack({ ...dbRow, license_hash: JSON.stringify(meta) }, storage).savedClip, undefined);
  }
});
test('storage adapter insert copies only explicit new generation fields and treats primary key conflict as non-insert', async () => {
  const { createDanceVideoStore } = loader({ './renderVideo': {}, './videoPlan': {}, '../video/petProvider': {}, '../video/petMedia': {} })('src/lib/dance/videoServer.ts');
  let payload; let duplicate = false;
  const store = createDanceVideoStore({ from: table => ({ insert: async value => {
    assert.equal(table, 'generations'); payload = value; return { error: duplicate ? { code: '23505' } : null };
  } }) });
  const c = fixture(); await fork(c);
  assert.equal(await store.insert(c.rows.get(FORK)), true);
  assert.equal(payload.id, FORK); assert.equal(payload.user_id, USER); assert.equal(payload.is_public, false);
  assert.equal(payload.source_audio_url, null); assert.equal(payload.is_stem_extracted, false);
  assert.equal(payload.audio_url, c.original.audioUrl); assert.equal(payload.cover_art_url, undefined);
  assert.equal(JSON.parse(payload.license_hash).danceVideo, undefined);
  duplicate = true; assert.equal(await store.insert(c.rows.get(FORK)), false);
});
