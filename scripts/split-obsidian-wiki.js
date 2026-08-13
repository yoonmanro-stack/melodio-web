// melodio-web/scripts/split-obsidian-wiki.js
const fs = require('fs');
const path = require('path');
const os = require('os');

// Define output Obsidian directory dynamically based on user env
const username = os.userInfo().username;
const VAULT_ROOT = username === 'yoonmanro'
  ? '/Users/yoonmanro/Desktop/project/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio'
  : '/Users/muse/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio';

const OUTPUT_DIR = path.join(VAULT_ROOT, '100_Genres & Styles');
const INPUT_FILE = path.resolve(__dirname, '../raw_wiki.txt');

function runSplitter() {
  console.log('🚀 Starting Wiki Text Splitter...');
  
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    console.log('Please create raw_wiki.txt in the melodio-web directory first and paste the AI output.');
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    console.log(`📂 Creating output directory: ${OUTPUT_DIR}`);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const rawText = fs.readFileSync(INPUT_FILE, 'utf-8');
  
  // Regular expression to match each file section:
  // === START_FILE: key_name.md ===
  // [Content]
  // === END_FILE ===
  const fileRegex = /===\s*START_FILE:\s*([a-zA-Z0-9_\-\.]+)\s*===([\s\S]*?)===\s*END_FILE\s*===/g;
  
  let match;
  let fileCount = 0;

  while ((match = fileRegex.exec(rawText)) !== null) {
    const fileName = match[1].trim();
    let fileContent = match[2];

    // Trim initial newlines, trailing whitespaces
    fileContent = fileContent.replace(/^\r?\n/, '').trimEnd();
    
    // Parse and auto-correct frontmatter if it lacks --- or has ## prefixes
    const lines = fileContent.split('\n');
    const frontmatter = [];
    const bodyLines = [];
    let inMetadata = true;
    const metadataKeys = ['key_name', 'title', 'category', 'bpm', 'instruments', 'vocal_style', 'mood', 'tags'];

    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        // Retain empty lines in body, skip empty lines in frontmatter block
        if (!inMetadata) {
          bodyLines.push(line);
        }
        continue;
      }
      
      if (inMetadata) {
        const matchKey = trimmed.match(/^(?:##\s*|#\s*)?([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
        if (matchKey && metadataKeys.includes(matchKey[1])) {
          const key = matchKey[1];
          const val = matchKey[2].trim();
          frontmatter.push(`${key}: ${val}`);
        } else {
          // If the line is the markdown separator ---, ignore it and let us wrap it manually
          if (trimmed === '---') {
            continue;
          }
          inMetadata = false;
          bodyLines.push(line);
        }
      } else {
        bodyLines.push(line);
      }
    }

    let finalContent = '';
    if (frontmatter.length > 0) {
      finalContent = `---\n${frontmatter.join('\n')}\n---\n\n${bodyLines.join('\n')}`;
    } else {
      finalContent = fileContent;
    }

    const outputPath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(outputPath, finalContent + '\n', 'utf-8');
    console.log(`📝 Generated: ${fileName} -> ${outputPath}`);
    fileCount++;
  }

  if (fileCount === 0) {
    console.log('❌ No valid file blocks matched.');
    console.log('Ensure the input file uses the following format:\n');
    console.log('=== START_FILE: genre-name.md ===');
    console.log('---\nkey_name: ...\ntitle: ...\n---\n...');
    console.log('=== END_FILE ===');
  } else {
    console.log(`\n🎉 Success! Successfully generated ${fileCount} Obsidian markdown wiki files in ${OUTPUT_DIR}.`);
    console.log(`👉 Now run "node scripts/sync-obsidian-knowledge.js" to upload them to your Database.`);
  }
}

runSplitter();
