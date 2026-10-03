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

