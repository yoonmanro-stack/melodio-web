const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const workerSourceDirectory = process.env.NATURAL_SONG_WORKER_SOURCE_DIRECTORY || __dirname;
const candidateModules = new Map();
function loadWorkerModule(name) {
  if (workerSourceDirectory === __dirname) return require(path.join(__dirname, name));
  if (candidateModules.has(name)) return candidateModules.get(name).exports;
  const filename = path.join(__dirname, name);
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(__dirname);
  const normalRequire = module.require.bind(module);
  module.require = request => ['./suno-provider', './natural-song-preferences'].includes(request)
    ? loadWorkerModule(request.slice(2) + '.js') : normalRequire(request);
  candidateModules.set(name, module);
  module._compile(fs.readFileSync(path.join(workerSourceDirectory, name), 'utf8'), filename);
  return module.exports;
}
const naturalSongPolicy = loadWorkerModule('natural-song-policy.js');
const { isNaturalFullSong, evaluateNaturalSongCandidates, removeClockDurationInstructions,
  compactNaturalSongStyle, naturalSongCandidateMetadata, NATURAL_SONG_COMPACT_ARRANGEMENT } = naturalSongPolicy;
const { resolveWorkerAudioDuration } = require('./viral-audio-policy');
const { resolveDurationSeconds } = loadWorkerModule('suno-provider.js');

const ordinaryMenus = ['audio', 'audio-forge', 'style-library', 'japan', 'preset-studio'];
const performancePreset = { sourceMenu: 'preset-studio', presetId: 'brazilian-funk-kpop-performance', isInstrumental: false };
const scanned = (duration, grade = 'A', clipping = 0, measured = duration) => ({
  clip: { audio_url: `https://example.test/${duration}.mp3`, duration },
  quality: { durationSeconds: measured, grade, clippingPerMinute: clipping, dissonanceScore: 0 },
});

test('ordinary vocal and instrumental studios ignore inherited preset durations', () => {
  for (const sourceMenu of ordinaryMenus) {
    for (const durationSeconds of [28, 60, 195, 210]) {
      for (const isInstrumental of [true, false]) {
        assert.equal(isNaturalFullSong({ sourceMenu, durationSeconds, isInstrumental }), true);
      }
    }
  }
  assert.equal(isNaturalFullSong({ naturalFullSong: true }), true);
  assert.equal(isNaturalFullSong({ requestedDurationSource: 'studio-natural' }), true);
  assert.equal(isNaturalFullSong({ sourceMenu: null, durationSeconds: 28 }), true);
});

test('explicit short-form, previews, v4 and MugSound keep their dedicated duration policies', () => {
  for (const sourceMenu of ['viral', 'viral-cf', 'short-form', 'voice-discovery-design', 'voice-discovery-sample', 'voice-preview', 'voice-sample', 'mugsound-supply']) {
    const metadata = { sourceMenu, naturalFullSong: true };
    assert.equal(isNaturalFullSong(metadata), false);
    assert.equal(evaluateNaturalSongCandidates(metadata, []).applies, false);
  }
  for (const flags of [{ isViral: true }, { isViralTrack: true }, { requestedDurationSource: 'short-form-request' },
    { petEpisode: { version: 'pet-v3' } }, { petEpisode: { version: 'pet-v4' } }, { storyPlan: { version: 'story-v4' } }]) {
    assert.equal(isNaturalFullSong({ sourceMenu: 'audio', ...flags }), false);
  }
});

test('a 120-second original qualifies while shorter measured candidates cannot complete', () => {
  for (const isInstrumental of [true, false]) {
    const short = scanned(240, 'A', 0, 119.999);
    const complete = scanned(120, 'B');
    const decision = evaluateNaturalSongCandidates({ sourceMenu: 'audio', isInstrumental }, [short, complete]);
    assert.equal(decision.status, 'selected');
    assert.deepEqual(decision.candidates, [complete]);
    assert.equal(decision.audit.selectedCandidateIndex, 1);
    assert.deepEqual(decision.audit.candidates[0].reasons, ['duration_too_short']);
    assert.equal(short.clip.duration, 240, 'pure policy does not alter metadata or media');
  }
});

