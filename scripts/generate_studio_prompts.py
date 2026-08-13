import os
import re
import sys
import json
import time
import requests
import getpass

# Env loading helper
def load_env_local():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(current_dir, '../.env.local')
    if not os.path.exists(env_path):
        print(f"⚠️ .env.local file not found at: {env_path}")
        return {}
    
    env_vars = {}
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            eq_idx = line.find('=')
            if eq_idx > -1:
                key = line[:eq_idx].strip()
                val = line[eq_idx+1:].strip()
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                env_vars[key] = val
    return env_vars

# Markdown frontmatter helper
def parse_markdown_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract frontmatter
    match = re.match(r"^---[^\r\n]*\r?\n([\s\S]*?)\r?\n---[^\r\n]*\r?\n([\s\S]*)$", content)
    if not match:
        return {}, content
    
    yaml_text = match[1]
    body = match[2].strip()
    
    frontmatter = {}
    for line in yaml_text.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        colon_idx = line.find(':')
        if colon_idx > -1:
            key = line[:colon_idx].strip()
            val = line[colon_idx+1:].strip()
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            frontmatter[key] = val
            
    return frontmatter, body

def write_markdown_file(file_path, frontmatter, body):
    yaml_lines = ["---"]
    for key, val in frontmatter.items():
        # Handle quotes for multiline or containing colons
        if isinstance(val, str) and (':' in val or '"' in val or '\n' in val or ',' in val):
            # Double escape quotes
            escaped_val = val.replace('"', '\\"')
            yaml_lines.append(f'{key}: "{escaped_val}"')
        else:
            yaml_lines.append(f'{key}: {val}')
    yaml_lines.append("---")
    yaml_lines.append("")
    yaml_lines.append(body)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(yaml_lines))

SYSTEM_PROMPT_GENRE_REMASTER = """You are a master music producer and DSP sound engineer specializing in "Suno v5.5 Pro".
Your task is to analyze a music genre's raw metadata and remaster it into a high-quality "Studio-Grade" sound production spec.

You must output a JSON object containing exactly these four keys:
1. "studio_grade_prompt": A dense, professional natural language prompt of 600-750 characters (do not exceed 750 characters). It must follow a 6-layer sequence: [Core Genre & Primary Mood] -> [Vocal Signal & Presence] -> [Detailed Instrumentation & State] -> [Atmosphere & Emotion] -> [Mastering & Mixing Texture] -> [Negative Filters]. Eliminate unnecessary filler words to maximize token density. Important: Append the exact suffix "[High-fidelity studio mastering, professional grade audio]" to the very end. The prompt must remain gender-neutral (use neutral terms like "vocalist" or "expressive vocals", avoiding "male" or "female").
2. "signature_instruments": A comma-separated list of 3-5 iconic instruments/gear (e.g., "Yamaha DX7 synthesizer, Roland TR-808 drum machine").
3. "mixing_textures": A comma-separated list of mixing textures (e.g., "warm tape saturation, retro analog console mixing").
4. "ambient_foley": A single clean sentence of ASMR/Foley environmental elements suitable for the genre's space. It MUST begin with the exact attenuator prefix "layered faintly in the background as a subtle foley texture, featuring " followed by the elements (e.g., "layered faintly in the background as a subtle foley texture, featuring soft rain sounds and quiet vinyl crackle").

Output ONLY the JSON object. Do not include any markdown block ticks (like ```json).
"""

def request_gpt_remaster(api_key, api_url, genre_meta):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    
    user_prompt = f"""Genre Input:
Title: {genre_meta.get('title', 'Unknown')}
BPM: {genre_meta.get('bpm', '120')}
Raw Instruments: {genre_meta.get('instruments', '')}
Vocal Style: {genre_meta.get('vocal_style', '')}
Mood: {genre_meta.get('mood', '')}
Tags: {genre_meta.get('tags', '')}
"""

    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT_GENRE_REMASTER},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "response_format": {"type": "json_object"}
    }
    
    response = requests.post(api_url, headers=headers, json=payload, timeout=45)
    if response.status_code != 200:
        raise Exception(f"HTTP {response.status_code} - {response.text}")
        
    data = response.json()
    content_raw = data['choices'][0]['message']['content'].strip()
    return json.loads(content_raw)

