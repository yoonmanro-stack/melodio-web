'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Check, Plus, RefreshCw, Save, Upload, X } from 'lucide-react';
import type { SceneId } from '@/lib/healing-rain/recipes';
import type { BrandingConfig } from '../../../shared/healing-rain/branding';
import { useRainBranding } from './RainBrandingState';
import { RainBrandingPreview } from './RainBrandingPreview';
import './rain-branding.css';

const presets: { id: BrandingConfig['preset']; name: string; description: string; mark: string }[] = [
  { id: 'minimal', name: '미니멀', description: '구분선 없이 단정한 제목', mark: 'Aa' },
  { id: 'classic', name: '클래식', description: '차분한 제목과 섬세한 구분선', mark: 'Aa' },
  { id: 'natural', name: '내추럴', description: '편안하고 절제된 제목', mark: 'Aa' },
  { id: 'modern', name: '모던', description: '명료한 제목과 작은 포인트', mark: 'Aa' },
];
type PendingChange = { kind: 'new' | 'refresh' } | { kind: 'profile'; id: string };

export function RainBrandingPanel({ title, scene }: { title: string; scene: SceneId }) {
  const branding = useRainBranding();
  const { account, profiles, profileId, selectedProfileId, draft, logoPreviewUrl, dirty, loading, busy, error, message } = branding;
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const config = draft.config;
  const locked = loading || Boolean(busy) || account === 'checking';
  const canSave = account === 'signed-in' && !locked && Boolean(draft.name.trim());
  const totalSeconds = config.fadeInSeconds + config.holdSeconds + config.fadeOutSeconds;
  const validTiming = Number.isFinite(totalSeconds) && totalSeconds <= 15 && config.fadeInSeconds >= 0 && config.holdSeconds >= 0.5 && config.fadeOutSeconds >= 0;
  const selected = profiles.find(profile => profile.id === selectedProfileId);
  const appliedEnabled = selected?.config.enabled && selected.config.mode !== 'none';

  function applyChange(change: PendingChange) {
    setPendingChange(null);
    if (change.kind === 'refresh') void branding.refresh();
    else {
      const id = change.kind === 'profile' ? change.id : null;
      branding.showProfile(profiles.find(profile => profile.id === id) ?? null);
    }
  }

  function requestChange(change: PendingChange) {
    if (dirty) setPendingChange(change);
    else applyChange(change);
  }

  function toggleEnabled(enabled: boolean) {
    branding.changeConfig('enabled', enabled);
    if (enabled && config.mode === 'none') branding.changeConfig('mode', 'title');
  }

  return <section className="rain-branding" aria-label="채널 브랜딩 설정">
    <div className="rain-section-heading"><div><h2>채널 브랜딩</h2><p>내 채널의 이름과 로고를 저장하고, 영상에 사용할 프로필을 직접 선택하세요.</p></div><span className={`rain-branding-save-state${dirty ? ' is-dirty' : ''}`}>{dirty ? '저장하지 않은 변경 있음' : profileId ? '계정 저장본' : '새 프로필'}</span></div>
    <div className="rain-branding-applied" role="status"><span className="rain-branding-status-dot" data-active={Boolean(appliedEnabled)}/><div><strong>{selected ? `다음 제작에 선택됨: ${selected.name}` : '현재 적용 중인 프로필 없음'}</strong><p>{appliedEnabled ? '새로 시작하는 제작에는 이 프로필의 저장된 설정이 적용됩니다.' : '브랜딩은 꺼져 있습니다. 텍스트와 로고 없이 제작할 수 있습니다.'}</p></div>{selectedProfileId ? <button className="rain-secondary" disabled={locked} onClick={() => void branding.select(null)}>적용 해제</button> : null}</div>
    {account === 'checking' ? <p className="rain-note" role="status">로그인 상태를 확인하는 중…</p> : account !== 'signed-in' ? <div className="rain-branding-account">{account === 'unavailable' ? '로그인 상태를 확인하지 못했습니다. ' : ''}<Link href="/login">로그인</Link>하면 내 계정에 여러 채널 프로필과 로고를 저장할 수 있습니다. 지금은 화면에서 설정을 미리 볼 수 있습니다.</div> : null}
    {error ? <div className="rain-alert error" role="alert">{error}</div> : null}
    {message ? <div className="rain-alert" role="status">{message}</div> : null}
    <div className="rain-branding-profiles">
      <label className="rain-field">저장한 프로필<select value={profileId ?? ''} disabled={locked || !profiles.length} onChange={event => requestChange(event.target.value ? { kind: 'profile', id: event.target.value } : { kind: 'new' })}><option value="">새 프로필</option>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}{profile.id === selectedProfileId ? ' · 제작에 선택됨' : ''}</option>)}</select></label>
      <button className="rain-secondary" disabled={locked} onClick={() => requestChange({ kind: 'new' })}><Plus size={14}/>새 프로필</button>
      <button className="rain-secondary" disabled={locked || account !== 'signed-in'} onClick={() => requestChange({ kind: 'refresh' })}><RefreshCw size={14}/>{loading ? '불러오는 중…' : '목록 새로고침'}</button>
    </div>
    {pendingChange ? <div className="rain-branding-discard" role="alert"><p>저장하지 않은 변경이 있습니다. 다른 프로필을 불러오면 현재 변경 내용은 사라집니다.</p><div><button className="rain-secondary" onClick={() => setPendingChange(null)}>계속 편집</button><button className="rain-secondary" onClick={() => applyChange(pendingChange)}>변경 내용 버리고 불러오기</button></div></div> : null}
    <div className="rain-branding-grid">
      <div className="rain-branding-editor">
        <fieldset disabled={locked} className="rain-branding-fields">
          <label className="rain-field">프로필 이름<input maxLength={80} value={draft.name} placeholder="예: 수면 영상 채널" onChange={event => branding.changeName(event.target.value)}/><span>프로필을 구분하는 이름입니다. 영상에는 표시되지 않습니다.</span></label>
          <label className="rain-branding-toggle"><span><strong>영상에 브랜딩 표시</strong><small>직접 켠 경우에만 표시하며, 꺼도 설정은 보관합니다.</small></span><input type="checkbox" role="switch" checked={config.enabled} onChange={event => toggleEnabled(event.target.checked)}/></label>
          <label className="rain-field">표시 방식<select value={config.mode} onChange={event => branding.changeConfig('mode', event.target.value as BrandingConfig['mode'])}><option value="none">표시 안 함</option><option value="title">영상 제목</option><option value="channel-title">채널 이름 + 영상 제목</option><option value="logo-title">로고 + 영상 제목</option></select></label>
          <label className="rain-field">채널 이름 <span>선택</span><input maxLength={80} value={config.channelName} placeholder="내 채널 이름을 입력하세요" onChange={event => branding.changeConfig('channelName', event.target.value)}/></label>
          <label className="rain-field">고정 문구 <span>선택</span><input maxLength={160} value={config.tagline} placeholder="모든 영상에 함께 쓸 짧은 문구" onChange={event => branding.changeConfig('tagline', event.target.value)}/></label>
          <div className="rain-field"><span className="rain-branding-field-label">채널 로고 <small>선택 · PNG, JPEG, WebP · 최대 2MB</small></span><div className="rain-branding-logo-upload">{logoPreviewUrl ? <Image src={logoPreviewUrl} alt="선택한 채널 로고" width={64} height={64} unoptimized/> : null}<label className="rain-secondary rain-branding-upload-button"><Upload size={14}/>{busy === 'upload' ? '업로드 중…' : config.logoPath ? '로고 바꾸기' : '로고 업로드'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={locked || account !== 'signed-in'} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void branding.uploadLogo(file); }}/></label>{config.logoPath ? <button className="rain-secondary" onClick={branding.removeLogo}><X size={14}/>로고 제거</button> : null}</div><span>업로드한 로고는 내 계정 전용 저장소에 보관합니다.</span></div>
          <fieldset className="rain-field rain-branding-presets"><legend>스타일 프리셋</legend><p className="rain-note">원하는 스타일을 눌러 선택하세요. 영상마다 자동으로 바뀌지 않습니다.</p><div>{presets.map(preset => <button key={preset.id} className={`rain-branding-preset preset-${preset.id}`} aria-pressed={config.preset === preset.id} onClick={() => branding.changeConfig('preset', preset.id)}><span aria-hidden="true">{preset.mark}</span><strong>{preset.name}</strong><small>{preset.description}</small>{config.preset === preset.id ? <Check size={13}/> : null}</button>)}</div></fieldset>
          <div className="rain-two"><label className="rain-field">서체<select value={config.font} onChange={event => branding.changeConfig('font', event.target.value as BrandingConfig['font'])}><option value="sans">산세리프 · 단정한 글꼴</option><option value="serif">세리프 · 부드러운 명조</option></select></label><label className="rain-field">글자 크기<select value={config.size} onChange={event => branding.changeConfig('size', event.target.value as BrandingConfig['size'])}><option value="small">작게</option><option value="medium">보통</option><option value="large">크게</option></select></label></div>
          <div className="rain-two"><label className="rain-field">글자 색<select value={config.color} onChange={event => branding.changeConfig('color', event.target.value as BrandingConfig['color'])}><option value="ivory">아이보리</option><option value="white">화이트</option><option value="warm">웜 베이지</option></select></label><label className="rain-field">위치<select value={config.position} onChange={event => branding.changeConfig('position', event.target.value as BrandingConfig['position'])}><option value="center">화면 가운데</option><option value="lower-third">화면 아래쪽</option><option value="upper-third">화면 위쪽</option></select></label></div>
          <fieldset className="rain-field"><legend>표시 시간</legend><div className="rain-branding-timing">{([
            ['fadeInSeconds', '나타나기', 0], ['holdSeconds', '유지', 0.5], ['fadeOutSeconds', '사라지기', 0],
          ] as const).map(([key, label, minimum]) => <label key={key}>{label}<span><input type="number" min={minimum} max={15} step={0.5} value={Number.isFinite(config[key]) ? config[key] : ''} onChange={event => branding.changeConfig(key, event.target.value === '' ? 0 : Number(event.target.value))}/>초</span></label>)}</div><span className={validTiming ? '' : 'rain-branding-timing-error'} role={validTiming ? undefined : 'alert'}>합계 {Number.isFinite(totalSeconds) ? Number(totalSeconds.toFixed(1)) : '—'}초 / 최대 15초{!validTiming ? ' · 유지 시간은 0.5초 이상, 전체는 15초 이하로 설정해 주세요.' : ''}</span></fieldset>
        </fieldset>
        <div className="rain-branding-save-actions"><button className="rain-primary" disabled={!canSave || !validTiming || (!dirty && Boolean(profileId))} onClick={() => void branding.save()}><Save size={15}/>{busy === 'save' ? '저장 중…' : profileId ? '프로필 저장' : '새 프로필 저장'}</button><button className="rain-secondary" disabled={locked || account !== 'signed-in' || !profileId || dirty || selectedProfileId === profileId} onClick={() => void branding.select(profileId)}><Check size={15}/>{busy === 'select' ? '선택 중…' : selectedProfileId === profileId && profileId ? '제작에 선택됨' : '이 프로필 사용'}</button></div>
        <p className="rain-note">{dirty ? '현재 미리보기에는 저장하지 않은 변경이 포함되어 있습니다. 프로필을 저장한 뒤 제작에 선택해 주세요.' : '계정에 저장한 설정과 제작에 선택한 프로필만 다음 영상에 적용됩니다.'} 브랜딩 설정 없이도 일반 제작은 계속할 수 있습니다.</p>
      </div>
      <RainBrandingPreview config={config} title={title} scene={scene} logoPreviewUrl={logoPreviewUrl}/>
    </div>
  </section>;
}
