const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const modalPath = path.join(__dirname, '../src/components/prompt-builder/CreatePresetModal.tsx');
const seedA = {
  label: '🔥 [힐링] 숲속 휴식…',
  value: '비가 그친 새벽의 울창한 숲에서 안개 너머 오래된 나무 오두막을 바라보며 느끼는 고요한 휴식과 따뜻한 위로',
};
const seedB = {
  label: '🔥 [힐링] 바닷가 산책…',
  value: '해질 무렵 잔잔한 파도가 밀려오는 바닷가를 천천히 걸으며 하루의 긴장을 내려놓는 평온한 산책',
};
const baselineStyle = 'warm felt piano, soft rain, 72 BPM';
const generatedPreset = {
  name: '분석된 숲의 새벽',
  desc: '분석된 오두막의 여유로운 분위기',
  inferred_genre: '분석된 Ambient',
  customPrompt: 'airy pads, forest ambience, 65 BPM',
  category: 'healing',
  emoji: '🌿',
  color: '#123456',
  name_en: 'Analyzed forest morning',
  desc_en: 'Analyzed cabin atmosphere',
  dynamic_elements: {
    audio_system: { music_layer: { base_prompt: 'analyzed audio layer' } },
    visual_system: { base_video_prompt: 'analyzed forest scene' },
  },
};
const generatedThumbnail = {
  imageUrl: 'https://offline.test/analyzed-thumbnail.png',
  imageUrls: ['https://offline.test/analyzed-thumbnail.png', 'https://offline.test/analyzed-alternate.png'],
};

const jsx = (type, props) => ({ type, props });
function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(node => elements(node, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}
function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join('');
  return tree && typeof tree === 'object' ? content(tree.props?.children) : String(tree ?? '');
}
function one(tree, predicate, description) {
  const matches = elements(tree, predicate);
  assert.equal(matches.length, 1, `Expected one ${description}, found ${matches.length}`);
  return matches[0];
}
const nameField = tree => one(tree, node => node.type === 'textarea' && node.props['aria-label'] === '컨셉명', 'concept-name field');
const descField = tree => one(tree, node => node.type === 'textarea' && node.props['aria-label'] === '컨셉 설명', 'description field');
const genreField = tree => one(tree, node => node.type === 'input' && node.props['aria-label'] === '음악 장르', 'genre field');
const styleField = tree => one(tree, node => node.type === 'textarea' && node.props.maxLength === 1000, 'style-tag field');
const chip = (tree, seed) => one(tree, node => node.type === 'button' && node.props['aria-label'] === `추천 아이디어: ${seed.value}`, `chip ${seed.label}`);
const analyzeButton = tree => one(tree, node => node.type === 'button' && content(node).trim() === 'AI 분석', 'AI analysis button');
const saveButton = tree => one(tree, node => node.type === 'button' && /^(수정 완료하기|저장하고 적용하기)$/.test(content(node).trim()), 'save button');
function selected(tree, seed) {
  return chip(tree, seed).props['aria-pressed'];
}
function fields(tree) {
  return {
    name: nameField(tree).props.value,
    desc: descField(tree).props.value,
    genre: genreField(tree).props.value,
    style: styleField(tree).props.value,
  };
}

