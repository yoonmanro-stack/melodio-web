import { requireRainProjectUser, saveRainProjects } from '@/lib/healing-rain/project-server';
import { parseRainProjectImport, rainProjectErrorResponse, readRainProjectJson } from '@/lib/healing-rain/projects';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { userId } = await requireRainProjectUser();
    const inputs = parseRainProjectImport(await readRainProjectJson(request, 409600));
    const saved = await saveRainProjects(userId, inputs);
    const createdCount = saved.filter(item => item.created).length;
    return Response.json({
      projects: saved.map(item => item.project), createdCount, existingCount: saved.length - createdCount,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return rainProjectErrorResponse(error); }
}
