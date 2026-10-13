import { getRainEpisode, requireRainEpisodeUser } from '@/lib/healing-rain/episode-server';
import { parseEpisodeId } from '@/lib/healing-rain/episodes';
import { rainProjectErrorResponse } from '@/lib/healing-rain/projects';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRainEpisodeUser();
    const id = parseEpisodeId((await context.params).id);
    return Response.json(await getRainEpisode(auth, id), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return rainProjectErrorResponse(error); }
}
