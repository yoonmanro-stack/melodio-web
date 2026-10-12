import { listRainProjects, requireRainProjectUser, saveRainProjects } from '@/lib/healing-rain/project-server';
import { parseRainProjectCursor, parseSaveRainProject, rainProjectErrorResponse, readRainProjectJson } from '@/lib/healing-rain/projects';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  try {
    const auth = await requireRainProjectUser();
    const cursor = parseRainProjectCursor(new URL(request.url).searchParams.get('cursor'));
    return Response.json(await listRainProjects(auth, cursor), { headers });
  } catch (error) { return rainProjectErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireRainProjectUser();
    const input = parseSaveRainProject(await readRainProjectJson(request, 8192));
    const [saved] = await saveRainProjects(userId, [input]);
    return Response.json(saved, { status: saved.created ? 201 : 200, headers });
  } catch (error) { return rainProjectErrorResponse(error); }
}
