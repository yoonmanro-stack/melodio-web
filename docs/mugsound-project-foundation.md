# MugSound 프로젝트 기초 기획 및 Melodio 연동 명세

> 문서 상태: 기획 기준안  
> 작성일: 2026-08-15  
> 실행 시점: Melodio 본래 범위 구축 및 안정화 이후  
> 프로젝트 원칙: MugSound는 Melodio와 별도 폴더·별도 프로젝트로 개발한다.

## 1. 문서 목적

이 문서는 MugSound의 제품 방향과 Melodio 연동 경계를 보존하기 위한 기초 기획서다. 현재 Melodio 개발 범위에 MugSound 기능을 혼합하지 않고, Melodio의 핵심 제작 시스템이 완성된 뒤 별도 프로젝트로 착수할 때 기준 문서로 사용한다.

MugSound 프로젝트 착수 시에는 이 문서를 바탕으로 별도의 PRD, 데이터 모델, API 계약서, 재생 단말 명세를 구체화한다.

## 2. 서비스 정의

MugSound는 음악 장르보다 사람의 감정, 활동, 공간의 목적을 기준으로 플레이리스트를 제공하는 감성 기반 음악 구독 서비스다.

- Melodio는 음악을 기획하고 제작하는 생산 시스템이다.
- MugSound는 Melodio에서 승인된 음악을 공간과 개인에게 편성·공급·재생하는 서비스다.
- 기본 상품은 약 2시간 분량의 감성 콘셉트 플레이리스트다.
- 장기적으로 공간, 시간대, 방문 목적과 원하는 감정 변화에 맞춰 자동 편성한다.

## 3. Melodio와 MugSound의 책임 분리

### Melodio

- Channel DNA 및 Listener Intent 설계
- Episode·Track Blueprint 생성
- 곡별 고유 제목·가사·Studio-Grade 프롬프트 생성
- Suno A/B 생성 및 Master 선택
- 품질 검사, Episode Assembly, 타임스탬프 생성
- 커버와 Publish Package 생성
- 정식 공급 카탈로그 승격 및 승인
- 승인된 자산을 MugSound API로 제공

### MugSound

- 공간·지점·개인 계정 관리
- 구독 상품과 이용 권한 관리
- 감정·활동·공간·시간대별 음악 탐색
- 플레이리스트 편성 및 스케줄링
- 매장·개인·자동차 플레이어 제공
- 재생 단말 등록 및 원격 상태 관리
- 오프라인 캐시와 재생 이력 관리
- 사용 데이터와 만족도 피드백 수집

### 공유 계약

두 프로젝트가 직접 공유해야 하는 것은 DB 테이블이 아니라 버전이 명시된 API 계약이다.

- Catalog Track
- Catalog Playlist
- Catalog Release
- Asset Version
- Supply Approval
- Rights Metadata
- Playback Authorization

MugSound는 Melodio의 내부 Supabase 테이블을 직접 조회하지 않는다.

## 4. 핵심 사용자와 이용 목적

### 매장·공간 사용자

대상은 카페, 레스토랑, 재즈바, 호텔, 라운지, 휴게실, 공원, 스터디 카페, 매장, 전시 공간 등이다.

핵심 가치는 음악 검색이 아니라 운영 자동화다.

- 공간의 첫인상 형성
- 고객의 체류 분위기 유지
- 대화·식사·집중·휴식에 적합한 환경 조성
- 직원의 반복적인 음악 선택 업무 제거
- 여러 지점에서 일관된 브랜드 감성 유지

### 개인 사용자

개인은 장르가 아니라 지금의 상황과 원하는 변화로 음악을 선택한다.

- 집중, 휴식, 수면, 독서, 드라이브
- 현재 감정과 원하는 감정
- 30분, 1시간, 2시간 세션
- 보컬 허용 여부
- 에너지 강도

핵심 가치는 최소한의 선택으로 즉시 알맞은 세션을 시작하는 것이다.

## 5. 감성 중심 분류 체계

기존 여섯 카테고리는 탐색용 진열대로 사용한다.

