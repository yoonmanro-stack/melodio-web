/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node test runner uses CommonJS. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, overrides = {}, cache = new Map()) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute)
  const moduleObject = { exports: {} }
  cache.set(absolute, moduleObject.exports)
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'exports', 'module', output)(name => {
    if (name in overrides) return overrides[name]
    if (!name.startsWith('.') && !name.startsWith('@/')) throw new Error(`Unexpected dependency: ${name}`)
    const target = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
    const resolved = ['.ts', '.json', ''].map(extension => target + extension).find(candidate => fs.existsSync(candidate))
    if (!resolved) throw new Error(`Missing local dependency: ${name}`)
    return resolved.endsWith('.json') ? JSON.parse(fs.readFileSync(resolved, 'utf8')) : load(resolved, overrides, cache)
  }, moduleObject.exports, moduleObject)
  cache.set(absolute, moduleObject.exports)
  return moduleObject.exports
}

const samples = load('src/lib/preset-samples.ts')
const { parsePresetSampleRequests: parse, selectPresetSample: select, safePresetSampleAudioUrl: safeUrl } = samples
const own = 'https://project.supabase.co'
const stable = `${own}/storage/v1/object/public/melodio-assets/generated_audio/v1/track-a/original.mp3`
const laterStable = `${own}/storage/v1/object/public/melodio-assets/tracks/track-b.mp3`
const now = Date.parse('2026-10-06T00:00:00Z')
const request = { id: 'lofi-study', isInstrumental: false }
const meta = extra => ({ presetId: request.id, sourceMenu: 'japan', isInstrumental: false, duration: 195, ...extra })
const row = (extra = {}, metadata = {}) => ({
  id: 'track-a', title: 'Complete song', status: 'completed', is_public: true, is_stem_extracted: false,
  audio_url: stable, source_audio_url: 'suno:kie:offline-task', created_at: '2026-10-05T00:00:00Z',
  license_hash: JSON.stringify(meta(metadata)), ...extra,
})
const choose = rows => select(rows, request, 'japan', own, now)

test('batch intake is bounded and requires explicit booleans and safe IDs', () => {
  assert.deepEqual(parse(JSON.stringify([request])), [request])
  assert.equal(parse(null), null)
  for (const value of ['[', '[]', '{}', JSON.stringify([{ id: 'id', isInstrumental: 'false' }]),
    JSON.stringify([{ id: 'id', isInstrumental: 0 }]), JSON.stringify([{ id: 'id' }]),
    JSON.stringify([request, request]), JSON.stringify([{ id: 'x,license_hash.like.*', isInstrumental: false }]),
    JSON.stringify([{ id: '__proto__', isInstrumental: false }]), JSON.stringify([{ id: ' spaced ', isInstrumental: false }]),
    JSON.stringify(Array.from({ length: 25 }, (_, i) => ({ id: `preset-${i}`, isInstrumental: false })))]) {
    assert.equal(parse(value), null)
  }
  assert.equal(parse(JSON.stringify(Array.from({ length: 24 }, (_, i) => ({ id: `preset-${i}`, isInstrumental: false })))).length, 24)
})

test('newest eligible public exact-preset song wins; no generic/title/source fallback', () => {
  const newest = row({ id: 'track-b', created_at: '2026-10-06T00:00:00Z', audio_url: laterStable })
  const futureWrong = row({ id: 'track-newest', created_at: '2026-10-07T00:00:00Z', title: 'lofi-study' }, { presetId: 'japan_landing' })
  const wrongSource = row({ id: 'track-wrong-source', created_at: '2026-10-07T00:00:00Z' }, { sourceMenu: 'preset-studio' })
  assert.equal(choose([futureWrong, row(), newest, wrongSource]).id, 'track-b')
  assert.equal(choose([futureWrong, wrongSource]), null)
  assert.equal(select([wrongSource], request, 'preset-studio', own, now).id, 'track-wrong-source')
  assert.equal(choose([row({ id: 'track-z' }), row({ id: 'track-a' })]).id, 'track-z')
})

