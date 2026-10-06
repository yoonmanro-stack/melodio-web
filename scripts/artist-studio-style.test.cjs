/** Offline artist style fallback: real helper/hook/caller expressions and deferred hydration. */
/* eslint-disable @typescript-eslint/no-require-imports -- Native Node CommonJS offline test entry. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function evaluate(source, filename, dependencies = {}, globals = {}) {
  const offlineModule = { exports: {} };
  const compiled = ts.transpileModule(source, { fileName: filename, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(compiled, {
    module: offlineModule, exports: offlineModule.exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected offline dependency: ${name}`);
      return dependencies[name];
    },
    fetch() { throw Error('External requests are forbidden'); },
    process: { env: new Proxy({}, { get() { throw Error('Environment keys are forbidden'); } }) },
    AbortController, console: { log() {}, warn() {}, error() {} }, ...globals,
  }, { filename });
  return offlineModule.exports;
}

function load(relative, dependencies, globals) {
  const filename = path.join(root, relative);
  return evaluate(fs.readFileSync(filename, 'utf8'), filename, dependencies, globals);
}
const style = load('src/lib/artists/studio-style.ts');
const artistTypes = load('src/lib/artists/types.ts');
const snapshot = value => JSON.parse(JSON.stringify(value));
const jsx = (type, props) => ({ type, props });
const nextTick = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };

const profile = (id, genres, language = 'ko') => Object.freeze({
  id, name: `Offline ${id}`, genres: Object.freeze(genres), revision: 3, status: 'ready',
  voice: Object.freeze({ name: 'Registered voice', kind: 'custom', referenceId: `voice-${id}`, gender: 'male', language }),
  portrait: Object.freeze({ assetId: `portrait-${id}` }), personality: 'Authored personality',
});
const artistA = profile('artist-a', ['  Acoustic pop  ', '트로트']);
const artistB = profile('artist-b', ['Jazz'], 'en');
const noGenres = profile('artist-empty', []);
const allArtists = [artistA, artistB, noGenres];

/** Use real studio hook arguments and derived style without unrelated UI/background effects. */
function callerExpressions(relative) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, 'utf8');
  const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let argument, derivedStyle;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'artistState'
      && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(tree) === 'useStudioArtist') {
      argument = node.initializer.arguments[0].getText(tree);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && ['stylePrompt', 'styleTags'].includes(node.name.text) && node.initializer
      && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(tree) === 'resolveArtistMusicStyle') {
      derivedStyle = node.initializer.getText(tree);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(argument, `Artist hook must be connected in ${relative}`);
  assert.ok(derivedStyle, `Artist style must be derived in ${relative}`);
  return evaluate(`export function makeOptions(scope: any) {
    const { user, searchParams, lyrics, lyricsLanguage, lyricsSections, tracks, setLyricsLanguage,
      stylePrompt, setStylePrompt, lyricLanguage, setLyricLanguage, styleTags, setStyleTags } = scope;
    return ${argument};
  }
  export function effectiveStyle(manual: string, artistState: any) {
    const manualStylePrompt = manual, manualStyleTags = manual;
    return ${derivedStyle};
  }`, `${filename}:artist-options`, {}, { resolveArtistMusicStyle: style.resolveArtistMusicStyle });
}

/** State setters queue updates until render, including functional updates after a pending edit. */
function harness({ initialArtistId = 'artist-a', initialStyle = '', userId = 'offline-owner', caller } = {}) {
  const hooks = [], pendingEffects = [], requests = [];
  let cursor = 0, state, rawStyle, styleValue, languageValue, setStyle, props = { initialArtistId, userId };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial, pending: [] };
      const entry = hooks[index];
      for (const change of entry.pending.splice(0)) entry.value = typeof change === 'function' ? change(entry.value) : change;
      return [entry.value, change => entry.pending.push(change)];
    },
    useRef(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const entry = hooks[index];
      if (!entry || dependencies === undefined || dependencies.some((value, offset) => !Object.is(value, entry.dependencies[offset]))) {
        pendingEffects.push(() => {
          entry?.cleanup?.();
          hooks[index] = { dependencies, cleanup: effect() };
        });
      }
    },
    useId: () => 'offline-id',
  };
  const { useStudioArtist } = load('src/components/artists/StudioArtistPicker.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'Link' },
    '@/lib/artists/types': artistTypes, '@/lib/artists/studio-style': style,
  }, {
    fetch(url, options) {
      assert.equal(url, '/api/artists');
      let resolve;
      const response = new Promise(receive => { resolve = receive; });
      requests.push({ options, resolve: artists => resolve({ ok: true, json: async () => ({ artists }) }) });
      return response;
    },
  });
  function render(change = {}) {
    props = { ...props, ...change };
    cursor = 0;
    [rawStyle, setStyle] = react.useState(initialStyle);
    const [language, setLanguage] = react.useState('ko');
    languageValue = language;
    const options = caller ? caller.makeOptions({
      user: props.userId ? { id: props.userId } : null,
      searchParams: new URLSearchParams(props.initialArtistId ? { artistId: props.initialArtistId } : {}),
      lyrics: '', lyricsLanguage: language, lyricLanguage: language, lyricsSections: [], tracks: [],
      setLyricsLanguage: setLanguage, setLyricLanguage: setLanguage,
      manualStylePrompt: rawStyle, manualStyleTags: rawStyle, setStylePrompt: setStyle, setStyleTags: setStyle,
    }) : {
      userId: props.userId, initialArtistId: props.initialArtistId, lyricsLanguage: language,
      hasLyrics: false, onLyricsLanguageChange: setLanguage,
    };
    state = useStudioArtist(options);
    styleValue = caller ? caller.effectiveStyle(rawStyle, state) : style.resolveArtistMusicStyle(rawStyle, state.defaultMusicStyle);
    pendingEffects.splice(0).forEach(effect => effect());
    return state;
  }
  render();
  return {
    render, requests, get state() { return state; }, get style() { return styleValue; },
    get rawStyle() { return rawStyle; }, get language() { return languageValue; },
    edit(value, commit = true) { setStyle(value); if (commit) render(); },
    select(id) { state.select(id); render(); },
    async hydrate(artists = allArtists, requestIndex = requests.length - 1) {
      requests[requestIndex].resolve(artists);
      await nextTick();
      render();
    },
  };
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  return tree && typeof tree === 'object' ? text(tree.props?.children) : String(tree ?? '');
}