test('preferred full original wins over a 5:49 sibling with usable quality', () => {
  const preferred = scanned(200, 'B');
  const extended = scanned(349, 'A');
  const decision = evaluateNaturalSongCandidates({ sourceMenu: 'japan' }, [extended, preferred]);
  assert.deepEqual(decision.candidates, [preferred, extended]);
  assert.equal(decision.audit.selectedCandidateIndex, 1);
  assert.equal(decision.audit.selectedInPreferredRange, true);
  assert.deepEqual(decision.audit.preferredSeconds, { minimum: 160, maximum: 240 });
  assert.deepEqual(decision.audit.acceptedSeconds, { minimum: 120, maximum: null });
  assert.equal(decision.audit.trimOriginals, false);
  assert.equal(decision.audit.automaticDurationRegeneration, false);
  assert.equal(extended.clip.duration, 349);
});

test('decoded preferred boundaries are inclusive and tiny quality differences win within range', () => {
  const distorted = scanned(200, 'A', 0.001);
  const clean = scanned(240, 'A', 0);
  assert.deepEqual(evaluateNaturalSongCandidates({ sourceMenu: 'audio' }, [distorted, clean]).candidates, [clean, distorted]);
  const edge = scanned(160, 'B');
  const below = scanned(159.999, 'A');
  const above = scanned(240.001, 'A');
  assert.deepEqual(evaluateNaturalSongCandidates({ sourceMenu: 'audio' }, [above, below, edge]).candidates,
    [edge, above, below]);
  const betterGrade = scanned(160, 'A');
  assert.deepEqual(evaluateNaturalSongCandidates({ sourceMenu: 'audio' }, [clean, betterGrade]).candidates,
    [clean, betterGrade], 'equivalent qualities keep stable order, without center-duration bias');
});

test('failed quality in the preferred range cannot displace a usable complete original', () => {
  const failed = scanned(180, 'F');
  const usable = scanned(349, 'B');
  assert.deepEqual(evaluateNaturalSongCandidates({ sourceMenu: 'audio' }, [failed, usable]).candidates,
    [usable, failed]);
});

test('both originals outside the preferred range retain the best whole original and disclose range', () => {
  const shorter = scanned(150, 'B');
  const longer = scanned(510, 'A');
  const decision = evaluateNaturalSongCandidates({ sourceMenu: 'japan' }, [shorter, longer]);
  assert.deepEqual(decision.candidates, [longer, shorter]);
  assert.equal(decision.status, 'selected');
  assert.equal(decision.audit.selectedInPreferredRange, false);
  const primary = naturalSongCandidateMetadata(decision, longer, 'checked');
  const alternate = naturalSongCandidateMetadata(decision, shorter, 'checked');
  assert.match(primary.durationWarning, /510초/);
  assert.match(alternate.durationWarning, /150초/);
  assert.equal(primary.naturalSongPolicy.selectedCandidateIndex, 1);
  assert.equal(alternate.naturalSongPolicy.selectedCandidateIndex, 0);
  assert.equal(alternate.naturalSongPolicy.selectionRole, 'alternate');
  assert.equal(alternate.naturalSongPolicy.evaluatedAt, 'checked');
  assert.equal(longer.clip.duration, 510);
});

test('alternate metadata clears a primary warning when its own original fits the range', () => {
  const usable = scanned(349, 'A');
  const failed = scanned(200, 'F');
  const decision = evaluateNaturalSongCandidates({ sourceMenu: 'audio' }, [usable, failed]);
  const meta = { ...naturalSongCandidateMetadata(decision, usable) };
  assert.match(meta.durationWarning, /349초/);
  Object.assign(meta, naturalSongCandidateMetadata(decision, failed));
  assert.equal(meta.durationWarning, null);
  assert.equal(meta.naturalSongPolicy.selectedInPreferredRange, true);
  assert.equal(meta.naturalSongPolicy.selectedCandidateIndex, 1);
  assert.equal(meta.durationOutcome, 'natural_full_song_preferred_original_selected');
});

test('PCM evidence rather than provider planned duration drives preference', () => {
  const falselyPreferred = scanned(180, 'A', 0, 349);
  const measuredPreferred = scanned(349, 'B', 0, 180);
  const decision = evaluateNaturalSongCandidates({ sourceMenu: 'japan' }, [falselyPreferred, measuredPreferred]);
  assert.deepEqual(decision.candidates, [measuredPreferred, falselyPreferred]);
  assert.equal(decision.audit.candidates[0].inPreferredRange, false);
  assert.equal(decision.audit.candidates[1].inPreferredRange, true);
  assert.equal(falselyPreferred.clip.duration, 180, 'evaluation does not rewrite originals');
});

