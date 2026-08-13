// melodio-web/scripts/sync-obsidian-knowledge.js
// Standalone script to sync Obsidian Curation and Music Wiki notes to Supabase

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Manual helper to load environment variables from .env.local
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) {
    console.log('⚠️ .env.local file not found at:', envPath);
    return;
  }
  
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const equalIdx = trimmed.indexOf('=');
    if (equalIdx > -1) {
      const key = trimmed.slice(0, equalIdx).trim();
      let val = trimmed.slice(equalIdx + 1).trim();
      
      // Strip outer quotes if present
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

// Load environment variables
loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables missing.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Define Obsidian source directories dynamically based on the current user
const os = require('os');
const username = os.userInfo().username;
const VAULT_ROOT = username === 'yoonmanro'
  ? '/Users/yoonmanro/Desktop/project/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio'
  : '/Users/muse/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio';

const TARGET_FOLDERS = [
  { path: path.join(VAULT_ROOT, '300_Prompts'), defaultCategory: 'curation' },
  { path: path.join(VAULT_ROOT, '100_Genres & Styles'), defaultCategory: 'genre' }
];

// Helper to parse simple YAML frontmatter without external parser libraries
function parseMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---[^\r\n]*\r?\n([\s\S]*?)\r?\n---[^\r\n]*\r?\n([\s\S]*)$/);
  
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  
  const yamlLines = match[1].split('\n');
  const body = match[2].trim();
  const frontmatter = {};
  
  yamlLines.forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > -1) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      
      // Strip outer quotes if present
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      frontmatter[key] = val;
    }
  });
  
  return { frontmatter, body };
}

function isEqualMetadata(meta1, meta2) {
  const keys1 = Object.keys(meta1 || {});
  const keys2 = Object.keys(meta2 || {});
  if (keys1.length !== keys2.length) return false;
  for (const key of keys1) {
    if (meta1[key] !== meta2[key]) return false;
  }
  return true;
}

async function syncKnowledge() {
  console.log('🚀 Starting Obsidian to Supabase Knowledge Synchronization...');
  
  let totalSynced = 0;
  const activeKeys = new Set();

  // 1. Fetch existing records to compare content and prevent unnecessary updated_at updates
  const { data: dbRecords, error: fetchError } = await supabase
    .from('curation_playbooks')
    .select('key_name, title, category, content, metadata, updated_at');

  const existingMap = new Map();
  if (dbRecords) {
    dbRecords.forEach(r => existingMap.set(r.key_name, r));
  }
  
  for (const folderConfig of TARGET_FOLDERS) {
    const folderPath = folderConfig.path;
    
    if (!fs.existsSync(folderPath)) {
      console.log(`⚠️ Folder does not exist: ${folderPath}. Skipping.`);
      continue;
    }
    
    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.md'));
    console.log(`📂 Scanning folder: ${path.basename(folderPath)} (${files.length} markdown files found)`);
    
    for (const fileName of files) {
      const filePath = path.join(folderPath, fileName);
      try {
        const { frontmatter, body } = parseMarkdownFile(filePath);
        
        const key_name = frontmatter.key_name || path.basename(fileName, '.md');
        const title = frontmatter.title || path.basename(fileName, '.md');
        const category = frontmatter.category || folderConfig.defaultCategory;
        
        activeKeys.add(key_name);
        
        // Extract everything else as metadata
        const metadata = { ...frontmatter };
        delete metadata.key_name;
        delete metadata.title;
        delete metadata.category;
        
        const existing = existingMap.get(key_name);
        const normalize = (str) => (str || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        const isModified = !existing || 
          normalize(existing.content) !== normalize(body) || 
          existing.title !== title || 
          existing.category !== category ||
          !isEqualMetadata(existing.metadata, metadata);

        if (isModified) {
          const payload = {
            category,
            key_name,
            title,
            content: body,
            metadata,
            updated_at: new Date().toISOString()
          };
          
          console.log(`⏳ Syncing playbook [${category}] "${title}" (key: ${key_name})...`);
          const { error } = await supabase
            .from('curation_playbooks')
            .upsert(payload, { onConflict: 'key_name' });
            
          if (error) {
            console.error(`❌ Error syncing ${fileName}:`, error.message);
          } else {
            console.log(`✅ Synced ${fileName} successfully!`);
            totalSynced++;
          }
        } else {
          console.log(`⚡ Unchanged playbook "${title}" (key: ${key_name}). Skipping DB upsert.`);
          totalSynced++;
        }
      } catch (err) {
        console.error(`❌ Exception parsing ${fileName}:`, err.message);
      }
    }
  }
  
  console.log(`\n🧹 Cleaning up orphaned/deleted database records...`);
  if (fetchError) {
    console.error('❌ Error fetching DB records for cleanup:', fetchError.message);
  } else if (dbRecords) {
    for (const record of dbRecords) {
      if (!activeKeys.has(record.key_name)) {
        console.log(`🗑️ Deleting orphaned DB preset: "${record.title}" (key: ${record.key_name})...`);
        const { error: deleteError } = await supabase
          .from('curation_playbooks')
          .delete()
          .eq('key_name', record.key_name);
          
        if (deleteError) {
          console.error(`❌ Error deleting record ${record.key_name}:`, deleteError.message);
        } else {
          console.log(`✅ Deleted obsolete DB preset ${record.key_name} successfully!`);
        }
      }
    }
  }
  
  console.log(`\n🎉 Sync & Cleanup complete! Total files synced: ${totalSynced}`);
}

syncKnowledge();
