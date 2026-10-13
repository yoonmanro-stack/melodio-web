'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { RainPlan } from '@/lib/healing-rain/recipes';
import type { RAIN_GENERATION_QUOTE, RainGenerationJob } from '@/lib/healing-rain/generations';

type GenerationList = {
  jobs: RainGenerationJob[];
  quote: typeof RAIN_GENERATION_QUOTE;
  canGenerate: boolean;
  unavailableReason: string | null;
};
type ApiError = { error?: string; code?: string };
const requestStoragePrefix = 'melodio.healing-rain.generation-request.v1:';
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function activeJob(job: RainGenerationJob) {
  return job.status === 'queued' || job.status === 'running' || job.status === 'needs_attention';
}

function stageLabel(job: RainGenerationJob): string {
  if (job.status === 'queued') return '제작 대기 중';
  if (job.status === 'ready') {
    if (job.quality?.reviewDecision === 'not_required') return '제작 완료 · 추가 검수 대상 아님';
    if (job.quality?.reviewDecision === 'sample') return '제작 완료 · 표본 검수';
    if (job.quality?.reviewDecision === 'required') return '제작 완료 · 필수 검수';
    return '제작 완료 · 루프 검수 필요';
  }
  if (job.status === 'needs_attention') return '처리 결과 확인 필요';
  if (job.status === 'failed') return '제작 중단';
  if (job.stage.includes('image')) return '새 장면 이미지 생성 중';
  if (job.stage.includes('audio')) return '새 빗소리 생성 중';
  if (job.stage.includes('video')) return '장면 움직임 생성 중';
  if (job.stage.includes('render')) return '30초 · 3분 미리보기 편집 중';
  if (job.stage.includes('upload')) return '미리보기 저장 중';
  return '미리보기 제작 중';
}

function readyReviewGuidance(job: RainGenerationJob): string {
  if (job.quality?.reviewDecision === 'not_required') return '기술 검사와 기존 대표 검수 기록을 적용해 이번 결과는 추가 검수 대상이 아닙니다. 자연스러움이나 공개 준비가 자동 승인된 것은 아닙니다.';
  if (job.quality?.reviewDecision === 'sample') return '표본 검수로 선택된 결과입니다. 반복 경계의 움직임·밝기와 빗소리 연결을 직접 확인해 주세요.';
  return '반복 경계의 움직임·밝기와 빗소리 연결을 직접 확인해 주세요.';
}

