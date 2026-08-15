#!/usr/bin/env node

/**
 * Channel System staging deployment gate.
 * Default mode is read-only. Add --write-probe to upload/read/delete a synthetic
 * one-second silent MP3. Add --assembly-smoke to locally merge two existing tracks;
 * user audio is never uploaded by this script.
 */
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const { execFile, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const WRITE_PROBE = process.argv.includes('--write-probe')
const ASSEMBLY_SMOKE = process.argv.includes('--assembly-smoke')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ffmpegStatic = require('ffmpeg-static')
const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
const checks = []

function check(name, status, detail, blocking = true) {
  checks.push({ name, status, detail, blocking })
  const icon = status === 'pass' ? 'PASS' : status === 'warn' ? 'WARN' : 'FAIL'
  console.log(`[${icon}] ${name}: ${detail}`)
}

function run(binary, args) {
  return new Promise((resolve, reject) => execFile(binary, args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => (
    error ? reject(new Error(stderr || error.message)) : resolve({ stdout, stderr })
  )))
}

function mediaDuration(file) {
  return new Promise((resolve, reject) => execFile(ffmpegStatic, ['-i', file], { maxBuffer: 4 * 1024 * 1024 }, (_error, _stdout, stderr) => {
    const match = String(stderr).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (!match) return reject(new Error('duration parse failed'))
    resolve(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]))
  }))
}

async function schemaChecks() {
  const tables = [
    'channel_blueprints', 'episode_generation_batches', 'generation_queue_items',
    'generation_queue_candidates', 'episode_assemblies', 'episode_assembly_items',
    'episode_publish_packages', 'episode_cover_assets',
  ]
  for (const table of tables) {
    const { error } = await db.from(table).select('*').limit(1)
    check(`table:${table}`, error ? 'fail' : 'pass', error ? `${error.code} ${error.message}` : 'reachable')
  }
}

async function storageChecks(tmpDir) {
  const { data: buckets, error } = await db.storage.listBuckets()
  const exists = !error && buckets?.some((bucket) => bucket.name === 'melodio-assets')
  check('storage:bucket', exists ? 'pass' : 'fail', error?.message || (exists ? 'melodio-assets exists' : 'missing'))
  if (!WRITE_PROBE || !exists) {
    check('storage:write-probe', 'warn', 'skipped (use --write-probe)', false)
    return
  }
  const probeFile = path.join(tmpDir, 'synthetic-silence.mp3')
  await run(ffmpegStatic, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '1', '-c:a', 'libmp3lame', '-b:a', '32k', probeFile])
  const remote = `diagnostics/channel-gate-${Date.now()}.mp3`
  const upload = await db.storage.from('melodio-assets').upload(remote, fs.readFileSync(probeFile), { contentType: 'audio/mpeg' })
  if (upload.error) return check('storage:write-probe', 'fail', upload.error.message)
  const publicUrl = db.storage.from('melodio-assets').getPublicUrl(remote).data.publicUrl
  const response = await fetch(publicUrl, { headers: { Range: 'bytes=0-31' } })
  const remove = await db.storage.from('melodio-assets').remove([remote])
  check('storage:write-probe', response.ok && !remove.error ? 'pass' : 'fail', `read=${response.status}, cleanup=${remove.error ? remove.error.message : 'ok'}`)
}

