/** Shared by browser editors, server submissions and worker retries. */
const { preserveReviewedMusicWhileScrubbing } = require('./preset-studio-music-policy');
const SECTION_LABELS = Object.freeze({
  intro: 'Intro', introduction: 'Intro',
  verse: 'Verse', prechorus: 'Pre-Chorus', chorus: 'Chorus', postchorus: 'Post-Chorus',
  bridge: 'Bridge', outro: 'Outro', ending: 'Outro',
  hook: 'Hook', refrain: 'Refrain', interlude: 'Interlude',
  instrumental: 'Instrumental', instrumentalbreak: 'Instrumental Break',
  break: 'Break', breakdown: 'Breakdown', dancebreak: 'Dance Break',
  solo: 'Solo', guitarsolo: 'Guitar Solo', pianosolo: 'Piano Solo',
  spoken: 'Spoken', spokenword: 'Spoken', rap: 'Rap',
});

function sectionLabel(value) {
  if (typeof value !== 'string') return 'Verse';
  const raw = value.trim().replace(/^\[([^\[\]]+)\]$/, '$1');
  const match = raw.match(/^([a-z][a-z\s_-]*?)(?:[\s_-]*(\d{1,3}))?$/i);
  if (!match) return 'Verse';
  const key = match[1].toLowerCase().replace(/[\s_-]/g, '');
  const label = Object.hasOwn(SECTION_LABELS, key) ? SECTION_LABELS[key] : undefined;
  return label ? `${label}${match[2] ? ` ${match[2]}` : ''}` : 'Verse';
}

/** Only metadata is normalized; sung content is never parsed or rewritten. */
function normalizeDescription(value) {
  return typeof value === 'string' ? value.replace(/[\[\]]/g, ' ').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim() : '';
}

function compileLyricsSections(sections) {
  const lyrics = [];
  const styleDescriptions = [];
  const seenDescriptions = new Set();
  if (!Array.isArray(sections)) return { lyricsPrompt: '', styleDescriptions };
  for (const section of sections) {
    if (!section || typeof section !== 'object' || typeof section.content !== 'string') continue;
    const description = normalizeDescription(section.description);
    const key = description.toLowerCase();
    if (description && !seenDescriptions.has(key)) {
      seenDescriptions.add(key);
      styleDescriptions.push(description);
    }
    if (section.content.trim()) lyrics.push(`[${sectionLabel(section.type)}]\n${section.content}`);
  }
  return { lyricsPrompt: lyrics.join('\n\n'), styleDescriptions };
}

function styleBudget(maxChars) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 0 || maxChars > 1000) {
    throw new RangeError('Style budget must be an integer between 0 and 1000.');
  }
  return maxChars;
}

function boundedPrefix(text, budget) {
  const prefix = text.slice(0, budget);
  // A provider character limit must not leave half of an emoji/supplementary letter.
  return /[\uD800-\uDBFF]$/.test(prefix) ? prefix.slice(0, -1) : prefix;
}

function descriptionClauses(value) {
  return normalizeDescription(value).split(',').map(clause => clause.trim()).filter(Boolean);
}

/** Keep the existing style first; add only complete, previously absent clauses. */
function mergeLyricsDescriptions(stylePrompt, descriptions, maxChars = 1000) {
  const budget = styleBudget(maxChars);
  let result = boundedPrefix(typeof stylePrompt === 'string' ? stylePrompt.trim() : '', budget);
  const seen = new Set(descriptionClauses(result).map(clause => clause.toLowerCase()));
  if (!Array.isArray(descriptions)) return result;
  for (const description of descriptions) {
    for (const clause of descriptionClauses(description)) {
      const key = clause.toLowerCase();
      if (seen.has(key)) continue;
      const addition = `${result ? ', ' : ''}${clause}`;
      if (result.length + addition.length > budget) continue;
      result += addition;
      seen.add(key);
    }
  }
  return result;
}

