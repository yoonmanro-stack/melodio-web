import { createClient } from './supabase/client';

// 기존 @supabase/supabase-js 대신 @supabase/ssr 브라우저 클라이언트 싱글톤 재내보내기
// 이를 통해 모든 클라이언트 컴포넌트가 하나의 인증 세션 및 쿠키 싱크를 완벽히 공유합니다.
export const supabase = createClient();
