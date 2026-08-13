/**
 * Melodio — 숏폼 바이럴 스토리 DB 크롤러 및 옵시디언 마크다운 노드 생성 스크립트
 * 
 * 11개 카테고리별 유머/반려동물/일상/직장/육아/다이어트 등 리얼 썰 데이터 수집 및
 * 옵시디언 마크다운 노드 (knowledge/episodes/[category]/[id].md) 생성
 */

const fs = require('fs');
const path = require('path');

const EPISODES_BASE_DIR = path.join(__dirname, '../../knowledge/episodes');

// 11개 카테고리별 시드 에피소드 데이터셋 (실제 커뮤니티 썰 / 릴스 숏폼 인기 소재)
const SEED_EPISODES = [
  // 1. PET (댕냥이 & 집사 속마음)
  {
    id: "pet_001",
    category: "pet",
    title: "한정판 슬리퍼 물고 침대 밑으로 숨은 강아지",
    tags: ["강아지", "슬리퍼", "인질극", "침대밑", "억울함"],
    protagonist: "골든리트리버 (뻔뻔함 ➔ 억울함)",
    antagonist: "집사 (멘붕 ➔ 츄르 협상)",
    emotionalArc: "슬리퍼 획득의 신남 ➔ 인질극 뻔뻔함 ➔ 눈동자만 구르는 억울함 ➔ 츄르 소리에 감격",
    summary: "새벽에 집사의 아끼는 슬리퍼를 물고 침대 밑 깊숙한 곳으로 들어간 강아지. 집사가 나오라고 소리치자 슬리퍼에 이빨 자국을 더 깊게 찍으며 '내가 한 게 아니다'라는 표정으로 눈동자만 데굴데굴 굴림.",
    punchline: "내가 슬리퍼 물은 게 아니라 슬리퍼가 내 입으로 들어왔다 멍멍!",
    visualPrompt: "Golden retriever hiding under a bed holding a slipper in mouth, looking guilty with wide round eyes, human butler kneeling outside in frustration"
  },
  {
    id: "pet_002",
    category: "pet",
    title: "새벽 3시 30분 집사 얼굴 엉덩이 테러 고양이",
    tags: ["고양이", "새벽3시", "엉덩이테러", "알람", "집사서러움"],
    protagonist: "페르시안 고양이 (냉혹함 ➔ 뻔뻔함)",
    antagonist: "잠에 취한 집사 (비명 ➔ 체념)",
    emotionalArc: "새벽의 침묵 ➔ 무자비한 엉덩이 투하 ➔ 집사 비명에 하품 ➔ 밥그릇 요구",
    summary: "가장 깊게 잠든 새벽 3시 30분, 아무 이유 없이 자는 집사의 정수리와 콧구멍 위에 살포시 엉덩이를 얹고 앉은 고양이. 집사가 컥컥거리며 깨어나자 뻔뻔하게 하품을 하며 밥그릇을 가리킴.",
    punchline: "내 엉덩이는 최고급 털베개다 집사야, 안 보이냐 밥그릇 3초 빈 거?",
    visualPrompt: "Cat sitting directly on sleeping human face at 3 AM in dark room, cat looking down coolly, human gasping under cat"
  },
  {
    id: "pet_003",
    category: "pet",
    title: "로봇청소기와 숙명의 거실 순찰 라구냥",
    tags: ["고양이", "로봇청소기", "거실순찰", "장군", "전쟁"],
    protagonist: "치즈냥이 (늠름한 장군)",
    antagonist: "로봇청소기 (무기물 라이벌)",
    emotionalArc: "청소기 탑승의 늠름함 ➔ 식탁 의자 다리 충돌에 당황 ➔ 아무 일 없었다는 듯 품위 유지",
    summary: "스스로 로봇청소기 전원 버튼을 밟고 올라타 거실 전체를 늠름하게 순찰하는 치즈냥이. 식탁 의자에 쾅 박힐 때 순간 기우뚱하지만 포커페이스를 유지하며 집사를 흘겨봄.",
    punchline: "이 거실의 왕은 나다, 가라 나의 자율주행 전차야!",
    visualPrompt: "Orange tabby cat riding a round robotic vacuum cleaner like a tank commander, serious stoic expression, indoor living room"
  },

  // 2. HUMAN (현대인 & 직장 생활 격공)
  {
    id: "human_001",
    category: "human",
    title: "퇴근 5분 전 전사한 엑셀 파일과 상사",
    tags: ["퇴근5분전", "엑셀다운", "응답없음", "부장님", "절망"],
    protagonist: "K-직장인 사원 (절망 ➔ 해탈)",
    antagonist: "응답없음 엑셀 창 & 퇴근 1분 전 찾아온 부장님",
    emotionalArc: "퇴근 칼날 준비 ➔ 화면 하얗게 질림(응답없음) ➔ 부장님의 '이것만 하고 가' ➔ 눈물 없는 웃음",
    summary: "오후 5시 55분 칼퇴근을 앞두고 마지막 저장 버튼을 누르는 순간 엑셀이 (응답 없음)으로 하얗게 블러 처리됨. 바로 그때 부장님이 뒤에서 어깨를 짚으며 '김사원, 이거 금방 되지?'라며 서류 투척.",
    punchline: "엑셀도 쉬고 싶은 6시, 나도 응답 없음 상태입니다 부장님!",
    visualPrompt: "Office worker staring in horror at frozen white Excel screen on monitor at 5:59 PM, boss standing behind holding a stack of papers"
  },
  {
    id: "human_002",
    category: "human",
    title: "슬랙 전체채널에 잘못 보낸 밈 짤방",
    tags: ["슬랙", "실수", "밈짤", "대표님방", "식은땀"],
    protagonist: "대리 (경악 ➔ 퇴사 욕구)",
    antagonist: "전체 사원 300명 & 대표님",
    emotionalArc: "동기에게 보낼 개그 짤 선택 ➔ 클릭 미스로 #general 전송 ➔ 5초 삭제 불가능 ➔ 대표님 'ㅋㅋ'",
    summary: "동기 단톡방에 보낼 '부장님 뚝배기 깨고 싶다' 짤방을 회사 전체 슬랙 채널(#general)에 올려버린 대리. 식은땀을 흘리며 삭제 버튼을 찾는데 10초 만에 대표님이 '좋은 아침입니다' 리액션 달음.",
    punchline: "삭제 버튼 1초 만에 찾아라! 내 직장 수명이 사라지고 있다!",
    visualPrompt: "Sweating office worker looking terrified at laptop screen, Slack message notification popups, high tension office setting"
  },

  // 3. PARENTING (육아 & 잼민이 속마음 — 🆕)
  {
    id: "parenting_001",
    category: "parenting",
    title: "낮잠 다 잤다고 거짓말하는 4살의 속속들이",
    tags: ["육아", "낮잠시간", "눈빛연기", "장난감", "엄마멘붕"],
    protagonist: "4세 아기 (천진난만 뻔뻔함)",
    antagonist: "쉬고 싶은 엄마 (희망 ➔ 절망)",
    emotionalArc: "눈 찌푸리고 자는 척 ➔ 엄마 나가자마자 눈 번쩍 ➔ 장난감 상자 대폭발 ➔ '나 안 잤어!'",
    summary: "엄마가 30분 동안 자장가 부르고 겨우 재운 줄 알고 살금살금 문을 닫고 나가는 순간, 아이가 눈을 뻔쩍 뜨고 베개 밑에서 최애 공룡 장난감을 꺼내며 꺄르르 웃음.",
    punchline: "엄마 난 자는 연기를 한 거야, 내 육아 방학은 지금부터 시작이다!",
    visualPrompt: "Toddler popping up in bed with wide sparkling eyes holding a dinosaur toy the instant mom steps out of bedroom door"
  },
  {
    id: "parenting_002",
    category: "parenting",
    title: "마트 장난감 코너 5초 누워버리기 신공",
    tags: ["잼민이", "마트", "바닥누움", "장난감", "엄마지갑"],
    protagonist: "7세 잼민이 (바닥과 물아일체)",
    antagonist: "엄마 & 지나가는 마트 손님들",
    emotionalArc: "장난감 발견 ➔ 안 사준다는 말에 0.1초 만에 바닥 바닥 눕기 ➔ 통곡 연기 ➔ 사주자마자 눈물 뚝",
    summary: "헬로카봇 신제품을 본 잼민이. 안 된다는 엄마 말에 망설임 없이 마트 바닥에 엎드려 바닥과 하나가 됨. 지나가는 할머니들의 '아이구 사주지' 소리에 사주자마자 눈물을 닦고 미소 지음.",
    punchline: "마찰력 제로 마트 바닥! 이 팽이는 내 손에 들어올 때까지 바닥을 닦겠다!",
    visualPrompt: "Child lying flat on clean supermarket floor crying dramatic fake tears next to toy shelf, embarrassed mother looking away"
  },

  // 4. FOOD_DIET (야식 & 다이어트 악마 — 🆕)
  {
    id: "food_diet_001",
    category: "food_diet",
    title: "새벽 1시 라면 물 끓이는 다이어터의 환각",
    tags: ["야식", "다이어트", "새벽1시", "신라면", "악마의귓속말"],
    protagonist: "다이어트 3일차 (욕망과 이성의 전쟁)",
    antagonist: "냄비 속 끓는 라면 국물 & 붉은 김치",
    emotionalArc: "샐러드로 버틴 하루 ➔ 유튜브 먹방 클릭 ➔ 정성스럽게 라면 물 조절 ➔ 첫 젓가락의 천국",
    summary: "오늘 칼로리 800kcal 채우고 뿌듯하게 누웠으나 릴스 먹방을 본 순간 정신이 아득해짐. 냄비에 물 550ml 정확히 맞추고 파를 써는 자신을 발견하며 '내일부터 진짜 다이어트'를 외침.",
    punchline: "라면 국물 한 입에 내일부터 다이어트 1일차 리셋!",
    visualPrompt: "Person slurping spicy instant noodles at 1 AM in dark kitchen illuminated only by stove flame and phone screen showing mukbang"
  },
  {
    id: "food_diet_002",
    category: "food_diet",
    title: "제로 칼로리 음료 마셨으니 족발은 0칼로리",
    tags: ["기적의논리", "제로콜라", "불족발", "칼로리계산", "다이어트기적"],
    protagonist: "자기합리화 달인 (행복한 착각)",
    antagonist: "몸무게 체중계",
    emotionalArc: "족발 주문의 죄책감 ➔ 제로 펩시 발견 ➔ '제로가 족발 칼로리를 녹인다' 기적의 창조 ➔ 폭풍 흡입",
    summary: "불족발 대(大) 자에 쟁반국수까지 주문해놓고 제로 슈가 콜라를 컵에 따르며 '제로는 마이너스 칼로리니까 족발 지방을 분해해 줄 거야'라며 행복한 기적의 논리를 펼침.",
    punchline: "제로 콜라 마셨으니까 오늘 섭취 칼로리는 0kcal 완성!",
    visualPrompt: "Happy person eating huge pig feet (jokbal) dish with a tall glass of Zero Coke, funny mathematical equations floating in air"
  },

  // 5. HORROR_MYSTERY (지하철 흑역사 & 괴담 — 🆕)
  {
    id: "horror_mystery_001",
    category: "horror_mystery",
    title: "지하철에서 옆 사람 어깨에 헤드뱅잉 침 흘리기",
    tags: ["지하철", "흑역사", "숙면", "어깨침", "이불킥"],
    protagonist: "피곤한 승객 (자각 ➔ 수치사)",
    antagonist: "옆자리 무서운 아저씨 & 조용한 지하철",
    emotionalArc: "지하철 탑승의 피로 ➔ 시원한 수면 ➔ 덜컹거림에 옆사람 어깨 쿵 ➔ 침 자국 발견 후 정적",
    summary: "퇴근길 2호선에서 너무 피곤해서 졸다가 옆자리 정장 입은 아저씨 어깨에 머리를 박고 20분간 폭풍 숙면. 눈을 떴는데 아저씨 어깨 옷자락에 내 침 자국이 축축하게 젖어 있음.",
    punchline: "다음 역에서 내리겠습니다 아저씨, 이 어깨는 제가 세탁비 내겠습니다!",
    visualPrompt: "Sleepy commuter dropping head onto a surprised suit-wearing passenger's shoulder in subway car, drool mark on shoulder"
  },

  // 6. RELATIONSHIP (연애 & 남녀 심리 탐구)
  {
    id: "relationship_001",
    category: "relationship",
    title: "전 연인 인스타 3년 전 사진 실수로 하트 누름",
    tags: ["전애인", "인스타탐방", "실수로좋아요", "식은땀", "수치사"],
    protagonist: "새벽 2시 탐방러 (경악 ➔ 계정 비활성화)",
    antagonist: "인스타그램 빨간 하트 알림",
    emotionalArc: "몰래 탐방의 흥미 ➔ 손가락 미스 (더블클릭) ➔ 빨간 하트 켜짐 ➔ 0.5초 취소하지만 알림 이미 감",
    summary: "새벽 2시, 3년 전 헤어진 전 애인의 인스타그램 피드 맨 아래까지 내려가서 놀러 갔던 사진을 구경하다가 두 번 터치로 '좋아요' 하트를 눌러버림. 취소를 눌렀지만 푸시 알림은 이미 날아감.",
    punchline: "내 손가락아 왜 그랬니! 지금 당장 계정 비활성화 가자!",
    visualPrompt: "Person sitting in dark room looking at smartphone in pure terror, bright pink Instagram heart icon glowing on screen"
  },

  // 7. TREND (실시간 이슈 & 트렌드 풍자)
  {
    id: "trend_001",
    category: "trend",
    title: "팝업스토어 오픈런 3시간 대기 후 품절 굿즈",
    tags: ["오픈런", "팝업스토어", "웨이팅", "품절", "현타"],
    protagonist: "트렌드에 미친 20대 (의욕 ➔ 현타)",
    antagonist: "내 바로 앞 1명에서 품절 선언한 직원",
    emotionalArc: "새벽 6시 대기열 1등 의욕 ➔ 칼바람 견디기 ➔ 직원의 '품절입니다' ➔ 빈손 스티커 획득",
    summary: "성수동 캐릭터 팝업스토어 한정판 인형을 사기 위해 새벽 6시부터 추위 속에서 3시간 오픈런 대기. 마침내 입장이 내 차례가 되었을 때 직원이 '방금 마지막 수량 품절되었습니다' 안내 피켓 게시.",
    punchline: "3시간 기다려서 얻은 건 찌푸린 내 얼굴과 무료 스티커 한 장!",
    visualPrompt: "Cold shivering fan outside trendy pop-up store looking shocked as staff member holds up 'SOLD OUT' sign right in front of them"
  },

  // 8. DRAMA (K-드라마 & 명대사 패러디)
  {
    id: "drama_001",
    category: "drama",
    title: "김치 뺨 때리기 뺨치는 파채 싸대기 파티",
    tags: ["K드라마", "막장드라마", "김치싸대기", "파채", "패러디"],
    protagonist: "막장 드라마 시어머니 (카리스마 폭발)",
    antagonist: "억울한 며느리 & 삼겹살 파채",
    emotionalArc: "분노 빌드업 ➔ 삼겹살 집 파채 그릇 집어들기 ➔ 슬로우 모션 파채 싸대기 ➔ 양념 사방에 튐",
    summary: "막장 K-드라마 최고 명장면 '김치 싸대기'를 현대 삼겹살집 파채로 재해석. '네가 감히 내 아들 삼겹살을 타게 해?!'라며 양념 파채로 따귀를 날리는 스펙터클한 B급 패러디 연출.",
    punchline: "김치 싸대기는 가라! 이제는 매콤한 파채 싸대기 시대다!",
    visualPrompt: "Dramatic scene parodying Korean drama with mother-in-law slapping a person with seasoned green onion salad, red sauce splashing everywhere"
  },

  // 9. BRAND (B급 광고 & 소비 심리 패러디)
  {
    id: "brand_001",
    category: "brand",
    title: "1+1 행사에 혹해서 10년 치 휴지 사버린 사람",
    tags: ["원플러스원", "마트행사", "충동구매", "10년치휴지", "자취방지옥"],
    protagonist: "자취생 (합리적 소비 착각 ➔ 포위당함)",
    antagonist: "자취방 입구까지 쌓인 100롤 휴지 탑",
    emotionalArc: "1+1 표지판에 눈이 뒤집힘 ➔ 장바구니 폭발 ➔ 집에 배송된 50팩 ➔ 문을 못 여는 자취방",
    summary: "대형마트에서 '오늘만 1+1 특별 할인!' 문구를 보고 눈이 뒤집혀 두루마리 휴지를 카트에 쓸어 담음. 배송되어 온 휴지가 원룸 현금 문 앞까지 점령하여 자기 집을 못 들어가는 현타 발생.",
    punchline: "휴지 10년 치 샀으니 2036년까지 휴지 걱정은 끝이다!",
    visualPrompt: "Tiny studio apartment filled to the ceiling with giant toilet paper packs, person squeezing through a narrow gap between paper stacks"
  },

  // 10. HISTORY (역사 위인 부캐 라이브)
  {
    id: "history_001",
    category: "history",
    title: "세종대왕의 훈민정음 작성 중 맥북 버그 멘붕",
    tags: ["세종대왕", "훈민정음", "조선시대", "맥북", "버그"],
    protagonist: "세종대왕 전하 (지혜로움 ➔ 딥빡)",
    antagonist: "한글 입력기 커서 멈춤 현상 & 집현전 학자들",
    emotionalArc: "집현전 밤샘 야근 ➔ '나랏말싸미' 타자기 입력 ➔ 커서 응답없음 ➔ 왕의 분노",
    summary: "훈민정음 28자를 창제하던 세종대왕이 한옥 정자에서 맥북 프로를 들고 '나랏말싸미 듕귁에 달아'를 타핑 치는 중. 한글 저장 버튼을 안 눌렀는데 맥북 팬 소리가 요란해지며 꺼져버림.",
    punchline: "집현전 집사야! 이 맥북 오토 세이브 어디 있느냐 전하 가슴이 타들어간다!",
    visualPrompt: "King Sejong in red Joseon royal robes furiously tapping on a space-gray MacBook Pro inside traditional wooden palace, steam from cup of tea"
  },

  // 11. CHALLENGE (도파민 충전 응원 챌린지)
  {
    id: "challenge_001",
    category: "challenge",
    title: "월요일 아침 출근길 도파민 폭발 텐션업 챌린지",
    tags: ["월요병", "출근길", "텐션업", "도파민", "응원송"],
    protagonist: "월요병 극복 직장인 (지침 ➔ 폭발적 에너지)",
    antagonist: "지옥철 9호선 & 찌푸린 승객들",
    emotionalArc: "월요일 7시 알람의 절망 ➔ 이어폰 꽂고 비트 재생 ➔ 지옥철 안에서 스텝 밟기 ➔ 세상의 주인공 승리",
    summary: "모두가 죽상으로 출근하는 헬월요일 아침 8시 지하철. 내 이어폰에서 터지는 극상의 댄스 비트에 맞춰 마음속으로 세상 제일 핫한 댄서가 되어 월요병을 사살하는 고도파민 챌린지.",
    punchline: "월요일이 날 죽이러 왔냐? 내가 월요일을 씹어 먹겠다!",
    visualPrompt: "Crowded gloomy morning subway car where one office worker with glowing headphones is striking an energetic rockstar pose in bright lighting"
  }
];