/** Click the real full-lyrics button with an injected successful offline API response. */
async function clickFullLyrics(h) {
  const requests = [], alerts = [], results = [];
  const noop = () => {};
  const LyricsBuilder = load('src/components/prompt-builder/LyricsBuilder.tsx', {
    react: { useState: initial => [typeof initial === 'function' ? initial() : initial, noop], useEffect: noop },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': new Proxy({}, { get: (_, key) => key }),
    '@/components/voice/StudioVoicePicker': { StudioVoicePicker: 'StudioVoicePicker' },
    '@/contexts/VoiceContext': { useVoice: () => ({ studioGender: 'female', activeVoice: null, setStudioGender: noop }) },
    '@/lib/voice/studio-selection': load('src/lib/voice/studio-selection.ts'),
  }, {
    alert: message => alerts.push(message),
    fetch: async (url, options) => {
      assert.equal(url, '/api/lyrics/generate');
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ success: true, title: 'Offline song',
        sections: [{ type: 'verse', content: 'Authored lyric', description: 'Acoustic music direction' }] }) };
    },
  }).default;
  const tree = LyricsBuilder({
    isInstrumental: false, stylePrompt: h.style, onInstrumentalToggle: noop,
    artistVoice: h.state.artistVoice, lyricLanguage: h.language,
    artistSelectionError: h.state.getError({ isInstrumental: false, sunoVersion: 'V6', sourceMenu: 'preset-studio', stylePrompt: h.style }),
    isPlaylistMode: false, onPlaylistModeToggle: noop, trackCount: 1, onTrackCountChange: noop, engine: 'suno_v5',
    title: '', onTitleChange: noop, youtubeTags: '', snsHashtags: '', onTagsChange: noop,
    sections: [], onSectionsChange: sections => results.push(sections),
    playlistTitle: '', onPlaylistTitleChange: noop, playlistDescription: '', onPlaylistDescriptionChange: noop,
    playlistYoutubeTags: '', playlistSnsHashtags: '', onPlaylistTagsChange: noop, tracks: [], onTracksChange: noop,
    activeTrackIdx: 0, onActiveTrackIdxChange: noop,
  });
  const button = nodes(tree, node => node.type === 'button' && text(node).includes('전체 가사 생성'))[0];
  assert.ok(button, 'The real full-lyrics action must remain available');
  await button.props.onClick();
  return { requests, alerts, results };
}

test('registered genres seed one style without changing the saved profile or inventing empty genres', () => {
  const before = snapshot(artistA);
  assert.equal(style.buildArtistMusicStyle([' Acoustic pop ', 'acoustic POP', '', ' 트로트 ']), 'Acoustic pop, 트로트');
  assert.equal(style.buildArtistMusicStyle([]), '');
  assert.deepEqual(snapshot(artistA), before);
});

test('derived fallback preserves exact explicit styles, including a style identical to another artist default', () => {
  assert.equal(style.resolveArtistMusicStyle('Acoustic pop', 'Jazz'), 'Acoustic pop');
  assert.equal(style.resolveArtistMusicStyle('  User-written style  ', 'Jazz'), '  User-written style  ');
  assert.equal(style.resolveArtistMusicStyle(' \t ', 'Jazz'), 'Jazz');
  assert.equal(style.resolveArtistMusicStyle('', ''), '');
});

