'use client'

import { useState } from 'react'
import { 
  FileText, Music, Sparkles, Wand2, Globe, Mic, Shuffle, AlertCircle, 
  Play, Zap, Flame, GitMerge, Moon, Copy, Check, Info, ListMusic, Tag, PlayCircle,
  PenTool, Users, User, X
} from 'lucide-react'
import type { LyricsSection, LyricsSectionType } from '@/types'
import type { PlaylistTrack } from '@/types/playlist'

interface LyricsBuilderProps {
  isInstrumental: boolean
  stylePrompt: string
  onInstrumentalToggle: (value: boolean) => void

  // 모드
  isPlaylistMode: boolean
  onPlaylistModeToggle: (val: boolean) => void
  trackCount: number
  onTrackCountChange: (count: number) => void
  engine: string

  // 단일곡 전용
  title: string
  onTitleChange: (title: string) => void
  youtubeTags: string
  snsHashtags: string
  onTagsChange: (youtubeTags: string, snsHashtags: string) => void
  sections: LyricsSection[]
  onSectionsChange: (sections: LyricsSection[]) => void

  // 플레이리스트 전용
  playlistTitle: string
  onPlaylistTitleChange: (title: string) => void
  playlistDescription: string
  onPlaylistDescriptionChange: (desc: string) => void
  playlistYoutubeTags: string
  playlistSnsHashtags: string
  onPlaylistTagsChange: (youtubeTags: string, snsHashtags: string) => void
  tracks: PlaylistTrack[]
  onTracksChange: (tracks: PlaylistTrack[]) => void
  activeTrackIdx: number
  onActiveTrackIdxChange: (idx: number) => void
  presetId?: string
  isJapanCampaign?: boolean

  // Voice DNA
  selectedVdCode?: string
  onSelectedVdCodeChange?: (code: string) => void
  vdOptions?: { code: string; name: string; gender?: string }[]
}