// Execute the actual component and handlers. Hook dependencies are retained so
// modal-opening effects run only when React would run them, not on every render.
function harness(overrides = {}) {
  const hooks = [], pendingEffects = [], requests = [], saves = [], loggedErrors = [];
  let cursor = 0, dirty = false;
  let analysisResponse = { ok: true, json: async () => ({ preset: generatedPreset }) };
  const props = {
    isOpen: true,
    currentStylePrompt: baselineStyle,
    onClose: () => {},
    onSave: value => saves.push(value),
    ...overrides,
  };
  const depsChanged = (previous, next) => !previous || !next || previous.length !== next.length || next.some((value, i) => !Object.is(previous[i], value));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, next => {
        const value = typeof next === 'function' ? next(hooks[index].value) : next;
        if (!Object.is(value, hooks[index].value)) {
          hooks[index].value = value;
          dirty = true;
        }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { current: initial };
      return hooks[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!hooks[index] || depsChanged(hooks[index].deps, deps)) hooks[index] = { value: callback, deps };
      return hooks[index].value;
    },
    useMemo(calculate, deps) {
      const index = cursor++;
      if (!hooks[index] || depsChanged(hooks[index].deps, deps)) hooks[index] = { value: calculate(), deps };
      return hooks[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!hooks[index] || depsChanged(hooks[index].deps, deps)) {
        const previousCleanup = hooks[index]?.cleanup;
        hooks[index] = { deps };
        pendingEffects.push(() => {
          previousCleanup?.();
          hooks[index].cleanup = effect();
        });
      }
    },
  };
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'lucide-react': new Proxy({}, { get: (_, key) => key }),
    '@/lib/supabase': { supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } },
    '@/contexts/LanguageContext': { useLanguage: () => ({ language: 'ko' }) },
    '@/data/nicheMasterSeeds': { MASTER_NICHE_SEEDS: { healing: [seedA, seedB] } },
    '@/data/channelConcepts': { CHANNEL_CONCEPTS: [] },
  };
  const fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (url === '/api/style-library/analyze-image') {
      if (analysisResponse instanceof Error) throw analysisResponse;
      return analysisResponse;
    }
    if (url === '/api/autopilot/generate-image') return { ok: true, json: async () => generatedThumbnail };
    throw new Error(`Unexpected offline request: ${url}`);
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(modalPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('module', 'exports', 'require', 'fetch', 'alert', 'console', 'setTimeout', code)(
    module,
    module.exports,
    name => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    fetch,
    message => { throw new Error(message); },
    { error: (...args) => loggedErrors.push(args) },
    callback => { callback(); return 0; },
  );
  function render(next = {}) {
    Object.assign(props, next);
    for (let pass = 0; pass < 20; pass++) {
      cursor = 0;
      dirty = false;
      const tree = module.exports.default(props);
      pendingEffects.splice(0).forEach(effect => effect());
      if (!dirty) return tree;
    }
    throw new Error('Offline hook harness did not settle');
  }
  return { render, requests, saves, loggedErrors, setAnalysisResponse: value => { analysisResponse = value; } };
}

function baselinePreset() {
  return {
    id: 'custom-baseline',
    name: '기존 컨셉',
    desc: '기존 컨셉 설명',
    emoji: '☕',
    gradient: '#584072',
    customPrompt: baselineStyle,
    metadata: {
      category: 'healing',
      inferred_genre: '기존 Jazz',
      name_en: 'Original concept',
      desc_en: 'Original description',
      thumbnail_url: 'https://offline.test/original-thumbnail.png',
      thumbnail_urls: ['https://offline.test/original-thumbnail.png', 'https://offline.test/original-alternate.png'],
      dynamic_elements: {
        audio_system: { music_layer: { base_prompt: 'original audio layer' } },
        visual_system: { base_video_prompt: 'original cafe scene' },
      },
    },
  };
}

test('a shortened chip label keeps its full reference separate from the name and audio tags', async () => {
  const h = harness();
  let tree = h.render();
  assert.deepEqual(fields(tree), { name: '', desc: '', genre: '', style: baselineStyle });
  chip(tree, seedA).props.onClick();
  tree = h.render();
  assert.equal(selected(tree, seedA), true);
  const reference = one(tree, node => node.props?.role === 'region' && node.props['aria-label'] === '선택한 추천 아이디어', 'selected-reference region');
  assert.ok(content(reference).includes(seedA.value), 'the complete reference remains readable despite the shortened source label');
  assert.equal(nameField(tree).props.value, '');
  assert.equal(styleField(tree).props.value, baselineStyle);
  assert.equal(analyzeButton(tree).props.disabled, false, 'a selected reference can be analyzed without a manually entered name');
  await analyzeButton(tree).props.onClick();
  const request = h.requests.find(value => value.url === '/api/style-library/analyze-image');
  assert.equal(request.body.conceptReference, seedA.value);
  assert.notEqual(request.body.conceptReference, seedA.label);
  assert.equal(request.body.category, 'healing');
  assert.equal(request.body.customPrompt, baselineStyle);
  tree = h.render();
  assert.equal(nameField(tree).props.value, generatedPreset.name);
  assert.equal(styleField(tree).props.value, generatedPreset.customPrompt);
});

