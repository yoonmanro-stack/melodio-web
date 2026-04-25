import Link from "next/link";
import { ArrowRight, Globe, Target, Coins, Music, Bot, Video, Radio } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Melodio Japan — 세계 2위 음악 시장의 공백을 선점하세요",
  description: "일본어 AI 음악 채널을 만드는 크리에이터가 아직 없습니다. Melodio로 J-Lofi, 시티팝, 도쿄 재즈 채널을 5분 안에 시작하세요.",
  keywords: ["勉強用BGM", "集中力BGM", "作業用BGM", "カフェBGM", "夜のJazz", "シティポップ", "AI音楽", "YouTube音楽チャンネル"],
};

export default function JapanLandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">
      {/* ━━━ NAV ━━━ */}
      <nav className="fixed top-0 w-full z-50 backdrop-blur-xl bg-[#09090b]/80 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎵</span>
            <span className="font-bold text-lg bg-gradient-to-r from-[#FFD700] to-[#FFA500] bg-clip-text text-transparent">Melodio</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">로그인</a>
            <a href="/signup" className="text-sm px-4 py-2 rounded-lg bg-[#FFD700] text-black font-bold hover:bg-[#FFE44D] transition-colors">무료 시작</a>
          </div>
        </div>
      </nav>

      {/* ━━━ HERO ━━━ */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(255,215,0,0.08)_0%,transparent_70%)]" />
          <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(255,165,0,0.05)_0%,transparent_60%)]" />
        </div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#FFD700]/20 bg-[#FFD700]/5 mb-8 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-[#FFD700] animate-pulse" />
            <span className="text-sm font-medium text-[#FFD700]">🎌 Japan Market — Early Access</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black mb-6 leading-[1.1] tracking-tight">
            <span className="text-white">세계 2위 음악 시장이</span>
            <br />
            <span className="bg-gradient-to-r from-[#FFD700] via-[#FFE44D] to-[#FFA500] bg-clip-text text-transparent">지금 비어 있습니다.</span>
          </h1>

          {/* Sub */}
          <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-4 font-light leading-relaxed">
            일본어 AI 음악 채널을 만드는 크리에이터가 아직 없습니다.
            <br className="hidden sm:block" />
            Melodio로 그 자리를 먼저 차지하세요.
          </p>

          {/* Supporting copy */}
          <div className="max-w-xl mx-auto mb-10 space-y-1">
            <p className="text-sm text-zinc-500">영어 로파이? Lofi Girl이 1,300만 구독자로 닫았습니다.</p>
            <p className="text-sm text-zinc-500">한국어 AI 채널? 2026년, 경쟁이 시작됐습니다.</p>
            <p className="text-sm text-[#FFD700]/80 font-medium">일본어 채널은 — 아직 아무도 없습니다.</p>
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3">
            <a
              href="/signup"
              className="group inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black font-bold text-lg hover:shadow-[0_0_40px_rgba(255,215,0,0.3)] transition-all duration-300 hover:scale-105"
            >
              🎌 일본 채널 지금 시작하기 — 무료
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <span className="text-xs text-zinc-500">신용카드 불필요 · 5분 안에 첫 곡 완성</span>
          </div>
        </div>
      </section>

      {/* ━━━ PROBLEM — 왜 지금 일본인가? ━━━ */}
      <section className="py-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#FFD700]/[0.02] to-transparent" />
        <div className="max-w-5xl mx-auto relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">왜 지금 일본인가?</h2>
          <p className="text-center text-zinc-500 mb-12 text-sm">데이터가 말합니다 — 기회는 지금입니다</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm hover:border-[#FFD700]/20 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-[#FFD700]/10 flex items-center justify-center mb-4 group-hover:bg-[#FFD700]/20 transition-colors">
                <Globe className="w-6 h-6 text-[#FFD700]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">세계 2위, 하지만 아무도 없다</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                일본은 미국 다음으로 큰 음악 소비 국가입니다. 그런데 일본어로 AI 음악을 만드는 유튜브 채널은 손에 꼽습니다.
              </p>
            </div>
            {/* Card 2 */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm hover:border-[#FFD700]/20 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-[#FFD700]/10 flex items-center justify-center mb-4 group-hover:bg-[#FFD700]/20 transition-colors">
                <Target className="w-6 h-6 text-[#FFD700]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">장르는 이미 정해져 있다</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                J-Lofi 공부방 BGM, 도쿄 야간 재즈, 80년대 시티팝 리바이벌. 일본 시청자가 매일 검색하는 장르를 프리셋 한 번으로 즉시 생성.
              </p>
            </div>
            {/* Card 3 */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm hover:border-[#FFD700]/20 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-[#FFD700]/10 flex items-center justify-center mb-4 group-hover:bg-[#FFD700]/20 transition-colors">
                <Coins className="w-6 h-6 text-[#FFD700]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">월 18,000원으로 24시간 채널</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                운영 원가는 커피 한 잔 값. YouTube 수익화(YPP) 달성 후에는 채널이 알아서 수익을 만들어냅니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ JAPAN PRESETS ━━━ */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Japan 전용 프리셋 5종</h2>
          <p className="text-center text-zinc-500 mb-12 text-sm">클릭 한 번으로 일본 감성 음악을 즉시 생성</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { emoji: "🎌", name: "J-Lofi 공부방", jp: "勉強用BGM · 集中力", color: "#3B82F6" },
              { emoji: "🌃", name: "도쿄 야간 재즈", jp: "夜のJazz · カフェBGM", color: "#8B5CF6" },
              { emoji: "🌸", name: "시티팝 리바이벌", jp: "シティポップ · 夜の音楽", color: "#EC4899" },
              { emoji: "🍵", name: "와비사비 앰비언트", jp: "眠れる音楽 · 瞑想", color: "#10B981" },
              { emoji: "🌟", name: "애니 BGM", jp: "アニメBGM · 作業用", color: "#F97316" },
            ].map((preset) => (
              <div
                key={preset.name}
                className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-opacity-40 text-center transition-all duration-300 hover:-translate-y-1 cursor-pointer group"
                style={{ ["--preset-color" as string]: preset.color }}
              >
                <span className="text-3xl mb-3 block">{preset.emoji}</span>
                <h3 className="font-bold text-sm text-white mb-1 group-hover:text-[var(--preset-color)] transition-colors">{preset.name}</h3>
                <p className="text-[10px] text-zinc-500 font-mono">{preset.jp}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ FEATURES ━━━ */}
      <section className="py-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#FFD700]/[0.02] to-transparent" />
        <div className="max-w-5xl mx-auto relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">일본 채널 운영의 전부를 처리합니다</h2>
          <p className="text-center text-zinc-500 mb-12 text-sm">프롬프트만 입력하세요 — 나머지는 Melodio</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { icon: Music, title: "Japan 전용 프리셋 5종 내장", desc: "勉強用BGM, 夜のJazz, シティポップ, 瞑想, アニメBGM. 클릭 한 번으로 일본 감성 음악을 즉시 생성." },
              { icon: Bot, title: "AI 듀얼 엔진 — Lyria 3 + Suno V5", desc: "빠른 미리듣기는 Lyria 3, 유통용 고품질 풀트랙은 Suno V5. 최고의 엔진을 자동 선택." },
              { icon: Video, title: "음악에서 유튜브 업로드까지 자동", desc: "썸네일 생성 → 영상 합성 → 일본어 메타데이터 자동 → YouTube 예약 업로드. 프롬프트만 입력." },
              { icon: Radio, title: "150+ 플랫폼 글로벌 유통", desc: "Spotify Japan, Apple Music, Amazon Music에 동시 유통. 스트리밍 수익까지 Melodio 하나로." },
            ].map((feat) => (
              <div key={feat.title} className="flex items-start gap-4 p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-[#FFD700]/20 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-[#FFD700]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <feat.icon className="w-5 h-5 text-[#FFD700]" />
                </div>
                <div>
                  <h3 className="font-bold text-white mb-1">{feat.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ STATS ━━━ */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">숫자로 보는 일본 채널의 기회</h2>
          <p className="text-center text-zinc-500 mb-12 text-sm">데이터는 거짓말하지 않습니다</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: "$1.5~2.5", label: "음악 채널 1,000뷰당 수익", sub: "RPM" },
              { value: "3~6개월", label: "YouTube 수익화 달성", sub: "YPP" },
              { value: "₩18,000", label: "월 채널 운영 원가", sub: "전체" },
              { value: "5분", label: "첫 Japan 트랙 생성", sub: "프리셋" },
            ].map((stat) => (
              <div key={stat.label} className="text-center p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-[#FFD700] to-[#FFA500] bg-clip-text text-transparent mb-1">{stat.value}</p>
                <p className="text-xs text-zinc-400 mb-0.5">{stat.label}</p>
                <span className="text-[10px] text-zinc-600 font-mono">{stat.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ PRICING ━━━ */}
      <section className="py-20 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#FFD700]/[0.02] to-transparent" />
        <div className="max-w-4xl mx-auto relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">커피 한 잔보다 저렴합니다</h2>
          <p className="text-center text-zinc-500 mb-12 text-sm">채널 운영 원가, 이게 전부입니다</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-sm text-zinc-500 mb-1">🆓 Free</p>
              <p className="text-3xl font-black text-white mb-4">무료</p>
              <ul className="space-y-2 text-sm text-zinc-400 mb-6">
                <li>✓ 월 5곡 생성</li>
                <li>✓ Japan 프리셋 2종</li>
                <li className="text-zinc-600">✗ 자동 업로드</li>
                <li className="text-zinc-600">✗ 음원 유통</li>
              </ul>
              <a href="/signup" className="block text-center py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors">시작하기</a>
            </div>
            {/* Pro — Recommended */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border-2 border-[#FFD700]/30 relative shadow-[0_0_30px_rgba(255,215,0,0.05)]">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#FFD700] text-black text-[10px] font-bold">추천</span>
              <p className="text-sm text-[#FFD700] mb-1">💎 Pro</p>
              <p className="text-3xl font-black text-white mb-1">$9.99<span className="text-sm font-normal text-zinc-500">/월</span></p>
              <p className="text-xs text-[#FFD700]/60 mb-4">첫 달 50% 할인</p>
              <ul className="space-y-2 text-sm text-zinc-400 mb-6">
                <li>✓ 월 100곡 생성</li>
                <li>✓ Japan 프리셋 5종 전체</li>
                <li>✓ 듀얼 엔진 (Lyria + Suno)</li>
                <li>✓ 월 20곡 유통</li>
              </ul>
              <a href="/signup" className="block text-center py-3 rounded-xl bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black font-bold hover:shadow-[0_0_20px_rgba(255,215,0,0.3)] transition-all">Pro 시작하기</a>
            </div>
            {/* Business */}
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-sm text-zinc-500 mb-1">🚀 Business</p>
              <p className="text-3xl font-black text-white mb-4">$29.99<span className="text-sm font-normal text-zinc-500">/월</span></p>
              <ul className="space-y-2 text-sm text-zinc-400 mb-6">
                <li>✓ 월 500곡 생성</li>
                <li>✓ <strong className="text-white">자동 스케줄링</strong></li>
                <li>✓ <strong className="text-white">무제한 유통</strong></li>
                <li>✓ B2B 1시간 루프</li>
              </ul>
              <a href="/signup" className="block text-center py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/5 transition-colors">Business 시작</a>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ FINAL CTA ━━━ */}
      <section className="py-24 px-6 text-center relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,215,0,0.06)_0%,transparent_60%)]" />
        <div className="max-w-3xl mx-auto relative z-10">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-6 leading-tight">
            1년 후, 당신은
            <br />
            <span className="text-zinc-500">&quot;그때 시작할걸&quot;</span> — 혹은 —
            <br />
            <span className="bg-gradient-to-r from-[#FFD700] to-[#FFA500] bg-clip-text text-transparent">&quot;그때 시작했길 잘했다&quot;</span>
          </h2>
          <div className="flex flex-col items-center gap-3 mt-8">
            <a
              href="/signup"
              className="group inline-flex items-center gap-3 px-10 py-5 rounded-2xl bg-gradient-to-r from-[#FFD700] to-[#FFA500] text-black font-bold text-lg hover:shadow-[0_0_60px_rgba(255,215,0,0.35)] transition-all duration-300 hover:scale-105"
            >
              🎌 지금 무료로 시작하기
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <span className="text-xs text-zinc-500">5분이면 첫 J-Lofi 트랙 완성 · Pro 플랜 첫 달 50% 할인</span>
          </div>
        </div>
      </section>

      {/* ━━━ FOOTER ━━━ */}
      <footer className="border-t border-white/5 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎵</span>
            <span className="font-bold bg-gradient-to-r from-[#FFD700] to-[#FFA500] bg-clip-text text-transparent">Melodio</span>
            <span className="text-xs text-zinc-600 ml-2">Global AI Music Label SaaS</span>
          </div>
          <p className="text-xs text-zinc-600">© 2026 Melodio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
