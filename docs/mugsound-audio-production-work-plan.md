# MugSound MVP 음원 제작 작업 기획서

문서 상태: Execution Baseline

작성일: 2026-08-15

Melodio 인계 완료: 2026-09-08

MugSound 파일럿: 2026-09-15

대상: 대한민국 독립 카페 1개 지점

## 1. 목표

9월 8일까지 카페용 Space Music Concept `A Café That Slowly Warms`와 필수 Episode 3개를 MugSound가 import하고 재생할 수 있는 승인 편성 패키지로 전달한다.

필수 Episode는 다음과 같다.

1. `MS-EP-001 Warm Arrival`
2. `MS-EP-002 Gentle Focus`
3. `MS-EP-003 Conversation Glow`

Episode는 고정 앨범이 아니라 Day Program 안의 60~120분 감정 장면이다. Arrival, Settle, Engage, Release별 교체 가능한 승인곡 풀, 연결 메타데이터, 권리·공급 상태, Visual Source, QA 결과를 포함한 버전된 공급 패키지다.

## 2. 납품 범위와 우선순위

### P0 — 9월 8일 필수

- 카페 Space Music Concept 1개
- 승인 Episode 3개
- Warm Arrival 권장 운용 90분, 승인곡 12~15곡
- Conversation Glow 권장 운용 90분, 승인곡 14~17곡
- Gentle Focus 권장 운용 120분, 승인곡 16~18곡
- 승인 Master Track 총 42~50곡
- 기술 파일럿 비상 하한 30곡
- Phase별 승인 풀과 선택적 fallback 순서
- Episode 전환 방향별 Bridge Track 최소 2곡
- 실제 duration, checksum, 기술·감정·음악 메타데이터
- 공급 및 권리 상태
- Asset ID와 Asset Version
- Episode Release와 Release Version
- MugSound manifest 3개
- 최소 1개 Episode의 전체 E2E 재생 검증

### P1 — P0 승인 후에만 수행

- `Afternoon Lift`, `Rainy Shelter`, `Golden Close`
- 추가 대체 후보
- 선택적 장시간 QA용 프리뷰 렌더
- 추가 Visual Source와 모션 지시

P0 일정이 하루라도 지연되면 P1 생성과 디자인 작업을 즉시 중단하고 필수 3개 Episode에 인력을 집중한다.

## 3. 확정된 생성 정책

```text
승인 Blueprint
→ Suno v5.5 후보 A/B 2개 생성
→ 두 후보 모두 실패한 경우에만 별도 attempt로 최대 2개 추가
→ 후보 선별
→ 선별 후보만 제한적 기술 후처리
→ 1차 청취 QA: 음악 완성도·감정 적합성
→ 2차 청취 QA: Episode 연결감·카페 공간 적합성
→ 제목·실측 메타데이터·Asset ID/Version 확정
→ 편성 및 Release 승인
```

운영 규칙:

- Blueprint당 생성 상한은 총 4개다.
- 첫 두 후보 중 하나라도 선별되면 추가 생성하지 않는다.
- 재시도 attempt는 초기 후보와 생성 이력을 덮어쓰지 않는다.
- 생성 전 제목은 working title이다. 공급 제목은 QA 완료 후 확정한다.
- 원본 생성 파일은 보존한다.
- 트림, 시작·종료 무음 정리, 페이드, 음량 정렬 등 제한적 기술 후처리만 허용한다.
- 구조 재편집이나 음악적 결함을 숨기기 위한 과도한 후처리는 하지 않고 재생성한다.
- 검수되지 않은 후보는 MugSound 공급 자산으로 승격하지 않는다.

## 4. 제작량 계획

| 항목 | 목표 | 비상 하한 |
|---|---:|---:|
| 승인 Master | 42~50곡 | 30곡 |
| 초기 Blueprint | 45~55개 | 36개 |
| 초기 생성 후보 | 90~110개 | 72개 |
| 추가 생성 후보 | 실패 Blueprint에 한해 최대 40개 | 필요한 Phase만 |
| Phase 배분 | Arrival 15% · Settle 20% · Engage 50% · Release 15% | Engage 우선 |
| Bridge 지정 | 각 전환 방향 최소 2곡 | 총 4~6곡 |

동일 Master는 여러 Episode에서 제한적으로 재사용할 수 있다. 단, 같은 영업일에 연속 재생될 가능성이 있는 Episode 사이에서는 반복 체감이 없도록 하고, 동일 트랙을 한 Episode의 기본 편성에 두 번 넣지 않는다.

