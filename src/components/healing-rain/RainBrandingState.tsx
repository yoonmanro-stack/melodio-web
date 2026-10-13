'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_BRANDING_CONFIG,
  normalizeBrandingConfig,
  type BrandingConfig,
  type BrandingProfile,
} from '../../../shared/healing-rain/branding';

type Account = 'checking' | 'guest' | 'signed-in' | 'unavailable';
type Listing = { profiles: BrandingProfile[]; selectedProfileId: string | null; selectionVersion: number };
type Draft = { name: string; config: BrandingConfig };
const emptyDraft = (): Draft => ({ name: '', config: { ...DEFAULT_BRANDING_CONFIG } });
const serialize = (draft: Draft) => JSON.stringify(draft);

async function request<T>(path: string, init: RequestInit, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { ...init, signal, cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    if (response.status === 409) throw new Error('다른 화면에서 프로필이 변경되었습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.');
    if (data?.code === 'persistence_not_ready') throw new Error('브랜딩 저장소를 준비 중입니다. 잠시 후 다시 시도해 주세요.');
    throw new Error(data?.error || '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  return data as T;
}

const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

export function useRainBranding() {
  const [account, setAccount] = useState<Account>('checking');
  const [profiles, setProfiles] = useState<BrandingProfile[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [savedDraft, setSavedDraft] = useState(() => serialize(emptyDraft()));
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'save' | 'select' | 'upload' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const identity = useRef<string | null | undefined>(undefined);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const pendingSave = useRef<{ serialized: string; key: string } | null>(null);
  const pendingSelection = useRef<{ serialized: string; key: string } | null>(null);
  const dirty = serialize(draft) !== savedDraft;
  const profile = profiles.find(item => item.id === profileId) ?? null;

  const showProfile = useCallback((next: BrandingProfile | null) => {
    const value = next ? { name: next.name, config: { ...next.config } } : emptyDraft();
    setDraft(value);
    setSavedDraft(serialize(value));
    setProfileId(next?.id ?? null);
    setLogoPreviewUrl(next?.logoPreviewUrl ?? null);
    setError('');
    setMessage('');
    pendingSave.current = null;
  }, []);

  const refresh = useCallback(async () => {
    if (!identity.current || operation.current) return;
    const current = epoch.current;
    const signal = controller.current?.signal;
    if (!signal) return;
    operation.current = true;
    setLoading(true);
    setError('');
    try {
      const data = await request<Listing>('/api/healing-rain/branding', {}, signal);
      if (current !== epoch.current) return;
      setProfiles(data.profiles);
      setSelectedProfileId(data.selectedProfileId);
      setSelectionVersion(data.selectionVersion);
      showProfile(data.profiles.find(item => item.id === data.selectedProfileId) ?? data.profiles[0] ?? null);
    } catch (err) {
      if (current === epoch.current && !signal.aborted) setError(err instanceof Error ? err.message : '프로필을 불러오지 못했습니다.');
    } finally {
      if (current === epoch.current) { operation.current = false; setLoading(false); }
    }
  }, [showProfile]);

  useEffect(() => {
    let active = true;
    const observeUser = (id: string | null) => {
      if (!active || identity.current === id) return;
      controller.current?.abort();
      controller.current = new AbortController();
      identity.current = id;
      epoch.current++;
      operation.current = false;
      pendingSelection.current = null;
      setBusy(null);
      setLoading(false);
      setProfiles([]);
      setSelectedProfileId(null);
      setSelectionVersion(0);
      showProfile(null);
      setAccount(id ? 'signed-in' : 'guest');
      if (id) void refresh();
    };
    let unsubscribe: (() => void) | undefined;
    try {
      const client: SupabaseClient = createClient();
      const { data } = client.auth.onAuthStateChange((_event, session) => observeUser(session?.user.id ?? null));
      unsubscribe = () => data.subscription.unsubscribe();
      void client.auth.getUser().then(({ data, error: authError }) => {
        if (!active || identity.current !== undefined) return;
        if (authError && authError.name !== 'AuthSessionMissingError') setAccount('unavailable');
        else observeUser(data.user?.id ?? null);
      }).catch(() => { if (active && identity.current === undefined) setAccount('unavailable'); });
    } catch {
      void Promise.resolve().then(() => { if (active) setAccount('unavailable'); });
    }
    function dispose() {
      active = false;
      unsubscribe?.();
      controller.current?.abort();
      identity.current = undefined;
      operation.current = false;
      epoch.current++;
    }
    return dispose;
  }, [refresh, showProfile]);

  function changeName(name: string) {
    setDraft(previous => ({ ...previous, name }));
    setError(''); setMessage('');
  }

  function changeConfig<K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) {
    setDraft(previous => ({ ...previous, config: { ...previous.config, [key]: value } }));
    setError(''); setMessage('');
  }

  async function save() {
    if (account !== 'signed-in' || operation.current) return;
    const current = epoch.current;
    const signal = controller.current?.signal;
    if (!signal) return;
    operation.current = true;
    setBusy('save'); setError(''); setMessage('');
    try {
      if (!draft.name.trim()) throw new Error('프로필 이름을 입력해 주세요.');
      const config = normalizeBrandingConfig(draft.config, { strict: true });
      const body = { name: draft.name.trim(), config, ...(profile ? { expectedVersion: profile.version } : {}) };
      const serialized = JSON.stringify({ profileId, ...body });
      if (pendingSave.current?.serialized !== serialized) pendingSave.current = { serialized, key: crypto.randomUUID() };
      const data = await request<{ profile: BrandingProfile }>(
        `/api/healing-rain/branding${profileId ? `/${encodeURIComponent(profileId)}` : ''}`,
        jsonRequest(profileId ? 'PATCH' : 'POST', { ...body, clientRequestId: pendingSave.current.key }), signal,
      );
      if (current !== epoch.current) return;
      setProfiles(previous => [...previous.filter(item => item.id !== data.profile.id), data.profile]);
      showProfile(data.profile);
      setMessage(selectedProfileId === data.profile.id
        ? '계정에 저장했습니다. 다음 제작부터 저장한 설정을 사용합니다.'
        : '계정에 저장했습니다. 제작에 적용하려면 이 프로필 사용을 눌러주세요.');
    } catch (err) {
      if (current === epoch.current && !signal.aborted) setError(err instanceof Error ? err.message : '프로필을 저장하지 못했습니다.');
    } finally {
      if (current === epoch.current) { operation.current = false; setBusy(null); }
    }
  }

  async function select(id: string | null) {
    if (account !== 'signed-in' || operation.current) return;
    const current = epoch.current;
    const signal = controller.current?.signal;
    if (!signal) return;
    operation.current = true;
    setBusy('select'); setError(''); setMessage('');
    try {
      const body = { profileId: id, expectedVersion: selectionVersion };
      const serialized = JSON.stringify(body);
      if (pendingSelection.current?.serialized !== serialized) pendingSelection.current = { serialized, key: crypto.randomUUID() };
      const data = await request<Pick<Listing, 'selectedProfileId' | 'selectionVersion'>>(
        '/api/healing-rain/branding/selection',
        jsonRequest('PUT', { ...body, clientRequestId: pendingSelection.current.key }), signal,
      );
      if (current !== epoch.current) return;
      setSelectedProfileId(data.selectedProfileId);
      setSelectionVersion(data.selectionVersion);
      pendingSelection.current = null;
      setMessage(id ? '다음 제작에 사용할 프로필을 선택했습니다.' : '브랜딩 적용을 해제했습니다. 저장한 프로필은 유지됩니다.');
    } catch (err) {
      if (current === epoch.current && !signal.aborted) setError(err instanceof Error ? err.message : '프로필 선택을 저장하지 못했습니다.');
    } finally {
      if (current === epoch.current) { operation.current = false; setBusy(null); }
    }
  }

  async function uploadLogo(file: File) {
    if (account !== 'signed-in' || operation.current) return;
    const current = epoch.current;
    const signal = controller.current?.signal;
    if (!signal) return;
    setError(''); setMessage('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('PNG, JPEG, WebP 로고 파일을 선택해 주세요.'); return;
    }
    if (file.size > 2 * 1024 * 1024) { setError('로고는 2MB 이하로 올려주세요.'); return; }
    operation.current = true;
    setBusy('upload');
    try {
      const data = await request<{ logoPath: string; logoPreviewUrl: string }>(
        '/api/healing-rain/branding/logo', { method: 'POST', headers: { 'Content-Type': file.type }, body: file }, signal,
      );
      if (current !== epoch.current) return;
      setDraft(previous => ({ ...previous, config: { ...previous.config, logoPath: data.logoPath } }));
      setLogoPreviewUrl(data.logoPreviewUrl);
      setMessage('로고를 업로드했습니다. 프로필을 저장하면 이 로고가 적용됩니다.');
    } catch (err) {
      if (current === epoch.current && !signal.aborted) setError(err instanceof Error ? err.message : '로고를 올리지 못했습니다.');
    } finally {
      if (current === epoch.current) { operation.current = false; setBusy(null); }
    }
  }

  function removeLogo() {
    changeConfig('logoPath', null);
    setLogoPreviewUrl(null);
  }

  return {
    account, profiles, profileId, selectedProfileId, draft, logoPreviewUrl, dirty, loading, busy, error, message,
    changeName, changeConfig, showProfile, refresh, save, select, uploadLogo, removeLogo,
  };
}