/** Match the server's existing scrubConflictingVocalTags solo rules. */
function scrubSoloVocalStyle(stylePrompt, vocalGender) {
  return preserveReviewedMusicWhileScrubbing(stylePrompt, vocalGender, scrubSoloVocalTerms);
}
function scrubSoloVocalTerms(stylePrompt, vocalGender) {
  const gender = typeof vocalGender === 'string' ? vocalGender.trim().toLowerCase() : '';
  let cleaned = stylePrompt;
  if (gender === 'female' || gender === 'f') {
    cleaned = cleaned
      .replace(/\b(male|man|men|boy|baritone|tenor|gentleman)\b\s*(voice|vocals|vocal)?/gi, '')
      .replace(/\b(duet|duo|mixed vocal|mixed vocals)\b/gi, '')
      .replace(/(남성\s*보컬|남성|바리톤|테너|혼성\s*보컬|혼성|듀엣)/g, '')
      .replace(/,\s*,/g, ',');
  } else if (gender === 'male' || gender === 'm') {
    cleaned = cleaned
      .replace(/\b(female|woman|women|lady|girl|soprano|alto|contralto)\b\s*(voice|vocals|vocal)?/gi, '')
      .replace(/\b(duet|duo|mixed vocal|mixed vocals)\b/gi, '')
      .replace(/(여성\s*보컬|여성|소프라노|알토|혼성\s*보컬|혼성|듀엣)/g, '')
      .replace(/,\s*,/g, ',');
  } else return stylePrompt;
  return cleaned.split(',').map(part => part.trim()).filter(Boolean).join(', ');
}

/** Raw lyrics remain intact when there is no usable structured sung content. */
function prepareLyricsSubmission({ stylePrompt, lyricsPrompt, lyricsSections, isInstrumental, vocalGender, maxStyleChars = 1000 }) {
  const originalLyrics = typeof lyricsPrompt === 'string' ? lyricsPrompt : '';
  if (isInstrumental === true) {
    return { stylePrompt: mergeLyricsDescriptions(stylePrompt, [], maxStyleChars), lyricsPrompt: originalLyrics, styleDescriptions: [] };
  }
  const compiled = compileLyricsSections(lyricsSections);
  // Scrub before budgeting too, so removed conflicts cannot occupy space needed
  // by arrangement clauses or accumulate as shortened clauses on a retry.
  const soloStyle = scrubSoloVocalStyle(stylePrompt, vocalGender);
  const soloDescriptions = compiled.styleDescriptions.map(description => scrubSoloVocalStyle(description, vocalGender));
  return {
    stylePrompt: scrubSoloVocalStyle(mergeLyricsDescriptions(soloStyle, soloDescriptions, maxStyleChars), vocalGender),
    lyricsPrompt: compiled.lyricsPrompt || originalLyrics,
    styleDescriptions: compiled.styleDescriptions,
  };
}

const PRODUCTION_TERMS = /\b(?:vocals?|guitars?|drums?|bass|pianos?|saxophones?|synth(?:esizer)?s?|microphone|vibrato|mixing|mastering|production|arrangement|analog|console|tape|reverb|compression|tempo|bpm|guitare|batterie|contrebasse|analogique|r[eé]verb[eé]ration)\b|\b(?:male|female)\s+voice\b|\bvoix\s+(?:masculine|f[eé]minine)\b|통기타|기타\s*스트로크|브러시\s*드럼|콘트라베이스|마이크|비브라토|꺾기|아날로그|콘솔|테이프|리버브|편곡|창법|믹싱|마스터링|보컬|アコースティックギター|ドラム|コントラバス|マイク|ビブラート|アナログ|ミックス|リバーブ|ボーカル|編曲/i;
const PRODUCTION_LABEL = /^(?:arrangement|production|mixing|music[ -]?directions?|vocal[ -]?style|편곡(?:\s*지시)?|제작|믹싱|음악\s*(?:지시|설명|방향)|연주\s*지시|보컬\s*스타일|창법|編曲|プロダクション|ミキシング|音楽(?:の)?(?:指示|ディレクション)|ボーカル(?:の)?スタイル|歌唱スタイル)\s*[:：]\s*(.+)$/i;
// Metadata lists have noun/adjective phrases; ordinary first-person narratives
// about guitars and microphones must remain available as authored sung words.
const AUTHORED_WORDS = /\b(?:i|i'm|i've|i'll|me|my|mine|you|your|yours|we|our|ours|us|he|his|she|her|hers|they|their|theirs|love|miss|remember|dream|heart|hearts|soul|souls|forever|memory|memories|falls?|remembers?|cries|weeps|waits?|shines|returns?|comes?|runs?|finds?|calls?|holds?|dances?|flies|carries|sings?|je|moi|mon|ma|mes|tu|toi|ton|ta|tes|nous|notre|nos|vous|votre|vos|amour|souvenir|souviens|chante|pleure|attend|revient|danse|coeur|cœur)\b|(?:^|\s)(?:나|내|너|그대|당신|우리)(?:는|의|가|를|와|에게)?(?:\s|$)|사랑|마음|추억|기억|노래해|부르네|私|僕|君|あなた|わたし|ぼく|きみ|思い出|歌う|歌って|が(?:泣|待|帰|歌|揺|呼|踊)/i;
// Mood/genre nouns alone do not make a technical cue an authored sentence.
const METADATA_MOOD_WORDS = /\b(?:soul|souls|heart|hearts|love|dream|forever|memory|memories|amour|souvenir|coeur|cœur)\b|사랑|마음|추억|기억|思い出/gi;

function hasAuthoredWords(value) {
  return AUTHORED_WORDS.test(value.replace(METADATA_MOOD_WORDS, ''));
}

function productionList(value, minimumClauses) {
  const clauses = normalizeDescription(value).split(/[,，、]/).map(clause => clause.trim()).filter(Boolean);
  const unique = [...new Set(clauses.map(clause => clause.toLowerCase()))];
  return unique.length >= minimumClauses && clauses.every(clause => PRODUCTION_TERMS.test(clause) && !hasAuthoredWords(clause));
}

/** Return top-level blocks only when the entire line is bracket metadata. */
function bracketOnlyLine(value) {
  const blocks = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '[') {
      if (depth++ === 0) current = '';
      else current += char;
    } else if (char === ']') {
      if (depth === 0) return null;
      if (--depth === 0) blocks.push(current);
      else current += char;
    } else if (depth > 0) current += char;
    else if (char.trim()) return null;
  }
  if (depth > 0) blocks.push(current);
  return blocks.length ? { blocks, unfinished: depth > 0 } : null;
}