1. 마음의 위로 & 힐링
2. 몰입 & 생산성
3. 아날로그 & 향수
4. 카페 & 오프라인 공간
5. 드라이브 & 감성 여행
6. 서사 & 시네마틱 스토리

실제 추천과 제작에는 다음 축을 함께 사용한다.

- 공간: 카페, 레스토랑, 재즈바, 휴게실, 스터디 카페 등
- 활동: 대화, 식사, 업무, 독서, 이동, 휴식, 수면
- 현재 상태: 긴장, 피로, 산만함, 무기력, 외로움 등
- 원하는 상태: 안정, 몰입, 활력, 추억, 기대감 등
- 원하는 행동: 체류, 집중, 회복, 이동 지속, 자연스러운 대화
- 시간대와 세션 길이
- 보컬 허용도와 방해 허용도
- 목표 에너지와 에너지 곡선

## 6. 플레이어 전략

### 매장 플레이어

매장은 최초 설정 후 자동 운영되는 전용 플레이어가 중심이다.

기본 흐름:

`매장 등록 → 공간 목적 선택 → 영업시간 설정 → 재생 단말 연결 → 자동 재생`

필수 기능:

- 시간대별 자동 편성
- 영업 시작 시 자동 재생
- 곡 사이 무음 없는 재생
- 음량 평준화와 최대 음량 제한
- 네트워크 장애 대비 오프라인 캐시
- 중단 후 이어 재생
- 점주와 직원 권한 분리
- 다지점 원격 상태 확인
- 재생·일시정지·다음 분위기 중심의 단순한 직원 UI

### 개인 플레이어

기본 흐름:

`현재 목적 선택 → 세션 길이 선택 → 즉시 재생`

필수 기능:

- 최근 재생과 이어 듣기
- 즐겨찾기와 개인 루틴
- 수면 타이머
- 보컬과 에너지 조정
- 모바일·PC 간 재생 이어받기
- Bluetooth, AirPlay, Google Cast 확장

### 자동차 플레이어

단계별 지원 방향:

1. 모바일 웹·앱에서 차량 Bluetooth 출력
2. iOS·Android 백그라운드 재생과 차량 버튼 제어
3. Apple CarPlay와 Android Auto 오디오 앱
4. Android Automotive OS 차량용 앱
5. 차량 제조사 또는 충전 사업자 제휴

차량 UX는 검색보다 운전 상황 선택을 우선한다.

- 출근길
- 퇴근길
- 야간 드라이브
- 장거리 여행
- 비 오는 날
- 졸음 방지
- 충전 중 휴식
- 동승자와 대화

## 7. 스피커와 하드웨어 연결

MugSound 서버가 스피커에 직접 신호를 보내는 것이 아니라 재생 단말이 스트림을 받아 스피커 또는 앰프로 출력한다.

`MugSound → 인터넷 → 재생 단말 → 앰프·스피커`

### 초기 지원

- 매장 PC·노트북
- 안드로이드 태블릿
- 미니 PC
- 액티브 스피커 직접 연결
- 기존 매장 앰프 AUX/RCA 연결
- Bluetooth 보조 연결

매장은 안정성을 위해 유선 LAN과 유선 오디오 출력을 우선한다. Bluetooth는 개인 또는 임시 매장 설치에 적합하다.

### 장기 전용 단말

사업 확장 후 MugSound Player Box를 검토한다.

- 자동 부팅과 자동 로그인
- 유선 LAN·Wi-Fi
- 3.5mm, RCA 또는 USB DAC 출력
- 암호화된 오프라인 캐시
- 원격 상태 확인·재시작
- 매장별 Device Token
- 직원 임의 변경 방지

초기 MVP에서는 하드웨어를 직접 제조하지 않고 범용 미니 PC나 태블릿을 이용한다.

## 8. Melodio에 추후 추가할 공급 연동 계층

Melodio의 기존 `generations`, A/B 후보, Assembly, Publish Package는 제작 데이터다. MugSound가 이를 직접 소비하지 않도록 정식 공급 계층을 추가한다.

### 8.1 정식 트랙·플레이리스트 카탈로그

권장 엔티티:

