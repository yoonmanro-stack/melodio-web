import { GenerateMusicRequest, GenerateMusicResponse } from './types';
import { generateWithLyria } from './lyria-engine';
import { generateWithSuno } from './suno-engine';

/**
 * Dual Engine Orchestrator
 * Handles Dynamic Routing, Cost Optimization, and Failover for Melodio B2B
 */
export async function generateMusic(req: GenerateMusicRequest): Promise<GenerateMusicResponse> {
  console.log(`[Orchestrator] Request received. DurationMode: ${req.durationMode}`);
  
  // 1. Determine Default Engine based on Cost & Duration
  let primaryEngine = req.preferredEngine;
  if (!primaryEngine) {
    primaryEngine = req.durationMode === 'SHORT' ? 'LYRIA_3_CLIP' : 'LYRIA_3_PRO';
  }

  // 2. Try generation with Failover Logic
  try {
    if (primaryEngine === 'SUNO') {
      try {
        console.log('[Orchestrator] Routing to Suno Engine (Vocal/Pop optimized)');
        return await generateWithSuno(req);
      } catch (sunoError) {
        console.warn('[Orchestrator] Suno Engine Failed. Triggering Failover to Lyria 3 Pro!', sunoError);
        // Failover: Auto switch to Lyria 3 Pro to prevent downtime
        return await generateWithLyria({ ...req, preferredEngine: 'LYRIA_3_PRO' });
      }
    } else {
      // Lyria Route (High Fidelity / Commercial B2B)
      console.log(`[Orchestrator] Routing to ${primaryEngine} (Cost Optimized)`);
      return await generateWithLyria(req);
    }
  } catch (globalError) {
    console.error('[Orchestrator] Critical Global Failure in both engines', globalError);
    return {
      success: false,
      engineUsed: primaryEngine,
      durationMs: 0,
      error: 'CRITICAL_FAILURE',
      commercialLicenseValid: false
    };
  }
}
