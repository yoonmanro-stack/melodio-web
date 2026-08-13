# 🎵 Melodio Web App Development Guide & Change Log (DEV.md)

> **Melodio Web** — Next.js 16.2 (Turbopack) 기반 AI 음악 & 바이럴 숏폼 비디오 서비스  
> **최종 업데이트일**: 2026-07-26  
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

*Melodio Engineering Team — Built with Google Antigravity AI*
