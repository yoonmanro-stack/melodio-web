# MugSound MVP — Melodio 제작 기준

Status: Approved production baseline

Owner: Melodio

Handoff target: 2026-09-08

Pilot target: 2026-09-15

## 결정 사항

- 범위는 독립 카페 1개 지점, Space Music Concept 1개다.
- 30일 안에는 `Warm Arrival`, `Gentle Focus`, `Conversation Glow` 3개 Episode를 우선 완성한다.
- 나머지 3개 Episode는 필수 3개가 승인된 뒤에만 확장한다.
- 1차 목표는 승인 Master 42~50곡이며, 기술 파일럿의 비상 하한은 30곡이다.
- `generations`는 내부 제작 이력이다. MugSound는 승인 Release manifest만 소비한다.
- 실제 duration, 오디오 무결성, 사람 청취, 감정 메타데이터, 권리 상태, 버전, checksum은 생략할 수 없다.
- 법무 확인 전에는 권리를 포괄적으로 `cleared`로 표시하지 않는다.

## 20영업일 실행 게이트

| 완료일 | 공급물 | 통과 조건 |
|---|---|---|
| Day 3 | 계약 타입, 6개 Blueprint, fixture | MugSound parser가 fixture를 읽음 |
| Day 5 | 승인 트랙 10곡, Episode 1 초안 | 실제 duration 기반 크로스페이드 PoC |
| Day 10 | 승인 트랙 25~35곡, Episode 2개 | Core UX와 후보 필터 테스트 |
| Day 15 | 승인 트랙 40~50곡, 필수 3개 Final | 모든 QA Gate와 카페 유사 스피커 청취 |
| Day 18~20 | 45~60곡, 선택 Episode, 통합 수정 | 2시간 E2E와 중단·교체 시나리오 |

매일 `Generated / Selected / QA Passed / Approved / Episode Placed / Needs Regeneration / Blocked by Rights`를 Episode phase별로 집계한다. 총 생성량보다 부족한 감정 역할을 다음 생성 요청의 기준으로 삼는다.

## 승인 규칙

트랙은 Technical Integrity → Music Quality → Emotional Fit → Episode Fit → Supply Approval 순서로 통과한다. 하나라도 실패하면 공급 상태를 `approved`로 바꿀 수 없다. Release 승인에는 모든 트랙의 영구 Asset ID, 정수 Version, SHA-256, 실제 duration, 재생 reference, 권리 범위가 필요하다.

## 음원 생성 및 확정 정책

- 엔진은 Suno v5.5로 고정한다.
- 승인된 Blueprint마다 첫 attempt에서 A/B 후보 2개를 생성한다.
- 두 후보 모두 선별에 실패했을 때만 두 번째 attempt를 열어 후보를 최대 2개 추가한다.
- Blueprint당 생성 상한은 총 4개다. 재시도 후보는 초기 후보를 덮어쓰지 않고 별도 attempt로 보존한다.
- 후보가 하나라도 선별되면 추가 생성하지 않는다. 생성 비용보다 더 많은 후보를 미리 확보하는 방식은 사용하지 않는다.
- 제한적인 기술 후처리는 선별된 후보에만 적용한다. 원본은 보존하고 후처리본은 별도 Master 후보로 관리한다.
- 1단계 청취 QA는 음악적 완성도와 감정 적합성을, 2단계 청취 QA는 Episode 연결감과 실제 카페 공간 적합성을 검수한다.
- 두 청취 QA를 통과한 뒤에만 최종 제목, 실제 분석 메타데이터, 외부 Asset ID와 Asset Version을 확정한다.
- 기존 `track_blueprints.song_title`은 생성 중 내부 식별을 위한 working title로 취급한다. 공급 manifest의 `title`로 자동 복사하지 않는다.

코드의 단일 정책값은 `src/lib/mugsound/generation-policy.ts`에 둔다. 현재 Channel Queue의 A/B 슬롯은 첫 attempt에는 적합하지만 재시도 이력을 표현하지 못하므로, Catalog DB 작업에서 candidate attempt 번호를 추가해야 한다.

