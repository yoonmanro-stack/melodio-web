import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  if (fs.existsSync('./.env.local')) {
    const lines = fs.readFileSync('./.env.local', 'utf-8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    });
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const OBSIDIAN_BASE = "/Users/yoonmanro/Desktop/project/SkillsMuse/SkillsMuse-Vault/04_Context/Melodio/500_Suno_v5.5_Master_DB";

// Suno v5.5 Master Database Items categorized for Melodio's 4 Core Modules
const masterDB = [
  // === 1. Style Library v5.5 ===
  {
    category: "style_library",
    menu_target: "Style Library",
    key_name: "v55_lofi_hiphop_rainy",
    title: "Rainy Cafe Lofi Hip-Hop (v5.5 Master)",
    genre: "Lofi Hip-Hop",
    mood: "Chill, Nostalgic, Relaxing",
    suno_v5_5_prompt: "[Hyper-Realistic 24-bit 96kHz, vinyl warm production] [Lofi Hip-Hop & Jazzy Chillhop Hybrid] [dusty vintage SP-404 vinyl crackle, warm rhodes piano chords, muted 808 kick, organic rain foley texture] [intimate dry female whisper lead vocal, relaxed conversational delivery, subtle stereo room reverb]",
    meta_tags_guide: "[Intro: vinyl needle drop, soft rhodes]\n[Verse: conversational, quiet, talk-sung]\n[Chorus: lush layered harmonies, wide stereo panning]\n[Outro: fading rain sound, rhodes decay]",
    description: "Suno v5.5 최적화 비닐 질감 빗소리 로파이 힙합. 아날로그 피아노 텀블링과 포근한 보컬 레어링 극대화."
  },
  {
    category: "style_library",
    menu_target: "Style Library",
    key_name: "v55_synthwave_cyberpunk",
    title: "Midnight Cyberpunk Synthwave (v5.5 Master)",
    genre: "Synthwave / Retrowave",
    mood: "Futuristic, Energetic, Driving",
    suno_v5_5_prompt: "[Hyper-Realistic 24-bit studio mastering, punchy analog dynamics] [80s Synthwave & Modern Cyberpunk Hybrid] [pulsing synthwave arpeggios, side-chained 808 bass, gate-reverb drum snare, glassy neon lead synths] [confident soaring male vocal, dry intimate lead with tape delay, wide backing harmony stack]",
    meta_tags_guide: "[Intro: synth arp fade-in, heavy kick drop]\n[Verse: restrained, rhythmic pulse]\n[Chorus: explosive soaring vocal, full synth chorus]\n[Bridge: guitar solo over synth pad]",
    description: "Suno v5.5 아날로그 신스웨이브 파이프라인. 사이드체인 베이스와 80년대 게이트 리버브 스네어의 입체감 확보."
  },
  {
    category: "style_library",
    menu_target: "Style Library",
    key_name: "v55_acoustic_indie_folk",
    title: "Warm Sunset Acoustic Folk (v5.5 Master)",
    genre: "Indie Folk / Acoustic",
    mood: "Warm, Heartfelt, Emotional",
    suno_v5_5_prompt: "[Hyper-Realistic 24-bit acoustic mastering, pristine organic soundstage] [Indie Folk & Acoustic Singer-Songwriter] [fingerpicked martin acoustic guitar, warm upright bass, gentle brush snare, soft cello pad] [breathy emotional male singer, close-mic vocal clarity, dry intimate spatial positioning]",
    meta_tags_guide: "[Intro: solo fingerpicked guitar]\n[Verse: soft, breathy, storytelling]\n[Chorus: warm cello swelling, dual vocal unison]\n[Outro: slowing tempo, acoustic harmonic finish]",
    description: "Suno v5.5 어쿠스틱 포크 master. 마틴 기타의 아날로그 핑거링과 바짝 붙은 클로즈마이크 보컬 음영 표현."
  },

  // === 2. Audio Forge v5.5 ===
  {
    category: "audio_forge",
    menu_target: "Audio Forge",
    key_name: "v55_kpop_dance_bop",
    title: "High-Energy K-Pop Dance Bop (v5.5 Master)",
    genre: "K-Pop / Dance",
    mood: "Addictive, Upbeat, Powerful",
    suno_v5_5_prompt: "[Hyper-Realistic studio mastering, radio-ready 24-bit 믹싱] [Modern K-Pop Dance & Brass Pop Hybrid] [punchy house kick, brass horn stabs, funky bassline, catchy synth hooks, crisp hi-hats] [charming female idol lead vocal, crisp diction, soaring high notes in chorus, playful ad-lib stabs]",
    meta_tags_guide: "[Intro: siren fx, brass horn stab, chant]\n[Verse: rhythmic rap-singing, fast-paced]\n[Pre-Chorus: vocal build-up, snare roll]\n[Chorus: explosive vocal belting, high-energy hook]\n[Dance Break: heavy synth drop]",
    description: "Suno v5.5 최적화 K-Pop 댄스 곡 포맷. 톡톡 튀는 브라스 탑라인과 훅 섹션의 듀얼 아이돌 보컬 고음 발성 강화."
  },
  {
    category: "audio_forge",
    menu_target: "Audio Forge",
    key_name: "v55_cinematic_epic_trailer",
    title: "Epic Cinematic Orchestral Trailer (v5.5 Master)",
    genre: "Cinematic / Epic",
    mood: "Dramatic, Heroic, Majestic",
    suno_v5_5_prompt: "[Hyper-Realistic 24-bit orchestral mastering, wide 3D soundstage] [Cinematic Epic Trailer & Symphonic Hybrid] [massive taiko drums, brass horn fanfares, staccato string section, sub-bass braam, choir chants] [ethereal opera soprano vocal, powerful chanting choir chorus, reverberant hall depth]",
    meta_tags_guide: "[Intro: low cello drone, subtle piano chime]\n[Build-up: staccato strings accelerating, brass crescendo]\n[Climax: explosive taiko impact, full choir soaring]\n[Outro: single piano note, trailing reverb]",
    description: "Suno v5.5 영화 블록버스터 예고편 트레일러 사운드트랙. 타이고 드럼 펀치감과 오케스트라 3D 서라운드 레이어링."
  },

  // === 3. Viral & Trend Zone v5.5 ===
  {
    category: "viral_trend",
    menu_target: "Viral & Trend Zone",
    key_name: "v55_viral_3sec_hook_challenge",
    title: "3초 후킹 챌린지송 (v5.5 Master)",
    genre: "TikTok Viral Pop / Meme Dance",
    mood: "Addictive, Humorous, Fast-Paced",
    suno_v5_5_prompt: "[Hyper-Realistic 24-bit punchy mastering, bass-boosted punch] [Viral Shortform Meme & Bass House Hybrid] [ultra-fast 808 sub bass drop, funny synth plucks, clapping snare, sharp vocal chops] [hilarious energetic male vocal, fast speech-singing delivery, exaggerated comedic accents, gang vocal shouts]",
    meta_tags_guide: "[Intro: 3초 핵심 팩폭 훅 단축 발성!]\n[Verse: 힙합 랩 스타일 속사포 딜리버리]\n[Chorus: 누구나 따라 부르는 떼창 훅, 댐핑감 폭발]\n[Outro: 코믹 에코 딜레이 파티클]",
    description: "3초 숏폼 릴스/쇼츠 후킹 전용 v5.5 도파민 믹스. 808 킬러 베이스와 초반 3초 팩폭 가창 전달력 극대화."
  },
  {
    category: "viral_trend",
    menu_target: "Viral & Trend Zone",
    key_name: "v55_relationship_psychology_satire",
    title: "남녀 심리 번역기 팩폭송 (v5.5 Master)",
    genre: "Acoustic Comedy Pop",
    mood: "Sarcastic, Witty, Relatable",
    suno_v5_5_prompt: "[Hyper-Realistic 24-bit acoustic mastering] [Witty Comedy Pop & Acoustic Funk Hybrid] [bouncy acoustic bass, cheeky ukulele strum, rimshot snare, brass laughter stabs] [playful sarcastic female vocal, dry intimate close-up delivery, conversational spoken-word interjections]",
    meta_tags_guide: "[Intro: '화 안 났어' 진짜 의미 번역 시작]\n[Verse: 리드미컬 팩폭 대사 딜리버리]\n[Chorus: 반전 멜로디 중독성 훅]\n[Outro: 한숨 섞인 속삭임 멘트]",
    description: "연애심리 공감 릴스 특화 v5.5 팩폭송. 위트있는 우쿨렐레 리듬과 보컬의 리얼한 한숨/말투 어조 살리기."
  },

  // === 4. Japan BGM Forge v5.5 ===
  {
    category: "japan_bgm",
    menu_target: "Japan BGM Forge",
    key_name: "v55_jpop_anime_opening",
    title: "High-Energy Anime Opening OST (v5.5 Master)",
    genre: "J-Pop / Anime OST",
    mood: "Exhilarating, Passionate, Emotional",
    suno_v5_5_prompt: "[Hyper-Realistic 24-bit studio mastering, Japanese J-Rock mixing] [J-Pop & Anime Opening Rock Hybrid] [fast dual electric guitar riff, rapid double-bass drum, melodic slap bass, octaved synth leads] [passionate high-pitched Japanese female vocal, emotional belting, rapid lyric articulation, clear vibrato]",
    meta_tags_guide: "[Intro: twin guitar riff solo, drum roll explosion]\n[Verse: fast Japanese lyric rhythm, driving bass]\n[Pre-Chorus: guitar palm-mute, emotional vocal lift]\n[Chorus: soaring high notes, octave guitar harmonies]\n[Outro: fast guitar solo, abrupt final chord finish]",
    description: "Suno v5.5 최적화 애니메이션 OP OST. 질주감 넘치는 트윈 기타 리프와 고음 여성 J-Pop 보컬 바이브레이션."
  },
  {
    category: "japan_bgm",
    menu_target: "Japan BGM Forge",
    key_name: "v55_tokyo_citypop_vintage",
    title: "80s Tokyo Midnight City Pop (v5.5 Master)",
    genre: "City Pop / Japanese Funk",
    mood: "Sophisticated, Retro, Groovy",
    suno_v5_5_prompt: "[Hyper-Realistic 24-bit vintage analog mastering] [80s Japanese City Pop & Funk Hybrid] [slap bass line, brass horn section, chorus-effect electric guitar, vintage DX7 synth keys, tight funk drums] [smooth sultry Japanese female singer, silky vocal delivery, warm hall reverb, elegant chorus harmonies]",
    meta_tags_guide: "[Intro: slap bass solo, brass horns, tape hiss]\n[Verse: groovy, relaxed city walking vibe]\n[Chorus: romantic, soaring City Pop melody]\n[Outro: saxophone solo fade-out]",
    description: "80년대 도쿄 버블경제 감성의 시티팝 v5.5 규격. DX7 신디사이저와 슬랩 베이스의 그루브 및 그윽한 보컬 연출."
  }
];

async function buildAndSync() {
  console.log("Starting Suno v5.5 Master DB Build & Sync (with Service Role Key)...");

  // 1. Ensure Obsidian Directory exists
  const categories = ["01_Style_Library_v5.5", "02_Audio_Forge_v5.5", "03_Viral_Trend_Zone_v5.5", "04_Japan_BGM_Forge_v5.5"];
  categories.forEach(cat => {
    fs.mkdirSync(path.join(OBSIDIAN_BASE, cat), { recursive: true });
  });

  let syncedCount = 0;

  for (const item of masterDB) {
    let folder = "01_Style_Library_v5.5";
    if (item.category === "audio_forge") folder = "02_Audio_Forge_v5.5";
    if (item.category === "viral_trend") folder = "03_Viral_Trend_Zone_v5.5";
    if (item.category === "japan_bgm") folder = "04_Japan_BGM_Forge_v5.5";

    // 2. Generate Obsidian Markdown Content
    const mdContent = `---
title: "${item.title}"
category: "${item.category}"
menu_target: "${item.menu_target}"
key_name: "${item.key_name}"
genre: "${item.genre}"
mood: "${item.mood}"
version: "Suno v5.5 Master"
updated_at: "${new Date().toISOString()}"
---

# 🎵 ${item.title}

## 📌 개요 및 적용 메뉴
- **타겟 서비스 메뉴**: \`${item.menu_target}\`
- **장르/무드**: ${item.genre} | ${item.mood}
- **설명**: ${item.description}

---

## ⚡ Suno v5.5 4-Layer Master Style Prompt
\`\`\`text
${item.suno_v5_5_prompt}
\`\`\`

---

## 🎤 v5.5 Performance Meta-Tags Guide
\`\`\`text
${item.meta_tags_guide}
\`\`\`

---

## 🛡️ Suno v5.5 Audio Quality Rule Checklist
1. **Engine Layer**: \`[Hyper-Realistic 24-bit 96kHz]\` 브래킷 명시로 노이즈/알티팩트 90% 감쇄.
2. **Texture Layer**: 단순 악기 나열 배제, 아날로그 질감 어휘 사용.
3. **Vocal Panning**: 보컬 센터 모노 & 공간감 리버브 레이어 분리.
`;

    const filePath = path.join(OBSIDIAN_BASE, folder, `${item.key_name}.md`);
    fs.writeFileSync(filePath, mdContent, 'utf-8');
    console.log(`Saved Obsidian Note: ${filePath}`);

    // 3. Upsert into Supabase `curation_playbooks`
    const { data, error } = await supabase
      .from('curation_playbooks')
      .upsert({
        category: item.category,
        key_name: item.key_name,
        title: item.title,
        content: mdContent,
        metadata: {
          suno_v5_5_prompt: item.suno_v5_5_prompt,
          studio_grade_prompt: item.suno_v5_5_prompt, // Override for 1순위 서빙
          suno_tags: item.suno_v5_5_prompt,
          meta_tags_guide: item.meta_tags_guide,
          genre: item.genre,
          mood: item.mood,
          menu_target: item.menu_target,
          version: "v5.5_master"
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'key_name' });

    if (error) {
      console.error(`Supabase Upsert Error for ${item.key_name}:`, error);
    } else {
      syncedCount++;
      console.log(`Synced to Supabase: ${item.key_name}`);
    }
  }

  console.log(`\n🎉 Completed! Total ${syncedCount} Suno v5.5 Master Prompts built in Obsidian & synced to Supabase.`);
}

buildAndSync();
