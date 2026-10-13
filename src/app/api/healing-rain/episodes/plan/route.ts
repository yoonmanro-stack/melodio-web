import { planRainEpisode, requireRainEpisodeUser } from '@/lib/healing-rain/episode-server';
import { parseEpisodeInput } from '@/lib/healing-rain/episodes';
import { RainProjectError, rainProjectErrorResponse, readRainProjectJson } from '@/lib/healing-rain/projects';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = await requireRainEpisodeUser();
    const value = await readRainProjectJson(request, 16000);
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => key !== 'input')) {
      throw new RainProjectError('invalid_request', '에피소드 입력 설정만 전달해 주세요.', 400);
    }
    const input = parseEpisodeInput((value as Record<string, unknown>).input);
    return Response.json(await planRainEpisode(auth, input), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return rainProjectErrorResponse(error); }
}
