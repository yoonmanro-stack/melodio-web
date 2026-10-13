import { requireRainProjectUser } from '@/lib/healing-rain/project-server';
import { saveRainBranding } from '@/lib/healing-rain/branding-server';
import { parseBrandingId, parseSaveBranding } from '@/lib/healing-rain/branding';
import { rainProjectErrorResponse, readRainProjectJson } from '@/lib/healing-rain/projects';
export const dynamic = 'force-dynamic';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { userId } = await requireRainProjectUser(); const id = parseBrandingId((await context.params).id); const input = parseSaveBranding(await readRainProjectJson(request, 8192), true); return Response.json(await saveRainBranding(userId, input, id), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return rainProjectErrorResponse(error); }
}
