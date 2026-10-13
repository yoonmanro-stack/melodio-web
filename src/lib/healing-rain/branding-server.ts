import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import type { Json } from '@/types/database';
import { createBrandingSnapshot, normalizeBrandingConfig, type BrandingProfile, type BrandingSnapshot } from '../../../shared/healing-rain/branding';
import { requireRainProjectUser } from './project-server';
import { RainProjectError } from './projects';
import { BRANDING_LOGO_MAX_BYTES, type SaveBrandingInput, type SelectBrandingInput } from './branding';
const BUCKET = 'healing-rain';
type ProfileRow = { id: string; user_id: string; name: string; version: number; config: Json; created_at: string; updated_at: string };
type SelectionRow = { user_id: string; profile_id: string | null; version: number };
type BrandingDatabase = { public: { Tables: {
  healing_rain_branding_profiles: { Row: ProfileRow; Insert: never; Update: never; Relationships: [] };
  healing_rain_branding_selection: { Row: SelectionRow; Insert: never; Update: never; Relationships: [] };
}; Views: Record<string, never>; Functions: { mutate_healing_rain_branding: { Args: { p_user_id: string; p_request_id: string; p_action: string; p_profile_id: string | null; p_expected_version: number | null; p_name: string | null; p_config: Json }; Returns: Json } }; Enums: Record<string, never>; CompositeTypes: Record<string, never> } };
type Auth = Awaited<ReturnType<typeof requireRainProjectUser>>;
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new RainProjectError('persistence_not_ready', '브랜딩 저장 기능을 준비 중입니다.', 503);
  return createClient<BrandingDatabase>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const MISSING_DATABASE = ['42P01', '42883', '42703', 'PGRST202', 'PGRST204', 'PGRST205'];
