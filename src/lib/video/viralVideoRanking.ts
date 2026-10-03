type RankedVideo = { id: string; videoUrl: string; createdAt: string; viewCount: number };

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return NaN;
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/.exec(value);
  if (calendarDate) {
    const [, year, month, day] = calendarDate.map(Number);
    const monthEnd = new Date(0);
    monthEnd.setUTCFullYear(year, month, 0);
    if (month < 1 || month > 12 || day < 1 || day > monthEnd.getUTCDate()) return NaN;
  }
  return parsed;
}

/** Three UTC calendar months, inclusive, ranked before deduplication and the 20-video limit. */
export function selectTopViralVideos<T extends RankedVideo>(videos: readonly T[], now: Date = new Date()): T[] {
  const current = now.getTime();
  if (!Number.isFinite(current)) return [];
  const cutoff = new Date(current);
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
  const monthEnd = new Date(cutoff.getTime());
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  cutoff.setUTCDate(Math.min(now.getUTCDate(), monthEnd.getUTCDate()));

  const ranked = videos.map(video => ({
    video,
    created: timestamp(video.createdAt),
    views: Number.isFinite(video.viewCount) && video.viewCount >= 0 ? video.viewCount : 0,
  })).filter(item => Number.isFinite(item.created) && item.created >= cutoff.getTime() && item.created <= current)
    .sort((a, b) => b.views - a.views || b.created - a.created);

  const ids = new Set<string>();
  const urls = new Set<string>();
  const selected: T[] = [];
  for (const { video } of ranked) {
    if (ids.has(video.id) || urls.has(video.videoUrl)) continue;
    ids.add(video.id);
    urls.add(video.videoUrl);
    selected.push(video);
    if (selected.length === 20) break;
  }
  return selected;
}