test('only the exact official performance vocal preset uses the soft 160–260-second range', () => {
  for (const sourceMenu of ['preset-studio', 'audio-forge', 'audio-forge-pro']) {
    const edge = scanned(260, 'B');
    const outside = scanned(260.001, 'A');
    const decision = evaluateNaturalSongCandidates({ ...performancePreset, sourceMenu }, [outside, edge]);
    assert.deepEqual(decision.candidates, [edge, outside]);
    assert.deepEqual(decision.audit.preferredSeconds, { minimum: 160, maximum: 260, target: 200 });
    assert.deepEqual(decision.audit.acceptedSeconds, { minimum: 120, maximum: null });
    assert.equal(decision.audit.automaticDurationRegeneration, false);
    assert.equal(decision.audit.trimOriginals, false);
    assert.equal(outside.clip.duration, 260.001);
  }
});

test('other presets, instruments, source menus and client numeric preferences retain the original policy', () => {
  const metadataCases = [
    ...['audio', 'style-library', 'japan', 'unknown', 'PRESET-STUDIO', ' preset-studio ']
      .map(sourceMenu => ({ ...performancePreset, sourceMenu })),
    { ...performancePreset, presetId: 'another-preset' },
    ...[true, undefined, null, 'false'].map(isInstrumental => ({ ...performancePreset, isInstrumental })),
    { sourceMenu: 'preset-studio', metadata: { presetId: performancePreset.presetId, isInstrumental: false } },
    { sourceMenu: 'audio', presetId: 'another-preset', isInstrumental: false,
      preferredSeconds: { minimum: 10, maximum: 999, target: 200 }, durationSeconds: 200,
      naturalSongPolicy: { preferredSeconds: { minimum: 10, maximum: 999, target: 200 } } },
  ];
  for (const metadata of metadataCases) {
    const first = scanned(160);
    const closerTo200 = scanned(200);
    const decision = evaluateNaturalSongCandidates(metadata, [first, closerTo200]);
    assert.deepEqual(decision.audit.preferredSeconds, { minimum: 160, maximum: 240 });
    assert.deepEqual(decision.candidates, [first, closerTo200], 'default quality ties retain original index order');
    assert.equal(decision.audit.selectionOrder, 'usable_quality_then_preferred_range_then_quality');
    const outOfRange = scanned(250, 'A');
    const preferred = scanned(240, 'B');
    assert.deepEqual(evaluateNaturalSongCandidates(metadata, [outOfRange, preferred]).candidates, [preferred, outOfRange]);
  }
});

test('the 200-second preset target breaks only equal-quality ties, including tiny clipping or dissonance gaps', () => {
  const farBetterGrade = scanned(260, 'A');
  const nearWorseGrade = scanned(200, 'B');
  assert.deepEqual(evaluateNaturalSongCandidates(performancePreset, [nearWorseGrade, farBetterGrade]).candidates,
    [farBetterGrade, nearWorseGrade]);
  const farClean = scanned(260, 'A', 0);
  const nearClipped = scanned(200, 'A', 0.001);
  assert.deepEqual(evaluateNaturalSongCandidates(performancePreset, [nearClipped, farClean]).candidates,
    [farClean, nearClipped]);
  const nearDissonant = scanned(200, 'A');
  nearDissonant.quality.dissonanceScore = 0.001;
  assert.deepEqual(evaluateNaturalSongCandidates(performancePreset, [nearDissonant, farClean]).candidates,
    [farClean, nearDissonant]);
  const nearEqualQuality = scanned(195, 'A');
  assert.deepEqual(evaluateNaturalSongCandidates(performancePreset, [farClean, nearEqualQuality]).candidates,
    [nearEqualQuality, farClean]);
  const before = scanned(190), after = scanned(210);
  assert.deepEqual(evaluateNaturalSongCandidates(performancePreset, [after, before]).candidates, [after, before],
    'equal quality and equal target distances retain stable original order');
  const failedPreferred = scanned(200, 'F');
  const usableOutside = scanned(400, 'B');
  assert.deepEqual(evaluateNaturalSongCandidates(performancePreset, [failedPreferred, usableOutside]).candidates,
    [usableOutside, failedPreferred]);
});

