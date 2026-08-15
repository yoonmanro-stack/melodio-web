"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Compass,
  Dna,
  LoaderCircle,
  Plus,
  RadioTower,
} from "lucide-react";

type ChannelSummary = {
  id: string;
  channelName: string;
  promise: string;
  conceptPresetId: string | null;
  status: "draft" | "active" | "paused" | "archived";
  latestDnaVersion: number;
  listenerIntent: {
    id: string;
    name: string;
    primaryPurpose: string;
    activity: string;
    environment: string;
  } | null;
  updatedAt: string;
};

type ChannelListResponse = {
  success?: boolean;
  data?: ChannelSummary[];
  error?: string;
  code?: string;
};

const PURPOSE_LABELS: Record<string, string> = {
  recovery: "마음의 위로 & 회복",
  focus: "몰입 & 생산성",
  space_atmosphere: "공간의 분위기",
  movement: "드라이브 & 움직임",
  memory_emotion: "추억 & 감정",
  story_immersion: "서사 & 몰입",
};

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export default function DashboardChannelDnaPanel() {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadChannels() {
      try {
        const response = await fetch("/api/channel-builder", {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json()) as ChannelListResponse;
        if (!response.ok) {
          setNeedsLogin(response.status === 401 || payload.code === "AUTH_REQUIRED");
          throw new Error(payload.error || "Channel DNA를 불러오지 못했습니다.");
        }
        setChannels(payload.data ?? []);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Channel DNA를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadChannels();
    return () => controller.abort();
  }, []);

  return (
    <section className="mt-8 rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950/35 via-zinc-950/70 to-cyan-950/20 p-5 md:p-7 shadow-[0_24px_80px_rgba(76,29,149,0.12)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-violet-300">
            <Dna className="h-5 w-5" />
            <span className="text-xs font-bold tracking-[0.18em] uppercase">Channel System</span>
          </div>
          <h2 className="text-2xl font-bold text-white">내 Channel DNA</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            저장한 채널 콘셉트와 청취 목적을 확인하고, 다음 에피소드 제작이나 유튜브 오토파일럿 설정을 이어가세요.
          </p>
        </div>
        <Link
          href="/channel-builder"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/15 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/25"
        >
          <Plus className="h-4 w-4" /> 새 Channel DNA
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-6 flex min-h-36 items-center justify-center rounded-2xl border border-white/5 bg-black/20 text-sm text-zinc-400">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> 저장된 Channel DNA를 불러오는 중입니다.
        </div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-sm text-amber-100">{error}</p>
          {needsLogin ? (
            <Link href="/login?next=/dashboard" className="mt-3 inline-flex text-sm font-semibold text-amber-300 hover:text-amber-200">
              로그인하고 다시 확인하기 <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          ) : null}
        </div>
      ) : channels.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-black/20 p-7 text-center">
          <p className="font-semibold text-white">아직 저장된 Channel DNA가 없습니다.</p>
          <p className="mt-2 text-sm text-zinc-400">프리셋을 시작점으로 채널의 변하지 않는 제작 기준을 만들어보세요.</p>
          <Link href="/channel-builder" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-violet-300 hover:text-violet-200">
            첫 Channel DNA 만들기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {channels.map((channel) => {
            const intentLabel = channel.listenerIntent
              ? PURPOSE_LABELS[channel.listenerIntent.primaryPurpose] || channel.listenerIntent.name
              : "청취 목적 미설정";

            return (
              <article key={channel.id} className="rounded-2xl border border-white/10 bg-black/25 p-5 transition hover:border-violet-400/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        저장됨
                      </span>
                      <span className="text-xs text-zinc-500">DNA v{channel.latestDnaVersion}</span>
                      <span className="text-xs text-zinc-600">·</span>
                      <span className="text-xs text-zinc-500">{formatUpdatedAt(channel.updatedAt)} 수정</span>
                    </div>
                    <h3 className="truncate text-lg font-bold text-white">{channel.channelName}</h3>
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-400">
                      {channel.promise || "채널 약속을 설정하지 않았습니다."}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                    <Dna className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.025] p-3">
                  <Compass className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-cyan-200">청취자가 찾아오는 이유</p>
                    <p className="mt-1 text-sm text-zinc-300">{intentLabel}</p>
                    {channel.listenerIntent?.activity || channel.listenerIntent?.environment ? (
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {[channel.listenerIntent.activity, channel.listenerIntent.environment].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Link
                    href={`/channel-builder/${channel.id}/episodes/new`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
                  >
                    Episode 설계 <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/autopilot?channelBlueprintId=${channel.id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2.5 text-sm font-bold text-red-200 transition hover:bg-red-500/20"
                  >
                    <RadioTower className="h-4 w-4" /> 오토파일럿 설정
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
