import { isDanceMetadata } from './preset';

export type DashboardDanceTrack = {
  id: string;
  title?: string;
  user_id?: string;
  status?: string;
  license_hash?: string;
  audio_url?: string;
  source_audio_url?: string;
  video_url?: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadata(track: DashboardDanceTrack): Record<string, unknown> {
  try { return record(JSON.parse(track.license_hash || '{}')); } catch { return {}; }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mediaUrl(value: unknown): string {
  const url = text(value);
  return /^https?:\/\//i.test(url) ? url : '';
}

export function getDashboardTrackCategory(track: DashboardDanceTrack): string {
  const meta = metadata(track);
  if (meta.sourceMenu === 'japan' || meta.presetId === 'japan_landing') return 'japan';
  if (meta.sourceMenu === 'style-library' || text(meta.presetId).includes('style') || meta.sourceMenu === 'style') return 'style-library';
  if (meta.sourceMenu === 'viral-cf' || meta.sourceMenu === 'viral') return 'viral-cf';
  if (meta.sourceMenu === 'audio-forge') return 'audio-forge';
  if (text(track.title).toLowerCase().includes('style') || text(track.license_hash).toLowerCase().includes('style-library')) return 'style-library';
  return 'audio-forge';
}

/** The music remains one library item even after its first video is completed. */
export function getDashboardLibraryCategory(track: DashboardDanceTrack): string | null {
  const meta = metadata(track);
  if (isDanceMetadata(meta)) return meta.danceVariant ? null : 'audio-forge';
  const category = getDashboardTrackCategory(track);
  return category === 'viral-cf' ? null : category;
}

export function getDashboardMusicTitle(track: DashboardDanceTrack): string {
  const meta = metadata(track);
  return (isDanceMetadata(meta) && text(meta.originalMusicTitle)) || track.title || 'Untitled Track';
}

export function getDashboardDanceAudio(track: DashboardDanceTrack) {
  const meta = metadata(track);
  if (!isDanceMetadata(meta)) return null;
  const job = record(meta.danceVideo);
  const selection = record(meta.danceAudioSelection);
  return {
    title: getDashboardMusicTitle(track),
    fullAudioUrl: mediaUrl(track.audio_url) || mediaUrl(track.source_audio_url),
    clipAudioUrl: mediaUrl(job.audioUrl) || mediaUrl(selection.audioUrl),
  };
}

const VIDEO_STATUS_LABELS: Record<string, string> = {
  preparing: '30초 음원·콘티 준비 중',
  ready: '30초 음원·콘티 준비 완료 · 영상 제작 대기',
  image: '이미지 제작 중',
  clip1: '첫 번째 영상 제작 중',
  bridge: '다음 장면 준비 중',
  clip2: '두 번째 영상 제작 중',
  render: '최종 영상 편집 중',
  attention: '작업 확인 필요',
  completed: '영상 결과 확인 필요',
};

export function getDashboardDanceProductionRows<T extends DashboardDanceTrack>(tracks: T[], userId: string | null) {
  if (!userId) return [];
  return tracks.flatMap(track => {
    if (track.user_id !== userId) return [];
    const meta = metadata(track);
    if (!isDanceMetadata(meta) || !meta.danceVariant) return [];
    const job = record(meta.danceVideo);
    if ([track.video_url, meta.video_url, meta.grok_video_url, meta.videoUrl, job.videoUrl].some(value => mediaUrl(value))) return [];
    return [{
      track,
      statusLabel: VIDEO_STATUS_LABELS[text(job.status)] || (track.status === 'failed' ? '작업 확인 필요' : '30초 음원 준비 완료 · 새 영상 제작 대기'),
    }];
  });
}

export function dashboardDanceDownloadUrl(url: string, title: string, kind: 'full' | 'clip'): string {
  const filename = `${title.replace(/[\\/:*?"<>|\r\n]/g, '_').trim() || 'melodio-dance'}${kind === 'clip' ? '_30s.wav' : '.mp3'}`;
  return `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}