- `catalog_tracks`
- `catalog_playlists`
- `catalog_playlist_tracks`
- `catalog_asset_versions`
- `catalog_releases`
- `catalog_release_items`

공급 카탈로그에는 A/B 생성물 전체가 아니라 선택·검수된 Master만 등록한다. 사용자 대시보드에는 A/B 두 곡 모두 유지한다.

MugSound에는 다음 두 형태를 모두 공급한다.

1. 개별 트랙과 재생 순서가 포함된 Release Manifest
2. 완성된 약 2시간 Assembly 파일

개별 트랙은 동적 편성·교체·스킵·피로도 관리에 사용하고, Assembly 파일은 간편 재생과 장애 대비에 사용한다.

### 8.2 공급 승인

제작 완료와 공급 승인을 분리한다.

권장 상태:

- `draft`
- `submitted`
- `qa_failed`
- `under_review`
- `approved`
- `distributed`
- `suspended`
- `retired`

승인 흐름:

`제작 완료 → 제작자 승인 → 자동 QA → 운영 검수 → 권리 검토 → 공급 승인 → Catalog Release`

자동 QA 항목:

- 파일 존재·손상 여부
- 실제 재생시간
- 무음, 클리핑, 음량, 노이즈
- 제목과 가사 중복
- 부적절 콘텐츠
- Master·커버 선택 여부
- 권리·라이선스 정보 존재 여부

승인 기록에는 대상, 검수자, 체크리스트, 거절 사유, 승인 시각, 공급 범위와 기간을 보존한다.

### 8.3 자산 버전 관리

공급된 파일은 같은 경로에 덮어쓰지 않는다. 수정된 파일은 새로운 불변 버전으로 생성한다.

각 Asset Version은 다음 정보를 가진다.

- 파일 경로와 포맷
- 비트레이트·샘플레이트
- 파일 크기와 실제 재생시간
- SHA-256 체크섬
- 생성 사유와 생성자
- 이전 버전 ID
- 활성 여부와 생성 시각

플레이리스트 변경도 새로운 Catalog Release로 발행한다. MugSound 재생 이력에는 당시 사용한 Release와 Asset Version을 기록한다.

### 8.4 권리 원장

단순 `license_hash`를 넘어 구조화된 권리 정보를 관리한다.

- 상업 공간 재생 가능 여부
- 개인·매장 사용 범위
- 국가와 기간 제한
- 생성 엔진과 모델
- 제작자와 소유자
- 라이선스 증빙과 체크섬
- 공급 중단 사유

## 9. MugSound용 안전한 API

MugSound는 Melodio 내부 DB에 직접 접근하지 않고 버전이 명시된 공급 API만 사용한다.

예시:

```text
GET  /api/v1/mugsound/catalog/playlists
GET  /api/v1/mugsound/catalog/playlists/{id}
GET  /api/v1/mugsound/catalog/releases/{id}
GET  /api/v1/mugsound/catalog/tracks/{id}
POST /api/v1/mugsound/assets/{versionId}/play-token
POST /api/v1/mugsound/playback-sessions
POST /api/v1/mugsound/playback-sessions/{id}/heartbeat
POST /api/v1/mugsound/playback-sessions/{id}/events
```

보안 원칙:

- 공급 승인된 Release만 반환
- 내부 사용자 ID와 제작 과정 비공개
- 음원 Master는 비공개 Storage에 보관
- 짧은 수명의 Signed URL 또는 Playback Token 발급
- 서비스 간 Service Account 인증
- 재생 단말별 Device Token 사용
- MugSound 프런트엔드에 Supabase service role 키를 노출하지 않음
- 요청 제한, 감사 로그, 토큰 폐기 기능 제공

## 10. 재생 관측과 운영 데이터

최소한 다음 정보를 기록한다.

- 지점·개인·재생 단말
- Catalog Release와 Asset Version
- 재생 시작·완료·중단·스킵
- Heartbeat와 오류
- 온라인·오프라인 재생 여부
- 재생 시간과 세션 길이

이 데이터는 추천 개선, 품질 관리, 공급 정산, 권리 증빙에 사용한다.

## 11. 프로젝트 구조 원칙

MugSound는 별도 폴더 또는 별도 저장소로 운영한다.

