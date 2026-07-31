"use client";

import Link from "next/link";
import { Shield, ArrowLeft, Lock, FileText, CheckCircle } from "lucide-react";

export default function PrivacyPolicy() {
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
            <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-fuchsia-400" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-fuchsia-400">Legal Documents</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">개인정보처리방침</h1>
          <p className="text-xs text-zinc-500 mt-2 font-mono">시행일자: 2026년 7월 14일</p>
        </header>

        {/* 본문 콘텐츠 */}
        <div className="space-y-10 text-sm md:text-base leading-relaxed text-zinc-400">
          
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" /> 1. 개인정보 처리 목적 및 범위
            </h2>
            <p>
              멜로디오(이하 &apos;회사&apos;)는 이용자의 개인정보를 중요시하며, &quot;정보통신망 이용촉진 및 정보보호 등에 관한 법률&quot; 및 &quot;개인정보보호법&quot; 등 관련 법령을 준수하고 있습니다.
              본 방침은 멜로디오 서비스 내에서 Google OAuth를 통해 연동하는 **유튜브 채널 정보의 수집, 이용, 보관 및 파기 절차**에 대해 설명합니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-indigo-400" /> 2. 수집하는 개인정보 항목 및 수집 방법
            </h2>
            <p>회사는 서비스 연동 및 제공을 위해 사용자의 동의 하에 최소한의 정보만을 수집합니다.</p>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">Google OAuth 연동 시 수집 항목</h3>
                <ul className="list-disc pl-5 text-xs text-zinc-400 space-y-1">
                  <li>유튜브 채널 고유 ID (Channel ID) 및 채널 이름 (Channel Title)</li>
                  <li>유튜브 채널 프로필 이미지 URL</li>
                  <li>Google OAuth Refresh Token (인증 상태 유지를 위한 보안 토큰)</li>
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">구글 API 사용 범위 (Scopes)</h3>
                <p className="text-xs text-zinc-400 leading-normal">
                  본 서비스는 사용자의 채널 관리 대행을 위해 아래의 권한을 명시적으로 요청하고 획득합니다:
                </p>
                <ul className="list-disc pl-5 text-xs text-zinc-400 space-y-1 mt-1 font-mono">
                  <li>https://www.googleapis.com/auth/youtube.upload (동영상 직접 업로드 권한)</li>
                  <li>https://www.googleapis.com/auth/youtube.readonly (채널 기본 정보 조회 권한)</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-400" /> 3. 개인정보의 안전성 확보 조치 (암호화)
            </h2>
            <p>
              회사는 연동된 유튜브 채널의 관리 및 동영상 자동 업로드 예약 기능을 제공하기 위해 사용자의 Refresh Token을 보관합니다.
            </p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-2">
              <li>
                **강력한 암호화 적용**: 저장되는 모든 Refresh Token은 업계 표준의 **대칭형 암호화 알고리즘(AES-256-GCM 또는 이에 준하는 안전한 알고리즘)**을 적용하여 암호화된 문자열 형태로 Supabase 데이터베이스에 안전하게 기록됩니다.
              </li>
              <li>
                **접근 통제**: 데이터베이스에 보관되는 암호화 키는 강력한 환경 변수로 보호되며, 서비스 운영 담당자를 포함한 그 누구도 원본 토큰에 직접 접근하거나 탈취할 수 없도록 물리적·기술적 격리 조치를 완료하였습니다.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-indigo-400" /> 4. 개인정보의 보유 및 이용 기간, 파기 절차
            </h2>
            <p>
              회사는 이용자의 개인정보 수집 목적이 달성되면 지체 없이 파기하는 것을 원칙으로 합니다.
            </p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-2">
              <li>
                **연동 해제 시 즉시 삭제**: 사용자가 대시보드 내에서 **[연동 끊기]** 버튼을 클릭하여 연동 해제를 요청하는 즉시 데이터베이스의 해당 채널 레코드 및 암호화된 토큰 정보는 완전하고 영구적으로 삭제(Delete) 처리됩니다.
              </li>
              <li>
                **회원 탈퇴 시**: 서비스 탈퇴 시 탈퇴 승인 즉시 회원의 고유 식별 정보 및 모든 유튜브 연동 데이터는 즉각 파기됩니다.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" /> 5. Google API User Data Policy 준수 선언
            </h2>
            <p>
              멜로디오는 Google API에서 획득한 정보를 다른 목적으로 공유하거나 판매하지 않으며, **Google API 서비스 사용자 데이터 정책(Google API Services User Data Policy)**을 철저하게 준수하여 사용 목적(동영상 자동 생성 및 포스팅 대행) 이외의 용도로는 절대 가공하거나 활용하지 않습니다.
            </p>
          </section>

          <section className="space-y-3 border-t border-white/5 pt-8">
            <h2 className="text-lg font-bold text-white">6. 개인정보 보호 책임자 및 문의</h2>
            <p>서비스 이용 중 개인정보보호 관련 문의사항이나 불만사항이 있으신 경우 아래 연락처로 문의해 주시기 바랍니다.</p>
            <ul className="list-none space-y-1 text-xs font-mono text-zinc-400 mt-2">
              <li>담당자: 멜로디오 개인정보 보호 담당 부서</li>
              <li>이메일: support@melodio.app</li>
            </ul>
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
