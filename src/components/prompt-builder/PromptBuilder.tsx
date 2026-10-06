'use client'
import { SUNO_VERSIONS, currentSunoVersion } from '@/lib/suno-models'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Wand2, Sparkles, Mic2, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { TagSelections, LyricsSection, Preset, PromptPayload, MusicEngine } from '@/types'
import type { Database } from '@/types/database'
import { categories, SINGLE_SELECT_CATEGORIES } from '@/data/categories'
import { presets } from '@/data/presets'
import { mergePublicPresetCatalog, findStudioPreset } from '@/lib/preset-catalog'
import { resolvePresetApplication, parsePresetLyrics, resolveGeneratedPresetStyle } from '@/lib/preset-application'
import { compileLyricsSections } from '@/lib/lyrics/compile-sections'
import { useAuth } from '@/hooks/useAuth'
import { useHistory } from '@/hooks/useHistory'
import { useVoice } from '@/contexts/VoiceContext'
import { studioVoiceFields as resolveStudioVoiceFields } from '@/lib/voice/studio-selection'
import { StudioArtistPicker, useStudioArtist } from '@/components/artists/StudioArtistPicker'
import { resolveArtistMusicStyle } from '@/lib/artists/studio-style'
import { composeStylePrompt, enforceSingleSelect, resolveRotationPrompt } from '@/lib/prompt-compositor'
import { supabase } from '@/lib/supabase'
import GenreSelector from './GenreSelector'
import CategorySection from './CategorySection'
import LyricsBuilder from './LyricsBuilder'
import PresetGrid from './PresetGrid'
import PromptOutput from './PromptOutput'
import CreatePresetModal from './CreatePresetModal'
import ProPaywallModal from './ProPaywallModal'

/** 가사에는 구조 태그와 실제 노랫말만 전달한다. */
function buildLyricsPrompt(sections: LyricsSection[]): string {
  return compileLyricsSections(sections).lyricsPrompt
}

/** Lyria 3가 제공되지 않는 동안 자동 선택은 Suno를 사용한다. */
function autoSelectEngine(selections: TagSelections, isInstrumental: boolean): MusicEngine {
  return 'suno_v5'
}

/** 단일 선택 강제 카테고리인지 확인 */
const isSingleSelect = (catId: string): boolean =>
  (SINGLE_SELECT_CATEGORIES as readonly string[]).includes(catId)

interface PromptBuilderProps {
  isDrawerMode?: boolean;
  initialPreset?: Preset | null;
  onOpenProPaywall?: () => void;
  sourceMenu?: string;
  externalStylePrompt?: string;
}

