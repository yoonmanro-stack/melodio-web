'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Sparkles, Upload, Lock, Pencil, Trash2, Heart, Copy, Info, Palette, Shuffle, Check } from 'lucide-react'
import type { Preset } from '@/types'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/contexts/LanguageContext'
import { MASTER_NICHE_SEEDS } from '@/data/nicheMasterSeeds'
import { CHANNEL_CONCEPTS } from '@/data/channelConcepts'
import { getPresetThumbnail } from '@/lib/preset-thumbnail'

interface CreatePresetModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: { id?: string; name: string; desc: string; emoji: string; gradient: string; customPrompt: string; metadata?: any }) => void
  currentStylePrompt: string
  editingPreset?: Preset | null
  layoutType?: 'general' | 'japan'
}

const EMOJIS = ['🎵', '📚', '🌧️', '☕', '🍷', '🚗', '🌙', '🎤', '🎬', '🏃', '🌿', '🔥', '💗', '🎸', '🎹', '🎧', '🎷', '🛸', '🌊', '✨']
const SAMPLE_COLORS = ['#584072']

interface PresetThumbnailConcept {
  name: string
  desc: string
  inferredGenre: string
  customPrompt: string
  additionalRequest: string
  videoPrompt?: string
}

interface NicheDraftBaseline {
  name: string
  desc: string
  inferredGenre: string
  customPrompt: string
  translations: Record<string, string>
  dynamicElements: any
  emoji: string
  gradient: string
  thumbnailUrl: string
  thumbnailUrls: string[]
}

function buildPresetThumbnailPrompt(concept: PresetThumbnailConcept): string {
  const details = [
    concept.name.trim() ? `Preset concept name: ${concept.name.trim()}` : '',
    concept.desc.trim() ? `Concept description: ${concept.desc.trim()}` : '',
    concept.inferredGenre.trim() ? `Music genre: ${concept.inferredGenre.trim()}` : '',
    concept.customPrompt.trim() ? `Music style, instrumentation and mood: ${concept.customPrompt.trim()}` : '',
    concept.additionalRequest.trim() ? `User requirements: ${concept.additionalRequest.trim()}` : '',
  ].filter(Boolean)

  if (details.length === 0) return ''

  return [
    'Create a still thumbnail that faithfully represents this specific preset concept through appropriate places, landscapes, people, activities and emotional atmosphere. Preserve explicitly requested subjects and locations. Audio style tags guide the mood only; musical instruments and equipment are optional and must not be added merely because those tags mention them. Depict only physically plausible details that belong naturally in the concept.',
    ...details,
    concept.videoPrompt?.trim()
      ? `Secondary scene reference (use compatible scene details; the preset concept and user requirements above take priority over conflicting details or camera motion): ${concept.videoPrompt.trim()}`
      : '',
  ].filter(Boolean).join('\n')
}

// 3가지 프리셋용 고유 단색 (밝고 세련된 프리미엄 컬러셋)
const compressImage = (base64Str: string, maxWidth = 600, maxHeight = 600, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.src = base64Str
    img.onload = () => {
      let width = img.width
      let height = img.height

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height)
          height = maxHeight
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height)
        const compressed = canvas.toDataURL('image/jpeg', quality)
        resolve(compressed)
      } else {
        resolve(base64Str)
      }
    }
    img.onerror = () => {
      resolve(base64Str)
    }
  })
}

function fallbackGenreFromPreset(customPrompt: string, desc: string, name?: string): string {
  const text = `${name || ''} ${customPrompt} ${desc}`.toLowerCase();
  if (text.includes('synthwave') || text.includes('retro') || text.includes('80s')) return '신스웨이브 (Synthwave)';
  if (text.includes('lofi') || text.includes('lo-fi') || text.includes('chill')) return '로파이 (Lofi)';
  if (text.includes('jazz')) return '재즈 (Jazz)';
  if (text.includes('ambient') || text.includes('meditation') || text.includes('drone')) return '엠비언트 (Ambient)';
  if (text.includes('ballad') || text.includes('acoustic') || text.includes('발라드')) return '락발라드 (Rock Ballad)';
  if (text.includes('pop') || text.includes('팝')) return '팝 (Pop)';
  if (text.includes('folk')) return '포크 (Folk)';
  return '로파이 BGM';
}

