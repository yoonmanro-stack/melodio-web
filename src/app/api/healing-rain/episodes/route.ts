import { listRainEpisodes, requireRainEpisodeUser, saveRainEpisode } from '@/lib/healing-rain/episode-server';
import { parseSaveEpisode } from '@/lib/healing-rain/episodes';
import { parseRainProjectCursor, rainProjectErrorResponse, readRainProjectJson } from '@/lib/healing-rain/projects';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  try {
    const auth = await requireRainEpisodeUser();
    const cursor = parseRainProjectCursor(new URL(request.url).searchParams.get('cursor'));
    return Response.json(await listRainEpisodes(auth, cursor), { headers });
  } catch (error) { return rainProjectErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRainEpisodeUser();
    const input = parseSaveEpisode(await readRainProjectJson(request, 16000));
    const saved = await saveRainEpisode(auth, input);
    return Response.json(saved, { status: saved.created ? 201 : 200, headers });
  } catch (error) { return rainProjectErrorResponse(error); }
}
