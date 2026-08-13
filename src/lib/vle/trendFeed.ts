import fs from 'fs';
import path from 'path';

/**
 * 트렌드 피드 — 카테고리별 최신 바이럴 신호를 공급한다.
 *
 * 왜 필요했는가:
 *   기존 파이프라인의 트렌드 입력은 0이었다. presets 시드에 요아정·탕후루처럼
 *   과거 소재가 하드코딩돼 있었고, producer-brief 는 /VLE 문서와 카테고리
 *   매트릭스만 읽었다. 트렌드 입력이 없는 상태에서 "최신 트렌드 반영"은
 *   원리적으로 불가능하다 — LLM이 학습 데이터의 옛 밈을 읊을 수밖에 없다.
 *
 * data/viral_shorts_scraped_titles.json 은 이미 viral-cf 와 동일한 카테고리
 * 키(pet, trend, drama, ...)와 hookType, viewCount, publishedAt 을 갖고 있다.
 * 이 파일을 소재 풀로 주입한다.
 */

export interface TrendRow {
  id: string;
  category: string;
  title: string;
  cleanTitle?: string;
  channelTitle?: string;
  viewCount?: number;
  likeCount?: number;
  publishedAt?: string;
  hookType?: string;
}

export interface TrendSignals {
  /** 조회수·최신순으로 뽑은 실제 바이럴 제목 */
  topTitles: string[];
  /** 이 카테고리에서 실제로 통한 훅 유형 분포 */
  hookTypes: { type: string; count: number }[];
  /** 피드에 데이터가 있었는지 (없으면 프롬프트에서 트렌드 블록을 생략한다) */
  available: boolean;
  /** 참고한 행 수 */
  sampleSize: number;
}

const FEED_FILE = 'viral_shorts_scraped_titles.json';

let cachedRows: TrendRow[] | null = null;

function loadRows(): TrendRow[] {
  if (cachedRows) return cachedRows;
  try {
    const filePath = path.join(process.cwd(), 'data', FEED_FILE);
    if (!fs.existsSync(filePath)) {
      console.warn(`[trendFeed] ${FEED_FILE} 없음 — 트렌드 신호 없이 진행`);
      cachedRows = [];
      return cachedRows;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    cachedRows = Array.isArray(parsed) ? (parsed as TrendRow[]) : [];
    return cachedRows;
  } catch (err) {
    console.error('[trendFeed] 피드 로드 실패:', err);
    cachedRows = [];
    return cachedRows;
  }
}

/**
 * 최신성과 인기를 함께 반영한 점수.
 * 조회수만 쓰면 2022년 대박 영상이 영원히 1위를 차지해 "최신 트렌드"가 아니게 된다.
 * 발행 후 경과 개월수로 감쇠시켜 최근 것이 올라오게 한다.
 */
function score(row: TrendRow, nowMs: number): number {
  const views = row.viewCount ?? 0;
  const published = row.publishedAt ? Date.parse(row.publishedAt) : NaN;
  const monthsOld = Number.isNaN(published)
    ? 60
    : Math.max(0, (nowMs - published) / (1000 * 60 * 60 * 24 * 30));
  // 12개월 반감기
  const recency = Math.pow(0.5, monthsOld / 12);
  return Math.log10(views + 10) * recency;
}

export function getTrendSignals(category: string, limit = 8): TrendSignals {
  const rows = loadRows().filter((r) => r.category === category);
  if (rows.length === 0) {
    return { topTitles: [], hookTypes: [], available: false, sampleSize: 0 };
  }

  const nowMs = Date.now();
  const ranked = [...rows].sort((a, b) => score(b, nowMs) - score(a, nowMs));

  const topTitles = ranked
    .slice(0, limit)
    .map((r) => (r.cleanTitle || r.title || '').trim())
    // 해시태그 꼬리는 제목 패턴 학습에 방해가 되므로 잘라낸다.
    .map((t) => t.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.hookType) continue;
    counts.set(r.hookType, (counts.get(r.hookType) ?? 0) + 1);
  }
  const hookTypes = [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return { topTitles, hookTypes, available: topTitles.length > 0, sampleSize: rows.length };
}

/** 트렌드 신호를 LLM 프롬프트 블록으로 렌더링한다. 데이터가 없으면 빈 문자열. */
export function buildTrendDirective(category: string): string {
  const signals = getTrendSignals(category);
  if (!signals.available) return '';

  const titles = signals.topTitles.map((t) => `- ${t}`).join('\n');
  const hooks = signals.hookTypes.map((h) => `${h.type}(${h.count}건)`).join(', ');

  return `=================================================================
실제 트렌드 신호 — "${category}" 카테고리 (표본 ${signals.sampleSize}건, 조회수×최신성 상위)
=================================================================
이 카테고리에서 실제로 터진 숏폼 제목들이다. 소재와 어투의 현재 온도를 여기서 읽어라.
${titles}

이 카테고리에서 통한 훅 유형: ${hooks}

주의: 위 제목을 그대로 베끼지 마라. 어떤 소재·어투·감정이 지금 반응을 얻는지만
참고하고, 소재는 새로 지어내라. 다만 위 목록에 없는 낡은 유행어
(예: 몇 년 지난 디저트 유행, 끝난 시즌의 이슈)는 쓰지 마라.`;
}
