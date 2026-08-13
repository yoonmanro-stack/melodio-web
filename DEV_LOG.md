# Melodio Web — Development Log

---

## 2026-04-27 (Sun) — Audio Forge UI/UX 고도화 & Stem Player 안정화

### 🎯 목표
Melodio 프로덕션 플랫폼의 오디오 재생 안정화 및 비주얼라이저 UI/UX 프로덕션 수준 완성

---

### ✅ 완료 항목

#### 1. 파형(Waveform) 비주얼라이저 통일
- **스타일**: 센터 기준 위아래 대칭 막대 (기존: 아래→위 단방향)
- **분포**: Bell curve 엔벨로프 → 균일 분포 (전 구간 고르게)
- **너비**: 고정 2px → `flex-1` + `maxWidth: 2px` (컨테이너 전체 채움)
- **간격**: `gap-[1px]` 으로 선명한 분리감 유지
- **적용 범위**:
  - `TracksView.tsx` (Audio Forge 스템 분리 뷰)
  - `MultiTrackPlayer.tsx` (Dashboard 스템 플레이어)
  - `audio/page.tsx` (Audio Forge 프리뷰 영역)

#### 2. 컬러 시스템 최적화
- 원색 비비드 → **파스텔 중간톤**으로 통일
  | 스템 | Before | After |
  |------|--------|-------|
  | Vocals | `#e879f9` | `#c76ad8` |
  | Drums | `#22d3ee` | `#5abdd4` |
  | Bass | `#fbbf24` | `#d4b85c` |
  | Melody | `#34d399` | `#50c89a` |

#### 3. Playhead 글로우 라인
- 재생 위치에 **세로 발광선**이 지나가는 효과 추가
- `linear-gradient + boxShadow` 조합으로 부드러운 글로우
- TracksView, MultiTrackPlayer 모두 적용

#### 4. Audio Forge 프리뷰 오디오 재생
- **Web Audio API** 직접 연동 (기존: 파형 애니메이션만, 소리 없음)
- 220Hz + 330Hz + 440Hz + 110Hz 하모닉 신스 톤 생성
- 스테레오 버퍼, 페이드인/아웃 엔벨로프 적용
- **볼륨 슬라이더 + 뮤트 버튼** 추가 (🔊 / 🔇)

#### 5. Supabase 로딩 타임아웃 폴백
- `useStemAudio.ts`에 **5초 AbortController 타임아웃** 추가
- Supabase 연결 실패/타임아웃 시 자동으로 더미 톤 폴백
- 어떤 상황에서도 `loadState: 'ready'`로 전환 보장
- Dashboard 무한 로딩 & 깜빡임 문제 해결

---

### 📁 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/hooks/useStemAudio.ts` | Supabase 5초 타임아웃 + try-catch 폴백 |
| `src/components/MultiTrackPlayer.tsx` | 센터 바 파형 + Playhead 글로우 + 파스텔 컬러 |
| `src/components/workspace/TracksView.tsx` | 전체 너비 채움 + 센터 정렬 + 균일 분포 |
| `src/app/(app)/audio/page.tsx` | Web Audio 프리뷰 재생 + 볼륨 컨트롤 + 파형 통일 |

---

### 🔑 기술 결정 사항
1. **flex-1 + maxWidth 패턴**: 바 개수와 무관하게 컨테이너 전체를 채우면서도 최대 두께 제한
2. **BAR_COUNT 분리**: 넓은 영역(TracksView/MultiTrackPlayer) = 160바, 좁은 영역(프리뷰) = 80바
3. **Web Audio API 직접 사용**: `<audio>` 태그 대신 `AudioContext + AudioBufferSourceNode`로 정밀 제어

---

### ⏭️ 다음 작업
- [ ] 텔레그램 브릿지 오류 해결
- [ ] AI 엔진(Lyria 3 / Suno V5) 실제 API 연동
- [ ] B2B Loop 데이터 UI 결합