test('performance originals outside preference keep full audio and use their own 160–260 warning metadata', () => {
  const originals = [scanned(120), scanned(127)];
  const decision = evaluateNaturalSongCandidates(performancePreset, originals);
  assert.equal(decision.status, 'selected');
  assert.deepEqual(decision.candidates, [originals[1], originals[0]]);
  for (const candidate of decision.candidates) {
    const metadata = naturalSongCandidateMetadata(decision, candidate);
    assert.match(metadata.durationWarning, /2분 40초~4분 20초/);
    assert.match(metadata.durationWarning, new RegExp(candidate.clip.duration + '초'));
    assert.equal(metadata.naturalSongPolicy.selectedInPreferredRange, false);
    assert.equal(metadata.naturalSongPolicy.preferredSeconds.target, 200);
  }
  const inRange = scanned(260);
  const long = scanned(400);
  const withLongAlternate = evaluateNaturalSongCandidates(performancePreset, [inRange, long]);
  assert.equal(naturalSongCandidateMetadata(withLongAlternate, inRange).durationWarning, null);
  assert.match(naturalSongCandidateMetadata(withLongAlternate, long).durationWarning, /400초/);
  assert.equal(long.clip.duration, 400);
  const failed = evaluateNaturalSongCandidates(performancePreset, [scanned(119), scanned(30)]);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.audit.automaticDurationRegeneration, false);
  assert.equal(failed.audit.trimOriginals, false);
});

test('both short or unknown originals fail without proposing paid retries', () => {
  for (const candidates of [[scanned(119), scanned(30)], [scanned(undefined), scanned(0)], []]) {
    const decision = evaluateNaturalSongCandidates({ sourceMenu: 'audio-forge' }, candidates);
    assert.equal(decision.status, 'failed');
    assert.deepEqual(decision.candidates, []);
    assert.equal(decision.audit.automaticDurationRegeneration, false);
    assert.equal(decision.audit.failureReason, 'no_duration_qualified_original_candidate');
  }
});

test('a long provider duration cannot qualify unknown or unavailable decoded audio', () => {
  const candidate = scanned(180, 'A', 0, undefined);
  candidate.quality.durationSeconds = undefined;
  assert.equal(evaluateNaturalSongCandidates({ sourceMenu: 'audio' }, [candidate]).status, 'failed');
  candidate.quality.durationSeconds = 0;
  assert.equal(evaluateNaturalSongCandidates({ sourceMenu: 'audio' }, [candidate]).status, 'failed');
});

test('clock cleanup preserves tempo, era, structure and all sung lyric lines', () => {
  const style = removeClockDurationInstructions('1990s pop, 84 BPM, target duration 195 seconds (3:15), fade out at 3:20, warm guitar');
  assert.match(style, /1990s pop, 84 BPM/);
  assert.match(style, /warm guitar/);
  assert.doesNotMatch(style, /195 seconds|3:15|3:20/);
  const lyrics = '[Target Duration: 3:15, complete song]\n[Verse]\nFirst sung line\nSecond sung line\n[Chorus]\nThe ending';
  assert.equal(removeClockDurationInstructions(lyrics), '[Verse]\nFirst sung line\nSecond sung line\n[Chorus]\nThe ending');
});

function retryFixture() {
  const source = fs.readFileSync(path.join(workerSourceDirectory, 'index.js'), 'utf8');
  const from = source.indexOf('async function submitSunoJobForRetry(');
  const to = source.indexOf('// ─── Suno 작업 폴링', from);
  const shortFrom = source.indexOf('function isShortFormTrack(');
  const shortTo = source.indexOf('/**\n * 합격 상한을', shortFrom);
  assert(from > 0 && to > from && shortTo > shortFrom);
  const submissions = [];
  const sandbox = {
    ...naturalSongPolicy, resolveWorkerAudioDuration, resolveDurationSeconds,
    MUGSOUND_INSTRUMENTAL_STRUCTURE_PROMPT: '[Target Duration: 3:30, Full Extended Instrumental Master]',
    sunoVersionLabel: () => 'v6', log: () => {},
    submitKieSunoJob: async input => { submissions.push(input); return { taskId: 'fixture-task', model: 'V6' }; },
  };
  vm.runInNewContext(source.slice(shortFrom, shortTo) + source.slice(from, to)
    + '\nthis.retry = submitSunoJobForRetry; this.shortForm = isShortFormTrack;', sandbox);
  return { submissions, retry: sandbox.retry, shortForm: sandbox.shortForm };
}