function JobPreview({ job }: { job: RainGenerationJob }) {
  const progress = Number.isFinite(job.progress) ? Math.min(100, Math.max(0, job.progress)) : 0;
  const hasOutput = Boolean(job.outputs.preview30 || job.outputs.preview180);
  const kieUsage = job.actualUsage.kieCredits;
  const audioUsage = job.actualUsage.elevenLabsCredits;
  return <article className="rain-generation-job">
    <div className="rain-generation-job-heading"><div><p className="rain-eyebrow">GENERATION · {new Date(job.createdAt).toLocaleString('ko-KR')}</p><h3>{stageLabel(job)}</h3></div><span className="rain-badge">{progress}%</span></div>
    {job.status === 'queued' || job.status === 'running' ? <>
      <progress max={100} value={progress} aria-label="미리보기 제작 진행률" />
      <p className="rain-note" role="status">{job.status === 'queued' ? '요청이 저장되었습니다. 제작 워커가 시작하면 진행 상태가 표시됩니다.' : '서버에 기록된 제작 상태를 확인하고 있습니다. 화면을 닫아도 접수된 작업은 유지됩니다.'}</p>
    </> : null}
    {job.error ? <p className="rain-alert error" role="status">{job.error}</p> : null}
    {!hasOutput && job.outputs.poster ? <figure className="rain-generation-poster">
      <Image src={job.outputs.poster.url} alt="영상 제작에 사용할 생성 이미지" width={1600} height={900} unoptimized />
      <figcaption>생성된 시작 이미지 · 영상 제작 전</figcaption>
    </figure> : null}
    {hasOutput ? <div className="rain-generation-players">
      {(['preview30', 'preview180'] as const).map(key => {
        const output = job.outputs[key];
        if (!output) return null;
        return <div key={key} className="rain-generation-player"><h4>{key === 'preview30' ? '30초 · 빠른 확인' : '3분 · 반복과 음향 확인'}</h4>
          <video controls playsInline preload="none" poster={job.outputs.poster?.url} src={output.url} aria-label={key === 'preview30' ? '30초 미리보기 영상' : '3분 미리보기 영상'} />
          <a href={output.url} target="_blank" rel="noopener noreferrer">미리보기 새 창에서 열기 ↗</a>
        </div>;
      })}
    </div> : job.status === 'ready' ? <p className="rain-note">미리보기 재생 주소를 불러오지 못했습니다. 아래 새로고침으로 다시 확인해 주세요.</p> : null}
    {job.status === 'ready' ? <p className="rain-note">영상이 만들어졌습니다. {readyReviewGuidance(job)} 선택한 장시간 영상은 아직 합성하지 않았습니다.</p> : null}
    {job.quality ? <section className="rain-generation-quality" aria-label="자동 검사와 검수 기준">
      <h4>자동 기술 검사 · {job.quality.technicalStatus === 'passed' ? '통과' : job.quality.technicalStatus === 'failed' ? '확인 필요' : '검사 정보 확인 필요'}</h4>
      <p className="rain-note">{job.quality.reasons.includes('unreviewed_profile_or_model') ? '처음 적용한 연출 규칙 또는 모델입니다. 대표 장면의 움직임과 밝기를 확인해 주세요.' : job.quality.reviewDecision === 'sample' ? '공통 규칙이 검수된 장면 중 표본으로 선택됐습니다. 움직임과 반복 경계를 확인해 주세요.' : job.quality.reviewDecision === 'required' ? '자동 검사에서 확인할 항목이 있습니다. 아래 결과를 확인해 주세요.' : '공통 규칙의 대표 검수 기록이 적용됐습니다. 이번 결과는 추가 검수 표본에 해당하지 않습니다.'}</p>
      <details><summary>검사 항목 보기</summary><ul>{job.quality.checks.map(check => <li key={check.id}>{check.message} · {({ passed: '통과', warning: '주의', failed: '확인 필요', not_measured: '자동 측정 안 됨' } as const)[check.status]}</li>)}</ul></details>
      <p className="rain-note">길이·프레임·빗소리 연결의 기술 검사와 연출의 자연스러움 검수는 구분해 기록합니다.</p>
    </section> : null}
    {typeof kieUsage === 'number' || typeof audioUsage === 'number' ? <p className="rain-generation-usage">기록된 사용량 · {typeof kieUsage === 'number' ? `KIE ${kieUsage.toLocaleString('ko-KR')}크레딧` : 'KIE 확인 중'} · {typeof audioUsage === 'number' ? `ElevenLabs ${audioUsage.toLocaleString('ko-KR')}크레딧` : 'ElevenLabs 확인 중'}{job.actualUsage.unreportedCost === true ? ' · 일부 사용량 미확인' : ''}</p> : null}
  </article>;
}