const SECTION_LABELS: Record<LyricsSectionType, { label: string; icon: React.ComponentType<any>; color: string }> = {
  intro: { label: 'Intro', icon: Play, color: 'text-blue-400 border-blue-500/40 bg-blue-500/10' },
  verse: { label: 'Verse', icon: Music, color: 'text-violet-400 border-violet-500/40 bg-violet-500/10' },
  'pre-chorus': { label: 'Pre-Chorus', icon: Zap, color: 'text-orange-400 border-orange-500/40 bg-orange-500/10' },
  chorus: { label: 'Chorus', icon: Flame, color: 'text-pink-400 border-pink-500/40 bg-pink-500/10' },
  bridge: { label: 'Bridge', icon: GitMerge, color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
  outro: { label: 'Outro', icon: Moon, color: 'text-teal-400 border-teal-500/40 bg-teal-500/10' },
}

const SECTION_ORDER: LyricsSectionType[] = ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro']

let idCounter = 0
const makeId = () => `section-${++idCounter}`

export default function LyricsBuilder({
  isInstrumental,
  stylePrompt,
  onInstrumentalToggle,
  isPlaylistMode,
  onPlaylistModeToggle,
  trackCount,
  onTrackCountChange,
  engine,
  title,
  onTitleChange,
  youtubeTags,
  snsHashtags,
  onTagsChange,
  sections,
  onSectionsChange,
  playlistTitle,
  onPlaylistTitleChange,
  playlistDescription,
  onPlaylistDescriptionChange,
  playlistYoutubeTags,
  playlistSnsHashtags,
  onPlaylistTagsChange,
  tracks,
  onTracksChange,
  activeTrackIdx,
  onActiveTrackIdxChange,
  presetId,
  isJapanCampaign = false,
  selectedVdCode = 'auto',
  onSelectedVdCodeChange,
  vdOptions = [],
}: LyricsBuilderProps) {
  const [topic, setTopic] = useState('')
  const [language, setLanguage] = useState<'ko' | 'en' | 'ja' | 'ko-en' | 'ja-en' | 'fr' | 'zh' | 'es' | 'pt' | 'de' | 'ru' | 'ar'>(isJapanCampaign ? 'ja' : 'ko')
  const [vocalGender, setVocalGender] = useState<'mixed' | 'female' | 'male' | 'duet'>('mixed')
  const [isGenerating, setIsGenerating] = useState(false)
  const [autoTitle, setAutoTitle] = useState(true) // 제목 자동생성 토글 (기본: ON)
  const [autoTopic, setAutoTopic] = useState(true) // 주제 자동생성 토글 (기본: ON)
  const [isVdDropdownOpen, setIsVdDropdownOpen] = useState(false)

  // 성별 필터링된 보이스 DNA 옵션
  const filteredVdOptions = vdOptions.filter(opt => {
    if (vocalGender === 'female') return opt.gender === 'female';
    if (vocalGender === 'male') return opt.gender === 'male';
    return true;
  });

  // 복사 피드백 상태
  const [copiedYT, setCopiedYT] = useState(false)
  const [copiedSNS, setCopiedSNS] = useState(false)
  const [copiedPLDesc, setCopiedPLDesc] = useState(false)

  // 단일곡용 추가/삭제 핸들러
  const addSingleSection = (type: LyricsSectionType) => {
    onSectionsChange([...sections, { id: makeId(), type, content: '', description: '' }])
  }
  const updateSingleSection = (id: string, content: string) => {
    onSectionsChange(sections.map((s) => (s.id === id ? { ...s, content } : s)))
  }
  const updateSingleDescription = (id: string, description: string) => {
    onSectionsChange(sections.map((s) => (s.id === id ? { ...s, description } : s)))
  }
  const insertVocalCue = (id: string, cue: string) => {
    onSectionsChange(sections.map((s) => {
      if (s.id !== id) return s
      const prefix = `(${cue}) `
      return { ...s, content: s.content ? `${prefix}${s.content}` : prefix }
    }))
  }
  const removeSingleSection = (id: string) => {
    onSectionsChange(sections.filter((s) => s.id !== id))
  }

  // 플레이리스트 개별 트랙 편집 핸들러
  const updateActiveTrackTitle = (newTitle: string) => {
    const updated = [...tracks]
    if (updated[activeTrackIdx]) {
      updated[activeTrackIdx].title = newTitle
      onTracksChange(updated)
    }
  }

  const updateActiveTrackTags = (yt: string, sns: string) => {
    const updated = [...tracks]
    if (updated[activeTrackIdx]) {
      updated[activeTrackIdx].youtubeTags = yt
      updated[activeTrackIdx].snsHashtags = sns
      onTracksChange(updated)
    }
  }

  const addActiveTrackSection = (type: LyricsSectionType) => {
    const updated = [...tracks]
    const track = updated[activeTrackIdx]
    if (track) {
      track.sections = [...track.sections, { id: makeId(), type, content: '' }]
      onTracksChange(updated)
    }
  }

  const updateActiveTrackSection = (id: string, content: string) => {
    const updated = [...tracks]
    const track = updated[activeTrackIdx]
    if (track) {
      track.sections = track.sections.map((s) => (s.id === id ? { ...s, content } : s))
      onTracksChange(updated)
    }
  }

  const removeActiveTrackSection = (id: string) => {
    const updated = [...tracks]
    const track = updated[activeTrackIdx]
    if (track) {
      track.sections = track.sections.filter((s) => s.id !== id)
      onTracksChange(updated)
    }
  }

  // GPT 생성 트리거
  const handleGenerateAI = async () => {
    if (!stylePrompt) {
      alert('장르나 무드 태그를 먼저 선택해주세요!')
      return
    }
    setIsGenerating(true)
    try {
      const response = await fetch('/api/lyrics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stylePrompt,
          topic,
          language,
          isPlaylistMode,
          trackCount,
          vocalGender,
          presetId,
        }),
      })
      const data = await response.json()
      if (data.success) {
        if (isPlaylistMode) {
          onPlaylistTitleChange(data.playlistTitle || '')
          onPlaylistDescriptionChange(data.youtubeDescription || '')
          onPlaylistTagsChange(data.youtubeTags || '', data.snsHashtags || '')
          onTracksChange(data.tracks || [])
          onActiveTrackIdxChange(0) // 첫번째 트랙 활성화
        } else {
          if (autoTitle) {
            onTitleChange(data.title || '')
          }
          onTagsChange(data.youtubeTags || '', data.snsHashtags || '')
          onSectionsChange(data.sections || [])
        }
      } else {
        alert(data.error || '생성 중 에러가 발생했습니다.')
      }
    } catch (error) {
      console.error(error)
      alert('네트워크 오류가 발생했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyText = async (text: string, type: 'yt' | 'sns' | 'desc') => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    if (type === 'yt') {
      setCopiedYT(true)
      setTimeout(() => setCopiedYT(false), 2000)
    } else if (type === 'sns') {
      setCopiedSNS(true)
      setTimeout(() => setCopiedSNS(false), 2000)
    } else {
      setCopiedPLDesc(true)
      setTimeout(() => setCopiedPLDesc(false), 2000)
    }
  }

  const activeTrack = tracks[activeTrackIdx]

  return (
    <div className="section-card">
      <div className="flex flex-col gap-4 mb-5 pb-4 border-b border-melodio-border/30">
        <div className="flex items-start gap-3">
          <FileText className="w-6 h-6 text-fuchsia-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h3 className="font-semibold text-melodio-text text-sm md:text-base leading-snug">가사 & 마케팅 빌더</h3>
            <p className="text-[11px] md:text-xs text-melodio-muted leading-relaxed">유튜브 설명, 타임라인 및 SNS 마케팅 최적화</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* 생성 곡 수 선택 */}
          <div className="flex items-center gap-1 bg-black/30 p-1 rounded-xl border border-melodio-border/50">
            {(engine === 'lyria3' ? [1, 10, 20, 30, 40] : [2, 10, 20, 30, 40]).map((count) => {
              const isActive = trackCount === count
              let label = ''
              if (count === 1) label = '1곡 (싱글)'
              else if (count === 2) label = '2곡 (기본)'
              else label = `${count}곡`

              return (
                <button
                  key={count}
                  onClick={() => onTrackCountChange(count)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-melodio-accent text-white shadow-melodio-glow'
                      : 'text-melodio-muted hover:text-melodio-text'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* 인스트루멘탈 */}
          <div className="flex items-center gap-2 border-l border-melodio-border/30 pl-4">
            <span className="text-xs text-melodio-muted">연주곡</span>
            <button
              onClick={() => onInstrumentalToggle(!isInstrumental)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                isInstrumental ? 'bg-melodio-accent' : 'bg-melodio-border'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isInstrumental ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {isInstrumental ? (
        <div className="flex items-center justify-center py-10 text-melodio-muted text-sm border-2 border-dashed border-melodio-border/20 rounded-xl">
          <Music className="w-4 h-4 text-zinc-400 mr-2 shrink-0 animate-pulse" /> 인스트루멘탈 모드 활성화됨 — 가사 없이 순수 연주곡으로 생성합니다
        </div>
      ) : (
        <>
          {/* GPT AI 전체 가사 생성 컨트롤러 */}
          <div className="mb-6 p-4 rounded-xl bg-black/20 border border-melodio-border/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-fuchsia-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-fuchsia-300 shrink-0" /> {isPlaylistMode ? `${trackCount}곡 플레이리스트` : trackCount === 1 ? '단일 곡' : '2곡 (기본)'} AI 자동 작성 및 기획
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {/* 곡 제목 입력 + AI 자동 작명 토글 */}
              {!isPlaylistMode && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-melodio-muted font-medium flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-zinc-400 shrink-0" /> 곡 제목 (Title)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setAutoTitle(!autoTitle)
                        if (!autoTitle) onTitleChange('') // 자동으로 전환 시 기존 제목 초기화
                      }}
                      className="flex items-center gap-1.5 text-[11px] font-medium transition-colors"
                    >
                      <span className={autoTitle ? 'text-fuchsia-400' : 'text-melodio-muted'}>AI 자동 작명</span>
                      <div
                        className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${
                          autoTitle ? 'bg-fuchsia-500' : 'bg-zinc-600'
                        }`}
                      >
                        <div
                          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200 ${
                            autoTitle ? 'translate-x-[16px]' : 'translate-x-[2px]'
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    disabled={autoTitle}
                    placeholder={
                      autoTitle 
                        ? 'AI가 가사와 곡 분위기에 맞춰 감성적인 제목을 자동 작명합니다' 
                        : '직접 사용할 곡 제목을 입력하세요 (예: 푸른 하늘 아래서)'
                    }
                    className={`px-3 py-2 rounded-lg border font-semibold transition-all disabled:opacity-100
                      ${autoTitle
                        ? 'bg-black/10 border-zinc-800/50 text-[13px] text-zinc-500 placeholder:text-zinc-500/70 cursor-not-allowed'
                        : 'bg-black/30 border-zinc-700/80 text-sm text-melodio-text focus:outline-none focus:border-melodio-accent'
                      }`}
                  />
                </div>
              )}

              {/* 가사 주제 입력 + AI 자동 기획 토글 */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-melodio-muted font-medium flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" /> 가사 주제 및 스토리 (Theme)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoTopic(!autoTopic)
                      if (!autoTopic) setTopic('') // 자동으로 전환 시 기존 주제 초기화
                    }}
                    className="flex items-center gap-1.5 text-[11px] font-medium transition-colors"
                  >
                    <span className={autoTopic ? 'text-fuchsia-400' : 'text-melodio-muted'}>AI 자동 기획</span>
                    <div
                      className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${
                        autoTopic ? 'bg-fuchsia-500' : 'bg-zinc-600'
                      }`}
                    >
                      <div
                        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200 ${
                          autoTopic ? 'translate-x-[16px]' : 'translate-x-[2px]'
                        }`}
                      />
                    </div>
                  </button>
                </div>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={autoTopic}
                  placeholder={
                    autoTopic
                      ? 'AI가 선택한 음악 스타일에 가장 잘 어울리는 주제로 자동 기획합니다'
                      : isPlaylistMode
                        ? '플레이리스트에 적용할 테마나 스토리를 입력하세요 (예: 새벽 공부를 위한 피아노 로파이)'
                        : '가사에 담고 싶은 감성이나 이야기를 적어보세요 (예: 가을 밤의 편지)'
                  }
                  className={`w-full px-3 py-2 rounded-lg border transition-all disabled:opacity-100
                    ${autoTopic
                      ? 'bg-black/10 border-zinc-800/50 text-[13px] text-zinc-500 placeholder:text-zinc-500/70 cursor-not-allowed'
                      : 'bg-black/30 border-zinc-700/80 text-sm text-melodio-text placeholder:text-melodio-muted focus:outline-none focus:border-melodio-accent'
                    }`}
                />
              </div>

              {/* 가창 & 언어 설정 (독립된 행으로 분리) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-melodio-muted font-medium flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-zinc-400 shrink-0" /> 가사 언어 (Lyrics Language)
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-black/40 border border-melodio-border text-melodio-text
                               focus:outline-none focus:border-melodio-accent font-sans"
                  >
                    {!isJapanCampaign && <option value="ko">한국어 (Korean)</option>}
                    {!isJapanCampaign && <option value="ko-en">한국어 + 영어 (Ko + En)</option>}
                    <option value="en">영어 (English)</option>
                    <option value="ja">일본어 (Japanese)</option>
                    <option value="ja-en">일본어 + 영어 (Ja + En)</option>
                    <option value="zh">중국어 (Chinese)</option>
                    <option value="es">스페인어 (Spanish)</option>
                    <option value="pt">포르투갈어 (Portuguese)</option>
                    <option value="fr">프랑스어 (French)</option>
                    <option value="de">독일어 (German)</option>
                    <option value="it">이탈리아어 (Italian)</option>
                    <option value="hi">힌디어 (Hindi)</option>
                    <option value="ru">러시아어 (Russian)</option>
                    <option value="ar">아랍어 (Arabic)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-melodio-muted font-medium flex items-center gap-1.5">
                    <Mic className="w-3 h-3 text-zinc-400 shrink-0" /> 보컬 스타일 (Vocal Style)
                  </label>
                  <select
                    value={vocalGender}
                    onChange={(e) => {
                      const val = e.target.value as any
                      setVocalGender(val)
                      if (val === 'mixed' || val === 'duet') {
                        onSelectedVdCodeChange?.('auto')
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-black/40 border border-melodio-border text-melodio-text
                               focus:outline-none focus:border-melodio-accent font-sans"
                  >
                    <option value="mixed">젠더 랜덤/혼합 (Random/Mixed)</option>
                    <option value="female">여성 보컬 (Female Vocal)</option>
                    <option value="male">남성 보컬 (Male Vocal)</option>
                    <option value="duet">남녀 듀엣 (Duet)</option>
                  </select>
                </div>

                {/* VoiceDNA Dropdown (Relocated to Vocal/Lyrics Planner step) */}
                <div className="flex flex-col gap-1.5 relative">
                  <label className={`text-[11px] font-medium flex items-center gap-1.5 ${
                    vocalGender === 'mixed' || vocalGender === 'duet' ? 'text-zinc-500' : 'text-cyan-400'
                  }`}>
                    <Mic className={`w-3 h-3 shrink-0 ${
                      vocalGender === 'mixed' || vocalGender === 'duet' ? 'text-zinc-500' : 'text-cyan-400'
                    }`} /> 가상 보이스 (Voice DNA)
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      disabled={vocalGender === 'mixed' || vocalGender === 'duet'}
                      onClick={() => setIsVdDropdownOpen(!isVdDropdownOpen)}
                      className={`w-full flex items-center justify-between gap-1.5 px-3 py-2 rounded-lg border text-sm font-sans transition-all text-left ${
                        vocalGender === 'mixed' || vocalGender === 'duet'
                          ? 'border-zinc-800 bg-zinc-950/20 text-zinc-500 cursor-not-allowed'
                          : selectedVdCode !== 'auto'
                          ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                          : 'border-melodio-border bg-black/40 text-melodio-muted hover:border-cyan-500/50'
                      }`}
                    >
                      <span className="truncate">
                        {vocalGender === 'mixed' || vocalGender === 'duet'
                          ? 'Auto (듀엣/랜덤 사용 불가)'
                          : selectedVdCode === 'auto'
                          ? 'Auto (기본 기획 음색)'
                          : vdOptions?.find(o => o.code === selectedVdCode)?.name || selectedVdCode}
                      </span>
                      {vocalGender !== 'mixed' && vocalGender !== 'duet' && (
                        <span className="text-[9px] opacity-70">▼</span>
                      )}
                    </button>

                    {isVdDropdownOpen && vocalGender !== 'mixed' && vocalGender !== 'duet' && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setIsVdDropdownOpen(false)}
                        />
                        <div className="absolute right-0 mt-1 w-full bg-[#1a1515] border border-zinc-800 rounded-lg shadow-2xl z-50 py-1 text-xs max-h-48 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectedVdCodeChange?.('auto');
                              setIsVdDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-cyan-500/15 hover:text-cyan-300 flex items-center justify-between text-zinc-300 border-b border-white/5"
                          >
                            <span>Auto (기본 기획 음색)</span>
                            {selectedVdCode === 'auto' && <span className="text-cyan-400">✓</span>}
                          </button>
                          {filteredVdOptions.map((opt) => (
                            <button
                              key={opt.code}
                              type="button"
                              onClick={() => {
                                onSelectedVdCodeChange?.(opt.code);
                                setIsVdDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-cyan-500/15 hover:text-cyan-300 flex items-center justify-between text-zinc-300"
                            >
                              <span className="truncate">{opt.name}</span>
                              {selectedVdCode === opt.code && <span className="text-cyan-400">✓</span>}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-center mt-1">
                <button
                  onClick={handleGenerateAI}
                  disabled={isGenerating}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold bg-melodio-accent/80 hover:bg-melodio-accent
                             text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-melodio-glow"
                >
                  {isGenerating ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      생성 중...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 shrink-0" />
                      전체 가사 생성
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {/* [모드 A] 플레이리스트 기획 모드 화면 */}
          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {isPlaylistMode ? (
            <div className="flex flex-col gap-6">
              {/* 1. 플레이리스트 전체 메타 정보 */}
              {(playlistTitle || playlistDescription) && (
                <div className="p-4 rounded-xl bg-fuchsia-500/5 border border-fuchsia-500/20 flex flex-col gap-4">
                  <div className="text-xs font-bold text-fuchsia-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ListMusic className="w-4 h-4 text-fuchsia-300 shrink-0" /> 유튜브 플레이리스트 통합 기획 패키지
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-melodio-muted">플레이리스트 비디오 제목</label>
                    <input
                      type="text"
                      value={playlistTitle}
                      onChange={(e) => onPlaylistTitleChange(e.target.value)}
                      className="px-3 py-2 rounded-lg text-sm bg-black/40 border border-zinc-700/80 font-bold text-melodio-text"
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* 유튜브 설명란 (타임라인 포함) */}
                    <div className="lg:col-span-2 flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs text-melodio-muted">유튜브 설명 (Description / Timestamps)</label>
                        <button
                          onClick={() => handleCopyText(playlistDescription, 'desc')}
                          className="flex items-center gap-1 text-[10px] text-fuchsia-400 hover:text-fuchsia-300 font-bold"
                        >
                          {copiedPLDesc ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> 복사 완료
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> 전체 설명 복사
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        value={playlistDescription}
                        onChange={(e) => onPlaylistDescriptionChange(e.target.value)}
                        rows={6}
                        className="px-3 py-2 rounded-lg text-xs bg-black/40 border border-zinc-700/80 text-melodio-text resize-y font-mono"
                      />
                    </div>

                    {/* 태그 / 해시태그 */}
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs text-melodio-muted">공통 SEO 태그</label>
                          <button
                            onClick={() => handleCopyText(playlistYoutubeTags, 'yt')}
                            className="flex items-center gap-1 text-[10px] text-fuchsia-400 hover:text-fuchsia-300 font-bold"
                          >
                            {copiedYT ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" /> 복사됨
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> 복사
                              </>
                            )}
                          </button>
                        </div>
                        <textarea
                          value={playlistYoutubeTags}
                          onChange={(e) => onPlaylistTagsChange(e.target.value, playlistSnsHashtags)}
                          className="px-3 py-2 rounded-lg text-[11px] bg-black/40 border border-zinc-700/80 text-melodio-text h-28 resize-y"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <label className="text-xs text-melodio-muted">공통 SNS 해시태그</label>
                          <button
                            onClick={() => handleCopyText(playlistSnsHashtags, 'sns')}
                            className="flex items-center gap-1 text-[10px] text-fuchsia-400 hover:text-fuchsia-300 font-bold"
                          >
                            {copiedSNS ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" /> 복사됨
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> 복사
                              </>
                            )}
                          </button>
                        </div>
                        <textarea
                          value={playlistSnsHashtags}
                          onChange={(e) => onPlaylistTagsChange(playlistYoutubeTags, e.target.value)}
                          className="px-3 py-2 rounded-lg text-[11px] bg-black/40 border border-zinc-700/80 text-melodio-text h-28 resize-y font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. 10곡 트랙 네비게이터 탭 */}
              {tracks.length > 0 && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-melodio-border/20 pb-2">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-zinc-400 shrink-0" /> 수록곡 선택 및 개별 가사 편집 ({tracks.length}곡 구성)
                    </span>
                  </div>

                  {/* 10개 트랙 가로 스크롤 탭 바 */}
                  <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                    {tracks.map((track, idx) => (
                      <button
                        key={track.trackNumber}
                        onClick={() => onActiveTrackIdxChange(idx)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                          activeTrackIdx === idx
                            ? 'bg-melodio-accent border-melodio-accent text-white shadow-melodio-glow'
                            : 'bg-black/20 border-melodio-border text-melodio-muted hover:text-melodio-text hover:border-melodio-accent/50'
                        }`}
                      >
                        #{track.trackNumber} {track.title || `트랙 ${track.trackNumber}`}
                      </button>
                    ))}
                  </div>

                  {/* 활성화된 개별 트랙 상세 편집 패널 */}
                  {activeTrack && (
                    <div className="p-4 rounded-xl bg-black/10 border border-melodio-border/40 flex flex-col gap-4 animate-fade-in">
                      {/* 개별 곡 제목 */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-melodio-muted font-medium">#{activeTrack.trackNumber} 수록곡 제목</label>
                        <input
                          type="text"
                          value={activeTrack.title}
                          onChange={(e) => updateActiveTrackTitle(e.target.value)}
                          className="px-3 py-2 rounded-lg text-sm bg-black/40 border border-zinc-700/80 text-melodio-text font-bold"
                        />
                      </div>

                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-melodio-muted font-medium">곡 개별 SEO 태그</label>
                          <textarea
                            value={activeTrack.youtubeTags}
                            onChange={(e) => updateActiveTrackTags(e.target.value, activeTrack.snsHashtags)}
                            className="px-3 py-2 rounded-lg text-xs bg-black/40 border border-zinc-700/80 text-melodio-text h-24 resize-y"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-melodio-muted font-medium">곡 개별 SNS 해시태그</label>
                          <textarea
                            value={activeTrack.snsHashtags}
                            onChange={(e) => updateActiveTrackTags(activeTrack.youtubeTags, e.target.value)}
                            className="px-3 py-2 rounded-lg text-xs bg-black/40 border border-zinc-700/80 text-melodio-text h-24 resize-y font-mono"
                          />
                        </div>
                      </div>

                      {/* 트랙 가사 섹션 빌더 */}
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-melodio-muted flex-shrink-0">가사 파트 배열</span>
                          <div className="flex flex-wrap gap-1.5 justify-end">
                            {SECTION_ORDER.map((type) => (
                              <button
                                key={type}
                                onClick={() => addActiveTrackSection(type)}
                                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-300 transition-all hover:scale-105"
                              >
                                + {type.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>

                        {activeTrack.sections.length === 0 ? (
                          <div className="text-center py-8 px-4 border border-dashed border-melodio-border/20 rounded-xl bg-black/15 flex flex-col items-center justify-center gap-2">
                            <FileText className="w-8 h-8 text-zinc-600 mb-1 shrink-0" />
                            <div className="text-melodio-text font-semibold text-xs">등록된 가사 파트가 없습니다</div>
                            <p className="text-[11px] text-melodio-muted max-w-sm leading-relaxed">
                              상단 <strong>AI 자동 작성</strong>을 통해 트랙별 가사를 전체 가사 생성하거나, 
                              아래 <strong>[Intro/Verse/Chorus...]</strong> 버튼들을 이용해 원하는 가사 섹션을 개별로 추가해 작사하실 수 있습니다.
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {activeTrack.sections.map((section, sIdx) => {
                              const meta = SECTION_LABELS[section.type] || {
                                label: section.type.toUpperCase(),
                                icon: Music,
                                color: 'text-zinc-400 border-zinc-500/40 bg-zinc-500/10',
                              }
                              const Icon = meta.icon;
                              return (
                                <div key={section.id} className={`rounded-lg border p-2.5 ${meta.color}`}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-bold uppercase flex items-center gap-1">
                                      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />} [{meta.label} {
                                        activeTrack.sections.filter((s, i) => s.type === section.type && i <= sIdx).length
                                      }]
                                    </span>
                                    <button
                                      onClick={() => removeActiveTrackSection(section.id)}
                                      className="p-0.5 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <textarea
                                    value={section.content}
                                    onChange={(e) => updateActiveTrackSection(section.id, e.target.value)}
                                    rows={2}
                                    className="w-full bg-transparent text-xs text-melodio-text resize-none focus:outline-none"
                                  />
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // [모드 B] 단일 곡 가사 편집 화면
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            <div className="flex flex-col gap-4 animate-fade-in">
              {(title || youtubeTags || snsHashtags) && (
                <div className="p-4 rounded-xl bg-fuchsia-500/5 border border-fuchsia-500/20 flex flex-col gap-4">
                  <div className="text-xs font-bold text-fuchsia-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-fuchsia-300 shrink-0" /> AI 생성 단일 곡 메타데이터 & 마케팅 정보
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-melodio-muted font-medium">곡 제목 (Title)</label>
                      <span className={`text-[10px] font-medium flex items-center gap-1 ${autoTitle ? 'text-fuchsia-400' : 'text-emerald-400'}`}>
                        {autoTitle ? (
                          <>
                            <Sparkles className="w-3 h-3 text-fuchsia-400 shrink-0" /> AI 생성
                          </>
                        ) : (
                          <>
                            <PenTool className="w-3 h-3 text-emerald-400 shrink-0" /> 수동 입력
                          </>
                        )}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => onTitleChange(e.target.value)}
                      placeholder="노래 제목을 입력하세요"
                      className="px-3 py-2 rounded-lg text-sm bg-black/40 border border-zinc-700/80 text-melodio-text focus:outline-none focus:border-melodio-accent font-semibold"
                    />
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs text-melodio-muted font-medium">YouTube 검색 노출 태그 (SEO)</label>
                        <button
                          onClick={() => handleCopyText(youtubeTags, 'yt')}
                          className="flex items-center gap-1 text-[10px] text-fuchsia-400 hover:text-fuchsia-300 font-bold"
                        >
                          {copiedYT ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> 복사 완료
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> 복사
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        value={youtubeTags}
                        onChange={(e) => onTagsChange(e.target.value, snsHashtags)}
                        className="px-3 py-2.5 rounded-lg text-xs bg-black/40 border border-zinc-700/80 text-melodio-text h-28 resize-y leading-relaxed"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-xs text-melodio-muted font-medium">SNS 마케팅 해시태그 (릴스/틱톡)</label>
                        <button
                          onClick={() => handleCopyText(snsHashtags, 'sns')}
                          className="flex items-center gap-1 text-[10px] text-fuchsia-400 hover:text-fuchsia-300 font-bold"
                        >
                          {copiedSNS ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> 복사 완료
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> 복사
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        value={snsHashtags}
                        onChange={(e) => onTagsChange(youtubeTags, e.target.value)}
                        className="px-3 py-2.5 rounded-lg text-xs bg-black/40 border border-zinc-700/80 text-melodio-text h-28 resize-y font-mono leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 섹션 추가 버튼 */}
              <div className="flex flex-wrap gap-2 mb-2">
                {SECTION_ORDER.map((type) => {
                  const meta = SECTION_LABELS[type]
                  const Icon = meta.icon;
                  return (
                    <button
                      key={type}
                      onClick={() => addSingleSection(type)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 hover:scale-105 ${meta.color}`}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />} + {meta.label}
                    </button>
                  )
                })}
              </div>

              {/* 섹션 리스트 */}
              {sections.length === 0 ? (
                <div className="text-center py-12 px-6 border border-dashed border-melodio-border/20 rounded-xl bg-black/15 flex flex-col items-center justify-center gap-3">
                  <FileText className="w-10 h-10 text-zinc-600 mb-1 shrink-0" />
                  <div className="text-melodio-text font-semibold text-sm">등록된 가사가 없습니다</div>
                  <p className="text-xs text-melodio-muted max-w-md leading-relaxed">
                    상단의 <strong>AI 자동 작성</strong> 창에 곡의 주제(예: 비 오는 밤 그리움)를 적고 실행하시면 GPT가 가사를 대신 기획해 줍니다. 
                    혹은 아래의 <strong>[Intro/Verse/Chorus...]</strong> 파트 버튼을 클릭하여 가사 카드를 생성하고 직접 작사하실 수 있습니다.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {sections.map((section, idx) => {
                    const meta = SECTION_LABELS[section.type] || {
                      label: section.type.toUpperCase(),
                      icon: Music,
                      color: 'text-zinc-400 border-zinc-500/40 bg-zinc-500/10',
                    }
                    const Icon = meta.icon;
                    return (
                      <div key={section.id} className={`rounded-xl border p-3 ${meta.color}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />} [{meta.label} {
                              sections.filter((s, i) => s.type === section.type && i <= idx).length
                            }]
                          </span>
                          <button
                            onClick={() => removeSingleSection(section.id)}
                            className="p-0.5 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* 연주 지시어 입력 */}
                        <input
                          value={section.description || ''}
                          onChange={(e) => updateSingleDescription(section.id, e.target.value)}
                          placeholder={`연주 지시어 (예: soft piano, vinyl crackle, breathy vocal)`}
                          className="w-full bg-black/20 border border-current/20 rounded-md px-2 py-1 text-[11px] text-melodio-text placeholder:text-melodio-muted/30 focus:outline-none focus:border-current/50 mb-2 font-mono"
                        />
                        {/* 보컬 퍼포먼스 큐 버튼 */}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {['whispered', 'belted', 'falsetto', 'spoken', 'ad-lib', 'raspy', 'breathy', 'vocal run'].map((cue) => (
                            <button
                              key={cue}
                              onClick={() => insertVocalCue(section.id, cue)}
                              className="px-1.5 py-0.5 rounded text-[9px] border border-current/20 hover:bg-current/10 transition-colors opacity-60 hover:opacity-100"
                              title={`가사 앞에 (${cue}) 삽입`}
                            >
                              ({cue})
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={section.content}
                          onChange={(e) => updateSingleSection(section.id, e.target.value)}
                          rows={3}
                          placeholder="가사를 입력하세요..."
                          className="w-full bg-transparent text-sm text-melodio-text placeholder:text-melodio-muted/40 resize-none focus:outline-none"
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