/**
 * 스토리 DB 디렉토리 생성 및 마크다운 노드 생성 실행
 */
function buildStoryDatabase() {
  console.log('[StoryDB Builder] Starting Obsidian Story DB Generation...');

  if (!fs.existsSync(EPISODES_BASE_DIR)) {
    fs.mkdirSync(EPISODES_BASE_DIR, { recursive: true });
  }

  let createdCount = 0;

  for (const ep of SEED_EPISODES) {
    const catDir = path.join(EPISODES_BASE_DIR, ep.category);
    if (!fs.existsSync(catDir)) {
      fs.mkdirSync(catDir, { recursive: true });
    }

    const filePath = path.join(catDir, `${ep.id}.md`);

    const markdownContent = `---
id: "${ep.id}"
title: "${ep.title}"
category: "${ep.category}"
tags: ${JSON.stringify(ep.tags)}
protagonist: "${ep.protagonist}"
antagonist: "${ep.antagonist}"
emotionalArc: "${ep.emotionalArc}"
---

# ${ep.title}

## 1. 리얼 에피소드 요약 (Original Episode)
${ep.summary}

## 2. 캐릭터 티키타카 구도 (Protagonist vs Antagonist)
- **주인공 (Protagonist)**: ${ep.protagonist}
- **조연/상대 (Antagonist)**: ${ep.antagonist}

## 3. 감정 및 표정 변화 (Emotional Arc)
${ep.emotionalArc}

## 4. 숏폼 가사 펀치라인 씨앗 (Punchline Seed)
> "${ep.punchline}"

## 5. Visual Prompt for AI Video
\`${ep.visualPrompt}\`
`;

    fs.writeFileSync(filePath, markdownContent, 'utf-8');
    console.log(`  [OK] Created episode node: knowledge/episodes/${ep.category}/${ep.id}.md`);
    createdCount++;
  }

  console.log(`[StoryDB Builder] Successfully built ${createdCount} Obsidian Story DB Nodes across 11 Categories!`);
}

// 스크립트 직접 실행 시
if (require.main === module) {
  buildStoryDatabase();
}

module.exports = { buildStoryDatabase, SEED_EPISODES };
