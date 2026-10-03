type Row = Record<string, unknown>;

interface CompletedVideo {
  url: string;
  poster: string;
  completedAt: string;
  timestamp: number;
}

export interface PublicViralVideoRow {
  id: string;
  title: string;
  status: 'completed';
  is_public: true;
  created_at: string;
  completed_at: string;
  play_count: number;
  cover_art_url: string;
  license_hash: string;
}

function object(value: unknown): Row | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}

function text(value: unknown, max = 300): string {
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
}

function metadata(value: unknown): Row | null {
  if (typeof value !== 'string' || value.length > 150_000) return null;
  try { return object(JSON.parse(value)); } catch { return null; }
}

function publicGeneration(row: Row, meta: Row | null): boolean {
  if (!meta || row.is_public === false || meta.isPublic === false || object(row.metadata)?.isPublic === false) return false;
  return row.is_public === true || meta.isPublic === true;
}

function httpsUrl(value: unknown): string {
  const candidate = text(value, 4096);
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password ? parsed.href : '';
  } catch { return ''; }
}

function date(value: unknown): string {
  const candidate = text(value, 100);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : '';
}

function count(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

/** Public list projection only. Never writes jobs, submits media, or returns private planning data. */
export function buildPublicViralVideoRows(generations: Row[], jobs: Row[]): PublicViralVideoRow[] {
  const completed = new Map<string, Map<string, CompletedVideo>>();
  for (const job of jobs) {
    const trackId = text(job.track_id, 200);
    const owner = text(job.user_id, 200);
    const url = httpsUrl(job.video_url);
    const completedAt = date(job.updated_at);
    if (job.status !== 'completed' || !trackId || !owner || !url || !completedAt) continue;
    const timestamp = Date.parse(completedAt);
    const owners = completed.get(trackId) || new Map<string, CompletedVideo>();
    const previous = owners.get(owner);
    if (!previous || timestamp > previous.timestamp) {
      owners.set(owner, { url, poster: httpsUrl(job.poster_url), completedAt, timestamp });
      completed.set(trackId, owners);
    }
  }

  const parsed = generations.map(row => ({ row, id: text(row.id, 200), meta: metadata(row.license_hash) }));
  // Conflicting snapshots of one ID must not expose a row whose newer copy is private.
  const blocked = new Set(parsed.filter(({ row, meta }) => !publicGeneration(row, meta)).map(({ id }) => id));
  const rows = new Map<string, PublicViralVideoRow>();
  for (const { row, id, meta } of parsed) {
    if (!id || blocked.has(id) || row.status !== 'completed' || !meta) continue;
    const bound = completed.get(id)?.get(text(row.user_id, 200));
    const source = text(meta.sourceMenu).toLowerCase();
    if (!bound && source !== 'viral' && source !== 'viral-cf' && meta.viralMode !== true) continue;
    const videoUrl = bound?.url || [meta.video_url, meta.grok_video_url, meta.videoUrl].map(httpsUrl).find(Boolean);
    if (!videoUrl) continue;
    const createdAt = bound?.completedAt || date(row.created_at) || new Date(0).toISOString();
    const publicMeta: Row = {
      sourceMenu: bound ? 'viral-cf' : source,
      viralMode: true,
      video_url: videoUrl,
    };
    for (const key of ['presetId', 'tab_type', 'genCategory', 'genre', 'styleName', 'brand_name']) {
      const value = text(meta[key]);
      if (value) publicMeta[key] = value;
    }
    if (bound) publicMeta.presetId = publicMeta.tab_type = publicMeta.genCategory = 'pet';
    const result: PublicViralVideoRow = {
      id,
      title: text(row.title, 200) || 'Untitled Viral Short',
      status: 'completed',
      is_public: true,
      created_at: createdAt,
      completed_at: bound?.completedAt || date(row.completed_at) || createdAt,
      play_count: count(meta.play_count, meta.viewCount, meta.view_count),
      cover_art_url: bound?.poster || httpsUrl(row.cover_art_url),
      license_hash: JSON.stringify(publicMeta),
    };
    const previous = rows.get(id);
    if (!previous || Date.parse(result.created_at) > Date.parse(previous.created_at)) rows.set(id, result);
  }
  return [...rows.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id));
}
