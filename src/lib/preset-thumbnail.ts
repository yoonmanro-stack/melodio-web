import type { Preset } from '@/types'

const ASSET_BASE = 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets'

/** Only explicit, concept-specific artwork belongs to a bundled preset. */
export const BUNDLED_PRESET_THUMBNAILS: Readonly<Record<string, string>> = {
  'developer-debugging': `${ASSET_BASE}/developer-debugging.png`,
  'iced-oolong-tea': `${ASSET_BASE}/iced-oolong-tea.png`,
  'tokyo-midnight-1984': `${ASSET_BASE}/tokyo-midnight-1984.png`,
  'matcha-kyoto-jazz': `${ASSET_BASE}/matcha-kyoto-jazz.png`,
  'french-vintage-chanson': `${ASSET_BASE}/french-vintage-chanson.png`,
  'deep-sleep-drift': `${ASSET_BASE}/deep-sleep-drift.png`,
  'dead-mall-nostalgia': '/preset-thumbnails/dead-mall-nostalgia-photo-v1.webp',
  'joseon-hip-hop': '/preset-thumbnails/joseon-hip-hop-photo-v1.webp',
  'joseon-hiphop': '/preset-thumbnails/joseon-hip-hop-photo-v1.webp',
  'traditional-trot-master': '/preset-thumbnails/traditional-trot-master-photo-v1.webp',
  'highway-disco-trot': '/preset-thumbnails/highway-disco-trot-photo-v1.webp',
  'acoustic-folk-trot': '/preset-thumbnails/acoustic-folk-trot-photo-v1.webp',
}

function cleanThumbnailUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const url = value.trim()
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    if (parsed.hostname === 'unsplash.com' || parsed.hostname.endsWith('.unsplash.com')) return null
    return url
  } catch {
    return null
  }
}

/** Missing images return null so the card can show its own emoji and title. */
export function getPresetThumbnail(preset: Preset, isCustom = false): string | null {
  const candidates = [
    preset.metadata?.thumbnail_url,
    preset.metadata?.cardImage,
    preset.thumbnailUrl,
    preset.thumbnail_url,
  ]
  for (const candidate of candidates) {
    const image = cleanThumbnailUrl(candidate)
    if (image) return image
  }
  return isCustom ? null : BUNDLED_PRESET_THUMBNAILS[preset.id] ?? null
}

/** Absent or invalid counts must not become simulated popularity. */
export function getPresetUsageCount(preset: Preset): number | null {
  const count = preset.metadata?.usage_count
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null
}