## 외부 계약

단일 기준 타입은 `src/lib/mugsound/contracts.ts`, 검증 규칙은 `src/lib/mugsound/manifest.ts`, 6개 제작 Blueprint는 `src/data/mugsound-cafe-blueprints.ts`에 둔다. 개발용 예시는 `fixtures/mugsound/ms-ep-001-development-manifest.json`이며 실제 음원으로 교체 전에는 import 테스트에만 사용한다. Manifest 버전은 `1.0`이며 breaking change 때만 증가시킨다.

Episode duration은 첫 트랙을 제외한 각 트랙의 권장 crossfade를 차감해 계산한다. 승인 Release는 `rightsStatus=cleared`와 하나 이상의 `allowedTerritories`를 반드시 가져야 한다. `suspended`와 `withdrawn`은 신규 편성 후보에서 즉시 제외한다.

MugSound의 Conductor v0 요구에 맞춰 각 공급 트랙은 제목, BPM, 시작·종료 감정, 에너지, 온기, 보컬 유형, 음색 프로필, 명시적 콘텐츠 여부, 개별 공급·권리 상태, transition in/out과 재생 reference를 포함한다. 개발 fixture에 쓰는 합성 자산은 실제 Release ID와 분리하고 운영 import를 금지한다.

MugSound는 Day Program에서 Episode별 권장 운용 시간을 사용한다. Warm Arrival과 Conversation Glow는 90분, Gentle Focus는 120분을 기준으로 하며 이는 승인곡 파일 길이의 단순 합계가 아니라 Conductor가 해당 감정 장면을 운용하는 시간이다.

Conductor 가중치와 정책 버전은 MugSound 소유다. Melodio는 phase, 에너지, 감정, 음색과 전환 안전값을 공급하지만 런타임 선택 점수나 직원 피드백 상태를 manifest에 넣지 않는다.

## Episode와 Day Program 모델

Episode는 고정 2시간 앨범이 아니라 Day Program 안에서 특정 시간대와 감정 변화를 담당하는 60~120분 권장 길이의 감정 장면이다.

```text
Space DNA → 실제 영업시간 → Day Program → 시간대별 Episode
→ Phase별 승인곡 → Conductor가 실제 곡과 순서 선택
```

승인된 Master Track을 네 Phase의 교체 가능한 풀로 발행하며 Phase별 승인 트랙, 권장 이전·다음 Phase, Bridge 적합성, Asset Version과 전환 메타데이터를 함께 제공한다. Phase 제작 비율은 Arrival 15%, Settle 20%, Engage 50%, Release 15%를 기준으로 한다.

각 전환 방향에 Bridge Track을 최소 2곡 확보한다: Warm Arrival → Conversation Glow, Conversation Glow → Gentle Focus, Gentle Focus → Closing 또는 Warm Arrival. Bridge Track은 양쪽 Episode에 중복 소속할 수 있으며 일반적인 Episode 간 재사용으로 계산하지 않는다.

`placement=default`는 필수 고정 순서가 아니라 장애 시 사용할 선택적 fallback 순서다. Conductor는 현재 Episode와 Phase의 승인 풀 안에서 실제 곡과 순서를 선택한다. 기존 `episode_assemblies.output_audio_url`처럼 단일 장시간 파일을 만드는 기능은 MugSound 공급의 필수 결과물이 아니며 기술 QA용 프리뷰에만 선택적으로 사용한다.

## 완료 정의

필수 3개 Episode가 권장 운용 시간과 Phase별 승인 풀을 갖고, 승인 Master 42~50곡(기술 파일럿 비상선은 30곡), 누락 없는 manifest로 발행되어야 한다. 최소 한 Episode의 2시간 E2E 재생, 각 Episode 30분 이상 실제 스피커 샘플 청취, 권리 변경 및 공급 중단 시 대체 동작까지 확인하면 MVP 인계를 완료한다.
