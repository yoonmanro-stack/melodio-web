import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({path: '.env.local'});
// Use the service role key from worker env
const sRKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, sRKey);
async function run() {
  const { data, error } = await supabase.from('generations').select('*');
  console.log("Error:", error);
  console.log("Data size:", data ? data.length : 0);
  console.log("Data:", JSON.stringify(data, null, 2));
}
run();