생성량은 총 곡 수가 아니라 다음 Phase 부족분으로 관리한다.

실행 기준값은 `src/data/mugsound-production-plan.ts`에 고정한다. P0 시작값은 Warm Arrival 14개, Conversation Glow 16개, Gentle Focus 18개로 총 48개 Blueprint와 초기 후보 96개다. 추가 후보 96개는 예산 상한일 뿐 목표 생성량이 아니며, 첫 A/B가 모두 실패한 Blueprint에만 사용한다.

```text
Episode / Phase / 필요한 역할 / 부족 곡 수 / 생성 중 / 선별 / QA 통과
```

## 5. 역할과 승인 책임

| 역할 | 핵심 책임 | 승인 권한 |
|---|---|---|
| Music Director/Curator | Blueprint, 후보 선별, 감정 적합성, Episode 흐름 | 1차 청취 QA |
| Melodio Operator/Producer | Suno 생성, attempt 관리, 파일·이력 보존 | 생성 작업 완료 |
| Audio QA/Mastering | 기술 분석, 제한적 후처리, 음량·전환 검수 | Technical Gate |
| Episode/Supply Approver | 공간 청취, Episode 승인, 권리 확인 | 2차 QA와 공급 승인 |
| Backend/Data | Asset/Release Version, checksum, manifest | 패키지 무결성 |
| MugSound 담당 | import, Player, Conductor, 중단·교체 검증 | 통합 승인 |

동일 인물이 여러 역할을 맡을 수 있지만, 생성 실행자가 혼자 최종 공급 승인까지 처리하지 않는다. 공급 승인권자와 권리 확인 담당자는 Day 2 종료 전 실명으로 지정한다.

## 6. 날짜별 실행 계획

### Day 1 — 8월 17일: 제작 잠금

- 카페 Music DNA와 금지 요소 확정
- 필수 3개 Episode의 감정·에너지 곡선 잠금
- Phase별 목표 BPM, 악기, 음색, 침범도 범위 설정
- QA 평가표와 후보 탈락 코드 확정
- Storage 폴더와 파일명 규칙 확정

완료 조건: 제작자가 추가 해석 없이 첫 Blueprint를 생성할 수 있다.

### Day 2 — 8월 18일: Blueprint 승인

- 필수 3개 Episode의 초기 Blueprint 45~55개 작성
- Phase별 기본 필요량과 대체 후보 목표 배분
- 유사 악기·배치 연속 생성 방지
- 공급 승인권자와 권리 담당자 확정
- Suno 크레딧 및 일일 생성 가능량 확인

완료 조건: 모든 Blueprint가 Episode, Phase, 에너지, BPM, 악기, 보컬 정책을 가진다.

### Day 3 — 8월 19일: 조기 인계 및 생성 시작

- MugSound에 계약 타입, 6개 Blueprint, development manifest 전달
- Warm Arrival 중심 첫 생성 배치 실행
- 생성 이력에 Blueprint ID, attempt, 후보 A/B, 모델 버전 저장
- 실패 유형과 재생성 사유 기록 시작

완료 조건: MugSound가 manifest를 파싱하고, 최소 15개 Blueprint의 초기 후보가 생성 대기 또는 완료 상태다.

### Day 4 — 8월 20일: Warm Arrival 선별

- Warm Arrival 초기 후보 청취 및 탈락 분류
- Gentle Focus 초기 생성 시작
- 선별된 Warm Arrival 후보의 자동 기술 분석
- 부족한 Arrival/Release 역할만 재시도 큐에 배치

완료 조건: Warm Arrival 선별 후보 12곡 이상, 치명적 생성 장애 없음.

### Day 5 — 8월 21일: Player PoC 인계

- 승인 가능 트랙 10곡의 임시 Asset Reference 전달
- Warm Arrival 기본 편성 초안 작성
- 실제 duration과 3~6초 crossfade 값 제공
- Conversation Glow 초기 생성 시작

완료 조건: MugSound Player가 실제 트랙 10곡을 연속 재생하고 전환 오류를 기록할 수 있다.

### Day 6~7 — 8월 24~25일: 전체 초기 생성 완료

- 45~55개 Blueprint의 첫 A/B 생성 완료
- Episode·Phase별 선별 현황 집계
- 두 후보 모두 실패한 Blueprint만 추가 2개 생성
- 선별 후보부터 제한적 기술 후처리

완료 조건: 초기 후보 90개 이상 확보, 모든 부족 Phase에 담당과 재생성 요청이 있다.

