export interface NaturalSongPreference {
  minimum: number
  maximum: number
  target?: number
}

export function resolveNaturalSongPreference(metadata: unknown): NaturalSongPreference
