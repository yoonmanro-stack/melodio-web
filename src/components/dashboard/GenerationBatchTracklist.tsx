'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, RefreshCw } from 'lucide-react';
import { registerActiveAudio } from '@/lib/globalAudio';
import type { GenerationBatchTracklist as BatchTracklist } from '@/lib/generation-batches/model';

const REFRESH_INTERVAL_MS = 5_000;
const MAX_BACKGROUND_REFRESHES = 12;
const REQUEST_TIMEOUT_MS = 15_000;

function durationLabel(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '길이 미확인';
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const remainder = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
}

async function readBatchResponse(response: Response, batchId: string): Promise<BatchTracklist> {
  if (!response.ok) throw new Error('batch_request_failed');
  const body = await response.json();
  const data = body?.data as BatchTracklist | undefined;
  if (
    body?.success !== true || !data || data.id !== batchId
    || typeof data.eligible !== 'boolean' || !Number.isInteger(data.selectionRevision)
    || !Array.isArray(data.pairs) || !Array.isArray(data.selectedGenerationIds)
    || !Array.isArray(data.preview?.rows)
  ) throw new Error('invalid_batch_response');
  return data;
}

export default function GenerationBatchTracklist({ batchId }: { batchId: string }) {
  const [batch, setBatch] = useState<BatchTracklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshCountRef = useRef(0);

  const clearRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  }, []);

  const loadBatch = useCallback(async (notice: string | null = null) => {
    clearRefresh();
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const isCurrent = () => mountedRef.current && requestRef.current === controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    setLoading(true);
    try {
      const response = await fetch(`/api/generation-batches/${encodeURIComponent(batchId)}`, {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      const next = await readBatchResponse(response, batchId);
      if (!isCurrent()) return;
      setBatch(next);
      setError(notice);
      if (
        !next.eligible && next.ineligibilityReason !== 'invalid_pairing'
        && next.completedOutputCount < next.expectedOutputCount
        && refreshCountRef.current < MAX_BACKGROUND_REFRESHES
      ) {
        refreshCountRef.current += 1;
        refreshTimerRef.current = setTimeout(() => void loadBatch(), REFRESH_INTERVAL_MS);
      }
    } catch {
      if (isCurrent()) setError('생성 작업 정보를 불러오지 못했습니다. 다시 불러와 주세요.');
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) setLoading(false);
    }
  }, [batchId, clearRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    refreshCountRef.current = 0;
    void loadBatch();
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      clearRefresh();
    };
  }, [clearRefresh, loadBatch]);

  async function saveSelection(selectedGenerationIds: string[]) {
    if (!batch || batch.id !== batchId || !batch.eligible || saveInFlightRef.current || loading) return;
    saveInFlightRef.current = true;
    clearRefresh();
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const isCurrent = () => mountedRef.current && requestRef.current === controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/generation-batches/${encodeURIComponent(batchId)}`, {
        method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ expectedRevision: batch.selectionRevision, selectedGenerationIds }),
      });
      if (!isCurrent()) return;
      if (response.status === 409) {
        await loadBatch('다른 화면에서 목록이 변경되어 최신 목록을 불러왔습니다. 변경 내용을 확인해 주세요.');
        return;
      }
      const next = await readBatchResponse(response, batchId);
      if (isCurrent()) setBatch(next);
    } catch {
      if (isCurrent()) setError('선택을 저장하지 못했습니다. 마지막으로 확인된 목록을 표시합니다. 다시 불러와 주세요.');
    } finally {
      clearTimeout(timeout);
      saveInFlightRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  const refresh = () => {
    if (saveInFlightRef.current) return;
    refreshCountRef.current = 0;
    void loadBatch();
  };

  // Never combine dashboard history or infer pair membership from titles.
  if (batch?.id !== batchId || !batch.eligible) {
    return error ? <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-3 text-xs text-amber-200">
      <p role="alert">{error}</p>
      <button type="button" onClick={refresh} disabled={loading || saving} className="mt-2 rounded-lg border border-amber-400/30 px-3 py-2 disabled:opacity-50">다시 불러오기</button>
    </div> : null;
  }

  const candidates = new Map(batch.pairs.flatMap(pair => [pair.a, pair.b]
    .filter(candidate => candidate !== null).map(candidate => [candidate.id, candidate] as const)));
  const pairsByGeneration = new Map(batch.pairs.flatMap(pair => [pair.a, pair.b]
    .filter(candidate => candidate !== null).map(candidate => [candidate.id, pair] as const)));
  const busy = loading || saving;
  const missingDurationCount = batch.preview.rows.filter(row => row.durationSeconds === null).length;

  function move(index: number, offset: number) {
    if (!batch) return;
    const reordered = [...batch.selectedGenerationIds];
    const destination = index + offset;
    if (destination < 0 || destination >= reordered.length) return;
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    void saveSelection(reordered);
  }

  return <section aria-label="이 생성 작업의 플레이리스트" className="space-y-4 rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h4 className="text-sm font-bold text-cyan-200">이 생성 작업의 플레이리스트</h4>
        <p className="mt-1 text-xs text-zinc-300">생성 {batch.completedOutputCount}곡 · 선택 {batch.selectedGenerationIds.length}곡</p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">각 A/B 쌍에서 A를 기본 선택합니다. B로 바꾸거나 곡 순서를 조정하면 이 생성 작업의 목록에 저장됩니다.</p>
      </div>
      <button type="button" onClick={refresh} disabled={busy} aria-label="생성 작업 목록 새로고침" className="shrink-0 rounded-lg border border-white/10 p-2 text-zinc-300 hover:bg-white/5 disabled:opacity-50">
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>

    <div className="rounded-lg bg-black/25 p-3">
      <p className="text-xs font-semibold text-cyan-100">예상 총 길이 · {durationLabel(batch.preview.durationSeconds)}</p>
      {!batch.preview.timelineComplete ? <p className="mt-1 text-[11px] text-amber-200">{missingDurationCount > 0 ? `${missingDurationCount}곡의 길이가 미확인입니다. ` : ''}미확인 곡 이후의 시작 시각과 전체 길이는 확인 후 표시됩니다.</p> : null}
      <p className="mt-1 text-[11px] text-zinc-400">선택한 곡 전체의 길이를 합산한 미리보기입니다. 완성 파일의 길이와 시작 시각은 조립 후 확인해야 합니다.</p>
    </div>

    {error ? <p role="alert" className="text-xs text-amber-200">{error}</p> : null}
    <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-[11px] text-zinc-400">
      {saving ? <><Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />선택과 순서 저장 중…</> : batch.selectionSource === 'saved' ? '저장된 선택과 순서' : '기본 선택 · 입력 순서의 A 후보'}
    </p>

    <ol className="space-y-3">
      {batch.preview.rows.map((row, index) => {
        const candidate = candidates.get(row.generationId);
        const pair = pairsByGeneration.get(row.generationId);
        if (!candidate || !pair) return null;
        return <li key={row.generationId} className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-start gap-2">
            <span className="pt-0.5 text-xs font-semibold text-cyan-300">{String(index + 1).padStart(2, '0')}</span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-xs font-semibold text-zinc-100">{row.title}</p>
              <p className="mt-1 text-[11px] text-zinc-400">시작 {row.timestamp ?? '확인 대기'} · {durationLabel(row.durationSeconds)} · 후보 {candidate.slot}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => move(index, -1)} disabled={busy || index === 0} aria-label={`${row.title} 위로 이동`} className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10 disabled:opacity-25"><ArrowUp aria-hidden="true" className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => move(index, 1)} disabled={busy || index === batch.preview.rows.length - 1} aria-label={`${row.title} 아래로 이동`} className="rounded-md p-1.5 text-zinc-300 hover:bg-white/10 disabled:opacity-25"><ArrowDown aria-hidden="true" className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div role="group" aria-label={`${row.title} 생성 후보 선택`} className="mt-2 flex flex-wrap gap-2">
            {[pair.a, pair.b].map(option => option ? <button
              key={option.id} type="button" aria-pressed={option.id === row.generationId}
              aria-label={`후보 ${option.slot} 선택: ${option.title}`} title={option.title}
              disabled={busy || option.id === row.generationId}
              onClick={() => void saveSelection(batch.selectedGenerationIds.map(id => id === row.generationId ? option.id : id))}
              className={`rounded-md border px-2 py-1 text-[11px] disabled:cursor-default ${option.id === row.generationId ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200' : 'border-white/10 text-zinc-300 hover:bg-white/5 disabled:opacity-50'}`}
            >{option.slot} {option.id === row.generationId ? '선택됨' : '선택'} · {durationLabel(option.durationSeconds)}</button> : null)}
          </div>
          <audio key={candidate.id} src={candidate.audioUrl} controls preload="none" aria-label={`${row.title} 후보 ${candidate.slot} 듣기`} className="mt-2 h-9 w-full" onPlay={event => registerActiveAudio(event.currentTarget)} />
        </li>;
      })}
    </ol>

    <details className="rounded-lg border border-white/10 bg-black/20 p-3">
      <summary className="cursor-pointer text-[11px] font-semibold text-cyan-200">예상 트랙리스트 · 곡 전체를 순서대로 연결한 기준</summary>
      <pre className="mt-3 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-zinc-300">{batch.preview.tracklistText}</pre>
    </details>
  </section>;
}