test('switching references restores the fields, translations, dynamic recipe and thumbnails captured before selection', async () => {
  const preset = baselinePreset();
  const h = harness({ editingPreset: preset });
  let tree = h.render();
  const baseline = fields(tree);
  chip(tree, seedA).props.onClick();
  tree = h.render();
  await analyzeButton(tree).props.onClick();
  tree = h.render();
  assert.equal(nameField(tree).props.value, generatedPreset.name);
  assert.ok(elements(tree, node => node.type === 'img' && node.props.src === generatedThumbnail.imageUrl).length);
  chip(tree, seedB).props.onClick();
  tree = h.render();
  assert.equal(selected(tree, seedA), false);
  assert.equal(selected(tree, seedB), true);
  assert.deepEqual(fields(tree), baseline);
  assert.equal(styleField(tree).props.value.includes(seedA.value), false);
  assert.equal(styleField(tree).props.value.includes(seedB.value), false);
  assert.ok(elements(tree, node => node.type === 'img' && node.props.src === preset.metadata.thumbnail_url).length);
  assert.equal(elements(tree, node => node.type === 'img' && node.props.src === generatedThumbnail.imageUrl).length, 0);
  saveButton(tree).props.onClick();
  const saved = h.saves[0];
  assert.equal(saved.name, preset.name);
  assert.equal(saved.desc, preset.desc);
  assert.equal(saved.customPrompt, baselineStyle);
  assert.equal(saved.emoji, preset.emoji);
  assert.equal(saved.gradient, preset.gradient);
  assert.equal(saved.metadata.concept_reference, seedB.value);
  assert.equal(saved.metadata.name_en, preset.metadata.name_en);
  assert.equal(saved.metadata.desc_en, preset.metadata.desc_en);
  assert.deepEqual(saved.metadata.dynamic_elements, preset.metadata.dynamic_elements);
  assert.equal(saved.metadata.thumbnail_url, preset.metadata.thumbnail_url);
  assert.deepEqual(saved.metadata.thumbnail_urls, preset.metadata.thumbnail_urls);
});

test('deselecting an analyzed reference restores the original draft and permits a new independent selection', async () => {
  const h = harness();
  let tree = h.render();
  nameField(tree).props.onChange({ target: { value: '직접 작성한 컨셉' } });
  descField(tree).props.onChange({ target: { value: '직접 작성한 설명' } });
  genreField(tree).props.onChange({ target: { value: '직접 작성한 Jazz' } });
  tree = h.render();
  const baseline = fields(tree);
  chip(tree, seedA).props.onClick();
  tree = h.render();
  await analyzeButton(tree).props.onClick();
  tree = h.render();
  chip(tree, seedA).props.onClick();
  tree = h.render();
  assert.equal(selected(tree, seedA), false);
  assert.deepEqual(fields(tree), baseline);
  assert.equal(elements(tree, node => node.type === 'img' && node.props.src === generatedThumbnail.imageUrl).length, 0);
  nameField(tree).props.onChange({ target: { value: '선택 해제 뒤 수정한 컨셉' } });
  tree = h.render();
  chip(tree, seedB).props.onClick();
  tree = h.render();
  await analyzeButton(tree).props.onClick();
  tree = h.render();
  chip(tree, seedB).props.onClick();
  tree = h.render();
  assert.equal(nameField(tree).props.value, '선택 해제 뒤 수정한 컨셉');
  assert.equal(styleField(tree).props.value, baselineStyle);
  saveButton(tree).props.onClick();
  const saved = h.saves[0];
  assert.equal(saved.metadata.concept_reference, null);
  assert.equal(saved.metadata.name_en, undefined);
  assert.equal(saved.metadata.dynamic_elements, undefined);
  assert.equal(saved.metadata.thumbnail_url, undefined);
  assert.deepEqual(saved.metadata.thumbnail_urls, []);
});

