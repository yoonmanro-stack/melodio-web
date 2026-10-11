/** Content evidence is separate from a technically completed MP4. Pure and client-safe. */
export const PET_CONTENT_REVIEW_POLICY = 'pet-content-review-v1' as const;

export interface PetContentReview {
  status: 'not_evaluated' | 'needs_attention' | 'preview_required' | 'owner_confirmed';
  analyzedClips: number;
  totalClips: number;
  concerns: string[];
  approvedAt?: string;
}

type ReviewInput = {
  videoUrl?: string;
  shots: ReadonlyArray<{ id?: string; quality?: { video?: unknown } }>;
  planningWarnings?: readonly string[];
  approval?: { videoUrl: string; approvedAt: string };
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

/** Three sampled stills cannot certify full movement, seam continuity, sound or humor. */
export function summarizePetContentReadiness(input: ReviewInput): PetContentReview {
  const totalClips = input.shots.length;
  let analyzedClips = 0;
  const planningConcerns: string[] = (input.planningWarnings || [])
    .filter(warning => typeof warning === 'string' && warning.trim() && warning.length <= 500 && !/data:|base64/i.test(warning))
    .slice(0, 3).map(warning => `기획 · ${warning.trim()}`);
  const clipConcerns: string[][] = [];
  for (const [index, shot] of input.shots.entries()) {
    const review = record(shot.quality?.video);
    const concerns: string[] = [];
    clipConcerns.push(concerns);
    const label = typeof shot.id === 'string' && /^[CS][1-6]$/.test(shot.id) ? shot.id : `클립 ${index + 1}`;
    if (review?.analysisStatus === 'complete' && review.scope === 'sampled_frames') analyzedClips += 1;
    if (review?.analysisStatus === 'unavailable') concerns.push(`${label} · 참고 분석을 완료하지 못했습니다. 영상을 직접 확인해 주세요.`);
    const issues = Array.isArray(review?.issues) ? review.issues : [];
    for (const issue of issues) {
      if (typeof issue === 'string' && issue.trim() && issue.length <= 500 && !/data:|base64/i.test(issue)) {
        concerns.push(`${label} · ${issue.trim()}`);
      }
    }
  }
  // Show evidence from every rendered clip before lexical planning cautions.
  const concerns = Array.from({ length: Math.max(0, ...clipConcerns.map(items => items.length)) }, (_, index) =>
    clipConcerns.flatMap(items => items[index] ? [items[index]] : [])).flat();
  concerns.push(...planningConcerns);
  const boundedConcerns = [...new Set(concerns)].slice(0, 6);
  const approval = input.approval;
  const approved = !!input.videoUrl && approval?.videoUrl === input.videoUrl
    && typeof approval.approvedAt === 'string' && approval.approvedAt.length <= 40
    && Number.isFinite(Date.parse(approval.approvedAt));
  return {
    status: approved ? 'owner_confirmed' : boundedConcerns.length ? 'needs_attention'
      : analyzedClips > 0 ? 'preview_required' : 'not_evaluated',
    analyzedClips, totalClips, concerns: boundedConcerns,
    ...(approved ? { approvedAt: approval!.approvedAt } : {}),
  };
}

/** Applies only to newly created jobs. Existing published archives keep their visibility. */
export function hasPetOwnerContentApproval(input: {
  contentPolicyVersion?: unknown; videoUrl?: unknown; approvalUrl?: unknown; approvedAt?: unknown;
}): boolean {
  if (input.contentPolicyVersion === undefined || input.contentPolicyVersion === null || input.contentPolicyVersion === '') return true;
  return input.contentPolicyVersion === PET_CONTENT_REVIEW_POLICY
    && typeof input.videoUrl === 'string' && input.videoUrl.length > 0 && input.approvalUrl === input.videoUrl
    && typeof input.approvedAt === 'string' && input.approvedAt.length <= 40 && Number.isFinite(Date.parse(input.approvedAt));
}
