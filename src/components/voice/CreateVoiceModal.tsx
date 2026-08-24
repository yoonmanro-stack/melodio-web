"use client";

import { ShieldCheck, X } from "lucide-react";
import { useVoice } from "@/contexts/VoiceContext";

const COMING_SOON_OPTIONS = [
  { label: "목소리 녹음", description: "마이크 접근 비활성화" },
  { label: "음성 업로드", description: "파일 선택·전송 비활성화" },
  { label: "목소리 등록", description: "음성 분석·변환 비활성화" },
] as const;

export function CreateVoiceModal() {
  const { isCreateModalOpen, closeCreateModal } = useVoice();

  if (!isCreateModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-amber-500/25 bg-[#141416] shadow-2xl">
        <header className="flex items-start justify-between border-b border-white/5 px-6 py-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-white">목소리 등록</h2>
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                준비 중
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              실제 음성 처리 연동이 검증될 때까지 녹음·업로드·등록 기능을 사용할 수 없습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={closeCreateModal}
            aria-label="목소리 등록 안내 닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 p-6">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <p className="text-xs leading-relaxed text-zinc-300">
              현재 제공되는 기능은 특정 목소리의 복제가 아니라, 음색 특성을 생성 프롬프트에 반영하는 <strong className="text-white">보컬 음색 스타일</strong>입니다.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {COMING_SOON_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                disabled
                className="cursor-not-allowed rounded-2xl border border-white/5 bg-black/20 p-3 text-left opacity-65"
              >
                <span className="block text-xs font-bold text-zinc-400">{option.label}</span>
                <span className="mt-1 block text-[9px] leading-relaxed text-zinc-600">{option.description}</span>
                <span className="mt-2 inline-flex rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-bold text-amber-300">준비 중</span>
              </button>
            ))}
          </div>
        </div>

        <footer className="border-t border-white/5 px-6 py-4 text-right">
          <button
            type="button"
            onClick={closeCreateModal}
            className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-zinc-950 transition-colors hover:bg-zinc-200"
          >
            확인
          </button>
        </footer>
      </section>
    </div>
  );
}