async function twoTrackChecks(tmpDir) {
  const { data, error } = await db.from('generations').select('id,title,audio_url')
    .eq('status', 'completed').not('audio_url', 'is', null).order('created_at', { ascending: false }).limit(2)
  if (error || data?.length !== 2) return check('e2e:two-tracks', 'fail', error?.message || 'two completed tracks unavailable')
  check('e2e:two-tracks', 'pass', 'two reusable completed tracks found')
  if (!ASSEMBLY_SMOKE) {
    check('e2e:assembly-smoke', 'warn', 'skipped (use --assembly-smoke)', false)
    return
  }
  const paths = []
  let total = 0
  for (let index = 0; index < data.length; index += 1) {
    const response = await fetch(data[index].audio_url)
    if (!response.ok) throw new Error(`track ${index + 1} download failed: ${response.status}`)
    const file = path.join(tmpDir, `track-${index + 1}.mp3`)
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()))
    total += await mediaDuration(file)
    paths.push(file)
  }
  const list = path.join(tmpDir, 'concat.txt')
  fs.writeFileSync(list, paths.map((file) => `file '${file}'`).join('\n'))
  const output = path.join(tmpDir, 'local-only-assembly.mp3')
  await run(ffmpegStatic, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', output])
  const merged = await mediaDuration(output)
  const delta = Math.abs(merged - total)
  check('e2e:assembly-smoke', delta <= 0.25 ? 'pass' : 'fail', `source=${total.toFixed(2)}s merged=${merged.toFixed(2)}s delta=${delta.toFixed(2)}s`)
}

async function visibilityChecks() {
  const { data, error } = await db.from('generation_queue_items')
    .select('id,selected_candidate_id')
    .not('selected_candidate_id', 'is', null).limit(20)
  if (error) return check('visibility:A/B-master', 'fail', error.message)
  if (!data?.length) return check('visibility:A/B-master', 'warn', 'no selected staging candidates yet', false)
  const candidateResult = await db.from('generation_queue_candidates').select('id,queue_item_id,generation_id')
    .in('queue_item_id', data.map((item) => item.id))
  if (candidateResult.error) return check('visibility:A/B-master', 'fail', candidateResult.error.message)
  const candidates = candidateResult.data || []
  const ids = candidates.map((candidate) => candidate.generation_id)
  const generations = await db.from('generations').select('id,is_public,license_hash').in('id', ids)
  if (generations.error) return check('visibility:A/B-master', 'fail', generations.error.message)
  const valid = data.every((item) => {
    const itemCandidates = candidates.filter((candidate) => candidate.queue_item_id === item.id)
    return itemCandidates.length > 0 && itemCandidates.filter((candidate) => {
      const generation = generations.data?.find((row) => row.id === candidate.generation_id)
      let metaPublic = true
      try { metaPublic = JSON.parse(generation?.license_hash || '{}').isPublic !== false } catch {}
      return generation?.is_public !== false && metaPublic
    }).length === 1
  })
  check('visibility:A/B-master', valid ? 'pass' : 'fail', valid ? 'exactly one public candidate per selected item' : 'public candidate invariant violated')
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'melodio-staging-gate-'))
  try {
    check('env:supabase', url && key ? 'pass' : 'fail', url && key ? 'URL and service role configured' : 'missing credentials')
    check('env:web-anon-key', anonKey ? 'pass' : 'fail', anonKey ? 'configured' : 'NEXT_PUBLIC_SUPABASE_ANON_KEY missing')
    const systemFfmpeg = spawnSync('ffmpeg', ['-version'])
    const systemFfprobe = spawnSync('ffprobe', ['-version'])
    check('worker:ffmpeg', systemFfmpeg.status === 0 ? 'pass' : 'fail', systemFfmpeg.status === 0 ? 'available on PATH' : 'not available on PATH')
    check('worker:ffprobe', systemFfprobe.status === 0 ? 'pass' : 'fail', systemFfprobe.status === 0 ? 'available on PATH' : 'not available on PATH')
    if (!db) throw new Error('Supabase credentials unavailable')
    await schemaChecks()
    await storageChecks(tmpDir)
    await twoTrackChecks(tmpDir)
    await visibilityChecks()
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
  const blockers = checks.filter((item) => item.blocking && item.status === 'fail')
  console.log(`\nDeployment gate: ${blockers.length === 0 ? 'READY' : 'BLOCKED'} (${blockers.length} blockers)`)
  if (blockers.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error(`[FAIL] gate:error: ${error.message}`)
  process.exitCode = 1
})