export default function PromptBuilder({
  isDrawerMode = false,
  initialPreset = null,
  onOpenProPaywall,
  sourceMenu,
  externalStylePrompt,
}: PromptBuilderProps = {}) {
  const [selections, setSelections] = useState<TagSelections>({})
  const [lyricsSections, setLyricsSections] = useState<LyricsSection[]>([])
  const [lyricsLanguage, setLyricsLanguage] = useState('ko')
  const [isInstrumental, setIsInstrumental] = useState(false)
  const [engine, setEngine] = useState<MusicEngine>('auto')
  const [sunoVersion, setSunoVersion] = useState<string>('v6')
  const [isSunoDropdownOpen, setIsSunoDropdownOpen] = useState(false)
  const [trackCount, setTrackCount] = useState<number>(2)
  const [isGenerating, setIsGenerating] = useState(false)
  const [title, setTitle] = useState('')
  const [youtubeTags, setYoutubeTags] = useState('')
  const [snsHashtags, setSnsHashtags] = useState('')

  // 🔮 이미지 감성 분석 배너 6장 슬라이더 상태
  const BANNER_SLIDES = useMemo(() => [
    "/image_to_music_slide1.jpg",
    "/image_to_music_slide2.jpg",
    "/image_to_music_slide3.jpg",
    "/image_to_music_slide4.jpg",
    "/image_to_music_slide5.jpg",
    "/image_to_music_slide6.jpg"
  ], [])
  const [bannerSlideIdx, setBannerSlideIdx] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setBannerSlideIdx((prev) => (prev + 1) % BANNER_SLIDES.length)
    }, 4500)
    return () => clearInterval(timer)
  }, [BANNER_SLIDES])

  // 플레이리스트 전용 상태
  const [isPlaylistMode, setIsPlaylistMode] = useState(false)
  const [playlistTitle, setPlaylistTitle] = useState('')
  const [playlistDescription, setPlaylistDescription] = useState('')
  const [playlistYoutubeTags, setPlaylistYoutubeTags] = useState('')
  const [playlistSnsHashtags, setPlaylistSnsHashtags] = useState('')
  const [tracks, setTracks] = useState<any[]>([])
  const [activeTrackIdx, setActiveTrackIdx] = useState(0)
  const [manualStylePrompt, setStylePrompt] = useState('')

  useEffect(() => {
    if (externalStylePrompt !== undefined) {
      setStylePrompt(externalStylePrompt)
    }
  }, [externalStylePrompt])
  const [excludePrompt, setExcludePrompt] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [isAsmrEnabled, setIsAsmrEnabled] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const remixId = searchParams.get('remix')

  const [genModalState, setGenModalState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [genErrorMsg, setGenErrorMsg] = useState('')

  // ─── VoiceDNA Integration ──────────────────────────────────────────
  const [selectedVdCode, setSelectedVdCode] = useState<string>('auto')
  const [vdOptions, setVdOptions] = useState<{ code: string; name: string }[]>([])

  const { user } = useAuth()
  const { saveHistory } = useHistory()
  const { activeVoice, studioGender } = useVoice()
  const artistState = useStudioArtist({ userId: user?.id, initialArtistId: searchParams.get('artistId'), lyricsLanguage,
    hasLyrics: lyricsSections.some(section => Boolean(section.content?.trim())) || tracks.some(track => Array.isArray(track.sections) && track.sections.some((section: LyricsSection) => Boolean(section.content?.trim()))),
    onLyricsLanguageChange: setLyricsLanguage })
  const stylePrompt = resolveArtistMusicStyle(manualStylePrompt, artistState.defaultMusicStyle)
  const artistSettings = { isInstrumental, sunoVersion, sourceMenu: sourceMenu || searchParams.get('sourceMenu') || 'audio-forge', stylePrompt, vocalSelections: selections.vocal }
  const studioVoiceFields = artistState.artistVoice
    ? { vocalGender: artistState.artistVoice.gender, activeVoice: null, voicePrompt: undefined, vdCode: undefined, lyricsLanguage }
    : resolveStudioVoiceFields(studioGender, activeVoice, lyricsLanguage)

  const [isPro, setIsPro] = useState(false)
  const [customPresets, setCustomPresets] = useState<Preset[]>([])
  const [dbPresets, setDbPresets] = useState<Preset[]>([])
  const publicPresetCatalog = useMemo(() => mergePublicPresetCatalog(dbPresets, presets), [dbPresets])
  const [isCreatePresetOpen, setIsCreatePresetOpen] = useState(false)
  const [isProPaywallOpen, setIsProPaywallOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null)
  const [viralTrends, setViralTrends] = useState<{ spotify: any[], tiktok: any[] } | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')
  const [selectedPresetName, setSelectedPresetName] = useState<string>('')
  const selectedStudioPreset = findStudioPreset(selectedPresetId, customPresets, publicPresetCatalog)
  const [dynamicElements, setDynamicElements] = useState<any>(null)
  const [ambienceVolume, setAmbienceVolume] = useState<number>(20)

  const isApplyingPresetRef = useRef(false)
  const appliedPresetPromptRef = useRef('')

  // VoiceDNA 로컬 스토리지 & 기본 옵션 통합 로드
  useEffect(() => {
    const system = [
      { code: 'VD-1004', name: 'Aria (Pop Soprano)', gender: 'female' },
      { code: 'VD-3802', name: 'Kaelen (Soul Baritone)', gender: 'male' },
      { code: 'VD-7705', name: 'Moe (Kawaii Synth)', gender: 'female' }
    ];
    let custom: any[] = [];
    try {
      const savedUserVoices = localStorage.getItem("melodio_user_voices");
      if (savedUserVoices) {
        const parsed = JSON.parse(savedUserVoices);
        custom = parsed.map((v: any) => ({
          code: v.id,
          name: v.name,
          gender: v.gender || 'female',
          sourceType: v.sourceType
        }));
      }
      const savedLegacy = localStorage.getItem("custom_voice_dnas");
      if (savedLegacy) {
        const parsedLegacy = JSON.parse(savedLegacy);
        parsedLegacy.forEach((v: any) => {
          if (!custom.some(c => c.code === v.vd_code)) {
            custom.push({ 
              code: v.vd_code, 
              name: `${v.name} (${v.vd_code})`,
              gender: v.physical_layers?.gender || 'female'
            });
          }
        });
      }
    } catch (e) {
      console.error(e);
    }
    setVdOptions([...system, ...custom]);
  }, []);

  // 0. 실시간 바이럴 트렌드 로드
  useEffect(() => {
    fetch('/api/viral-trends')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setViralTrends(data.trends)
        }
      })
      .catch(err => console.error('[Viral Trends] Load error:', err))
  }, [])

  const handleApplyViralTrend = (tags: string) => {
    setStylePrompt(tags)
  }

  // 1. Pro 구독 상태 감지
  useEffect(() => {
    if (!user) {
      setIsPro(false)
      return
    }
    supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()
      .then(({ data }: any) => {
        setIsPro(!!data?.stripe_customer_id)
      })
  }, [user])

  // 2. 로컬 스토리지에서 커스텀 프리셋 복원 및 누락된 ID 자동 치유
  useEffect(() => {
    const saved = localStorage.getItem('melodio_custom_presets')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          let updated = false
          const cleaned = parsed.map((p: any, idx: number) => {
            if (!p.id) {
              updated = true
              return { ...p, id: `custom_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 9)}` }
            }
            return p
          })
          setCustomPresets(cleaned)
          if (updated) {
            localStorage.setItem('melodio_custom_presets', JSON.stringify(cleaned))
          }
        }
      } catch (e) {
        console.error('Failed to load custom presets from localStorage:', e)
      }
    }
  }, [])

  // 2.5. DB에서 옵시디언 동기화 프리셋 복원
  useEffect(() => {
    async function loadDbPresets() {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data, error } = await supabase
          .from('curation_playbooks')
          .select('key_name,title,content,metadata,updated_at')
          .in('category', ['genre', 'curation'])
          .order('updated_at', { ascending: false })
        if (data) {
          const formatted = data.map((pb: any) => {
            let extractedDesc = '';
            if (pb.content) {
              const conceptMatch = pb.content.match(/## 💡 핵심 컨셉\s*([\s\S]*?)(?=\n##|$)/);
              if (conceptMatch && conceptMatch[1]) {
                extractedDesc = conceptMatch[1].trim();
              }
            }
            if (!extractedDesc) {
              extractedDesc = (pb.content || '')
                .split('\n')
                .find((l: string) => l.trim() && !l.startsWith('#') && !l.startsWith('---'))
                ?.trim() || pb.title;
            }
              
            return {
              id: pb.key_name,
              emoji: pb.metadata?.emoji || '🎵',
              name: pb.title,
              desc: pb.metadata?.description || extractedDesc,
              gradient: pb.metadata?.gradient || 'linear-gradient(135deg, #10b981, #059669)',
              selections: {},
              customPrompt: pb.metadata?.studio_grade_prompt || pb.metadata?.suno_tags || '',
              isDb: true,
              updated_at: pb.updated_at,
              metadata: pb.metadata
            }
          })
          setDbPresets(formatted)
        }
      } catch (err) {
        console.error('Error loading DB playbooks in PromptBuilder:', err)
      }
    }
    loadDbPresets()
  }, [])

  // 3. 커스텀 프리셋 저장 및 삭제 핸들러
  const handleSaveCustomPreset = (data: { id?: string; name: string; desc: string; emoji: string; gradient: string; customPrompt: string; metadata?: any }) => {
    if (data.id && customPresets.some(preset => preset.id === data.id)) {
      // 수정 모드
      const updated = customPresets.map(p => {
        if (p.id === data.id) {
          const hasPromptChanged = p.customPrompt !== data.customPrompt;
          const mergedMetadata = { ...(data.metadata || p.metadata || {}) };
          if (hasPromptChanged) {
            delete mergedMetadata.cached_optimized_prompt;
          }
          return {
            ...p,
            name: data.name,
            desc: data.desc,
            emoji: data.emoji,
            gradient: data.gradient,
            customPrompt: data.customPrompt,
            metadata: mergedMetadata,
          };
        }
        return p;
      })
      setCustomPresets(updated)
      localStorage.setItem('melodio_custom_presets', JSON.stringify(updated))
      setEditingPreset(null)
    } else {
      // 생성 모드
      const newPreset: Preset = {
        id: `custom-${Date.now()}`,
        emoji: data.emoji,
        name: data.name,
        desc: data.desc,
        gradient: data.gradient,
        customPrompt: data.customPrompt,
        selections: { ...selections },
        lyricsTemplate: isInstrumental ? '' : buildLyricsPrompt(lyricsSections),
        metadata: data.metadata,
      }

      const updated = [newPreset, ...customPresets]
      setCustomPresets(updated)
      localStorage.setItem('melodio_custom_presets', JSON.stringify(updated))
      setIsCreatePresetOpen(false)
      setEditingPreset(null)
    }
  }

  const handleDeleteCustomPreset = (id: string) => {
    if (!confirm('정말 이 커스텀 프리셋을 삭제하시겠습니까?')) return
    const updated = customPresets.filter(p => p.id !== id)
    setCustomPresets(updated)
    localStorage.setItem('melodio_custom_presets', JSON.stringify(updated))
  }

  // Remix 곡 정보 자동 로드
  useEffect(() => {
    if (!remixId) return

    const loadRemixTrack = async () => {
      try {
        const res = await fetch(`/api/generations?id=${remixId}`)
        if (!res.ok) throw new Error('Failed to fetch track details')
        
        const data = await res.json()
        const gen = data.generation
        if (!gen) return

        // license_hash 또는 duration_mode에서 메타데이터 파싱
        const metaSource = gen.license_hash || gen.duration_mode
        if (metaSource && metaSource !== 'clip' && metaSource !== 'full') {
          const meta = JSON.parse(metaSource)
          
          // 태그 selections 복구
          if (meta.selections) {
            setSelections(meta.selections)
          } else {
            // 구버전 곡 호상성용 기본값 매핑
            const initialSelections: TagSelections = {}
            if (meta.genre) initialSelections['genre'] = [meta.genre]
            if (meta.mood) initialSelections['mood'] = [meta.mood]
            setSelections(initialSelections)
          }

          // 가사 복구
          if (meta.lyricsSections && meta.lyricsSections.length > 0) {
            setLyricsSections(meta.lyricsSections)
          } else if (meta.lyricsPrompt) {
            const rawSections = meta.lyricsPrompt.split('\n\n')
            const parsed: LyricsSection[] = rawSections.map((raw: string, idx: number) => {
              const lines = raw.split('\n')
              const header = lines[0]?.replace(/[\[\]]/g, '').toLowerCase() ?? 'verse'
              const content = lines.slice(1).join('\n')
              return {
                id: `remix-parsed-${idx}`,
                type: ['intro', 'verse', 'chorus', 'bridge', 'outro'].includes(header)
                  ? (header as LyricsSection['type'])
                  : 'verse',
                content,
              }
            })
            setLyricsSections(parsed)
          }

          // 기본 설정 복구
          setIsInstrumental(!!meta.isInstrumental)
          if (meta.engine) setEngine(meta.engine === 'lyria3' ? 'auto' : meta.engine)
          if (meta.sunoVersion) setSunoVersion(currentSunoVersion(meta.sunoVersion))
          
          // 제목 복구
          if (gen.title) {
            setTitle(gen.title.replace(/\s*\(2\)$/, ''))
          }
        }
      } catch (err) {
        console.error('[PromptBuilder] Remix 로드 실패:', err)
      }
    }

    loadRemixTrack()
  }, [remixId])

  // 태그 토글 핸들러 — 단일 선택 카테고리 지원
  const handleToggle = (categoryId: string) => (value: string) => {
    console.log('[PromptBuilder] handleToggle called:', { categoryId, value })
    if (isSingleSelect(categoryId)) {
      setSelections((prev) => {
        const next = enforceSingleSelect(prev, categoryId, value)
        const composed = composeStylePrompt(next, isInstrumental)
        setStylePrompt(composed.prompt)
        return next
      })
    } else {
      setSelections((prev) => {
        const current = prev[categoryId] ?? []
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value]
        const updated = { ...prev, [categoryId]: next }
        const composed = composeStylePrompt(updated, isInstrumental)
        setStylePrompt(composed.prompt)
        return updated
      })
    }
  }

  // 프리셋 적용
  const handlePresetApply = async (preset: Preset) => {
    isApplyingPresetRef.current = true
    preset = findStudioPreset(preset.id, customPresets, publicPresetCatalog) || preset
    
    const composedFallback = preset.selections && Object.keys(preset.selections).length > 0
      ? composeStylePrompt(preset.selections, isInstrumental).prompt : ''
    const application = resolvePresetApplication(preset, composedFallback)

    appliedPresetPromptRef.current = application.stylePrompt
    setSelections(preset.selections || {})
    setStylePrompt(application.stylePrompt)
    setExcludePrompt(application.excludePrompt)
    setSelectedPresetId(preset.id || '')
    setSelectedPresetName(preset.name || '')
    
    const dyn = preset.metadata?.dynamic_elements || null
    setDynamicElements(dyn)
    // Always default ambient volume to 20% as recommended
    setAmbienceVolume(20)

    const foley = preset.metadata?.ambient_foley || null
    setIsAsmrEnabled(!!foley)

    setTitle("") // Clear for AI Auto-title placeholder
    setYoutubeTags('')
    setSnsHashtags('')

    setIsInstrumental(application.isInstrumental)
    setLyricsSections(application.isInstrumental ? [] : parsePresetLyrics(application.lyricsTemplate))

    // 프리셋 카드 선택 시 Style Prompt 영역으로 자동 스크롤 및 포커스
    setTimeout(() => {
      const element = document.getElementById('style-prompt-section')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const textarea = element.querySelector('textarea')
        if (textarea) {
          textarea.focus()
        }
      }
    }, 100)
  }

  // Drawer 모드 시 외부에서 주입된 initialPreset 자동 반영
  useEffect(() => {
    if (isDrawerMode && initialPreset) {
      console.log('[PromptBuilder] Applying initial preset in drawer mode:', initialPreset.id)
      handlePresetApply(initialPreset)
    }
  }, [initialPreset, isDrawerMode])

  // URL의 ?preset=PRESET_ID 쿼리 파라미터를 감지하여 자동 적용
  useEffect(() => {
    const presetId = searchParams.get('preset')
    if (!presetId) return

    let targetPreset = findStudioPreset(presetId, customPresets, publicPresetCatalog)

    // 만약 로컬/DB 프리셋 목록에 존재하지 않더라도, 쿼리에 style과 name이 있다면 임시 가상 프리셋으로 자동 복원!
    if (!targetPreset) {
      const styleFromUrl = searchParams.get('style')
      const nameFromUrl = searchParams.get('name') || 'Custom Style'
      const lyricsFromUrl = searchParams.get('lyrics') || ''
      const excludeFromUrl = searchParams.get('exclude') || ''
      if (styleFromUrl) {
        targetPreset = {
          id: presetId,
          emoji: '🪄',
          name: nameFromUrl,
          desc: '이동 경로를 통해 실시간 복원된 커스텀 프리셋입니다.',
          gradient: 'linear-gradient(135deg, #a855f7, #ec4899)',
          customPrompt: styleFromUrl,
          selections: {},
          excludePrompt: excludeFromUrl,
          lyricsTemplate: lyricsFromUrl || undefined,
        }
      }
    }

    if (targetPreset) {
      console.log('[PromptBuilder] Applying preset from URL:', presetId)
      handlePresetApply(targetPreset)
      
      // URL 클리어처리
      const url = new URL(window.location.href)
      url.searchParams.delete('preset')
      url.searchParams.delete('style')
      url.searchParams.delete('name')
      url.searchParams.delete('lyrics')
      url.searchParams.delete('exclude')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [searchParams, customPresets, dbPresets])

  // URL의 ?style=...&exclude=... 파라미터를 감지하여 자동 적용 (시드 블렌더)
  useEffect(() => {
    const styleFromUrl = searchParams.get('style')
    const excludeFromUrl = searchParams.get('exclude')
    
    if (styleFromUrl) {
      console.log('[PromptBuilder] Applying custom style prompt from URL:', styleFromUrl)
      appliedPresetPromptRef.current = styleFromUrl
      isApplyingPresetRef.current = true
      setStylePrompt(styleFromUrl)
      
      if (excludeFromUrl) {
        setExcludePrompt(excludeFromUrl)
      }
      
      // URL 클리어처리
      const url = new URL(window.location.href)
      url.searchParams.delete('style')
      url.searchParams.delete('exclude')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [searchParams])

  // 전체 초기화
  const handleReset = () => {
    setSelections({})
    setLyricsSections([])
    setIsInstrumental(false)
    setEngine('auto')
    setSunoVersion('v6')
    setTrackCount(2)
    setTitle('')
    setYoutubeTags('')
    setSnsHashtags('')
    setPlaylistTitle('')
    setPlaylistDescription('')
    setPlaylistYoutubeTags('')
    setPlaylistSnsHashtags('')
    setTracks([])
    setActiveTrackIdx(0)
    setStylePrompt('')
    setExcludePrompt('')
    setIsPublic(true)
  }

  // 스마트 프롬프트 결합 엔진 사용 (글자수 및 메타데이터 계산용)
  const compositorResult = useMemo(
    () => composeStylePrompt(selections, isInstrumental),
    [selections, isInstrumental],
  )

  // 프롬프트 페이로드 계산 (실시간)
  const payload: PromptPayload | null = useMemo(() => {
    if (!stylePrompt) return null

    const resolvedEngine = engine === 'auto' ? autoSelectEngine(selections, isInstrumental) : engine

    if (isPlaylistMode) {
      const activeTrack = tracks[activeTrackIdx]
      if (!activeTrack) return null

      return {
        title: activeTrack.title,
        stylePrompt: stylePrompt,
        lyricsPrompt: isInstrumental ? '' : buildLyricsPrompt(activeTrack.sections),
        engine: resolvedEngine,
        isInstrumental,
        sunoVersion,
        tags: {
          youtubeTags: activeTrack.youtubeTags,
          snsHashtags: activeTrack.snsHashtags,
        },
        metadata: {
          primaryGenre: selections['genre']?.[0] ?? '',
          subGenre: selections['genre']?.[1] ?? '',
          bpm: selections['tempo']?.[0] ?? '',
          mood: selections['mood']?.[0] ?? '',
        },
      }
    }

    const lyricsPrompt = isInstrumental ? '' : buildLyricsPrompt(lyricsSections)

    return {
      title,
      stylePrompt: stylePrompt,
      lyricsPrompt,
      excludePrompt: excludePrompt.trim() || undefined,
      engine: resolvedEngine,
      isInstrumental,
      sunoVersion,
      tags: {
        youtubeTags,
        snsHashtags,
      },
      metadata: {
        primaryGenre: selections['genre']?.[0] ?? '',
        subGenre: selections['genre']?.[1] ?? '',
        bpm: selections['tempo']?.[0] ?? '',
        mood: selections['mood']?.[0] ?? '',
      },
    }
  }, [stylePrompt, selections, lyricsSections, isInstrumental, engine, sunoVersion, title, youtubeTags, snsHashtags, isPlaylistMode, tracks, activeTrackIdx])



  // 엔진 변경 및 트랙 수 동기화
  const handleEngineChange = (newEngine: MusicEngine) => {
    if (newEngine === 'lyria3') return
    setEngine(newEngine)
    if (newEngine === 'suno_v5') {
      if (trackCount === 1) {
        setTrackCount(2)
        setIsPlaylistMode(false)
      }
    }
  }

  // 트랙 수 변경 핸들러
  const handleTrackCountChange = (count: number) => {
    setTrackCount(count)
    if (count === 1 || count === 2) {
      setIsPlaylistMode(false)
    } else {
      setIsPlaylistMode(true)
    }
  }

  // 음악 생성 + 로그인 시 히스토리 자동 저장
  const handleGenerate = async () => {
    setIsGenerating(true)
    setGenModalState('submitting')
    try {
      const artistError = artistState.getError(artistSettings)
      if (artistError) throw new Error(artistError)
      const resolvedEngine = engine === 'auto' ? autoSelectEngine(selections, isInstrumental) : engine

      // 1000자 병합 및 젠더 정합성 클렌징 헬퍼 함수
      const mergeAndClampStyle = (common: string, desc?: string): string => {
        if (!desc || !desc.trim()) return common;
        const baseStyle = common.trim().replace(/[.,;]$/, '');
        const trackDesc = desc.trim();

        // 성별 충돌 감지
        const hasMaleInTrack = /\bmale\b|\bman\b|\bmen\b|\bgentleman\b/i.test(trackDesc);
        const hasFemaleInTrack = /\bfemale\b|\bwoman\b|\bwomen\b|\blady\b|\bgirl\b/i.test(trackDesc);
        const hasDuetInTrack = /\bduet\b|\bduo\b|\bmixed vocal\b|\bmale and female\b/i.test(trackDesc);

        let sanitizedBase = baseStyle;

        if (hasMaleInTrack && !hasDuetInTrack) {
          // 트랙 설명이 남성 보컬인 경우 -> baseStyle의 여성 키워드를 남성으로 오버라이드
          sanitizedBase = sanitizedBase
            .replace(/\b(female|woman|women|lady|girl)\s+vocals?\b/gi, 'male vocal')
            .replace(/\b(female|woman|women|lady|girl)\s+singers?\b/gi, 'male singer')
            .replace(/\b(female|woman|women|lady|girl)\s+voice\b/gi, 'male voice')
            .replace(/\b(female|woman|women|lady|girl)\b/gi, 'male');
        } else if (hasFemaleInTrack && !hasDuetInTrack) {
          // 트랙 설명이 여성 보컬인 경우 -> baseStyle의 남성 키워드를 여성으로 오버라이드
          sanitizedBase = sanitizedBase
            .replace(/\b(male|man|men|boy)\s+vocals?\b/gi, 'female vocal')
            .replace(/\b(male|man|men|boy)\s+singers?\b/gi, 'female singer')
            .replace(/\b(male|man|men|boy)\s+voice\b/gi, 'female voice')
            .replace(/\b(male|man|men|boy|gentleman)\b/gi, 'female');
        } else if (hasDuetInTrack) {
          // 트랙 설명이 듀엣 보컬인 경우 -> baseStyle의 단일 성별 보컬을 듀엣으로 오버라이드
          sanitizedBase = sanitizedBase
            .replace(/\b(female|male|woman|man|women|men|lady|girl|boy)\s+vocals?\b/gi, 'duet vocal')
            .replace(/\b(female|male|woman|man|women|men|lady|girl|boy)\s+singers?\b/gi, 'duet singers')
            .replace(/\b(female|male|woman|man|women|men|lady|girl|boy)\s+voice\b/gi, 'duet voice');
        }

        const joined = `${sanitizedBase.trim()}, ${trackDesc}`;
        return joined.length <= 1000 ? joined : joined.slice(0, 1000);
      }

      if (isPlaylistMode) {
        if (tracks.length === 0) {
          alert('먼저 플레이리스트 가사를 작성해주세요!')
          setGenModalState('idle')
          setIsGenerating(false)
          return
        }

        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i]
          const lyricsPrompt = isInstrumental ? '' : buildLyricsPrompt(track.sections)

          // 트랙의 개별 description 추출 (Chorus -> Verse -> 기타 순)
          const targetSection = track.sections.find((s: any) => s.type === 'chorus' && s.description?.trim())
            || track.sections.find((s: any) => s.type === 'verse' && s.description?.trim())
            || track.sections.find((s: any) => s.description?.trim());
          const trackDescription = targetSection?.description?.trim() || '';

          let finalStylePrompt = isInstrumental
            ? resolveRotationPrompt(stylePrompt)
            : mergeAndClampStyle(resolveRotationPrompt(stylePrompt), trackDescription);

          // ASMR Foley 연동 기입
          const asmrPreset = selectedStudioPreset;
          const ambientFoley = asmrPreset?.metadata?.ambient_foley;
          if (isAsmrEnabled && ambientFoley) {
            if (!finalStylePrompt.includes(ambientFoley)) {
              finalStylePrompt = `${finalStylePrompt.trim()} ${ambientFoley}`.trim();
            }
          }

          // 환경음 동적 합성
          if (dynamicElements?.audio_system?.ambience_layer && ambienceVolume > 0) {
            const ambiencePrompt = dynamicElements.audio_system.ambience_layer.base_prompt;
            if (ambienceVolume <= 15) {
              finalStylePrompt += `, subtle background ${ambiencePrompt}`;
            } else if (ambienceVolume <= 45) {
              finalStylePrompt += `, gentle background ${ambiencePrompt}`;
            } else if (ambienceVolume <= 75) {
              finalStylePrompt += `, prominent ${ambiencePrompt} background`;
            } else {
              finalStylePrompt += `, loud intensive ${ambiencePrompt} ASMR background`;
            }
          }

          if (finalStylePrompt.length > 1000) {
            finalStylePrompt = finalStylePrompt.slice(0, 1000);
          }

          const trackPayload: PromptPayload = {
            title: track.title,
            stylePrompt: finalStylePrompt,
            lyricsPrompt,
            engine: resolvedEngine,
            isInstrumental,
            sunoVersion,
            tags: {
              youtubeTags: track.youtubeTags,
              snsHashtags: track.snsHashtags,
            },
            metadata: {
              primaryGenre: selections['genre']?.[0] ?? '',
              subGenre: selections['genre']?.[1] ?? '',
              bpm: selections['tempo']?.[0] ?? '',
              mood: selections['mood']?.[0] ?? '',
              ambienceVolume: ambienceVolume / 100,
              dynamicElements: dynamicElements,
            },
          }

          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...trackPayload,
              selections,
              lyricsSections: track.sections,
              presetId: selectedPresetId,
              presetName: selectedPresetName,
              sourceMenu: sourceMenu || searchParams.get('sourceMenu') || 'audio-forge',
              ...studioVoiceFields,
              ...artistState.requestFields,
              isPublic: isPublic,
            }),
          })

          if (!res.ok) {
            const result = await res.json().catch(() => null)
            throw new Error(result?.error || `${i + 1}번 음원 생성에 실패했습니다.`)
          }

          if (user) {
            await saveHistory(trackPayload, selections)
          }
        }
        setGenModalState('success')
      } else {
        // 템플릿 기본값 대조용 프리셋 탐색
        let currentPreset = selectedStudioPreset
        if (!currentPreset && editingPreset && editingPreset.id === selectedPresetId) {
          currentPreset = editingPreset
        }

        const defaultLyricsText = currentPreset?.lyricsTemplate || ''
        const currentLyricsText = isInstrumental ? '' : buildLyricsPrompt(lyricsSections)
        const defaultStylePrompt = currentPreset
          ? (currentPreset.customPrompt || composeStylePrompt(currentPreset.selections || {}, isInstrumental).prompt)
          : ''

        // 기본값 판정 (연주곡이 아닌 경우 가사가 비었거나 프리셋 디폴트와 같을 때, 혹은 스타일이 디폴트와 같을 때)
        const isPresetDefault = (!isInstrumental && (!currentLyricsText.trim() || currentLyricsText === defaultLyricsText)) ||
          (currentPreset && stylePrompt === defaultStylePrompt)

        let finalTitle = title
        let finalStyle = stylePrompt
        let finalSections = lyricsSections
        let finalYoutubeTags = youtubeTags
        let finalSnsHashtags = snsHashtags

        if (isPresetDefault && !isInstrumental) {
          const topic = currentPreset?.desc || currentPreset?.name || '자유로운 감성곡';

          const lyricRes = await fetch('/api/lyrics/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stylePrompt: finalStyle,
              topic,
              language: lyricsLanguage,
              vocalGender: studioVoiceFields.vocalGender,
              presetId: selectedPresetId,
            })
          })
          const lyricData = await lyricRes.json()
          if (!lyricRes.ok || !lyricData.success) {
            throw new Error(lyricData.error || '가사 생성을 완료하지 못했습니다. 다시 시도해 주세요.')
          }
          if (!isInstrumental && (!Array.isArray(lyricData.sections) || !lyricData.sections.some((section: LyricsSection) => section.content?.trim()))) {
            throw new Error('생성된 가사를 확인하지 못했습니다. 다시 시도해 주세요.')
          }
          if (lyricData.success) {
            if (lyricData.title) {
              finalTitle = lyricData.title
              setTitle(finalTitle)
            }
            finalStyle = resolveGeneratedPresetStyle(finalStyle, lyricData.stylePrompt, Boolean(currentPreset))
            setStylePrompt(finalStyle)
            if (lyricData.youtubeTags) {
              finalYoutubeTags = lyricData.youtubeTags
              setYoutubeTags(finalYoutubeTags)
            }
            if (lyricData.snsHashtags) {
              finalSnsHashtags = lyricData.snsHashtags
              setSnsHashtags(finalSnsHashtags)
            }
            if (!isInstrumental && lyricData.sections) {
              finalSections = lyricData.sections
              setLyricsSections(finalSections)
            }
          }
        }

        // 단일 곡 description 추출
        const targetSection = finalSections.find((s: any) => s.type === 'chorus' && s.description?.trim())
          || finalSections.find((s: any) => s.type === 'verse' && s.description?.trim())
          || finalSections.find((s: any) => s.description?.trim());
        const trackDescription = targetSection?.description?.trim() || '';

        const finalSingleStylePrompt = isInstrumental
          ? resolveRotationPrompt(finalStyle)
          : mergeAndClampStyle(resolveRotationPrompt(finalStyle), trackDescription);

        // ASMR Foley 연동 기입
        let finalSingleStyleWithAsmr = finalSingleStylePrompt;
        const asmrPreset = selectedStudioPreset;
        const ambientFoley = asmrPreset?.metadata?.ambient_foley;
        if (isAsmrEnabled && ambientFoley) {
          if (!finalSingleStyleWithAsmr.includes(ambientFoley)) {
            finalSingleStyleWithAsmr = `${finalSingleStyleWithAsmr.trim()} ${ambientFoley}`.trim();
          }
        }

        const resolvedPayload: PromptPayload = {
          title: finalTitle,
          stylePrompt: finalSingleStyleWithAsmr,
          lyricsPrompt: isInstrumental ? '' : buildLyricsPrompt(finalSections),
          excludePrompt: excludePrompt.trim() || undefined,
          engine: resolvedEngine,
          isInstrumental,
          sunoVersion,
          tags: {
            youtubeTags: finalYoutubeTags,
            snsHashtags: finalSnsHashtags,
          },
          metadata: {
            primaryGenre: selections['genre']?.[0] ?? '',
            subGenre: selections['genre']?.[1] ?? '',
            bpm: selections['tempo']?.[0] ?? '',
            mood: selections['mood']?.[0] ?? '',
          },
        }

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...resolvedPayload,
            selections,
            lyricsSections: finalSections,
            presetId: selectedPresetId,
            presetName: selectedPresetName,
            sourceMenu: sourceMenu || searchParams.get('sourceMenu') || 'audio-forge',
            ...studioVoiceFields,
            ...artistState.requestFields,
            isPublic: isPublic,
          }),
        })
        if (!res.ok) {
          const result = await res.json().catch(() => null)
          throw new Error(result?.error || '음원 생성에 실패했습니다.')
        }
        if (user) {
          await saveHistory(resolvedPayload, selections)
        }
        setGenModalState('success')
      }
    } catch (error) {
      console.error(error)
      setGenErrorMsg(error instanceof Error ? error.message : '오류가 발생했습니다.')
      setGenModalState('error')
    } finally {
      setIsGenerating(false)
    }
  }

  const totalSelected = Object.values(selections).flat().length

  if (isDrawerMode) {
    return (
      <div className="w-full flex flex-col gap-4 pb-10">
        <StudioArtistPicker state={artistState} />
        <PromptOutput
          payload={payload}
          stylePrompt={stylePrompt}
          onStylePromptChange={setStylePrompt}
          isAsmrEnabled={isAsmrEnabled}
          onAsmrToggle={setIsAsmrEnabled}
          ambientFoley={
            selectedStudioPreset?.metadata?.ambient_foley ||
            ''
          }
          excludePrompt={excludePrompt}
          onExcludePromptChange={setExcludePrompt}
          isPublic={isPublic}
          onPublicToggle={setIsPublic}
          compositorResult={compositorResult}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
          isPlaylistMode={isPlaylistMode}
          trackCount={trackCount}
          dynamicElements={dynamicElements}
          ambienceVolume={ambienceVolume}
          onAmbienceVolumeChange={setAmbienceVolume}
          isPro={isPro}
          onOpenProPaywall={onOpenProPaywall || (() => setIsProPaywallOpen(true))}
          presetId={selectedPresetId}
          customPresets={customPresets}
          onCustomPresetsChange={setCustomPresets}
          sourceMenu={sourceMenu}
          isInstrumental={isInstrumental}
          onInstrumentalToggle={setIsInstrumental}
          lyricsBuilderNode={
            <LyricsBuilder
              artistVoice={artistState.artistVoice}
              artistSelectionError={artistState.getError(artistSettings)}
              isInstrumental={isInstrumental}
              stylePrompt={stylePrompt}
              onInstrumentalToggle={setIsInstrumental}
              isPlaylistMode={isPlaylistMode}
              onPlaylistModeToggle={setIsPlaylistMode}
              trackCount={trackCount}
              onTrackCountChange={handleTrackCountChange}
              engine={engine}
              title={title}
              onTitleChange={setTitle}
              youtubeTags={youtubeTags}
              snsHashtags={snsHashtags}
              onTagsChange={(yt, sns) => {
                setYoutubeTags(yt)
                setSnsHashtags(sns)
              }}
              sections={lyricsSections}
              lyricLanguage={lyricsLanguage}
              onLyricLanguageChange={setLyricsLanguage}
              onSectionsChange={setLyricsSections}
              playlistTitle={playlistTitle}
              onPlaylistTitleChange={setPlaylistTitle}
              playlistDescription={playlistDescription}
              onPlaylistDescriptionChange={setPlaylistDescription}
              playlistYoutubeTags={playlistYoutubeTags}
              playlistSnsHashtags={playlistSnsHashtags}
              onPlaylistTagsChange={(yt, sns) => {
                setPlaylistYoutubeTags(yt)
                setPlaylistSnsHashtags(sns)
              }}
              tracks={tracks}
              onTracksChange={setTracks}
              activeTrackIdx={activeTrackIdx}
              onActiveTrackIdxChange={setActiveTrackIdx}
              presetId={selectedPresetId}
              selectedVdCode={selectedVdCode}
              onSelectedVdCodeChange={setSelectedVdCode}
              vdOptions={vdOptions}
            />
          }
        />

        {/* ─── AI 음원 생성 진행 및 결과 모달 ─── */}
        {genModalState !== 'idle' && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-md">
            <div className="bg-zinc-950 border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] max-w-md w-full mx-4 p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
              
              {/* 1. 제출 중 상태 */}
              {genModalState === 'submitting' && (
                <div className="space-y-6">
                  <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full border-4 border-fuchsia-500/20 animate-pulse"></div>
                    <div className="absolute inset-0 rounded-full border-t-4 border-fuchsia-500 animate-spin"></div>
                    <Wand2 className="w-8 h-8 text-fuchsia-400 shrink-0 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-white text-lg font-bold">AI 작곡가 엔진 가동 중</h3>
                    <p className="text-zinc-400 text-sm">
                      스타일 프롬프트와 가사를 분석하여 AI 작곡 엔진에 음원을 의뢰하고 있습니다.
                    </p>
                  </div>
                </div>
              )}

              {/* 2. 요청 성공 상태 */}
              {genModalState === 'success' && (
                <div className="space-y-6">
                  <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full mx-auto flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                    <Sparkles className="w-8 h-8 text-emerald-400 shrink-0" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-white text-lg font-bold">음원 작곡 요청 완료!</h3>
                    <p className="text-zinc-300 text-sm">
                      {isPlaylistMode ? `${tracks.length}곡` : '2곡'}의 신곡 작곡이 시작되었습니다!
                    </p>
                    <p className="text-zinc-500 text-xs leading-relaxed">
                      AI가 백그라운드에서 편곡 및 믹싱을 진행 중이며 약 1~2분이 소요됩니다. 완성되면 대시보드의 <strong>Track Library</strong>에 실시간으로 등록됩니다.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    <button
                      onClick={() => {
                        setGenModalState('idle')
                        router.push('/dashboard')
                      }}
                      className="w-full py-3 bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white font-semibold rounded-xl hover:shadow-[0_0_20px_rgba(192,38,211,0.4)] transition-all text-sm"
                    >
                      대시보드(Track Library)로 이동
                    </button>
                    <button
                      onClick={() => setGenModalState('idle')}
                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white rounded-xl transition-all text-xs font-semibold"
                    >
                      여기 남아서 더 만들기
                    </button>
                  </div>
                </div>
              )}

              {/* 3. 에러 발생 상태 */}
              {genModalState === 'error' && (
                <div className="space-y-6">
                  <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full mx-auto flex items-center justify-center">
                    <span className="text-2xl text-red-400">⚠️</span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-white text-lg font-bold">작곡 요청 실패</h3>
                    <p className="text-red-400 text-sm font-mono truncate">{genErrorMsg}</p>
                  </div>
                  <button
                    onClick={() => setGenModalState('idle')}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white rounded-xl transition-all text-sm font-semibold"
                  >
                    다시 시도하기
                  </button>
                </div>
              )}

            </div>
          </div>
        )}

        {/* 커스텀 프리셋 생성 및 결제 페이월 모달 */}
        <CreatePresetModal
          isOpen={isCreatePresetOpen || !!editingPreset}
          onClose={() => {
            setIsCreatePresetOpen(false)
            setEditingPreset(null)
          }}
          onSave={handleSaveCustomPreset}
          currentStylePrompt={stylePrompt}
          editingPreset={editingPreset}
        />
        <ProPaywallModal
          isOpen={isProPaywallOpen}
          onClose={() => setIsProPaywallOpen(false)}
          feature="presets"
        />
      </div>
    )
  }

  return (
    <>
    <div className="max-w-6xl mx-auto pt-4 pb-6">
      {/* 헤더 */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold mb-2">
          <span className="bg-gradient-melodio bg-clip-text text-transparent">Melodio</span>
        </h1>
        <p className="text-melodio-muted">AI 음악 생성 → 영상 합성 → YouTube 자동 업로드</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2 text-sm relative">
          <span className="text-melodio-muted">엔진:</span>
          <button
            onClick={() => handleEngineChange('auto')}
            className={`px-3 py-1.5 rounded-lg border text-xs transition-all ${
              engine === 'auto'
                ? 'border-melodio-accent bg-melodio-accent/20 text-melodio-accent-light'
                : 'border-melodio-border text-melodio-muted hover:border-melodio-accent/50'
            }`}
          >
            🔄 Auto
          </button>
          <button
            type="button"
            disabled
            title="Lyria 3는 현재 사용할 수 없습니다. Suno를 선택해 주세요."
            className="px-3 py-1.5 rounded-lg border border-melodio-border text-melodio-muted/50 text-xs cursor-not-allowed"
          >
            Lyria 3 · 현재 이용 불가
          </button>

          {/* Suno Button & Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                if (engine !== 'suno_v5') {
                  handleEngineChange('suno_v5')
                  setIsSunoDropdownOpen(true)
                } else {
                  setIsSunoDropdownOpen(!isSunoDropdownOpen)
                }
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                engine === 'suno_v5'
                  ? 'border-melodio-accent bg-melodio-accent/20 text-melodio-accent-light'
                  : 'border-melodio-border text-melodio-muted hover:border-melodio-accent/50'
              }`}
            >
              <span>🟡 Suno {sunoVersion}</span>
              <span className="text-[9px] opacity-70">▼</span>
            </button>

            {isSunoDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsSunoDropdownOpen(false)}
                />
                <div className="absolute left-0 mt-1 w-28 bg-[#1a1515] border border-melodio-border rounded-lg shadow-xl z-50 py-1 text-xs">
                  {SUNO_VERSIONS.map((v) => (
                    <button
                      key={v}
                      onClick={() => {
                        setSunoVersion(v)
                        setIsSunoDropdownOpen(false)
                        handleEngineChange('suno_v5')
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-melodio-accent/15 hover:text-melodio-accent-light flex items-center justify-between text-melodio-text"
                    >
                      <span>{v}</span>
                      {sunoVersion === v && <span className="text-melodio-accent">✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>
        <div className="ml-auto flex items-center gap-2">
          {totalSelected > 0 && (
            <button
              onClick={handleReset}
              className="text-xs text-melodio-muted hover:text-red-400 transition-colors"
            >
              🗑️ 초기화
            </button>
          )}
        </div>
      </div>

      {/* 프리셋 */}
      <div className="mb-6">
        <PresetGrid 
          onApply={handlePresetApply} 
          isPro={isPro}
          onOpenCreatePreset={() => setIsCreatePresetOpen(true)}
          onOpenProPaywall={() => setIsProPaywallOpen(true)}
          customPresets={customPresets}
          dbPresets={dbPresets}
          onDeletePreset={handleDeleteCustomPreset}
          onEditPreset={setEditingPreset}
          selectedPresetId={selectedPresetId}
        />
      </div>

      {/* 🔮 이미지 감성 분석 프리셋 배너 (좌측 1장 대형 6-슬라이드 노출 & 우측 하단 독립 CTA 버튼) */}
      <div 
        onClick={() => isPro ? setIsCreatePresetOpen(true) : setIsProPaywallOpen(true)}
        className="mb-6 flex flex-col sm:flex-row overflow-hidden rounded-2xl border border-white/10 hover:border-fuchsia-500/40 bg-zinc-950/90 hover:bg-zinc-900/90 transition-all cursor-pointer relative group sm:h-[205px] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      >
        {/* 좌측 싱글 대형 이미지 슬라이더 영역 (50% 공간) */}
        <div className="w-full sm:w-[50%] h-[160px] sm:h-full bg-zinc-950 relative overflow-hidden shrink-0 group/slide border-b sm:border-b-0 sm:border-r border-white/5">
          <AnimatePresence mode="wait">
            <motion.img
              key={bannerSlideIdx}
              src={BANNER_SLIDES[bannerSlideIdx]}
              alt={`Slide ${bannerSlideIdx + 1}`}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full h-full object-cover"
            />
          </AnimatePresence>

          {/* 좌 측 '<' 이동 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setBannerSlideIdx((prev) => (prev - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length)
            }}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 hover:bg-white border border-white/80 text-zinc-800 hover:text-fuchsia-600 flex items-center justify-center shadow-lg backdrop-blur-sm transition-all z-20 opacity-90 hover:opacity-100 hover:scale-110 active:scale-95"
            title="이전 이미지"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* 우 측 '>' 이동 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setBannerSlideIdx((prev) => (prev + 1) % BANNER_SLIDES.length)
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 hover:bg-white border border-white/80 text-zinc-800 hover:text-fuchsia-600 flex items-center justify-center shadow-lg backdrop-blur-sm transition-all z-20 opacity-90 hover:opacity-100 hover:scale-110 active:scale-95"
            title="다음 이미지"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* 하단 6개 슬라이드 도트 인디케이터 */}
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20 px-2.5 py-1 rounded-full bg-white/75 backdrop-blur-sm border border-white/80 shadow-md">
            {BANNER_SLIDES.map((_, idx) => (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation()
                  setBannerSlideIdx(idx)
                }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === bannerSlideIdx
                    ? 'w-5 bg-gradient-to-r from-fuchsia-400 to-cyan-400 shadow-[0_0_8px_rgba(217,70,239,0.8)]'
                    : 'w-1.5 bg-zinc-600/50 hover:bg-zinc-700'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 우측 설명 및 하단 독립 버튼 영역 (50% 공간) */}
        <div className="w-full sm:w-[50%] h-full p-4 sm:p-5 flex flex-col justify-between z-10 bg-gradient-to-b sm:bg-gradient-to-r from-zinc-950 via-zinc-950 to-zinc-900/90 min-w-0">
          {/* 상단: 타이틀 + 뱃지 + 설명 */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-base sm:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 via-purple-300 to-cyan-400 uppercase tracking-wider font-mono">
                🔮 이미지 감성 분석 프리셋 만들기
              </span>
              <span className="bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 text-[10px] px-2 py-0.5 rounded-full font-mono font-extrabold shadow-[0_0_10px_rgba(217,70,239,0.3)]">
                PRO
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-medium">
              원하는 분위기의 이미지나 그림을 AI가 감성 분석하여, 나만의 맞춤형 제목, 설명, 스타일 프롬프트 프리셋으로 변환해 줍니다. (총 6종 감성 갤러리 지원)
            </p>
          </div>

          {/* 하단 독립 행: 우측 하단 버튼 배치 */}
          <div className="flex justify-end items-center pt-3 sm:pt-2">
            <button className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400 text-white text-xs sm:text-sm font-black rounded-xl transition-all shadow-[0_0_20px_rgba(192,38,211,0.4)] group-hover:shadow-[0_0_25px_rgba(192,38,211,0.6)] group-hover:scale-105 active:scale-100 flex items-center justify-center gap-1.5 whitespace-nowrap">
              지금 분석하기
            </button>
          </div>
        </div>
      </div>

      {/* ⚡ 실시간 글로벌 음원 바이럴 트렌드 */}
      {viralTrends && (
        <div className="mb-6 p-4 rounded-xl bg-black/40 border border-fuchsia-500/10 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                <span>⚡</span> 실시간 바이럴 트렌드 핫 태그
              </span>
              <span className="text-xs text-zinc-400 hidden sm:inline">
                • 클릭 시 스타일 프롬프트에 자동 적용
              </span>
            </div>
            <span className="text-[9px] text-zinc-500 font-mono bg-zinc-800/50 px-2 py-0.5 rounded-full">
              LIVE STREAMING
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* Spotify Trends */}
            {viralTrends.spotify.map((t) => (
              <button
                key={t.id}
                onClick={() => handleApplyViralTrend(t.tags)}
                className="group relative p-3 rounded-xl text-left bg-emerald-950/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/15 hover:border-emerald-500/40 hover:text-white transition-all flex flex-col gap-1 duration-300 hover:shadow-[0_0_15px_rgba(16,185,129,0.1)] cursor-pointer"
                title={t.description}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-extrabold text-[10px] uppercase text-emerald-400/90 tracking-wider">Spotify Trend</span>
                  <span className="text-xs grayscale group-hover:grayscale-0 transition-all">{t.emoji}</span>
                </div>
                <div className="font-medium text-zinc-400 text-sm mt-1 leading-tight truncate w-full">{t.name}</div>
                <div className="text-[10px] text-zinc-500 truncate w-full mt-0.5">{t.genre}</div>
              </button>
            ))}

            {/* TikTok Trends */}
            {viralTrends.tiktok.map((t) => (
              <button
                key={t.id}
                onClick={() => handleApplyViralTrend(t.tags)}
                className="group relative p-3 rounded-xl text-left bg-cyan-950/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/15 hover:border-cyan-500/40 hover:text-white transition-all flex flex-col gap-1 duration-300 hover:shadow-[0_0_15px_rgba(6,182,212,0.1)] cursor-pointer"
                title={t.description}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-extrabold text-[10px] uppercase text-cyan-400/90 tracking-wider">TikTok Sound</span>
                  <span className="text-xs grayscale group-hover:grayscale-0 transition-all">{t.emoji}</span>
                </div>
                <div className="font-medium text-zinc-400 text-sm mt-1 leading-tight truncate w-full">{t.name}</div>
                <div className="text-[10px] text-zinc-500 truncate w-full mt-0.5">{t.genre}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 메인 2컬럼 레이아웃 (데스크톱 뷰포트 맞춤 독립 이중 스크롤 레이아웃 - 7:5 분할) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:h-[calc(100vh-190px)] lg:min-h-[500px] lg:overflow-hidden pb-4">
        {/* 왼쪽: 카테고리 입력 (독립 스크롤 영역) */}
        <div className="lg:col-span-7 lg:h-full lg:overflow-y-auto lg:pr-4 flex flex-col gap-6 scrollbar-thin">
          
          {/* 🎯 필수 입력 항목 */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2 pl-1">
              <span className="w-1.5 h-3.5 bg-melodio-accent rounded-full shadow-melodio-glow"></span>
              🎯 필수 입력 항목
            </h2>
            
            {/* 1. 2단계 장르 */}
            <GenreSelector
              selected={selections['genre'] ?? []}
              onToggle={handleToggle('genre')}
            />

            {/* 2. 필수 나머지 카테고리 (분위기, 보컬, 악기, BPM/템포, 믹스 스타일) */}
            {categories
              .filter((cat) => ['mood', 'vocal', 'instruments', 'tempo', 'production'].includes(cat.id))
              .map((cat) => (
                <div key={cat.id} className="space-y-3">
                  <CategorySection
                    category={cat}
                    selected={selections[cat.id] ?? []}
                    onToggle={handleToggle(cat.id)}
                    singleSelect={isSingleSelect(cat.id)}
                  />

                </div>
              ))}
          </div>

          {/* ⚙️ 세부 설정 항목 (선택) */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2 pl-1">
              <span className="w-1.5 h-3.5 bg-zinc-600 rounded-full"></span>
              ⚙️ 세부 설정 항목 (선택)
            </h2>

            {categories
              .filter((cat) => !['mood', 'vocal', 'instruments', 'tempo', 'production'].includes(cat.id))
              .map((cat) => (
                <CategorySection
                  key={cat.id}
                  category={cat}
                  selected={selections[cat.id] ?? []}
                  onToggle={handleToggle(cat.id)}
                  singleSelect={isSingleSelect(cat.id)}
                />
              ))}
          </div>

        </div>

        {/* 오른쪽: 프롬프트 출력 & 가사 빌더 & 완성 (독립 스크롤 영역 - 7:5 분할 및 간격 최적화) */}
        <div className="lg:col-span-5 lg:h-full lg:overflow-y-auto lg:pl-2 scrollbar-thin">
          <StudioArtistPicker state={artistState} />
          <PromptOutput
            payload={payload}
            stylePrompt={stylePrompt}
            onStylePromptChange={setStylePrompt}
            isAsmrEnabled={isAsmrEnabled}
            onAsmrToggle={setIsAsmrEnabled}
            ambientFoley={
              selectedStudioPreset?.metadata?.ambient_foley ||
              ''
            }
            excludePrompt={excludePrompt}
            onExcludePromptChange={setExcludePrompt}
            isPublic={isPublic}
            onPublicToggle={setIsPublic}
            compositorResult={compositorResult}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            isPlaylistMode={isPlaylistMode}
            trackCount={trackCount}
            dynamicElements={dynamicElements}
            ambienceVolume={ambienceVolume}
            onAmbienceVolumeChange={setAmbienceVolume}
            isPro={isPro}
            onOpenProPaywall={() => setIsProPaywallOpen(true)}
            presetId={selectedPresetId}
            customPresets={customPresets}
            onCustomPresetsChange={setCustomPresets}
            sourceMenu={sourceMenu}
            isInstrumental={isInstrumental}
            onInstrumentalToggle={setIsInstrumental}
            lyricsBuilderNode={
              <LyricsBuilder
                artistVoice={artistState.artistVoice}
                artistSelectionError={artistState.getError(artistSettings)}
                isInstrumental={isInstrumental}
                stylePrompt={stylePrompt}
                onInstrumentalToggle={setIsInstrumental}
                isPlaylistMode={isPlaylistMode}
                onPlaylistModeToggle={setIsPlaylistMode}
                trackCount={trackCount}
                onTrackCountChange={handleTrackCountChange}
                engine={engine}
                title={title}
                onTitleChange={setTitle}
                youtubeTags={youtubeTags}
                snsHashtags={snsHashtags}
                onTagsChange={(yt, sns) => {
                  setYoutubeTags(yt)
                  setSnsHashtags(sns)
                }}
                sections={lyricsSections}
                lyricLanguage={lyricsLanguage}
                onLyricLanguageChange={setLyricsLanguage}
                onSectionsChange={setLyricsSections}
                playlistTitle={playlistTitle}
                onPlaylistTitleChange={setPlaylistTitle}
                playlistDescription={playlistDescription}
                onPlaylistDescriptionChange={setPlaylistDescription}
                playlistYoutubeTags={playlistYoutubeTags}
                playlistSnsHashtags={playlistSnsHashtags}
                onPlaylistTagsChange={(yt, sns) => {
                  setPlaylistYoutubeTags(yt)
                  setPlaylistSnsHashtags(sns)
                }}
                tracks={tracks}
                onTracksChange={setTracks}
                activeTrackIdx={activeTrackIdx}
                onActiveTrackIdxChange={setActiveTrackIdx}
                presetId={selectedPresetId}
                selectedVdCode={selectedVdCode}
                onSelectedVdCodeChange={setSelectedVdCode}
                vdOptions={vdOptions}
              />
            }
          />
        </div>
      </div>

      {/* ─── AI 음원 생성 진행 및 결과 모달 ─── */}
      {genModalState !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] max-w-md w-full mx-4 p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
            
            {/* 1. 제출 중 상태 */}
            {genModalState === 'submitting' && (
              <div className="space-y-6">
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-fuchsia-500/20 animate-pulse"></div>
                  <div className="absolute inset-0 rounded-full border-t-4 border-fuchsia-500 animate-spin"></div>
                  <Wand2 className="w-8 h-8 text-fuchsia-400 shrink-0 animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-white text-lg font-bold">AI 작곡가 엔진 가동 중</h3>
                  <p className="text-zinc-400 text-sm">
                    스타일 프롬프트와 가사를 분석하여 AI 작곡 엔진에 음원을 의뢰하고 있습니다.
                  </p>
                </div>
              </div>
            )}

            {/* 2. 요청 성공 상태 */}
            {genModalState === 'success' && (
              <div className="space-y-6">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full mx-auto flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                  <Sparkles className="w-8 h-8 text-emerald-400 shrink-0" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-white text-lg font-bold">음원 작곡 요청 완료!</h3>
                  <p className="text-zinc-300 text-sm">
                    {isPlaylistMode ? `${tracks.length}곡` : '2곡'}의 신곡 작곡이 시작되었습니다!
                  </p>
                  <p className="text-zinc-500 text-xs leading-relaxed">
                    AI가 백그라운드에서 편곡 및 믹싱을 진행 중이며 약 1~2분이 소요됩니다. 완성되면 대시보드의 <strong>Track Library</strong>에 실시간으로 등록됩니다.
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={() => {
                      setGenModalState('idle')
                      router.push('/dashboard')
                    }}
                    className="w-full py-3 bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white font-semibold rounded-xl hover:shadow-[0_0_20px_rgba(192,38,211,0.4)] transition-all text-sm"
                  >
                    대시보드(Track Library)로 이동
                  </button>
                  <button
                    onClick={() => setGenModalState('idle')}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white rounded-xl transition-all text-xs font-semibold"
                  >
                    여기 남아서 더 만들기
                  </button>
                </div>
              </div>
            )}

            {/* 3. 에러 발생 상태 */}
            {genModalState === 'error' && (
              <div className="space-y-6">
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full mx-auto flex items-center justify-center">
                  <span className="text-2xl text-red-400">⚠️</span>
                </div>
                <div className="space-y-2">
                  <h3 className="text-white text-lg font-bold">작곡 요청 실패</h3>
                  <p className="text-red-400 text-sm font-mono truncate">{genErrorMsg}</p>
                </div>
                <button
                  onClick={() => setGenModalState('idle')}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white rounded-xl transition-all text-sm font-semibold"
                >
                  다시 시도하기
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>

    {/* 커스텀 프리셋 생성 및 결제 페이월 모달 */}
    <CreatePresetModal
      isOpen={isCreatePresetOpen || !!editingPreset}
      onClose={() => {
        setIsCreatePresetOpen(false)
        setEditingPreset(null)
      }}
      onSave={handleSaveCustomPreset}
      currentStylePrompt={stylePrompt}
      editingPreset={editingPreset}
    />
    <ProPaywallModal
      isOpen={isProPaywallOpen}
      onClose={() => setIsProPaywallOpen(false)}
      feature="presets"
    />
    </>
  )
}