function databaseError(error: { code?: string }): never {
  if (MISSING_DATABASE.includes(error.code ?? '')) throw new RainProjectError('persistence_not_ready', '브랜딩 저장 기능을 준비 중입니다.', 503);
  if (error.code === '40001') throw new RainProjectError('branding_version_conflict', '다른 곳에서 프로필이 수정되었습니다. 새로고침한 뒤 다시 저장해 주세요.', 409);
  if (error.code === '23505') throw new RainProjectError('request_conflict', '같은 요청 ID에 다른 설정을 저장할 수 없습니다.', 409);
  if (error.code === 'P0002') throw new RainProjectError('branding_not_found', '선택한 프로필을 찾을 수 없습니다.', 404);
  if (error.code === '54000') throw new RainProjectError('branding_limit', '프로필은 최대 30개까지 저장할 수 있습니다.', 409);
  if (['22023', '23514'].includes(error.code ?? '')) throw new RainProjectError('invalid_branding', '브랜딩 설정을 확인해 주세요.', 400);
  if (error.code === '42501') throw new RainProjectError('persistence_forbidden', '브랜딩 저장소에 접근할 수 없습니다.', 403);
  throw new RainProjectError('persistence_unavailable', '브랜딩 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.', 503);
}
function ownedLogo(userId: string, path: string): boolean {
  return new RegExp(`^${userId}/branding/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.webp$`, 'i').test(path);
}
async function previewLogo(userId: string, path: string | null): Promise<string | null> {
  if (!path || !ownedLogo(userId, path)) return null;
  const { data, error } = await adminClient().storage.from(BUCKET).createSignedUrl(path, 900);
  return error ? null : data.signedUrl;
}
async function publicProfile(userId: string, row: ProfileRow): Promise<BrandingProfile> {
  const config = normalizeBrandingConfig(row.config, { strict: true });
  return { id: row.id, name: row.name, version: row.version, config, logoPreviewUrl: await previewLogo(userId, config.logoPath), createdAt: row.created_at, updatedAt: row.updated_at };
}
export async function listRainBranding(auth: Auth) {
  const client = auth.client as unknown as SupabaseClient<BrandingDatabase>;
  const [profiles, selection] = await Promise.all([
    client.from('healing_rain_branding_profiles').select('*').eq('user_id', auth.userId).order('created_at', { ascending: true }).limit(30),
    client.from('healing_rain_branding_selection').select('profile_id,version').eq('user_id', auth.userId).maybeSingle(),
  ]);
  if (profiles.error) databaseError(profiles.error); if (selection.error) databaseError(selection.error);
  return { profiles: await Promise.all((profiles.data ?? []).map(row => publicProfile(auth.userId, row))), selectedProfileId: selection.data?.profile_id ?? null, selectionVersion: selection.data?.version ?? 0 };
}
async function verifyLogo(userId: string, path: string | null) {
  if (!path) return;
  if (!ownedLogo(userId, path)) throw new RainProjectError('invalid_logo', '내 계정에 업로드한 로고를 선택해 주세요.', 400);
  const { error } = await adminClient().storage.from(BUCKET).info(path);
  if (error) throw new RainProjectError('invalid_logo', '로고 파일을 확인하지 못했습니다. 다시 업로드해 주세요.', 400);
}
export async function saveRainBranding(userId: string, input: SaveBrandingInput, profileId: string | null = null) {
  await verifyLogo(userId, input.config.logoPath);
  const { data, error } = await adminClient().rpc('mutate_healing_rain_branding', {
    p_user_id: userId, p_request_id: input.clientRequestId, p_action: profileId ? 'update' : 'create', p_profile_id: profileId,
    p_expected_version: input.expectedVersion ?? null, p_name: input.name, p_config: input.config as unknown as Json,
  });
  if (error) databaseError(error);
  const result = data as unknown as { profile: ProfileRow; created: boolean };
  if (!result?.profile) databaseError({});
  return { profile: await publicProfile(userId, result.profile), created: result.created };
}
export async function selectRainBranding(userId: string, input: SelectBrandingInput) {
  const { data, error } = await adminClient().rpc('mutate_healing_rain_branding', {
    p_user_id: userId, p_request_id: input.clientRequestId, p_action: 'select', p_profile_id: input.profileId,
    p_expected_version: input.expectedVersion, p_name: null, p_config: null,
  });
  if (error) databaseError(error);
  return data as unknown as { selectedProfileId: string | null; selectionVersion: number };
}
/** Authenticated caller only. Missing optional migration/config does not block generation. */
export async function getSelectedRainBrandingSnapshot(userId: string): Promise<BrandingSnapshot | null> {
  const client = adminClient();
  const selected = await client.from('healing_rain_branding_selection').select('profile_id').eq('user_id', userId).maybeSingle();
  if (selected.error) { if (MISSING_DATABASE.includes(selected.error.code)) return null; databaseError(selected.error); }
  if (!selected.data?.profile_id) return null;
  const profile = await client.from('healing_rain_branding_profiles').select('*').eq('user_id', userId).eq('id', selected.data.profile_id).maybeSingle();
  if (profile.error) databaseError(profile.error);
  return profile.data ? createBrandingSnapshot({ ...profile.data, config: normalizeBrandingConfig(profile.data.config, { strict: true }) }) : null;
}
export async function encodeBrandingLogo(data: Buffer, contentType: string): Promise<Buffer> {
  const png = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  const webp = data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  if (!(contentType === 'image/png' && png || contentType === 'image/jpeg' && jpeg || contentType === 'image/webp' && webp)) throw new RainProjectError('invalid_logo', '지원하는 이미지 파일을 선택해 주세요.', 400);
  try {
    const source = sharp(data, { limitInputPixels: 16777216, animated: false, failOn: 'warning' });
    const metadata = await source.metadata();
    const width = metadata.width ?? 0, height = metadata.height ?? 0;
    if (width < 16 || height < 16 || width > 8192 || height > 8192 || Math.max(width / height, height / width) > 20 || (metadata.pages ?? 1) !== 1) throw new Error('dimensions');
    // rotate applies EXIF orientation; the fresh WebP drops EXIF, ICC and other metadata.
    const output = await source.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    if (output.length > BRANDING_LOGO_MAX_BYTES) throw new Error('output size');
    return output;
  } catch { throw new RainProjectError('invalid_logo', '로고 이미지를 읽을 수 없습니다. 16픽셀 이상인 일반 이미지를 선택해 주세요.', 400); }
}
export async function uploadRainBrandingLogo(userId: string, input: { data: Buffer; contentType: string }) {
  const data = await encodeBrandingLogo(input.data, input.contentType);
  const logoPath = `${userId}/branding/${crypto.randomUUID()}.webp`;
  const { error } = await adminClient().storage.from(BUCKET).upload(logoPath, data, { contentType: 'image/webp', upsert: false });
  if (error) throw new RainProjectError('persistence_unavailable', '로고를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', 503);
  return { logoPath, logoPreviewUrl: await previewLogo(userId, logoPath) };
}
