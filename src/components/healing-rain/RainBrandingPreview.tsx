'use client';

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { Play, RotateCcw } from 'lucide-react';
import type { SceneId } from '@/lib/healing-rain/recipes';
import { resolveBrandingOverlay, type BrandingConfig } from '../../../shared/healing-rain/branding';
import { SceneArt } from './SceneArt';

type Props = { config: BrandingConfig; title: string; scene: SceneId; logoPreviewUrl: string | null };

export function RainBrandingPreview({ config, title, scene, logoPreviewUrl }: Props) {
  const [replay, setReplay] = useState(0);
  let overlay: ReturnType<typeof resolveBrandingOverlay> = null;
  try { overlay = resolveBrandingOverlay(config, title); } catch { /* Invalid timing is explained by the editor. */ }
  const colors = { ivory: '#F4F0E6', white: '#FFFFFF', warm: '#EACAA5' };
  const style = overlay ? {
    color: colors[overlay.color],
    '--branding-fade-in': `${overlay.fadeInSeconds}s`,
    '--branding-fade-out': `${overlay.fadeOutSeconds}s`,
    '--branding-fade-delay': `${overlay.fadeInSeconds + overlay.holdSeconds}s`,
  } as CSSProperties : undefined;

  return <aside className="rain-branding-preview" aria-label="브랜딩 미리보기">
    <div className="rain-branding-preview-heading"><div><span className="rain-eyebrow">BRANDING PREVIEW</span><h3>내 장면에서 확인하기</h3></div><span className="rain-badge">{overlay ? '브랜딩 켜짐' : '오버레이 없음'}</span></div>
    <div className="rain-branding-stage">
      <SceneArt scene={scene}/>
      {overlay ? <div
        key={replay}
        className={`rain-branding-overlay preset-${overlay.preset} font-${overlay.font} size-${overlay.size} position-${overlay.position}${replay ? ' is-playing' : ''}`}
        style={style}
      >
        {overlay.logoPath && logoPreviewUrl ? <Image src={logoPreviewUrl} alt="업로드한 채널 로고" width={120} height={120} unoptimized className="rain-branding-overlay-logo"/> : null}
        {overlay.channelName ? <p className="rain-branding-overlay-channel">{overlay.channelName}</p> : null}
        {overlay.title ? <p className="rain-branding-overlay-title">{overlay.title}</p> : null}
        {overlay.tagline ? <p className="rain-branding-overlay-tagline">{overlay.tagline}</p> : null}
      </div> : null}
    </div>
    <div className="rain-branding-preview-copy">
      <p>{overlay ? '선택한 장면의 대표 이미지 위에 입력한 내용을 표시합니다. 영상에서는 저장한 시간에 맞춰 나타나고 사라집니다.' : '현재 장면에 브랜딩 텍스트나 로고가 표시되지 않습니다.'}</p>
      <div className="rain-branding-preview-actions">
        <button className="rain-secondary" disabled={!overlay} onClick={() => setReplay(previous => previous + 1)}><Play size={14}/>등장 · 퇴장 재생</button>
        <button className="rain-secondary" disabled={!replay} onClick={() => setReplay(0)}><RotateCcw size={14}/>정지 화면</button>
      </div>
      <p className="rain-note">미리보기 제목: {title.trim() || '입력된 제목 없음'}<br/>제목은 장면 설계에서 바꿀 수 있습니다. 실제 영상의 글꼴과 배치는 미리보기와 조금 다를 수 있습니다.</p>
    </div>
  </aside>;
}
