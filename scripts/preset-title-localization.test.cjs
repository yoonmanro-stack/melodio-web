/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node test runner uses CommonJS. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const LANGUAGES = ['ko', 'en', 'ja', 'es', 'fr', 'de', 'pt', 'zh', 'it', 'hi']
const reviewed = Object.fromEntries(['ambient_pop', 'grunge_seattle', 'uk_grime', 'joseon-hiphop']
  .map(id => [id, Object.fromEntries(LANGUAGES.map(language => [language, `${language} reviewed ${id}`]))]))
const jsx = (type, props) => ({ type, props })
const walk = tree => Array.isArray(tree) ? tree.flatMap(walk) : !tree || typeof tree !== 'object' ? []
  : [tree, ...walk(tree.props?.children)]
const contents = tree => Array.isArray(tree) ? tree.map(contents).join('') : tree && typeof tree === 'object'
  ? contents(tree.props?.children) : String(tree ?? '')

function load(file, overrides = {}, cache = new Map()) {
  const absolute = path.resolve(file)
  if (cache.has(absolute)) return cache.get(absolute)
  const moduleObject = { exports: {} }
  cache.set(absolute, moduleObject.exports)
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  new Function('require', 'exports', 'module', code)(name => {
    if (name in overrides) return overrides[name]
    if (!name.startsWith('.') && !name.startsWith('@/')) throw new Error(`Unexpected dependency: ${name}`)
    const base = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(absolute), name)
    const filename = ['.ts', '.tsx', '.json', ''].map(extension => base + extension).find(candidate => fs.existsSync(candidate))
    if (!filename) throw new Error(`Missing local dependency: ${name}`)
    return filename.endsWith('.json') ? JSON.parse(fs.readFileSync(filename, 'utf8')) : load(filename, overrides, cache)
  }, moduleObject.exports, moduleObject)
  cache.set(absolute, moduleObject.exports)
  return moduleObject.exports
}

const localization = load('src/lib/preset-localization.ts', { '@/data/presetDisplayNames.json': reviewed })
const { getPresetDisplayName: displayName, localizePresetForDisplay: displayPreset } = localization
const sourcePreset = extra => ({ id: 'ambient_pop', name: 'Ambient Pop (앰비언트 팝)', desc: 'Author description',
  emoji: '🎵', gradient: '#444', customPrompt: 'Authored ambient recipe, 73 BPM',
  lyricsTemplate: '[Verse]\nOriginal lyrics', excludePrompt: 'no choir', selections: { mood: ['quiet'] },
  metadata: { name_en: 'Ambient Pop', isInstrumental: false }, ...extra })

test('missing requested locales resolve reviewed public names before English or bilingual base names', () => {
  const preset = sourcePreset()
  for (const language of LANGUAGES) assert.equal(displayName(preset, language), language === 'en' ? 'Ambient Pop' : reviewed.ambient_pop[language])
  const unknown = sourcePreset({ id: 'new-user-style', name: 'Authored name', metadata: { name_en: 'Different English field' } })
  assert.equal(displayName(unknown, 'ko'), 'Authored name')
  assert.equal(displayName(unknown, 'unsupported'), 'Authored name')
})

test('explicit requested-locale metadata and top-level edits retain precedence', () => {
  const preset = sourcePreset({ name_ko: 'Top-level 한국어', metadata: { name_ko: 'Edited 한국어', name_en: 'English' } })
  assert.equal(displayName(preset, 'ko'), 'Edited 한국어')
  assert.equal(displayName({ ...preset, metadata: { name_ko: '   ', name_en: 'English' } }, 'ko'), 'Top-level 한국어')
  assert.equal(displayName({ ...preset, name_ko: '', metadata: { name_en: 'English' } }, 'ko'), reviewed.ambient_pop.ko)
})

test('historical public aliases resolve the same reviewed title in every UI locale', () => {
  for (const [alias, canonical] of [['grunge', 'grunge_seattle'], ['grime', 'uk_grime'], ['joseon-hip-hop', 'joseon-hiphop']]) {
    for (const language of LANGUAGES) assert.equal(displayName(sourcePreset({ id: alias, metadata: {} }), language), reviewed[canonical][language])
  }
})

