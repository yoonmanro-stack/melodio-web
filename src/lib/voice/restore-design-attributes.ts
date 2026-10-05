import type { VoiceDnaRecord } from '../voice-dna-scrubber'

/** Restore editable tone settings only; sample URLs and provider identity are separate. */
export function restoreDesignAttributes(value: unknown): VoiceDnaRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const row = value as Record<string, unknown>
  const physical = row.physical_layers
  if (!physical || typeof physical !== 'object' || Array.isArray(physical)) return undefined
  const p = physical as Record<string, unknown>
  if (p.gender !== 'female' && p.gender !== 'male' && p.gender !== 'duet') return undefined
  const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : undefined
  const string = (v: unknown, limit = 80) => typeof v === 'string' ? v.trim().slice(0, limit) : undefined
  const words = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, 8).map(s => s.trim().slice(0, 48)) : []
  const perf = row.performance && typeof row.performance === 'object' && !Array.isArray(row.performance)
    ? row.performance as Record<string, unknown> : {}
  return {
    vd_code: string(row.vd_code) || 'VD-SAVED',
    name: string(row.name) || 'Saved vocal style',
    physical_layers: {
      gender: p.gender,
      age: p.age === 'young' || p.age === 'mature' || p.age === 'childish' ? p.age : undefined,
      pitch: number(p.pitch), brightness: number(p.brightness), chest: number(p.chest),
      head: number(p.head), weight: number(p.weight),
    },
    textures: words(row.textures), emotions: words(row.emotions),
    performance: { power: number(perf.power), dynamics: number(perf.dynamics), vibrato: number(perf.vibrato), groove: number(perf.groove) },
    noise_entropy: number(row.noise_entropy), style: string(row.style),
    reverb: string(row.reverb), delivery: string(row.delivery ?? p.delivery, 160),
    language: string(row.language ?? p.language, 16), preview_genre: string(row.preview_genre ?? p.preview_genre, 32),
  }
}
