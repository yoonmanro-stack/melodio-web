# 🎵 Melodio Web App Development Guide & Change Log (DEV.md)

> **Melodio Web** — Next.js 16.2 (Turbopack) 기반 AI 음악 & 바이럴 숏폼 비디오 서비스  
> **최종 업데이트일**: 2026-08-25
> **배포 상태**: Mac Mini Dev Server (`ONLINE`) / Vercel Production (`https://melodio.app`)

---

## 🚀 2026-07-26 주요 개편 및 개발 성과

### 1. 🎬 Grok Imagine AI 비디오 디렉터 백엔드 구축
- **파일**: [src/app/api/viral-cf/grok-video/prompt/route.ts](file:///Users/yoonmanro/Desktop/project/Melodio_Ops/melodio-web/src/app/api/viral-cf/grok-video/prompt/route.ts)
- **개요**: 기존 하드코딩 `if-else` 분기를 전면 폐지하고 GPT 기반 AI 비디오 디렉터 파이프라인으로 전환.
- **5대 레이어 표준 9:16 비디오 프롬프트**:
  1. `[Hyper-kinetic 9:16 vertical short-form viral skit for "제목" (장르)]`
  2. `PROTAGONIST: [가사 기반 실제 주인공 및 고정 복장]`
  3. `SUPPORTING ACTOR: [가사 기반 상대역/조연]`
  4. `CORE OBJECT: [가사의 상징 핵심 아이템 (예: Floating Glowing AirPod)]`
  5. `VISUAL ACTION & SCENE: [가사 속 3초 몰입 팩폭 상황 & 코믹 표정]`

### 2. 🛡️ Character Consistency Protocol (캐릭터 일관성 파이프라인 v1.0)
- **파일**: [src/app/api/viral-cf/grok-video/route.ts](file:///Users/yoonmanro/Desktop/project/Melodio_Ops/melodio-web/src/app/api/viral-cf/grok-video/route.ts)
- **시퀀셜 프레임 체이닝 (Sequential Frame Chaining)**: Part 1 클립의 컷/키프레임을 인계받아 Part 2 클립에 연속 연동.
- **디테일한 외형 앵커링 (Appearance Anchor)**: 인물의 헤어, 얼굴, 의상(`EXACT SAME KOREAN YOUTH WITH MESSY BLACK HAIR IN NAVY PAJAMAS`)을 고정하여 장면 전환 시 인물 및 옷이 튀는 현상 해결.

### 3. 💰 26초 ~ 30초 과금 맞춤형 정밀 비용 최적화 (Billing Clamp)
- **파일**: [src/app/api/viral-cf/grok-video/merge/route.ts](file:///Users/yoonmanro/Desktop/project/Melodio_Ops/melodio-web/src/app/api/viral-cf/grok-video/merge/route.ts)
- **15초 단위 과금 보호**: FFmpeg 인코딩 컷오프를 `Math.min(29.5, Math.max(26.0, duration))`으로 설정하여 **30.0초 초과로 인한 3배 추가 과금 위험 100% 차단**.
- **[src/lib/engines/lyrics-generator.ts](file:///Users/yoonmanro/Desktop/project/Melodio_Ops/melodio-web/src/lib/engines/lyrics-generator.ts)**: 220~255자(8줄) 분량으로 가사를 스케일링하여, 곡이 exact 26.0s ~ 29.0s 사이에 완곡되도록 동적 설계.

### 4. 📁 보관함(대시보드) 저장 & AI 앨범 커버 동적 생성
- **비디오 DB 자동 저장**: Grok 비디오 합성이 완료되면 Supabase `generations` (`license_hash.video_url`) 및 `video_assets` DB 테이블에 자동 기록하여 **대시보드(`/dashboard`) / 보관함(`/vault`)의 내 비디오 목록**에 바로 노출.
- **AI 커버 아트 파이프라인**: 음원 완성 시 해당 곡의 분위기에 맞는 팝 아트 앨범 커버를 AI로 자동 생성하여 할당.

### 5. 📚 옵시디언 스토리 DB RAG 연동 & 11개 카테고리 확장
- 스토리 에피소드 노드 파싱 파이프라인 구축 (`knowledge/episodes/[category]/[id].md`).
- 카테고리 8개 ➔ **11개 확장** (`parenting`, `food_diet`, `horror_mystery` 추가).

### 6. 🎨 UI & UX 고도화
- **입력창 높이 130% 확대**: `h-28` ➔ `h-36` (`144px`) 확대.
- **"1초 레시피" 제거 & "AI 프로듀서 브리프" 카드 위치 조정**.

---

## 🛠️ 개발 및 배포 SOP

### 1. 로컬 타입 검사
```bash
cd melodio-web
npx tsc --noEmit
```

### 2. Mac Mini 개발/운영 서버 배포
```bash
# GitHub main과 같은 clean commit을 사용한다. rsync로 소스를 덮어쓰지 않는다.
ssh macmini 'export PATH="/opt/homebrew/bin:$PATH" && cd /Users/muse/melodio-worker && git pull --ff-only origin main && cd worker && npm ci && pm2 startOrReload ecosystem.config.js --only melodio-worker --update-env && pm2 save'
```

### 3. Vercel 프로덕션 배포
```bash
cd melodio-web
npx vercel --prod --yes
```

---

## 🔐 2026-08-14 소스 단일화 및 보안 운영 정리

### 1. 공식 소스 및 배포 기준 단일화

- GitHub `yoonmanro-stack/melodio-web`의 `main`을 공식 기준 저장소로 확정.
- MacBook Air의 최신 프로덕션 웹 소스와 Mac mini worker 소스를 공식 작업 폴더로 통합.
- Vercel Production과 소스 정합성을 역순으로 검증하고 `melodio.app` 배포가 `Ready`임을 확인.
- 사이드 메뉴 `/pioneer`(HexaWave 공간 개척)는 본 프로젝트가 아닌 임시 테스트 기능으로 유지.
- 공식 소스 및 기기별 역할은 `CANONICAL_SOURCE.md`를 기준으로 관리.

### 2. 노출 자격증명 폐기 및 서비스별 키 분리

- 노출된 Telegram 봇 토큰 2개를 폐기하고 `@Melodio_Muse_bot`, `@macmuse_bot`에 신규 토큰 적용.
- Supabase Legacy `anon`·`service_role` API 키를 비활성화.
- Legacy HS256 JWT signing key를 폐기하여 기존 `service_role` JWT의 신뢰를 완전히 제거.
- Supabase 신규 키를 Vercel, worker, 관리 스크립트 용도로 각각 분리.
- Anthropic API 키를 Melodio 브리지와 HiveDesk 브리지 용도로 분리.
- Antigravity Claude MCP 전용 키는 Mac mini 서비스와 분리하여 유지.
- 키·토큰 원문 및 식별 가능한 일부 문자열은 문서와 Git에 기록하지 않음.

### 3. GitHub 이력 및 재유입 방지

- 전체 Git 이력을 재작성하여 과거 커밋에 포함된 비밀정보 흔적 제거.
- Gitleaks 전체 이력 검사 결과 0건 확인.
- 커밋 전 Gitleaks 훅을 활성화하여 신규 비밀정보 커밋 차단.
- GitHub `main`의 강제 푸시와 브랜치 삭제를 차단.
- MacBook의 기존 복제본을 새 Git 이력과 동기화.

### 4. Mac mini 운영환경 정리

- 실제 PM2 실행 경로를 SSH로 확인하고 복사본이 아닌 운영 환경파일에 신규 키 적용.
- 환경파일 권한을 `600`으로 제한.
- Telegram·Anthropic·Supabase 인증을 실제 API 응답으로 검증.
- 실행 코드와 보관용 JavaScript 파일의 하드코딩 비밀정보 0건 확인.
- 폐기된 비밀정보가 포함된 백업 및 `DISABLED` 파일 삭제.
- Telegram 봇 런타임 의존성을 명시하고 보안 수정 버전으로 갱신.

### 5. 최종 운영 검증

다음 PM2 프로세스가 모두 `online`임을 확인함.

- `macminiops-bridge`
- `hivedesk-bridge`
- `melodio-worker`
- `melodio-youtube-scheduler`
- `melodio-b2b-loop-worker`
- `melodio-telegram-bot`
- `melodio-web`

### 6. 관련 Git 커밋

- `73262f3` — 프로덕션 웹·worker 소스 통합
- `63a10aa` — 하드코딩 자격증명 제거 및 비밀정보 검사 적용
- `0fa31d9` — Supabase 키 요청 시점 검증 수정
- `87bc84e` — Telegram 봇 런타임 의존성 명시

> 운영 원칙: 비밀값은 Git 추적 파일, 개발 문서, 채팅, 스크린샷에 남기지 않는다. 서비스별 환경파일 또는 배포 플랫폼의 Secret 관리 기능에만 저장한다.

---

*Melodio Engineering Team — Maintained with Antigravity AI and OpenAI Codex*

---

## 2026-08-25 보컬 음색 스타일 기능 정리

- 기존 Voice DNA의 실제 동작을 검증해, 음성 복제 기능이 아닌 생성 프롬프트 기반 `보컬 음색 스타일`로 사용자 안내를 통일.
- 목소리 녹음·음성 업로드·목소리 등록 버튼은 `준비 중`으로 비활성화하고 마이크·파일 접근 코드를 제거.
- `/api/voice/analyze-audio`, `/api/voice/convert`는 요청 본문이나 외부 서비스에 접근하기 전에 `503`을 반환하도록 실패-폐쇄 처리.
- 새 음원 생성 메타데이터의 자동 보이스 변환을 강제로 끄고, 기존 스타일은 프롬프트 조합에만 사용하도록 제한.
- 저장된 `VD-*` 코드, `voice_dnas` 스키마와 기존 사용자 스타일 데이터는 하위 호환을 위해 유지.
- 실제 목소리 등록은 검증된 공급자 연동과 사용자 동의·보관·삭제 정책이 갖춰진 뒤 다시 검토.

---

## 2026-08-25 개인 감상용 플레이리스트 v1

### 기능 범위

- 대시보드의 일반 완성곡에 `Playlist` 버튼을 추가하고, 기존 플레이리스트 선택 또는 새 플레이리스트 생성 후 바로 담을 수 있게 구현.
- 사이드 메뉴의 대시보드 바로 아래에 `내 플레이리스트`(`/playlists`)를 추가.
- 플레이리스트 생성·이름/설명 수정·삭제, 곡 제거·순서 변경, 전체 재생·셔플을 지원.
- `AppShell`에 전역 플레이어를 배치해 페이지를 이동해도 다음 곡 자동 재생, 이전/다음, 셔플, 전체/한 곡 반복, 재생 대기열을 유지.
- 점 3개 메뉴의 중복 `Download Mix`를 제거하고 카드 바깥의 안전한 다운로드 버튼만 유지.

### 데이터 및 보안 경계

- Channel Builder의 유튜브 제작용 플레이리스트, 30초 바이럴/패러디 음원, 4채널 스템 믹서는 서로 다른 도메인으로 유지하며 결합하지 않음.
- 신규 테이블은 `user_playlists`, `user_playlist_items`이고, 항목에는 원곡을 복제하지 않고 `generations.id`와 순서만 저장.
- 사용자 세션과 RLS만 사용하며 service-role 키를 사용하지 않음.
- 곡 추가·삭제·재정렬은 소유권·완성 상태·HTTP 음원·숏폼 제외 조건을 DB에서 다시 검증하는 원자적 RPC로 처리.
- 플레이리스트 삭제는 연결 항목만 삭제하며 원곡은 유지. 원곡 삭제 시 연결 항목만 자동 정리.

### 운영 적용 순서

1. Supabase SQL Editor에서 `migrations/20260825_reconcile_generations_duration_mode.sql` 실행.
2. 이어서 `migrations/20260825_create_user_playlists.sql` 실행.
3. 앱 커밋·GitHub 푸시 후 Vercel 배포.
4. 서로 다른 두 사용자 계정으로 타 사용자 곡/플레이리스트 접근 차단을 확인.
5. 곡 추가·중복 추가·제거·재정렬·전체 재생·페이지 이동 후 연속 재생을 스모크 테스트.

### 로컬 검증

- `npx tsc --noEmit` 통과.
- 신규 플레이리스트 파일 대상 ESLint 오류 0건(동적 외부 커버 이미지 관련 최적화 경고만 존재).
- `npm run build` 통과(Next.js 16.2.3, `/playlists` 및 플레이리스트 API 라우트 생성 확인).
- 변경 파일 Gitleaks 검사 결과 비밀정보 0건.

---

## 2026-08-25 Stem Studio 업로드·분리 파이프라인 복구

### 장애 원인

- 외부 음원 `장대비`의 Demucs 분리는 끝났지만 Mac mini PM2가 약 513MB RSS에서 worker를 재시작했고, DB가 `processing`에 남아 대시보드에서 `Splitting...`이 끝나지 않았다.
- 기존 복구 로직은 `pending`만 다시 읽어 장시간 heartbeat가 끊긴 `processing` 작업을 회수하지 못했다.
- 외부 업로드가 일반 AI 생성곡 목록과 같은 `generations` 화면에 섞이고 `Suno v5.5`로 표시돼 실제 작업 흐름을 오해하게 했다.

### 수정된 구조

- 외부 음원은 전용 `/stem-studio`에서 업로드·진행률·실패·재시도·재생·삭제를 관리하고, 대시보드 Track Library에는 AI 생성곡만 유지한다.
- 브라우저 → private source bucket 직통 signed upload → 원자적 DB queue 등록 → Mac mini Demucs → private output bucket 순서로 분리했다.
- `stem_upload_sessions`와 사용자별 advisory-lock RPC로 시간당 업로드, 2GB source, 동시 3작업, 보관 10작업 한도를 병렬 요청에도 원자적으로 적용한다.
- 원본은 최대 80MB·6분으로 제한하고 worker가 실제 codec·duration을 `ffprobe`로 재검증한다. 다운로드 스트림에도 80MB hard cap과 timeout을 적용한다.
- 브라우저 메모리를 줄이기 위해 mixer preview는 mono AAC 44.1kHz/128kbps로 만들고, 다운로드용 원본 WAV는 그대로 보존한다.
- 혼합곡의 공개 여부와 관계없이 사용자 소유 Stem WAV/AAC는 모두 private bucket에 저장한다. 진행 중 공개 상태 변경은 차단하고, 과거 public Stem이 남은 완료곡은 이전 없이 비공개로 바꾸지 못하게 해 공개 파일 잔존을 막는다.
- 운영 DB에는 `generations.is_public` 생성 이력이 누락돼 있었다. secure migration이 `audio_url`·`is_public`·preview URL 4개를 먼저 자체 보강하고, legacy 메타데이터의 `isPublic:false` 및 외부 업로드 행을 비공개로 backfill한 뒤 `DEFAULT TRUE NOT NULL` 계약을 적용한다. 새 Lyria/Suno/서브곡 INSERT도 DB 컬럼과 메타데이터 공개 값을 항상 함께 기록한다.
- 공개 generation API는 비소유자 응답에서 private `storage://` Stem 참조를 제거한다. 소유자만 Storage RLS를 통해 signed 재생·다운로드 URL을 만들 수 있다.
- worker 실행마다 고유 lease token을 발급하고 모든 heartbeat·단계·완료 갱신에 토큰을 확인한다. 산출물은 attempt별 경로에 저장해 늦은 이전 worker의 정리가 새 결과를 삭제할 수 없고, 실패 정리는 DB의 전용 `cleanup` 상태를 같은 lease로 선점한 실행만 수행한다.
- Demucs 실제 처리 시도와 PM2 재시작·stale lease 회수를 분리했다. 인프라 중단은 `stemAttempt`를 환급하고 별도 카운터에만 기록하므로 재시작 3회가 정상 작업을 영구 실패로 만들지 않는다. 다만 exact 삭제 목록을 유한하게 보장하기 위해 전체 lease claim은 16회에서 안전 중단한다.
- 보관 10작업 한도는 `/stem-studio`에서 관리할 수 있는 `stem-upload`·`custom-upload`에만 적용하며, 일반 대시보드 곡의 별도 Stem 분리 결과는 이 한도를 소모하지 않는다. 완료·진행 작업과 유효한 signed-upload 예약을 하나의 사용자 lock 안에서 합산해 동시 요청도 10개를 넘지 않는다.
- 사용자 삭제는 generation 행과 exact Storage 삭제 목록을 `stem_storage_cleanup_tasks` outbox에 한 트랜잭션으로 기록한다. worker가 API의 즉시 정리보다 먼저 task를 소비하지 못하도록 안전 재확인 시각도 같은 트랜잭션에서 예약한다. signed upload 원본은 세션 만료 후 30분까지 task를 보존해 삭제 뒤 늦게 끝난 PUT도 제거하며, 안전 재확인이 필요 없는 객체의 즉시 삭제 실패만 바로 재시도한다.
- legacy 완료 파일의 private backfill은 삭제 RPC와 동일한 사용자 advisory lock으로 먼저 claim하며, 각 최대 5분 복사 전후 heartbeat/token을 재검증하고 token별 경로를 사용한다. 고정 batch는 UUID cursor로 순회해 영구 실패 행이 뒤의 공개 파일 이전을 막지 못하게 했다.
- 외부 업로드와 별개인 사용자 소유 일반 생성곡도 공개 Stem URL 8개가 정확히 기존 Storage 경로와 일치할 때만 output-only backfill한다(viral/viral-cf·패러디·60초 이하 숏폼은 제외). 원곡 URL·공개 상태는 유지하고 Stem만 private bucket의 attempt 경로로 CAS 전환하며, URL에서 검증한 exact 공개 object 목록을 메타데이터에 영속화해 실패한 공개 파일 삭제를 별도 상태/cursor로 재시도한다. 성공 후 과거 public artifact 이력을 정상화하고, output attempt 이력은 기존 처리 이력과 합쳐 삭제 manifest 144개 한도를 넘지 않게 제한한다.
- worker는 새 Stem 업로드와 legacy Storage 복사 직후 목적지 객체 크기를 원본과 비교한다. HTTP 성공만으로 완료 처리하지 않으므로 부분 업로드나 잘린 WAV/AAC가 DB에 확정되지 않는다.
- attempt·이전 이력은 한도에 맞추려고 잘라내지 않는다. 손상된 이력 또는 안전 한도 도달 시 claim·자동 삭제를 중단해 기록에서 빠진 Storage 객체가 고아로 남는 일을 막는다.
- 만료 미확정 업로드 sweeper, legacy 공개 업로드의 private backfill/공개 파일 삭제 재시도를 추가했다.
- 만료된 미확정 signed upload도 세션을 바로 잊지 않고 exact source 경로를 durable outbox에 먼저 기록한다. 즉시 1차 삭제 후 30분 뒤 재삭제해 토큰 만료 직전에 시작된 느린 PUT의 지연 완료까지 정리한다.
- 소유자가 없는 과거 공개 업로드는 DB 행 삭제와 exact object 9개의 durable cleanup 예약을 한 트랜잭션으로 먼저 확정한 뒤 outbox가 제거한다. 소유권 복구 가능성이 남은 행의 파일을 먼저 지우지 않으며, 소유자가 있는 완료/실패 업로드는 private Storage로 이전한다.
- `generations` 브라우저 직접 쓰기를 차단하고 소유자 SELECT만 허용한다. source/output bucket에는 restrictive guard를 설치해 과거의 넓은 permissive 정책이 있어도 소유자 읽기 외에는 통과하지 못하며, 쓰기·갱신·삭제는 signed token 또는 service worker로 제한한다.

### 운영 적용 순서 — 짧은 maintenance window 필수

새 web/worker는 새 RPC와 private bucket이 필요하고, migration은 구 web의 직접 DB 쓰기를 차단하므로 순서를 바꾸지 않는다.

1. Mac mini에서 `melodio-worker`를 중지해 새 Stem intake를 잠시 멈춘다.
2. Supabase에서 `migrations/20260825133000_secure_stem_studio_storage.sql` 단일 migration을 실행한다.
3. 두 private bucket, 7개 RPC, `stem_upload_sessions`, `stem_storage_cleanup_tasks`, generations/storage RLS 정책이 생성됐는지 확인한다. `UNSAFE_BROAD_STORAGE_POLICY_REQUIRES_REVIEW`가 발생하면 우회하지 말고 기존 broad Storage 정책을 먼저 감사한다.
4. 새 web commit을 Vercel에 배포하고 `melodio.app`이 새 배포의 `Ready` alias인지 확인한다. 새 worker가 private URI로 DB를 전환하기 전에 web이 signed URL을 해석할 수 있어야 한다.
5. Mac mini `/Users/muse/melodio-worker`를 같은 Git commit으로 동기화하고 `node -v`가 **22 이상**인지 확인한 뒤 `worker`에서 의존성을 설치하고 PM2 worker를 재시작한다.
6. 기존 stuck 작업이 stale recovery로 `pending → processing → completed` 또는 명시적 `failed`가 되는지 확인한다.
7. 새 MP3/WAV 1개로 upload, 진행률 heartbeat, 완료 재생, WAV 다운로드, terminal 삭제 후 Storage 정리까지 스모크 테스트한다.

### 로컬 검증

- `node --check worker/index.js`, `node --check worker/ecosystem.config.js` 통과.
- `npx tsc --noEmit` 통과. 변경된 Stem Studio/API/lib 파일 ESLint 오류 0건이다.
- `npm run build` 통과(Next.js 16.2.3, `/stem-studio` 및 4개 Stem API route 생성 확인).
- 변경 파일과 신규 파일 Gitleaks 검사 결과 비밀정보 0건.
- 2026-08-25 운영 반영 완료: secure migration 적용 후 private bucket 2개·테이블 2개·RPC 7개·필수 generation 컬럼 6개·`is_public IS NULL` 0건을 확인했다.
- GitHub `main`과 Vercel Production은 `0aabc2c` 기준으로 `Ready`이며, Mac mini도 기존 폴더를 `/Users/muse/melodio-worker-backup-20260825-1717`에 보존하고 같은 커밋의 clean Git 복제본으로 전환했다.
- PM2 `melodio-worker`는 새 Git 경로에서 Node 25, 1GB memory limit, 35초 kill timeout, 재시작 0회로 `online`이다.
- 기존 stuck `장대비` 작업은 stale recovery 후 `completed`로 수렴했다. private 원본 1개와 private Stem 참조 8개가 확정됐고 운영 Stem Studio에서 4채널 로드 및 3분 32초 길이를 확인했다.

---

## 2026-08-26 모바일 사이드 메뉴 터치 복구

- 원인은 모바일 Sidebar와 전체 화면 blur overlay가 같은 `z-40`이어서, DOM 뒤에 있는 overlay가 메뉴 위에 그려지고 모든 터치를 가로채던 stacking 충돌이었다.
- 모바일 계층을 `헤더 40 < 상단 컨트롤 60 < overlay 70 < Sidebar 80`으로 명시하고 데스크톱 Sidebar는 기존 `z-40`을 유지했다.
- 닫힌 모바일 Sidebar는 `invisible` 처리해 화면 밖 링크가 키보드 Tab 순서에 남지 않도록 했다. 데스크톱에서는 `md:visible`로 항상 복구된다.
- 햄버거 버튼에 `aria-controls`·`aria-expanded`, 닫기 버튼에 label, ESC 닫기를 추가했다.
- `npx tsc --noEmit`, 관련 파일 ESLint, `git diff --check`, `npm run build`를 모두 통과했다.
- 수정분은 최종 검증 후 GitHub `main`과 Vercel Production에 반영했다.
