import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// 4가지 핵심 카테고리 (trend, history, human, brand)에 대응하는 고화질 16대 도파민 풍자 콘셉트 시드
const SEED_VIRAL_CONCEPTS = [
  // 1. ⚡ 트렌드/이슈 (trend)
  {
    id: "trend-var",
    title: "월드컵 오심 저격송 (심판 판정 디스)",
    genre: "힙합/트랩 (Trap/Hip-hop)",
    styleName: "Dark Synthwave",
    source: "경기장 안의 모든 카메라와 시청자가 확인한 오심을 홀로 외면하는 아쉬운 판정과 시청자들의 킹받는 답답함을 영리하게 저격한 숏폼 트래픽송",
    visual: "VR 헤드셋을 거꾸로 쓴 침팬지 심판이 모니터를 보고 있고, 그 위로 거대한 옐로우 카드가 날아다니는 9:16 모션 아트",
    suggestedTags: ["#월드컵오심", "#VAR뇌절", "#심판디스", "#도파민충전", "#스포츠밈"],
    tab_type: "trend"
  },
  {
    id: "trend-yoajeong",
    title: "요아정/디저트 유행 탕진 송",
    genre: "K-Pop 댄스",
    styleName: "Chillwave Drift",
    source: "새로 유행하는 디저트 브랜드와 맛집 오픈런에 가볍게 지갑을 열고 나서, 텅 빈 잔고를 마주하고 자조하는 현대인의 유행 중독 비판 댄스곡",
    visual: "핑크빛 마시멜로 타워가 쓰러지면서 그 밑에 신용카드가 부러져 있는 화려한 카툰 일러스트",
    suggestedTags: ["#요아정", "#오픈런", "#유행민족", "#틱톡댄스", "#지갑탈탈"],
    tab_type: "trend"
  },
  {
    id: "trend-ai-finger",
    title: "생성형 AI '손가락 6개'의 슬픔",
    genre: "테크/사이버펑크",
    styleName: "Cyberpunk Bass",
    source: "화려한 생성형 AI 문명 혁명 속에서 가끔씩 튀어나오는 해학적인 이미지 오류와 이를 수동 수정해야 하는 개발자/크리에이터의 애환",
    visual: "매드 사이언티스트 로봇이 뒤틀린 인물 그림을 보며 당황하고 네온 에러 메시지가 팝업되는 사이버펑크 9:16 아트",
    suggestedTags: ["#AI그림", "#손가락6개", "#프롬프트", "#AI개발자", "#B급풍자"],
    tab_type: "trend"
  },
  {
    id: "trend-algorithm",
    title: "조회수 떡상 기원 알고리즘 찬가",
    genre: "웅장한 가스펠 / 합창",
    styleName: "Dark Synthwave",
    source: "단 3초의 알고리즘 후킹을 확보하기 위해 밤낮없이 스크롤을 연구하는 현대 크리에이터들의 간절함을 담은 웅장하고 유쾌한 기복송",
    visual: "거대한 스마트폰 액정 조명이 밤하늘에 별처럼 떠 있고 크리에이터들이 양손 모아 기도하는 웅장하고 골 때리는 3D 그래픽",
    suggestedTags: ["#조회수떡상", "#알고리즘간택", "#유튜버일상", "#새벽기도", "#쇼츠망령"],
    tab_type: "trend"
  },

  // 2. ⏳ 역사 위인 ‘환생’ 저격 (history)
  {
    id: "history-sunshin",
    title: "이순신 장군의 광화문 동상 하소연",
    genre: "웅장한 오케스트라 랩 (Epic Orchestral Rap)",
    styleName: "Cyberpunk Bass",
    source: "광화문 사거리의 숨 막히는 매연과 비둘기 똥을 정면으로 맞으며, 치열한 현대 사회를 살아가는 후손들에게 건네는 장군의 웅장한 가르침과 팩폭 독백",
    visual: "거대한 이순신 장군 동상이 힙합 마이크를 쥐고 광화문 네온 빌딩 숲을 내려다보며 사자후를 내뿜는 아트",
    suggestedTags: ["#이순신", "#광화문동상", "#위인환생", "#웅장한힙합", "#역사디스"],
    tab_type: "history"
  },
  {
    id: "history-jeongjo",
    title: "정조대왕의 격조 높은 팩트 폭격",
    genre: "퓨전 국악 락 (Gagaku Fusion Rock)",
    styleName: "Dark Synthwave",
    source: "의미 없는 줄타기 대신 매사 정공법과 격조 높은 서사로 후손들의 뼈를 유쾌하게 때리는, 본캐 정조의 통쾌한 조선 힙스터 환생송",
    visual: "붉은 곤룡포를 입고 현대식 에어팟을 낀 정조가 금색 팩트 폭격 마이크를 든 카리스마 넘치는 동양화풍 그래픽",
    suggestedTags: ["#정조대왕", "#팩트폭행", "#조선힙스터", "#국악락", "#본캐환생"],
    tab_type: "history"
  },
  {
    id: "history-saimdang",
    title: "5만원권 신사임당의 예술가 탈출기",
    genre: "신디사이저 시티팝 (80s Synthpop)",
    styleName: "Chillwave Drift",
    source: "정형화된 현모양처 이미지를 벗어던지고 지폐 밖으로 탈출해 본인의 숨겨진 예술적 영감을 홍대 거리에 분출하는 힙스터 신사임당의 반전 선포",
    visual: "5만원 지폐 일러스트의 신사임당이 네온 선글라스를 끼고 스프레이 캔을 든 채 춤추는 그라피티 아트",
    suggestedTags: ["#신사임당", "#5만원권", "#부캐환생", "#시티팝", "#조선힙스터"],
    tab_type: "history"
  },
  {
    id: "history-sejong",
    title: "세종대왕의 훈민정음 킹받음 송",
    genre: "하이퍼팝 (Hyperpop)",
    styleName: "Cyberpunk Bass",
    source: "줄임말과 한글 파괴가 넘쳐나는 요즘 세태를 애민정신으로 개탄하며 아름다운 국어를 소중히 쓰자는 위인의 따끔하고 애정 어린 훈민정음 일침",
    visual: "한글 자음과 모음이 번개처럼 사방으로 튀고 훈민정음 책을 펼쳐 든 세종대왕이 분노하는 테크니컬 디자인",
    suggestedTags: ["#세종대왕", "#한글파괴", "#훈민정음", "#하이퍼팝", "#급식체디스"],
    tab_type: "history"
  },

  // 3. 🏢 현대인/직장인 격공 유발 (human)
  {
    id: "human-study-cafe",
    title: "카공족 vs 카페 사장님의 뫼비우스 디스",
    genre: "어쿠스틱 포크 -> 데스메탈 반전",
    styleName: "Late Night Lo-Fi",
    source: "아이스 아메리카노 한 잔 시켜놓고 콘센트 4곳을 점령해 8시간째 요새를 구축한 카공족과 뒤에서 지켜보는 카페 사장님의 피 끓는 락 발라드 대치전",
    visual: "낡은 노트북 위에 얇은 빨대가 꽂힌 거대한 테이크아웃 컵과 주변에서 활활 타오르는 화난 눈빛의 배경 그래픽",
    suggestedTags: ["#카공족", "#카페빌런", "#자영업자", "#포크락", "#인간군상"],
    tab_type: "human"
  },
  {
    id: "human-instagram",
    title: "인스타 웰빙녀의 배달 야식 멸망송",
    genre: "밝고 통통 튀는 틱톡 댄스 (TikTok Dance)",
    styleName: "Chillwave Drift",
    source: "인스타그램 피드에는 샐러드와 한강 런닝 인증샷을 가득 도배하지만 실상은 침대에서 치킨과 엽떡을 흡입하는 현대인의 사랑스러운 모순",
    visual: "화면 절반은 눈부신 샐러드 테이블, 나머지 절반은 늘어난 티셔츠를 입고 피자를 먹는 캐릭터의 극단적인 반전 9:16 분할 화면",
    suggestedTags: ["#인스타그램", "#모순의삶", "#배달야식", "#틱톡밈", "#인간군상"],
    tab_type: "human"
  },
  {
    id: "human-monday",
    title: "퇴사 호소인의 카드값 출근 굴레",
    genre: "펑키 하우스 (Funky House)",
    styleName: "Late Night Lo-Fi",
    source: "일요일 밤에는 사표 메일을 상상하지만 월요일 아침 청구서를 확인하고 빛의 속도로 지옥철에 탑승하는 전형적인 월요병 탈출 격공 송",
    visual: "뫼비우스의 띠 모양으로 도는 퇴근-출근 열차 위를 허겁지겁 달리는 좀비 정장 회사원 일러스트",
    suggestedTags: ["#퇴사호소인", "#월요병", "#카드노예", "#직장인밈", "#현대인격공"],
    tab_type: "human"
  },
  {
    id: "human-mbti",
    title: "MBTI 과몰입러의 인간관계 낙인 송",
    genre: "8비트 레트로 칩튠 (Retro Chiptune)",
    styleName: "Late Night Lo-Fi",
    source: "첫 만남 10초 만에 상대방의 T/F 여부를 집요하게 구분하고 '너 T발 C야?' 라며 16개 유형의 틀에 가둬 버리는 킹받는 과몰입러 저격송",
    visual: "MBTI 알파벳 블록들이 테트리스처럼 떨어지고 그 사이에 갇혀 살려달라고 소리치는 귀여운 픽셀 캐릭터",
    suggestedTags: ["#MBTI과몰입", "#T발C", "#과몰입러", "#레트로게임", "#팩트폭행"],
    tab_type: "human"
  },
  {
    id: "human-success-gaslighting",
    title: "자존감 떡상 성공 확언송 (초긍정 부자 밈)",
    genre: "K-Pop 댄스",
    styleName: "Funk Disco",
    source: "새벽 4시 기상이나 찬물 샤워 같은 숨막히는 조건 없이, '너의 존재 자체가 이미 100억짜리 명품이니까 기죽지 마라! 넌 결국 성공할 귀한 몸이다!'라고 유쾌하게 자존감을 수직 상승시켜 주는 초긍정 확언 응원곡",
    visual: "네온 골드 왕관을 쓰고 당당하게 미소 짓고 있는 귀여운 아기 사자 캐릭터가 금빛 무대 위에서 춤추는 B급 감성 카툰 일러스트",
    suggestedTags: ["#성공확언", "#자존감떡상", "#초긍정파워", "#할수있다", "#기살리기"],
    tab_type: "challenge"
  },
  {
    id: "human-fact-encouragement",
    title: "우주 최강 기살리기 송 (자존감 충전 밈)",
    genre: "펑크 락",
    styleName: "Punk Rock",
    source: "남들의 시선이나 완벽주의 압박을 훌훌 털어내고, '네가 어떤 실수나 실패를 하든 넌 여전히 세상에서 가장 가치 있고 귀엽다! 어깨 펴고 맛있는 거나 먹으러 가자!'라고 외쳐 주는 유쾌하고 든든한 펑크 락 떼창 응원곡",
    visual: "화려한 응원단 리본을 달고 신나게 메가폰을 든 채 양손으로 하트를 그리는 귀여운 우주인 캐릭터의 9:16 코믹 일러스트",
    suggestedTags: ["#기살리기", "#자존감충전", "#실수해도괜찮아", "#우주최강귀요미", "#떼창응원"],
    tab_type: "challenge"
  },

  // 3-2. ❤️ 연애/남녀 심리 (relationship)
  {
    id: "relationship-translation",
    title: "여친의 '화 안 났어' 번역기 (연애 행동학 밈)",
    genre: "웅장한 오케스트라 힙합",
    styleName: "Epic Orchestral Hip-hop",
    source: "여자친구의 단답형 카톡인 '응', '화 안 났어'라는 말속에 숨겨진 실제 분노 지수와 남성의 킹받는 심리 상태를 위트 있게 번역해 주는 연애 행동학 송",
    visual: "거대한 '응.' 단답형 텍스트 위로 빨간 경고 사이렌이 울리고 있고, 당황한 강아지 캐릭터가 진땀을 흘리는 9:16 카툰 일러스트",
    suggestedTags: ["#나화안났어", "#답답주의", "#연애행동학", "#커플공감", "#스릴러랩"],
    tab_type: "relationship"
  },
  {
    id: "relationship-waiting",
    title: "안읽씹/읽씹 뇌절 방지송 (연애 심리학 밈)",
    genre: "신나는 하이퍼팝",
    styleName: "Hyperpop",
    source: "카톡 창의 숫자 '1'이 안 사라지는 30분 동안 머릿속으로 온갖 소설을 집필하며 고뇌하다가 결국 '비행기 모드'를 켜는 소심한 짝사랑러의 연애 심리 댄스곡",
    visual: "거대한 모래시계 속에 갇혀서 숫자 '1'을 바라보며 눈물을 머금고 있는 고양이 캐릭터의 9:16 레트로 도트 그래픽",
    suggestedTags: ["#안읽씹", "#읽씹", "#뇌절방지", "#짝사랑심리", "#하이퍼팝"],
    tab_type: "relationship"
  },
  {
    id: "relationship-cool-breakup",
    title: "쿨하지 못한 이별 극복송 (이별 행동학 밈)",
    genre: "R&B로 시작해 메탈로 터지는 댄스",
    styleName: "Late Night Lo-Fi",
    source: "말로는 '쿨하게 헤어지자'며 이별해 놓고, 뒤돌아서 이불 속에서 전 애인 인스타그램 염탐하다가 실수로 '좋아요'를 눌렀을 때의 대참사를 다룬 웃픈 이별극복송",
    visual: "깨진 하트 선글라스를 낀 햄스터가 스마트폰을 들고 동공지진을 일으키며 이불 속에 숨어 있는 9:16 B급 일러스트",
    suggestedTags: ["#이불킥", "#인스타염탐", "#쿨하지못해", "#이별대참사", "#웃픈이별"],
    tab_type: "relationship"
  },

  // 4. 📣 B급 광고 패러디 (brand)
  {
    id: "brand-buldak",
    title: "불닭 맵부심 지옥의 묵시록",
    genre: "애니 OST/락",
    styleName: "High Energy J-Rock",
    source: "불닭볶음면을 먹고 온몸이 불타는 지옥을 경험하면서도 친구 앞에서는 쎈척하며 안 맵다고 허세 부리다 결국 화장실로 피난 가는 대참사 패러디송",
    visual: "입에서 화염을 뿜어내는 용의 탈을 쓴 사람이 눈물을 흘리며 불타는 컵라면을 들고 절규하는 9:16 일러스트",
    suggestedTags: ["#불닭볶음면", "#맵부심", "#허세작렬", "#위장파괴", "#병맛패러디"],
    tab_type: "brand"
  },
  {
    id: "brand-iphone",
    title: "아이폰 액정 박살 슬픔송",
    genre: "웅장한 오케스트라 락 발라드",
    styleName: "Epic Orchestral Ballad",
    source: "할부도 안 끝난 최신 아이폰을 콘크리트 바닥에 떨어뜨린 그 영원의 찰나, 우주 멸망급 절망을 찬가로 담은 비장미 극대화 패러디송",
    visual: "거미줄처럼 박살 난 네온 유리 파편들 사이로 아이폰 액정이 슬프게 우주 공간에 부유하는 비장한 3D 그래픽",
    suggestedTags: ["#아이폰액정", "#설탕액정", "#내돈내산", "#할부지옥", "#인생최대슬픔"],
    tab_type: "brand"
  },
  {
    id: "brand-starbucks",
    title: "스타벅스 생색 뉴요커의 하루",
    genre: "로-파이 힙합 / 재즈홉 (Lo-Fi Jazzhop)",
    styleName: "Late Night Lo-Fi",
    source: "6천원짜리 아아 한 잔 시켜두고 3시간 동안 턱 괴고 인텔리한 척 서사를 쓰지만 실제로는 유튜브 쇼츠만 무한 스크롤 중인 허세 카공족 저격송",
    visual: "감성 조명 아래 초록색 로고 테이크아웃 컵 뒤로, 노트북 모니터에서 고양이 유튜브 영상이 돌아가고 있는 Lo-Fi 그래픽",
    suggestedTags: ["#스타벅스", "#허세뉴요커", "#카공족", "#쇼츠망령", "#B급풍자"],
    tab_type: "brand"
  },
  {
    id: "brand-gym",
    title: "기부천사 헬스장 탕진 송",
    genre: "펑크 디스코 (Funky Disco)",
    styleName: "Funk Disco",
    source: "운동은 안 가고 매달 헬스장에 회비만 꼬박꼬박 기부하며, 오직 1년에 서너 번 샤워하러 들러서 샤워물만 콸콸 쓰고 나오는 헬스장 노예들의 자폭 댄스곡",
    visual: "샤워 볼과 샴푸통이 땀방울을 흘리며 복고풍 미러볼 아래에서 춤추는 신나는 레트로 일러스트",
    suggestedTags: ["#헬스장기부", "#기부천사", "#다이어트포기", "#자폭댄스", "#디스코패러디"],
    tab_type: "brand"
  },

  // 5. 🎬 K-드라마 & 명대사 패러디 (drama)
  {
    id: "drama-yeonjin",
    title: "연진아 내 꿈은 너야 (카드값 팩폭)",
    genre: "웅장한 오페라 힙합",
    styleName: "Cyberpunk Bass",
    source: "더 글로리의 명대사를 패러디하여, 알파벳 연진이로 가득 찬 일상과 카드값 갚아달라고 울부짖는 통쾌하고 유쾌한 팩폭 숏폼 송",
    visual: "체스판 위에 세워진 연진이 모형과 그 위로 퍼지는 붉은 네온 조명, 100만 뷰 숏폼 팝업창 모션 아트",
    suggestedTags: ["#더글로리", "#연진아", "#내꿈은너야", "#카드값팩폭", "#드라마패러디"],
    tab_type: "drama"
  },
  {
    id: "drama-jinsil",
    title: "어이 동생 진실의 방으로 (거짓 연차 저격)",
    genre: "헤비 붐뱁 힙합",
    styleName: "Dark Synthwave",
    source: "범죄도시 마석도 형님의 명대사를 가져와 개인 사정이라 연차 쓰고 제주도 감성 카페로 도망친 사원을 유쾌하게 저격하는 진실의 방 패러디송",
    visual: "거대한 주먹 일러스트 위로 '진실의 방으로' 텍스트가 번쩍이고 당황한 정장 캐릭터가 진땀 흘리는 9:16 카툰 아트",
    suggestedTags: ["#범죄도시", "#진실의방으로", "#마석도", "#거짓연차", "#회사원저격"],
    tab_type: "drama"
  },

  // 6. 🐶 댕냥이 & 집사 속마음 번역기 (pet)
  {
    id: "pet-empty-bowl",
    title: "집사야 밥그릇이 3초간 비었다",
    genre: "하이퍼팝 / 신디사이저 댄스",
    styleName: "Chillwave Drift",
    source: "사료 그릇이 3초간 비었다고 집사 이불 위에서 꾹꾹이 및 사자후를 외치며 츄르를 요구하는 고양이 속마음 번역 댄스곡",
    visual: "빈 사료 그릇 옆에서 왕관을 쓴 고양이가 집사 신발을 노려보며 레이저 눈빛을 쏘는 귀여운 9:16 카툰 일러스트",
    suggestedTags: ["#고양이속마음", "#집사수난시대", "#츄르내놔", "#밥그릇3초", "#댕냥이밈"],
    tab_type: "pet"
  },
  {
    id: "pet-walk-rain",
    title: "산책 가자 해놓고 장마철",
    genre: "어쿠스틱 포크 / 락",
    styleName: "Late Night Lo-Fi",
    source: "산책 가자고 신나게 꼬리 쳤더니 장비 풀장착하고 비 내리는 거리로 끌고 나온 집사를 원망하는 강아지의 유쾌한 억울함 찬가",
    visual: "노란 우비를 입고 빗물 웅덩이에 젖은 강아지가 시무룩한 표정으로 억울함을 호소하는 감성 레트로 도트 아트",
    suggestedTags: ["#강아지산책", "#장마철산책", "#집사원망", "#우비강아지", "#댕냥이공감"],
    tab_type: "pet"
  }
];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceSupabase = createSupabaseClient(supabaseUrl!, serviceRoleKey!);

    // 1. Supabase curation_playbooks 테이블에서 category가 'viral_cf'인 프리셋 조회 (최신순 정렬)
    const { data: playbooks, error } = await serviceSupabase
      .from('curation_playbooks')
      .select('*')
      .eq('category', 'viral_cf')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[API/viral-cf/presets] DB 조회 실패, Seed 폴백 사용:', error.message);
      const seeds = SEED_VIRAL_CONCEPTS.map(c => ({ ...c, created_date: "2026-07-21" }));
      return NextResponse.json({ success: true, presets: seeds });
    }

    // 2. DB에 데이터가 있으면 포맷 변환하여 리턴
    if (playbooks && playbooks.length > 0) {
      const formatted = playbooks.map((pb: any, idx: number) => {
        const metadata = pb.metadata || {};
        let dateStr = metadata.created_date;
        if (!dateStr && pb.created_at) {
          dateStr = new Date(pb.created_at).toISOString().split('T')[0];
        }
        if (!dateStr) {
          dateStr = "2026-07-21";
        }
        return {
          id: pb.id,
          title: pb.title,
          genre: metadata.genre || "기타",
          styleName: metadata.styleName || "Dark Synthwave",
          source: metadata.description || pb.content.slice(0, 100),
          visual: metadata.visual || "기본 9:16 비주얼",
          suggestedTags: metadata.suggestedTags || ["#바이럴", "#숏폼"],
          tab_type: metadata.tab_type || (['drama', 'pet', 'relationship', 'human', 'trend', 'challenge', 'brand', 'history'][idx % 8]),
          created_date: dateStr
        };
      });
      return NextResponse.json({ success: true, presets: formatted });
    }

    // 3. 데이터가 비어있으면 Seed 폴백 리턴
    const seeds = SEED_VIRAL_CONCEPTS.map(c => ({ ...c, created_date: "2026-07-21" }));
    return NextResponse.json({ success: true, presets: seeds });
  } catch (error) {
    console.error('[API/viral-cf/presets] 에러 발생:', error);
    const seeds = SEED_VIRAL_CONCEPTS.map(c => ({ ...c, created_date: "2026-07-21" }));
    return NextResponse.json({ success: true, presets: seeds });
  }
}