### Day 8 — 8월 26일: 1차 QA 집중

- 음악 완성도와 감정 적합성 청취
- AI 아티팩트, 의도치 않은 보컬, 유명곡 유사 의심, 과도한 침범도 탈락
- 실제 메타데이터 분석 및 curator 보정
- Warm Arrival 기본 편성 v0.8 구성

완료 조건: 누적 1차 QA 통과 25곡 이상.

### Day 9 — 8월 27일: Episode 연결 검수

- Gentle Focus와 Conversation Glow 기본 순서 구성
- 에너지 톱니, 유사 음색 연속, 보컬 연속, 전경 악기 피로 점검
- Phase별 대체 후보 연결
- 부족한 역할의 마지막 재생성 결정

완료 조건: 필수 3개 Episode 모두 90분 이상의 검수 가능한 기본 편성을 가진다.

### Day 10 — 8월 28일: 중간 인계 Gate

- 승인 트랙 25~35곡 전달
- Episode 2개의 검수 가능한 편성 패키지 전달
- Conductor 후보 필터, 기본 순서 fallback, 권리 제외 테스트
- 일정과 통과율 재산정

완료 조건: MugSound Core UX가 실제 공급 snapshot으로 동작한다.

### Day 11~12 — 8월 31일~9월 1일: 후처리 및 메타데이터 확정

- 선별 후보 기술 후처리 완료
- duration, BPM, key, LUFS, true peak, sample rate, bit depth, checksum 측정
- 감정·침범도·전환 메타데이터 큐레이터 보정
- QA 통과곡의 최종 제목 확정

완료 조건: 승인 예정 트랙 40곡 이상이 누락 없는 메타데이터를 가진다.

### Day 13 — 9월 2일: 2차 청취 QA

- 일반 카페 스피커·낮은 음량·대화 소음 조건 청취
- 각 Episode 30분 이상 Phase 샘플 검수
- 음량 편차, 중역 혼탁, 고역 자극, 전환 불량 교체
- Master 후보 동결 시작

완료 조건: 필수 3개 Episode가 실제 공간 검수 기록을 가진다.

### Day 14 — 9월 3일: Release Candidate

- 기본 편성 100~125분 충족
- 대체 후보와 전환값 확정
- Asset ID/Version, Release Version, checksum 확정
- 권리 상태와 대한민국 파일럿 공급 범위 확인
- Visual Source와 Episode 메타데이터 연결

완료 조건: Release Candidate 3개가 manifest 검증을 통과한다.

### Day 15 — 9월 4일: 콘텐츠 Final Gate

- 승인 고유 Master 40~50곡 확보
- 필수 Episode 3개 최종 청취
- withdrawn/suspended 대체 시나리오 실행
- MugSound import 결과와 원본 manifest 대조

완료 조건: 필수 3개가 공급 승인 가능 상태이며 미해결 P0 결함에 담당과 해결일이 있다.

### Day 16 — 9월 7일: E2E 및 결함 수정

- 최소 1개 Episode 전체 길이 E2E 재생
- 실제 duration 오차와 crossfade 확인
- 오디오 접근 실패, 권리 제외, 후보 없음 fallback 테스트
- manifest 및 잘못된 메타데이터 수정 시 Version 증가 확인

완료 조건: 치명적·높음 등급 결함 0건.

### Day 17 — 9월 8일: Melodio 최종 인계

- 승인 Release 3개와 manifest 전달
- QA Summary, Rights Summary, Visual Direction 전달
- Asset/Release Version 목록과 checksum 전달
- 공급 중단·교체 절차 및 담당자 전달
- MugSound 인수 확인

완료 조건: MugSound가 3개 Release를 import하고 모든 Asset Reference를 검증한다.

### 9월 9~15일: 파일럿 안정화

- 실제 파일럿 기기에서 2시간 재생 반복
- 10회 중 9회 이상 성공 확인
- Conductor 선택과 고정 순서 fallback 비교
- signed URL 만료, 새로고침, 네트워크 흔들림 테스트
- 치명적 오류는 당일 수정, 콘텐츠 교체는 Asset/Release Version 증가
- 9월 15일 카페 파일럿 시작

## 7. QA 판정 기준

### 자동 Technical Gate

- 파일 파싱 및 재생 가능
- 실제 duration 측정
- checksum 생성
- clipping, loudness, true peak 측정
- sample rate, bit depth, channel 확인
- 시작·종료 무음과 손상 확인

### 1단계 청취 QA

