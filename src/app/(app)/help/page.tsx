"use client";

import { useState } from "react";
import { Search, MessageSquare, ChevronDown, BookOpen, ShieldCheck, CreditCard, Link as LinkIcon, X } from "lucide-react";

interface FAQItem {
  category: "copyright" | "billing" | "incubator" | "youtube";
  q: string;
  a: string;
}

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const categories = [
    {
      key: "copyright",
      title: "저작권 및 지적 재산권",
      desc: "AI가 생성한 아티스트와 트랙의 상업적 권리, 로열티 및 소유권에 대해 알아보세요.",
      icon: ShieldCheck,
      color: "blue",
      activeStyle: "border-blue-500/50 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.15)]",
      iconBg: "bg-blue-500/10 border-blue-500/30 text-blue-400"
    },
    {
      key: "billing",
      title: "청구 및 토큰",
      desc: "구독을 관리하고, 토큰 생성 사용량을 확인하고, 레이블 등급을 업그레이드하세요.",
      icon: CreditCard,
      color: "green",
      activeStyle: "border-green-500/50 bg-green-500/5 shadow-[0_0_20px_rgba(34,197,94,0.15)]",
      iconBg: "bg-green-500/10 border-green-500/30 text-green-400"
    },
    {
      key: "incubator",
      title: "아티스트 인큐베이터 가이드",
      desc: "완벽한 페르소나 프롬프트를 만들고 세계관을 구축하는 방법에 대한 단계별 마스터클래스입니다.",
      icon: BookOpen,
      color: "fuchsia",
      activeStyle: "border-fuchsia-500/50 bg-fuchsia-500/5 shadow-[0_0_20px_rgba(217,70,239,0.15)]",
      iconBg: "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400"
    },
    {
      key: "youtube",
      title: "유튜브 및 SNS 동기화",
      desc: "API 연결, 자동 게시 제한 및 다중 채널 라우팅 문제를 해결합니다.",
      icon: LinkIcon,
      color: "red",
      activeStyle: "border-red-500/50 bg-red-500/5 shadow-[0_0_20px_rgba(239,68,68,0.15)]",
      iconBg: "bg-red-500/10 border-red-500/30 text-red-400"
    }
  ];

  const faqs: FAQItem[] = [
    {
      category: "copyright",
      q: "생성된 음악의 저작권은 누구에게 있나요?",
      a: "구독 중인 유저에게 있습니다. 플랜을 활성화한 정기 구독 유저는 생성된 모든 트랙에 대해 100% 상업적 권리(Commercial Rights)를 보유하므로, 스트리밍 플랫폼 음원 등록 및 유튜브 등에서의 수익 창출이 완전히 합법적으로 보장됩니다."
    },
    {
      category: "copyright",
      q: "유튜브 동영상에 저작권 경고(Copyright Claim)가 뜨면 어떻게 하나요?",
      a: "Melodio의 듀얼 생성 엔진 시스템은 고유(Unique) 음원만을 추출하므로 원칙적으로 중복이나 저작권 충돌이 발생하지 않습니다. 하지만 유튜브 Content ID 시스템의 오탐지로 인해 소유권 주장 경고가 뜨는 드문 경우에는, 당사 IP 권리 인증 센터에서 제공하는 공식 이의 제기(Dispute) 서류 및 파트너 증빙 템플릿을 제출하여 24시간 내에 해결할 수 있습니다."
    },
    {
      category: "copyright",
      q: "무료 체험(Free) 플랜 상태에서 생성한 음원도 배포나 상업적 사용이 가능한가요?",
      a: "아니요, 무료 티어 상태에서 생성한 음원은 오직 개인적인 감상 및 비상업적 용도로만 제한됩니다. 상업적으로 음원을 유통하거나 유튜브 채널을 연동하여 수익을 창출하려면 Pro 이상의 유료 플랜을 활성화해야 합니다."
    },
    {
      category: "billing",
      q: "사용하고 남은 생성 토큰은 다음 달로 이월되나요?",
      a: "아니요, 제공되는 크레딧 토큰은 매월 정기 결제일에 맞춰 잔여량이 리셋되며 이월되지 않습니다. 다만 '스튜디오(Studio)' 및 '비즈니스(Business)' 플랜 사용자의 경우, 긴급 음원 추출을 위한 추가 크레딧 구매(Token Fill-up Pack) 기능 및 일부 잔여량 일시 보관(Vaulting) 서비스를 지원하고 있습니다."
    },
    {
      category: "billing",
      q: "구독을 중도 해지하면 이전에 만든 곡들의 상업적 권리는 어떻게 되나요?",
      a: "구독 유효 기간 중에 정식으로 생성 및 다운로드된 음원의 상업적 독점 사용 권리는 구독을 취소하거나 만료된 후에도 영구히 유지됩니다. 즉, 과거 구독 시점에 배포한 음원에 대해 소급 적용되거나 저작권 침해 주장이 발생하지 않으니 안심하고 계속 유통하셔도 무방합니다."
    },
    {
      category: "incubator",
      q: "아티스트 인큐베이터에서 고품질 프롬프트를 빌딩하는 노하우가 있나요?",
      a: "아티스트 인큐베이터 페이지에서 인격체(Persona)의 장르 조합, 지향 보컬 톤, 감정선을 명확히 묘사해 주실수록 완성도 높은 트랙이 출력됩니다. 또한 Style Library 메뉴의 우측 Drawer(슬라이드 오버 패널) 기능을 사용하면 현재 작업 맥락과 화면 스크롤 위치를 유지한 상태로 즉각 프롬프트를 튜닝하고 데모곡을 바로 생성해 확인할 수 있어 워크플로우 효율이 극대화됩니다."
    },
    {
      category: "incubator",
      q: "환경음 믹스(ASMR Layer) 기능은 구체적으로 어떻게 동작하나요?",
      a: "빗소리, 카페 소음, 대나무 숲 바람 소리, 바다 파도 등 폴리 사운드 배경음이 최적화된 프리셋(예: J-Lofi Focus, Tokyo Midnight Jazz 등)을 적용하면 환경음 조절 슬라이더가 나타납니다. 볼륨 값은 골든 레시오인 '20% (추천)' 상태로 자동 세팅되며, 정밀 백분율 정렬 레이블을 보며 음소거(0%)부터 강함(100%)까지 정밀 조작해 자연어 지시문을 Suno 엔진 스타일 태그에 가공 탑재합니다."
    },
    {
      category: "incubator",
      q: "커스텀 프리셋 카드에서 마크다운 키 이름(key_name)은 어떻게 복사하나요?",
      a: "자체 제작 또는 보관된 프리셋 상세 정보 팝업 모달 우측 '컨셉 미리보기' 하단을 보시면 `deep-house.md` 등과 같은 고유 영문 키명이 기재되어 있습니다. 해당 텍스트 영역을 마우스로 가볍게 한 번 클릭하시면 별도 타이핑 없이 클립보드에 키 이름이 자동 복사되어 텔레그램 `/Set` 파이프라인에서 매우 편리하게 로드할 수 있습니다."
    },
    {
      category: "youtube",
      q: "생성 완료된 내 AI 아티스트 음원을 Spotify나 Apple Music에 유통하려면 어떻게 해야 하나요?",
      a: "Melodio 웹앱 대시보드에서 해당 곡의 'WAV 고음질 오디오 다운로드'를 진행한 뒤, DistroKid, TuneCore, 혹은 Sound Republica 등 표준 유통사 대행 채널을 통해 글로벌 플랫폼에 정식 아티스트 명의로 신규 발매 등록하시면 됩니다."
    },
    {
      category: "youtube",
      q: "유튜브 연동 및 SNS 자동 게시(Publishing) 스케줄링 제한이 있나요?",
      a: "비즈니스(Business) 플랜 회원은 예약 스케줄러 시스템을 통해 특정 시간대를 커스텀 예약해 유튜브 채널로 영상 및 숏폼 클립을 자동 동기화 송출할 수 있습니다. 연동 중에 API 인증 만료로 연결이 끊길 시, [설정] 페이지의 '유튜브 계정 관리' 섹션에서 OAuth 재인증을 한 번 클릭해 주시면 즉시 원격 복구됩니다."
    }
  ];

  // Filtering Logic
  const filteredFaqs = faqs.filter(faq => {
    if (selectedCategory && faq.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesQ = faq.q.toLowerCase().includes(query);
      const matchesA = faq.a.toLowerCase().includes(query);
      return matchesQ || matchesA;
    }
    return true;
  });

  const handleCategoryClick = (categoryKey: string) => {
    setSelectedCategory(selectedCategory === categoryKey ? null : categoryKey);
    setOpenIndex(null); // Reset open FAQ item to avoid confusion
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategory(null);
    setOpenIndex(null);
  };

  return (
    <div className="max-w-6xl mx-auto pt-4 h-full flex flex-col pb-20 select-none">
      {/* 헤더 — 통일된 표준 브랜드 헤더 */}
      <header className="mb-8 border-b border-white/10 pb-6">
        <h1 className="text-4xl font-bold text-white mb-2">Help Center & FAQ</h1>
        <p className="text-zinc-400 mb-4">자주 묻는 질문, 저작권 가이드 및 고객지원 가이드.</p>
        <div className="relative max-w-xl">
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setOpenIndex(null);
            }}
            placeholder="답변을 검색하거나 키워드를 입력해보세요..." 
            className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-10 text-white text-lg focus:border-fuchsia-500 outline-none transition-all shadow-[0_0_20px_rgba(192,38,211,0.1)]" 
          />
          <Search className="absolute left-4 top-4.5 w-6 h-6 text-fuchsia-400" />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-5 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Interactive Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = selectedCategory === cat.key;
          return (
            <div 
              key={cat.key}
              onClick={() => handleCategoryClick(cat.key)}
              className={`glass-panel p-6 flex items-start gap-4 hover:border-white/20 transition-all cursor-pointer group border ${
                isActive ? cat.activeStyle : "border-white/10"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform ${cat.iconBg}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold mb-1 group-hover:text-fuchsia-300 transition-colors">{cat.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{cat.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Frequently Asked Questions */}
      <div className="glass-panel p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>자주 묻는 질문 (FAQ)</span>
            <span className="text-sm font-normal text-zinc-500">
              ({filteredFaqs.length}개 검색됨)
            </span>
          </h2>
          {(selectedCategory || searchQuery) && (
            <button 
              onClick={handleClearFilters}
              className="text-xs text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1 transition-colors"
            >
              필터 초기화 <X className="w-3 h-3" />
            </button>
          )}
        </div>
        
        {filteredFaqs.length > 0 ? (
          <div className="space-y-3">
            {filteredFaqs.map((faq, idx) => (
              <div key={idx} className="border border-white/10 rounded-xl bg-black/30 overflow-hidden transition-all hover:border-white/20">
                <button 
                  onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                  className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                >
                  <span className="font-medium text-zinc-200 text-sm">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${openIndex === idx ? 'rotate-180 text-fuchsia-400' : ''}`} />
                </button>
                {openIndex === idx && (
                  <div className="px-6 py-4 border-t border-white/5 bg-black/50">
                    <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-xl bg-black/20">
            <p className="text-zinc-500 text-sm">검색 결과에 맞는 FAQ 항목이 없습니다.</p>
            <button 
              onClick={handleClearFilters}
              className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-fuchsia-600/30 border border-fuchsia-500/50 hover:bg-fuchsia-600/50 rounded-lg transition-colors"
            >
              모든 FAQ 보기
            </button>
          </div>
        )}
      </div>
      
      <div className="mt-8 text-center flex flex-col items-center">
        <p className="text-zinc-500 mb-4 text-sm">해결되지 않은 질문이 있으신가요?</p>
        <a
          href="mailto:support@melodio.app?subject=Melodio%20고객%20지원%20문의"
          className="px-6 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white font-medium text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
        >
          <MessageSquare className="w-4 h-4 text-fuchsia-400" /> support@melodio.app에 이메일 보내기
        </a>
      </div>
    </div>
  );
}
