import { requireRainProjectUser } from '@/lib/healing-rain/project-server';
import { uploadRainBrandingLogo } from '@/lib/healing-rain/branding-server';
import { readBrandingLogo } from '@/lib/healing-rain/branding';
import { rainProjectErrorResponse } from '@/lib/healing-rain/projects';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { const { userId } = await requireRainProjectUser(); return Response.json(await uploadRainBrandingLogo(userId, await readBrandingLogo(request)), { status: 201, headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { return rainProjectErrorResponse(error); }
}