- 곡 구조와 악기·음색의 일관성
- AI 아티팩트와 의도치 않은 음성 없음
- 감정 역할 및 에너지 점수 일치
- 카페 대화·집중 침범도 허용 범위
- 유명곡 유사성이 의심되지 않음

### 2단계 청취 QA

- Phase와 앞뒤 트랙 연결 적합
- Episode 에너지 곡선 유지
- 장시간 반복 피로와 전경 점유 문제 없음
- 일반 카페 스피커에서 중역 혼탁과 고역 자극 없음
- 기본 순서와 대체 후보 모두 안전하게 연결 가능

하나라도 실패한 트랙은 공급 승인하지 않는다. 후처리로 해결 가능한 기술 문제만 수정하며 음악적·감정적 결함은 다른 후보로 교체하거나 재생성한다.

## 8. 일일 운영 보드

매일 18시 기준 다음을 Episode와 Phase별로 갱신한다.

| 지표 | 설명 |
|---|---|
| Blueprint Approved | 생성 가능한 Blueprint 수 |
| Generated | 생성 완료 후보 수 |
| Selected | 후처리 대상으로 선별된 수 |
| Technical Passed | 자동·기술 QA 통과 수 |
| Listening QA 1 Passed | 음악·감정 검수 통과 수 |
| Listening QA 2 Passed | Episode·공간 검수 통과 수 |
| Supply Approved | Asset Version이 확정된 수 |
| Episode Placed | 기본 또는 대체 후보로 배치된 수 |
| Needs Regeneration | 역할과 사유별 재생성 수 |
| Blocked by Rights | 권리 확인 대기 수 |

다음 날 생성 우선순위는 `Episode → Phase → 부족 역할 → 필요한 곡 수`로 정한다.

## 9. 일정 경보와 축소 규칙

| 경보 시점 | 조건 | 즉시 조치 |
|---|---|---|
| 8월 19일 | 첫 생성 배치 미완료 | 엔진·크레딧 장애를 P0로 전환 |
| 8월 21일 | 선별 가능 10곡 미만 | 선택 Episode 생성 중단, 필수 Phase 집중 |
| 8월 28일 | QA 가능 25곡 미만 | 고유곡 목표를 30곡 비상선으로 전환 검토 |
| 9월 1일 | 승인 예정 40곡 미만 | 대체 후보 축소, 기본 편성 우선 |
| 9월 4일 | Release 3개 미완성 | 모든 P1 중단, Weekend 비상 검수 결정 |
| 9월 7일 | E2E 실패 | 신규 생성 금지, 재생 안정화와 교체만 수행 |

축소 순서:

1. 선택 Episode 4~6을 중단한다.
2. Visual Source를 정지 Color Chip 중심으로 축소한다.
3. 대체 후보 수를 줄인다.
4. 승인 고유곡을 45곡에서 30곡으로 줄여 기술 파일럿을 진행한다.

실제 duration, 무결성, 사람 청취, 감정 메타데이터, 권리 상태, checksum, Version, 2시간 E2E는 축소하지 않는다.

## 10. 인계 패키지

```text
release-ms-ep-001-v1/
  manifest.json
  episode.json
  tracks/
  visual-source/visual-direction.json
  qa/qa-summary.json
  rights/rights-summary.json
```

`manifest.tracks`에는 기본 편성과 대체 후보가 함께 들어간다.

- 기본 트랙: `placement=default`, 전체 `position`과 Phase 내부 `phasePosition` 보유
- 대체 후보: `placement=alternate`, `position=null`, `phasePosition`은 후보 우선순위
- Episode duration: 기본 트랙 duration 합계에서 실제 crossfade를 차감해 계산

## 11. 최종 완료 정의

- 필수 Episode 3개가 승인 Release로 발행됨
- 각 기본 편성이 100~125분이고 목표 120분에 근접함
- 승인 고유 Master 45곡 이상 또는 승인된 비상 결정에 따른 30곡 이상
- 모든 Master가 자동 Technical Gate와 2단계 청취 QA를 통과함
- 제목, 실제 메타데이터, Asset ID/Version, checksum이 확정됨
- 권리 범위와 대한민국 파일럿 공급 가능 여부가 기록됨
- MugSound manifest import와 Asset Reference 검증 성공
- 최소 한 Episode의 전체 길이 E2E 재생 성공
- 공급 중단과 교체 절차 검증 성공
- MugSound 담당자가 9월 8일 인수를 확인함

이 조건을 만족하지 못한 Release는 일정상 필요하더라도 `approved`로 표시하지 않는다.
