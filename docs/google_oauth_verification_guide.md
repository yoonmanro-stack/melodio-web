# 🔒 Google Cloud Console 검수 신청 및 연동 예외 UI 고도화 가이드

이 문서는 Melodio 정식 오픈 전에 대표님과 함께 진행할 **Google Cloud Console 브랜드 검수 신청(GCP OAuth Consent Screen Verification)** 준비 사항과, 향후 유튜브 연동 예외 케이스의 **에러 얼럿창 커스텀화 계획**을 정리한 가이드라인입니다.

---

## 1. ⚙️ Google Cloud Console OAuth 동의 화면 설정 (오픈 전 사전 세팅)

구글 동의 화면(Consent Screen)에 경고창을 없애고 멜로디오 로고와 약관 링크를 예쁘게 노출하기 위해 GCP 콘솔에서 등록해야 하는 세부 사항입니다.

### 📋 사전 준비 및 입력 항목
GCP 콘솔의 [APIs & Services] ➔ [OAuth consent screen]에서 다음 항목들을 채워 넣습니다:

1. **앱 정보 (App Information)**
   - **App name**: `Melodio`
   - **User support email**: `yoonmanro@gmail.com` (또는 공식 지원 이메일)
   - **App logo**: 멜로디오 공식 로고 (120x120px, PNG/JPG, 120KB 이하)
     > [!WARNING]
     > 로고를 올리면 구글의 수동 검수가 강제됩니다. 로고 수정 예정이 있다면 최종 확정된 로고로 단 한 번에 신청해야 반려를 피할 수 있습니다.
2. **앱 도메인 (App Domains)**
   - **Application home page**: `https://melodio.app`
   - **Application privacy policy link**: `https://melodio.app/privacy`
   - **Application terms of service link**: `https://melodio.app/terms`
3. **승인된 도메인 (Authorized Domains)**
   - `melodio.app` 추가 (구글 인증의 최우선 조건)
4. **개발자 연락처 정보 (Developer Contact Information)**
   - `yoonmanro@gmail.com`

---

## 2. 📝 영문 사유서 (Scope Justification Statement) 작성 가이드

구글에 `youtube.upload` 및 `youtube.readonly` 민감 권한(Restricted Scopes) 승인을 요청할 때 제출할 영문 소명 자료 초안입니다. GCP 검수 신청 양식의 "Explain why your app needs these scopes" 항목에 기입합니다.

### ✉️ `youtube.upload` 소명 내용 (초안)
> **English Version**:
> Melodio is a unified AI-powered video content production platform designed for creators. Our application allows users to draft, orchestrate, and generate automated video assets combined with AI-synthesized music. The `youtube.upload` scope is essential because our core value proposition is "one-stop automated scheduling and distribution." Users configure upload settings (e.g., publishing date, video title, tags, description) in our dashboard, and our background worker directly publishes their created video assets to their linked YouTube channels without requiring manual file downloads and manual uploads, saving hours of repetitive workflow.
>
> **요약 번역**:
> Melodio는 크리에이터를 위한 AI 비디오 콘텐츠 자동 제작 플랫폼입니다. 본 앱의 핵심 가치는 "스케줄 기반 원스톱 자동 유포"이며, 유저가 당사 대시보드에서 스케줄 및 메타데이터를 세팅하면 백그라운드 워커가 사용자의 유튜브 채널에 비디오를 직접 자동으로 게시해 줍니다. 따라서 `youtube.upload` 권한은 수동 다운로드/업로드의 낭비를 막기 위한 핵심적인 비즈니스 기능입니다.

### ✉️ `youtube.readonly` 소명 내용 (초안)
> **English Version**:
> The `youtube.readonly` scope is utilized to fetch the authenticated user's YouTube channel metadata (specifically, the unique Channel ID and Channel Title). This information is strictly used to display the currently linked channel status in the user's dashboard and to perform server-side validation ensuring that the user uploads videos only to the target channel they explicitly authorized.
>
> **요약 번역**:
> `youtube.readonly` 권한은 인증된 유저의 유튜브 채널 메타데이터(채널 ID, 채널명)를 읽기 위해 사용됩니다. 이 정보는 대시보드 상에 연동 상태를 명시하고, 백그라운드에서 사전에 인증된 올바른 타겟 채널로만 영상이 업로드되도록 유효성을 확인하는 데 활용됩니다.

