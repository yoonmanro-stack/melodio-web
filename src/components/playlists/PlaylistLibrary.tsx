"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock3,
  Edit3,
  ListMusic,
  Loader2,
  Music4,
  Pause,
  Play,
  Plus,
  Save,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import {
  createLibraryPlaylist,
  deleteLibraryPlaylist,
  fetchPlaylistLibrary,
  PlaylistClientError,
  removeTrackFromLibraryPlaylist,
  reorderLibraryPlaylistTracks,
  updateLibraryPlaylist,
} from "@/lib/playlists/playlist-client";
import { usePlaylistPlayback } from "@/contexts/PlaylistPlaybackContext";
import type { LibraryPlaylist, LibraryPlaylistTrack } from "@/types/library-playlist";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${Math.max(1, minutes)}분`;
}

function PlaylistCover({ playlist, size = "lg" }: { playlist: LibraryPlaylist; size?: "sm" | "lg" }) {
  const covers = playlist.tracks.map((track) => track.coverArtUrl).filter(Boolean).slice(0, 4) as string[];
  const sizeClass = size === "lg" ? "h-36 w-36 sm:h-44 sm:w-44" : "h-11 w-11";

  return (
    <div className={`${sizeClass} grid shrink-0 grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-950/80 via-zinc-900 to-cyan-950/80 shadow-xl`}>
      {covers.length > 0 ? Array.from({ length: 4 }, (_, index) => (
        covers[index] ? <img key={`${covers[index]}-${index}`} src={covers[index]} alt="" className="h-full w-full object-cover" /> : <span key={index} className="grid place-items-center"><Music4 className="h-4 w-4 text-white/25" /></span>
      )) : (
        <span className="col-span-2 row-span-2 grid place-items-center"><ListMusic className={`${size === "lg" ? "h-12 w-12" : "h-5 w-5"} text-white/35`} /></span>
      )}
    </div>
  );
}

function TrackArtwork({ track }: { track: LibraryPlaylistTrack }) {
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-fuchsia-950 to-cyan-950">
      {track.coverArtUrl ? <img src={track.coverArtUrl} alt="" className="h-full w-full object-cover" /> : <Music4 className="h-5 w-5 text-white/40" />}
    </div>
  );
}

export default function PlaylistLibrary() {
  const {
    queuePlaylistId,
    currentTrackId,
    isPlaying,
    playQueue,
    syncQueue,
    togglePlayback,
    closePlaylistQueue,
  } = usePlaylistPlayback();
  const [playlists, setPlaylists] = useState<LibraryPlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPlaylistLibrary();
      setPlaylists(data);
      setSelectedPlaylistId((current) => {
        if (current && data.some((playlist) => playlist.id === current)) return current;
        return data[0]?.id || null;
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "플레이리스트를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (!queuePlaylistId) return;
    const queuePlaylist = playlists.find((playlist) => playlist.id === queuePlaylistId);
    if (queuePlaylist) syncQueue(queuePlaylist.id, queuePlaylist.name, queuePlaylist.tracks);
  }, [playlists, queuePlaylistId, syncQueue]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId],
  );

  const totalDuration = useMemo(() => {
    const playableTracks = selectedPlaylist?.tracks.filter((track) => track.isPlayable) || [];
    if (!playableTracks.length) return null;
    if (playableTracks.some((track) => !track.durationSeconds || track.durationSeconds <= 0)) {
      return null;
    }
    return playableTracks.reduce(
      (sum, track) => sum + (track.durationSeconds || 0),
      0,
    );
  }, [selectedPlaylist]);

  const createPlaylist = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusyAction("create");
    setError(null);
    try {
      const created = await createLibraryPlaylist({ name, description: newDescription });
      setPlaylists((current) => [created, ...current]);
      setSelectedPlaylistId(created.id);
      setNewName("");
      setNewDescription("");
      setIsCreating(false);
      setNotice(`‘${created.name}’ 플레이리스트를 만들었습니다.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "플레이리스트를 만들지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const startEditing = () => {
    if (!selectedPlaylist) return;
    setEditName(selectedPlaylist.name);
    setEditDescription(selectedPlaylist.description);
    setEditing(true);
  };

  const savePlaylist = async () => {
    if (!selectedPlaylist || !editName.trim()) return;
    setBusyAction("edit");
    setError(null);
    try {
      const updated = await updateLibraryPlaylist(selectedPlaylist.id, {
        name: editName,
        description: editDescription,
      });
      setPlaylists((current) => current.map((playlist) =>
        playlist.id === updated.id ? { ...updated, tracks: playlist.tracks } : playlist,
      ));
      setEditing(false);
      setNotice("플레이리스트 정보를 저장했습니다.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "플레이리스트를 수정하지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const deletePlaylist = async () => {
    if (!selectedPlaylist) return;
    if (!window.confirm(`‘${selectedPlaylist.name}’ 플레이리스트를 삭제할까요? 원곡은 삭제되지 않습니다.`)) return;
    setBusyAction("delete-playlist");
    setError(null);
    try {
      await deleteLibraryPlaylist(selectedPlaylist.id);
      closePlaylistQueue(selectedPlaylist.id);
      const remainingPlaylists = playlists.filter((playlist) => playlist.id !== selectedPlaylist.id);
      setPlaylists(remainingPlaylists);
      setSelectedPlaylistId((current) => (
        current === selectedPlaylist.id ? remainingPlaylists[0]?.id || null : current
      ));
      setNotice("플레이리스트만 삭제했습니다. 원곡은 그대로 보관됩니다.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "플레이리스트를 삭제하지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const removeTrack = async (track: LibraryPlaylistTrack) => {
    if (!selectedPlaylist) return;
    setBusyAction(`remove-${track.itemId}`);
    setError(null);
    const before = playlists;
    setPlaylists((current) => current.map((playlist) =>
      playlist.id === selectedPlaylist.id
        ? { ...playlist, tracks: playlist.tracks.filter((item) => item.itemId !== track.itemId) }
        : playlist,
    ));
    try {
      const result = await removeTrackFromLibraryPlaylist(selectedPlaylist.id, track.itemId);
      if (result.updatedAt) {
        setPlaylists((current) => current.map((playlist) => (
          playlist.id === selectedPlaylist.id
            ? { ...playlist, updatedAt: result.updatedAt || playlist.updatedAt }
            : playlist
        )));
      }
      setNotice(`‘${track.title}’을 플레이리스트에서 뺐습니다.`);
    } catch (requestError) {
      setPlaylists(before);
      setError(requestError instanceof Error ? requestError.message : "곡을 제거하지 못했습니다.");
    } finally {
      setBusyAction(null);
    }
  };

  const moveTrack = async (trackIndex: number, direction: -1 | 1) => {
    if (!selectedPlaylist) return;
    const nextIndex = trackIndex + direction;
    if (nextIndex < 0 || nextIndex >= selectedPlaylist.tracks.length) return;

    const reordered = selectedPlaylist.tracks.map((track) => ({ ...track }));
    [reordered[trackIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[trackIndex]];
    reordered.forEach((track, index) => { track.position = index; });
    const before = playlists;
    setPlaylists((current) => current.map((playlist) =>
      playlist.id === selectedPlaylist.id ? { ...playlist, tracks: reordered } : playlist,
    ));
    setBusyAction(`reorder-${selectedPlaylist.id}`);
    setError(null);

    try {
      const result = await reorderLibraryPlaylistTracks(
        selectedPlaylist.id,
        reordered.map((track) => track.itemId),
        selectedPlaylist.updatedAt,
      );
      if (result.updatedAt) {
        setPlaylists((current) => current.map((playlist) => (
          playlist.id === selectedPlaylist.id
            ? { ...playlist, updatedAt: result.updatedAt || playlist.updatedAt }
            : playlist
        )));
      }
    } catch (requestError) {
      setPlaylists(before);
      const message = requestError instanceof Error ? requestError.message : "곡 순서를 저장하지 못했습니다.";
      if (requestError instanceof PlaylistClientError && requestError.status === 409) {
        await loadLibrary();
      }
      setError(message);
    } finally {
      setBusyAction(null);
    }
  };

  if (isLoading) {
    return <div className="grid min-h-[65vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-fuchsia-400" /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl pb-16">
      <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-fuchsia-300">
            <ListMusic className="h-4 w-4" /> My Music Library
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">내 플레이리스트</h1>
          <p className="mt-2 text-sm text-zinc-400">내가 만든 완성곡을 원하는 순서로 담고 끊김 없이 들어보세요.</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:bg-fuchsia-100"
        >
          <Plus className="h-4 w-4" /> 새 플레이리스트
        </button>
      </header>

      {error ? (
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="오류 닫기"><X className="h-4 w-4" /></button>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <Check className="h-4 w-4" /> {notice}
        </div>
      ) : null}

      {isCreating ? (
        <section className="mb-6 rounded-3xl border border-fuchsia-500/20 bg-fuchsia-500/[0.05] p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">새 플레이리스트</h2>
            <button onClick={() => setIsCreating(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-white/5 hover:text-white" aria-label="취소"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
            <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} placeholder="플레이리스트 이름" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-500/50" />
            <input value={newDescription} onChange={(event) => setNewDescription(event.target.value)} maxLength={500} placeholder="설명 (선택)" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-500/50" />
            <button onClick={() => void createPlaylist()} disabled={!newName.trim() || busyAction === "create"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-fuchsia-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {busyAction === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 저장
            </button>
          </div>
        </section>
      ) : null}

      {playlists.length === 0 ? (
        <section className="grid min-h-[55vh] place-items-center rounded-3xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center">
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/5"><ListMusic className="h-7 w-7 text-zinc-500" /></div>
            <h2 className="mt-5 text-xl font-semibold text-white">첫 플레이리스트를 만들어보세요</h2>
            <p className="mt-2 text-sm text-zinc-500">플레이리스트를 만든 뒤 대시보드의 완성곡 메뉴에서 곡을 담을 수 있습니다.</p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <button onClick={() => setIsCreating(true)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black">새 플레이리스트</button>
              <Link href="/dashboard" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/5">내 곡 보러가기</Link>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-w-0">
            <div className="flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
              {playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => { setSelectedPlaylistId(playlist.id); setEditing(false); }}
                  className={`flex min-w-[230px] items-center gap-3 rounded-2xl border px-3 py-3 text-left transition lg:w-full lg:min-w-0 ${selectedPlaylistId === playlist.id ? "border-fuchsia-500/30 bg-fuchsia-500/10" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"}`}
                >
                  <PlaylistCover playlist={playlist} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{playlist.name}</span>
                    <span className="mt-1 block text-[10px] text-zinc-500">{playlist.tracks.length}곡</span>
                  </span>
                  {queuePlaylistId === playlist.id && isPlaying ? <span className="h-2 w-2 animate-pulse rounded-full bg-fuchsia-400" /> : null}
                </button>
              ))}
            </div>
          </aside>

          {selectedPlaylist ? (
            <section className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
              <div className="flex flex-col gap-6 border-b border-white/5 bg-gradient-to-br from-fuchsia-950/30 via-transparent to-cyan-950/20 p-5 sm:flex-row sm:items-end sm:p-7">
                <PlaylistCover playlist={selectedPlaylist} />
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="space-y-3">
                      <input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={80} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xl font-semibold text-white outline-none focus:border-fuchsia-500/50" />
                      <textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={500} rows={2} className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-fuchsia-500/50" placeholder="설명" />
                      <div className="flex gap-2">
                        <button onClick={() => void savePlaylist()} disabled={busyAction === "edit"} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-black"><Save className="h-3.5 w-3.5" /> 저장</button>
                        <button onClick={() => setEditing(false)} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-400">취소</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Private playlist</p>
                      <h2 className="mt-2 truncate text-2xl font-bold text-white sm:text-3xl">{selectedPlaylist.name}</h2>
                      <p className="mt-2 min-h-5 text-sm text-zinc-400">{selectedPlaylist.description || "내가 만든 곡으로 구성한 개인 플레이리스트"}</p>
                      <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-500">
                        <span>{selectedPlaylist.tracks.length}곡</span>
                        {totalDuration ? <><span>·</span><span>{formatDuration(totalDuration)}</span></> : null}
                        <span>·</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> {new Date(selectedPlaylist.updatedAt).toLocaleDateString("ko-KR")}</span>
                      </div>
                    </>
                  )}
                </div>
                {!editing ? (
                  <div className="flex shrink-0 gap-2">
                    <button onClick={startEditing} className="rounded-xl border border-white/10 p-2.5 text-zinc-400 hover:bg-white/5 hover:text-white" title="이름과 설명 수정"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => void deletePlaylist()} disabled={busyAction === "delete-playlist"} className="rounded-xl border border-red-500/10 p-2.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-300" title="플레이리스트 삭제"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-5 py-4 sm:px-7">
                <button
                  onClick={() => {
                    if (queuePlaylistId === selectedPlaylist.id) togglePlayback();
                    else playQueue(selectedPlaylist.id, selectedPlaylist.name, selectedPlaylist.tracks);
                  }}
                  disabled={!selectedPlaylist.tracks.some((track) => track.isPlayable)}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {queuePlaylistId === selectedPlaylist.id && isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                  전체 재생
                </button>
                <button
                  onClick={() => playQueue(selectedPlaylist.id, selectedPlaylist.name, selectedPlaylist.tracks, undefined, true)}
                  disabled={!selectedPlaylist.tracks.some((track) => track.isPlayable)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                >
                  <Shuffle className="h-3.5 w-3.5" /> 셔플
                </button>
                <Link href="/dashboard" className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/20 bg-fuchsia-500/5 px-4 py-2 text-xs font-semibold text-fuchsia-200 hover:bg-fuchsia-500/10"><Plus className="h-3.5 w-3.5" /> 곡 추가</Link>
              </div>

              <div className="p-3 sm:p-5">
                {selectedPlaylist.tracks.length === 0 ? (
                  <div className="py-16 text-center">
                    <Music4 className="mx-auto h-8 w-8 text-zinc-700" />
                    <p className="mt-3 text-sm text-zinc-500">아직 담긴 곡이 없습니다.</p>
                    <Link href="/dashboard" className="mt-4 inline-flex rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5">대시보드에서 곡 담기</Link>
                  </div>
                ) : (
                  <div className="space-y-2 [content-visibility:auto]">
                    {selectedPlaylist.tracks.map((track, index) => {
                      const isCurrent = currentTrackId === track.generationId && queuePlaylistId === selectedPlaylist.id;
                      return (
                        <div key={track.itemId} className={`group flex items-center gap-3 rounded-2xl border px-3 py-3 transition ${isCurrent ? "border-fuchsia-500/30 bg-fuchsia-500/10" : "border-transparent hover:border-white/5 hover:bg-white/[0.025]"}`}>
                          <button
                            onClick={() => {
                              if (isCurrent) togglePlayback();
                              else playQueue(selectedPlaylist.id, selectedPlaylist.name, selectedPlaylist.tracks, track.generationId);
                            }}
                            disabled={!track.isPlayable}
                            className="relative shrink-0"
                            aria-label={`${track.title} ${track.isPlayable ? (isCurrent && isPlaying ? "일시정지" : "재생") : "현재 재생 불가"}`}
                          >
                            <TrackArtwork track={track} />
                            <span className={`absolute inset-0 grid place-items-center rounded-xl bg-black/45 transition ${track.isPlayable ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
                              {track.isPlayable
                                ? (isCurrent && isPlaying ? <Pause className="h-4 w-4 fill-white text-white" /> : <Play className="h-4 w-4 fill-white text-white" />)
                                : <X className="h-4 w-4 text-zinc-400" />}
                            </span>
                          </button>
                          <span className="w-5 shrink-0 text-center text-[10px] font-mono text-zinc-600">{index + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm font-medium ${isCurrent ? "text-fuchsia-200" : "text-zinc-100"}`}>{track.title}</span>
                            <span className="mt-1 block text-[10px] text-zinc-600">
                              {track.isPlayable
                                ? `${track.audioGrade ? `Grade ${track.audioGrade}` : "Master"}${track.durationSeconds ? ` · ${Math.floor(track.durationSeconds / 60)}:${String(Math.floor(track.durationSeconds % 60)).padStart(2, "0")}` : ""}`
                                : "원곡 처리 중 또는 현재 재생 불가"}
                            </span>
                          </span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button onClick={() => void moveTrack(index, -1)} disabled={index === 0 || busyAction === `reorder-${selectedPlaylist.id}`} className="rounded-lg p-2 text-zinc-600 hover:bg-white/5 hover:text-white disabled:opacity-20" aria-label="위로 이동"><ArrowUp className="h-3.5 w-3.5" /></button>
                            <button onClick={() => void moveTrack(index, 1)} disabled={index === selectedPlaylist.tracks.length - 1 || busyAction === `reorder-${selectedPlaylist.id}`} className="rounded-lg p-2 text-zinc-600 hover:bg-white/5 hover:text-white disabled:opacity-20" aria-label="아래로 이동"><ArrowDown className="h-3.5 w-3.5" /></button>
                            <button onClick={() => void removeTrack(track)} disabled={busyAction === `remove-${track.itemId}`} className="rounded-lg p-2 text-zinc-600 hover:bg-red-500/10 hover:text-red-300" aria-label="플레이리스트에서 제거">{busyAction === `remove-${track.itemId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
