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

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    // 1. Check youtube_automations
    const { data: automations, error: autoError } = await supabase.from('youtube_automations').select('*').limit(1);
    if (autoError) {
      console.error('❌ youtube_automations error:', autoError.message);
    } else {
      console.log('✅ youtube_automations exists. Row count:', automations.length);
      if (automations.length > 0) {
        console.log('   Columns check: branding_metadata =', 'branding_metadata' in automations[0], ', automation_type =', 'automation_type' in automations[0]);
      } else {
        // Test querying columns specifically
        const { error: colError } = await supabase.from('youtube_automations').select('branding_metadata, automation_type').limit(1);
        if (colError) {
          console.error('❌ youtube_automations branding_metadata or automation_type column missing:', colError.message);
        } else {
          console.log('✅ youtube_automations columns (branding_metadata, automation_type) exist!');
        }
      }
    }

    // 2. Check curation_playbooks
    const { data: playbooks, error: pbError } = await supabase.from('curation_playbooks').select('key_name, category, inferred_genre, visual_metadata, audio_metadata').limit(1);
    if (pbError) {
      console.error('❌ curation_playbooks error:', pbError.message);
    } else {
      console.log('✅ curation_playbooks exists and contains new columns! Row count:', playbooks.length);
    }

    // 3. Check video_assets
    const { data: videoAssets, error: vaError } = await supabase.from('video_assets').select('*').limit(1);
    if (vaError) {
      console.error('❌ video_assets error:', vaError.message);
    } else {
      console.log('✅ video_assets exists.');
    }

    // 3b. Check youtube_channels
    const { data: ytChannels, error: ytcError } = await supabase.from('youtube_channels').select('*');
    if (ytcError) {
      console.error('❌ youtube_channels error:', ytcError.message);
    } else {
      console.log('✅ youtube_channels count:', ytChannels.length);
      if (ytChannels.length > 0) {
        console.log('   Linked channels:', ytChannels.map(c => ({ id: c.channel_id, title: c.channel_title, userId: c.user_id })));
      }
    }

    // 4. Check generations cover_art_url
    const { error: genColError } = await supabase.from('generations').select('cover_art_url').limit(1);
    if (genColError) {
      console.error('❌ generations cover_art_url column missing:', genColError.message);
    } else {
      console.log('✅ generations cover_art_url column exists!');
    }

  } catch (err) {
    console.error('Exception:', err.message);
  }
}

check();