export default function CreatePresetModal({ 
  isOpen, 
  onClose, 
  onSave, 
  currentStylePrompt, 
  editingPreset,
  layoutType = 'general'
}: CreatePresetModalProps) {
  const { language } = useLanguage()

  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [emoji, setEmoji] = useState('🎵')
  const [gradient, setGradient] = useState(SAMPLE_COLORS[0])
  const [customPrompt, setCustomPrompt] = useState('')
  const [copiedPresetPrompt, setCopiedPresetPrompt] = useState(false)
  const [copiedKeyName, setCopiedKeyName] = useState(false)



  // Localized state to preserve translation mappings dynamically
  const [translations, setTranslations] = useState<Record<string, string>>({})

  const handleNameChange = (val: string) => {
    const clean = val.replace(/\r?\n/g, '')
    setName(clean)
    setTranslations(prev => ({
      ...prev,
      [`name_${language}`]: clean
    }))
  }

  const handleDescChange = (val: string) => {
    setDesc(val)
    setTranslations(prev => ({
      ...prev,
      [`desc_${language}`]: val
    }))
  }

  const isReadOnly = !!(editingPreset && !editingPreset.id.startsWith('custom-'))

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(customPrompt)
    setCopiedPresetPrompt(true)
    setTimeout(() => setCopiedPresetPrompt(false), 2000)
  }

  const handleCopyKeyName = () => {
    if (!editingPreset?.id) return
    navigator.clipboard.writeText(editingPreset.id)
    setCopiedKeyName(true)
    setTimeout(() => setCopiedKeyName(false), 2000)
  }
  // 이미지 감성 분석 및 2단계 분류 관련 상태
  const [refImages, setRefImages] = useState<string[]>([])
  const [additionalRequest, setAdditionalRequest] = useState('')
  const [aiGeneratedThumbnailUrl, setAiGeneratedThumbnailUrl] = useState('')
  const [aiGeneratedThumbnailUrls, setAiGeneratedThumbnailUrls] = useState<string[]>([])
  const [failedThumbnailUrl, setFailedThumbnailUrl] = useState<string | null>(null)
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false)
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false)
  const [isAnalyzingText, setIsAnalyzingText] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [dynamicElements, setDynamicElements] = useState<any>(null)
  const [category, setCategory] = useState<string>('healing')

  // 🎲 모달 전용 AI 틈새 아이디어 셔플 상태
  const [modalNicheSeeds, setModalNicheSeeds] = useState<{ label: string; value: string }[]>([])
  const [selectedNicheReference, setSelectedNicheReference] = useState<{ label: string; value: string } | null>(null)
  const nicheDraftBaseline = useRef<NicheDraftBaseline | null>(null)
  const [isModalShuffling, setIsModalShuffling] = useState(false)

  const getRandomModalNicheChips = useCallback((catKey: string) => {
    const masterPool = MASTER_NICHE_SEEDS[catKey === 'cinematic' ? 'story' : catKey] || []
    const fallbackConcept = CHANNEL_CONCEPTS.find((c: any) => c.id === catKey)
    const fallbackPool = fallbackConcept ? fallbackConcept.nicheSeeds : []
    const pool = masterPool.length > 0 ? masterPool : fallbackPool
    if (!pool || pool.length === 0) return []
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 5)
  }, [])

  useEffect(() => {
    setModalNicheSeeds(getRandomModalNicheChips(category))
  }, [category, getRandomModalNicheChips])

  const handleShuffleModalNiche = () => {
    setIsModalShuffling(true)
    setTimeout(() => {
      setModalNicheSeeds(getRandomModalNicheChips(category))
      setIsModalShuffling(false)
    }, 200)
  }

  const handleModalNicheClick = (seed: { label: string; value: string }) => {
    if (isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail) return
    setAnalysisError('')
    if (!nicheDraftBaseline.current) {
      nicheDraftBaseline.current = {
        name, desc, inferredGenre, customPrompt, translations, dynamicElements, emoji, gradient,
        thumbnailUrl: aiGeneratedThumbnailUrl, thumbnailUrls: aiGeneratedThumbnailUrls,
      }
    } else {
      restoreNicheDraft()
    }
    if (selectedNicheReference?.value === seed.value) {
      setSelectedNicheReference(null)
      nicheDraftBaseline.current = null
      return
    }
    // Display labels may contain literal ellipses. The complete reference stays
    // separate from the user's title and musical style requirements.
    setSelectedNicheReference(seed)
  }

  const restoreNicheDraft = () => {
    const baseline = nicheDraftBaseline.current
    if (!baseline) return
    setName(baseline.name)
    setDesc(baseline.desc)
    setInferredGenre(baseline.inferredGenre)
    setCustomPrompt(baseline.customPrompt)
    setTranslations(baseline.translations)
    setDynamicElements(baseline.dynamicElements)
    setEmoji(baseline.emoji)
    setGradient(baseline.gradient)
    setAiGeneratedThumbnailUrl(baseline.thumbnailUrl)
    setAiGeneratedThumbnailUrls(baseline.thumbnailUrls)
  }

  const handleCategoryChange = (nextCategory: string) => {
    restoreNicheDraft()
    nicheDraftBaseline.current = null
    setSelectedNicheReference(null)
    setAnalysisError('')
    setCategory(nextCategory)
  }

  const generateSafeThumbnail = async (concept: PresetThumbnailConcept) => {
    const promptText = buildPresetThumbnailPrompt(concept)
    if (!promptText) return
    setIsGeneratingThumbnail(true)
    try {
      const res = await fetch('/api/autopilot/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          size: '16:9',
          imageType: 'thumbnail'
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.imageUrl) {
          setAiGeneratedThumbnailUrl(data.imageUrl)
        }
        if (data.imageUrls) {
          setAiGeneratedThumbnailUrls(data.imageUrls)
        }
      }
    } catch (err) {
      console.error('[CreatePresetModal] Safe image generation failed:', err)
    } finally {
      setIsGeneratingThumbnail(false)
    }
  }
  const [inferredGenre, setInferredGenre] = useState<string>('')
  
  // 프로 요금제(Paywall) 관련 상태
  const [isPro, setIsPro] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  useEffect(() => {
    async function checkSubscription() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('stripe_customer_id')
          .eq('id', user.id)
          .single()
        setIsPro(!!profile?.stripe_customer_id)
      }
    }
    checkSubscription()
  }, [])

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const fileList = Array.from(files).slice(0, 3 - refImages.length)
    if (fileList.length === 0) return

    const newBase64s: string[] = []
    let loaded = 0

    fileList.forEach(file => {
      const reader = new FileReader()
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          newBase64s.push(reader.result)
        }
        loaded++
        if (loaded === fileList.length) {
          setRefImages(prev => [...prev, ...newBase64s])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleRemoveImage = async (idx: number) => {
    const updated = refImages.filter((_, i) => i !== idx)
    setRefImages(updated)
    if (updated.length === 0) {
      setName('')
      setDesc('')
      setEmoji('🎵')
      setGradient(SAMPLE_COLORS[0])
      setCustomPrompt('')
      setDynamicElements(null)
      return
    }
  }

  const analyzeImagesForMusic = async (targetImages: string[]) => {
    if (targetImages.length === 0 || isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail) return
    setIsAnalyzingImage(true)
    setAnalysisError('')
    try {
      // Vercel 4.5MB 페이로드 제한 우회 및 전송 효율을 위해 이미지 압축 진행
      const compressedImages = await Promise.all(
        targetImages.map(img => compressImage(img))
      )

      const res = await fetch('/api/style-library/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          images: compressedImages,
          conceptName: name.trim() || undefined,
          conceptReference: selectedNicheReference?.value,
          category,
          desc: desc.trim() || undefined,
          inferredGenre: inferredGenre.trim() || undefined,
          customPrompt: customPrompt.trim() || undefined,
          additionalRequest: additionalRequest.trim() || undefined,
          locale: language
        })
      })
      const data = await res.json()
      if (!res.ok || !data.preset) throw new Error(data.error || '컨셉을 분석하지 못했습니다. 다시 시도해 주세요.')
      if (res.ok) {
        if (data.preset) {
          const analyzedConcept: PresetThumbnailConcept = {
            name: data.preset.name || name,
            desc: data.preset.desc || desc,
            inferredGenre: data.preset.inferred_genre || inferredGenre,
            customPrompt: data.preset.dynamic_elements
              ? data.preset.customPrompt || data.preset.dynamic_elements.audio_system?.music_layer?.base_prompt || customPrompt
              : data.preset.customPrompt || data.preset.custom_prompt || data.preset.prompt || data.preset.stylePrompt || customPrompt,
            additionalRequest,
            videoPrompt: data.preset.dynamic_elements?.visual_system?.base_video_prompt,
          }
          setName(analyzedConcept.name)
          setDesc(analyzedConcept.desc)
          setEmoji(data.preset.emoji || '🔮')
          setCategory(data.preset.category || 'healing')
          setInferredGenre(analyzedConcept.inferredGenre)
          setCustomPrompt(analyzedConcept.customPrompt)
          if (data.preset.color) {
            setGradient(data.preset.color)
          }
          if (data.preset.dynamic_elements) {
            setDynamicElements(data.preset.dynamic_elements)
          } else {
            setDynamicElements(null)
          }

          // Store AI translations dynamically
          const newTrans: Record<string, string> = {}
          const validLanguages = ["ko", "en", "ja", "es", "fr", "de", "pt", "zh", "it", "hi"]
          validLanguages.forEach(lang => {
            if (data.preset[`name_${lang}`]) newTrans[`name_${lang}`] = data.preset[`name_${lang}`]
            if (data.preset[`desc_${lang}`]) newTrans[`desc_${lang}`] = data.preset[`desc_${lang}`]
          })
          setTranslations(newTrans)

          await generateSafeThumbnail(analyzedConcept)
        }
      }
    } catch (err) {
      console.error('[CreatePresetModal] Image analysis failed:', err)
      setAnalysisError(err instanceof Error ? err.message : '컨셉을 분석하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setIsAnalyzingImage(false)
    }
  }

  const analyzeTextForMusic = async () => {
    if ((!name.trim() && !selectedNicheReference) || isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail) return
    setIsAnalyzingText(true)
    setAnalysisError('')
    try {
      const res = await fetch('/api/style-library/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          conceptName: name,
          conceptReference: selectedNicheReference?.value,
          category,
          desc: desc.trim() || undefined,
          inferredGenre: inferredGenre.trim() || undefined,
          customPrompt: customPrompt.trim() || undefined,
          additionalRequest: additionalRequest.trim() || undefined,
          locale: language
        })
      })
      const data = await res.json()
      if (!res.ok || !data.preset) throw new Error(data.error || '컨셉을 분석하지 못했습니다. 다시 시도해 주세요.')
      if (res.ok) {
        if (data.preset) {
          const analyzedConcept: PresetThumbnailConcept = {
            name: data.preset.name || name,
            desc: data.preset.desc || desc,
            inferredGenre: data.preset.inferred_genre || inferredGenre,
            customPrompt: data.preset.dynamic_elements
              ? data.preset.customPrompt || data.preset.dynamic_elements.audio_system?.music_layer?.base_prompt || customPrompt
              : data.preset.customPrompt || data.preset.custom_prompt || data.preset.prompt || data.preset.stylePrompt || customPrompt,
            additionalRequest,
            videoPrompt: data.preset.dynamic_elements?.visual_system?.base_video_prompt,
          }
          setName(analyzedConcept.name)
          setDesc(analyzedConcept.desc)
          setEmoji(data.preset.emoji || '🔮')
          setCategory(data.preset.category || 'healing')
          setInferredGenre(analyzedConcept.inferredGenre)
          setCustomPrompt(analyzedConcept.customPrompt)
          if (data.preset.color) {
            setGradient(data.preset.color)
          }
          if (data.preset.dynamic_elements) {
            setDynamicElements(data.preset.dynamic_elements)
          } else {
            setDynamicElements(null)
          }

          // Store AI translations dynamically
          const newTrans: Record<string, string> = {}
          const validLanguages = ["ko", "en", "ja", "es", "fr", "de", "pt", "zh", "it", "hi"]
          validLanguages.forEach(lang => {
            if (data.preset[`name_${lang}`]) newTrans[`name_${lang}`] = data.preset[`name_${lang}`]
            if (data.preset[`desc_${lang}`]) newTrans[`desc_${lang}`] = data.preset[`desc_${lang}`]
          })
          setTranslations(newTrans)

          await generateSafeThumbnail(analyzedConcept)
        }
      }
    } catch (err) {
      console.error('[CreatePresetModal] Text concept analysis failed:', err)
      setAnalysisError(err instanceof Error ? err.message : '컨셉을 분석하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setIsAnalyzingText(false)
    }
  }



  useEffect(() => {
    if (isOpen) {
      setIsAnalyzingImage(false)
      setIsAnalyzingText(false)
      setAnalysisError('')
      setFailedThumbnailUrl(null)
      setSelectedNicheReference(null)
      nicheDraftBaseline.current = null
      setDynamicElements(editingPreset?.metadata?.dynamic_elements || null)
      setCategory(editingPreset?.metadata?.category || 'healing')
      let genre = editingPreset?.metadata?.inferred_genre || ''
      if (editingPreset && !genre) {
        genre = fallbackGenreFromPreset(editingPreset.customPrompt || '', editingPreset.desc || '', editingPreset.name || '')
      }
      setInferredGenre(genre)
      if (editingPreset) {
        const meta = editingPreset.metadata || {}
        const initialTrans: Record<string, string> = {}
        const validLanguages = ["ko", "en", "ja", "es", "fr", "de", "pt", "zh", "it", "hi"]
        validLanguages.forEach(lang => {
          if (meta[`name_${lang}`]) initialTrans[`name_${lang}`] = meta[`name_${lang}`]
          if (meta[`desc_${lang}`]) initialTrans[`desc_${lang}`] = meta[`desc_${lang}`]
        })
        setTranslations(initialTrans)

        setName(meta[`name_${language}`] || editingPreset.name)
        setDesc(meta[`desc_${language}`] || editingPreset.desc)

        setEmoji(editingPreset.emoji)
        setGradient(editingPreset.gradient || SAMPLE_COLORS[0])
        setCustomPrompt(editingPreset.customPrompt || '')
        const existingThumbnail = getPresetThumbnail(editingPreset, editingPreset.id.startsWith('custom-'))
        setRefImages(existingThumbnail ? [existingThumbnail] : [])
        setAiGeneratedThumbnailUrl(existingThumbnail || '')
        setAiGeneratedThumbnailUrls(editingPreset.metadata?.thumbnail_urls || [])
        setAdditionalRequest('')
      } else {
        setName('')
        setDesc('')
        setTranslations({})
        setEmoji('🎵')
        setGradient(SAMPLE_COLORS[0])
        setCustomPrompt(currentStylePrompt)
        setRefImages([])
        setAiGeneratedThumbnailUrl('')
        setAiGeneratedThumbnailUrls([])
        setAdditionalRequest('')
      }
    }
  }, [isOpen, editingPreset, currentStylePrompt, language])

  if (!isOpen) return null

  const existingThumbnail = editingPreset
    ? getPresetThumbnail(editingPreset, editingPreset.id.startsWith('custom-'))
    : null
  const thumbnailUrl = aiGeneratedThumbnailUrl || refImages[0] || existingThumbnail

  const handleSave = () => {
    if (!name.trim()) {
      alert('컨셉명을 입력해 주세요!')
      return
    }
    if (!desc.trim()) {
      alert('컨셉 설명을 입력해 주세요!')
      return
    }
    if (!customPrompt.trim()) {
      alert('스타일 프롬프트 태그를 입력해 주세요!')
      return
    }
    onSave({
      id: editingPreset?.id,
      name: name.trim(),
      desc: desc.trim(),
      emoji,
      gradient,
      customPrompt: customPrompt.trim(),
      metadata: {
        ...(editingPreset?.metadata || {}),
        category: category,
        concept_reference: selectedNicheReference?.value || null,
        inferred_genre: inferredGenre,
        thumbnail_url: thumbnailUrl || undefined,
        thumbnail_urls: aiGeneratedThumbnailUrls.length > 0 
          ? aiGeneratedThumbnailUrls 
          : (refImages.length > 0 ? refImages : (editingPreset?.metadata?.thumbnail_urls || [])),
        ...(dynamicElements ? { dynamic_elements: dynamicElements } : {}),
        ...translations,
        [`name_${language}`]: name.trim(),
        [`desc_${language}`]: desc.trim()
      }
    })
    onClose()
  }

  // 컨셉명, 장르, 이미지 중 하나라도 있어야 실제 카드 표시
  const hasPreviewContent = !!name.trim() || !!inferredGenre || !!thumbnailUrl;
  const genreText = inferredGenre || fallbackGenreFromPreset(customPrompt, desc, name);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div 
        className="w-full max-w-[820px] bg-zinc-950/95 border border-fuchsia-500/30 rounded-3xl p-7 shadow-[0_0_80px_rgba(217,70,239,0.18)] relative flex flex-col md:flex-row gap-6 max-h-[95vh] md:h-[660px] overflow-hidden backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all z-10 border border-white/5"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 좌측: 정보 입력 폼 (독립 스크롤 영역) */}
        <div className="flex-1 overflow-y-auto pr-3 max-h-[50vh] md:max-h-full space-y-5 font-sans scrollbar-thin">
          <div className="border-b border-white/10 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-fuchsia-600/30">
                <Sparkles className="w-4 h-4 text-white animate-pulse" />
              </div>
              <h3 className="text-lg font-black text-white tracking-tight">
                {isReadOnly ? '🎨 시그니처 컨셉 정보' : editingPreset ? '✏️ 나만의 컨셉 수정하기' : '✨ 나만의 스타일 프리셋 생성'}
              </h3>
            </div>
            <p className="text-[12px] text-zinc-400 leading-relaxed">
              {isReadOnly 
                ? '멜로디오 공식 음악 프리셋 컨셉의 고유 사운드 레시피 정보입니다.'
                : editingPreset 
                ? '선택한 커스텀 프리셋의 세부 스펙 및 프롬프트 태그를 재설정합니다.' 
                : '나만의 오리지널 스타일 레시피를 생성하여 1클릭 원터치로 음원을 제작하세요.'}
            </p>
          </div>

          {/* 대분류 카테고리 & 🎲 AI 틈새 아이디어 셔플 */}
          <div className="space-y-3 bg-zinc-900/60 p-3.5 rounded-xl border border-white/5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-extrabold text-zinc-300 uppercase tracking-wider font-mono">
                * 대분류 카테고리
              </label>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleShuffleModalNiche}
                  disabled={isModalShuffling || isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
                  className="px-2.5 py-1 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-[10.5px] font-bold transition-all shadow-[0_0_10px_rgba(217,70,239,0.3)] flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  <Shuffle className={`w-3 h-3 ${isModalShuffling ? 'animate-spin' : ''}`} />
                  <span>추천 아이디어 새로 보기</span>
                </button>
              )}
            </div>

            <select
              value={category}
              onChange={e => handleCategoryChange(e.target.value)}
              disabled={isReadOnly || isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
              className="w-full px-3.5 py-2.5 bg-zinc-900/80 border border-white/10 rounded-xl text-[13px] font-medium text-zinc-200 focus:outline-none focus:border-fuchsia-500/60 focus:ring-1 focus:ring-fuchsia-500/30 transition-all disabled:opacity-75 disabled:cursor-not-allowed"
            >
              <option value="healing">👼 마음의 위로 & 힐링 (Healing & Chill)</option>
              <option value="focus">✏️ 몰입 & 생산성 (Focus & Study)</option>
              <option value="retro">📻 아날로그 & 향수 (Retro & Synthwave)</option>
              <option value="cafe">☕ 카페 & 오프라인 공간 (Cafe & Lounge)</option>
              <option value="drive">🚗 드라이브 & 감성 여행 (Drive & Travel)</option>
              <option value="cinematic">🎬 서사 & 시네마틱 스토리 (Cinematic & Epic)</option>
              <option value="other">✨ 기타 특수 컨셉 (Other Special Concept)</option>
            </select>

            {/* 🎯 틈새 타겟팅 추천 칩 (단일 선택 클릭 시 자동 반영) */}
            {modalNicheSeeds.length > 0 && !isReadOnly && (
              <div className="pt-2 border-t border-white/5 space-y-1.5">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-zinc-300 font-bold flex items-center gap-1">
                    🎯 추천 아이디어 (하나 선택 후 AI 분석):
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {modalNicheSeeds.map((seed) => {
                    const isSelected = selectedNicheReference?.value === seed.value;
                    const referenceLabel = `${seed.label.match(/^🔥\s*\[[^\]]+\]\s*/)?.[0] || ''}${seed.value}`;
                    return (
                      <button
                        key={seed.value}
                        type="button"
                        onClick={() => handleModalNicheClick(seed)}
                        aria-pressed={isSelected}
                        aria-label={`추천 아이디어: ${seed.value}`}
                        title={seed.value}
                        disabled={isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
                        className={`px-2 py-1 rounded-lg text-[10.5px] font-medium transition-all border flex items-center gap-1 text-left ${
                          isSelected
                            ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 border-fuchsia-400 text-white font-bold shadow-[0_0_10px_rgba(217,70,239,0.5)] scale-105'
                            : 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-200 hover:text-white hover:bg-fuchsia-500/20'
                        }`}
                      >
                        <span className="truncate max-w-[220px]">{referenceLabel}</span>
                        {isSelected && <Check className="w-3 h-3 text-fuchsia-200 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {selectedNicheReference && (
                  <div role="region" aria-label="선택한 추천 아이디어" className="mt-3 rounded-xl border border-fuchsia-500/20 bg-black/30 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold text-fuchsia-200">선택한 추천 아이디어 · 원문</span>
                      <button type="button" onClick={() => handleModalNicheClick(selectedNicheReference)} disabled={isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail} className="text-[11px] text-zinc-400 hover:text-white disabled:opacity-50">선택 해제</button>
                    </div>
                    <p className="text-[12px] text-zinc-200 leading-relaxed break-words">{selectedNicheReference.value}</p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">아래 AI 분석을 누르면 원문을 참고해 컨셉명·설명·음악 태그를 만듭니다. 다른 추천을 선택하면 이전 추천의 분석 결과를 교체합니다.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 이미지 감성 분석 자동 완성 */}
          {!editingPreset && (
            <div className="p-4 bg-zinc-900/30 border border-white/5 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] font-bold text-fuchsia-300">🔮 이미지 감성 분석 자동 완성</span>
                </div>
                <span className="text-[10px] text-zinc-500">{refImages.length}/3장</span>
              </div>

              {/* 안내 가이드 카드 */}
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 text-[11.5px] text-zinc-400 leading-relaxed space-y-1.5">
                <div className="text-zinc-200 font-bold flex items-center gap-1">💡 감성 컨셉을 채우는 2가지 방법</div>
                <p className="pl-0.5">
                  <strong className="text-fuchsia-300 font-extrabold">1안 [AI 이미지 분석] :</strong> 감성 사진을 1~3장 업로드하고 아래 분석 버튼을 클릭하면 제목, 장르, 무드 태그가 자동으로 분석 및 작성됩니다.
                </p>
                <p className="pl-0.5">
                  <strong className="text-zinc-200 font-extrabold">2안 [수동 직접 작성] :</strong> 이미지 업로드 없이 아래의 <strong>'* 컨셉명'</strong> 및 장르, 스타일 무드 태그들을 직접 텍스트로 자유롭게 입력하여 완성하셔도 됩니다.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 w-full">
                {Array.from({ length: 3 }).map((_, index) => {
                  const hasImage = index < refImages.length;
                  if (hasImage) {
                    return (
                      <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/40 shadow-inner group">
                        <img src={refImages[index]} alt={`Ref ${index + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(index)}
                          disabled={isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
                          className="absolute top-1 right-1 bg-black/70 hover:bg-black/90 text-red-400 hover:text-red-300 rounded-full p-1 text-[10px] w-4 h-4 flex items-center justify-center font-bold transition-all shadow"
                          title="제거"
                        >
                          ×
                        </button>
                      </div>
                    );
                  } else {
                    return (
                      <label key={index} className="aspect-square rounded-xl border border-dashed border-zinc-700 bg-white/5 hover:bg-white/10 hover:border-zinc-500 flex flex-col items-center justify-center cursor-pointer transition-all shadow-sm">
                        <Upload className="w-4 h-4 text-zinc-500" />
                        <span className="text-[9px] text-zinc-500 mt-1 font-bold">업로드</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleUploadImages}
                          className="hidden"
                          disabled={isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
                        />
                      </label>
                    );
                  }
                })}
              </div>

              {refImages.length > 0 && (
                <>
                  <div className="mt-3.5 space-y-1.5 text-left">
                    <label className="block text-[10px] font-bold text-zinc-400 font-mono tracking-wider">
                      추가 요구사항 (선택, 200자 이내)
                    </label>
                    <input
                      type="text"
                      value={additionalRequest}
                      onChange={(e) => setAdditionalRequest(e.target.value)}
                      maxLength={200}
                      className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[12px] font-normal text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 transition-colors disabled:opacity-75"
                      placeholder="예: 헤드폰을 쓴 젊은 여성이 창밖 설산을 보며 여행하는 감성적인 일러스트"
                      disabled={isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => analyzeImagesForMusic(refImages)}
                    disabled={isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
                    className="w-full mt-3.5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(192,38,211,0.25)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAnalyzingImage ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        AI 감성 분석 진행 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        이 이미지로 AI 컨셉 자동 분석하기
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="space-y-3">

            {/* 이름 */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 font-mono">
                * 컨셉명 (50자 이내)
              </label>
              <div className="relative">
                <textarea 
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  className="w-full pl-3.5 pr-24 py-2 bg-black/40 border border-white/10 rounded-xl text-[13px] font-normal text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500/50 transition-colors disabled:opacity-75 resize-none h-[56px] leading-normal"
                  aria-label="컨셉명"
                  placeholder={selectedNicheReference ? 'AI 분석으로 추천 아이디어에 맞는 이름을 만드세요' : '예: 잔잔한 바다의 휴식, 비 오는 카페'}
                  maxLength={50}
                  disabled={isReadOnly || isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
                />
                {(name.trim().length > 0 || selectedNicheReference) && !isReadOnly && (
                  <button
                    type="button"
                    onClick={analyzeTextForMusic}
                    disabled={isAnalyzingText || isAnalyzingImage || isGeneratingThumbnail}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold text-white bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 shadow-sm transition-all active:scale-95 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAnalyzingText ? (
                      <>
                        <span className="w-2.5 h-2.5 border border-white/30 border-t-white rounded-full animate-spin" />
                        분석 중
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-2.5 h-2.5" />
                        AI 분석
                      </>
                    )}
                  </button>
                )}
              </div>
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-normal font-sans flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span>컨셉명은 짧고 알아보기 쉽게 적어 주세요. 장소·분위기·사용 목적은 아래 컨셉 설명에 적으면 분석에 반영됩니다.</span>
              </p>
              {analysisError && <p role="alert" className="mt-2 text-[12px] text-red-300">{analysisError}</p>}
            </div>

            {/* 음악 장르 */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 font-mono">
                음악 장르 (Genre)
              </label>
              <input 
                type="text" 
                value={inferredGenre}
                aria-label="음악 장르"
                onChange={e => setInferredGenre(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[15px] font-normal text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500/50 transition-colors disabled:opacity-75"
                placeholder="예: Lofi, Jazz Lullaby, Ambient Synth"
                maxLength={50}
                disabled={isReadOnly || isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
              />
            </div>

            {/* 설명 */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 font-mono font-bold">
                * 컨셉 설명 (300자 이내)
              </label>
              <textarea 
                value={desc}
                aria-label="컨셉 설명"
                onChange={e => handleDescChange(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[15px] font-normal text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500/50 transition-colors h-24 resize-y leading-normal font-sans disabled:opacity-75"
                placeholder="예: 잔잔한 파도 소리와 부드러운 피아노가 어우러지는 휴식용 음악. 느린 템포와 차분한 분위기를 원합니다."
                maxLength={300}
                disabled={isReadOnly || isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
              />
            </div>

            {/* 스타일 태그 (무드 태그) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-widest font-mono">
                    * 스타일 태그 (무드 태그)
                  </label>
                  {customPrompt.trim() && (
                    <button
                       type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(customPrompt)
                        setCopiedPresetPrompt(true)
                        setTimeout(() => setCopiedPresetPrompt(false), 2000)
                      }}
                      className="text-[10px] text-fuchsia-400 hover:text-fuchsia-300 font-bold font-mono flex items-center gap-1"
                    >
                      {copiedPresetPrompt ? (
                        '✅ 복사 완료'
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>복사</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              <textarea 
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[13px] font-normal text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500/50 transition-colors font-mono leading-relaxed h-32 resize-y disabled:opacity-75"
                placeholder="예: ambient lofi, rainy day, warm felt piano, slow tempo, 72 BPM, cozy atmosphere"
                maxLength={1000}
                disabled={isReadOnly || isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
              />
              <p className="text-[10px] text-zinc-500 mt-1 leading-normal font-sans">
                음악 생성기에 반영할 분위기, 악기, 템포 등의 쉼표(,) 구분 태그 목록입니다.
              </p>
            </div>


          </div>
        </div>

        {/* 우측: 카드 미리보기 & 액션 */}
        <div className="w-full md:w-[274px] shrink-0 flex flex-col justify-between border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6 space-y-6">
          <div className="space-y-4">
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-widest font-mono">
              컨셉 미리보기
            </label>
            
            {/* 카드 렌더링: 입력값 없으면 빈 플레이스홀더, 있으면 실제 카드 */}
            {!hasPreviewContent ? (
              <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-950/20 text-center px-4 ${
                layoutType === 'japan' ? 'w-[200px] h-[190px] mx-auto' : 'w-[250px] h-[280px]'
              }`}>
                <Palette className="w-8 h-8 text-zinc-600 mb-3" />
                <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
                  설정이 완료되면<br />미리보기 이미지가 표시됩니다
                </p>
              </div>
            ) : (
              <div
                className={`relative overflow-hidden rounded-xl border transition-all duration-300 group flex flex-col justify-between shrink-0 border-zinc-800 bg-zinc-950/20 ${
                  layoutType === 'japan' ? 'w-[200px] h-[190px] mx-auto' : 'w-[250px] h-[280px]'
                }`}
              >
                {/* 1. Thumbnail Image — PresetGrid와 동일 */}
                <div className={`relative w-full overflow-hidden bg-zinc-900 shrink-0 cursor-default border-b border-white/5 ${
                  layoutType === 'japan' ? 'flex-1' : 'aspect-[16/9]'
                }`}>
                  {isGeneratingThumbnail ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950/80">
                      <span className="w-5 h-5 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin mb-2" />
                      <span className="text-[9px] text-zinc-500 font-mono">저작권 프리 AI 썸네일 생성 중...</span>
                    </div>
                  ) : thumbnailUrl && thumbnailUrl !== failedThumbnailUrl ? (
                    <img
                      key={thumbnailUrl}
                      src={thumbnailUrl}
                      alt=""
                      onError={() => setFailedThumbnailUrl(thumbnailUrl)}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.025] group-hover:saturate-[1.03]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-800 via-zinc-900 to-indigo-950 px-6 text-center" role="img" aria-label={`${name} — 이미지 없음`}>
                      <span className="text-4xl" aria-hidden="true">{emoji || '🎵'}</span>
                      <span className="max-w-full text-xs font-medium text-zinc-300 line-clamp-2">{name}</span>
                    </div>
                  )}
                </div>

                {/* 2. Bottom Content Area */}
                {layoutType === 'japan' ? (
                  <div className="pt-2 px-3 pb-2.5 bg-zinc-950/40 flex flex-col justify-between min-w-0 shrink-0 h-[78px]">
                    <div className="min-w-0">
                      <h3 className="text-[11.5px] font-black text-white leading-tight truncate">
                        {name}
                      </h3>
                      <p className="text-[9.5px] text-zinc-400 mt-0.5 line-clamp-1 leading-normal font-sans">
                        {desc}
                      </p>
                    </div>

                    {/* Bottom utility row */}
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/5">
                      <div className="flex items-center gap-1 scale-90 origin-left">
                        {isReadOnly ? (
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-900 text-zinc-500 font-mono tracking-wider uppercase font-semibold">
                            Signature
                          </span>
                        ) : (
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-300 font-mono tracking-wider uppercase font-bold shadow-sm">
                            Custom Set
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          {!isReadOnly && (
                            <>
                              <button className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 cursor-default" title="수정">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button className="text-zinc-500 hover:text-red-400 transition-colors p-0.5 cursor-default" title="삭제">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          <button className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 cursor-default">
                            <Heart className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pt-3 px-3.5 pb-4.5 flex-1 flex flex-col justify-between min-w-0">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex items-center">
                        <span className="text-[9px] font-extrabold text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider scale-90 origin-left">
                          {genreText || 'Lofi BGM'}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-[12.5px] font-bold text-zinc-200 truncate leading-tight flex-1">
                          {name}
                        </h4>
                      </div>
                      <p className="text-[10px] text-zinc-500 leading-normal line-clamp-2 mt-1 font-sans">
                        {desc}
                      </p>
                    </div>

                    {/* Bottom utility row */}
                    <div className="flex items-center justify-between mt-2 pt-2.5 border-t border-white/5">
                      <div className="flex items-center gap-1 scale-90 origin-left">
                        {isReadOnly ? (
                          <span className="text-[8.5px] px-2 py-0.5 rounded-md bg-zinc-950 border border-zinc-900 text-zinc-500 font-mono tracking-wider uppercase font-semibold">
                            Signature
                          </span>
                        ) : (
                          <span className="text-[8.5px] px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700/80 text-zinc-300 font-mono tracking-wider uppercase font-bold shadow-sm">
                            Custom Set
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!isReadOnly && (
                          <>
                            <button className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 cursor-default" title="수정">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button className="text-zinc-500 hover:text-red-400 transition-colors p-0.5 cursor-default" title="삭제">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                        <button className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 cursor-default">
                          <Heart className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {editingPreset?.id && !editingPreset.id.startsWith('custom-') && (
              <div 
                onClick={handleCopyKeyName}
                className={`mt-2.5 flex items-center justify-between px-2.5 py-1.5 bg-zinc-900/40 hover:bg-zinc-900/60 border border-white/5 hover:border-white/10 rounded-lg text-[10px] font-mono text-zinc-500 transition-all cursor-pointer group/file select-none ${
                  layoutType === 'japan' ? 'w-[200px] mx-auto' : 'w-[250px]'
                }`}
              >
                <div className="flex items-center min-w-0">
                  <span className="truncate">{editingPreset.id}.md</span>
                </div>
                <button
                  type="button"
                  className="text-zinc-600 group-hover/file:text-zinc-400 transition-colors p-0.5"
                  title="영문 키명 복사"
                >
                  {copiedKeyName ? (
                    <span className="text-[9px] text-fuchsia-500 font-sans font-bold">복사 완료!</span>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>

          {isReadOnly ? (
            <div className="flex flex-col gap-2">
              <button 
                onClick={handleCopyPrompt}
                className="w-full py-2.5 bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white text-[13px] font-semibold rounded-xl hover:shadow-[0_0_15px_rgba(192,38,211,0.4)] transition-all flex items-center justify-center gap-1.5 active:scale-98"
              >
                <Copy className="w-4 h-4" />
                {copiedPresetPrompt ? '스타일 프롬프트 복사 완료!' : '스타일 프롬프트 복사하기'}
              </button>
              <button 
                onClick={onClose}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white text-[13px] font-semibold rounded-xl transition-all"
              >
                닫기
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => generateSafeThumbnail({
                  name,
                  desc,
                  inferredGenre,
                  customPrompt,
                  additionalRequest,
                  videoPrompt: dynamicElements?.visual_system?.base_video_prompt,
                })}
                disabled={!name.trim() || isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 text-[13px] font-semibold rounded-xl transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {isGeneratingThumbnail ? '썸네일 생성 중...' : '현재 컨셉으로 썸네일 생성'}
              </button>
              <button 
                onClick={handleSave}
                disabled={isAnalyzingImage || isAnalyzingText || isGeneratingThumbnail}
                className="w-full py-2.5 bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white text-[13px] font-semibold rounded-xl hover:shadow-[0_0_15px_rgba(192,38,211,0.4)] transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {isAnalyzingImage 
                  ? '이미지 감성 분석 중...' 
                  : isAnalyzingText 
                  ? 'AI 텍스트 분석 중...' 
                  : editingPreset ? '수정 완료하기' : '저장하고 적용하기'}
              </button>
              <button 
                onClick={onClose}
                className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white text-[13px] font-semibold rounded-xl transition-all"
              >
                취소
              </button>
            </div>
          )}
        </div>
      </div>

      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-[400px] bg-zinc-950 border border-fuchsia-500/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(217,70,239,0.15)] text-center relative font-sans">
            <button 
              onClick={() => setShowUpgradeModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-12 h-12 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-6 h-6 text-fuchsia-400 animate-pulse" />
            </div>
            <h4 className="text-lg font-bold text-white mb-2">🪄 AI 프롬프트 최적화 (Pro 전용)</h4>
            <p className="text-[13px] text-zinc-400 leading-relaxed mb-6">
              AI 프롬프트 최적화 기능은 **프로 요금제 이상**의 사용자만 이용하실 수 있습니다.<br /><br />
              1,000자 분량의 고품질 프로듀서 브리프 생성 및 5:5 ASMR 공간음 믹싱 혜택을 즉시 확인해 보세요.
            </p>
            <div className="flex flex-col gap-2">
              <a 
                href="/billing"
                className="w-full py-3 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-md block text-center"
              >
                💎 프로 요금제 업그레이드
              </a>
              <button 
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-xl text-sm font-semibold transition-colors"
              >
                돌아가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
