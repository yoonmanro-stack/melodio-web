// Read-only HTTP checks plus deliberately rejected generation requests.
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const run = promisify(require('node:child_process').execFile);
const scope = require('./missing-samples-release-20261006.cjs');
const { root, release, IDS, moePath, sha, readJson, requireCondition } = scope;
const ROUTES = ['/style-library', '/audio', '/japan', '/voice-lab'];
function splitResponse(stdout) {
  const data = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  const split = data.lastIndexOf(10); const statusText = data.subarray(split + 1).toString().trim();
  requireCondition(split >= 0 && /^\d{3}$/.test(statusText), 'http_response_format');
  return { status: Number(statusText), data: data.subarray(0, split) };
}
function chunkPaths(html) {
  const paths = [...new Set([...html.matchAll(/static\/chunks\/[A-Za-z0-9._~/-]+\.js/g)].map(match => '/_next/' + match[0]))];
  requireCondition(paths.length > 0 && paths.length <= 80 && paths.every(p => !p.includes('..') && p.length < 250), 'chunk_scope');
  return paths;
}
function catalogPresent(text, records) {
  return records.every(record => text.includes(record.id) && text.includes(record.audioUrl));
}
async function main() {
  const mode = process.argv[2]; requireCondition(['candidate', 'production'].includes(mode) && process.argv.length === 3, 'invalid_mode');
  const sourceCommit = await scope.sourceState({ clean: true }); const receipt = await readJson(scope.receiptPath);
  scope.verifyReceipt(receipt, sourceCommit);
  requireCondition(receipt.readyState === 'READY' && (mode !== 'production' || receipt.domainPromoted === true), 'not_ready');
  const { records, rows } = await scope.verifyDataSamples({ sourceCommit });
  const preserved = await scope.verifyPreservation(rows);
  const target = mode === 'candidate' ? receipt.url : 'https://melodio.app';
  const current = scope.deployment(await scope.cli(['inspect', target, '--format=json', '--non-interactive']));
  requireCondition(current.deploymentId === receipt.deploymentId && current.readyState === 'READY', 'deployment_changed');
  const assets = new Map(); const checks = [];
  async function curl(p, body) {
    requireCondition(p.startsWith('/') && !p.startsWith('//') && !p.includes('..') && p.length < 300, 'request_path_scope');
    const args = ['curl', p, '--deployment', target, '--non-interactive', '--', '--silent', '--show-error', '--max-time', '25', '--max-filesize', '4194304', '--write-out', '\n%{http_code}'];
    if (body) args.push('--request', 'POST', '--header', 'Content-Type: application/json', '--data', JSON.stringify(body));
    const response = await run('vercel', args, { cwd: release, timeout: 45000, maxBuffer: 4 * 1024 * 1024 + 1024, encoding: 'buffer' });
    return splitResponse(response.stdout);
  }
  for (const p of ROUTES) {
    const response = await curl(p); const html = response.data.toString('utf8'); const paths = chunkPaths(html); const loaded = [];
    for (let i = 0; i < paths.length; i += 3) {
      loaded.push(...await Promise.all(paths.slice(i, i + 3).map(async file => {
        if (!assets.has(file)) assets.set(file, curl(file).then(result => { requireCondition(result.status === 200, 'chunk_http'); return result.data.toString('utf8'); }));
        return assets.get(file);
      })));
    }
    const text = html + loaded.join('\n'); const catalogSamplesPresent = catalogPresent(text, records);
    const moeSamplePresent = text.includes('voice-moe-jpop') && text.includes(moePath);
    checks.push({ path: p, status: response.status, chunkCount: paths.length, catalogSamplesPresent, moeSamplePresent, passed: response.status === 200 && catalogSamplesPresent && moeSamplePresent });
  }
  for (const record of records) {
    const response = await curl(record.audioUrl); const remoteSha256 = sha(response.data);
    const localSha256 = sha(await fs.readFile(path.join(release, 'public', record.audioUrl)));
    const hashMatches = remoteSha256 === localSha256 && localSha256 === record.sha256;
    checks.push({ id: record.id, path: record.audioUrl, status: response.status, sha256: remoteSha256, seconds: record.seconds, hashMatches, passed: response.status === 200 && hashMatches });
  }
  const moe = await curl(moePath); const moeHashMatches = sha(moe.data) === preserved.moeSha256;
  checks.push({ id: 'voice-moe-jpop', path: moePath, status: moe.status, hashMatches: moeHashMatches, passed: moe.status === 200 && moeHashMatches });
  for (const sourceMenu of ['style-library', 'preset-studio', 'japan']) {
    const response = await curl('/api/generate', { sourceMenu, stylePrompt: 'Offline guard validation', isInstrumental: false, lyricsPrompt: '[male vocal, warm guitar]' });
    let code; try { code = JSON.parse(response.data.toString('utf8')).code; } catch {}
    checks.push({ path: '/api/generate', sourceMenu, status: response.status, code, passed: response.status === 400 && code === 'lyrics_instruction_in_content' });
  }
  const result = { state: checks.every(check => check.passed) ? 'passed' : 'failed', mode, deploymentId: receipt.deploymentId, sourceCommit, checkedAt: new Date().toISOString(),
    sampleCount: IDS.length, providerCalls: 0, userDataMutated: 0, checks };
  await fs.writeFile(path.join(root, `docs/releases/missing-samples-${mode}-20261006.smoke.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ state: result.state, mode, deploymentId: result.deploymentId, sourceCommit, sampleCount: result.sampleCount, checks: checks.length, failed: checks.filter(check => !check.passed).map(({ path, id, sourceMenu, status }) => ({ path, id, sourceMenu, status })) }));
  if (result.state !== 'passed') process.exitCode = 1;
}
module.exports = { ROUTES, splitResponse, chunkPaths, catalogPresent };
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ category: /^[a-z_]+$/.test(error.message || '') ? error.message : 'smoke_command_failed' })); process.exitCode = 1; });
