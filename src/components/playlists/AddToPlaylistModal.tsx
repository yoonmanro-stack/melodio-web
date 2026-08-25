"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FolderPlus, ListMusic, Loader2, Plus, X } from "lucide-react";
import {
  addTrackToLibraryPlaylist,
  createLibraryPlaylist,
  fetchPlaylistLibrary,
} from "@/lib/playlists/playlist-client";
import type { LibraryPlaylist } from "@/types/library-playlist";

interface AddToPlaylistModalProps {
  isOpen: boolean;
  generationId: string | null;
  trackTitle: string;
  onClose: () => void;
  onAdded?: (playlistName: string, alreadyAdded: boolean) => void;
}

export default function AddToPlaylistModal({
  isOpen,
  generationId,
  trackTitle,
  onClose,
  onAdded,
}: AddToPlaylistModalProps) {
  const [playlists, setPlaylists] = useState<LibraryPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyPlaylistId, setBusyPlaylistId] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedPlaylistIds, setAddedPlaylistIds] = useState<Set<string>>(() => new Set());
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setAddedPlaylistIds(new Set());

    void fetchPlaylistLibrary()
      .then((data) => {
        if (!cancelled) setPlaylists(data);
      })
      .catch((requestError: Error) => {
        if (!cancelled) setError(requestError.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [generationId, isOpen]);

  const containingPlaylistIds = useMemo(() => {
    if (!generationId) return new Set<string>();
    const ids = new Set(
      playlists
        .filter((playlist) => playlist.tracks.some((track) => track.generationId === generationId))
        .map((playlist) => playlist.id),
    );
    addedPlaylistIds.forEach((playlistId) => ids.add(playlistId));
    return ids;
  }, [addedPlaylistIds, generationId, playlists]);

  if (!isOpen || !generationId) return null;

  const addToPlaylist = async (playlist: LibraryPlaylist) => {
    setBusyPlaylistId(playlist.id);
    setError(null);
    try {
      const result = await addTrackToLibraryPlaylist(playlist.id, generationId);
      setAddedPlaylistIds((current) => new Set(current).add(playlist.id));
      onAdded?.(playlist.name, !result.added);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "곡을 추가하지 못했습니다.");
    } finally {
      setBusyPlaylistId(null);
    }
  };

  const createAndAdd = async () => {
    const name = newPlaylistName.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    setError(null);
    let createdPlaylist: LibraryPlaylist | null = null;
    try {
      const created = await createLibraryPlaylist({ name });
      createdPlaylist = created;
      setPlaylists((current) => [created, ...current]);
      const result = await addTrackToLibraryPlaylist(created.id, generationId);
      setAddedPlaylistIds((current) => new Set(current).add(created.id));
      setNewPlaylistName("");
      onAdded?.(created.name, !result.added);
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : "플레이리스트를 만들지 못했습니다.";
      setError(createdPlaylist
        ? `‘${createdPlaylist.name}’은 만들었지만 곡을 담지 못했습니다. ${message}`
        : message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-playlist-title"
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#111217] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-white/5 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300">내 음악 정리</p>
            <h2 id="add-to-playlist-title" className="mt-1 text-lg font-semibold text-white">플레이리스트에 추가</h2>
            <p className="mt-1 truncate text-xs text-zinc-500">{trackTitle}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white" aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="p-5">
          <div className="mb-5 rounded-2xl border border-white/5 bg-black/30 p-3">
            <label htmlFor="new-playlist-name" className="mb-2 block text-[11px] font-semibold text-zinc-300">새 플레이리스트 만들고 바로 담기</label>
            <div className="flex gap-2">
              <input
                id="new-playlist-name"
                value={newPlaylistName}
                onChange={(event) => setNewPlaylistName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createAndAdd();
                }}
                maxLength={80}
                placeholder="예: 밤 작업용"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-fuchsia-500/50"
              />
              <button
                onClick={() => void createAndAdd()}
                disabled={isCreating || !newPlaylistName.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                만들기
              </button>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">기존 플레이리스트</span>
            <span className="text-[10px] text-zinc-600">여러 곳에 담을 수 있어요</span>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="grid place-items-center py-10 text-zinc-500"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : playlists.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 py-8 text-center">
                <FolderPlus className="mx-auto h-6 w-6 text-zinc-600" />
                <p className="mt-2 text-xs text-zinc-500">아직 플레이리스트가 없습니다.</p>
              </div>
            ) : playlists.map((playlist) => {
              const alreadyAdded = containingPlaylistIds.has(playlist.id);
              const wasAddedHere = addedPlaylistIds.has(playlist.id)
                && !playlist.tracks.some((track) => track.generationId === generationId);
              const isBusy = busyPlaylistId === playlist.id;
              return (
                <button
                  key={playlist.id}
                  onClick={() => void addToPlaylist(playlist)}
                  disabled={isBusy || alreadyAdded}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.025] px-3 py-3 text-left transition hover:border-fuchsia-500/20 hover:bg-fuchsia-500/5 disabled:cursor-default"
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${alreadyAdded ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-zinc-400"}`}>
                    {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : alreadyAdded ? <Check className="h-4 w-4" /> : <ListMusic className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-white">{playlist.name}</span>
                    <span className="mt-0.5 block text-[10px] text-zinc-500">{playlist.tracks.length + (wasAddedHere ? 1 : 0)}곡</span>
                  </span>
                  <span className={`text-[10px] font-semibold ${alreadyAdded ? "text-emerald-400" : "text-fuchsia-300"}`}>
                    {alreadyAdded ? "담김" : "추가"}
                  </span>
                </button>
              );
            })}
          </div>

          {error ? <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