test('personal names survive unrelated English fields and public alias collisions', () => {
  for (const id of ['custom-original', 'ambient_pop', 'grime']) {
    const preset = sourcePreset({ id, name: 'My authored name', metadata: { name_en: 'A separate English version' } })
    assert.equal(displayName(preset, 'ko', { isCustom: true }), 'My authored name')
    assert.equal(displayName(preset, 'en', { isCustom: true }), 'A separate English version')
    assert.equal(displayName({ ...preset, isCustom: true }, 'ja'), 'My authored name')
  }
  assert.equal(displayName(sourcePreset({ id: 'custom-original', name: 'My original', metadata: { name_en: 'English' } }), 'ko'), 'My original')
})

test('display localization cannot mutate identity, authored names, recipes, lyrics, selections or metadata', () => {
  const preset = sourcePreset()
  Object.freeze(preset.selections); Object.freeze(preset.metadata); Object.freeze(preset)
  const before = JSON.stringify(preset)
  for (const language of LANGUAGES) {
    const localized = displayPreset(preset, language)
    assert.equal(localized.id, preset.id)
    for (const field of ['customPrompt', 'lyricsTemplate', 'excludePrompt', 'gradient', 'emoji']) assert.equal(localized[field], preset[field])
    assert.equal(localized.selections, preset.selections); assert.equal(localized.metadata, preset.metadata)
  }
  assert.equal(JSON.stringify(preset), before)
  const personal = sourcePreset({ isCustom: true, metadata: { name_en: 'Other title', desc_en: 'Other description' } })
  assert.equal(displayPreset(personal, 'ko').name, personal.name)
  assert.equal(displayPreset(personal, 'ko').desc, personal.desc)
})

function gridHarness(initialPreset = sourcePreset(), custom = false) {
  let language = 'ko', cursor = 0, sampleInputs = []
  const states = [], applied = [], edited = []
  const react = {
    useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
    useSyncExternalStore() { return '[]' },
  }
  const catalog = load('src/lib/preset-catalog.ts')
  const Grid = load('src/components/prompt-builder/PresetGrid.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': new Proxy({}, { get: (_value, name) => String(name) }),
    '@/data/presets': { presets: custom ? [] : [initialPreset] }, '@/lib/preset-localization': localization,
    '@/lib/preset-catalog': { ...catalog, mergePublicPresetCatalog(db, bundled) { return db.length ? db : bundled } },
    '@/lib/preset-thumbnail': { getPresetThumbnail() { return null }, getPresetUsageCount() { return null } },
    '@/contexts/LanguageContext': { useLanguage() { return { language } } },
    '@/components/presets/PresetSamples': { PresetSampleButton: 'PresetSampleButton', PresetSamplePlayer: 'PresetSamplePlayer',
      usePresetSamples(_source, presets) { sampleInputs = presets; return { current: null } } },
  }).default
  const props = { onApply(value) { applied.push(value) }, onEditPreset(value) { edited.push(value) },
    isPro: true, onOpenCreatePreset() {}, onOpenProPaywall() {}, customPresets: custom ? [initialPreset] : [], onDeletePreset() {} }
  return {
    render(locale) { language = locale; cursor = 0; return Grid(props) }, applied, edited,
    sampleInputs() { return sampleInputs },
  }
}

test('cards, artwork and search follow UI language while apply/edit/sample receive raw authored records', () => {
  const preset = sourcePreset({ metadata: {} })
  const harness = gridHarness(preset)
  for (const language of LANGUAGES) {
    const nodes = walk(harness.render(language))
    const title = nodes.find(node => node.type === 'h4')
    assert.equal(contents(title), reviewed.ambient_pop[language])
    assert.equal(title.props.title, reviewed.ambient_pop[language])
    const artwork = nodes.find(node => typeof node.type === 'function' && node.type.name === 'PresetArtwork')
    assert.equal(artwork.props.preset.name, reviewed.ambient_pop[language])
    const thumbnail = nodes.find(node => node.type === 'div' && node.props.className?.includes('aspect-[16/9]'))
    thumbnail.props.onClick()
    title.props.onClick()
    const sampleButton = nodes.find(node => node.type === 'PresetSampleButton')
    assert.equal(sampleButton.props.preset.name, preset.name)
    assert.equal(harness.sampleInputs()[0].name, preset.name)
  }
  for (const received of [...harness.applied, ...harness.edited]) {
    assert.equal(received.name, preset.name); assert.equal(received.customPrompt, preset.customPrompt)
    assert.equal(received.lyricsTemplate, preset.lyricsTemplate); assert.equal(received.selections, preset.selections)
  }
  const nodes = walk(harness.render('ko'))
  const search = nodes.find(node => node.type === 'input' && node.props.placeholder === '컨셉, 제목, 태그 검색...')
  search.props.onChange({ target: { value: reviewed.ambient_pop.ko } })
  assert.equal(walk(harness.render('ko')).filter(node => node.type === 'h4').length, 1)
  assert.equal(walk(harness.render('ja')).filter(node => node.type === 'h4').length, 0)
})

