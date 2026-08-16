import {
  MUGSOUND_MANIFEST_VERSION,
  type MugSoundManifestTrack,
  type MugSoundReleaseManifest,
} from './contracts'

export interface ManifestValidationResult {
  valid: boolean
  errors: string[]
}

const SCORE_MIN = 0
const SCORE_MAX = 100
const PHASE_ORDER = ['arrival', 'settle', 'engage', 'release'] as const

function isScore(value: number) {
  return Number.isFinite(value) && value >= SCORE_MIN && value <= SCORE_MAX
}

export function calculateEpisodeDuration(tracks: MugSoundManifestTrack[]) {
  return tracks
    .filter((track) => track.placement === 'default')
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
    .reduce((total, track, index) => {
    const overlap = index === 0 ? 0 : track.recommendedCrossfadeSeconds
    return total + track.durationSeconds - overlap
  }, 0)
}

export function validateMugSoundManifest(
  manifest: MugSoundReleaseManifest,
): ManifestValidationResult {
  const errors: string[] = []
  if (manifest.manifestVersion !== MUGSOUND_MANIFEST_VERSION) {
    errors.push(`지원하지 않는 manifestVersion: ${manifest.manifestVersion}`)
  }
  if (!/^ms-ep-\d{3}$/.test(manifest.releaseId)) {
    errors.push('releaseId는 ms-ep-001 형식이어야 합니다.')
  }
  if (!Number.isInteger(manifest.releaseVersion) || manifest.releaseVersion < 1) {
    errors.push('releaseVersion은 1 이상의 정수여야 합니다.')
  }
  if (manifest.supplyStatus === 'approved' && manifest.rightsStatus !== 'cleared') {
    errors.push('공급 승인 Release는 rightsStatus가 cleared여야 합니다.')
  }
  if (manifest.supplyStatus === 'approved' && manifest.allowedTerritories.length === 0) {
    errors.push('공급 승인 Release에는 허용 지역이 필요합니다.')
  }
  if (manifest.tracks.length === 0) errors.push('Release에는 트랙이 1개 이상 필요합니다.')

  const assetVersions = new Set<string>()
  const defaultTracks = manifest.tracks
    .filter((track) => track.placement === 'default')
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))
  if (defaultTracks.length === 0) errors.push('Episode에는 기본 편성 트랙이 1개 이상 필요합니다.')
  defaultTracks.forEach((track, index) => {
    if (track.position !== index + 1) errors.push(`${track.assetId}: 기본 편성 position이 연속적이지 않습니다.`)
    if (index > 0) {
      const previous = defaultTracks[index - 1]
      if (PHASE_ORDER.indexOf(track.phase) < PHASE_ORDER.indexOf(previous.phase)) {
        errors.push(`${track.assetId}: 기본 편성의 Phase 순서가 역행합니다.`)
      }
    }
  })

  for (const phase of PHASE_ORDER) {
    const placements = manifest.tracks.filter((track) => track.phase === phase)
    const defaults = placements.filter((track) => track.placement === 'default')
      .sort((left, right) => left.phasePosition - right.phasePosition)
    defaults.forEach((track, index) => {
      if (track.phasePosition !== index + 1) errors.push(`${track.assetId}: ${phase} 기본 순서가 연속적이지 않습니다.`)
    })
    const alternatePriorities = placements
      .filter((track) => track.placement === 'alternate')
      .map((track) => track.phasePosition)
    if (new Set(alternatePriorities).size !== alternatePriorities.length) {
      errors.push(`${phase}: 대체 후보 우선순위가 중복되었습니다.`)
    }
  }

  manifest.tracks.forEach((track) => {
    if (track.placement === 'alternate' && track.position !== null) errors.push(`${track.assetId}: 대체 후보의 position은 null이어야 합니다.`)
    if (track.placement === 'default' && track.position === null) errors.push(`${track.assetId}: 기본 편성에는 position이 필요합니다.`)
    if (!Number.isInteger(track.phasePosition) || track.phasePosition < 1) errors.push(`${track.assetId}: phasePosition은 1 이상의 정수여야 합니다.`)
    if (!/^ms-tr-\d{4}$/.test(track.assetId)) errors.push(`${track.assetId}: 잘못된 assetId 형식입니다.`)
    if (!Number.isInteger(track.assetVersion) || track.assetVersion < 1) errors.push(`${track.assetId}: 잘못된 assetVersion입니다.`)
    if (track.durationSeconds <= 0) errors.push(`${track.assetId}: durationSeconds가 필요합니다.`)
    if (!track.title.trim()) errors.push(`${track.assetId}: title이 필요합니다.`)
    if (!Number.isFinite(track.bpm) || track.bpm <= 0) errors.push(`${track.assetId}: 유효한 BPM이 필요합니다.`)
    if (!isScore(track.energy) || !isScore(track.warmth)) errors.push(`${track.assetId}: energy와 warmth는 0~100이어야 합니다.`)
    if (!track.emotionalStart.trim() || !track.emotionalEnd.trim()) errors.push(`${track.assetId}: 감정 시작·종료 값이 필요합니다.`)
    if (track.similarityRisk === 'high') errors.push(`${track.assetId}: 유사성 위험이 높은 곡은 공급할 수 없습니다.`)
    if (manifest.supplyStatus === 'approved' && (track.technicalQa !== 'passed' || track.emotionalQa !== 'passed')) {
      errors.push(`${track.assetId}: 승인 Release의 트랙은 기술·감정 QA를 통과해야 합니다.`)
    }
    if (track.explicitContent) errors.push(`${track.assetId}: 명시적 콘텐츠는 MVP 공급 후보가 될 수 없습니다.`)
    if (manifest.supplyStatus === 'approved' && track.supplyStatus !== 'approved') errors.push(`${track.assetId}: 승인 Release의 트랙은 모두 공급 승인 상태여야 합니다.`)
    if (manifest.supplyStatus === 'approved' && track.rightsStatus !== 'cleared') errors.push(`${track.assetId}: 승인 Release의 트랙은 모두 권리 확인 상태여야 합니다.`)
    if (track.transitionInSeconds < 0 || track.transitionOutSeconds < 0) errors.push(`${track.assetId}: 전환 시간은 음수일 수 없습니다.`)
    if (track.recommendedCrossfadeSeconds < 0 || track.recommendedCrossfadeSeconds >= track.durationSeconds) {
      errors.push(`${track.assetId}: crossfade가 실제 duration 범위를 벗어났습니다.`)
    }
    if (!track.playbackAccess.reference.trim()) errors.push(`${track.assetId}: 재생 reference가 필요합니다.`)
    const key = `${track.assetId}:v${track.assetVersion}`
    if (assetVersions.has(key)) errors.push(`${key}: 한 Release 안에 중복 배치되었습니다.`)
    assetVersions.add(key)
  })

  const calculatedDuration = calculateEpisodeDuration(manifest.tracks)
  if (Math.abs(calculatedDuration - manifest.durationSeconds) > 1) {
    errors.push(`durationSeconds가 트랙 및 크로스페이드 합계와 ${Math.abs(calculatedDuration - manifest.durationSeconds).toFixed(2)}초 다릅니다.`)
  }
  return { valid: errors.length === 0, errors }
}