권장 초기 구조 예시:

```text
Melodio/                 # 음악 제작·승인·공급 API
MugSound/                # 별도 프로젝트
  apps/
    web/                 # 개인·관리자 웹
    player/              # 매장 PWA 또는 전용 플레이어
  packages/
    api-client/          # Melodio 공급 API 클라이언트
    playback-core/       # 재생·캐시·세션 공통 로직
    domain/              # 공간·편성·구독 타입
```

두 프로젝트 사이에 소스 코드나 DB를 암묵적으로 공유하지 않는다. OpenAPI 등의 명시적 계약과 별도 API Client 패키지를 사용한다.

## 12. 단계별 추진 순서

### Phase 0 — Melodio 본래 범위 완성

- Channel DNA부터 Publish Package까지 E2E 안정화
- 실제 2곡·다곡 생성과 Storage 검증
- Worker와 Supabase 마이그레이션 안정화
- 제작자 대시보드와 승인 흐름 완성

### Phase 1 — Melodio 공급 계층

- 정식 카탈로그 스키마
- 기존 Master·Publish Package의 Catalog 승격
- 공급 승인과 자동 QA Gate
- Asset Version과 Catalog Release
- 권리 원장

### Phase 2 — MugSound MVP

- 별도 프로젝트 생성
- 공간·지점·개인 계정
- 승인 카탈로그 탐색
- 웹·PWA 플레이어
- 매장 자동 편성
- 재생 세션과 이력
- 기본 구독 권한

### Phase 3 — 매장 운영 안정화

- 오프라인 캐시
- 다지점 원격 관리
- Device Token과 상태 모니터링
- 장애 복구와 공급 중단 반영
- 미니 PC 기반 표준 설치안

### Phase 4 — 개인·자동차 확장

- 모바일 앱
- Bluetooth·AirPlay·Google Cast
- CarPlay·Android Auto
- Android Automotive OS 검토

### Phase 5 — 전용 하드웨어와 파트너십

- MugSound Player Box
- 프랜차이즈·호텔·공공 공간 공급
- 차량·충전소 사업자 제휴
- 이용량 기반 정산과 고급 분석

## 13. MugSound 착수 Gate

다음 조건을 충족한 후 본격 개발을 시작한다.

- Melodio의 Master 선택과 Episode Assembly가 실제 음원으로 검증됨
- Publish Package와 스틸 커버가 안정적으로 생성됨
- Storage 권한과 Worker 배포 전략이 확정됨
- 공급 가능한 음악의 권리 정책이 문서화됨
- Catalog와 Publish Package의 경계가 확정됨
- Melodio 공급 API의 인증 주체가 결정됨
- MugSound MVP의 첫 대상이 매장인지 개인인지 확정됨

권장 첫 시장은 반복 재생과 운영 자동화의 가치가 분명한 카페·스터디 카페 등의 소규모 매장이다.

## 14. 현재 결정 사항

1. MugSound는 Melodio와 별도 프로젝트로 개발한다.
2. Melodio는 음악 제작 공장과 공급 승인 주체다.
3. MugSound는 편성·구독·재생·운영을 담당한다.
4. 장르보다 감정, 활동, 공간 목적을 핵심 분류로 사용한다.
5. Melodio 본래 범위를 먼저 완성한 뒤 공급 계층과 MugSound를 진행한다.
6. MugSound는 Melodio 내부 DB가 아니라 안전한 버전 API를 사용한다.
7. 매장 MVP는 범용 PC·태블릿·미니 PC를 사용하고 전용 하드웨어는 후속 단계로 둔다.

## 15. 후속 문서 목록

MugSound 착수 시 다음 문서를 별도 프로젝트에서 작성한다.

- MugSound PRD
- MVP 사용자 흐름과 화면 정보구조
- 공간·지점·편성·구독 데이터 모델
- Melodio–MugSound OpenAPI 계약서
- Catalog 및 Supply Approval 상세 명세
- Player Core와 오프라인 캐시 기술 명세
- 매장 설치·스피커 연결 가이드
- 권리·라이선스·정산 정책
- 보안 위협 모델과 운영 모니터링 계획

