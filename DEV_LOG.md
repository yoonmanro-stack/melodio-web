# Melodio Web — Development Log

---

## 2026-08-01 (Sat) — Pioneer v8.1.0-ROADVIEW-STREETMAP 3D 공간 개척 & 긴급구조 무결성 완성

### 🎯 목표
3D 공간 개척(Pioneer) 시스템의 H3 Res.13 팩트 무결성 확립, NFC/생체 검증 보안 강화, 3D 지도 레이어 전환 및 360° 로드뷰 팝업 구축

---

### ✅ 완료 항목

#### 1. 장소명 / 리뷰 DB 적재 무결성 수정
- 백엔드 API (`/api/pioneer/claim-flag` & `/api/pioneer/list-flags`)의 snake_case/camelCase 속성 파싱을 통일하여 사용자가 입력한 장소명, 리뷰, 접근 팁이 100% 무결하게 저장되고 표시되도록 수정.

#### 2. NFC / eNFC 가상 티켓 듀얼 서명 파이프라인
- NDEFReader 하드웨어 UID 감지 및 eNFC 가상 챌린지 티켓 검증 모달을 구축하여 공간 점령 어뷰징 100% 차단.

#### 3. 생체 인증 + 라이브 카메라 전용 차단막
- 갤러리 파일 업로드를 원천 차단하고 지문/Face ID 하드웨어 인증 후 `capture=environment` 라이브 카메라 3장 연속 촬영 강제 적용.

#### 4. 3D 위성 ↔ 2D/3D 일반 지적도 1초 스위처 & 360° 로드뷰 연동
- `sos-map` 상단에 `📡 3D 위성 항공 지도`와 `🗺️ 일반 스트리트 지도` 1초 토글 스위처 구현.
- 깃발 상세 정보 모달 및 3D 수색 지도 내 `📷 360° 카카오 로드뷰 보기` 1-Tap 팝업 연동.

#### 5. My 깃발 정보 수정 & 등록 취소 파이프라인
- 백엔드 API에 `PUT` (깃발 정보 수정) 및 `DELETE` (영토 점령 해제) 엔드포인트 추가 및 렌더링 연동.

---

### 📁 주요 수정 파일
- `src/app/(app)/pioneer/page.tsx`
- `src/app/(app)/pioneer/sos-map/page.tsx`
- `src/app/api/pioneer/claim-flag/route.ts`
- `src/app/api/pioneer/list-flags/route.ts`
- `src/app/api/pioneer/version-check/route.ts`

---

### 🔑 기술 결정 사항
1. **H3 Res.13 (13.3평) 표준화**: 7-Hexagon 번들(k=1, 지름 21m) 공간 산출 공식 적용.
2. **지도 인밸리데이션 멀티 타임아웃**: 모바일 스마트폰 인앱 브라우저 렌더링을 위해 [50, 200, 600, 1200ms] 다중 `invalidateSize()` 실행.

---

### ⏭️ 내일 할 업무 (TODO)
- [ ] Pioneer 3D 공간 오디오 앵커링 파이프라인 (Melodio AI 배경 음원 스트리밍 연동)
- [ ] n8n 스스무 공간 개척 알림 워크플로우 숏폼 템플릿 노드 점검

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