test('shuffling retains the selected reference and changing category clears it while restoring the draft', async () => {
  const preset = baselinePreset();
  const h = harness({ editingPreset: preset });
  let tree = h.render();
  const baseline = fields(tree);
  chip(tree, seedA).props.onClick();
  tree = h.render();
  await analyzeButton(tree).props.onClick();
  tree = h.render();
  const analyzed = fields(tree);
  one(tree, node => node.type === 'button' && elements(node, child => child.type === 'Shuffle').length === 1, 'shuffle button').props.onClick();
  tree = h.render();
  assert.equal(selected(tree, seedA), true);
  assert.deepEqual(fields(tree), analyzed);
  one(tree, node => node.type === 'select', 'category selector').props.onChange({ target: { value: 'focus' } });
  tree = h.render();
  assert.deepEqual(fields(tree), baseline);
  assert.equal(elements(tree, node => node.props?.role === 'region' && node.props['aria-label'] === '선택한 추천 아이디어').length, 0);
  saveButton(tree).props.onClick();
  assert.equal(h.saves[0].metadata.category, 'focus');
  assert.equal(h.saves[0].metadata.concept_reference, null);
  assert.deepEqual(h.saves[0].metadata.dynamic_elements, preset.metadata.dynamic_elements);
});

test('reopening the modal resets its selected reference and starts from the new parent style prompt', async () => {
  const h = harness();
  let tree = h.render();
  chip(tree, seedA).props.onClick();
  tree = h.render();
  assert.equal(selected(tree, seedA), true);
  assert.equal(h.render({ isOpen: false }), null);
  tree = h.render({ isOpen: true, currentStylePrompt: 'new opening, acoustic guitar, 90 BPM' });
  assert.equal(selected(tree, seedA), false);
  assert.equal(selected(tree, seedB), false);
  assert.equal(nameField(tree).props.value, '');
  assert.equal(styleField(tree).props.value, 'new opening, acoustic guitar, 90 BPM');
  nameField(tree).props.onChange({ target: { value: '새로운 수동 컨셉' } });
  tree = h.render();
  await analyzeButton(tree).props.onClick();
  assert.equal(h.requests[0].body.conceptName, '새로운 수동 컨셉');
  assert.equal(h.requests[0].body.conceptReference, undefined);
  assert.equal(h.requests[0].body.category, 'healing');
});

test('analysis failure is visible, keeps the reference and draft, and can be retried', async () => {
  const h = harness();
  h.setAnalysisResponse({ ok: false, status: 503, json: async () => ({ error: 'Offline analysis unavailable' }) });
  let tree = h.render();
  chip(tree, seedA).props.onClick();
  tree = h.render();
  await analyzeButton(tree).props.onClick();
  tree = h.render();
  assert.ok(elements(tree, node => node.props?.role === 'alert' && content(node).trim()).length, 'analysis failure must be visible to the user');
  assert.equal(selected(tree, seedA), true);
  assert.equal(styleField(tree).props.value, baselineStyle);
  assert.equal(analyzeButton(tree).props.disabled, false);
  assert.equal(h.requests.filter(request => request.url === '/api/autopilot/generate-image').length, 0);
  h.setAnalysisResponse({ ok: true, json: async () => ({ preset: generatedPreset }) });
  await analyzeButton(tree).props.onClick();
  tree = h.render();
  assert.equal(elements(tree, node => node.props?.role === 'alert').length, 0);
  assert.equal(nameField(tree).props.value, generatedPreset.name);
});
