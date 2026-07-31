"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Search, Copy, Check, BookmarkPlus, Music2, Zap, Waves, Mic2, Guitar, Drum, Play, Pause, FileText, SkipBack, SkipForward, Shuffle, Repeat, Sparkles, Trash2, Pencil, Heart, X, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, Volume2, VolumeX, Lock, Link, Plus, Sliders } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import PromptBuilder from "@/components/prompt-builder/PromptBuilder";
import PublicTrackGrid from "@/components/prompt-builder/PublicTrackGrid";
import { registerActiveAudio } from "@/lib/globalAudio";
import { categories } from "@/data/categories";
import { MASTER_NICHE_SEEDS } from "@/data/nicheMasterSeeds";

function formatTime(sec: number): string {
  if (isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const TOP_100_GENRES = [
  "All",
  "Pop", "K-Pop", "Hip Hop", "Trap", "R&B / Soul", "Lo-Fi", "J-Pop", "City Pop", "Joseon Hip Hop", "Trot",
  "EDM", "House", "Deep House", "Synthwave", "Vaporwave", "Phonk", "Hyperpop", "Bedroom Pop", "Drill", "Afrobeats",
  "Amapiano", "Latin", "Reggaeton", "Trap Latino", "Rock", "Alternative Rock", "Indie Rock", "Indie Pop", "Shoegaze", "Dream Pop",
  "Post-Punk", "Grunge", "Punk", "Emo / Pop Punk", "Heavy Metal", "Thrash Metal", "Hard Rock", "Progressive Rock", "Psychedelic Rock", "Future Bass",
  "Drum & Bass", "Dubstep", "Techno", "Trance", "Eurodance", "Disco", "Funk", "Chillhop", "Neo Soul", "Contemporary R&B",
  "Jazz", "Smooth Jazz", "Bossa Nova", "Blues", "Folk / Acoustic", "Cinematic", "Ambient", "New Age", "Meditation", "Gospel / Worship",
  "Country", "Bluegrass", "Americana", "Reggae", "Dancehall", "Celtic", "World / Ethnic", "Salsa", "Bachata", "Merengue",
  "Tango", "Flamenco", "Samba", "Boom Bap", "Melodic Rap", "Cloud Rap", "Rage", "Pluggnb", "Afro House", "Tech House",
  "Hardstyle", "UK Garage", "Grime", "Electropop", "Synthpop", "Chanson", "Enka", "Gamelan", "Traditional Chinese", "Highlife",
  "Soca", "Qawwali", "Klezmer", "Corrido", "Ska", "Math Rock", "Stoner Rock", "Darkwave", "Industrial Metal", "Mallsoft"
];

const TOP_200_GENRES = [
  ...TOP_100_GENRES,
  "Minimal Techno", "Psytrance", "Bebop", "Gypsy Jazz", "Hardcore Punk", "Post-Metal", "Dungeon Synth", "Chiptune", "Vapor Trap", "Future Funk",
  "Tropical House", "Melodic Techno", "Bass House", "Speed Garage", "Nightcore", "Nu-Metal", "Symphonic Metal", "Folk Metal", "Death Metal", "Black Metal",
  "Melodic Death Metal", "Metalcore", "Deathcore", "Post-Hardcore", "Screamo", "Noise Rock", "No Wave", "Art Rock", "Glam Rock", "Ska Punk",
  "Space Rock", "Krautrock", "Southern Rock", "Heartland Rock", "Soft Rock", "Yacht Rock", "Boogie", "Italo Disco", "Electro Funk", "Acid House",
  "Acid Jazz", "Trip Hop", "Illbient", "Glitch Hop", "Neurofunk", "Liquid DnB", "Breakcore", "Gabber", "Breakbeat", "Big Beat",
  "Dub", "Roots Reggae", "Lo-Fi House", "Slap House", "Bounce", "Baltimore Club", "Jersey Club", "Footwork", "Juke", "Baile Funk",
  "Kuduro", "Coupe Decale", "Kizomba", "Zouk", "Bachata Sensual", "Son Cubano", "Cumbia", "Reggaeton Lento", "Vallenato", "Ranchera",
  "Mariachi", "Norteño", "Huapango", "Banda", "Tejano", "Bolero", "Fado", "Rebetiko", "Soukous", "Mbalax",
  "Jùjú", "Apala", "Benga", "Taarab", "Gqom", "Singeli", "Kwaito", "K-R&B", "K-Indie", "J-Rock",
  "J-Hip Hop", "Visual Kei", "City Pop Retro", "Shibuya-kei", "J-Metal", "Mandopop", "Cantopop", "T-Pop", "V-Pop", "Indo-Pop"
];

// ─── Vocal Gender Conflict Filter ───
function isVocalGenderTag(tag: string): boolean {
  if (!tag) return false;
  const l = tag.toLowerCase().trim();
  return (
    l.includes('female vocal') ||
    l.includes('male vocal') ||
    l.includes('male rapper') ||
    l.includes('female rapper') ||
    l.includes('female singer') ||
    l.includes('male singer') ||
    l.includes('diva') ||
    l.includes('duet') ||
    l.includes('baritone') ||
    l.includes('falsetto') ||
    l.includes('whisper vocal') ||
    l.includes('passionate male') ||
    l.includes('powerful female') ||
    l.includes('soft, gentle female') ||
    l.includes('bright female') ||
    l.includes('smooth male') ||
    l.includes('혼성 보컬')
  );
}

// ─── Deduplicated Prompt Compiler Helper ───
function compileStylePrompt(genreName: string, tags: string[]): string {
  const resultTags: string[] = [];
  const lowerSeen = new Set<string>();

  if (genreName && genreName !== 'All') {
    const cleanGenre = genreName.trim();
    resultTags.push(cleanGenre);
    lowerSeen.add(cleanGenre.toLowerCase());
  }

  for (const t of tags) {
    if (!t) continue;
    const cleanTag = t.trim();
    const lower = cleanTag.toLowerCase();

    // Skip vocal gender conflict tags
    if (isVocalGenderTag(cleanTag)) {
      continue;
    }

    // Deduplicate case-insensitively & prevent genre name repetition
    if (lowerSeen.has(lower)) {
      continue;
    }

    lowerSeen.add(lower);
    resultTags.push(cleanTag);
  }

  return resultTags.join(', ');
}

// ─── Obsidian Music Wiki / Suno v5.5 DB 장르 태그 풍성한 오토매칭 헬퍼 ───
function getAutoMatchedTagsForGenre(genre: string): string[] {
  if (!genre || genre === 'All') return [];
  const g = genre.toLowerCase().trim();

  if (g.includes('joseon') || g.includes('gugak') || g.includes('조선') || g.includes('국악') || g.includes('chosun')) {
    return [
      'Gugak Fusion Beat',
      'Traditional Korean Instruments',
      'Gayageum Pluck',
      'Daegeum Flute',
      'Heavy Boom Bap Rhythm',
      'Epic Brass Stabs',
      'East Asian Pentatonic Scale',
      '85-102 BPM',
      'High Energy',
      'Studio Quality'
    ];
  }

  if (g.includes('k-pop') || g.includes('kpop')) {
    return [
      'Catchy Synth Melody',
      'Brass Horn Section',
      'Punchy 808 Bass',
      'Driving Dance Beats',
      '115-125 BPM, Moderately Fast',
      'Studio Quality, Clean Mix',
      'Polished Production',
      'YouTube Playlist BGM, High CTR Sound'
    ];
  }

  if (g.includes('city pop') || g.includes('j-pop') || g.includes('jpop') || g.includes('shibuya')) {
    return [
      '1980s Retro Synth',
      'Rhodes Electric Piano',
      'Funky Guitar Chords',
      'Brass Horn Section',
      'Walking Bassline',
      '115-125 BPM, Moderately Fast',
      'Vintage Analog Sound',
      'Driving Music, Road Trip'
    ];
  }

  if (g.includes('lo-fi') || g.includes('lofi') || g.includes('chillhop')) {
    return [
      'Warm Rhodes Piano',
      'Soft Jazz Chords',
      'Laid-Back Beats',
      '70-85 BPM, Slow',
      'Lo-Fi Mix, Warm Analog',
      'Tape Hiss, Vinyl Crackle',
      'Nighttime, Late Night Vibes',
      'Study BGM, Focus Music'
    ];
  }

  if (g.includes('synthwave') || g.includes('cyberpunk') || g.includes('vaporwave') || g.includes('retrowave')) {
    return [
      '1980s Retro Synth',
      'Arpeggiated Analog Synth',
      'Gated Reverb Drums',
      'Pumping Synth Bass',
      '115-125 BPM, Moderately Fast',
      'Spatial Audio, Immersive',
      'Neon Retro Aesthetic',
      'Driving Music, Road Trip'
    ];
  }

  if (g.includes('trot')) {
    return [
      'Traditional Trot Brass Section',
      'Accordion Chords',
      'Rhythmic Percussion Pulse',
      'Bright Synth Lead',
      '115-125 BPM, Moderately Fast',
      'Live Recording, Concert Feel',
      'Energetic Festival Vibe',
      'Studio Quality, Clean Mix'
    ];
  }

  if (g.includes('edm') || g.includes('house') || g.includes('techno') || g.includes('future bass') || g.includes('dubstep') || g.includes('hardstyle')) {
    return [
      'Four-on-the-Floor Beat',
      'Synthesizer Lead',
      'Heavy Sub Bass',
      'Pumping Compression',
      'High Energy Build-up & Drop',
      '124-128 BPM, Fast',
      'Spatial Audio, Immersive',
      'Club Mix, Festival Sound'
    ];
  }

  if (g.includes('hip hop') || g.includes('hip-hop') || g.includes('trap') || g.includes('boom bap') || g.includes('drill') || g.includes('phonk') || g.includes('rap')) {
    return [
      'Heavy 808 Sub Bass',
      'Crisp Hi-Hat Rolls',
      'Hard Snare Hit',
      'Dark Melodic Synth',
      '90-110 BPM, Moderate',
      'Bass Boosted, Heavy Bass',
      'Street Energy, Club Production',
      'Studio Quality, Clean Mix'
    ];
  }

  if (g.includes('rock') || g.includes('metal') || g.includes('punk') || g.includes('grunge')) {
    return [
      'Overdriven Electric Guitars',
      'Driving Bass Guitar',
      'Acoustic Drum Kit',
      'Passionate, Intense Energy',
      '125-145 BPM, Fast',
      'Raw Live Sound, Distorted Guitars',
      'Punchy Rock Mix',
      'High Energy'
    ];
  }

  if (g.includes('r&b') || g.includes('soul') || g.includes('rnb')) {
    return [
      'Smooth Electric Piano',
      'Warm Bassline',
      'Soulful Rhythm Section',
      'Groovy Percussion',
      '85-105 BPM, Moderate',
      'Warm Analog Sound',
      'Clean Mix, Polished',
      'Late Night Vibes'
    ];
  }

  if (g.includes('jazz') || g.includes('bossa nova') || g.includes('blues')) {
    return [
      'Acoustic Upright Bass',
      'Grand Piano Chords',
      'Brushed Drum Kit',
      'Smooth Saxophone Accent',
      'Groovy, Funky Rhythm',
      '90-110 BPM, Moderate',
      'Live Recording, Concert Feel',
      'Café Music, Coffee Shop Vibes'
    ];
  }

  if (g.includes('cinematic') || g.includes('ambient') || g.includes('epic') || g.includes('meditation') || g.includes('new age')) {
    return [
      'Cinematic, Epic Orchestra',
      'Strings Ensemble (Violin, Cello)',
      'Ethereal Synth Pads',
      'Spatial Audio, Immersive',
      'Wide Dynamic Range',
      'Dramatic Build-up',
      'Cinematic Trailer Music',
      'Studio Quality, Clean Mix'
    ];
  }

  if (g.includes('folk') || g.includes('acoustic') || g.includes('country') || g.includes('bluegrass')) {
    return [
      'Acoustic Guitar Fingerpicking',
      'Warm Acoustic Bass',
      'Banjo & Fiddle Accents',
      'Calm, Serene Atmosphere',
      '90-110 BPM, Moderate',
      'Organic Natural Sound',
      'Café Music, Coffee Shop Vibes',
      'Clean Mix, Polished'
    ];
  }

  if (g.includes('latin') || g.includes('reggaeton') || g.includes('salsa') || g.includes('afrobeats') || g.includes('amapiano')) {
    return [
      'Rhythmic Dembow Beat',
      '808 Bass Line',
      'Acoustic Guitar Riffs',
      'Upbeat Percussion',
      '95-115 BPM, Moderately Fast',
      'Bright, Upbeat Energy',
      'Party, Festive Vibe',
      'Studio Quality, Clean Mix'
    ];
  }

  return [
    'Rhythmic Percussion',
    'Melodic Instrumentals',
    'Upbeat Rhythm',
    '105-120 BPM, Moderate',
    'Studio Quality, Clean Mix',
    'High Fidelity, Hyper-Realistic',
    'Polished Production',
    'YouTube Playlist BGM, Immersive Audio'
  ];
}

// ─── 6대 채널 컨셉 & Obsidian/YouTube 검증 120+ 틈새 시드 DB ───
export interface NicheTag {
  label: string;
  value: string;
}

export interface ChannelConcept {
  id: string;
  title: string;
  icon: string;
  desc: string;
  nicheSeeds: NicheTag[];
}

export const CHANNEL_CONCEPTS: ChannelConcept[] = [
  {
    id: 'healing',
    title: '마음의 위로 & 힐링',
    icon: '💆‍♂️',
    desc: '수면, 스트레스 해소, ASMR, 앰비언트',
    nicheSeeds: [
      { label: '🔥 [2026 핫트렌드] 3.4M+ 릴랙싱 딥 마인드 수면', value: '2026 Ultimate Mind Relaxing Lofi, Deep Healing' },
      { label: '🔥 [2026 핫트렌드] 스트레스 영점 리셋 뇌파 세션', value: 'Stress Zero Reset Sleep Music, Brainwave Calm' },
      { label: '불면증 극복 3.2Hz Delta 파도 소리', value: '3.2Hz Delta Wave Ocean Lullaby' },
      { label: 'NASA 최첨단 6시간 생체에너지 회복', value: 'NASA Bio-Energy Recovery 6h Sleep' },
      { label: '432Hz+528Hz 솔페지오 전신 회복', value: '432Hz 528Hz Solfeggio Body Healing' },
      { label: '새벽 빗소리 & 숲속 오두막 힐링', value: 'Midnight Rain & Cabin Fireplace Ambience' },
      { label: '지친 마음 정돈 10분 뇌파 명상', value: 'Mindful Meditation & Brainwave Calm' },
      { label: '스트레스 해소 뇌파 백색소음 ASMR', value: 'Brainwave ASMR & White Noise Relief' },
      { label: '우울할 때 듣는 새벽 혼술 피아노', value: 'Late Night Solo Drink Sad Piano' },
      { label: '따스한 햇살 아래 무조건적인 위로', value: 'Warm Sunshine Comfort & Solace' },
      { label: '눈물 쏟아내고 싶을 때 감성 앰비언트', value: 'Emotional Catharsis Ambient Tears' },
      { label: '불안감 온전히 지우는 딥 앰비언스', value: 'Deep Anxiety Relief Space Ambient' },
      { label: '혼자만의 고요한 이끼 정원', value: 'Moss Garden Quiet Serenity' },
      { label: '파도 소리와 함께 3초 만에 잠드는 밤', value: 'Instant Sleep 3-Sec Ocean Waves' },
      { label: '마음의 상처 치유 잔잔한 피아노', value: 'Emotional Healing Soft Piano' },
      { label: '지친 퇴근길 조용한 토닥임', value: 'Quiet Commute Night Comfort' },
      { label: '새벽 4시 불면증 극복 자장가', value: '4AM Dawn Insomnia Lullaby' },
      { label: '자율신경계 이완 힐링 세레나데', value: 'Autonomic Nervous System Relaxing Serenade' },
      { label: '비 내리는 유리창가 풀벌레 소리', value: 'Window Rain & Cricket Chirps' },
      { label: '지브리 감성 밤하늘 수면 오르골', value: 'Ghibli Night Sky Sleep Music Box' },
      { label: '아침 햇살 맑은 에너지 리셋', value: 'Morning Energy Reset Sunshine' },
      { label: '깊은 삼림욕 숲속 소리 명상', value: 'Deep Forest Soundscape Meditation' }
    ]
  },
  {
    id: 'focus',
    title: '몰입 & 생산성',
    icon: '✏️',
    desc: '코딩, 시험공부, 밤샘, 독서',
    nicheSeeds: [
      { label: '🔥 [2026 핫트렌드] 3.4M+ 마인드 릴랙스 딥 포커스', value: '2026 Ultimate Mind Relaxing Study Beats' },
      { label: '🔥 [2026 핫트렌드] 2.0M+ 도파민 리셋 시타르 명상', value: 'Sitar Dopamine Reset Indian Classical Focus' },
      { label: '🔥 [2026 핫트렌드] 2.6M+ 심야 몰입 딥 체인 로파이', value: '2026 Mind Relaxing Lofi Beats Vol 30' },
      { label: '개발자 새벽 3시 디버깅 & 코딩 BGM', value: 'Developer Debugging BGM, 3AM Focus' },
      { label: '시험기간 초집중 벼락치기 알파파', value: 'Alpha Wave Cramming Focus Sprint' },
      { label: '노동요 신나는 업비트 업무 팝', value: 'Upbeat Workday Labor Song Beats' },
      { label: '심야 독서실 몰입 아날로그 BGM', value: 'Late Night Study Room Analog BGM' },
      { label: '디자이너 창의력 뇌절 방지 스파크', value: 'Creative Designer Brain Spark' },
      { label: '주식 전업투자자 초집중 멘탈 케어', value: 'Day Trader Concentration Care' },
      { label: '스타벅스 창가 자리 노트북 몰입', value: 'Starbucks Window Side Laptop Focus' },
      { label: '해커톤 24시간 도파민 스퍼트', value: '24H Hackathon Sprint Motivation' },
      { label: '포모도로 25분 집약 몰입 타임', value: 'Pomodoro 25Min Intense Focus' },
      { label: '우주 비행사의 데이터 분석 앰비언트', value: 'Space Analyst Cosmic Focus' },
      { label: '벼락치기 새벽 2시 공부 로파이', value: '2 A.M Study Session Lofi Beats' },
      { label: '집중력 최고조 알파파 뇌파 유도', value: 'Alpha Brainwave Peak Concentration' },
      { label: '도서관 밤샘 시험공부 백색소음', value: 'Library Overnight Study White Noise' },
      { label: 'IT 스타트업 기획안 작성 노동요', value: 'Tech Startup Strategy Writing Beats' },
      { label: '공시생 10시간 전소 초집중', value: '10-Hour Exam Focus Concentration' },
      { label: '논문 작성용 가사 없는 인스트루멘털', value: 'Academic Paper Writing Instrumental' },
      { label: '새벽 몰입 딥 하우스 포커스', value: 'Dawn Deep House Work Rhythm' },
      { label: '카페 소음 x 초집중 재즈 로파이', value: 'Coffee Shop Ambience Focus Jazz' },
      { label: '아이디어 폭발 브레인스토밍', value: 'Idea Explosion Brainstorming Beats' },
      { label: '코딩 작업용 시티팝 서브 비트', value: 'Coding Sub-Beats City Pop Rhythm' }
    ]
  },
  {
    id: 'retro',
    title: '아날로그 & 향수',
    icon: '📻',
    desc: '시티팝, LP 바이닐, Y2K, 8-Bit 레트로',
    nicheSeeds: [
      { label: '🔥 [2026 핫트렌드] 2.3M+ 80s 소프트 록 러브 발라드', value: '80s Soft Rock Ballads Classic Love Songs' },
      { label: '🔥 [2026 핫트렌드] 1.8M+ 네온 신스웨이브 시티 나이트', value: 'Neon Synthwave 80s City Night Drive' },
      { label: '80년대 도쿄 심야 시티팝 감성', value: '1980s Tokyo Midnight City Pop' },
      { label: '70년대 LP 레코드 비닐 바 바이닐', value: '1970s Vinyl Record Bar Warmth' },
      { label: '90년대 Y2K 미니홈피 도토리 추억', value: '90s Y2K Cyworld Nostalgia' },
      { label: '8-Bit 픽셀 아케이드 게임 추억', value: '8-Bit Pixel Arcade Retro Games' },
      { label: '비디오 테이프 지직이는 밤 VHS', value: 'VHS Cassette Tape Crackle Warmth' },
      { label: '응답하라 아날로그 라디오 올드팝', value: 'Analog Radio Oldies Classic Pop' },
      { label: '골목길 레트로 다방 LP 클래식', value: 'Retro Alleyway Coffee House LP' },
      { label: '90년대 감성 얼터너티브 록', value: '90s Alternative Rock Nostalgia' },
      { label: '80년대 네온 디스코 디스코 파티', value: '80s Neon Disco Funk Night' },
      { label: '카세트 워크맨 찌르르한 테이프', value: 'Walkman Cassette Tape Nostalgia' },
      { label: '비닐 턴테이블 잡음 감성 재즈', value: 'Turntable Crackle Vintage Jazz' },
      { label: '70년대 소울 펑크 올드스쿨', value: '70s Soul Funk Old School' },
      { label: '80년대 헐리우드 하이틴 팝', value: '80s Hollywood Teen Pop Nostalgia' },
      { label: '흑백 영화 속 클래식 오케스트라', value: 'Black & White Cinema Orchestra' },
      { label: '7080 포크 기타 대학가요제', value: '70s-80s Folk Guitar Festival' },
      { label: 'Y2K 감성 댄스 가요 비트', value: 'Y2K Dance K-Pop Retro Beat' },
      { label: '아날로그 신스웨이브 네온 펄스', value: 'Retro Synthwave Neon Pulse' },
      { label: '추억의 레트로 게임보이 OST', value: 'Retro GameBoy Nostaltic Chiptune' },
      { label: '80년대 디스코 다방 댄스', value: '80s Disco Club Dance Hits' },
      { label: '빈티지 라디오 노이즈 올드재즈', value: 'Vintage Radio Noise Old Jazz' }
    ]
  },
  {
    id: 'cafe',
    title: '카페 & 오프라인 공간',
    icon: '☕',
    desc: '성수동 카페, 비 오는 창가, LP 바',
    nicheSeeds: [
      { label: '🔥 [2026 핫트렌드] 1.5M+ 스무스 파리 테라스 재즈', value: 'Cozy Terrace Smooth Paris Jazz Cafe BGM' },
      { label: '🔥 [2026 핫트렌드] 1.2M+ 햇살 보사노바 브런치 재즈', value: 'Sunny Afternoon Bossa Nova Brunch Jazz' },
      { label: '성수동 루프탑 카페 감성 BGM', value: 'Seongsu Rooftop Café Vibes' },
      { label: '비 오는 날 유리창 창가 카페', value: 'Rainy Day Window Glass Café' },
      { label: '햇살 좋은 주말 브런치 카페', value: 'Sunny Weekend Brunch Café' },
      { label: '아늑한 골목길 LP 라이브러리', value: 'Cozy Alley Vinyl Library Café' },
      { label: '도쿄 파티세리 디저트 카페', value: 'Tokyo Patisserie Dessert BGM' },
      { label: '파리 샹젤리제 테라스 샹송', value: 'Parisian Terrace Café Chanson' },
      { label: '조용한 북카페 책장 넘기는 소리', value: 'Quiet Book Cafe Ambience' },
      { label: '호텔 라운지 럭셔리 스무스 재즈', value: 'Luxury Hotel Lounge Smooth Jazz' },
      { label: '심야 빈티지 오디오 와인 바', value: 'Late Night Vintage Audio Wine Bar' },
      { label: '아침 모닝 카페 첫 스피커 울림', value: 'Morning Café First Speaker Jazz' },
      { label: '한옥 카페 고즈넉한 가야금 퓨전', value: 'Hanok Café Traditional Fusion' },
      { label: '재즈 클럽 삼중주 라이브 섹션', value: 'Live Jazz Club Trio Session' },
      { label: '뉴욕 소호 베이커리 브런치', value: 'Soho New York Bakery Brunch' },
      { label: '여유로운 일요일 보사노바 카페', value: 'Lazy Sunday Bossa Nova Café' },
      { label: '베를린 카페 미니멀 로파이', value: 'Berlin Café Minimal Lofi' },
      { label: '런던 코번트가든 애프터눈 티', value: 'London Covent Garden Afternoon Tea' },
      { label: '바다가 보이는 제주 해안 카페', value: 'Jeju Oceanview Coastal Cafe' },
      { label: '밤 카페 은은한 무드등 재즈', value: 'Night Cafe Subtle Mood Light Jazz' },
      { label: '재즈 피아노 & 우드 스피커 울림', value: 'Jazz Piano & Wood Speaker Resonance' },
      { label: '비 오는 날 야외 테라스 보사노바', value: 'Rainy Terrace Bossa Nova Café' }
    ]
  },
  {
    id: 'drive',
    title: '드라이브 & 감성 여행',
    icon: '🚗',
    desc: '노을 드라이브, 해안도로, 심야 야경',
    nicheSeeds: [
      { label: '🔥 [2026 핫트렌드] 1.1M+ 네온 시티 라이트 로파이', value: 'Night Drive City Lights Lofi Sunset BGM' },
      { label: '🔥 [2026 핫트렌드] 85만+ 해안도로 로드트립 팝', value: 'Late Night Coastal Highway Sunset Drive' },
      { label: '심야 고속도로 노을 드라이브', value: 'Sunset Highway Night Drive' },
      { label: '해변 해안도로 로드트립 팝', value: 'Coastal Highway Road Trip Pop' },
      { label: '도시 야경 네온 드라이브', value: 'City Nightlights Neon Drive' },
      { label: '제주도 삼나무 숲길 드라이브', value: 'Jeju Forest Road Chill Drive' },
      { label: '새벽 비 내리는 강변북로 감성', value: 'Rainy Midnight River Drive' },
      { label: '비행기 창가 구름 구경 앰비언스', value: 'Airplane Window Cloud Cruise' },
      { label: '캠핑장 밤하늘 은하수 모닥불', value: 'Campsite Starlight Campfire' },
      { label: '오픈카 가을 바람 시티 팝', value: 'Open-Top Convertible Breezy Pop' },
      { label: '비 오는 밤 차 안 주차장 감성', value: 'Rainy Car Cabin Parking Lot Chill' },
      { label: '야간 고속도로 달리는 신스웨이브', value: 'Late Night Highway Synthwave Drive' },
      { label: '도쿄 심야 한강 드라이브', value: 'Midnight River Sunset Drive' },
      { label: '캘리포니아 붉은 노을 칠팝', value: 'California Crimson Sunset Chill' },
      { label: '해질녘 카브리올레 감성 드라이브', value: 'Sunset Cabriolet Emotional Drive' },
      { label: '캠핑 트레일러 별빛 밤하늘', value: 'Camping Trailer Starlight Sky' },
      { label: '눈 내리는 겨울 산길 드라이브', value: 'Snowy Winter Mountain Pass Drive' },
      { label: '유럽 배낭여행 기차 창가', value: 'European Train Window Travel' },
      { label: '가을 단풍길 힐링 드라이브', value: 'Autumn Foliage Road Trip Acoustic' },
      { label: '새벽 고속도로 비트 드라이브', value: 'Dawn Highway Upbeat Rhythm' },
      { label: '오키나와 에메랄드 해변 드라이브', value: 'Okinawa Beachfront Breeze Drive' },
      { label: '야간 네온 사인 오토바이 라이딩', value: 'Night Neon Motorcycle Cruise' }
    ]
  },
  {
    id: 'story',
    title: '서사 & 시네마틱 스토리',
    icon: '🎬',
    desc: '웹툰/웹소설, 판타지, 애니 OST, 게임',
    nicheSeeds: [
      { label: '🔥 [2026 핫트렌드] 1.4M+ 에픽 시네마틱 판타지 OST', value: 'Epic Cinematic Fantasy Orchestral OST BGM' },
      { label: '🔥 [2026 핫트렌드] 90만+ 다크 판타지 보스전 오케스트라', value: 'Dark Fantasy Boss Battle Epic Orchestral OST' },
      { label: '웹툰/웹소설 몰입 오리지널 OST', value: 'Webtoon & Web Novel Immersive OST' },
      { label: '다크 판타지 웅장한 대서사시', value: 'Dark Fantasy Epic Orchestral War' },
      { label: '애니메이션 감동 클라이맥스 OST', value: 'Anime Emotional Climax Piano OST' },
      { label: '게임 보스 몬스터 최종전 웅장함', value: 'Game Boss Battle Epic Orchestra' },
      { label: 'SF 우주 탐사선 은하계 모험', value: 'Sci-Fi Space Odyssey Galactic BGM' },
      { label: '사극 드라마 비운의 궁중 서사', value: 'Historical Drama Tragic Palace Ballad' },
      { label: '스릴러 추리 미스터리 긴장감', value: 'Mystery Thriller Suspense Tension' },
      { label: '사이버펑크 미래 도시 네온 전쟁', value: 'Cyberpunk Future City Neon War' },
      { label: '던전 탐험 모험가 길드 선술집', value: 'Adventurer Guild Tavern BGM' },
      { label: '히어로 등장 트레일러 오케스트라', value: 'Superhero Entrance Cinematic Trailer' },
      { label: '세계관 최강자 각성 BGM', value: 'Awakening of the Overlord OST' },
      { label: '운명적인 이별 슬픈 바이올린', value: 'Tragic Separation Sad Violin OST' },
      { label: '해적선 대항해시대 모험', value: 'Pirate Ship High Seas Adventure' },
      { label: '마법 학교 인챈트 오케스트라', value: 'Magic Academy Enchanted Orchestra' },
      { label: '아포칼립스 생존자 절망의 잔향', value: 'Post-Apocalyptic Survivor Echoes' },
      { label: '조선 궁중 무협 무술 대결', value: 'Joseon Martial Arts Duel OST' },
      { label: '스페이스 오페라 우주함대 전투', value: 'Space Opera Starfleet Battle OST' },
      { label: '마지막 이별 기차역 눈물', value: 'Final Train Station Goodbye Tear OST' },
      { label: '마왕성 침투 기사단 전진', value: 'Knights Marching to Demon Castle' },
      { label: '환상적인 요정의 숲 탐험', value: 'Enchanted Fairy Forest Exploration' }
    ]
  }
];

export default function AudioForgeProPage() {
  const router = useRouter();

  // ─── 12-Category Parameter Cockpit States ───
  const [activeGenreTab, setActiveGenreTab] = useState<'top100' | 'top200'>('top100');
  const [activeGenre, setActiveGenre] = useState<string>('All');
  const [selectedProTags, setSelectedProTags] = useState<string[]>([]);
  const [appliedFlash, setAppliedFlash] = useState<boolean>(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState<boolean>(false);

  // ─── AI Niche Random Shuffler States ───
  const [selectedConceptId, setSelectedConceptId] = useState<string>('healing');
  const [nicheSeeds, setNicheSeeds] = useState<NicheTag[]>([]);
  const [isShuffling, setIsShuffling] = useState<boolean>(false);
  const [customNicheInput, setCustomNicheInput] = useState<string>('');

  const getRandomNicheChips = useCallback((conceptId: string) => {
    const masterPool = MASTER_NICHE_SEEDS[conceptId] || [];
    const fallbackConcept = CHANNEL_CONCEPTS.find((c) => c.id === conceptId);
    const fallbackPool = fallbackConcept ? fallbackConcept.nicheSeeds : [];
    const pool = masterPool.length > 0 ? masterPool : fallbackPool;
    if (!pool || pool.length === 0) return [];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 5);
  }, []);

  useEffect(() => {
    setNicheSeeds(getRandomNicheChips(selectedConceptId));
  }, [selectedConceptId, getRandomNicheChips]);

  const handleShuffleNiche = () => {
    setIsShuffling(true);
    setTimeout(() => {
      setNicheSeeds(getRandomNicheChips(selectedConceptId));
      setIsShuffling(false);
    }, 200);
  };

  const handleAddCustomNiche = () => {
    if (!customNicheInput.trim()) return;
    const val = customNicheInput.trim();
    if (!selectedProTags.includes(val)) {
      const nextTags = [...selectedProTags, val];
      setSelectedProTags(nextTags);
      const compiled = compileStylePrompt(activeGenre, nextTags);
      setStylePrompt(compiled);
    }
    setCustomNicheInput('');
  };

  // ─── Compiled Style Prompt (Right Generation Cockpit Sync) ───
  const [stylePrompt, setStylePrompt] = useState<string>('');

  // Audio Player
  const [playingId, setPlayingId] = useState<number | string | null>(null);
  const [activeTrackObject, setActiveTrackObject] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const themeCategory = useMemo(() => categories.find((c) => c.id === 'theme'), []);
  const otherCategories = useMemo(() => categories.filter((c) => c.id !== 'theme'), []);

  const displayedGenres = useMemo(() => {
    if (activeGenreTab === 'top100') return TOP_100_GENRES;
    return TOP_200_GENRES;
  }, [activeGenreTab]);

  // 장르 선택 시 Obsidian Music Wiki DB 릴레이 자동 태그 매칭 및 하이라이트
  const handleGenreSelect = (genreName: string) => {
    setActiveGenre(genreName);
    const autoTags = getAutoMatchedTagsForGenre(genreName);
    
    // Preserve any theme tags selected previously
    const themeTags = selectedProTags.filter((t) => themeCategory?.tags.some((tt) => tt.value === t));
    const nextTags = Array.from(new Set([...themeTags, ...autoTags]));
    setSelectedProTags(nextTags);

    const compiled = compileStylePrompt(genreName, nextTags);
    setStylePrompt(compiled);
  };

  // 12-Category 태그 선택 변경 시 실시간 프롬프트 자동 동기화
  const handleTagToggle = (tagValue: string) => {
    let nextTags: string[];
    if (selectedProTags.includes(tagValue)) {
      nextTags = selectedProTags.filter((v) => v !== tagValue);
    } else {
      nextTags = [...selectedProTags, tagValue];
    }
    setSelectedProTags(nextTags);

    const compiled = compileStylePrompt(activeGenre, nextTags);
    setStylePrompt(compiled);
  };

  // 🎯 틈새 타겟팅 추천 칩 (단일 선택 Radio 토글)
  const handleNicheSeedToggle = (seedValue: string) => {
    const allNicheValues = new Set<string>();
    Object.values(MASTER_NICHE_SEEDS).forEach((list) => {
      list.forEach((item) => allNicheValues.add(item.value));
    });
    CHANNEL_CONCEPTS.forEach((c) => {
      c.nicheSeeds.forEach((item) => allNicheValues.add(item.value));
    });

    let nextTags: string[];
    if (selectedProTags.includes(seedValue)) {
      nextTags = selectedProTags.filter((v) => v !== seedValue);
    } else {
      const nonNicheTags = selectedProTags.filter((v) => !allNicheValues.has(v));
      nextTags = [...nonNicheTags, seedValue];
    }
    setSelectedProTags(nextTags);

    const compiled = compileStylePrompt(activeGenre, nextTags);
    setStylePrompt(compiled);
  };

  // [✨ 12-Category 프롬프트 우측 적용하기]
  const handleApplyToRightCockpit = () => {
    const compiled = compileStylePrompt(activeGenre, selectedProTags);
    setStylePrompt(compiled);
    setAppliedFlash(true);
    setTimeout(() => setAppliedFlash(false), 1500);
  };

  // 음원 재생 핸들러
  const handleTogglePlay = useCallback((id: number | string, url: string, trackObj?: any) => {
    if (!audioRef.current) return;
    if (trackObj) setActiveTrackObject(trackObj);

    if (playingId === id) {
      if (audioRef.current.paused) {
        registerActiveAudio(audioRef.current, () => setPlayingId(null));
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
        setPlayingId(null);
      }
    } else {
      audioRef.current.pause();
      setCurrentTime(0);
      setDuration(0);
      audioRef.current.src = url;
      audioRef.current.load();
      registerActiveAudio(audioRef.current, () => setPlayingId(null));
      audioRef.current.play().catch(console.error);
      setPlayingId(id);
    }
  }, [playingId]);

  useEffect(() => {
    audioRef.current = new Audio();
    const handleTimeUpdate = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
    };
    const handleLoadedMetadata = () => {
      if (audioRef.current) setDuration(audioRef.current.duration);
    };
    const handleEnded = () => {
      setPlayingId(null);
    };

    if (audioRef.current) {
      audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
      audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
      audioRef.current.addEventListener('ended', handleEnded);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audioRef.current.removeEventListener('ended', handleEnded);
        audioRef.current.pause();
      }
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto pt-4 pb-24 px-4 sm:px-6">
      {/* Header — 통일된 표준 브랜드 헤더 */}
      <header className="mb-8 border-b border-white/10 pb-6">
        <h1 className="text-4xl font-bold text-white mb-2">Audio Forge Pro</h1>
        <p className="text-zinc-400">전문가 및 프로듀서를 위한 수제 AI 음악 스튜디오 — 201개 장르, 12종 세부 조율 파라미터 콕핏 및 Studio-Grade AI 프로듀서 브리프 생성 엔진 탑재.</p>
      </header>

      {/* ─── 🚀 MAIN SPLIT-SCREEN COCKPIT (Preset Studio 규격: gap-6, lg:col-span-7 : lg:col-span-5) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12 items-start w-full">
        
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* 🎛️ LEFT PANEL (7/12 = 60%): 12-Category Full Parameter Cockpit */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-zinc-950/60 p-5 rounded-2xl border border-white/10 backdrop-blur-md shadow-xl space-y-5">
            
            {/* Left Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-base font-extrabold text-white tracking-tight">
                    12종 전문가 세부 조율 파라미터 콕핏
                  </h2>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  장르 선택 시 Obsidian Music Wiki DB 릴레이로 최적 태그 자동 활성화
                </p>
              </div>

              {selectedProTags.length > 0 && (
                <button
                  onClick={() => setSelectedProTags([])}
                  className="text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1 transition-colors self-end sm:self-auto bg-fuchsia-500/10 px-2.5 py-1 rounded-lg border border-fuchsia-500/20"
                >
                  <span>조율 필터 초기화 ({selectedProTags.length})</span>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 1. 🎬 6대 채널 컨셉 & 🎲 AI 틈새 무작위 셔플 엔진 */}
            <div className="space-y-3 bg-gradient-to-r from-fuchsia-950/40 via-purple-950/40 to-cyan-950/40 p-4 rounded-xl border border-fuchsia-500/30 shadow-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-fuchsia-400" />
                  <span className="text-xs font-black text-fuchsia-200 uppercase tracking-wider">
                    1. 🎬 채널 컨셉 & 틈새 전략 (YouTube Plly Channel Strategy)
                  </span>
                </div>

                {/* 🎲 AI 틈새 아이디어 셔플 버튼 */}
                <button
                  onClick={handleShuffleNiche}
                  disabled={isShuffling}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border shadow-md ${
                    isShuffling
                      ? 'bg-fuchsia-500 border-fuchsia-400 text-black scale-95'
                      : 'bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white border-fuchsia-400/40 active:scale-95'
                  }`}
                >
                  <Shuffle className={`w-3.5 h-3.5 ${isShuffling ? 'animate-spin' : ''}`} />
                  <span>🎲 AI 틈새 아이디어 셔플</span>
                </button>
              </div>

              {/* 6대 대분류 탭 버튼 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                {CHANNEL_CONCEPTS.map((concept) => {
                  const isActive = selectedConceptId === concept.id;
                  return (
                    <button
                      key={concept.id}
                      onClick={() => setSelectedConceptId(concept.id)}
                      className={`p-2 rounded-lg text-left transition-all border flex items-center gap-2 ${
                        isActive
                          ? 'bg-gradient-to-r from-fuchsia-600/40 to-purple-600/40 border-fuchsia-400 text-white font-bold shadow-[0_0_12px_rgba(217,70,239,0.4)] scale-[1.02]'
                          : 'bg-black/40 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
                      }`}
                    >
                      <span className="text-base">{concept.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold truncate">{concept.title}</div>
                        <div className="text-[9.5px] text-zinc-500 truncate">{concept.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 틈새 아이디어 추천 칩 & 커스텀 입력창 */}
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-300 font-bold flex items-center gap-1">
                    🎯 틈새 타겟팅 추천 칩 (단일 선택 / 클릭 시 자동 반영):
                  </span>
                  <span className="text-zinc-500 font-mono text-[10px]">클릭 시 1개 컨셉만 명확히 반영</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {nicheSeeds.map((seed) => {
                    const isSelected = selectedProTags.includes(seed.value);
                    return (
                      <button
                        key={seed.value}
                        onClick={() => handleNicheSeedToggle(seed.value)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border flex items-center gap-1 ${
                          isSelected
                            ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 border-fuchsia-400 text-white font-bold shadow-[0_0_10px_rgba(217,70,239,0.5)] scale-105'
                            : 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-200 hover:text-white hover:bg-fuchsia-500/20'
                        }`}
                      >
                        <span>{seed.label}</span>
                        {isSelected && <Check className="w-3 h-3 text-fuchsia-200" />}
                      </button>
                    );
                  })}
                </div>

                {/* 커스텀 틈새 입력창 */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={customNicheInput}
                    onChange={(e) => setCustomNicheInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCustomNiche();
                    }}
                    placeholder="✏️ 나만의 틈새 컨셉 직접 입력 (예: 새벽 4시 편의점 감성)"
                    className="flex-1 bg-zinc-950 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-400"
                  />
                  <button
                    onClick={handleAddCustomNiche}
                    className="px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>추가</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. 🎸 대표 장르 선택 (Genre Selector) — 스크롤 배제, 100% 전체 펼침 */}
            <div className="space-y-2.5 bg-zinc-900/60 p-3.5 sm:p-4 rounded-xl border border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Guitar className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-black text-zinc-200 uppercase tracking-wider">
                    2. 🎸 장르 카테고리 (DistroKid 201+ DB)
                  </span>
                </div>

                {/* TOP 100 / TOP 200 Sub-Tabs */}
                <div className="flex items-center gap-1 p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <button
                    onClick={() => {
                      setActiveGenreTab('top100');
                      handleGenreSelect('All');
                    }}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                      activeGenreTab === 'top100'
                        ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    🔥 TOP 100
                  </button>
                  <button
                    onClick={() => {
                      setActiveGenreTab('top200');
                      handleGenreSelect('All');
                    }}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                      activeGenreTab === 'top200'
                        ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-md'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    🌐 TOP 200
                  </button>
                </div>
              </div>

              {/* Genre Pills — 스크롤 배제, 100% 전체 펼침 */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {displayedGenres.map((g: string) => {
                  const isSelected = activeGenre === g;
                  return (
                    <button
                      key={g}
                      onClick={() => handleGenreSelect(g)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border flex items-center gap-1 ${
                        isSelected
                          ? "bg-cyan-500/25 border-cyan-400 text-cyan-100 font-bold shadow-[0_0_10px_rgba(6,182,212,0.4)] scale-105"
                          : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10"
                      }`}
                    >
                      <span>{g}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3~12. 10 Subcategories from categories.ts (Theme 제외) */}
            <div className="space-y-4 pt-1">
              {otherCategories.map((cat, idx) => (
                <div key={cat.id} className="space-y-2 border-b border-white/5 pb-3.5 last:border-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{cat.icon}</span>
                    <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
                      {idx + 3}. {cat.title}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">• {cat.desc}</span>
                  </div>

                  {/* Category Chips — 스크롤 없이 전체 다 펼침 */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {cat.tags.map((t) => {
                      const isTagSelected = selectedProTags.includes(t.value);
                      return (
                        <button
                          key={t.value}
                          onClick={() => handleTagToggle(t.value)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border flex items-center gap-1 ${
                            isTagSelected
                              ? 'bg-gradient-to-r from-fuchsia-600/40 to-cyan-600/40 border-cyan-400 text-white font-bold shadow-[0_0_10px_rgba(6,182,212,0.4)] scale-105'
                              : 'border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
                          }`}
                        >
                          <span>{t.label}</span>
                          {isTagSelected && <Check className="w-3 h-3 text-cyan-300" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Action Button for Left Cockpit */}
            <div className="pt-3 border-t border-white/10">
              <button
                onClick={handleApplyToRightCockpit}
                className={`w-full py-3 rounded-xl font-bold text-xs transition-all duration-300 flex items-center justify-center gap-2 border shadow-lg ${
                  appliedFlash
                    ? 'bg-emerald-500 border-emerald-400 text-black shadow-emerald-500/50 scale-105'
                    : 'bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400 text-white border-fuchsia-400/30 shadow-fuchsia-600/30 active:scale-95'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{appliedFlash ? '✓ 우측 음원 생성 프로세스에 성공적으로 적용되었습니다!' : '✨ 12-Category 세부 프롬프트 우측 적용하기'}</span>
              </button>
            </div>

          </div>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {/* 🚀 RIGHT PANEL (5/12 = 40%): Preset Studio 규격 맞춤 Sticky 콕핏 */}
        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="lg:col-span-5 sticky top-6 space-y-6">
          <PromptBuilder
            sourceMenu="style-library"
            isDrawerMode={true}
            externalStylePrompt={stylePrompt}
            onOpenProPaywall={() => setIsUpgradeModalOpen(true)}
          />
        </div>

      </div>

      {/* ─── 🎧 100% FULL-WIDTH PUBLIC TRACK GRID (Preset Studio 스타일 하단 갤러리) ─── */}
      <div className="max-w-6xl mx-auto border-t border-white/5 pt-6 mt-4">
        <PublicTrackGrid
          sourceMenu="style-library"
          itemsPerPage={16}
          useExternalPlayer={true}
          playingTrackId={playingId ? String(playingId) : null}
          isTrackPlaying={playingId !== null}
          onPlayTrack={(track: any) => handleTogglePlay(track.id, track.audio_url || track.audioUrl || '', track)}
          onPauseTrack={() => {
            audioRef.current?.pause();
            setPlayingId(null);
          }}
        />
      </div>

      {/* ── Fixed Bottom Audio Player Bar ── */}
      <AnimatePresence>
        {playingId && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-0 left-0 md:left-64 right-0 z-50 bg-zinc-950/95 border-t border-white/10 backdrop-blur-md px-6 py-4 flex items-center justify-between shadow-2xl"
          >
            <div className="flex items-center gap-3 w-1/4 min-w-0">
              <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-zinc-900 border border-white/10 flex items-center justify-center">
                <Music2 className="w-5 h-5 text-fuchsia-400 animate-pulse" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white truncate leading-snug">
                  {activeTrackObject?.title || activeTrackObject?.name || "Pro Masterpiece"}
                </h4>
                <p className="text-[10.5px] text-zinc-400 truncate mt-0.5">
                  {activeTrackObject?.genre || activeGenre || "Audio Forge Pro"}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-1.5 flex-1 max-w-xl">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    if (audioRef.current) {
                      if (audioRef.current.paused) audioRef.current.play();
                      else audioRef.current.pause();
                    }
                  }}
                  className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                >
                  {audioRef.current && !audioRef.current.paused ? (
                    <Pause className="w-4 h-4 fill-black text-black" />
                  ) : (
                    <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2 w-full">
                <span className="text-[10px] text-zinc-400 font-mono w-8 text-right">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (audioRef.current) {
                      audioRef.current.currentTime = val;
                      setCurrentTime(val);
                    }
                  }}
                  className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    accentColor: '#ffffff',
                    background: `linear-gradient(to right, #ffffff 0%, #ffffff ${(duration > 0 ? (currentTime / duration) : 0) * 100}%, rgba(255,255,255,0.15) ${(duration > 0 ? (currentTime / duration) : 0) * 100}%)`,
                  }}
                />
                <span className="text-[10px] text-zinc-400 font-mono w-8">
                  {formatTime(duration)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 w-1/4">
              <button
                onClick={() => {
                  if (audioRef.current) audioRef.current.pause();
                  setPlayingId(null);
                }}
                className="text-zinc-400 hover:text-white text-xs font-bold transition-colors"
              >
                닫기
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
