import { requireRainEpisodeUser, reviewRainEpisode } from '@/lib/healing-rain/episode-server';
import { parseEpisodeId, parseEpisodeReview } from '@/lib/healing-rain/episodes';
import { rainProjectErrorResponse, readRainProjectJson } from '@/lib/healing-rain/projects';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireRainEpisodeUser();
    const id = parseEpisodeId((await context.params).id);
    const input = parseEpisodeReview(await readRainProjectJson(request, 16000));
    const saved = await reviewRainEpisode(auth, id, input);
    return Response.json(saved, { status: saved.created ? 201 : 200, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return rainProjectErrorResponse(error); }
}