export function RainGenerationPanel({ plan, onClose }: { plan: RainPlan; onClose: () => void }) {
  const projectId = plan.id;
  const [data, setData] = useState<GenerationList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pendingRetry, setPendingRetry] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const postController = useRef<AbortController | null>(null);
  const requestId = useRef<string | null>(null);
  const panel = useRef<HTMLElement | null>(null);

  useEffect(() => {
    panel.current?.scrollIntoView({ block: 'start' });
    return () => postController.current?.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        if (!requestId.current) {
          try {
            const stored = sessionStorage.getItem(`${requestStoragePrefix}${projectId}`);
            if (stored && requestIdPattern.test(stored)) { requestId.current = stored; setPendingRetry(true); }
          } catch { /* A new paid request verifies storage again before submission. */ }
        }
        const response = await fetch(`/api/healing-rain/generations?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store', signal: controller.signal });
        const result = await response.json().catch(() => null) as (GenerationList & ApiError) | null;
        if (disposed) return;
        if (!response.ok || !result || !Array.isArray(result.jobs) || !result.quote?.version) {
          if (response.status === 401 || response.status === 403 || response.status === 404) {
            setData(null);
            postController.current?.abort();
            setPosting(false);
          }
          throw new Error(response.status === 401 ? '로그인이 만료되었습니다. 다시 로그인한 뒤 작업을 확인해 주세요.' : result?.error || '생성 작업을 불러오지 못했습니다. 새로고침으로 다시 확인해 주세요.');
        }
        setData(previous => ({ ...result, jobs: result.jobs.map(job => {
          const old = previous?.jobs.find(item => item.id === job.id);
          if (!old) return job;
          const outputs = { ...job.outputs };
          // Status polling must not restart an already playing video by replacing its signed URL.
          for (const key of ['preview30', 'preview180', 'poster'] as const) {
            const output = old.outputs[key];
            if (outputs[key] && output && Date.parse(output.expiresAt) > Date.now() + 60_000) outputs[key] = output;
          }
          return { ...job, outputs };
        }) }));
        setError('');
        // Active jobs poll often; ready jobs refresh signed URLs before their ten-minute expiry.
        if (result.jobs.some(job => job.status === 'queued' || job.status === 'running')) timer = setTimeout(() => void refresh(), 5000);
        else if (result.jobs.some(job => job.status === 'ready' || job.outputs.poster)) timer = setTimeout(() => void refresh(), 5 * 60 * 1000);
      } catch (err) {
        if (!disposed && !controller.signal.aborted) setError(err instanceof Error ? err.message : '생성 상태를 확인하지 못했습니다.');
      } finally {
        if (!disposed) setLoading(false);
      }
    }
    void refresh();
    return () => { disposed = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [projectId, refreshVersion]);

  const busyJob = data?.jobs.find(activeJob);
  const canSubmit = Boolean(data && confirmed && !posting && (pendingRetry || (data.canGenerate && !busyJob)));

  async function generate() {
    if (!data || !canSubmit || postController.current) return;
    const controller = new AbortController();
    postController.current = controller;
    setPosting(true); setError('');
    try {
      if (!requestId.current) {
        // Persist only a scoped idempotency key before spending, never account tokens or media URLs.
        const key = crypto.randomUUID();
        try {
          sessionStorage.setItem(`${requestStoragePrefix}${projectId}`, key);
          if (sessionStorage.getItem(`${requestStoragePrefix}${projectId}`) !== key) throw new Error('storage_unavailable');
        } catch {
          throw new Error('중복 요청 방지를 위해 이 탭에 요청 ID를 보관해야 합니다. 브라우저 저장소 설정을 확인한 뒤 다시 시도해 주세요.');
        }
        requestId.current = key;
      }
      setPendingRetry(true);
      const response = await fetch('/api/healing-rain/generations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ projectId, clientRequestId: requestId.current, quoteVersion: data.quote.version }),
      });
      const result = await response.json().catch(() => null) as ({ job: RainGenerationJob; created: boolean } & ApiError) | null;
      if (controller.signal.aborted) return;
      if (!response.ok || !result?.job?.id) {
        if (response.status === 401) setData(null);
        if (result?.code === 'quote_changed') { setConfirmed(false); setRefreshVersion(version => version + 1); }
        throw new Error(response.status === 401 ? '로그인이 만료되었습니다. 다시 로그인한 뒤 같은 요청을 확인해 주세요.' : result?.error || '접수 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.');
      }
      // Only a confirmed server response retires the request key. Unknown outcomes always reuse it.
      try { sessionStorage.removeItem(`${requestStoragePrefix}${projectId}`); } catch { /* Retaining the old key safely returns the same job on retry. */ }
      requestId.current = null;
      setPendingRetry(false); setConfirmed(false);
      setData(previous => previous ? { ...previous, jobs: [result.job, ...previous.jobs.filter(job => job.id !== result.job.id)] } : previous);
      setRefreshVersion(version => version + 1);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '접수 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.');
    } finally {
      postController.current = null;
      if (!controller.signal.aborted) setPosting(false);
    }
  }

  return <section ref={panel} id="rain-generation-panel" className="rain-generation-panel" aria-labelledby="rain-generation-heading">
    <div className="rain-generation-heading"><div><p className="rain-eyebrow">CREATE & PREVIEW</p><h2 id="rain-generation-heading">{plan.input.title}</h2><p>저장한 장면으로 새로운 이미지·영상·빗소리를 제작합니다.</p></div><button type="button" className="rain-secondary" onClick={onClose}>닫기</button></div>
    {loading ? <p role="status" className="rain-note">계정의 작업과 생성 견적을 확인하는 중…</p> : null}
    {error ? <div className="rain-alert error" role="alert">{error}</div> : null}
    {data ? <>
      <div className="rain-generation-quote"><div><span>이미지 1장 + 10초 영상 루프</span><strong>KIE {data.quote.kieCredits}크레딧</strong><small>공시 가격 약 ${data.quote.kieListedUsd.toFixed(2)}</small></div><div><span>새 빗소리 30초 × 6개</span><strong>ElevenLabs 약 {data.quote.audio.credits.toLocaleString('ko-KR')}크레딧</strong><small>과거 사용량 기준 예상 · 실제 사용량 별도 기록</small></div></div>
      <p className="rain-note">결과물은 30초와 3분 미리보기입니다. 무음 영상 원본 11초를 10초 루프로 편집하고 신규 빗소리를 연결합니다. 두 제공사의 크레딧은 서로 다른 단위이며, 계획한 {plan.input.hours}시간 영상 합성은 포함하지 않습니다.</p>
      {data.unavailableReason ? <p className="rain-generation-notice">{data.unavailableReason} 기존 작업은 계속 확인할 수 있습니다.</p> : null}
      {busyJob ? <p className="rain-generation-notice">{busyJob.status === 'needs_attention' ? '처리 결과를 확인할 때까지 새 유료 요청을 멈췄습니다. 이 작업은 자동으로 다시 제출하지 않습니다.' : '이미 접수된 작업이 있습니다. 제작이 끝날 때까지 새 요청을 보내지 않습니다.'}</p> : null}
      {pendingRetry ? <p className="rain-generation-notice">이 탭에 확인되지 않은 요청 ID가 남아 있습니다. 같은 요청으로 다시 확인하며, 이미 접수된 작업은 중복 생성하지 않습니다.</p> : null}
      {(data.canGenerate && !busyJob) || pendingRetry ? <div className="rain-generation-action"><label><input type="checkbox" checked={confirmed} disabled={posting} onChange={event => setConfirmed(event.target.checked)} />위 예상 사용량과 30초·3분 미리보기 제작 범위를 확인했습니다.</label><button type="button" className="rain-primary" disabled={!canSubmit} onClick={() => void generate()}>{posting ? '접수 확인 중…' : pendingRetry ? '같은 요청 확인 · 재시도' : data.jobs.length ? '새 미리보기 유료 생성' : '미리보기 유료 생성'}</button><small>응답이 끊겨도 같은 요청 ID로 확인합니다. 새 요청을 자동으로 반복하지 않습니다.</small></div> : null}
      {data.jobs[0] ? <JobPreview job={data.jobs[0]} /> : <div className="rain-generation-empty">이 계획의 생성 작업이 아직 없습니다. 예상 사용량을 확인한 뒤 미리보기를 제작할 수 있습니다.</div>}
      {data.jobs.length > 1 ? <details className="rain-generation-history"><summary>이전 작업 {data.jobs.length - 1}개 보기</summary>{data.jobs.slice(1).map(job => <JobPreview key={job.id} job={job} />)}</details> : null}
    </> : null}
    <button type="button" className="rain-secondary" disabled={posting || loading} onClick={() => { setLoading(true); setRefreshVersion(version => version + 1); }}>작업 · 재생 주소 새로고침</button>
    <style jsx>{`
      .rain-generation-panel{margin-top:26px;padding:24px;border:1px solid #a9d8c945;border-radius:16px;background:#15221e;scroll-margin-top:24px}
      .rain-generation-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:22px}.rain-generation-heading h2{font-size:23px;font-weight:600;letter-spacing:-.5px;margin:9px 0;overflow-wrap:anywhere}.rain-generation-heading>div>p:last-child{font-size:12px;color:#a0aaa8;line-height:1.7}.rain-generation-heading>button{flex-shrink:0}
      .rain-generation-quote{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}.rain-generation-quote>div{display:flex;flex-direction:column;gap:8px;border:1px solid #a9d8c929;background:#253b30;border-radius:10px;padding:17px}.rain-generation-quote span{font-size:11px;color:#c5d6ca}.rain-generation-quote strong{font-size:17px;color:#edf3ed}.rain-generation-quote small{font-size:10px;color:#bacbbf;line-height:1.7}
      .rain-generation-notice{font-size:12px;line-height:1.8;color:#c6d8cf;padding:13px 15px;margin-top:14px;background:#ffffff05;border-radius:8px;border:1px solid #ffffff12}.rain-generation-action{display:flex;flex-wrap:wrap;align-items:center;gap:15px;margin:22px 0}.rain-generation-action label{display:flex;align-items:center;gap:9px;flex:1;min-width:230px;font-size:12px;line-height:1.7;color:#d3e1d9}.rain-generation-action input{width:17px;height:17px;flex-shrink:0;accent-color:#a9d8c9}.rain-generation-action small{width:100%;font-size:10px;color:#a0aaa8;line-height:1.7}.rain-generation-empty{padding:24px 0;color:#a0aaa8;font-size:12px;line-height:1.8}.rain-generation-history{margin:22px 0}.rain-generation-history summary{cursor:pointer;font-size:12px;color:#a9d8c9;margin-bottom:14px}
      .rain-generation-panel :global(.rain-generation-job){border-top:1px solid #ffffff14;padding-top:22px;margin:24px 0}.rain-generation-panel :global(.rain-generation-job-heading){display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:14px}.rain-generation-panel :global(.rain-generation-job h3){font-size:16px;color:#e6ece8;font-weight:600;margin-top:9px}.rain-generation-panel :global(.rain-generation-job progress){width:100%;height:7px;accent-color:#a9d8c9;margin:4px 0 12px}.rain-generation-panel :global(.rain-generation-players){display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}.rain-generation-panel :global(.rain-generation-player){min-width:0}.rain-generation-panel :global(.rain-generation-player h4){font-size:12px;margin-bottom:10px;color:#c5d6ca}.rain-generation-panel :global(.rain-generation-player video){display:block;width:100%;aspect-ratio:16/9;object-fit:contain;background:#09120f;border:1px solid #ffffff18;border-radius:9px}.rain-generation-panel :global(.rain-generation-player a){display:inline-block;font-size:10px;color:#a9d8c9;text-decoration:underline;margin-top:10px}.rain-generation-panel :global(.rain-generation-quality){border:1px solid #ffffff18;border-radius:12px;padding:16px;margin:18px 0}.rain-generation-panel :global(.rain-generation-quality h4){font-size:13px;font-weight:600;color:#dce9e2}.rain-generation-panel :global(.rain-generation-quality summary){cursor:pointer;font-size:12px;color:#bcd4c7}.rain-generation-panel :global(.rain-generation-quality ul){padding-left:18px;font-size:11px;line-height:1.8;color:#aabdb2}.rain-generation-panel :global(.rain-generation-usage){font-size:10px;line-height:1.8;color:#a0aaa8;margin-top:12px}
      .rain-generation-panel :global(.rain-generation-poster){max-width:800px;margin:18px 0}.rain-generation-panel :global(.rain-generation-poster img){display:block;width:100%;height:auto;max-height:450px;object-fit:contain;background:#09120f;border:1px solid #ffffff18;border-radius:9px}.rain-generation-panel :global(.rain-generation-poster figcaption){margin-top:10px;font-size:11px;line-height:1.7;color:#c5d6ca}
      @media(max-width:700px){.rain-generation-panel{padding:17px}.rain-generation-quote{grid-template-columns:1fr}.rain-generation-action>button{width:100%}.rain-generation-panel :global(.rain-generation-players){grid-template-columns:1fr}.rain-generation-panel :global(.rain-generation-job-heading){align-items:flex-start}.rain-generation-panel :global(.rain-generation-job-heading .rain-eyebrow){font-size:8px;letter-spacing:1px}}
    `}</style>
  </section>;
}