test('deep-linked artist hydration seeds genre style and keeps its registered voice identity', async () => {
  const h = harness();
  await h.hydrate();
  assert.equal(h.style, 'Acoustic pop, 트로트');
  assert.equal(h.rawStyle, '');
  assert.equal(h.state.artistVoice.gender, 'male');
  assert.equal(h.state.artistVoice.language, 'ko');
  assert.deepEqual(snapshot(h.state.requestFields), { artistId: artistA.id, artistRevision: artistA.revision });
  assert.equal(h.state.artist.voice.referenceId, artistA.voice.referenceId);
});

test('manual and preset styles survive deferred artist hydration', async () => {
  for (const explicit of ['User style: warm strings', 'Preset-selected jazz, 90 BPM']) {
    const h = harness();
    h.edit(explicit);
    await h.hydrate();
    assert.equal(h.style, explicit);
  }
});

test('a pending manual edit survives artist hydration before React commits it', async () => {
  const h = harness();
  h.edit('Pending manual style', false);
  await h.hydrate();
  assert.equal(h.style, 'Pending manual style');
});

test('switching artists changes derived fallback while clearing preserves exact manual style', async () => {
  const h = harness();
  await h.hydrate();
  h.select('artist-b');
  assert.equal(h.style, 'Jazz');
  assert.equal(h.language, 'en');
  h.select('');
  assert.equal(h.style, '');
  assert.equal(h.state.artist, null);
  h.select('artist-a');
  h.edit('Acoustic pop, 트로트');
  h.select('artist-b');
  assert.equal(h.style, 'Acoustic pop, 트로트');
  h.select('');
  assert.equal(h.style, 'Acoustic pop, 트로트');
});

test('resetting manual style with an artist still selected restores its visible genre fallback', async () => {
  const h = harness();
  await h.hydrate();
  h.edit('Manual preset');
  h.edit('');
  assert.equal(h.style, 'Acoustic pop, 트로트');
  assert.equal(h.rawStyle, '');
  assert.equal(h.state.artist.id, artistA.id);
});

test('an artist without registered genres keeps style empty while preserving manual style', async () => {
  const h = harness({ initialArtistId: 'artist-empty' });
  await h.hydrate();
  assert.equal(h.style, '');
  assert.equal(h.state.artist.id, 'artist-empty');
  h.edit('Manual genre');
  h.select('artist-a');
  assert.equal(h.style, 'Manual genre');
});

test('refreshing a saved artist preserves an intervening style edit', async () => {
  const h = harness();
  await h.hydrate();
  h.state.refresh();
  h.render();
  h.edit('Edited after refresh began');
  await h.hydrate();
  assert.equal(h.style, 'Edited after refresh began');
  assert.equal(h.state.artist.id, artistA.id);
});

test('account change clears private artist fallback and ignores an old owner response', async () => {
  const h = harness();
  await h.hydrate();
  h.state.refresh();
  h.render();
  const staleIndex = h.requests.length - 1;
  h.render({ userId: 'second-owner' });
  h.render();
  assert.equal(h.style, '');
  assert.equal(h.state.artist, null);
  assert.equal(h.requests[staleIndex].options.signal.aborted, true);
  await h.hydrate(allArtists, staleIndex);
  assert.equal(h.state.artist, null);
  assert.equal(h.style, '');
});

for (const relative of [
  'src/components/prompt-builder/PromptBuilder.tsx',
  'src/components/prompt-builder/PresetStudioBuilder.tsx',
  'src/components/japan-landing-client.tsx',
]) test(`${path.basename(relative)} real artist options connect genre style to parent state`, async () => {
  const h = harness({ initialArtistId: 'artist-b', caller: callerExpressions(relative) });
  await h.hydrate();
  assert.equal(h.style, 'Jazz');
  assert.equal(h.language, 'en');
  h.edit('Exact explicit preset');
  h.select('artist-a');
  assert.equal(h.style, 'Exact explicit preset');
  assert.equal(h.state.artistVoice.gender, 'male');
});

test('reported Preset Studio click sends registered genre context with the immutable male voice', async () => {
  const h = harness({ caller: callerExpressions('src/components/prompt-builder/PresetStudioBuilder.tsx') });
  await h.hydrate();
  const result = await clickFullLyrics(h);
  assert.equal(result.alerts.length, 0);
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].stylePrompt, 'Acoustic pop, 트로트');
  assert.equal(result.requests[0].vocalGender, 'male');
  assert.equal(result.requests[0].language, 'ko');
  assert.equal(result.results[0][0].content, 'Authored lyric');
  assert.equal(h.rawStyle, '');
});

test('empty registered genres show actionable style guidance before any lyrics request', async () => {
  const h = harness({ initialArtistId: 'artist-empty' });
  await h.hydrate();
  const result = await clickFullLyrics(h);
  assert.equal(result.requests.length, 0);
  assert.equal(result.alerts.length, 1);
  assert.match(result.alerts[0], /STYLE PROMPT/);
  assert.match(result.alerts[0], /프리셋/);
});
