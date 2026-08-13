const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.join(__dirname, '../.env.local');
const envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      envConfig[match[1]] = value;
    }
  });
}

const sRKey = envConfig.SUPABASE_SERVICE_ROLE_KEY || 'REDACTED_JWT';
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || 'https://jfsfxzhunkrjyibsdswb.supabase.co';

const supabase = createClient(supabaseUrl, sRKey);

async function check() {
  console.log("Checking curation_playbooks in Supabase...");
  const { data: playbooks, error: playbooksError } = await supabase
    .from('curation_playbooks')
    .select('id, category, key_name, title, metadata')
    .limit(10);
  
  console.log("Curation playbooks check result:", {
    hasError: !!playbooksError,
    error: playbooksError?.message,
    data: playbooks
  });
}

check();
