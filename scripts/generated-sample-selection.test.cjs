const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputText)(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const { resolveLegacyGeneratedSample: resolve, generatedAudioGenerationId } = load('src/lib/voice/generated-sample-selection.ts', {
  './restore-design-attributes': load('src/lib/voice/restore-design-attributes.ts'),
});
const origin = 'https://project.supabase.co';
const id = '22222222-2222-4222-8222-222222222222';
const audio = slot => `${origin}/storage/v1/object/public/melodio-assets/generated_audio/v1/${id}/${'a'.repeat(24)}/${slot}-${'b'.repeat(20)}/${'c'.repeat(64)}.mp3`;
function fixture(version = 'A') {
  const attributes = { vd_code: 'VD-3456', name: 'Steel Heavy Belter',
    physical_layers: { gender: 'male', age: 'mature', pitch: 45, brightness: 65, chest: 85, head: 35, weight: 90 },
    textures: ['Metallic', 'Rough'], emotions: ['Passionate'],
    performance: { power: 90, dynamics: 85, vibrato: 45, groove: 50 },
    noise_entropy: 15, style: 'Dry', reverb: 'Dry', delivery: 'firm projected onset', language: 'ko', preview_genre: 'rock' };
  return { voice: { designAttributes: structuredClone(attributes), sampleVersion: version },
    records: [{ ...structuredClone(attributes), audio_url: audio(1), audio_url_b: audio(2), sample_version: version }] };
}

test('recovers only a query hint for the exact recipe while allowing a renamed saved voice', () => {
  const { voice, records } = fixture(); voice.designAttributes.name = 'Renamed voice';
  assert.equal(generatedAudioGenerationId(audio(1), origin), id);
  assert.equal(generatedAudioGenerationId(audio(2), origin), id);
  assert.deepEqual(resolve(voice, records, origin), { generationId: id, sampleVersion: 'A', expectedAudioUrl: audio(1) });
  assert.equal(Object.hasOwn(voice, 'audioUrl'), false);
  for (const extension of ['aac', 'wav', 'm4a', 'ogg', 'flac']) {
    records[0].audio_url = audio(1).replace('.mp3', `.${extension}`);
    assert.equal(resolve(voice, records, origin).expectedAudioUrl, records[0].audio_url);
  }
});

test('B uses its exact stored URL and never falls back to an available A sample', () => {
  const { voice, records } = fixture('B');
  assert.deepEqual(resolve(voice, records, origin), { generationId: id, sampleVersion: 'B', expectedAudioUrl: audio(2) });
  delete records[0].audio_url_b;
  assert.equal(resolve(voice, records, origin), null);
  records[0].audio_url_b = audio(2); voice.sampleVersion = 'A';
  assert.equal(resolve(voice, records, origin), null);
  delete voice.sampleVersion; voice.selectedVersion = 'B';
  assert.equal(resolve(voice, records, origin).sampleVersion, 'B');
});

test('duplicate codes, missing identity, mismatched recipes and existing durable references never migrate', () => {
  const mutations = [
    ({ records }) => records.push(structuredClone(records[0])),
    ({ records }) => { records[0].vd_code = 'VD-9999'; },
    ({ voice }) => { delete voice.designAttributes.vd_code; },
    ({ voice, records }) => { voice.designAttributes.vd_code = records[0].vd_code = 'VD-SAVED'; },
    ({ records }) => { records[0].physical_layers.chest = 20; },
    ({ records }) => { records[0].performance.groove = 10; },
    ({ records }) => { records[0].textures = ['Clean']; },
    ({ records }) => { records[0].emotions = ['Calm']; },
    ({ records }) => { records[0].noise_entropy = 25; },
    ({ records }) => { records[0].delivery = 'soft'; },
    ({ records }) => { records[0].reverb = 'Hall'; },
    ({ records }) => { records[0].language = 'fr'; },
    ({ records }) => { records[0].preview_genre = 'jazz'; },
    ({ records }) => { records[0].sample_version = 'C'; },
    ({ voice }) => { voice.sampleGenerationId = id; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f); assert.equal(resolve(f.voice, f.records, origin), null);
  }
  assert.equal(resolve(null, [], origin), null);
  assert.equal(resolve(fixture().voice, '{}', origin), null);
});

test('only canonical generated-audio paths at the exact configured HTTPS origin are lookup hints', () => {
  const invalid = [
    audio(1).replace(origin, 'https://provider.example'),
    audio(1).replace(origin, `${origin}.evil.example`),
    audio(1).replace('https:', 'http:'), audio(1).replace('https://', 'https://user:pass@'),
    `${audio(1)}?token=secret`, `${audio(1)}#fragment`, `${audio(1)}?`, `${audio(1)}#`, ` ${audio(1)}`,
    audio(1).replace('/public/', '/sign/'), audio(1).replace('/melodio-assets/', '/raw-uploads/'),
    audio(1).replace('/generated_audio/v1/', '/voice_samples/'),
    audio(1).replace(id, 'not-a-generation'), audio(1).replace('a'.repeat(24), 'a'.repeat(23)),
    audio(1).replace(`1-${'b'.repeat(20)}`, 'clip-A'), audio(1).replace('c'.repeat(64), 'c'.repeat(63)),
    audio(1).replace('.mp3', '.html'), audio(1).replace('/generated_audio/', '/other/../generated_audio/'),
    audio(1).replace('/generated_audio/', '/generated%5faudio/'), '/assets/voices/sample.mp3',
    'blob:https://project.supabase.co/saved',
  ];
  for (const url of invalid) {
    const { voice, records } = fixture(); records[0].audio_url = url;
    assert.equal(generatedAudioGenerationId(url, origin), null);
    assert.equal(resolve(voice, records, origin), null);
  }
  const { voice, records } = fixture();
  for (const configured of ['', 'http://project.supabase.co', `${origin}/not-an-origin`, `${origin}?token=secret`]) {
    assert.equal(resolve(voice, records, configured), null);
  }
});
