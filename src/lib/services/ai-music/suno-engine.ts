import { GenerateMusicRequest, GenerateMusicResponse } from './types';

/**
 * Unofficial Suno API Wrapper Stub
 * Expects a third-party API implementation like aimlapi
 */
export async function generateWithSuno(req: GenerateMusicRequest): Promise<GenerateMusicResponse> {
  console.log('[SunoEngine] Calling 3rd Party unofficial Suno API');
  
  // Intentionally built-in failover test trigger
  if (req.prompt.includes('failover_test')) {
    throw new Error('Suno API Timeout / Rate Limit Exceeded!');
  }

  // Mock artificial delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    success: true,
    audioUrl: `https://mock-suno.com/api/audio-${Date.now()}.mp3`,
    engineUsed: 'SUNO',
    durationMs: 120000, // Roughly 2 minutes typical output
    commercialLicenseValid: true, // Assumes underlying account is Pro/Premier
  };
}
