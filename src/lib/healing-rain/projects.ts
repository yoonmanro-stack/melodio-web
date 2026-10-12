import { parseRecipe, type RainPlan, type RecipeInput } from './recipes';

export type SaveRainProjectInput = { clientRequestId: string; input: RecipeInput };
export type SavedRainProject = { project: RainPlan; created: boolean };
export type RainProjectPage = { projects: RainPlan[]; nextCursor: string | null };

export class RainProjectError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = 'RainProjectError';
  }
}

// Stable caller-generated identity, scoped to the authenticated account. This
// also accepts legacy draft UUIDs prefixed with "local:" by the import UI.
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/;

export function parseSaveRainProject(value: unknown): SaveRainProjectInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RainProjectError('invalid_request', '저장할 장면 설정을 확인해 주세요.', 400);
  }
  const body = value as Record<string, unknown>;
  if (typeof body.clientRequestId !== 'string' || !REQUEST_ID.test(body.clientRequestId)) {
    throw new RainProjectError('invalid_request', '저장 요청 ID를 확인해 주세요.', 400);
  }
  try {
    // Never accept a caller's owner, compiled prompts, plan ID or timestamps.
    return { clientRequestId: body.clientRequestId, input: parseRecipe(body.input) };
  } catch (error) {
    throw new RainProjectError('invalid_recipe', error instanceof Error ? error.message : '장면 설정을 확인해 주세요.', 400);
  }
}

export function parseRainProjectImport(value: unknown): SaveRainProjectInput[] {
  const projects = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>).projects : null;
  if (!Array.isArray(projects) || projects.length < 1 || projects.length > 50) {
    throw new RainProjectError('invalid_import', '한 번에 1~50개의 장면을 가져올 수 있습니다.', 400);
  }
  // Validate the entire import before the first write.
  const parsed = projects.map(parseSaveRainProject);
  if (new Set(parsed.map(project => project.clientRequestId)).size !== parsed.length) {
    throw new RainProjectError('invalid_import', '가져올 장면의 저장 요청 ID가 중복되었습니다.', 400);
  }
  return parsed;
}

export function parseRainProjectCursor(value: string | null): { createdAt: string; id: string } | null {
  if (value === null) return null;
  const parts = value.split('|');
  if (parts.length !== 2 || !TIMESTAMP.test(parts[0]) || !Number.isFinite(Date.parse(parts[0])) || !UUID.test(parts[1])) {
    throw new RainProjectError('invalid_cursor', '목록의 다음 페이지 정보를 확인해 주세요.', 400);
  }
  return { createdAt: parts[0], id: parts[1].toLowerCase() };
}

/** Bounded streaming reader: a missing/false Content-Length cannot bypass the cap. */
export async function readRainProjectJson(request: Request, maxBytes: number): Promise<unknown> {
  const length = request.headers.get('content-length');
  if (length && Number(length) > maxBytes) throw new RainProjectError('request_too_large', '저장 요청이 너무 큽니다.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RainProjectError('invalid_json', '올바른 JSON 설정이 필요합니다.', 400);
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new RainProjectError('request_too_large', '저장 요청이 너무 큽니다.', 413);
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    try { return JSON.parse(body); }
    catch { throw new RainProjectError('invalid_json', '올바른 JSON 설정이 필요합니다.', 400); }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function rainProjectErrorResponse(error: unknown): Response {
  const known = error instanceof RainProjectError ? error
    : new RainProjectError('persistence_unavailable', '장면 저장소를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', 503);
  return Response.json({ error: known.message, code: known.code }, {
    status: known.status, headers: { 'Cache-Control': 'private, no-store' },
  });
}
