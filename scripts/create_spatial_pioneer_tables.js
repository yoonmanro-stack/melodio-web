const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL || 'https://jfsfxzhunkrjyibsdswb.supabase.co';
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

const sqlQuery = `
-- 1. place_cells
CREATE TABLE IF NOT EXISTS public.place_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. h3_modules
CREATE TABLE IF NOT EXISTS public.h3_modules (
  h3_index TEXT PRIMARY KEY,
  place_cell_id UUID REFERENCES public.place_cells(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. flags
CREATE TABLE IF NOT EXISTS public.flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_cell_id UUID REFERENCES public.place_cells(id) ON DELETE CASCADE,
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  spot_fingerprint JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Enable (or public access)
ALTER TABLE public.place_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.h3_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select place_cells" ON public.place_cells;
CREATE POLICY "Public select place_cells" ON public.place_cells FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select h3_modules" ON public.h3_modules;
CREATE POLICY "Public select h3_modules" ON public.h3_modules FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public select flags" ON public.flags;
CREATE POLICY "Public select flags" ON public.flags FOR ALL USING (true) WITH CHECK (true);
`;

async function run() {
  console.log('Creating Supabase spatial tables (place_cells, h3_modules, flags)...');
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql_query: sqlQuery })
    });

    if (response.ok) {
      console.log('✅ Supabase spatial tables successfully created!');
    } else {
      const errText = await response.text();
      console.log('RPC exec_sql output/fallback:', errText);
      console.log('\n================ SQL MIGRATION SCRIPT ================');
      console.log(sqlQuery);
      console.log('======================================================\n');
    }
  } catch (err) {
    console.error('Error creating tables:', err.message);
  }
}

run();
