import { requireRainEpisodeUser } from '@/lib/healing-rain/episode-server';
import { getEpisodeCatalog } from '@/lib/healing-rain/episodes';
import { rainProjectErrorResponse } from '@/lib/healing-rain/projects';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireRainEpisodeUser();
    return Response.json(getEpisodeCatalog(), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return rainProjectErrorResponse(error); }
}
