# 🎵 Melodio Web App Development Guide & Change Log (DEV.md)

> **Melodio Web** — Next.js 16.2 (Turbopack) 기반 AI 음악 & 바이럴 숏폼 비디오 서비스  
> **최종 업데이트일**: 2026-08-14
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
rsync -avz --exclude 'node_modules' --exclude '.next' ./melodio-web/ macmini:/Users/muse/Desktop/project/melodio-web/
ssh macmini 'export PATH="/opt/homebrew/bin:$PATH" && cd /Users/muse/Desktop/project/melodio-web && npm run build && pm2 restart melodio-web'
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
