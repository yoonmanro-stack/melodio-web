/**
 * Offline regression for the eight web paths affected by the legacy-provider stop.
 * Every network, auth, and persistence surface is replaced with an in-memory fake.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const responseModule = {
  NextResponse: {
    json(body, options = {}) {
      return { body, status: options.status ?? 200, async json() { return body } }
    },
  },
}

function createProbe() {
  const probe = { fetches: [], authCalls: 0, storeCalls: [] }
  probe.fetch = async (input) => {
    probe.fetches.push(String(input))
    throw new Error('Network access is forbidden in this regression')
  }

  const publishPackage = {
    id: 'package-fixture', status: 'draft', upload_title: 'Fixture', description: '',
    tracklist_text: '', tags: [], hashtags: [], audio_url: 'https://fixture.invalid/audio.mp3',
    cover_prompt: 'A square fixture cover', selected_cover_asset_id: null,
  }
  function query(table) {
    const chain = {
      select() { probe.storeCalls.push([table, 'select']); return chain },
      eq() { return chain }, or() { return chain }, order() { return Promise.resolve({ data: [], error: null }) },
      limit() { return chain }, lte() { return chain },
      single() { return Promise.resolve({ data: null, error: null }) },
      maybeSingle() {
        return Promise.resolve({ data: table === 'episode_publish_packages' ? publishPackage : null, error: null })
      },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject) },
    }
    return chain
  }
  probe.client = {
    auth: {
      async getUser() {
        probe.authCalls += 1
        return { data: { user: { id: 'user-fixture' } }, error: null }
      },
    },
    from(table) { probe.storeCalls.push([table, 'from']); return query(table) },
  }
  return probe
}

function compile(relativeFile) {
  const filename = path.join(root, relativeFile)
  const source = fs.readFileSync(filename, 'utf8')
  return ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
}

function load(relativeFile, { env = {}, modules = {}, fetch } = {}) {
  const module = { exports: {} }
  const sandbox = {
    module,
    exports: module.exports,
    require(name) {
      if (Object.prototype.hasOwnProperty.call(modules, name)) return modules[name]
      if (name.startsWith('node:')) return require(name)
      throw new Error(`Unexpected module in offline route test: ${name}`)
    },
    process: { env: { ...env } },
    fetch: fetch || (async () => { throw new Error('Missing fetch probe') }),
    console: { log() {}, warn() {}, error() {} },
    Buffer,
    URL,
    Date,
    Error,
    SyntaxError,
    TypeError,
    setTimeout,
    clearTimeout,
  }
  vm.runInNewContext(compile(relativeFile), sandbox, { filename: relativeFile })
  return module.exports
}

function request(body) {
  return { async json() { return body } }
}

const hardRoutes = [
  {
    name: 'autopilot image analysis',
    file: 'src/app/api/autopilot/analyze-image/route.ts',
    body: { images: ['https://fixture.invalid/reference.png'] },
  },
  {
    name: 'autopilot branding',
    file: 'src/app/api/autopilot/branding/route.ts',
    body: { channelName: 'Fixture channel' },
  },
  {
    name: 'autopilot image generation',
    file: 'src/app/api/autopilot/generate-image/route.ts',
    body: { prompt: 'A valid fixture image prompt' },
    needsAuth: true,
  },
  {
    name: 'style-library image analysis',
    file: 'src/app/api/style-library/analyze-image/route.ts',
    body: { conceptName: 'Fixture concept', locale: 'en' },
  },
]

function hardRouteHandler(contract, env, probe) {
  const modules = { 'next/server': responseModule }
  if (contract.needsAuth) {
    modules['@/lib/supabase/server'] = { createClient: async () => probe.client }
  }
  return load(contract.file, { env, modules, fetch: probe.fetch }).POST
}

class ChannelSystemAuthenticationError extends Error {}
class ChannelSystemPersistenceError extends Error {
  constructor(message, causeCode) { super(message); this.causeCode = causeCode }
}
class ChannelDnaMutationError extends Error {}
class ChannelBuilderInputError extends Error {}
class EpisodeTitleConflictError extends Error {}

function publishCoverHandler(env, probe) {
  const service = load('src/lib/channel-system/publish-package-service.ts', {
    env,
    fetch: probe.fetch,
    modules: {
      'server-only': {},
      '../supabase/server': { createClient: async () => probe.client },
      './channel-builder-service': {
        ChannelSystemAuthenticationError,
        ChannelSystemPersistenceError,
      },
      './episode-assembly-service': {
        createEpisodeAssemblyService: () => ({ getContext: async () => ({ assembly: null, queue: null }) }),
      },
      './publish-package-compiler': { compilePublishPackage() { throw new Error('Unexpected compiler call') } },
    },
  })
  const errors = load('src/lib/channel-system/channel-builder-errors.ts', {
    env,
    fetch: probe.fetch,
    modules: {
      './channel-builder-service': {
        ChannelDnaMutationError,
        ChannelSystemAuthenticationError,
        ChannelSystemPersistenceError,
      },
      './channel-builder-input': { ChannelBuilderInputError },
      './episode-blueprint-service': { EpisodeTitleConflictError },
    },
  })
  return load('src/app/api/channel-builder/[channelId]/episodes/[episodeId]/publish-package/cover/generate/route.ts', {
    env,
    fetch: probe.fetch,
    modules: {
      'next/server': responseModule,
      '@/lib/channel-system/channel-builder-errors': errors,
      '@/lib/channel-system/channel-builder-input': { parseUuid: value => value },
      '@/lib/channel-system/publish-package-service': service,
    },
  }).POST
}

for (const sunoConfigured of [false, true]) {
  const keyState = sunoConfigured ? 'SUNO key present' : 'SUNO key absent'
  const env = {
    OPENAI_API_KEY: 'fixture-openai-key',
    ...(sunoConfigured ? { SUNO_API_KEY: 'fixture-suno-key' } : {}),
  }
  for (const contract of hardRoutes) {
    test(`${contract.name}: 503 and zero provider fetches with ${keyState}`, async () => {
      const probe = createProbe()
      const handler = hardRouteHandler(contract, env, probe)
      const result = await handler(request(contract.body))
      assert.equal(result.status, 503)
      assert.equal(result.body.code, 'PROVIDER_TRANSITION')
      assert.equal(probe.fetches.length, 0)
    })
  }
  test(`publish cover: 503 and zero provider fetches with ${keyState}`, async () => {
    const probe = createProbe()
    const handler = publishCoverHandler(env, probe)
    const result = await handler(request({}), {
      params: Promise.resolve({ channelId: 'channel-fixture', episodeId: 'episode-fixture' }),
    })
    assert.equal(result.status, 503)
    assert.match(String(result.body.error), /공급자 전환/u)
    assert.equal(probe.fetches.length, 0)
  })
}

function lyricsHandler(env, probe) {
  const knowledge = {
    getPlaybookByKey: async () => null,
    matchPlaybooksByPrompt: async () => [],
    matchEpisodesByCategoryAndTopic: async () => [],
  }
  const engine = load('src/lib/engines/lyrics-generator.ts', {
    env,
    fetch: probe.fetch,
    modules: {
      '@/lib/db/knowledge': knowledge,
      '@/lib/engines/infinite-story-matrix': {
        generateBoundlessCreativeVector: () => ({
          uniqueEntropySeed: 'fixture', perspectiveType: 'fixture', thematicDimension: 'fixture', sensoryFocus: 'fixture',
        }),
      },
      '@/lib/vle/vleEngine': { loadVLEMasterPrompt: () => '' },
      '@/lib/vle/viralSongSpec': { buildStructureDirective: () => '', VIRAL_SONG_SPEC: {} },
    },
  })
  return load('src/app/api/lyrics/generate/route.ts', {
    env,
    fetch: probe.fetch,
    modules: {
      'next/server': responseModule,
      '@/lib/engines/lyrics-generator': engine,
    },
  }).POST
}

function promptOptimizeHandler(env, probe) {
  return load('src/app/api/prompt-optimize/route.ts', {
    env,
    fetch: probe.fetch,
    modules: {
      'next/server': responseModule,
      '@/lib/supabase/server': { createClient: async () => probe.client },
    },
  }).POST
}

function grokPromptHandler(env, probe) {
  const matrix = {
    id: 'fixture', name: 'Fixture',
    videoDirective: {
      supporting: 'one fixture actor', coreObject: 'one prop on a table',
      action: 'one visible action', cameraLighting: 'fixed vertical camera',
    },
  }
  return load('src/app/api/viral-cf/grok-video/prompt/route.ts', {
    env,
    fetch: probe.fetch,
    modules: {
      'next/server': responseModule,
      '@/lib/vle/viralCategoryMatrix': {
        getCategoryMatrix: () => matrix,
        pickProtagonist: () => 'one fixture protagonist',
      },
      '@/lib/vle/viralCategorySpec': {
        getCategorySpec: () => null,
        buildVideoPromptV2: () => 'fixture',
        detectProtagonistTag: () => 'fixture',
        pickVisualVariation: () => ({}),
      },
    },
  }).POST
}

const textRoutes = [
  {
    name: 'lyrics generation',
    handler: lyricsHandler,
    body: { stylePrompt: 'Fixture pop', topic: 'Fixture topic' },
  },
  {
    name: 'prompt optimization',
    handler: promptOptimizeHandler,
    body: { prompt: 'Fixture pop', viralMode: true },
  },
  {
    name: 'Grok video prompt',
    handler: grokPromptHandler,
    body: { title: 'Fixture', lyrics: '한 줄의 검증 가사', category: 'fixture' },
  },
]

for (const contract of textRoutes) {
  test(`${contract.name}: SUNO gate fails closed before any provider fetch`, async () => {
    const probe = createProbe()
    const env = { SUNO_API_KEY: 'fixture-suno-key', OPENAI_API_KEY: 'fixture-openai-key' }
    const handler = contract.handler(env, probe)
    const result = await handler(request(contract.body))
    assert.ok(result.status >= 400 && result.status < 600, `expected failure status, received ${result.status}`)
    assert.notEqual(result.body.success, true)
    assert.match(String(result.body.error), /공급자 전환/u)
    assert.equal(probe.fetches.length, 0)
  })
}

test('the eight scoped runtime paths contain no legacy API endpoint', () => {
  const files = [
    ...hardRoutes.map(route => route.file),
    'src/app/api/channel-builder/[channelId]/episodes/[episodeId]/publish-package/cover/generate/route.ts',
    'src/lib/channel-system/publish-package-service.ts',
    'src/app/api/lyrics/generate/route.ts',
    'src/lib/engines/lyrics-generator.ts',
    'src/app/api/prompt-optimize/route.ts',
    'src/app/api/viral-cf/grok-video/prompt/route.ts',
  ]
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /api\.302\.ai|SUNO_API_URL/u, `${file} retains a legacy API endpoint`)
  }
  for (const file of [...hardRoutes.map(route => route.file), 'src/lib/channel-system/publish-package-service.ts']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    assert.doesNotMatch(source, /\bfetch\s*\(/u, `${file} must remain hard-disabled without a provider fetch path`)
  }
})
