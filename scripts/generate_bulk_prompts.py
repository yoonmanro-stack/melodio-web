import os
import re
import difflib
import pandas as pd

def parse_markdown_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Simple YAML frontmatter regex parser
    match = re.match(r"^---[^\r\n]*\r?\n([\s\S]*?)\r?\n---[^\r\n]*\r?\n([\s\S]*)$", content)
    if not match:
        return {}, content
    
    yaml_text = match[1]
    body = match[2].trim() if hasattr(yaml_text, 'trim') else match[2].strip()
    
    frontmatter = {}
    for line in yaml_text.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        colon_idx = line.indexOf(':') if hasattr(line, 'indexOf') else line.find(':')
        if colon_idx > -1:
            key = line[:colon_idx].strip()
            val = line[colon_idx+1:].strip()
            if (val.startswith('"') and val.endsWith('"')) or (val.startswith("'") and val.endsWith("'")):
                val = val[1:-1]
            elif (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")) or (val.startswith('"') and val.endswith('"')):
                val = val.strip('"').strip("'")
            frontmatter[key] = val
            
    return frontmatter, body

def extract_negative_prompt(body):
    lines = body.split('\n')
    for i, line in enumerate(lines):
        if '[Negative Prompt Tags]' in line:
            for j in range(i+1, min(i+5, len(lines))):
                candidate = lines[j].strip().strip('*').strip('-').strip().strip('`').strip()
                if candidate and not candidate.startswith('#') and len(candidate) > 10:
                    return candidate
    return "extreme harsh noise, unpolished garage recording"

def find_best_anchor(genre_name, estimated_mood, anchor_keys):
    genre_lower = genre_name.lower().replace('-', ' ').replace('_', ' ')
    
    # 1. Direct manual rule maps
    if 'phonk' in genre_lower:
        if 'drift' in genre_lower:
            return 'drift_phonk'
        return 'house_phonk' if 'house' in genre_lower else 'classic_phonk'
    if 'lofi' in genre_lower or 'lo-fi' in genre_lower or 'lo fi' in genre_lower:
        return 'lofi_hiphop'
    if 'trap' in genre_lower:
        if 'atlanta' in genre_lower:
            return 'atlanta_trap'
        return 'trap_music'
    if 'house' in genre_lower:
        if 'deep' in genre_lower:
            return 'deep_house'
        if 'acid' in genre_lower:
            return 'acid_house'
        if 'bass' in genre_lower:
            return 'bass_house'
        return 'chicago_house'
    if 'jazz' in genre_lower:
        if 'acid' in genre_lower:
            return 'acid_jazz'
        return 'afro_cuban_jazz'
    if 'metal' in genre_lower:
        if 'djent' in genre_lower:
            return 'djent_metal'
        if 'doom' in genre_lower:
            return 'doom_metal'
        return 'industrial_metal'
    if 'folk' in genre_lower:
        if 'indie' in genre_lower:
            return 'indie_folk'
        return 'celtic_folk'
    if 'techno' in genre_lower:
        if 'dark' in genre_lower:
            return 'dark_techno'
        if 'detroit' in genre_lower:
            return 'detroit_techno'
        return 'industrial_techno'
    if 'rnb' in genre_lower or 'r&b' in genre_lower or 'r n b' in genre_lower:
        return 'alternative_rnb'
    if 'reggae' in genre_lower:
        return 'roots_reggae'
    if 'disco' in genre_lower:
        return 'nu_disco'
    if 'synth' in genre_lower:
        return 'synthwave'
    if 'pop' in genre_lower:
        if 'city' in genre_lower:
            return 'city_pop'
        if 'bedroom' in genre_lower:
            return 'bedroom_pop'
        return 'alt_pop'
    if 'trot' in genre_lower:
        return 'trot'
    if 'kpop' in genre_lower or 'k-pop' in genre_lower or 'korean' in genre_lower:
        return 'kpop_dance'
    if 'jpop' in genre_lower or 'j-pop' in genre_lower or 'japanese' in genre_lower:
        return 'jpop_1980s'
        
    # 2. String similarity matching (difflib)
    matches = difflib.get_close_matches(genre_lower, anchor_keys, n=1, cutoff=0.25)
    if matches:
        return matches[0]
        
    # 3. Estimated mood-based default fallback
    mood_fallback = {
        "Hyper/Electronic": "house_phonk",
        "Deep/Acoustic": "indie_folk",
        "Energetic": "trap_music",
        "Atmospheric/Calm": "ambient_drone",
        "Unknown": "ambient_pop"
    }
    return mood_fallback.get(estimated_mood, "ambient_pop")

def main():
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    input_csv = os.path.join(scripts_dir, "global_music_genres.csv")
    output_csv = os.path.join(scripts_dir, "suno_udio_bulk_prompts.csv")
    
    # 205 Anchors path setup
    # Determine vault path dynamically
    import getpass
    username = getpass.getuser()
    if username == 'yoonmanro':
        vault_path = "/Users/yoonmanro/Desktop/project/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio"
    else:
        vault_path = "/Users/muse/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio"
        
    anchors_dir = os.path.join(vault_path, "100_Genres & Styles")
    
    if not os.path.exists(input_csv):
        print(f"❌ 오류: '{input_csv}' 파일이 없습니다. 먼저 scrape_everynoise_genres.py를 실행하십시오.")
        return
        
    if not os.path.exists(anchors_dir):
        print(f"❌ 오류: Obsidian 가이드북 경로가 없습니다: {anchors_dir}")
        return
        
    print("📂 205개 마스터 장르 Obsidian 가이드북 스캔 중...")
    anchor_db = {}
    for md_file in os.listdir(anchors_dir):
        if not md_file.endswith('.md'):
            continue
        file_path = os.path.join(anchors_dir, md_file)
        try:
            frontmatter, body = parse_markdown_file(file_path)
            key_name = frontmatter.get('key_name') or os.path.splitext(md_file)[0]
            title = frontmatter.get('title') or key_name
            
            anchor_db[key_name] = {
                "title": title,
                "bpm": frontmatter.get('bpm', '120'),
                "instruments": frontmatter.get('instruments', ''),
                "vocal_style": frontmatter.get('vocal_style', ''),
                "mood": frontmatter.get('mood', ''),
                "negative_prompt": extract_negative_prompt(body)
            }
        except Exception as e:
            print(f"⚠️ {md_file} 파싱 중 경고: {e}")
            
    print(f"✅ 총 {len(anchor_db)}개의 마스터 앵커 장르 데이터 로드 완료.")
    
    # 중복 검사용 비교 대상 셋 구축 (공백, 하이픈, 언더바 제거 및 소문자 정제)
    anchor_match_names = set()
    for k, v in anchor_db.items():
        k_clean = k.lower().replace('_', '').replace('-', '').replace(' ', '')
        # 타이틀의 한글/슬래시 뒷부분 제거 후 영문 명칭만 순수 추출 및 정제
        title_eng = v["title"].lower().split('/')[0].split('(')[0].strip()
        t_clean = title_eng.replace('_', '').replace('-', '').replace(' ', '')
        anchor_match_names.add(k_clean)
        anchor_match_names.add(t_clean)
        
    df_raw = pd.read_csv(input_csv)
    anchor_keys = list(anchor_db.keys())
    
    bulk_prompts = []
    skipped_count = 0
    
    print("⚙️ Every Noise 장르 맵핑 및 프롬프트 인젝션 진행 중...")
    
    # 에브리노이즈 무드 매핑에 따른 B2B 분류 템플릿
    b2b_concepts = {
        "Hyper/Electronic": "Z세대 트렌디 숏폼 / 액티브 클럽 스페이스 BGM",
        "Deep/Acoustic": "감성 브이로그 / 내추럴 브랜드 쇼룸 / 카페 큐레이션",
        "Energetic": "피트니스 / 활기찬 드라이브 플레이리스트 / 매장 오픈 음악",
        "Atmospheric/Calm": "호텔 라운지 / 스타트업 집중력 향상 / 명상 및 스파 공간",
        "Unknown": "범용 컨셉 컴필레이션 음원"
    }
    
    for _, row in df_raw.iterrows():
        genre = row["genre_name"]
        
        # 1. 중복 검사: 기존 구축된 201개 앵커 장르에 이미 존재하는지 여부 판단
        genre_clean = genre.lower().replace('_', '').replace('-', '').replace(' ', '')
        if genre_clean in anchor_match_names:
            skipped_count += 1
            continue
            
        mood = row["estimated_mood"]
        if pd.isna(mood) or mood not in b2b_concepts:
            mood = "Unknown"
            
        # 2. 앵커 장르 찾기
        best_anchor_key = find_best_anchor(genre, mood, anchor_keys)
        anchor = anchor_db.get(best_anchor_key, {
            "bpm": "120",
            "instruments": "balanced instrumentation, studio mix",
            "negative_prompt": "extreme harsh noise, unpolished recording",
            "title": best_anchor_key
        })
        
        # 2. 프롬프트 인젝팅 (마크다운 기반 리얼 악기 결합)
        bpm_val = anchor["bpm"]
        instruments_val = anchor["instruments"]
        
        # Suno_Style_Prompt 빌드 (소문자 쉼표 결합)
        style_prompt = f"{genre.lower()}, {bpm_val} bpm, {instruments_val}"
        
        # 글자 수 180자 엄격 제한 및 리마스터
        if len(style_prompt) > 180:
            style_prompt = style_prompt[:177] + "..."
            
        bulk_prompts.append({
            "Target_Genre": genre,
            "Mapped_Anchor_Genre": anchor["title"],
            "B2B_Platform_Category": b2b_concepts[mood],
            "Suno_Style_Prompt": style_prompt,
            "Negative_Prompt": anchor["negative_prompt"],
            "Suggested_Album_Title": f"The Sound of {genre} - {b2b_concepts[mood].split(' / ')[0]}"
        })
        
    df_bulk = pd.DataFrame(bulk_prompts)
    df_bulk.to_csv(output_csv, index=False, encoding="utf-8-sig")
    print(f"💾 벌크 프롬프트 데이터 저장 완료: {output_csv} (중복 스킵: {skipped_count}개)")
    
    # 3. Obsidian 적재 자동화
    obsidian_output_dir = os.path.join(vault_path, "400_EveryNoise_Wiki")
    os.makedirs(obsidian_output_dir, exist_ok=True)
    
    print("✍️ Obsidian 5대 마스터 마크다운 카탈로그 적재 시작...")
    
    # A. 마스터 카탈로그 작성
    master_md_path = os.path.join(obsidian_output_dir, "EveryNoise_Master_Catalog.md")
    with open(master_md_path, 'w', encoding='utf-8') as f:
        f.write(f"""# Every Noise at Once 6,000+ 대량 장르 매핑 마스터 카탈로그

* **최종 업데이트**: {pd.Timestamp.now().strftime('%Y-%m-%d')}
* **총 확장 마이크로 장르**: {len(df_bulk)}개 (기존 201개 핵심 장르 중복 필터링 제거 완료)
* **필터링된 중복 앵커 장르 수**: {skipped_count}개
* **구축 목적**: AI 음악 대량 양산 및 B2B 스톡 음악 유통을 위한 마이크로 장르 프롬프트 매핑.

## 📌 무드별 카탈로그 바로가기
* [[Mood_Hyper_Electronic]] - Z세대 트렌디 숏폼 / 액티브 클럽 스페이스 BGM
* [[Mood_Deep_Acoustic]] - 감성 브이로그 / 내추럴 브랜드 쇼룸 / 카페 큐레이션
* [[Mood_Energetic]] - 피트니스 / 활기찬 드라이브 플레이리스트 / 매장 오픈 음악
* [[Mood_Atmospheric_Calm]] - 호텔 라운지 / 스타트업 집중력 향상 / 명상 및 스파 공간

## 📊 앵커 장르 매핑 분포 Top 20
""")
        # Top 20 mapping stats
        stats = df_bulk["Mapped_Anchor_Genre"].value_counts().head(20)
        f.write("\n| 앵커 장르명 | 매핑된 마이크로 장르 수 |\n| :--- | :--- |\n")
        for anc_name, cnt in stats.items():
            f.write(f"| {anc_name} | {cnt}개 |\n")
            
    # B. 무드별 개별 마크다운 파일 작성
    for mood_tag, concept in b2b_concepts.items():
        safe_mood_name = mood_tag.replace('/', '_')
        mood_md_path = os.path.join(obsidian_output_dir, f"Mood_{safe_mood_name}.md")
        
        df_mood = df_bulk[df_bulk["B2B_Platform_Category"] == concept]
        
        with open(mood_md_path, 'w', encoding='utf-8') as f:
            f.write(f"""# {mood_tag} 대량 프롬프트 시트

* **B2B 카테고리**: {concept}
* **수록 장르 수**: {len(df_mood)}개

---

| 장르명 | 매핑된 앵커 장르 | Suno 최적화 Style 프롬프트 |
| :--- | :--- | :--- |
""")
            # Write rows (limit to 1000 for markdown rendering performance inside Obsidian)
            for idx, row in df_mood.head(1000).iterrows():
                f.write(f"| {row['Target_Genre']} | {row['Mapped_Anchor_Genre']} | `{row['Suno_Style_Prompt']}` |\n")
                
            if len(df_mood) > 1000:
                f.write(f"\n*이외 {len(df_mood) - 1000}개의 장르는 로컬 csv 데이터셋(suno_udio_bulk_prompts.csv)을 참조해 주십시오.*\n")
                
    print(f"🎉 Obsidian 적재 완료! 경로: {obsidian_output_dir}")

if __name__ == "__main__":
    main()
