const UUID_SEGMENT = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID_SEGMENT}$`, 'i');
const MAX_VIRAL_JOBS_PER_GENERATION = 16;
const MAX_VIRAL_ASSETS_PER_TASK = 512;
const VIRAL_DELETABLE_STATUSES = new Set(['completed', 'failed']);
const VIRAL_OBJECT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

class StorageCleanupPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StorageCleanupPolicyError';
    this.code = code;
  }
}

function viralJobCleanupEntry(userId, jobId) {
  if (!UUID_PATTERN.test(String(userId || '')) || !UUID_PATTERN.test(String(jobId || ''))) {
    throw new StorageCleanupPolicyError('VIRAL_JOB_ID_INVALID', 'Viral Shorts 작업 식별자가 올바르지 않습니다.');
  }
  return { jobId, prefix: `viral_pet/${userId}/${jobId}` };
}

function prepareViralCleanupJobs(rows, userId) {
  if (!Array.isArray(rows)) {
    throw new StorageCleanupPolicyError('VIRAL_JOB_LIST_INVALID', 'Viral Shorts 작업 목록을 확인할 수 없습니다.');
  }
  if (rows.length > MAX_VIRAL_JOBS_PER_GENERATION) {
    throw new StorageCleanupPolicyError('VIRAL_JOB_LIMIT', '연결된 Viral Shorts 작업이 안전 한도를 초과했습니다.');
  }
  const seen = new Set();
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || row.user_id !== userId) {
      throw new StorageCleanupPolicyError('VIRAL_JOB_OWNER_MISMATCH', '연결된 Viral Shorts 작업의 소유권을 확인할 수 없습니다.');
    }
    if (!VIRAL_DELETABLE_STATUSES.has(row.status)) {
      throw new StorageCleanupPolicyError('VIRAL_JOB_NOT_TERMINAL', '진행 중이거나 복구 가능한 Viral Shorts 작업은 삭제할 수 없습니다.');
    }
    const entry = viralJobCleanupEntry(userId, row.id);
    if (seen.has(entry.jobId)) {
      throw new StorageCleanupPolicyError('VIRAL_JOB_DUPLICATE', '연결된 Viral Shorts 작업 목록이 중복되었습니다.');
    }
    seen.add(entry.jobId);
    return entry;
  });
}

function validateStemCleanupManifest(task) {
  const manifest = task?.cleanup_manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  const privateSource = Array.isArray(manifest.privateSource) ? manifest.privateSource : null;
  const privateOutputs = Array.isArray(manifest.privateOutputs) ? manifest.privateOutputs : null;
  const publicAssets = Array.isArray(manifest.publicAssets) ? manifest.publicAssets : null;
  // Backward compatible: tasks written before Viral Shorts cleanup have no viralJobs key.
  const viralJobs = manifest.viralJobs === undefined
    ? []
    : Array.isArray(manifest.viralJobs) ? manifest.viralJobs : null;
  if (!privateSource || !privateOutputs || !publicAssets || !viralJobs) return null;
  if (![...privateSource, ...privateOutputs, ...publicAssets].every(value => typeof value === 'string')) return null;
  if (!UUID_PATTERN.test(String(task.generation_id || ''))) return null;
  if (task.user_id !== null && !UUID_PATTERN.test(String(task.user_id || ''))) return null;

  const optionalAttempt = `(?:${UUID_SEGMENT}/)?`;
  const stemName = '(?:vocals|drums|bass|other)';
  const sourcePattern = new RegExp(
    `^uploads/${task.user_id}/${task.generation_id}(?:/${UUID_SEGMENT})?\\.(?:mp3|wav|m4a|aac|ogg|flac)$`,
    'i',
  );
  const privateOutputPattern = new RegExp(
    `^stems/${task.user_id}/${task.generation_id}/${optionalAttempt}(?:original/${stemName}\\.wav|preview/${stemName}\\.m4a)$`,
    'i',
  );
  const publicOutputPattern = new RegExp(
    `^stems/${task.generation_id}/${optionalAttempt}(?:original/${stemName}\\.wav|preview/${stemName}\\.m4a)$`,
    'i',
  );
  const publicSourcePattern = new RegExp(`^uploads/${task.generation_id}\\.(?:mp3|wav|m4a|aac|ogg|flac)$`, 'i');
  if (privateSource.length > 11 || !privateSource.every(value => sourcePattern.test(value))) return null;
  if (privateOutputs.length > 144 || !privateOutputs.every(value => privateOutputPattern.test(value))) return null;
  if (publicAssets.length > 145 || !publicAssets.every(value => publicOutputPattern.test(value) || publicSourcePattern.test(value))) return null;
  if (viralJobs.length > MAX_VIRAL_JOBS_PER_GENERATION || (task.user_id === null && viralJobs.length)) return null;
  const viralIds = new Set();
  for (const entry of viralJobs) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    let expected;
    try { expected = viralJobCleanupEntry(task.user_id, entry.jobId); } catch { return null; }
    if (entry.prefix !== expected.prefix || viralIds.has(entry.jobId)) return null;
    viralIds.add(entry.jobId);
  }
  return { privateSource, privateOutputs, publicAssets, viralJobs };
}

async function listViralCleanupPaths(bucket, viralJobs) {
  if (!bucket || typeof bucket.list !== 'function' || !Array.isArray(viralJobs)) {
    throw new StorageCleanupPolicyError('VIRAL_LIST_INVALID', 'Viral Shorts 저장소 목록을 확인할 수 없습니다.');
  }
  const paths = [];
  const seen = new Set();
  for (const job of viralJobs) {
    if (!job || typeof job !== 'object' || job.prefix !== viralJobCleanupEntry(
      String(job.prefix || '').split('/')[1], job.jobId,
    ).prefix) {
      throw new StorageCleanupPolicyError('VIRAL_PREFIX_INVALID', 'Viral Shorts 저장소 경로가 올바르지 않습니다.');
    }
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(job.prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new StorageCleanupPolicyError('VIRAL_LIST_FAILED', 'Viral Shorts 저장소 목록을 불러오지 못했습니다.');
      if (!Array.isArray(data)) throw new StorageCleanupPolicyError('VIRAL_LIST_INVALID', 'Viral Shorts 저장소 응답이 올바르지 않습니다.');
      for (const item of data) {
        if (!item || typeof item.name !== 'string' || item.id === null || !VIRAL_OBJECT_NAME_PATTERN.test(item.name)) {
          throw new StorageCleanupPolicyError('VIRAL_OBJECT_INVALID', 'Viral Shorts 저장소에 안전하게 확인할 수 없는 경로가 있습니다.');
        }
        const exactPath = `${job.prefix}/${item.name}`;
        if (seen.has(exactPath)) throw new StorageCleanupPolicyError('VIRAL_OBJECT_DUPLICATE', 'Viral Shorts 저장소 목록이 중복되었습니다.');
        seen.add(exactPath);
        paths.push(exactPath);
        if (paths.length > MAX_VIRAL_ASSETS_PER_TASK) {
          throw new StorageCleanupPolicyError('VIRAL_ASSET_LIMIT', 'Viral Shorts 저장소 정리 목록이 안전 한도를 초과했습니다.');
        }
      }
      if (data.length < 100) break;
    }
  }
  return paths;
}

module.exports = {
  MAX_VIRAL_JOBS_PER_GENERATION,
  MAX_VIRAL_ASSETS_PER_TASK,
  StorageCleanupPolicyError,
  prepareViralCleanupJobs,
  validateStemCleanupManifest,
  listViralCleanupPaths,
};
