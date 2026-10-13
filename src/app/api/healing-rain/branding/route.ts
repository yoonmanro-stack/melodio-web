import { requireRainProjectUser } from '@/lib/healing-rain/project-server';
import { listRainBranding, saveRainBranding } from '@/lib/healing-rain/branding-server';
import { parseSaveBranding } from '@/lib/healing-rain/branding';
import { rainProjectErrorResponse, readRainProjectJson } from '@/lib/healing-rain/projects';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  try { return Response.json(await listRainBranding(await requireRainProjectUser()), { headers }); }
  catch (error) { return rainProjectErrorResponse(error); }
}
export async function POST(request: Request) {
  try { const { userId } = await requireRainProjectUser(); const input = parseSaveBranding(await readRainProjectJson(request, 8192)); const result = await saveRainBranding(userId, input); return Response.json(result, { status: result.created ? 201 : 200, headers }); }
  catch (error) { return rainProjectErrorResponse(error); }
}
