const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const sharp = require('sharp');
const shared = require('../shared/healing-rain/branding');
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, Date, JSON, TextDecoder, Buffer, Request, Response, URL, crypto, require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; }, ...globals }, { filename: file });
  return module.exports;
}
const model = load('src/lib/healing-rain/projects.ts', { './recipes': {} });
const branding = load('src/lib/healing-rain/branding.ts', { '../../../shared/healing-rain/branding': shared, './projects': model });
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const profileId = '33333333-3333-4333-8333-333333333333';
const config = { ...shared.DEFAULT_BRANDING_CONFIG };
const input = overrides => ({ clientRequestId: 'branding-test-001', name: 'My channel', config: { ...config }, ...overrides });
const request = (body, method = 'POST', headers = {}) => new Request('https://test.local/api/healing-rain/branding', { method, headers, ...(method === 'GET' ? {} : { body: typeof body === 'string' || body instanceof Buffer ? body : JSON.stringify(body) }) });
function harness(options = {}) {
  const calls = []; let adminCount = 0;
  const row = { id: profileId, user_id: owner, name: 'My channel', version: 1, config, created_at: '2026-10-14T00:00:00Z', updated_at: '2026-10-14T00:00:00Z' };
  const client = { from(table) { const query = { select() { return this; }, eq(key, value) { calls.push(['filter', table, key, value]); return this; }, order() { return this; }, limit() { return this; }, maybeSingle() { return Promise.resolve({ data: options.selection ?? null, error: null }); }, then(resolve) { return Promise.resolve({ data: [row], error: null }).then(resolve); } }; return query; } };
  const admin = { async rpc(name, args) { calls.push(['rpc', name, args]); return { data: { profile: { ...row, config: args.p_config }, created: args.p_action === 'create' }, error: options.writeError ?? null }; }, storage: { from(bucket) { calls.push(['bucket', bucket]); return { async info(path) { calls.push(['info', path]); return { error: null }; }, async upload(path, data, opts) { calls.push(['upload', path, data.length, opts]); return { error: null }; }, async createSignedUrl(path, expires) { calls.push(['signed', path, expires]); return { data: { signedUrl: 'https://test.local/signed-preview' }, error: null }; } }; } } };
  const projectServer = { async requireRainProjectUser() { if (options.unauthenticated) throw new model.RainProjectError('authentication_required', 'Sign in', 401); return { userId: owner, client }; } };
  const server = load('src/lib/healing-rain/branding-server.ts', { 'server-only': {}, '@supabase/supabase-js': { createClient() { adminCount++; return admin; } }, sharp, '../../../shared/healing-rain/branding': shared, './project-server': projectServer, './projects': model, './branding': branding }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.local', SUPABASE_SERVICE_ROLE_KEY: 'offline-test' } } });
  const dependencies = { '@/lib/healing-rain/project-server': projectServer, '@/lib/healing-rain/branding-server': server, '@/lib/healing-rain/branding': branding, '@/lib/healing-rain/projects': model };
  return { server, calls, adminCount: () => adminCount, route: load('src/app/api/healing-rain/branding/route.ts', dependencies), update: load('src/app/api/healing-rain/branding/[id]/route.ts', dependencies), select: load('src/app/api/healing-rain/branding/selection/route.ts', dependencies), logo: load('src/app/api/healing-rain/branding/logo/route.ts', dependencies) };
}
test('branding is opt-in and never invents missing content', () => {
  assert.equal(shared.resolveBrandingOverlay(null, 'Episode'), null);
  assert.equal(shared.resolveBrandingOverlay(config, 'Episode'), null);
  assert.equal(shared.resolveBrandingOverlay({ ...config, enabled: true, mode: 'title' }, ''), null);
  const active = { ...config, enabled: true, mode: 'channel-title', channelName: 'Rain room', tagline: 'Rest here', preset: 'classic' };
  assert.equal(shared.resolveBrandingOverlay(active, 'Episode').channelName, 'Rain room');
  assert.equal(shared.resolveBrandingOverlay(active, 'Episode').title, 'Episode');
  assert.deepEqual(shared.normalizeBrandingConfig({ ...active, enabled: false }), { ...active, enabled: false });
  assert.equal(shared.resolveBrandingOverlay({ ...active, mode: 'none' }, 'Episode'), null);
  assert.equal(shared.resolveBrandingOverlay({ ...active, mode: 'title' }, 'Episode').channelName, '');
  assert.deepEqual(shared.resolveBrandingOverlay(active, 'Episode'), shared.resolveBrandingOverlay(active, 'Episode'));
});
test('strict validation rejects unknown fields, unsafe paths, nonfinite timings and oversized text', () => {
  for (const patch of [{ foo: 'bar' }, { logoPath: 'https://external.test/logo.png' }, { logoPath: `${owner}/branding/../bad.webp` }, { fadeInSeconds: NaN }, { holdSeconds: 0 }, { fadeInSeconds: 15, holdSeconds: 1 }, { channelName: 'x'.repeat(81) }, { tagline: 'bad\nline' }]) assert.throws(() => shared.normalizeBrandingConfig({ ...config, ...patch }, { strict: true }));
  assert.throws(() => branding.parseSaveBranding(input({ expectedVersion: 0 }), true));
  assert.throws(() => branding.parseSelectBranding({ clientRequestId: 'test-request', expectedVersion: 0, profileId: 'bad' }));
});
test('authentication precedes body reads and all privileged access', async () => {
  const h = harness({ unauthenticated: true });
  const responses = [await h.route.GET(), await h.route.POST(request('{')), await h.update.PATCH(request('{', 'PATCH'), { params: Promise.resolve({ id: 'bad' }) }), await h.select.PUT(request('{', 'PUT')), await h.logo.POST(request('<svg>', 'POST', { 'Content-Type': 'image/svg+xml' }))];
  for (const response of responses) { assert.equal(response.status, 401); assert.match(response.headers.get('cache-control'), /no-store/); }
  assert.equal(h.adminCount(), 0); assert.equal(h.calls.length, 0);
});
test('create derives owner, lists owner rows and reports stale version conflicts', async () => {
  const h = harness(); const response = await h.route.POST(request(input({ user_id: other })));
  assert.equal(response.status, 201); assert.equal(h.calls.find(call => call[0] === 'rpc')[2].p_user_id, owner);
  assert.equal((await response.json()).profile.logoPreviewUrl, null);
  const list = await (await h.route.GET()).json(); assert.equal(list.selectionVersion, 0); assert.equal(list.selectedProfileId, null);
  assert.ok(h.calls.filter(call => call[0] === 'filter').every(call => call[2] === 'user_id' && call[3] === owner));
  const stale = harness({ writeError: { code: '40001' } });
  const result = await stale.update.PATCH(request(input({ expectedVersion: 1 }), 'PATCH'), { params: Promise.resolve({ id: profileId }) });
  assert.equal(result.status, 409); assert.equal((await result.json()).code, 'branding_version_conflict');
});
test('logo ownership is checked before storage or RPC and internal paths never become remote fetches', async () => {
  const h = harness(); const path = `${other}/branding/${profileId}.webp`;
  const response = await h.route.POST(request(input({ config: { ...config, logoPath: path } })));
  assert.equal(response.status, 400); assert.equal(h.adminCount(), 0);
});
test('streaming caps reject oversized bodies and logo MIME rejection happens before decoding', async () => {
  await assert.rejects(branding.readBrandingLogo(request(Buffer.alloc(branding.BRANDING_LOGO_MAX_BYTES + 1), 'POST', { 'Content-Type': 'image/png' })), error => error.status === 413);
  await assert.rejects(branding.readBrandingLogo(request('<svg/>', 'POST', { 'Content-Type': 'image/svg+xml' })), error => error.status === 415);
  const h = harness(); const response = await h.route.POST(request('x'.repeat(8193))); assert.equal(response.status, 413); assert.equal(h.adminCount(), 0);
});
test('real image decoding rejects SVG, spoofed MIME and unsafe aspect ratios; reencoding drops metadata', async () => {
  const h = harness();
  await assert.rejects(h.server.encodeBrandingLogo(Buffer.from('<svg/>'), 'image/png'), error => error.code === 'invalid_logo');
  const png = await sharp({ create: { width: 3000, height: 1000, channels: 4, background: '#769f87' } }).png().withMetadata({ density: 300 }).toBuffer();
  await assert.rejects(h.server.encodeBrandingLogo(png, 'image/jpeg'));
  const encoded = await h.server.encodeBrandingLogo(png, 'image/png'); const meta = await sharp(encoded).metadata();
  assert.equal(meta.format, 'webp'); assert.equal(meta.width, 2048); assert.equal(meta.exif, undefined); assert.equal(meta.icc, undefined);
  const narrow = await sharp({ create: { width: 500, height: 16, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(h.server.encodeBrandingLogo(narrow, 'image/png'));
  const uploaded = await h.server.uploadRainBrandingLogo(owner, { data: png, contentType: 'image/png' });
  assert.match(uploaded.logoPath, new RegExp(`^${owner}/branding/`)); assert.equal(uploaded.logoPreviewUrl, 'https://test.local/signed-preview');
  assert.equal(h.calls.find(call => call[0] === 'upload')[3].upsert, false);
});