function structuralBlock(value) {
  const match = value.trim().match(/^([a-z][a-z\s_-]*?)(?:[\s_-]*(\d{1,3}))?$/i);
  return Boolean(match && Object.hasOwn(SECTION_LABELS, match[1].toLowerCase().replace(/[\s_-]/g, '')));
}

function assertSafeBracketMetadata(metadata) {
  const blocks = metadata.blocks.filter(block => !structuralBlock(block));
  for (const block of blocks) {
    const normalized = normalizeDescription(block);
    const labeled = normalized.match(PRODUCTION_LABEL);
    if (labeled || productionList(block, 2)) {
      throw new LyricsInstructionError();
    }
    if ((/[\[\]]/.test(block) || block.length >= 78) && PRODUCTION_TERMS.test(block) && !hasAuthoredWords(normalized)) {
      throw new LyricsInstructionError();
    }
  }
  if (productionList(blocks.join(', '), 2)) throw new LyricsInstructionError();
}

class LyricsInstructionError extends Error {
  constructor() {
    super('편곡·창법 설명이 가사 본문에 섞여 있습니다. 설명을 음악 스타일로 옮기거나 가사를 다시 생성해 주세요.');
    this.name = 'LyricsInstructionError';
    this.code = 'lyrics_instruction_in_content';
  }
}

/** Flag clear metadata blocks, without deleting or reinterpreting authored words. */
function assertSafeVocalLyrics(lyrics) {
  if (typeof lyrics !== 'string') return;
  const lines = lyrics.split(/\r?\n/);
  // Check each row before walking multiline brackets, so an unfinished authored
  // bracket cannot hide an explicit production label on a later row.
  for (const line of lines) {
    const first = line.trimStart();
    const labeled = first.match(PRODUCTION_LABEL);
    if (labeled) throw new LyricsInstructionError();
    const metadata = bracketOnlyLine(first);
    if (metadata) assertSafeBracketMetadata(metadata);
    if (!first.startsWith('[') && productionList(first, 3)) throw new LyricsInstructionError();
  }
  for (let startLine = 0; startLine < lines.length; startLine++) {
    const first = lines[startLine].trimStart();
    if (!first.startsWith('[')) continue;
    let block = first;
    let metadata = bracketOnlyLine(block);
    let endLine = startLine;
    // Inspect incomplete blocks too: later authored words must not hide an
    // already explicit production list left unclosed by a generated response.
    while (metadata?.unfinished && endLine + 1 < lines.length) {
      block += `\n${lines[++endLine]}`;
      metadata = bracketOnlyLine(block);
      if (metadata) assertSafeBracketMetadata(metadata);
    }
    startLine = endLine;
  }
}

module.exports = { compileLyricsSections, mergeLyricsDescriptions, prepareLyricsSubmission, LyricsInstructionError, assertSafeVocalLyrics };
