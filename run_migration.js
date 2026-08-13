const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
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

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || 'https://jfsfxzhunkrjyibsdswb.supabase.co';
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

// Read SQL migration file
const sqlFilePath = path.join(__dirname, 'migrations/20260716_add_concept_deconstruction_metadata.sql');
if (!fs.existsSync(sqlFilePath)) {
  console.error("Migration file not found at", sqlFilePath);
  process.exit(1);
}
const sqlQuery = fs.readFileSync(sqlFilePath, 'utf8');

async function run() {
  console.log(`Running migration from ${sqlFilePath} via exec_sql RPC...`);
  console.log('Query:', sqlQuery);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sql_query: sqlQuery
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Migration succeeded! Result:', result);
    } else {
      const errorText = await response.text();
      console.error('Migration failed via API. Status:', response.status, 'Error:', errorText);
      console.log('\n💡 [도움말] Supabase 대시보드에서 직접 실행하려면 아래 SQL을 복사하여 SQL Editor에 붙여넣으세요:');
      console.log('================================================================');
      console.log(sqlQuery);
      console.log('================================================================\n');
    }
  } catch (err) {
    console.error('Exception during migration:', err.message);
  }
}

run();
