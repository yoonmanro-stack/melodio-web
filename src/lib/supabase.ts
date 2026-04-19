import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
// TEMPORARY: Use Service Role Key to bypass RLS for demonstration purposes
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impmc2Z4emh1bmtyanlpYnNkc3diIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTkxMzMzMCwiZXhwIjoyMDkxNDg5MzMwfQ.4ErsHoKnb-8LtoL_R9TFAD8em5eyUroBOr2lnJoDtSY';

// 클라이언트 사이드와 서버 컴포넌트 모두에서 동작하는 싱글톤 인스턴스
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
