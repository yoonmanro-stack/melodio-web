import { requireRainProjectUser } from '@/lib/healing-rain/project-server';
import { selectRainBranding } from '@/lib/healing-rain/branding-server';
import { parseSelectBranding } from '@/lib/healing-rain/branding';
import { rainProjectErrorResponse, readRainProjectJson } from '@/lib/healing-rain/projects';
export const dynamic = 'force-dynamic';
export async function PUT(request: Request) {
  try { const { userId } = await requireRainProjectUser(); const input = parseSelectBranding(await readRainProjectJson(request, 1024)); return Response.json(await selectRainBranding(userId, input), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return rainProjectErrorResponse(error); }
}
