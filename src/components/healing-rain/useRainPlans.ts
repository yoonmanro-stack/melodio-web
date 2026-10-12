'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { parseRecipe, type RainPlan, type RecipeInput } from '@/lib/healing-rain/recipes';

const draftStorageEntry = 'melodio.healing-rain.plans.v1';
type Account = 'checking' | 'guest' | 'signed-in' | 'unavailable';

function readLocalPlans(): RainPlan[] {
  const value: unknown = JSON.parse(localStorage.getItem(draftStorageEntry) || '[]');
  if (!Array.isArray(value)) throw new Error('브라우저 초안을 읽을 수 없습니다. 저장소 설정을 확인해 주세요.');
  return value.filter((plan): plan is RainPlan => {
    try {
      return plan?.schemaVersion === 1 && typeof plan.id === 'string' &&
        typeof plan.createdAt === 'string' && Boolean(parseRecipe(plan.input));
    } catch { return false; }
  });
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new Error('로그인이 만료되었습니다. 다시 로그인한 뒤 저장해 주세요.');
    if (data?.code === 'persistence_not_ready') throw new Error('계정 저장소를 준비 중입니다. 잠시 후 다시 시도하거나 브라우저 초안으로 보관해 주세요.');
    throw new Error(data?.error || '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return data as T;
}

export function useRainPlans(onAccountChange: () => void) {
  const [account, setAccount] = useState<Account>('checking');
  const [source, setSource] = useState<'account' | 'browser'>('browser');
  const [plans, setPlans] = useState<RainPlan[]>([]);
  const [localCount, setLocalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const identity = useRef<string | null | undefined>(undefined);
  const epoch = useRef(0);
  const listRequest = useRef(0);
  const operation = useRef(false);
  const pendingSave = useRef<{ input: string; key: string } | null>(null);

  useEffect(() => {
    let active = true;
    function observeUser(id: string | null) {
      if (!active || identity.current === id) return;
      if (identity.current !== undefined) onAccountChange();
      identity.current = id;
      epoch.current++;
      listRequest.current++;
      pendingSave.current = null;
      setPlans([]);
      setNextCursor(null);
      setLoading(false);
      setError('');
      setMessage('');
      setAccount(id ? 'signed-in' : 'guest');
      setSource(id ? 'account' : 'browser');
    }
    let unsubscribe: (() => void) | undefined;
    try {
      const client: SupabaseClient = createClient();
      const { data } = client.auth.onAuthStateChange((_event, session) => observeUser(session?.user.id ?? null));
      unsubscribe = () => data.subscription.unsubscribe();
      void client.auth.getUser().then(({ data, error: authError }) => {
        if (!active || identity.current !== undefined) return;
        if (authError && authError.name !== 'AuthSessionMissingError') {
          setAccount('unavailable');
        } else observeUser(data.user?.id ?? null);
      }).catch(() => { if (active && identity.current === undefined) setAccount('unavailable'); });
    } catch {
      void Promise.resolve().then(() => { if (active) setAccount('unavailable'); });
    }
    function dispose() {
      active = false;
      unsubscribe?.();
      epoch.current++;
      listRequest.current++;
    }
    return dispose;
  }, [onAccountChange]);

  const refresh = useCallback(async (cursor?: string) => {
    const current = ++listRequest.current;
    setLoading(true);
    setError('');
    try {
      if (source === 'browser') {
        const local = readLocalPlans();
        setLocalCount(local.length);
        setPlans(local);
        setNextCursor(null);
        return;
      }
      // Account history remains available even when browser storage is blocked.
      try { setLocalCount(readLocalPlans().length); }
      catch { setLocalCount(0); }
      if (account !== 'signed-in') return;
      const data = await request<{ projects: RainPlan[]; nextCursor: string | null }>(
        `/api/healing-rain/projects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      if (current !== listRequest.current) return;
      setPlans(previous => cursor ? [...previous, ...data.projects.filter(p => !previous.some(old => old.id === p.id))] : data.projects);
      setNextCursor(data.nextCursor);
    } catch (err) {
      if (current === listRequest.current) setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.');
    } finally {
      if (current === listRequest.current) setLoading(false);
    }
  }, [account, source]);

  function selectSource(value: 'account' | 'browser') {
    if (operation.current) return;
    listRequest.current++;
    setPlans([]);
    setNextCursor(null);
    setSource(value);
  }

  async function save(input: RecipeInput) {
    if (operation.current || account === 'checking') return;
    operation.current = true;
    const current = epoch.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const parsed = parseRecipe(input);
      if (source === 'account') {
        if (account !== 'signed-in') throw new Error('계정에 저장하려면 로그인해 주세요.');
        const serialized = JSON.stringify(parsed);
        if (pendingSave.current?.input !== serialized) pendingSave.current = { input: serialized, key: crypto.randomUUID() };
        await request('/api/healing-rain/projects', { clientRequestId: pendingSave.current.key, input: parsed });
        if (current !== epoch.current) return;
        pendingSave.current = null;
        setMessage('계정에 제작 계획을 저장했습니다. 생성 비용은 발생하지 않았습니다.');
      } else {
        const data = await request<{ plan: RainPlan }>('/api/healing-rain/plan', parsed);
        if (current !== epoch.current) return;
        const next = [data.plan, ...readLocalPlans()];
        localStorage.setItem(draftStorageEntry, JSON.stringify(next));
        setLocalCount(next.length);
        setMessage('이 브라우저에 초안을 저장했습니다. 로그인 후 계정으로 가져올 수 있습니다.');
      }
      await refresh();
    } catch (err) {
      if (current === epoch.current) setError(err instanceof Error ? err.message : '계획을 저장하지 못했습니다.');
    } finally { operation.current = false; setBusy(false); }
  }

  async function importLocal() {
    if (operation.current || account !== 'signed-in') return;
    operation.current = true;
    const current = epoch.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const local = readLocalPlans();
      let created = 0;
      let existing = 0;
      for (let start = 0; start < local.length; start += 50) {
        if (current !== epoch.current) return;
        const data = await request<{ createdCount: number; existingCount: number }>('/api/healing-rain/projects/import', {
          projects: local.slice(start, start + 50).map(plan => ({ clientRequestId: `local:${plan.id}`, input: parseRecipe(plan.input) })),
        });
        created += data.createdCount;
        existing += data.existingCount;
      }
      if (current !== epoch.current) return;
      setMessage(`계정에 ${created}개를 가져왔습니다. 이미 저장된 ${existing}개는 중복 없이 유지했습니다. 브라우저 원본도 보관됩니다.`);
      if (source === 'account') await refresh();
      else {
        listRequest.current++;
        setPlans([]);
        setNextCursor(null);
        setSource('account');
      }
    } catch (err) {
      if (current === epoch.current) setError(`${err instanceof Error ? err.message : '가져오기를 완료하지 못했습니다.'} 다시 시도해도 이미 가져온 초안은 중복 저장되지 않습니다.`);
    } finally { operation.current = false; setBusy(false); }
  }

  return { account, source, plans, localCount, nextCursor, loading, busy, error, message,
    setError, setMessage, selectSource, refresh, save, importLocal };
}