test('existing quality retries carry natural mode and omit duration for every ordinary studio', async () => {
  const fixture = retryFixture();
  for (const sourceMenu of ordinaryMenus) {
    const metadata = { sourceMenu, durationSeconds: 28, isInstrumental: true, lyricsPrompt: '[Intro]\n[Main Theme]\n[Ending]' };
    assert.equal(fixture.shortForm(metadata), false, 'preset length cannot enable the short-form crop path');
    await fixture.retry(metadata, 'Full song');
    const input = fixture.submissions.at(-1);
    assert.equal(input.naturalFullSong, true);
    assert.equal(Object.hasOwn(input, 'durationSeconds'), false);
    assert.equal(input.lyrics, metadata.lyricsPrompt);
  }
});

test('the performance preset approximate target stays in the audit and never becomes a retry duration parameter', async () => {
  const fixture = retryFixture();
  const metadata = { ...performancePreset, durationSeconds: 200,
    preferredSeconds: { minimum: 160, maximum: 260, target: 200 },
    lyricsPrompt: '[Verse]\nKeep every sung line\n[Outro]\nLet the final phrase resolve' };
  const decision = evaluateNaturalSongCandidates(metadata, [scanned(190), scanned(200)]);
  assert.equal(decision.audit.preferredSeconds.target, 200);
  await fixture.retry(metadata, 'Natural complete performance');
  const input = fixture.submissions[0];
  assert.equal(input.naturalFullSong, true);
  for (const field of ['durationSeconds', 'duration', 'target', 'preferredSeconds']) {
    assert.equal(Object.hasOwn(input, field), false);
  }
  assert.equal(input.lyrics, metadata.lyricsPrompt);
});

test('ordinary retries clear stale clock directions from style, lyric headings and section directions', async () => {
  const fixture = retryFixture();
  await fixture.retry({ sourceMenu: 'audio', stylePrompt: 'Pop, 84 BPM, target duration 195 seconds, fade out at 3:20',
    lyricsPrompt: '[Target Duration: 3:15]\n[Verse]\nSing every line\n[Ending]\nFinish this song',
    lyricsSections: [{ type: 'verse', description: 'soft guitar, fade out at 3:20', content: 'Sing every line' }],
  }, 'Complete song');
  const input = fixture.submissions[0];
  assert.doesNotMatch(input.style + input.lyrics + input.lyricsSections[0].description, /3:15|3:20|195 seconds/);
  assert.match(input.style, /84 BPM/);
  assert.match(input.lyrics, /Sing every line\n\[Ending\]\nFinish this song/);
  assert.equal(input.lyricsSections[0].content, 'Sing every line');
  await fixture.retry({ sourceMenu: 'japan', isInstrumental: true }, 'Instrumental');
  assert.match(fixture.submissions[1].lyrics, /\[Main Theme Variation\]/);
  assert.match(fixture.submissions[1].lyrics, /\[Outro and Natural Ending\]/);
  assert.deepEqual(fixture.submissions[1].lyrics.split('\n'), ['[Complete Instrumental]', '[Instrumental Intro]',
    '[Main Theme]', '[Instrumental Development]', '[Main Theme Variation]', '[Instrumental Bridge]',
    '[Final Main Theme]', '[Outro and Natural Ending]']);
  assert.doesNotMatch(fixture.submissions[1].lyrics, /\d+:\d{2}|piano|bass/i);
});

test('natural quality retries follow supplied complete structure without new compact arrangement or clock directions', async () => {
  const fixture = retryFixture();
  await fixture.retry({ sourceMenu: 'japan', stylePrompt: 'warm guitar '.repeat(180),
    lyricsPrompt: '[Verse]\nSing every line\n[Ending]\nResolve every line' }, 'Complete song');
  const input = fixture.submissions[0];
  assert.equal(input.style.length <= 1000, true);
  assert.match(input.style, /Follow the supplied complete song structure/);
  assert.match(input.style, /allow the final musical phrase to resolve naturally/);
  assert.match(input.style, /no abrupt cutoff/);
  assert.doesNotMatch(input.style, /Compact complete song|brief intro|concise development|no extended solos|no excessive chorus repetition/);
  assert.doesNotMatch(input.style, /\d+:\d{2}|\d+\s*(?:seconds|minutes)/);
  assert.equal(Object.hasOwn(input, 'durationSeconds'), false);
  assert.equal(input.lyrics, '[Verse]\nSing every line\n[Ending]\nResolve every line');
  assert.equal(compactNaturalSongStyle(input.style), input.style, 'guidance is idempotent');
});

