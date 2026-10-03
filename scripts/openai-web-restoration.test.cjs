/* Offline behavioral contract: real route logic, mocked network/auth/storage. No provider calls. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const CHAT = 'https://api.openai.com/v1/chat/completions'
const IMAGE = 'https://api.openai.com/v1/images/generations'
const KEY = 'fixture-openai-key'
const imageBytes = Buffer.from('offline-image-fixture')
const authUser = { id: 'fixture-user' }
const responseModule = { NextResponse: { json(body, options = {}) { return { body, status: options.status ?? 200 } } } }
class ChannelSystemAuthenticationError extends Error {}
class ChannelSystemPersistenceError extends Error { constructor(message, causeCode) { super(message); this.causeCode = causeCode } }
class ChannelDnaMutationError extends Error {}
class ChannelBuilderInputError extends Error {}
class EpisodeTitleConflictError extends Error {}
function load(file, probe, extra = {}) {
  const filename = path.join(root, file)
  const module = { exports: {} }
  const modules = {
    'server-only': {}, 'next/server': responseModule,
    '@/data/presets': { presets: [{ id: 'fixture', name: 'Fixture', desc: 'Calm instrumental piano', tags: [] }] },
    '@/lib/supabase/server': { createClient: async () => probe.client },
    '../supabase/server': { createClient: async () => probe.client },
    '@supabase/supabase-js': { createClient: () => probe.client },
    '@/lib/db/knowledge': { getPlaybookByKey: async () => null, matchPlaybooksByPrompt: async () => [], matchEpisodesByCategoryAndTopic: async () => [] },
    '@/lib/engines/infinite-story-matrix': { generateBoundlessCreativeVector: () => ({ uniqueEntropySeed: 'fixture', perspectiveType: 'fixture', thematicDimension: 'fixture', sensoryFocus: 'fixture' }) },
    '@/lib/vle/vleEngine': { loadVLEMasterPrompt: () => '' },
    '@/lib/vle/viralSongSpec': { buildStructureDirective: () => '', VIRAL_SONG_SPEC: {} },
    './channel-builder-service': { ChannelSystemAuthenticationError, ChannelSystemPersistenceError, ChannelDnaMutationError },
    './channel-builder-input': { ChannelBuilderInputError },
    './episode-blueprint-service': { EpisodeTitleConflictError },
    './episode-assembly-service': { createEpisodeAssemblyService: () => ({ getContext: async () => ({ assembly: null, queue: null }) }) },
    './publish-package-compiler': { compilePublishPackage() { throw new Error('Unexpected compiler call') } },
    '@/lib/vle/viralCategoryMatrix': {
      getCategoryMatrix: () => ({ id: 'fixture', name: 'Fixture', videoDirective: { supporting: 'one actor', coreObject: 'one cup', action: 'one action', cameraLighting: 'fixed camera' } }),
      pickProtagonist: () => 'one protagonist',
    },
    '@/lib/vle/viralCategorySpec': { getCategorySpec: () => probe.v2 ? { visualGuide: { allowDance: false } } : null, buildVideoPromptV2: (_spec, data) => `V2 ${data.sceneBeats.join(', ')}`, detectProtagonistTag: () => 'fixture', pickVisualVariation: () => ({}) },
    ...extra,
  }
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(name) { if (Object.hasOwn(modules, name)) return modules[name]; if (name.startsWith('node:')) return require(name); throw new Error(`Unmocked module: ${name}`) },
    process: { env: probe.env }, fetch: probe.fetch, console: { log() {}, warn(...args) { probe.logs.push(args.join(' ')) }, error(...args) { probe.logs.push(args.join(' ')) } },
    Buffer, URL, Date, Error, SyntaxError, TypeError, AbortSignal, AbortController, setTimeout: fn => { fn(); return 0 }, clearTimeout() {},
  }, { filename })
  return module.exports
}
function createProbe({ content = 'Fixture content', status = 200, rejectModels = [], env = {}, user = authUser, v2 = false } = {}) {
  const probe = { fetches: [], logs: [], uploads: [], updates: [], authCalls: 0, v2, env: { OPENAI_API_KEY: KEY, NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key', ...env } }
  const pack = { id: 'fixture-package', status: 'draft', upload_title: 'Fixture', description: '', tracklist_text: '', tags: [], hashtags: [], audio_url: 'https://fixture.invalid/audio.mp3', cover_prompt: 'One square cover', selected_cover_asset_id: null }
  const asset = { id: 'fixture-asset', status: 'generating', source: 'ai', prompt: pack.cover_prompt }
  function query(table) {
    const chain = {
      select() { return chain }, eq() { return chain }, or() { return chain }, limit() { return chain }, lte() { return chain },
      insert(value) { Object.assign(asset, value); return chain },
      update(value) { probe.updates.push(value); Object.assign(asset, value); return chain },
      order: async () => ({ data: [], error: null }),
      single: async () => ({ data: table === 'episode_cover_assets' ? asset : null, error: null }),
      maybeSingle: async () => ({ data: table === 'episode_publish_packages' ? pack : null, error: null }),
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject) },
    }; return chain
  }
  probe.client = {
    auth: { async getUser() { probe.authCalls++; return { data: { user }, error: null } } }, from: query,
    storage: { from: () => ({ async upload(location, bytes, options) { probe.uploads.push({ location, bytes, options }); return { error: null } }, getPublicUrl(location) { return { data: { publicUrl: `https://fixture.invalid/${location}` } } } }) },
  }
  probe.fetch = async (url, options = {}) => {
    assert.ok(url === CHAT || url === IMAGE, 'Only official OpenAI endpoints may be called')
    const body = JSON.parse(options.body)
    probe.fetches.push({ url, method: options.method, headers: options.headers, body })
    const httpStatus = rejectModels.includes(body.model) ? 403 : status
    return { ok: httpStatus === 200, status: httpStatus,
      async json() { return url === IMAGE ? { data: [{ b64_json: imageBytes.toString('base64') }] } : { model: body.model, usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 }, choices: [{ finish_reason: 'stop', message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] } },
      async text() { return 'PRIVATE_PROVIDER_BODY_MUST_NOT_LEAK' },
    }
  }
  return probe
}
const request = body => ({ async json() { return body } })
const contracts = [
  { name: 'autopilot analysis', file: 'src/app/api/autopilot/analyze-image/route.ts', body: { images: ['https://fixture.invalid/reference.png'] }, content: 'A calm natural room', firstModel: 'gpt-5.6-sol', check: r => assert.equal(r.body.prompt, 'A calm natural room') },
  { name: 'branding', file: 'src/app/api/autopilot/branding/route.ts', body: { presetId: 'fixture', customName: 'Fixture' }, content: { names: [{ candidates: [{ name: 'Fixture Brand' }] }] }, firstModel: 'gpt-5.6-sol', check: r => assert.equal(r.body.names[0].candidates[0].name, 'Fixture Brand') },
  { name: 'image generation', file: 'src/app/api/autopilot/generate-image/route.ts', body: { prompt: 'One calm landscape', count: 1, imageType: 'thumbnail', size: '16:9' }, image: true, firstModel: 'gpt-image-2', check: r => { assert.equal(r.body.success, true); assert.match(r.body.imageUrl, /^https:\/\/fixture\.invalid\//) } },
  { name: 'style analysis', file: 'src/app/api/style-library/analyze-image/route.ts', body: { conceptName: 'Fixture', locale: 'en' }, content: { name: 'Fixture Preset', prompt: 'Calm piano' }, firstModel: 'gpt-5.6-sol', check: r => assert.equal(r.body.preset.name, 'Fixture Preset') },
  { name: 'lyrics', file: 'src/lib/engines/lyrics-generator.ts', body: { stylePrompt: 'Fixture pop', topic: 'Fixture topic' }, content: { title: 'Fixture Song', sections: [{ type: 'verse', content: 'A simple fixture lyric' }] }, firstModel: 'gpt-5.6-sol', check: r => assert.equal(r.body.title, 'Fixture Song') },
  { name: 'prompt optimization', file: 'src/app/api/prompt-optimize/route.ts', body: { prompt: 'Fixture pop', viralMode: true }, content: 'One concise optimized prompt', firstModel: 'gpt-5.6-sol', check: r => assert.equal(r.body.optimized, 'One concise optimized prompt') },
  { name: 'Grok prompt', file: 'src/app/api/viral-cf/grok-video/prompt/route.ts', body: { title: 'Fixture', lyrics: 'One fixture lyric', category: 'fixture' }, content: 'One natural scene prompt', firstModel: 'gpt-5.6-sol', check: r => assert.equal(r.body.prompt, 'One natural scene prompt') },
  { name: 'YouTube trends', file: 'src/app/api/youtube/route.ts', action: 'analyze_trends', body: { keyword: 'Fixture', videos: [] }, content: { musicStyle: 'Fixture grounded style' }, firstModel: 'gpt-5.6-sol', check: r => assert.equal(r.body.musicStyle, 'Fixture grounded style') },
  { name: 'YouTube comments', file: 'src/app/api/youtube/route.ts', action: 'analyze_comments', body: { comments: ['Fixture comment'] }, content: { moodSummary: 'Fixture reaction' }, firstModel: 'gpt-5.6-sol', check: r => { assert.equal(r.body.success, true); assert.equal(r.body.analysis.moodSummary, 'Fixture reaction') } },
  { name: 'publish cover', file: 'src/lib/channel-system/publish-package-service.ts', body: {}, image: true, firstModel: 'gpt-image-2', check: r => { assert.equal(r.body.status, 'ready'); assert.match(r.body.imageUrl, /^https:\/\/fixture\.invalid\//) } },
]
async function invoke(contract, probe, body = contract.body) {
  const mod = load(contract.file, probe)
  if (contract.name === 'lyrics') {
    const route = load('src/app/api/lyrics/generate/route.ts', probe, { '@/lib/engines/lyrics-generator': mod })
    return route.POST(request(body))
  }
  if (contract.name === 'publish cover') {
    try { return { status: 200, body: await mod.createPublishPackageService(probe.client).generateCover('fixture-channel', 'fixture-episode') } }
    catch(error) { return load('src/lib/channel-system/channel-builder-errors.ts', probe).mapChannelBuilderError(error) }
  }
  return mod.POST({ ...request(body), url: `https://fixture.invalid/api?action=${contract.action || ''}` })
}
function verifyRequests(contract, probe) {
  assert.ok(probe.fetches.length > 0, 'The restored function must call its provider')
  for (const call of probe.fetches) {
    assert.equal(call.url, contract.image ? IMAGE : CHAT)
    assert.equal(call.method, 'POST')
    assert.equal(call.headers.Authorization, `Bearer ${KEY}`)
    if (contract.image) { assert.equal(call.body.model, 'gpt-image-2'); assert.equal(call.body.output_format, 'png'); assert.equal(call.body.response_format, undefined); assert.equal(call.body.n, 1) }
    if (!contract.image) {
      assert.equal(call.body.model, 'gpt-5.6-sol')
      assert.equal(call.body.reasoning_effort, ['branding', 'lyrics', 'YouTube trends', 'YouTube comments', 'producer brief'].includes(contract.name) ? 'high' : 'low')
      assert.ok(call.body.max_completion_tokens >= 4096, 'Completion budget must include reasoning headroom')
      for (const field of ['temperature', 'top_p', 'max_tokens', 'presence_penalty', 'frequency_penalty']) assert.equal(call.body[field], undefined, `Unsupported ${field} in Sol request`)
    }
  }
}
for (const contract of contracts) {
  for (const legacyKey of [false, true]) {
    test(`${contract.name}: successful official response, legacy key ${legacyKey ? 'present' : 'absent'}`, async () => {
      const probe = createProbe({ content: contract.content, env: legacyKey ? { SUNO_API_KEY: 'fixture-legacy-key', SUNO_API_URL: 'https://legacy.invalid' } : {} })
      const result = await invoke(contract, probe)
      assert.equal(result.status, 200, JSON.stringify(result.body || result.payload))
      contract.check(result)
      verifyRequests(contract, probe)
      assert.equal(probe.fetches[0].body.model, contract.firstModel)
      if (contract.image) { assert.equal(probe.uploads.length, 1); assert.equal(probe.uploads[0].bytes.equals(imageBytes), true); assert.equal(probe.uploads[0].options.contentType, 'image/png') }
    })
  }
  test(`${contract.name}: legacy credential alone never causes provider egress`, async () => {
    const probe = createProbe({ env: { OPENAI_API_KEY: '', SUNO_API_KEY: 'fixture-legacy-key', SUNO_API_URL: 'https://legacy.invalid' } })
    await invoke(contract, probe)
    assert.equal(probe.fetches.length, 0)
  })
}
for (const contract of contracts.filter(c => !c.image)) {
  test(`${contract.name}: provider rejection returns failure without downgrade or fabricated success`, async () => {
    const probe = createProbe({ content: contract.content, rejectModels: ['gpt-5.6-sol'] })
    const result = await invoke(contract, probe)
    assert.ok(result.status >= 400, 'A rejected provider request must not appear successful')
    verifyRequests(contract, probe)
    assert.deepEqual(probe.fetches.map(f => f.body.model), ['gpt-5.6-sol'])
    assert.equal(probe.logs.some(s => s.includes('PRIVATE_PROVIDER_BODY_MUST_NOT_LEAK')), false)
  })
}
for (const name of ['image generation', 'publish cover']) {
  const contract = contracts.find(c => c.name === name)
  test(`${name}: unauthenticated requests make no provider/storage writes`, async () => {
    const probe = createProbe({ user: null })
    const result = await invoke(contract, probe)
    assert.equal(result.status, 401)
    assert.equal(probe.fetches.length, 0)
    assert.equal(probe.uploads.length, 0)
    assert.equal(probe.updates.length, 0)
  })
  test(`${name}: HTTP429 failure is compact and does not upload`, async () => {
    const probe = createProbe({ status: 429 })
    const result = await invoke(contract, probe)
    assert.equal(result.status, 500)
    assert.match(JSON.stringify(result.body || result.payload), /HTTP 429/)
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PROVIDER_BODY/)
    assert.equal(probe.uploads.length, 0)
    if (name === 'publish cover') assert.equal(probe.updates.at(-1).status, 'failed')
  })
}
test('Grok V2 scene extraction also uses fixed Sol and the official key', async () => {
  const contract = contracts.find(c => c.name === 'Grok prompt')
  const probe = createProbe({ v2: true, content: { beats: ['First beat', 'Second beat'], coreObject: 'cup' } })
  const result = await invoke(contract, probe)
  assert.equal(result.status, 200)
  assert.deepEqual(Array.from(result.body.sceneBeats), ['First beat', 'Second beat'])
  verifyRequests(contract, probe)
  assert.equal(probe.fetches[0].body.model, 'gpt-5.6-sol')
})
test('scope contains no active proxy routing, unavailable model, or temporary provider stop', () => {
  for (const { file } of contracts) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /api\.302\.ai|SUNO_API_(?:KEY|URL)|PROVIDER_TRANSITION|['"]gpt-(?:5\.5|4o(?:-mini)?|5\.6-(?:terra|luna))['"]/)
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/lib/channel-system/channel-builder-errors.ts'), 'utf8'), /PROVIDER_TRANSITION/)
})

function producerRoute(probe) {
  const spec = {
    id: 'fixture', name: 'Fixture', definition: 'Fixture premise', hookPatterns: [], contentRule: {},
    targetAudience: { who: 'Fixture', platformBehavior: 'Fixture', vocabularyRegister: 'Fixture' },
    lyricRules: { rhyme: 'Fixture', persona: 'Fixture', mustInclude: [], memoryAnchorExamples: [] },
    forbidden: { lyric: [] }, audioDirective: { labelKo: 'Fixture', bpm: 90, vocalEn: 'Fixture', moodEn: 'Fixture' },
    goldenExample: { title: 'GOLDEN_EXAMPLE_MUST_NOT_REPLACE_FAILED_AI', lyricsStructure: { hook: ['sample'] } },
  }
  return load('src/app/api/viral-cf/producer-brief/route.ts', probe, {
    '@/lib/vle/petPlanner': {}, '@/lib/vle/trendFeed': { buildTrendDirective: () => '' },
    '@/lib/vle/viralCategorySpec': { getCategorySpec: () => spec, pickMemeTokenV2: () => '', buildStylePromptV2: () => 'Fixture', detectStyleConflicts: () => [] },
    '@/lib/vle/viralSongSpec': {
      buildStructureDirective: () => '', stripLeakedMetaTags: value => value,
      VIRAL_PART_SPECS: [{ lines: 4 }, { lines: 3 }],
      VIRAL_SONG_SPEC: { targetSecondsMin: 25, targetSecondsMax: 30, sungSyllablesMin: 80, sungSyllablesMax: 93 },
      enforceStructureBudget: structure => ({ structure, actions: [] }),
      validateStructure: () => ({ ok: true, sungSyllables: 85, estimatedSeconds: 28, issues: [] }),
      formatLyricsToSuno: structure => structure.hook.join('\n'),
    },
  })
}
test('producer brief V2 preserves its response contract with one high-effort Sol call', async () => {
  const probe = createProbe({ content: { title: 'Fixture generated title', lyricsStructure: { hook: ['Fixture hook'], verse: ['Fixture verse'] } } })
  const result = await producerRoute(probe).POST(request({ category: 'fixture' }))
  assert.equal(result.status, 200)
  assert.equal(result.body.brief.title, 'Fixture generated title')
  assert.equal(result.body.brief.specVersion, 'v2')
  assert.equal(probe.fetches.length, 1)
  verifyRequests({ name: 'producer brief' }, probe)
})
for (const condition of ['missing key', 'rejected request', 'malformed response', 'missing title']) {
  test(`producer brief V2 ${condition} does not substitute a successful golden example`, async () => {
    const probe = createProbe({ env: condition === 'missing key' ? { OPENAI_API_KEY: '' } : {}, status: condition === 'rejected request' ? 429 : 200, content: condition === 'missing title' ? { lyricsStructure: { hook: ['Fixture hook'] } } : 'not JSON' })
    const result = await producerRoute(probe).POST(request({ category: 'fixture' }))
    assert.ok(result.status >= 400)
    assert.equal(result.body.success, false)
    assert.doesNotMatch(JSON.stringify(result.body), /GOLDEN_EXAMPLE/)
    assert.deepEqual(probe.fetches.map(call => call.body.model), condition === 'missing key' ? [] : ['gpt-5.6-sol'])
    if (probe.fetches.length) verifyRequests({ name: 'producer brief' }, probe)
    assert.equal(probe.logs.some(log => log.includes('PRIVATE_PROVIDER_BODY_MUST_NOT_LEAK')), false)
  })
}
test('YouTube keyword cache remains explicitly identified when Sol is unavailable', async () => {
  const probe = createProbe({ status: 429, env: { YOUTUBE_API_KEY: 'fixture-youtube-key' } })
  const route = load('src/app/api/youtube/route.ts', probe)
  const result = await route.GET({ url: 'https://fixture.invalid/api?action=recommend_keywords&regionCode=KR' })
  assert.equal(result.status, 200)
  assert.equal(result.body.source, 'static-keywords')
  assert.equal(result.body.aiGenerated, false)
  assert.ok(Array.isArray(result.body.groups))
  verifyRequests({ name: 'YouTube trends' }, probe)
  assert.deepEqual(probe.fetches.map(call => call.body.model), ['gpt-5.6-sol'])
})
