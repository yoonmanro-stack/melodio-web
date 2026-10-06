/* eslint-disable @typescript-eslint/no-require-imports -- Offline Node regression scripts use CommonJS. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { compileLyricsSections, mergeLyricsDescriptions, prepareLyricsSubmission, LyricsInstructionError, assertSafeVocalLyrics } = require('../worker/lyrics-policy');

const reportedDescription = '[male vocal, [부드러운 통기타 스트로크] [브러시 드럼과 따뜻한 콘트라베이스], 가까운 마이크 질감의 진솔한 서사, 깊은 트로트 비브라토와 섬세한 꺾기, 따뜻한 아날로그 콘솔과 실키한 테이프 질감]';
const section = (content, description, type = 'verse') => ({ type, content, description });

test('the reported nested production description enters style and never sung lyrics', () => {
  const content = '오늘도 같은 길을 걸어요\n당신의 온기를 기억해요';
  const compiled = compileLyricsSections([section(content, reportedDescription)]);
  assert.equal(compiled.lyricsPrompt, `[Verse]\n${content}`);
  assert.deepEqual(compiled.styleDescriptions, ['male vocal, 부드러운 통기타 스트로크 브러시 드럼과 따뜻한 콘트라베이스, 가까운 마이크 질감의 진솔한 서사, 깊은 트로트 비브라토와 섬세한 꺾기, 따뜻한 아날로그 콘솔과 실키한 테이프 질감']);
  const style = mergeLyricsDescriptions('Acoustic trot, male vocal', compiled.styleDescriptions);
  assert.match(style, /부드러운 통기타/);
  assert.equal(style.match(/male vocal/g).length, 1);
  assert.doesNotMatch(style, /[\[\]]/);
});

test('Korean, English, Japanese and French content retains every original character', () => {
  const lines = ['  바람이 내 이름을 부르네  \n\n', 'I sing [these words], softly.\r\n', '君の声が聞こえる\n[歌う言葉]', "L'été revient, près de toi.\n"];
  const sections = lines.map((content, index) => section(content, 'warm guitar', `verse ${index + 1}`));
  const result = compileLyricsSections(sections);
  assert.equal(result.lyricsPrompt, lines.map((content, index) => `[Verse ${index + 1}]\n${content}`).join('\n\n'));
  assert.deepEqual(result.styleDescriptions, ['warm guitar']);
});

test('intentional sung brackets and authored structural cues inside content are untouched', () => {
  const content = '[Spoken]\n[sung content]\n[male vocal, words the author intentionally sings]\n[Verse]\n계속 노래해';
  const result = compileLyricsSections([section(content, 'intimate vocal')]);
  assert.equal(result.lyricsPrompt, `[Verse]\n${content}`);
  assert.deepEqual(result.styleDescriptions, ['intimate vocal']);
});

test('known aliases and numbered sections retain intended structural tags without header injection', () => {
  const types = ['pre_chorus 2', 'PostChorus3', '[Spoken Word]', 'instrumental break', 'guitar-solo 1', 'verse\n][female vocal', 'constructor'];
  const labels = ['Pre-Chorus 2', 'Post-Chorus 3', 'Spoken', 'Instrumental Break', 'Guitar Solo 1', 'Verse', 'Verse'];
  assert.equal(compileLyricsSections(types.map(type => section('line', undefined, type))).lyricsPrompt,
    labels.map(label => `[${label}]\nline`).join('\n\n'));
});

test('missing descriptions, empty content and malformed sections have explicit behavior', () => {
  assert.deepEqual(compileLyricsSections(undefined), { lyricsPrompt: '', styleDescriptions: [] });
  assert.deepEqual(compileLyricsSections([]), { lyricsPrompt: '', styleDescriptions: [] });
  assert.deepEqual(compileLyricsSections([null, 'invalid', { content: 3 }, section(' \n', '[warm piano]', 'intro'), section('sing')]),
    { lyricsPrompt: '[Verse]\nsing', styleDescriptions: ['warm piano'] });
});

test('description deduplication tolerates nested brackets, whitespace and case', () => {
  const result = compileLyricsSections([section('one', '[Warm   Guitar], [close vocal]'), section('two', 'warm guitar, close vocal'), section('three', '\nWARM GUITAR, CLOSE VOCAL\t')]);
  assert.deepEqual(result.styleDescriptions, ['Warm Guitar, close vocal']);
  const style = mergeLyricsDescriptions('Folk, [WARM GUITAR], Close Vocal', result.styleDescriptions);
  assert.equal(style, 'Folk, [WARM GUITAR], Close Vocal');
});

test('style merging respects reserved budgets and remains idempotent across retries', () => {
  const base = 'Target duration 180 seconds; Folk, female solo vocal';
  const descriptions = ['warm guitar, close vocal, silky tape', 'WARM GUITAR, close vocal'];
  const merged = mergeLyricsDescriptions(base, descriptions, base.length + ', warm guitar, close vocal'.length);
  assert.equal(merged, `${base}, warm guitar, close vocal`);
  assert.equal(mergeLyricsDescriptions(merged, descriptions, merged.length), merged);
  assert.equal(mergeLyricsDescriptions(merged, descriptions, base.length + ', warm guitar, close vocal'.length), merged);
  assert.ok(merged.startsWith(base));
});

test('oversized clauses are skipped whole while later clauses may still fit', () => {
  const descriptions = ['this complete instruction exceeds the remaining budget, warm guitar'];
  const result = mergeLyricsDescriptions('Folk', descriptions, 20);
  assert.equal(result, 'Folk, warm guitar');
  assert.equal(mergeLyricsDescriptions(result, descriptions, 20), result);
  assert.equal(mergeLyricsDescriptions('😀', ['x'], 1), 'x');
  assert.equal(mergeLyricsDescriptions('Folk', descriptions, 0), '');
  for (const budget of [-1, 1.5, Infinity, 1001]) assert.throws(() => mergeLyricsDescriptions('Folk', [], budget), RangeError);
});

test('server and retry preparation use structured lyrics with identical style results', () => {
  const input = { stylePrompt: 'Trot, male solo vocal', lyricsPrompt: '[Verse]\nOLD DESCRIPTIVE CONTENT', lyricsSections: [section('실제로 부를 가사', reportedDescription)] };
  const first = prepareLyricsSubmission(input);
  assert.equal(first.lyricsPrompt, '[Verse]\n실제로 부를 가사');
  assert.match(first.stylePrompt, /부드러운 통기타/);
  assert.deepEqual(prepareLyricsSubmission({ ...input, ...first }), first);
});

test('raw fallback and instrumental arrangements are preserved without guessing at bracketed lyrics', () => {
  const raw = '  [Verse]\n[not a production directive]\n歌詞 그대로\n';
  assert.equal(prepareLyricsSubmission({ stylePrompt: 'Pop', lyricsPrompt: raw, lyricsSections: [] }).lyricsPrompt, raw);
  const instrumental = prepareLyricsSubmission({ stylePrompt: 'Instrumental piano', lyricsPrompt: raw, lyricsSections: [section('sung words', 'male vocal')], isInstrumental: true });
  assert.equal(instrumental.lyricsPrompt, raw);
  assert.equal(instrumental.stylePrompt, 'Instrumental piano');
  assert.deepEqual(instrumental.styleDescriptions, []);
});

test('raw legacy and retry lyrics reject the exact nested production block with an actionable error', () => {
  const lyrics = `[Verse]\n${reportedDescription}\n실제로 부를 가사`;
  assert.throws(() => assertSafeVocalLyrics(lyrics), error => error instanceof LyricsInstructionError
    && error.code === 'lyrics_instruction_in_content' && error.message.includes('음악 스타일로 옮기거나'));
  const prepared = prepareLyricsSubmission({ stylePrompt: 'Trot', lyricsPrompt: lyrics });
  assert.equal(prepared.lyricsPrompt, lyrics, 'raw words remain available for editing rather than being deleted');
  assert.throws(() => assertSafeVocalLyrics(prepared.lyricsPrompt), LyricsInstructionError);
});

test('long standalone production blocks are rejected in Korean, English, Japanese and French', () => {
  const descriptions = [
    '따뜻한 아날로그 콘솔과 테이프 질감으로 믹싱하고 브러시 드럼과 콘트라베이스, 깊은 비브라토를 풍성하게 사용합니다. 가까운 마이크를 사용해 보컬이 앞에서 들리도록 해주세요.',
    'Intimate male vocal recorded with a close microphone, warm acoustic guitar, brushed drums and analog tape production.',
    'アコースティックギターとドラム、温かいアナログコンソールの質感、近いマイクで録音するボーカル、繊細なビブラートを丁寧に加えて、穏やかで自然な音楽の編曲を完成させてください。',
    'Voix masculine au microphone proche, guitare douce, batterie légère, contrebasse chaleureuse et production analogique.',
  ];
  for (const description of descriptions) {
    assert.ok(`[${description}]`.length >= 80);
    assert.throws(() => assertSafeVocalLyrics(`[Chorus]\n[${description}]\nSing these words`), LyricsInstructionError);
  }
});

test('the guard preserves structural tags, short performance cues and intentional inline sung brackets', () => {
  const lyrics = '[Verse 1]\n[Pre-Chorus]\n[Spoken]\n[male vocal]\n[soft guitar]\n[sung content]\n[I [love] you]\n내 마음에 [부드러운 통기타 스트로크] 남아\n' + `I sing ${reportedDescription} as intentional words.\n`;
  assert.doesNotThrow(() => assertSafeVocalLyrics(lyrics));
  const content = '[Spoken]\n[sung content]\n부드러운 통기타 스트로크라는 말을 노래해';
  assert.doesNotThrow(() => assertSafeVocalLyrics(compileLyricsSections([section(content, reportedDescription)]).lyricsPrompt));
});

test('multiline and unfinished production metadata fail closed without matching ordinary bracketed verses', () => {
  assert.throws(() => assertSafeVocalLyrics('[male vocal,\n[soft guitar],\n[analog tape]]\nlyrics'), LyricsInstructionError);
  assert.throws(() => assertSafeVocalLyrics('[male vocal, [soft guitar]\nlyrics'), LyricsInstructionError);
  const authoredVerse = `[${'당신과 걷는 길 위에서 오늘의 마음을 천천히 노래해요 '.repeat(5)}]\n[Verse] words on this lyric line`;
  assert.doesNotThrow(() => assertSafeVocalLyrics(authoredVerse));
});

test('a canonical female solo stays female after initial preparation and structured retry', () => {
  const input = { stylePrompt: 'Folk, intimate female solo vocal, warm microphone', lyricsPrompt: 'old lyrics',
    lyricsSections: [section('  가사 [male vocal] 그대로\n', 'male vocal, baritone, 남성 보컬, mixed vocal, duet, warm guitar')], vocalGender: 'female' };
  const first = prepareLyricsSubmission(input);
  const retry = prepareLyricsSubmission({ ...input, stylePrompt: first.stylePrompt, lyricsPrompt: first.lyricsPrompt, vocalGender: 'f' });
  assert.equal(first.lyricsPrompt, '[Verse]\n  가사 [male vocal] 그대로\n');
  assert.equal(retry.lyricsPrompt, first.lyricsPrompt);
  assert.equal(retry.stylePrompt, first.stylePrompt);
  assert.ok(first.stylePrompt.startsWith('Folk, intimate female solo vocal, warm microphone'));
  assert.match(first.stylePrompt, /warm guitar/);
  assert.doesNotMatch(first.stylePrompt, /\b(?:male|baritone|duet|mixed)\b|남성|혼성/);
});

test('a canonical male solo rejects opposite female and mixed descriptions without touching sung content', () => {
  const input = { stylePrompt: 'Trot, clear male solo vocal', lyricsSections: [section('[female vocal]\n노래', 'female vocals, soprano, 여성 보컬, 소프라노, 혼성 보컬, duo, warm bass')], vocalGender: 'm' };
  const prepared = prepareLyricsSubmission(input);
  assert.equal(prepared.lyricsPrompt, '[Verse]\n[female vocal]\n노래');
  assert.ok(prepared.stylePrompt.startsWith('Trot, clear male solo vocal'));
  assert.doesNotMatch(prepared.stylePrompt, /\b(?:female|soprano|duo)\b|여성|소프라노|혼성/);
  assert.equal(prepareLyricsSubmission({ ...input, stylePrompt: prepared.stylePrompt, vocalGender: 'male' }).stylePrompt, prepared.stylePrompt);
});

test('duet and unspecified gender keep descriptions and never infer a new canonical identity', () => {
  const input = { stylePrompt: 'Pop, male and female duet vocals', lyricsSections: [section('Sing', 'female vocal, male vocal, duet harmonies')] };
  const unspecified = prepareLyricsSubmission(input);
  for (const vocalGender of ['duet', 'unknown', undefined]) {
    const prepared = prepareLyricsSubmission({ ...input, vocalGender });
    assert.equal(prepared.stylePrompt, unspecified.stylePrompt);
    assert.equal(prepared.lyricsPrompt, '[Verse]\nSing');
    assert.match(prepared.stylePrompt, /male and female duet/);
  }
});

test('instrumental preparation does not add or reinterpret a vocal gender', () => {
  const input = { stylePrompt: 'Instrumental piano', lyricsPrompt: '[Intro]\n[Instrumental]',
    lyricsSections: [section('sung words', 'male vocal, female duet')], isInstrumental: true, vocalGender: 'female' };
  const prepared = prepareLyricsSubmission(input);
  assert.equal(prepared.stylePrompt, input.stylePrompt);
  assert.equal(prepared.lyricsPrompt, input.lyricsPrompt);
  assert.deepEqual(prepared.styleDescriptions, []);
});

test('gender conflicts do not consume reserved space or accumulate shortened clauses on retry', () => {
  const base = 'Folk, female solo vocal';
  const input = { stylePrompt: base, lyricsSections: [section('words', 'male vocal, warm guitar')],
    vocalGender: 'f', maxStyleChars: base.length + ', warm guitar'.length };
  const first = prepareLyricsSubmission(input);
  assert.equal(first.stylePrompt, `${base}, warm guitar`);
  assert.equal(prepareLyricsSubmission({ ...input, stylePrompt: first.stylePrompt }).stylePrompt, first.stylePrompt);
  const soloInput = { ...input, maxStyleChars: 1000, lyricsSections: [section('words', 'male solo vocals, warm guitar')] };
  const solo = prepareLyricsSubmission(soloInput);
  assert.equal(prepareLyricsSubmission({ ...soloInput, stylePrompt: solo.stylePrompt }).stylePrompt, solo.stylePrompt);
});

test('explicit standalone production labels are rejected outside brackets in multiple languages', () => {
  const lines = [
    'Arrangement: male vocal, acoustic guitar strumming, brushed drums, close microphone and analog tape production.',
    'Production: warm analog tape and intimate microphone texture',
    'Mixing: close vocal with silky reverb',
    'Music direction: warm guitar with brushed drums',
    'Vocal style: male vocal and deep vibrato',
    '편곡: 부드러운 통기타 스트로크와 브러시 드럼',
    '음악 지시：가까운 마이크 질감과 따뜻한 아날로그 콘솔',
    '창법: 깊은 비브라토와 섬세한 꺾기',
    '編曲：アコースティックギターとドラム',
    'ボーカルスタイル: 男性ボーカルとビブラート',
  ];
  for (const line of lines) assert.throws(() => assertSafeVocalLyrics(`[Verse]\n${line}\nActual sung words`), LyricsInstructionError);
  assert.throws(() => assertSafeVocalLyrics('[unfinished sung words\nMixing: close vocal'), LyricsInstructionError);
});

test('dense production-only comma lists cannot enter raw or structured sung content', () => {
  const lines = [
    'male vocal, acoustic guitar strumming, brushed drums, warm double bass, close microphone, analog tape production',
    '남성 보컬, 부드러운 통기타 스트로크, 브러시 드럼과 콘트라베이스, 따뜻한 아날로그 콘솔',
    '男性ボーカル、アコースティックギター、ドラム、アナログコンソール',
    'voix masculine, guitare acoustique, batterie légère, production analogique',
  ];
  for (const line of lines) {
    assert.throws(() => assertSafeVocalLyrics(line), LyricsInstructionError);
    assert.throws(() => assertSafeVocalLyrics(compileLyricsSections([section(line)]).lyricsPrompt), LyricsInstructionError);
  }
});

test('adjacent metadata blocks and short multiattribute technical blocks are rejected', () => {
  const lines = ['[male vocal, [soft guitar]] [analog tape]', '[male vocal] [warm guitar]', '[male vocal, warm guitar]', '[soft guitar, brushed drums]'];
  for (const line of lines) assert.throws(() => assertSafeVocalLyrics(line), LyricsInstructionError);
  assert.doesNotThrow(() => assertSafeVocalLyrics('[Verse] [Spoken]\n[male vocal]\n[soft guitar]'));
});

test('authored lyrics about instruments and intentional inline brackets stay intact', () => {
  const lyrics = [
    'My guitar remembers you, your drums echo in my heart, our bass sings the memories',
    'The guitar weeps at dawn, the drums wait in silence, the bass calls across the night',
    '내 기타는 당신을 기억하고, 브러시 드럼은 내 마음을 노래해, 콘트라베이스와 우리 추억이 남아',
    '君と聴くアコースティックギター、私のドラム、僕のアナログな思い出',
    'アコースティックギターが泣いている、ドラムが待つ、コントラバスが帰る',
    'Ma guitare se souvient, mon cœur bat comme une batterie, notre amour sur une bande analogique',
    'La guitare pleure au matin, la batterie attend, la contrebasse revient dans la nuit',
    'guitar, guitar, guitar',
    'I sing [male vocal, warm guitar] as the words of this song.',
    '[I hold my guitar, you keep the drums in your heart]',
    'Production is what they call it, but I remember your guitar.',
    '[Spoken] Arrangement: I remember your guitar',
  ].join('\n');
  assert.doesNotThrow(() => assertSafeVocalLyrics(lyrics));
  assert.equal(compileLyricsSections([section(lyrics, reportedDescription)]).lyricsPrompt, `[Verse]\n${lyrics}`);
});

test('short multiline and unfinished production blocks reject in all four lyric languages', () => {
  const blocks = [
    '[soul vocal,\nwarm guitar]',
    '[남성 보컬,\n부드러운 통기타 스트로크]',
    '[男性ボーカル、\nアコースティックギター]',
    '[voix masculine,\nguitare acoustique]',
  ];
  for (const block of blocks) {
    assert.ok(block.length < 80);
    for (const variant of [block, block.slice(0, -1), `${block.slice(0, -1)}\nI remember you`]) {
      assert.throws(() => assertSafeVocalLyrics(variant), LyricsInstructionError);
    }
  }
});

test('adjacent structural tags cannot exempt independent production blocks in any lyric language', () => {
  const blocks = ['[male vocal, warm guitar]', '[남성 보컬, 통기타 스트로크]', '[男性ボーカル、ドラム]', '[voix masculine, guitare acoustique]'];
  for (const block of blocks) {
    for (const variant of [`[Chorus] ${block}`, `${block} [Outro]`, `[Verse 2] ${block} [Spoken]`, `[Chorus] ${block.replace(/[,、]/, ',\n')}`]) {
      assert.throws(() => assertSafeVocalLyrics(variant), LyricsInstructionError);
    }
  }
  assert.throws(() => assertSafeVocalLyrics('[Verse] [male vocal] [warm guitar] [Outro]'), LyricsInstructionError);
  assert.doesNotThrow(() => assertSafeVocalLyrics('[Verse 2] [Spoken]\n[Chorus] [soft guitar]\nSing these words'));
});

test('nested and long authored bracketed lyrics survive in English, Korean, Japanese and French', () => {
  const authored = [
    'I [hold] my guitar and remember you',
    '나는 [오래된] 통기타 소리로 당신을 기억해',
    '僕の[古い]アコースティックギターが君を呼ぶ',
    'Je [garde] ma guitare et je pense à toi',
  ];
  for (const words of authored) {
    const nested = `[${words}]`;
    const long = `[${`${words.replace(/[\[\]]/g, '')} `.repeat(5).trim()}]`;
    assert.ok(long.length >= 80);
    for (const lyrics of [nested, long, `[Verse]\n${nested}\n${long}`, `I sing ${nested} as words`]) {
      assert.doesNotThrow(() => assertSafeVocalLyrics(lyrics));
      assert.equal(compileLyricsSections([section(lyrics)]).lyricsPrompt, `[Verse]\n${lyrics}`);
    }
  }
});

test('mood nouns and authored words do not exempt explicit production labels or technical lists', () => {
  const unsafe = [
    '[soul vocal, warm guitar]', '[dream pop vocal, warm piano]',
    '[soul vocal [warm guitar]]', 'soul vocal, warm guitar, brushed drums',
    'Production: I want warm soul vocals', 'Arrangement: lush strings and pads',
    '[Production: I want soul vocals]', '[Mixing: my warm guitar]',
    '편곡: 나의 따뜻한 통기타', '編曲：僕のアコースティックギター', 'Production: ma guitare et mon amour',
  ];
  for (const lyrics of unsafe) assert.throws(() => assertSafeVocalLyrics(lyrics), LyricsInstructionError);
  assert.doesNotThrow(() => assertSafeVocalLyrics('[I pour my soul into this guitar, you keep the drums in your heart]'));
});
