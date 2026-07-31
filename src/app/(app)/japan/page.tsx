import { Suspense } from "react";
import type { Metadata } from "next";
import JapanLandingClient from "@/components/japan-landing-client";

export const metadata: Metadata = {
  title: "Melodio Japan — 세계 2위 음악 시장의 공백을 선점하세요",
  description: "일본어 AI 음악 채널을 만드는 크리에이터가 아직 없습니다. Melodio로 J-Lofi, 시티팝, 도쿄 재즈 채널을 5분 안에 시작하세요.",
  keywords: ["勉強用BGM", "集中力BGM", "作業用BGM", "カフェBGM", "夜의 Jazz", "シティポップ", "AI음악", "YouTube음악채널"],
};

export default function JapanLandingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen text-white flex items-center justify-center font-sans">読み込み중...</div>}>
      <JapanLandingClient />
    </Suspense>
  );
}
