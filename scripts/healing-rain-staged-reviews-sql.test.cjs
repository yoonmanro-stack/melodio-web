// Optional isolated PostgreSQL regression: NODE_PATH=<pglite>/node_modules node this-file.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
(async () => {
  const db = new PGlite(); let phase = 'bootstrap';
  try {
    await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
      INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role',true),'') $$;
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
      CREATE SCHEMA storage; CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
      CREATE TABLE storage.objects(id UUID PRIMARY KEY,bucket_id TEXT); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`);
    for (const migration of ['20261012_create_healing_rain_projects.sql','20261012_create_healing_rain_generations.sql','20261013_healing_rain_staged_reviews.sql','20261014_create_healing_rain_branding.sql']) {
      phase = migration; await db.exec(fs.readFileSync(path.join(root, 'migrations', migration), 'utf8'));
    }
    phase = 'regression';
    for (const fixture of ['healing-rain-branding.regression.sql', 'healing-rain-staged-reviews.regression.sql']) {
    phase = fixture;
    const sql = fs.readFileSync(path.join(root, 'scripts', fixture), 'utf8').replaceAll('__TEST_OWNER_UUID__','11111111-1111-4111-8111-111111111111').replaceAll('__TEST_OTHER_UUID__','22222222-2222-4222-8222-222222222222');
    await db.exec(sql);
    }
    phase = 'rollback verification';
    const counts = (await db.query('SELECT (SELECT count(*)::int FROM public.healing_rain_branding_profiles) AS profiles,(SELECT count(*)::int FROM public.healing_rain_generations) AS jobs')).rows[0];
    if (counts.profiles || counts.jobs) throw new Error('Fixture did not roll back');
    console.log('PASS: combined branding + staged-review migrations; owner isolation, lease CAS, audio holds/approval/rejection, hash-bound immutable reviews, frozen branding, reclaim safety, rollback.');
  } catch (error) { console.error(JSON.stringify({ phase, code: error.code, message: String(error.message).slice(0,240), context: String(error.where ?? '').slice(0,500) })); process.exitCode = 1; }
  finally { await db.close(); }
})();
