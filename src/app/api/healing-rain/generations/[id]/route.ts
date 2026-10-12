import { getRainGeneration, requireRainGenerationUser } from '@/lib/healing-rain/generation-server';
import { parseRainGenerationId } from '@/lib/healing-rain/generations';
import { rainProjectErrorResponse } from '@/lib/healing-rain/projects';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRainGenerationUser();
    const id = parseRainGenerationId((await context.params).id);
    return Response.json(await getRainGeneration(auth, id), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return rainProjectErrorResponse(error); }
}