test('private, ambiguous, unfinished or malformed records cannot become samples', () => {
  for (const privateValue of [false, null, undefined, 'true', 1]) assert.equal(choose([row({ is_public: privateValue })]), null)
  assert.equal(choose([row({}, { isPublic: false })]), null)
  for (const extra of [{ status: 'generating' }, { status: 'failed' }, { license_hash: null },
    { license_hash: 'not-json' }, { license_hash: '[]' }, { license_hash: '{"isInstrumental":false}' },
    { created_at: 'invalid' }, { id: 'bad/id' }]) assert.equal(choose([row(extra)]), null)
  for (const metadata of [{ sourceMenu: null }, { sourceMenu: 'JAPAN' }, { presetId: null },
    { presetId: 'different' }, { isInstrumental: 'false' }, { isInstrumental: undefined }]) {
    assert.equal(choose([row({}, metadata)]), null)
  }
})

test('instrumental-only presets require instrumental; ordinary presets use the latest actual mode', () => {
  const instrumental = row({ id: 'track-instrumental' }, { isInstrumental: true })
  assert.equal(choose([instrumental]).isInstrumental, true)
  assert.equal(select([row()], { ...request, isInstrumental: true }, 'japan', own, now), null)
  assert.equal(select([row(), instrumental], { ...request, isInstrumental: true }, 'japan', own, now).id, 'track-instrumental')
  assert.equal(choose([row(), row({ id: 'new-instrumental', created_at: '2026-10-06T00:00:00Z' }, { isInstrumental: true })]).id, 'new-instrumental')
})

test('Preset Studio recognizes exact legacy studio sources; Japan never crosses that boundary', () => {
  for (const sourceMenu of ['preset-studio', 'audio-forge', 'audio-forge-pro']) {
    const legacy = row({}, { sourceMenu })
    assert.equal(select([legacy], request, 'preset-studio', own, now).id, 'track-a')
    assert.equal(choose([legacy]), null)
  }
  for (const sourceMenu of ['audio', 'viral', 'voice-discovery-sample', 'style-library', undefined]) {
    assert.equal(select([row({}, { sourceMenu })], request, 'preset-studio', own, now), null)
  }
})