test('compact guidance fits whole clauses or words instead of producing a partial shamisen instrument', () => {
  const available = 1000 - NATURAL_SONG_COMPACT_ARRANGEMENT.length - 2;
  const lead = 'warm '.repeat(Math.ceil((available - 6) / 5)).slice(0, available - 6) + ' ';
  const style = lead + 'shamisen, koto and soft acoustic guitar';
  assert.equal((NATURAL_SONG_COMPACT_ARRANGEMENT + ', ' + style).slice(0, 1000).endsWith('shami'), true,
    'fixture reproduces the partial instrument that triggered the provider artist-name filter');
  const fitted = compactNaturalSongStyle(style);
  assert.equal(fitted.length <= 1000, true);
  assert.equal(fitted.startsWith(NATURAL_SONG_COMPACT_ARRANGEMENT), true);
  assert.doesNotMatch(fitted, /(?:^|\W)shami$/);
  assert.doesNotMatch(fitted, /(?:^|\W)shamis?$/);
  const complete = compactNaturalSongStyle('warm Japanese folk, shamisen, koto');
  assert.match(complete, /shamisen, koto$/);
  assert.equal(compactNaturalSongStyle(complete), complete);
});

test('winner and alternate persistence branches apply each track metadata', () => {
  const source = fs.readFileSync(path.join(workerSourceDirectory, 'index.js'), 'utf8');
  const branchStart = source.indexOf("            } else if (naturalSongDecision.applies) {\n              Object.assign(metaObj, naturalSongCandidateMetadata");
  const branchEnd = source.indexOf('            } else if (isShortForm) {', branchStart);
  const alternateStart = source.indexOf('              if (naturalSongDecision.applies) {\n                Object.assign(metaObj, naturalSongCandidateMetadata');
  const alternateEnd = source.indexOf('              metaObj.audioPersistence.selectedClipKey', alternateStart);
  assert(branchStart > 0 && branchEnd > branchStart && alternateStart > 0 && alternateEnd > alternateStart);
  const short = scanned(180, 'B');
  const long = scanned(349, 'A');
  const decision = evaluateNaturalSongCandidates({ sourceMenu: 'japan' }, [long, short]);
  const sandbox = { naturalSongCandidateMetadata, naturalSongDecision: decision,
    winner: short, loser: long, metaObj: { naturalSongPolicy: { evaluatedAt: 'checked' }, durationWarning: 'stale' } };
  vm.runInNewContext(source.slice(branchStart + '            } else if (naturalSongDecision.applies) {'.length, branchEnd), sandbox);
  assert.equal(sandbox.metaObj.durationWarning, null);
  assert.equal(sandbox.metaObj.naturalSongPolicy.selectedCandidateIndex, 1);
  vm.runInNewContext(source.slice(alternateStart, alternateEnd), sandbox);
  assert.match(sandbox.metaObj.durationWarning, /349초/);
  assert.equal(sandbox.metaObj.naturalSongPolicy.selectedCandidateIndex, 0);
  assert.equal(sandbox.metaObj.naturalSongPolicy.selectionRole, 'alternate');
});

test('dedicated retries still carry their short-form, sample or MugSound durations', async () => {
  const fixture = retryFixture();
  for (const [metadata, seconds] of [
    [{ sourceMenu: 'viral', durationSeconds: 28 }, 28],
    [{ sourceMenu: 'voice-discovery-design', durationSeconds: 28 }, 28],
    [{ sourceMenu: 'mugsound-supply', durationSeconds: 210, isInstrumental: true }, 210],
  ]) {
    await fixture.retry(metadata, 'Dedicated song');
    const input = fixture.submissions.at(-1);
    assert.equal(input.naturalFullSong, false);
    assert.equal(input.durationSeconds, seconds);
  }
});
