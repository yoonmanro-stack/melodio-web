import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({path: '.env.local'});
// Use the service role key from worker env
const sRKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impmc2Z4emh1bmtyanlpYnNkc3diIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTkxMzMzMCwiZXhwIjoyMDkxNDg5MzMwfQ.4ErsHoKnb-8LtoL_R9TFAD8em5eyUroBOr2lnJoDtSY';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, sRKey);
async function run() {
  const { data, error } = await supabase.from('generations').select('*');
  console.log("Error:", error);
  console.log("Data size:", data ? data.length : 0);
  console.log("Data:", JSON.stringify(data, null, 2));
}
run();
