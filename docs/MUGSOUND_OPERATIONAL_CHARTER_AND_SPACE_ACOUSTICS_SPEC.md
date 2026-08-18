# 🏢 MugSound × Melodio 통합 운영 헌장 및 공간 음향 아키텍처 명세서
> **문서 번호**: MUG-OPS-20260816-01  
> **최종 개정일**: 2026-08-16  
> **상태**: 확정 및 단일 기준 (Approved Baseline)  
> **적용 범위**: Melodio (음원 생산 공장) & MugSound (공간 맞춤형 구독 서비스)

---

## 1. 🎯 프로젝트 본질과 비즈니스 분리 배경

### 1.1 왜 일반 플레이리스트(B2C)와 머그사운드(B2B)는 분리되어야 하는가?
* **Melodio 플레이리스트 채널 (B2C)**:
  * 개인 청취자, 유튜브 배경음악, 바이럴 숏폼 등 일반적인 장르/무드(City Pop, Jazz, Lofi, K-Pop 등)를 포괄하는 광범위한 음악 제공.
* **MugSound 공간 음향 구독 서비스 (B2B)**:
  * 실제 오프라인 상업 공간(카페, 라운지, 호텔, 스터디룸, 편집샵 등)의 **건축 음향, 공간 컨셉, 시간대별 고객 행동 패턴(Customer Journey)**에 최적화된 극도로 정밀한 음원을 공급해야 하는 비즈니스.
  * 단순히 "재즈를 튼다"가 아니라, **"점심 피크타임(12:00~13:30) 대화 소음이 커지는 인더스트리얼 콘크리트 카페에서 대화 음역대(1kHz~4kHz)를 마스킹하지 않고 리듬감을 살리는 8단 구조의 110 BPM 어쿠스틱 그루브"**와 같은 수준의 디테일이 요구됨.

---

## 2. 🏛️ 공간 맞춤형 음향 설계 디테일 (Space Acoustics & Episode Spec)

MugSound 음원은 다음과 같은 정밀한 공간 파라미터에 의해 기획·설계됩니다:

```
[Space DNA] ➔ [영업 시간표 (Day Program)] ➔ [시간대별 Episode] ➔ [Phase별 세부 트랙] ➔ [Conductor 실시간 조율]
```

### 2.1 시간대별 감정 장면 (Episodes)
1. **Warm Arrival (08:00 ~ 11:00)**: 조용한 아침 오픈, 따뜻한 온기와 편안한 공간 조성. (에너지 낮음, 잔잔한 피아노·어쿠스틱)
2. **Conversation Glow (11:30 ~ 14:00)**: 점심 피크 대화 활성화, 매장 내 활기를 돋우는 경쾌한 리듬. (중간 에너지, 보컬 배제, 그루브 베이스)
3. **Gentle Focus (14:00 ~ 18:00)**: 작업 및 독서, 몰입을 돕는 비간섭성 앰비언트·로파이 재즈. (안정적 템포, 맑은 고음역대 지양)
4. **Twilight Settle / Night Lounge (18:00 ~ 마감)**: 저녁 시간의 차분함과 깊이감 있는 무드. (풍부한 저음역, 따뜻한 리버브)

### 2.2 4-Phase 트랙 구성 비율
* **Arrival (도입 15%)** ➔ **Settle (안착 20%)** ➔ **Engage (몰입 50%)** ➔ **Release (완화 15%)**
* 각 Episode 간 자연스러운 전환을 위해 **Bridge Track(전환용 연결곡)** 최소 2곡 상시 확보.

---

## 3. 🚦 역할 및 책임 (R&R)과 불간섭 원칙

### 3.1 🏢 MugSound 프로젝트 (`/Users/yoonmanro/Desktop/project/MugSound`)
> **역할**: "사용자가 제작을 지휘하고 매장 재생을 총괄하는 컨트롤 타워"

* **전담 업무**:
  1. Space Concept & Episode Blueprint 기획 및 설계
  2. Day Program 스케줄 편성 및 Conductor 런타임 가중치 조율
  3. Batch 생성 지시 요청 (Melodio API 호출)
  4. 후보곡 청음 & 공간 적합성 / 감정 QA
  5. 최종 공급 승인 & Catalog Release 등록
  6. 매장 PWA / 플레이어 스트리밍 관리

### 3.2 🎵 Melodio 프로젝트 (`/Users/yoonmanro/Desktop/project/Melodio_Ops`)
> **역할**: "보안이 완벽히 통제되는 비노출 Headless 음원 생산 팩토리"

* **전담 업무**:
  1. **Suno v5.5 3분 30초 기승전결 8단 완곡 연주곡 엔진 가동**
  2. **Suno API Secret Key 단독 보관 및 보안 통제** (MugSound로 절대 유출/이전 금지)
  3. 무손실 WAV 원본 마스터 Storage 영구 아카이빙
  4. 물리 음질 정밀 스캔 (Grade A/B, 클리핑/디스토션 검출)
  5. 1:1 고화질 AI 앨범 커버 생성
  6. 머그사운드 측에 규격화된 생성 결과 및 기술 메트릭 반환 (`/api/internal/mugsound/...`)
* **🚨 Melodio Ops 에이전트 절대 규칙**:
  * **MugSound의 기획, UI 개발, 비즈니스 로직에 절대 간섭하거나 임의 수정하지 않는다.**
  * 오직 멜로디오 본연의 엔진 고도화와 음원 공급 API 인프라 관리에만 충실한다.

---

## 4. 🔗 서비스 간 인터페이스 계약 (API & Manifest)

```
[MugSound Admin] ──── (1. 생성 요청 / Blueprint ID) ───➔ [Melodio API]
                                                               │
                                                       (2. Suno v5.5 3:30 연주곡 생성)
                                                       (3. Grade A/B 음질 검수)
                                                       (4. WAV 마스터 보관)
                                                               │
[MugSound Admin] ◄─── (5. 후보 트랙 및 메트릭 반환) ──────────────┘
       │
 (6. 청음 및 승인)
       ▼
[MugSound Catalog] ◄── (7. supply-package.json + SHA-256 Checksum)
```

---

## 5. 🛡️ 배포 및 Git 운영 원칙

1. **단일 진실점 (Single Source of Truth)**:
   * GitHub `yoonmanro-stack/melodio-web`의 `main` 브랜치가 최종 기준.
   * `9a39510` 커밋을 기점으로 머그사운드 스튜디오와 3:30 연주곡 엔진이 통합 보존됨.
2. **로컬 임의 배포 금지**:
   * 로컬 파일 단위로 Vercel에 임의 배포하여 다른 작업자의 변경 사항을 덮어쓰는 행위를 엄격히 금지함.
   * 반드시 `main` 브랜치 병합 및 검증 후 배포 실행.