test('personal cards never borrow a reviewed public title when author IDs collide', () => {
  const preset = sourcePreset({ name: 'My private concept', metadata: { name_en: 'Private English' } })
  const harness = gridHarness(preset, true)
  assert.equal(contents(walk(harness.render('ko')).find(node => node.type === 'h4')), 'My private concept')
  assert.equal(contents(walk(harness.render('en')).find(node => node.type === 'h4')), 'Private English')
})

function expression(file, variable) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  let found
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === variable) found = node.initializer?.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(found, `${variable} exists in ${file}`)
  return found
}

test('selected and detail titles recompute from the same UI locale without applying music settings again', () => {
  const selectedExpression = expression('src/components/prompt-builder/PresetStudioBuilder.tsx', 'selectedPresetName')
  const selected = new Function('selectedStudioPreset', 'language', 'customPresets', 'getPresetDisplayName',
    'selectedPresetAuthoredName', `return (${selectedExpression})`)
  const modalExpression = expression('src/components/prompt-builder/CreatePresetModal.tsx', 'display')
  const detail = new Function('editingPreset', 'language', 'isPersonalPreset', 'layoutType', 'localizePresetForDisplay',
    'meta', `return (${modalExpression})`)
  const preset = sourcePreset({ metadata: {} })
  const before = JSON.stringify(preset)
  for (const language of LANGUAGES) {
    assert.equal(selected(preset, language, [], displayName, 'Old snapshot'), displayName(preset, language))
    assert.equal(detail(preset, language, false, 'general', displayPreset, preset.metadata).name, displayName(preset, language))
  }
  assert.equal(selected(preset, 'ko', [preset], displayName, ''), preset.name)
  assert.equal(detail(preset, 'ko', true, 'general', displayPreset, preset.metadata).name, preset.name)
  assert.equal(JSON.stringify(preset), before)
  assert.equal(selected(null, 'ko', [], displayName, 'Authored temporary preset'), 'Authored temporary preset')
})

test('reviewed catalog includes a nonempty title in all ten locales for every authored public entry', () => {
  const filename = 'src/data/presetDisplayNames.json'
  assert.ok(fs.existsSync(filename), 'Reviewed title table must ship with the helper')
  const data = JSON.parse(fs.readFileSync(filename, 'utf8'))
  const inventory = JSON.parse(fs.readFileSync('scripts/fixtures/preset-display-title-keys-20261006.json', 'utf8'))
  assert.equal(inventory.version, 1)
  assert.equal(inventory.count, inventory.presetIds.length)
  assert.deepEqual(inventory.locales.slice().sort(), [...LANGUAGES].sort())
  assert.deepEqual(Object.keys(data).sort(), inventory.presetIds.slice().sort(), 'Reviewed titles cover every audited canonical ID')
  const intendedScript = { ko: /[\uac00-\ud7a3]/u, ja: /[\u3040-\u30ff\u3400-\u9fff]/u,
    zh: /[\u3400-\u9fff]/u, hi: /[\u0900-\u097f]/u }
  const shortBrand = /^(?:EDM|IDM|R&B|K[- ]?Pop|J[- ]?Pop|K[- ]?Indie|ASMR)$/i
  for (const [id, localized] of Object.entries(data)) {
    assert.deepEqual(Object.keys(localized).sort(), [...LANGUAGES].sort(), `${id} has exactly the supported locales`)
    for (const language of LANGUAGES) assert.ok(typeof localized[language] === 'string' && localized[language].trim(), `${id}:${language}`)
    for (const [language, script] of Object.entries(intendedScript)) {
      assert.ok(script.test(localized[language]) || shortBrand.test(localized[language].trim()), `${id}:${language} uses the intended writing system or a reviewed short brand`)
    }
  }
})
