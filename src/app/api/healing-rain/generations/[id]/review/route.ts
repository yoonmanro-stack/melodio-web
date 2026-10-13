import { requireRainGenerationUser, reviewRainGeneration } from '@/lib/healing-rain/generation-server';
import { parseRainGenerationId, parseRainReviewInput } from '@/lib/healing-rain/generations';
import { rainProjectErrorResponse, readRainProjectJson } from '@/lib/healing-rain/projects';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRainGenerationUser();
    const id = parseRainGenerationId((await context.params).id);
    const input = parseRainReviewInput(await readRainProjectJson(request, 4096));
    return Response.json(await reviewRainGeneration(auth, id, input), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return rainProjectErrorResponse(error); }
}