test('aliases are exact equivalents and candidate query strings preserve JSON/LIKE quoting', () => {
  for (const [alias, canonical] of [['grunge', 'grunge_seattle'], ['grime', 'uk_grime'], ['joseon-hip-hop', 'joseon-hiphop']]) {
    assert.equal(select([row({}, { presetId: alias })], { ...request, id: canonical }, 'japan', own, now).id, 'track-a')
    assert.equal(select([row({}, { presetId: canonical })], { ...request, id: alias }, 'japan', own, now).id, 'track-a')
    assert.equal(select([row({}, { presetId: `${alias}-other` })], { ...request, id: canonical }, 'japan', own, now), null)
    const filter = samples.presetSampleCandidateFilter(alias)
    const values = [...filter.matchAll(/license_hash\.like\.("(?:\\.|[^"\\])*")/g)].map(match => JSON.parse(match[1]))
    assert.deepEqual(values, samples.presetSampleAliases(alias).map(id => `%"presetId"%"${id.replace(/_/g, '\\_')}"%`))
  }
})

test('ordinary full songs exclude short, dedicated sample, viral, stem and test records', () => {
  for (const duration of [1, 30, 60, 119.9, '30']) assert.equal(choose([row({}, { duration })]), null)
  assert.equal(choose([row({}, { duration: 120 })]).duration, 120)
  assert.equal(choose([row({}, { duration: '', durationSeconds: undefined })]).duration, null)
  // A measured selected clip takes priority over a longer planned provider duration.
  assert.equal(choose([row({}, { duration: 200, naturalSongPolicy: { selectedCandidateIndex: 1,
    candidates: [{ index: 0, durationSeconds: 195 }, { index: 1, durationSeconds: 30 }] } })]), null)
  // Derived stems do not disqualify the ordinary original; stem URLs still fail below.
  assert.equal(choose([row({ is_stem_extracted: true })]).audioUrl, stable)
  for (const flag of ['isViral', 'isViralTrack', 'isPreview', 'previewOnly', 'isSample', 'sampleOnly',
    'isTest', 'is_test', 'testOnly', 'test_only', 'testMode', 'isStem', 'stemOnly', 'externalStemUpload']) {
    assert.equal(choose([row({}, { [flag]: true })]), null)
  }
  for (const metadata of [{ requestedDurationSource: 'short-form-request' }, { requestedDurationMode: 'short-form' },
    { petEpisode: {} }, { storyPlan: {} }, { kind: 'preview' }, { type: 'test' }]) assert.equal(choose([row({}, metadata)]), null)
})

test('audio URLs are trusted full audio, unexpired, and durable storage is preferred', () => {
  for (const value of ['data:audio/fake', 'javascript:offline', '/local.mp3', 'http://cdn.suno.ai/audio.mp3',
    'https://user:password@cdn.suno.ai/audio.mp3', 'https://localhost/audio.mp3', 'https://127.0.0.1/audio.mp3',
    'https://cdn.suno.ai.evil.invalid/audio.mp3', 'https://untrusted.invalid/audio.mp3',
    `${own}/storage/v1/object/private/melodio-assets/audio.mp3`, `${own}/storage/v1/object/public/melodio-assets/image.png`,
    `${own}/storage/v1/object/public/melodio-assets/stems/id/original/vocals.wav`,
    `${own}/storage/v1/object/public/melodio-assets/%70review/voice.m4a`,
    'https://cdn.suno.ai/audio.mp3?Signature=offline&Expires=1',
    'https://cdn.suno.ai/audio.mp3?X-Amz-Date=20200101T000000Z&X-Amz-Expires=60']) assert.equal(safeUrl(value, own, now), null)
  assert.equal(safeUrl(stable, own, now), stable)
  assert.equal(safeUrl('https://cdn.suno.ai/audio.mp3?Expires=9999999999', own, now), 'https://cdn.suno.ai/audio.mp3?Expires=9999999999')
  assert.equal(choose([row({ audio_url: 'https://cdn.suno.ai/audio.mp3', source_audio_url: stable })]).audioUrl, stable)
  assert.equal(choose([row({ audio_url: 'https://cdn.suno.ai/audio.mp3?Expires=1', source_audio_url: stable })]).audioUrl, stable)
  assert.equal(choose([row({ audio_url: null }, { audioPersistence: { status: 'ready', generationId: 'track-a', selectedClipKey: 'selected',
    clips: [{ status: 'ready', clipKey: 'selected', audioUrl: stable }, { status: 'ready', clipKey: 'other', audioUrl: laterStable }] } })]).audioUrl, stable)
  assert.equal(choose([row({ audio_url: null }, { audioPersistence: { status: 'ready', generationId: 'different', selectedClipKey: 'selected',
    clips: [{ status: 'ready', clipKey: 'selected', audioUrl: stable }] } })]), null)
})

test('sample projection contains only the public player fields', () => {
  const selected = choose([row({ user_id: 'private-owner', title: '  Actual title  ' }, { lyricsPrompt: 'private text',
    selections: { secret: true }, audioPersistence: { privateReceipt: 'private-manifest' } })])
  assert.deepEqual(Object.keys(selected).sort(), ['audioUrl', 'createdAt', 'duration', 'id', 'isInstrumental', 'title'].sort())
  assert.equal(selected.title, 'Actual title')
  assert.ok(!JSON.stringify(selected).includes('private'))
})

function routeFixture(options = {}) {
  const calls = [], pages = [], active = { current: 0, maximum: 0 }
  const client = { from(table) {
    const call = { table, eq: [], order: [] }
    calls.push(call)
    const query = {
      select(value) { call.fields = value; return query },
      eq(field, value) { call.eq.push([field, value]); return query },
      like(field, value) { call.like = [field, value]; return query },
      or(value) { call.or = value; return query },
      order(field, value) { call.order.push([field, value]); return query },
      range(start, end) { call.range = [start, end]; return query },
      abortSignal(signal) { call.signal = signal; return query },
      async then(resolve) {
        active.current++; active.maximum = Math.max(active.maximum, active.current)
        await new Promise(resolve => setImmediate(resolve))
        const result = options.respond ? options.respond(call) : { data: options.rows || [], error: null }
        active.current--; pages.push(result)
        return resolve(result)
      },
    }
    return query
  } }
  const { GET } = load('src/app/api/presets/samples/route.ts', {
    '@supabase/supabase-js': { createClient() { return client } }, '@/lib/preset-samples': samples,
    '@/lib/preset-catalog': load('src/lib/preset-catalog.ts'),
  })
  return { GET, calls, pages, active }
}

async function withConfig(work) {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = own; process.env.SUPABASE_SERVICE_ROLE_KEY = 'offline-key'
  try { return await work() } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey
  }
}
const url = (entries = [request], sourceMenu = 'japan') => `https://app.invalid/api/presets/samples?${new URLSearchParams({ sourceMenu, presets: JSON.stringify(entries) })}`

