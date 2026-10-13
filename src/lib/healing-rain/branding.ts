import { cleanBrandingText, normalizeBrandingConfig, type BrandingConfig } from '../../../shared/healing-rain/branding';
import { RainProjectError } from './projects';
export type SaveBrandingInput = { clientRequestId: string; name: string; config: BrandingConfig; expectedVersion?: number };
export type SelectBrandingInput = { clientRequestId: string; profileId: string | null; expectedVersion: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(message = '브랜딩 설정을 확인해 주세요.'): never { throw new RainProjectError('invalid_branding', message, 400); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); return value as Record<string, unknown>; }
function requestId(value: unknown): string { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(value)) invalid('저장 요청 ID를 확인해 주세요.'); return value; }
function version(value: unknown, minimum: number): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > 2147483646) invalid('설정 버전을 확인해 주세요.'); return value; }
export function parseBrandingId(value: unknown): string { if (typeof value !== 'string' || !UUID.test(value)) invalid('프로필 ID를 확인해 주세요.'); return value.toLowerCase(); }
export function parseSaveBranding(value: unknown, update = false): SaveBrandingInput {
  const body = record(value);
  const clientRequestId = requestId(body.clientRequestId);
  if (typeof body.name !== 'string' || Array.from(body.name).length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(body.name)) invalid('프로필 이름은 1~80자로 입력해 주세요.');
  const name = cleanBrandingText(body.name, 80); if (!name) invalid('프로필 이름을 입력해 주세요.');
  let config: BrandingConfig;
  try { config = normalizeBrandingConfig(body.config, { strict: true }); } catch { invalid(); }
  return { clientRequestId, name, config, ...(update ? { expectedVersion: version(body.expectedVersion, 1) } : {}) };
}
export function parseSelectBranding(value: unknown): SelectBrandingInput {
  const body = record(value);
  return { clientRequestId: requestId(body.clientRequestId), profileId: body.profileId === null ? null : parseBrandingId(body.profileId), expectedVersion: version(body.expectedVersion, 0) };
}
export const BRANDING_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export async function readBrandingLogo(request: Request): Promise<{ data: Buffer; contentType: string }> {
  const contentType = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) throw new RainProjectError('invalid_logo', 'PNG, JPEG, WebP 로고만 업로드할 수 있습니다.', 415);
  if (Number(request.headers.get('content-length')) > BRANDING_LOGO_MAX_BYTES) throw new RainProjectError('request_too_large', '로고는 2MB 이하여야 합니다.', 413);
  const reader = request.body?.getReader(); if (!reader) invalid('로고 파일을 선택해 주세요.');
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > BRANDING_LOGO_MAX_BYTES) throw new RainProjectError('request_too_large', '로고는 2MB 이하여야 합니다.', 413); parts.push(value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!size) invalid('로고 파일을 선택해 주세요.');
  return { data: Buffer.concat(parts), contentType };
}
