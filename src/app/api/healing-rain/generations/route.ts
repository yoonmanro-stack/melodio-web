import { createRainGeneration, listRainGenerations, requireRainGenerationUser } from '@/lib/healing-rain/generation-server';
import { parseCreateRainGeneration, parseRainGenerationId } from '@/lib/healing-rain/generations';
import { rainProjectErrorResponse, readRainProjectJson } from '@/lib/healing-rain/projects';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  try {
    const auth = await requireRainGenerationUser();
    const projectId = parseRainGenerationId(new URL(request.url).searchParams.get('projectId'));
    return Response.json(await listRainGenerations(auth, projectId), { headers });
  } catch (error) { return rainProjectErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRainGenerationUser();
    const input = parseCreateRainGeneration(await readRainProjectJson(request, 2048));
    const saved = await createRainGeneration(auth, input);
    return Response.json(saved, { status: saved.created ? 201 : 200, headers });
  } catch (error) { return rainProjectErrorResponse(error); }
}
