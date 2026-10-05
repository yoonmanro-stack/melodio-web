/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS test runner */
/* Offline semantic checks for the audit's targeted creative-recipe repairs. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const filename = path.join(root, 'src/data/presetCatalogCorrections.ts')
const source = fs.readFileSync(filename, 'utf8')
const moduleProbe = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, {
  fileName: filename,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleProbe, exports: moduleProbe.exports }, { filename })
const corrections = moduleProbe.exports.presetCatalogCorrections
const plain = JSON.parse(JSON.stringify(corrections))
const expectedKeys = [
  'post_rock', 'synthpop_new_wave', 'joseon-hiphop', 'lofi-hiphop', 'pluggnb',
  'house_phonk', 'gypsy_jazz', 'chicago_house', 'quiet-forest-acoustic-guitar',
  'rock-ballad-for-one-true-love', 'dead-mall-nostalgia', 'traditional_trot',
  'joseon-hip-hop', 'deep-sleep-drift',
]
const categories = ['healing', 'focus', 'retro', 'cafe', 'drive', 'cinematic']

test('overlay remains JSON data limited to the 14 audited keys and creative fields', () => {
  assert.doesNotMatch(source, /^import\s/m)
  assert.deepEqual(Object.keys(plain).sort(), expectedKeys.toSorted())
  const rowFields = ['name', 'name_ko', 'name_en', 'name_ja', 'desc', 'desc_ko', 'desc_en', 'desc_ja', 'customPrompt', 'category', 'instrumentalOnly', 'metadata']
  const metadataFields = ['category', 'inferred_genre', 'bpm', 'bpm_range', 'instruments', 'vocal_style', 'instrumental_only']
  for (const [key, row] of Object.entries(plain)) {
    for (const field of Object.keys(row)) assert.ok(rowFields.includes(field), `${key}: unexpected ${field}`)
    for (const field of Object.keys(row.metadata)) assert.ok(metadataFields.includes(field), `${key}: unexpected metadata ${field}`)
    assert.equal(row.name, row.name_ko, key)
    assert.equal(row.desc, row.desc_ko, key)
    for (const locale of ['ko', 'en', 'ja']) {
      assert.ok(row[`name_${locale}`].length > 0 && row[`name_${locale}`].length <= 60, key)
      assert.ok(row[`desc_${locale}`].length > 0, key)
    }
    assert.ok(categories.includes(row.category), key)
    assert.equal(row.category, row.metadata.category, key)
    assert.equal(row.instrumentalOnly, row.metadata.instrumental_only, key)
  }
  assert.doesNotMatch(JSON.stringify(plain), /Zaytoven|Django|장고|BEST|verified|quality_passed|usage_count|popularity/i)
})

test('completed recipes state one tempo, rhythm, instruments and an arrangement within the style limit', () => {
  for (const [key, row] of Object.entries(plain)) {
    if (key === 'deep-sleep-drift') continue
    assert.ok(row.customPrompt.length <= 1000, `${key}: ${row.customPrompt.length} characters`)
    assert.match(row.customPrompt, new RegExp(`\\b${row.metadata.bpm} BPM\\b`), key)
    assert.equal(row.customPrompt.match(/\b\d+ BPM\b/g).length, 1, `${key}: conflicting tempo directives`)
    assert.match(row.customPrompt, /4\/4/i, key)
    assert.match(row.customPrompt, /intro(?:duction)?|opening/i, key)
    assert.match(row.customPrompt, /outro|ending/i, key)
    assert.ok(row.metadata.instruments.length > 0, key)
    assert.doesNotMatch(row.customPrompt, /negative filters|high.fidelity studio mastering|professional grade audio/i, key)
  }
})

test('existing tempo ranges survive the recipe repairs', () => {
  const ranges = {
    'joseon-hiphop': [85, 95], 'lofi-hiphop': [70, 85],
    'quiet-forest-acoustic-guitar': [70, 80],
    'rock-ballad-for-one-true-love': [70, 90], 'dead-mall-nostalgia': [125, 130],
  }
  for (const [key, [min, max]] of Object.entries(ranges)) {
    assert.ok(plain[key].metadata.bpm >= min && plain[key].metadata.bpm <= max, key)
    assert.equal(plain[key].metadata.bpm_range, `${min}-${max}`, key)
  }
})

test('instrumental intent and sleep duration correction cannot reintroduce lyrical vocals', () => {
  for (const key of ['post_rock', 'quiet-forest-acoustic-guitar']) {
    assert.equal(plain[key].instrumentalOnly, true)
    assert.match(plain[key].customPrompt, /no vocals (?:or|and no) spoken word/i)
    assert.doesNotMatch(plain[key].customPrompt, /expressive vocals|ethereal vocals|spoken-word elements/i)
  }
  const sleep = plain['deep-sleep-drift']
  assert.equal(sleep.instrumentalOnly, true)
  assert.equal(sleep.metadata.bpm, 45)
  assert.equal(sleep.customPrompt, undefined, 'sleep preserves the bundled recipe')
  assert.doesNotMatch([sleep.name_ko, sleep.name_en, sleep.name_ja].join(' '), /12|hour|時間|시간/i)
  assert.match(sleep.metadata.vocal_style, /wordless vocal chops only/)
})

test('each reported missing instrument or rhythm has an explicit musical role', () => {
  assert.match(plain['joseon-hiphop'].customPrompt, /swung kick.*snare.*hi-hats/i)
  assert.match(plain['joseon-hiphop'].customPrompt, /Korean rap verses.*melodic hook/i)
  assert.match(plain['lofi-hiphop'].customPrompt, /boom bap.*swung kick.*snare.*hi-hats/i)
  assert.match(plain.pluggnb.customPrompt, /rolling 808 bass.*pitch slides.*kick/i)
  assert.match(plain.house_phonk.customPrompt, /cowbell melody is the main hook/i)
  assert.equal(plain.house_phonk.name_en, 'House Phonk')
  assert.doesNotMatch(plain.house_phonk.desc_en, /Brazilian/i)
  assert.match(plain.gypsy_jazz.desc_ko, /중심.*클라리넷/)
  assert.match(plain.gypsy_jazz.customPrompt, /clarinet.*strings remain the core/i)
  assert.match(plain.chicago_house.customPrompt, /TR-707 drum machine supplies.*separate analog synthesizer plays.*bass line/i)
})

test('filter instructions separate low rumble from vocal sibilance and high-frequency harshness', () => {
  const synth = plain.synthpop_new_wave.customPrompt
  assert.match(synth, /high-pass non-bass tracks only to reduce low-end rumble/i)
  assert.match(synth, /de-essing for vocal sibilance/i)
  assert.match(synth, /targeted EQ for harsh upper frequencies/i)
  assert.doesNotMatch(JSON.stringify(plain), /high.pass filter[^.]{0,100}(?:sibilance|harshness in the highs)/i)
})

test('design holds retain their genre while resolving the unclear scope and missing scene texture', () => {
  assert.match(plain['dead-mall-nostalgia'].customPrompt, /ambient synthwave/i)
  assert.match(plain['dead-mall-nostalgia'].customPrompt, /ventilation hum.*escalator creak.*tiled-room reflections/i)
  assert.match(plain.traditional_trot.name_en, /Techno Ppongjjak/)
  assert.match(plain.traditional_trot.customPrompt, /electronic kick on every beat.*accordion/i)
  assert.match(plain.traditional_trot.customPrompt, /kkeokgi.*vibrato/i)
})

test('legacy Joseon alias shares exactly one canonical tempo, key and recipe', () => {
  assert.deepEqual(plain['joseon-hip-hop'], plain['joseon-hiphop'])
  assert.equal(plain['joseon-hiphop'].metadata.bpm, 90)
  assert.match(plain['joseon-hiphop'].customPrompt, /E minor/)
  assert.doesNotMatch(plain['joseon-hip-hop'].customPrompt, /102 BPM|A major/)
  assert.match(plain['lofi-hiphop'].name_en, /Jazzy/)
})