def main():
    dry_run = "--dry" in sys.argv or "-d" in sys.argv
    
    # Load env variables
    env = load_env_local()
    api_key = env.get("OPENAI_API_KEY")
    if not api_key:
        print("❌ 오류: OPENAI_API_KEY가 .env.local에 정의되어 있지 않습니다.")
        sys.exit(1)
        
    api_url = "https://api.openai.com/v1/chat/completions"
    
    # Vault Path Setup
    username = getpass.getuser()
    if username == 'yoonmanro':
        vault_path = "/Users/yoonmanro/Desktop/project/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio"
    else:
        vault_path = "/Users/muse/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio"
        
    anchors_dir = os.path.join(vault_path, "100_Genres & Styles")
    
    if not os.path.exists(anchors_dir):
        print(f"❌ 오류: Obsidian 가이드북 경로가 없습니다: {anchors_dir}")
        sys.exit(1)
        
    md_files = [f for f in os.listdir(anchors_dir) if f.endswith('.md')]
    if not md_files:
        print("❌ 오류: 가이드북 폴더 내에 마크다운 파일이 존재하지 않습니다.")
        sys.exit(1)
        
    # Dry Run Target: acid_house.md
    if dry_run:
        target_file = "acid_house.md" if "acid_house.md" in md_files else md_files[0]
        md_files = [target_file]
        print(f"🧪 [Dry-Run 모드] 테스트 파일 1개만 실행합니다: {target_file}")
    else:
        print(f"🚀 [배포 모드] 총 {len(md_files)}개의 장르 리마스터링을 시작합니다.")
        
    success_count = 0
    
    for idx, md_file in enumerate(md_files):
        file_path = os.path.join(anchors_dir, md_file)
        print(f"[{idx+1}/{len(md_files)}] {md_file} 처리 중...")
        
        try:
            frontmatter, body = parse_markdown_file(file_path)
            
            # API Request
            remaster_data = request_gpt_remaster(api_key, api_url, frontmatter)
            
            # Update frontmatter
            frontmatter["studio_grade_prompt"] = remaster_data.get("studio_grade_prompt", "")
            frontmatter["signature_instruments"] = remaster_data.get("signature_instruments", "")
            frontmatter["mixing_textures"] = remaster_data.get("mixing_textures", "")
            
            # Save ambient_foley as a clean string
            foley_val = remaster_data.get("ambient_foley", "")
            if isinstance(foley_val, list):
                foley_val = ", ".join(foley_val)
            frontmatter["ambient_foley"] = foley_val
            
            # Rewrite back to file
            write_markdown_file(file_path, frontmatter, body)
            
            print(f"✅ {md_file} 리마스터 이식 완료!")
            if dry_run:
                print("\n==== [Dry-Run 결과 출력] ====")
                print(f"• Studio-Grade 프롬프트 (길이 {len(frontmatter['studio_grade_prompt'])}자):")
                print(f"  {frontmatter['studio_grade_prompt']}")
                print(f"• 시그니처 악기군: {frontmatter['signature_instruments']}")
                print(f"• 믹싱 질감: {frontmatter['mixing_textures']}")
                print(f"• ASMR Foley: {frontmatter['ambient_foley']}")
                print("=============================\n")
                
            success_count += 1
            
            # Rate limit guard (Delay)
            if not dry_run:
                time.sleep(1.5)
                
        except Exception as e:
            print(f"❌ {md_file} 처리 중 오류 발생: {e}")
            if dry_run:
                raise e
                
    print(f"🎉 작업 완료! 성공: {success_count}/{len(md_files)}개")

if __name__ == "__main__":
    main()
