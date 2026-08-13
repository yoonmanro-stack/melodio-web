const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read env.local manually
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing environment variables!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  // Let's get one generation ID first
  const { data: list, error: listErr } = await supabase
    .from('generations')
    .select('id, title')
    .limit(1);

  if (listErr) {
    console.error("List error:", listErr);
    return;
  }

  if (!list || list.length === 0) {
    console.log("No generations found in database.");
    return;
  }

  const track = list[0];
  console.log("Found track:", track);

  const prefix = track.id.slice(0, 6);
  console.log("Testing prefix:", prefix);

  // Test LIKE query on ID
  const { data: likeRes, error: likeErr } = await supabase
    .from('generations')
    .select('id, title')
    .like('id', `${prefix}%`);

  if (likeErr) {
    console.error("LIKE query error:", likeErr.message);
  } else {
    console.log("LIKE query results:", likeRes);
  }
}

run();
