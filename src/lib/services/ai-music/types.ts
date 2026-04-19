export type AI_ENGINE = 'LYRIA_3_PRO' | 'LYRIA_3_CLIP' | 'SUNO';

export interface GenerateMusicRequest {
  prompt: string;
  durationMode: 'SHORT' | 'FULL'; // SHORT -> CLIP, FULL -> PRO (Lyria)
  preferredEngine?: AI_ENGINE; // User can force Suno if they have the right tier
  isB2BMode?: boolean; // Determines if it's the 1-hour batch compilation
  tags?: string[];
  referenceAudioUrl?: string; // Optional reference
}

export interface GenerateMusicResponse {
  success: boolean;
  audioUrl?: string;
  engineUsed: AI_ENGINE;
  durationMs: number;
  error?: string;
  lyric?: string;
  commercialLicenseValid: boolean; // Flag to show in /vault
}
