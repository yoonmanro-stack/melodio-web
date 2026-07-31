"use client";

import Link from "next/link";
import { Scale, ArrowLeft, FileText, CheckCircle, HelpCircle } from "lucide-react";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-black text-zinc-300 font-sans selection:bg-fuchsia-500/30 selection:text-fuchsia-200">
      
      {/* 백그라운드 블러 효과 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[20%] w-[350px] h-[350px] bg-fuchsia-600/10 rounded-full blur-[120px]"></div>
        <div className="absolute top-[-5%] left-[50%] w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[140px]"></div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-16 relative z-10">
        
        {/* 상단 네비게이션 */}
        <div className="mb-10">
          <Link 
            href="/autopilot"
            className="inline-flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-white transition-all bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl border border-white/5 hover:border-white/10"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> 대시보드로 돌아가기
          </Link>
        </div>

        {/* 헤더 */}
        <header className="mb-12 border-b border-white/10 pb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Scale className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Terms & Agreement</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">서비스 이용약관</h1>
          <p className="text-xs text-zinc-500 mt-2 font-mono">시행일자: 2026년 7월 14일</p>
        </header>

        {/* 본문 콘텐츠 */}
        <div className="space-y-10 text-sm md:text-base leading-relaxed text-zinc-400">
          
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-fuchsia-400" /> 제1조 (목적)
            </h2>
            <p>
              본 약관은 멜로디오(이하 &apos;회사&apos;)가 제공하는 AI 음악 및 영상 자동 생성, 유튜브 예약 업로드 기능 등을 포함한 멜로디오 서비스(이하 &apos;서비스&apos;)의 이용 조건 및 절차, 회사와 회원 간의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-fuchsia-400" /> 제2조 (용어의 정의)
            </h2>
            <p>본 약관에서 사용하는 용어의 정의는 다음과 같습니다:</p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-1.5">
              <li>**회원**: 회사와 서비스 이용 계약을 체결하고 이용자 계정을 생성한 개인 또는 법인.</li>
              <li>**자율운영(Autopilot)**: AI 기술을 활용하여 자동으로 음악과 비디오 콘텐츠를 제작하고 설정된 스케줄에 따라 유튜브 채널에 포스팅을 대행하는 서비스.</li>
              <li>**연동 채널**: 사용자가 Google OAuth 인증을 거쳐 멜로디오 서비스에 연계한 유튜브 채널.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-fuchsia-400" /> 제3조 (유튜브 연동 및 서비스 대행 권한 승인)
            </h2>
            <ul className="list-disc pl-5 text-zinc-400 space-y-2">
              <li>
                회원은 서비스 내 자율운영 기능을 사용하기 위해 본인 소유의 유튜브 채널에 대한 **동영상 업로드 권한**을 승인해야 합니다.
              </li>
              <li>
                회사는 회원이 승인하고 설정한 자동화 스케줄 범위 내에서만 유튜브 API를 활용하여 동영상 업로드 대행 업무를 수행하며, 회원의 승인 범위를 초과하는 임의의 조작이나 정보 접근은 절대 수행하지 않습니다.
              </li>
              <li>
                유튜브 채널의 상태 유지, 업로드 가이드라인 준수, 및 유튜브 커뮤니티 정책 준수의 책임은 전적으로 회원 본인에게 있습니다.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-fuchsia-400" /> 제4조 (생성된 콘텐츠의 저작권 및 이용 범위)
            </h2>
            <p>
              멜로디오 플랫폼을 통해 자동 또는 수동으로 생성된 모든 AI 음악 및 영상에 대한 저작권 및 소유권 관계는 다음과 같이 규정합니다:
            </p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-2">
              <li>
                **상업적 활용 보장**: 회원은 멜로디오를 통해 생성된 음원 및 비디오 콘텐츠를 유튜브 채널의 수익 창출(애드센스 광고 등) 목적을 포함하여 상업적으로 자유롭게 퍼블리싱하고 사용할 권리를 가집니다.
              </li>
              <li>
                **저작권 면책**: 회사가 제공하는 AI 엔진으로 저작권 침해 우려가 없는 독창적인 콘텐츠 생성을 지원하나, 회원이 직접 입력한 커스텀 텍스트, 프롬프트, 키워드, 소스 이미지 등으로 인해 발생하는 타인의 상표권, 저작권, 혹은 초상권 침해에 관한 법적 분쟁의 책임은 회원에게 있습니다.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-fuchsia-400" /> 제5조 (의무 및 금지사항)
            </h2>
            <p>회원은 서비스를 이용할 때 다음 각 호의 행위를 하여서는 안 됩니다:</p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-1.5">
              <li>유튜브의 이용 약관 및 커뮤니티 가이드라인을 고의로 위반하여 스팸, 유해물, 혹은 불법 동영상을 대량 유포하는 행위.</li>
              <li>타인의 구글 계정 정보를 무단 도용하거나 비정상적인 방법으로 API에 접근하는 행위.</li>
              <li>회사의 지적재산권을 침해하거나 서비스의 인프라 시스템에 과도한 부하를 가하는 행위.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-fuchsia-400" /> 제6조 (서비스의 변경 및 중단)
            </h2>
            <p>
              회사는 유튜브(Google)의 API 정책 변경, 서비스 고도화, 또는 시스템 점검 등 경영상·기술상의 이유로 서비스의 전체 또는 일부를 변경하거나 중단할 수 있습니다. 이 경우 회사는 사전에 등록된 이메일 또는 대시보드 공지사항을 통해 회원에게 고지합니다.
            </p>
          </section>

        </div>

        {/* 푸터 영역 */}
        <footer className="mt-16 pt-8 border-t border-white/10 text-center text-xs text-zinc-600">
          <p>© {new Date().getFullYear()} Melodio. All rights reserved.</p>
        </footer>

      </div>
    </div>
  );
}
