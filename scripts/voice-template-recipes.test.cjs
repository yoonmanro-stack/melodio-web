const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const exports = {};
  new Function('exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(exports);
  return exports;
}
const { QUICK_START_TEMPLATES: templates } = load('src/lib/voice/quick-start-templates.ts');
const { restoreDesignAttributes } = load('src/lib/voice/restore-design-attributes.ts');

test('all eight musical templates have distinct complete acoustic recipes', () => {
  const entries = Object.values(templates);
  assert.equal(entries.length, 8);
  assert.equal(new Set(entries.map(v => v.genre)).size, 8);
  assert.equal(new Set(entries.map(v => v.delivery)).size, 8);
  assert.equal(new Set(entries.map(v => JSON.stringify(v.physical_layers))).size, 8);
  for (const recipe of entries) {
    assert.ok(recipe.description.length > 20);
    for (const key of ['pitch', 'brightness', 'chest', 'head', 'weight']) assert.ok(recipe.physical_layers[key] >= 0 && recipe.physical_layers[key] <= 100);
    for (const key of ['power', 'dynamics', 'vibrato', 'groove']) assert.ok(recipe.performance[key] >= 0 && recipe.performance[key] <= 100);
    assert.ok(recipe.textures.length >= 2 && recipe.textures.length <= 3);
    assert.doesNotMatch(recipe.delivery, /100%|same singer|identical|beautiful|perfect voice/i);
  }
  assert.ok(templates.soul.textures.includes('Rough'), 'Soul must retain deliberate grain rather than duplicate a clear soprano');
  assert.ok(templates.soul.physical_layers.chest > templates.diva.physical_layers.chest);
  assert.ok(templates.belter.performance.power > templates.baritone.performance.power);
  assert.ok(templates.hiphop.performance.vibrato < templates.soul.performance.vibrato);
});

test('full recipes round trip through persisted settings without losing timbre or attaching audio', () => {
  for (const [id, template] of Object.entries(templates)) {
    const input = { ...template, vd_code: `VD-${id}`, language: 'fr', preview_genre: template.genre,
      audio_url: 'https://sample.invalid/private.mp3', physical_layers: { ...template.physical_layers, audio_url: 'https://sample.invalid/raw.mp3' } };
    const restored = restoreDesignAttributes(JSON.parse(JSON.stringify(input)));
    assert.deepEqual(restored.physical_layers, template.physical_layers);
    assert.deepEqual(restored.performance, template.performance);
    assert.deepEqual(restored.textures, template.textures);
    assert.deepEqual(restored.emotions, template.emotions);
    assert.equal(restored.reverb, template.reverb);
    assert.equal(restored.delivery, template.delivery);
    assert.equal(restored.language, 'fr');
    assert.equal(restored.preview_genre, template.genre);
    assert.equal(restored.audio_url, undefined);
    assert.equal(restored.physical_layers.audio_url, undefined);
  }
});

test('legacy or malformed local storage is safely ignored and finite settings are bounded', () => {
  for (const value of [null, [], 'old', {}, { physical_layers: [] }, { physical_layers: { gender: 'unknown' } }]) assert.equal(restoreDesignAttributes(value), undefined);
  const result = restoreDesignAttributes({ physical_layers: { gender: 'female', pitch: 0, brightness: NaN, chest: 200, head: -2 },
    textures: [null, 34, 'Rough'], performance: { vibrato: 0, power: Infinity } });
  assert.equal(result.physical_layers.pitch, 0);
  assert.equal(result.physical_layers.brightness, undefined);
  assert.equal(result.physical_layers.chest, 100);
  assert.equal(result.physical_layers.head, 0);
  assert.equal(result.performance.vibrato, 0);
  assert.equal(result.performance.power, undefined);
  assert.deepEqual(result.textures, ['Rough']);
});

test('database JSON metadata restores the same reusable delivery and preview choices', () => {
  const template = templates.soul;
  const restored = restoreDesignAttributes({ ...template, delivery: undefined, language: undefined, preview_genre: undefined,
    physical_layers: { ...template.physical_layers, delivery: template.delivery, language: 'ja', preview_genre: 'rnb' } });
  assert.equal(restored.delivery, template.delivery);
  assert.equal(restored.language, 'ja');
  assert.equal(restored.preview_genre, 'rnb');
});
