import fs from 'fs';
import path from 'path';

/**
 * VLE 5.0 (Viral Lyrics Engine) 마스터 파일 동적 파서
 * /VLE/BACKEND_MASTER.md 및 /VLE/ENGINE/*.md 파일들을 직접 읽어서
 * LLM 프롬프트에 100% 원문 그대로 주입합니다.
 */
export function loadVLEMasterPrompt(): string {
  try {
    const basePath = path.join(process.cwd(), '..', 'VLE');
    const enginePath = path.join(basePath, 'ENGINE');

    const backendMaster = fs.existsSync(path.join(basePath, 'BACKEND_MASTER.md'))
      ? fs.readFileSync(path.join(basePath, 'BACKEND_MASTER.md'), 'utf-8')
      : '';

    const topicEngine = fs.existsSync(path.join(enginePath, 'TOPIC_ENGINE.md'))
      ? fs.readFileSync(path.join(enginePath, 'TOPIC_ENGINE.md'), 'utf-8')
      : '';

    const hookEngine = fs.existsSync(path.join(enginePath, 'HOOK_ENGINE.md'))
      ? fs.readFileSync(path.join(enginePath, 'HOOK_ENGINE.md'), 'utf-8')
      : '';

    const coreRules = fs.existsSync(path.join(enginePath, 'CORE_SYSTEM_RULES.md'))
      ? fs.readFileSync(path.join(enginePath, 'CORE_SYSTEM_RULES.md'), 'utf-8')
      : '';

    const generatorEngine = fs.existsSync(path.join(enginePath, 'GENERATOR_ENGINE.md'))
      ? fs.readFileSync(path.join(enginePath, 'GENERATOR_ENGINE.md'), 'utf-8')
      : '';

    const lyricsSchema = fs.existsSync(path.join(enginePath, 'LYRICS_SCHEMA.md'))
      ? fs.readFileSync(path.join(enginePath, 'LYRICS_SCHEMA.md'), 'utf-8')
      : '';

    const criticEngine = fs.existsSync(path.join(enginePath, 'CRITIC_ENGINE.md'))
      ? fs.readFileSync(path.join(enginePath, 'CRITIC_ENGINE.md'), 'utf-8')
      : '';

    return `
=================================================================
VLE 5.0 MASTER ARCHITECTURE SYSTEM PROMPT (DIRECT FILE INJECTION)
=================================================================

--- ENTRY POINT SPECIFICATION ---
${backendMaster}

--- STEP 1: TOPIC SPECIFICATION ---
${topicEngine}

--- STEP 2: HOOK SPECIFICATION ---
${hookEngine}

--- STEP 3: CORE RULES SPECIFICATION ---
${coreRules}

--- STEP 4: GENERATOR SPECIFICATION ---
${generatorEngine}

--- STEP 5: LYRICS SCHEMA SPECIFICATION ---
${lyricsSchema}

--- STEP 6 & 7: CRITIC & REWRITE LOOP SPECIFICATION ---
${criticEngine}
`;
  } catch (err) {
    console.error('[VLE Engine] Failed to dynamically load VLE markdown files:', err);
    return '';
  }
}
