import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { PetPipelineError } from './petPipeline';

export type PetMediaKind = 'audio' | 'image' | 'video';
const LIMITS = { audio: 40 * 1024 * 1024, image: 15 * 1024 * 1024, video: 20 * 1024 * 1024 };
function subdomain(host: string, base: string) { return host === base || host.endsWith(`.${base}`); }
export function assertPetMediaUrl(value: string, kind: PetMediaKind, storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new PetPipelineError('미디어 주소가 올바르지 않습니다.', 'MEDIA_URL'); }
  const storage = storageOrigin ? new URL(storageOrigin) : undefined;
  const ownStorage = storage && url.origin === storage.origin && url.pathname.startsWith('/storage/v1/object/public/melodio-assets/');
  const xai = subdomain(url.hostname, 'x.ai');
  const audio = kind === 'audio' && (subdomain(url.hostname, 'suno.ai') || subdomain(url.hostname, 'suno.com') || url.hostname === 'file.302.ai');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname) || (!ownStorage && !xai && !audio)) throw new PetPipelineError('신뢰할 수 있는 생성 미디어 주소가 아닙니다.', 'MEDIA_HOST');
  return url;
}
export function privatePetAddress(address: string): boolean {
  // RFC 6052 well-known NAT64 prefix. Some host networks synthesize these AAAA
  // records for public IPv4 services; apply the IPv4 checks to their destination.
  const nat64 = /^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (nat64) {
    const upper = parseInt(nat64[1], 16); const lower = parseInt(nat64[2], 16);
    return privatePetAddress([upper >>> 8, upper & 255, lower >>> 8, lower & 255].join('.'));
  }
  if (address.includes(':')) return !/^[23][0-9a-f]{3}:/i.test(address);
  const [a,b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
export async function readPetBoundedBody(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel(); throw new PetPipelineError('미디어 응답이 허용 크기를 넘었습니다.', 'MEDIA_SIZE'); }
  if (!response.body) throw new PetPipelineError('미디어 응답이 비어 있습니다.', 'MEDIA_EMPTY');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) { await reader.cancel(); throw new PetPipelineError('미디어 응답이 허용 크기를 넘었습니다.', 'MEDIA_SIZE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!bytes) throw new PetPipelineError('미디어 응답이 비어 있습니다.', 'MEDIA_EMPTY');
  return Buffer.concat(chunks, bytes);
}
export async function downloadPetMedia(value: string, kind: PetMediaKind): Promise<{ buffer: Buffer; contentType: string }> {
  let url = assertPetMediaUrl(value, kind);
  const signal = AbortSignal.timeout(25_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(row => privatePetAddress(row.address))) throw new PetPipelineError('미디어 주소를 안전하게 확인할 수 없습니다.', 'MEDIA_DNS');
    const response = await fetch(url, { redirect: 'manual', signal });
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) break;
      url = assertPetMediaUrl(new URL(location, url).href, kind); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new PetPipelineError(`미디어를 가져오지 못했습니다 (HTTP ${response.status}).`, 'MEDIA_FETCH'); }
    const contentType = (response.headers.get('content-type') || '').split(';')[0];
    if (!contentType.startsWith(`${kind}/`) && contentType !== 'application/octet-stream' && !(kind === 'audio' && contentType === 'video/mp4')) { await response.body?.cancel(); throw new PetPipelineError('미디어 형식을 확인하지 못했습니다.', 'MEDIA_TYPE'); }
    return { buffer: await readPetBoundedBody(response, LIMITS[kind]), contentType };
  }
  throw new PetPipelineError('미디어 주소 이동이 너무 많습니다.', 'MEDIA_REDIRECT');
}