test('API is read-only, validates before querying, filters strictly public, and redacts metadata', async () => withConfig(async () => {
  const fixture = routeFixture({ rows: [row()] })
  const invalid = await fixture.GET(new Request(url([{ id: 'unsafe,id', isInstrumental: false }])))
  assert.equal(invalid.status, 400); assert.equal(fixture.calls.length, 0)
  const response = await fixture.GET(new Request(url()))
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual((await response.json()).samples[request.id], choose([row()]))
  assert.deepEqual(fixture.calls[0].eq, [['status', 'completed'], ['is_public', true]])
  assert.deepEqual(fixture.calls[0].order, [['created_at', { ascending: false }], ['id', { ascending: false }]])
  assert.equal(fixture.calls[0].fields.includes('user_id'), false)
  assert.equal(fixture.calls[0].signal instanceof AbortSignal, true)
}))

test('API scans older candidates, separates missing/error/scan bounds, and shares alias lookups', async () => withConfig(async () => {
  const rejectedPage = Array.from({ length: 50 }, (_, i) => row({ id: `rejected-${i}` }, { isTest: true }))
  const older = routeFixture({ respond: call => ({ data: call.range[0] === 0 ? rejectedPage : [row()], error: null }) })
  assert.equal((await (await older.GET(new Request(url()))).json()).samples[request.id].id, 'track-a')
  assert.equal(older.calls.length, 2)
  const empty = routeFixture()
  assert.deepEqual(await (await empty.GET(new Request(url()))).json(), { samples: { [request.id]: null }, errors: {} })
  const failed = routeFixture({ respond: () => ({ data: null, error: { message: 'private provider response' } }) })
  assert.deepEqual(await (await failed.GET(new Request(url()))).json(), { samples: { [request.id]: null }, errors: { [request.id]: 'query_failed' } })
  const bounded = routeFixture({ rows: rejectedPage })
  assert.deepEqual((await (await bounded.GET(new Request(url()))).json()).errors, { [request.id]: 'scan_limit' })
  assert.equal(bounded.calls.length, 4)
  const aliases = routeFixture({ rows: [row({}, { presetId: 'grunge' })] })
  const response = await aliases.GET(new Request(url([{ id: 'grunge', isInstrumental: false }, { id: 'grunge_seattle', isInstrumental: false }])))
  const projected = await response.json()
  assert.equal(aliases.calls.length, 1)
  assert.equal(projected.samples.grunge.id, projected.samples.grunge_seattle.id)
}))

test('API concurrency stays at four and absent configuration is not reported as missing', async () => withConfig(async () => {
  const fixture = routeFixture()
  const response = await fixture.GET(new Request(url(Array.from({ length: 24 }, (_, i) => ({ id: `preset-${i}`, isInstrumental: false })))))
  assert.equal(response.status, 200); assert.equal(fixture.calls.length, 24); assert.equal(fixture.active.maximum, 4)
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  const unavailable = await fixture.GET(new Request(url()))
  assert.equal(unavailable.status, 503); assert.deepEqual(await unavailable.json(), { error: 'samples_unavailable' })
}))
