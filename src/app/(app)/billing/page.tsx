"use client";

import { useState } from "react";
import { Sparkles, Check } from "lucide-react";

export default function BillingPage() {
  const [sunoMode, setSunoMode] = useState<'builtin' | 'byo'>('builtin');

  // 크레딧 차감율 설계
  const creditRates = {
    branding: 10,
    banner: 20,
    profile: 10,
    thumbnail: 15,
    musicBuiltIn: 100,
    musicBYO: 5,
    videoShorts: 50,
    videoLongform: 500,
  };

  const plans = [
    {
      name: "무료 체험 (Free)",
      price: "0",
      desc: "기본 자율운영 기능 및 에셋 제작 체험",
      color: "border-zinc-800 bg-zinc-950/20",
      textColor: "text-zinc-400",
      badge: "회원가입 즉시",
      credits: "200 크레딧 (1회성)",
      features: [
        "AI 채널 작명 & 기획서 생성 1회/일",
        "음악 및 영상 생성 맛보기 체험",
        "유튜브 다국어 번역 1회/일",
        "AI 썸네일 제작 체험",
        "스타일 라이브러리 포맷 체험",
      ],
      locked: [
        "유튜브 채널 아트 배너 생성",
        "유튜브 채널 프로필 로고 생성",
        "자율주행 스케줄 자동 업로드",
        "다중 채널 연동 운영",
        "4K 비디오 렌더링 및 유통",
      ],
      buttonText: "현재 무료 플랜 적용 중",
      current: true,
    },
    {
      name: "베이직 (Basic)",
      price: "55,000",
      desc: "소량~대량 콘텐츠 최적화 제작 및 업로드",
      color: "border-white/10 bg-black/40",
      textColor: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
      badge: "가성비 추천",
      credits: "매월 3,000 크레딧 충전",
      features: [
        "Melodio Studio 영상 편집 툴",
        "AI 채널명/소개글/고정댓글 번역 무제한",
        "유튜브 소비국 탑 81개국 번역 지원",
        "유튜브 채널 1개 연동",
        "AI 썸네일 & 배너 & 프로필 무제한 생성",
        "생성 콘텐츠 상업적 권리 100% 본인 소유",
        "Suno 개인 계정 연동 (BYO) 지원",
      ],
      locked: [
        "원클릭 24시간 풀 자동 업로드",
        "음원 유통 및 발매 자동화",
        "다중 채널 연동 (5개 이상)",
        "데이터 기반 곡 자동 선별 알고리즘",
      ],
      buttonText: "베이직 요금제 구독하기",
      current: false,
    },
    {
      name: "프로 (Pro)",
      price: "110,000",
      desc: "원클릭 전 과정 자동화 및 다중 채널 운영",
      color: "border-fuchsia-500/30 bg-fuchsia-950/5 relative ring-1 ring-fuchsia-500/20 shadow-[0_0_50px_rgba(217,70,239,0.05)]",
      textColor: "text-fuchsia-400 border-fuchsia-500/40 bg-fuchsia-500/15",
      badge: "인기 선택",
      credits: "매월 7,500 크레딧 충전 (2.5배)",
      features: [
        "베이직 요금제의 모든 혜택 포함",
        "원클릭 스케줄러 자동 렌더링 & 업로드",
        "유튜브 채널 최대 5개 동시 연동",
        "음원 발매 및 유통 대행 자동화",
        "데이터 기반 트렌드 곡 자동 선정 시스템",
        "우선 순위 초고속 렌더링 서버 배정",
        "태그 분석 및 영상 찾기 (트렌드 탐색)",
      ],
      locked: [
        "완전 무인 10개 채널 풀 자동화",
      ],
      buttonText: "프로 요금제 업그레이드",
      current: false,
    },
    {
      name: "엔터프라이즈 (Enterprise)",
      price: "330,000",
      desc: "완전 무인 자율주행 및 채널 대량 자동 운영",
      color: "border-cyan-500/30 bg-cyan-950/5 relative ring-1 ring-cyan-500/20 shadow-[0_0_50px_rgba(6,182,212,0.05)]",
      textColor: "text-cyan-400 border-cyan-500/40 bg-cyan-500/15",
      badge: "비즈니스 최적화",
      credits: "매월 25,000 크레딧 충전",
      features: [
        "프로 요금제의 모든 혜택 포함",
        "썸네일 지정만으로 제작~업로드 풀 자동화",
        "유튜브 채널 최대 10개 동시 운영",
        "비디오 업스케일러 및 최고화질 지원",
        "수동 작업 대비 고품질 콘텐츠 루프",
        "전용 서버 할당 및 1:1 브랜드 컨설팅",
        "음원 유통 수익 정산 관리 대시보드",
      ],
      locked: [],
      buttonText: "엔터프라이즈 문의하기",
      current: false,
    }
  ];

  return (
    <div className="flex flex-col gap-8 h-full overflow-y-auto pb-10 pr-2 no-scrollbar">
      {/* 상단 헤더 — 통일된 표준 브랜드 헤더 */}
      <header className="mb-8 border-b border-white/10 pb-6">
        <h1 className="text-4xl font-bold text-white mb-2">Billing & Subscription</h1>
        <p className="text-zinc-400">Melodio 자율운영 플랫폼 하이브리드 크레딧 요금 체계 및 구독 플랜 관리.</p>
      </header>

      {/* 하이브리드 토글 및 크레딧 차감율 안내 */}
      <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Suno AI 음악 생성 모드 설정
            </h3>
            <p className="text-[11px] text-zinc-400">
              Suno 계정을 직접 연동하면 곡당 크레딧 소모가 95% 감소합니다.
            </p>
          </div>

          <div className="bg-black/40 border border-white/10 p-1 rounded-xl flex gap-1.5 shrink-0 self-start md:self-auto">
            <button
              onClick={() => setSunoMode('builtin')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                sunoMode === 'builtin'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Melodio 내장 API 모드
            </button>
            <button
              onClick={() => setSunoMode('byo')}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                sunoMode === 'byo'
                  ? 'bg-fuchsia-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Suno 계정 연동 모드 (BYO)
            </button>
          </div>
        </div>

        {/* 크레딧 차감 테이블 */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-zinc-300">작업별 크레딧 차감 기준 안내</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-1">
              <span className="text-[10px] text-zinc-500 font-semibold block">AI 브랜드 기획서</span>
              <span className="text-xs font-bold text-white block">{creditRates.branding} 크레딧 / 건</span>
            </div>
            
            <div className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-1">
              <span className="text-[10px] text-zinc-500 font-semibold block">채널 아트 배너 (16:9)</span>
              <span className="text-xs font-bold text-white block">{creditRates.banner} / 프로필 {creditRates.profile} 크레딧</span>
            </div>

            <div className={`p-3 rounded-xl border transition-all space-y-1 ${
              sunoMode === 'byo' 
                ? 'bg-fuchsia-950/20 border-fuchsia-500/20 shadow-[0_0_15px_rgba(217,70,239,0.05)]' 
                : 'bg-indigo-950/20 border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.05)]'
            }`}>
              <span className="text-[10px] font-bold block flex items-center justify-between">
                <span className={sunoMode === 'byo' ? 'text-fuchsia-400' : 'text-indigo-400'}>AI 음악 생성 (Suno)</span>
                <span className={`text-[8px] px-1 rounded font-bold uppercase ${
                  sunoMode === 'byo' ? 'bg-fuchsia-500/20 text-fuchsia-300' : 'bg-indigo-500/20 text-indigo-300'
                }`}>
                  {sunoMode === 'byo' ? 'BYO 모드' : '내장 API 모드'}
                </span>
              </span>
              <span className="text-xs font-extrabold text-white block mt-0.5">
                {sunoMode === 'byo' ? (
                  <span className="flex items-center gap-1">
                    <span className="text-fuchsia-400">{creditRates.musicBYO} 크레딧</span>
                    <span className="text-[9px] text-zinc-500 font-normal line-through">{creditRates.musicBuiltIn}</span>
                  </span>
                ) : (
                  `${creditRates.musicBuiltIn} 크레딧 / 곡`
                )}
              </span>
            </div>

            <div className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-1">
              <span className="text-[10px] text-zinc-500 font-semibold block">동영상 컴필레이션 렌더링</span>
              <span className="text-xs font-bold text-white block">롱폼 {creditRates.videoLongform} / 숏폼 {creditRates.videoShorts} 크레딧</span>
            </div>
          </div>

          <p className="text-[10px] text-zinc-500 leading-relaxed pt-1 flex items-center gap-1">
            <InfoIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            {sunoMode === 'byo' ? (
              <span>수노 개인 연동 시 실제 수노 크레딧은 본인 수노 구독 요금제에서 별도 차감되며, Melodio에서는 영상 가공 및 자동 업로드 API 소모비만 최소로 차감됩니다.</span>
            ) : (
              <span>수노 계정 없이 가입 즉시 Melodio의 최상급 엔터프라이즈 API 크레딧을 사용하여 음악을 무제한으로 기획하고 생성합니다.</span>
            )}
          </p>
        </div>
      </div>

      {/* 요금제 카드 그리드 */}
      <div className="grid grid-cols-1 xl:grid-cols-4 md:grid-cols-2 gap-6 mt-2">
        {plans.map((plan, index) => (
          <div 
            key={index}
            className={`flex flex-col p-6 rounded-3xl border backdrop-blur-xl ${plan.color}`}
          >
            <div className="mb-5 space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">{plan.name}</h3>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${plan.textColor}`}>
                  {plan.badge}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed min-h-[32px] mt-1">{plan.desc}</p>
            </div>

            <div className="mb-5 pb-5 border-b border-white/5 space-y-1">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                <span className="text-zinc-500 text-xs font-medium">원 / 월</span>
              </div>
              <span className="text-xs font-bold text-indigo-400 block pt-1">{plan.credits}</span>
            </div>

            {/* 기능 리스트 */}
            <div className="flex-1 space-y-4 mb-6">
              <ul className="flex flex-col gap-2.5 text-[11px]">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="leading-tight">{f}</span>
                  </li>
                ))}
                {plan.locked && plan.locked.map((l, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-zinc-500">
                    <Check className="w-4 h-4 text-zinc-800 shrink-0 mt-0.5" />
                    <span className="leading-tight line-through decoration-zinc-700">{l}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 버튼 */}
            <button 
              disabled={plan.current}
              className={`w-full py-3.5 rounded-xl text-xs font-bold transition-all ${
                plan.current
                  ? 'bg-zinc-850 border border-zinc-700/80 text-zinc-500 cursor-default'
                  : plan.name.includes("프로")
                    ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:scale-[1.01]'
                    : 'bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300'
              }`}
            >
              {plan.buttonText}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// 간단 정보 아이콘
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