---

## 3. 🎥 구글 제출용 데모 동영상(Demo Video) 촬영 가이드라인

구글 검수팀은 실제 권한을 사용하는 100% E2E 실연 영상을 유튜브에 **미등록(Unlisted)**으로 올려 링크를 제출할 것을 요구합니다. 영상이 조건에 맞지 않으면 무조건 반려되므로 아래 체크리스트를 완벽히 준수해야 합니다.

### 🚨 동영상 필수 포함 체크리스트
1. **Client ID 노출 (가장 중요)**
   - 멜로디오 로그인 후 "유튜브 연동하기" 버튼을 눌렀을 때, 주소창에 나타나는 구글 로그인 URL 중 `client_id=928164047966-...` 부분이 영상에 **풀 해상도로 또렷하게 보전**되어야 합니다. (이 부분이 안 보이면 즉시 반려됩니다.)
2. **경고창 돌파 및 로그인**
   - "Google에서 확인하지 않은 앱" 경고창이 뜨면 `[계속(Advanced ➔ Go to Melodio)]` 버튼을 눌러 승인 화면으로 진입하는 과정을 보여줍니다.
3. **권한 동의 체크**
   - 구글 동의 화면에서 `youtube.upload` 및 `youtube.readonly` 권한 체크박스를 명시적으로 선택하고 완료하는 모습을 보여줍니다.
4. **연동 성공 확인**
   - 멜로디오 대시보드로 복귀하여 "연동 성공" 얼럿창이 뜨고 대시보드에 채널 이름(예: `당근아빠`)이 정상 노출되는 과정을 보여줍니다.
5. **실제 비디오 업로드 테스트**
   - 멜로디오 내부에서 짧은 테스트 비디오를 1편 생성한 후, 스케줄링 또는 즉시 업로드 기능을 작동시켜 사용자의 유튜브 채널에 실제로 동영상이 업로드(비공개 또는 예약 상태 권장) 완료되는 장면을 보여줍니다.
   - 마지막으로 유튜브 스튜디오(`studio.youtube.com`)에 접속하여 방금 업로드된 영상을 보여주며 마무리합니다.

---

## 4. 🖥️ 유튜브 연동 예외 UI 커스텀화 개발 계획

현재 브라우저 내장 `alert()` 창으로 띄우는 예외 및 성공 메시지 처리를, 나중에 멜로디오 브랜드 컬러에 맞춰 아름답게 리팩토링하는 코드 가이드라인입니다.

### 📍 수정 대상 위치
- [melodio-web/src/app/(app)/autopilot/page.tsx](file:///Users/yoonmanro/Desktop/project/Melodio_Ops/melodio-web/src/app/(app)/autopilot/page.tsx#L1213-L1236)의 `useEffect` 훅

### 🛠️ 리팩토링 코드 설계 (예시)

기존의 단순 브라우저 `alert()`를 React 상태 관리와 멜로디오 다크 톤앤매너를 지닌 Toast 컴포넌트로 변경합니다.

```tsx
// 1. 상태 변수 정의 (page.tsx 상단 컴포넌트 내부)
const [notification, setNotification] = useState<{
  type: 'success' | 'error';
  message: string;
} | null>(null);

// 2. useEffect 내 alert 대체
useEffect(() => {
  const success = searchParams.get('success')
  const errorMsg = searchParams.get('error')
  
  if (success) {
    setNotification({
      type: 'success',
      message: '유튜브 채널 연동에 성공하였습니다!'
    });
    router.replace('/autopilot');
  } else if (errorMsg) {
    setNotification({
      type: 'error',
      message: `연동 실패: ${errorMsg}`
    });
    router.replace('/autopilot');
  }
}, [searchParams]);

// 3. UI 렌더링 영역 (JSX 하단 컴포넌트 포탈 또는 알림 패널)
{notification && (
  <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 animate-slide-in
    \${notification.type === 'success' 
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
      : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
    }`}
  >
    <div className="flex-1 text-sm font-semibold">
      {notification.type === 'success' ? '✨ ' : '⚠️ '} {notification.message}
    </div>
    <button 
      onClick={() => setNotification(null)}
      className="text-xs opacity-50 hover:opacity-100 font-bold ml-2 transition-opacity"
    >
      [닫기]
    </button>
  </div>
)}
```
