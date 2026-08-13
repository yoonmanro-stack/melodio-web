'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Sparkles, Upload, Lock, Pencil, Trash2, Heart, Copy, Info, Palette, Shuffle, Check } from 'lucide-react'
import type { Preset } from '@/types'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/contexts/LanguageContext'
import { MASTER_NICHE_SEEDS } from '@/data/nicheMasterSeeds'
import { CHANNEL_CONCEPTS } from '@/app/(app)/style-library/page'

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
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false)
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false)
  const [isAnalyzingText, setIsAnalyzingText] = useState(false)
  const [dynamicElements, setDynamicElements] = useState<any>(null)
  const [category, setCategory] = useState<string>('healing')

  // 🎲 모달 전용 AI 틈새 아이디어 셔플 상태
  const [modalNicheSeeds, setModalNicheSeeds] = useState<{ label: string; value: string }[]>([])
  const [selectedModalNicheTag, setSelectedModalNicheTag] = useState<string | null>(null)
  const [isModalShuffling, setIsModalShuffling] = useState(false)

  const getRandomModalNicheChips = useCallback((catKey: string) => {
    const masterPool = MASTER_NICHE_SEEDS[catKey] || []
    const fallbackConcept = CHANNEL_CONCEPTS.find((c: any) => c.id === catKey)
    const fallbackPool = fallbackConcept ? fallbackConcept.nicheSeeds : []
    const pool = masterPool.length > 0 ? masterPool : fallbackPool
    if (!pool || pool.length === 0) return []
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 5)
  }, [])

  useEffect(() => {
    setModalNicheSeeds(getRandomModalNicheChips(category))
    setSelectedModalNicheTag(null)
  }, [category, getRandomModalNicheChips])

  const handleShuffleModalNiche = () => {
    setIsModalShuffling(true)
    setTimeout(() => {
      setModalNicheSeeds(getRandomModalNicheChips(category))
      setIsModalShuffling(false)
    }, 200)
  }

  const handleModalNicheClick = (seed: { label: string; value: string }) => {
    if (selectedModalNicheTag === seed.value) {
      setSelectedModalNicheTag(null)
    } else {
      setSelectedModalNicheTag(seed.value)
      // 1클릭 컨셉명 & 스타일 태그 자동 주입
      const cleanLabel = seed.label.replace(/^🔥\s*\[[^\]]+\]\s*/, '').trim()
      if (cleanLabel) {
        handleNameChange(cleanLabel.slice(0, 48))
      }
      if (seed.value) {
        setCustomPrompt(prev => {
          if (!prev) return seed.value
          if (prev.includes(seed.value)) return prev
          return `${prev}, ${seed.value}`
        })
      }
    }
  }

  const generateSafeThumbnail = async (promptText: string) => {
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
    if (targetImages.length === 0) return
    setIsAnalyzingImage(true)
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
          additionalRequest: additionalRequest.trim() || undefined,
          locale: language
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.preset) {
          setName(data.preset.name || '')
          setDesc(data.preset.desc || '')
          setEmoji(data.preset.emoji || '🔮')
          setCategory(data.preset.category || 'healing')
          setInferredGenre(data.preset.inferred_genre || '')
          if (data.preset.color) {
            setGradient(data.preset.color)
          }
          if (data.preset.dynamic_elements) {
            setDynamicElements(data.preset.dynamic_elements)
            setCustomPrompt(data.preset.customPrompt || data.preset.dynamic_elements.audio_system?.music_layer?.base_prompt || '')
          } else {
            setCustomPrompt(data.preset.customPrompt || data.preset.custom_prompt || data.preset.prompt || data.preset.stylePrompt || '')
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

          // 비디오 프롬프트 혹은 설명을 바탕으로 저작권 없는 AI 썸네일 생성 수행
          const imgPrompt = data.preset.dynamic_elements?.visual_system?.base_video_prompt || data.preset.desc || data.preset.name || 'cozy lofi vibe'
          generateSafeThumbnail(imgPrompt)
        }
      }
    } catch (err) {
      console.error('[CreatePresetModal] Image analysis failed:', err)
    } finally {
      setIsAnalyzingImage(false)
    }
  }

  const analyzeTextForMusic = async () => {
    if (!name.trim()) return
    setIsAnalyzingText(true)
    try {
      const res = await fetch('/api/style-library/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          conceptName: name,
          locale: language
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.preset) {
          if (data.preset.name) {
            setName(data.preset.name)
          }
          setDesc(data.preset.desc || '')
          setEmoji(data.preset.emoji || '🔮')
          setCategory(data.preset.category || 'healing')
          setInferredGenre(data.preset.inferred_genre || '')
          if (data.preset.color) {
            setGradient(data.preset.color)
          }
          if (data.preset.dynamic_elements) {
            setDynamicElements(data.preset.dynamic_elements)
            setCustomPrompt(data.preset.customPrompt || data.preset.dynamic_elements.audio_system?.music_layer?.base_prompt || '')
          } else {
            setCustomPrompt(data.preset.customPrompt || data.preset.custom_prompt || data.preset.prompt || data.preset.stylePrompt || '')
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

          // 비디오 프롬프트 혹은 설명을 바탕으로 저작권 없는 AI 썸네일 생성 수행
          const imgPrompt = data.preset.dynamic_elements?.visual_system?.base_video_prompt || data.preset.desc || data.preset.name || 'cozy lofi vibe'
          generateSafeThumbnail(imgPrompt)
        }
      }
    } catch (err) {
      console.error('[CreatePresetModal] Text concept analysis failed:', err)
    } finally {
      setIsAnalyzingText(false)
    }
  }



  useEffect(() => {
    if (isOpen) {
      setIsAnalyzingImage(false)
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
        setRefImages(editingPreset.metadata?.thumbnail_url ? [editingPreset.metadata.thumbnail_url] : [])
        setAiGeneratedThumbnailUrl(editingPreset.metadata?.thumbnail_url || '')
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
        setAdditionalRequest('')
      }
    }
  }, [isOpen, editingPreset, currentStylePrompt, language])

  if (!isOpen) return null

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
        inferred_genre: inferredGenre,
        thumbnail_url: aiGeneratedThumbnailUrl || (refImages.length > 0 ? refImages[0] : undefined),
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

  // 프리셋 카드 색상 자동 매핑을 위해 DEFAULT_THUMBNAILS 매핑 정의
  const DEFAULT_THUMBNAILS: Record<string, string> = {
    'developer-debugging': 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/developer-debugging.png',
    'iced-oolong-tea': 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/iced-oolong-tea.png',
    'tokyo-midnight-1984': 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/tokyo-midnight-1984.png',
    'matcha-kyoto-jazz': 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/matcha-kyoto-jazz.png',
    'french-vintage-chanson': 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/french-vintage-chanson.png',
    'deep-sleep-drift': 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/deep-sleep-drift.png',
    'dead-mall-nostalgia': 'https://jfsfxzhunkrjyibsdswb.supabase.co/storage/v1/object/public/melodio-assets/presets/dead-mall-nostalgia.png'
  }

  const getPreviewThumbnail = () => {
    if (aiGeneratedThumbnailUrl) return aiGeneratedThumbnailUrl;
    if (refImages.length > 0) return refImages[0];
    if (editingPreset?.metadata?.thumbnail_url) return editingPreset.metadata.thumbnail_url;
    if ((editingPreset as any)?.thumbnailUrl) return (editingPreset as any).thumbnailUrl;
    const id = editingPreset?.id || '';
    return DEFAULT_THUMBNAILS[id] || null;
  };

  const thumbnailUrl = getPreviewThumbnail();
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
                  disabled={isModalShuffling}
                  className="px-2.5 py-1 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-lg text-[10.5px] font-bold transition-all shadow-[0_0_10px_rgba(217,70,239,0.3)] flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  <Shuffle className={`w-3 h-3 ${isModalShuffling ? 'animate-spin' : ''}`} />
                  <span>🎲 AI 틈새 아이디어 셔플</span>
                </button>
              )}
            </div>

            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              disabled={isReadOnly}
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
                    🎯 틈새 타겟팅 추천 칩 (클릭 시 컨셉명 & 태그 자동 주입):
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {modalNicheSeeds.map((seed) => {
                    const isSelected = selectedModalNicheTag === seed.value;
                    return (
                      <button
                        key={seed.value}
                        type="button"
                        onClick={() => handleModalNicheClick(seed)}
                        className={`px-2 py-1 rounded-lg text-[10.5px] font-medium transition-all border flex items-center gap-1 text-left ${
                          isSelected
                            ? 'bg-gradient-to-r from-fuchsia-600 to-purple-600 border-fuchsia-400 text-white font-bold shadow-[0_0_10px_rgba(217,70,239,0.5)] scale-105'
                            : 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-200 hover:text-white hover:bg-fuchsia-500/20'
                        }`}
                      >
                        <span className="truncate max-w-[220px]">{seed.label}</span>
                        {isSelected && <Check className="w-3 h-3 text-fuchsia-200 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
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
                          disabled={isAnalyzingImage}
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
                      disabled={isAnalyzingImage}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => analyzeImagesForMusic(refImages)}
                    disabled={isAnalyzingImage}
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
                  placeholder="예: 비 내리는 늦은 밤, 어두운 방 창가에 앉아 마시는 따뜻한 커피와 깊은 생각 (자세할수록 고품질 컨셉이 생성됩니다)"
                  maxLength={50}
                  disabled={isReadOnly || isAnalyzingText}
                />
                {name.trim().length > 0 && !isReadOnly && (
                  <button
                    type="button"
                    onClick={analyzeTextForMusic}
                    disabled={isAnalyzingText || isAnalyzingImage}
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
                <span>시간, 날씨, 장소, 현재 느끼는 감정 등을 상세히 묘사할수록 더욱 환상적인 컨셉과 음악이 디자인됩니다.</span>
              </p>
            </div>

            {/* 음악 장르 */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 font-mono">
                음악 장르 (Genre)
              </label>
              <input 
                type="text" 
                value={inferredGenre}
                onChange={e => setInferredGenre(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[15px] font-normal text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500/50 transition-colors disabled:opacity-75"
                placeholder="예: Lofi, Jazz Lullaby, Ambient Synth"
                maxLength={50}
                disabled={isReadOnly}
              />
            </div>

            {/* 설명 */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5 font-mono font-bold">
                * 컨셉 설명 (300자 이내)
              </label>
              <textarea 
                value={desc}
                onChange={e => handleDescChange(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[15px] font-normal text-zinc-400 placeholder-zinc-600 focus:outline-none focus:border-fuchsia-500/50 transition-colors h-24 resize-y leading-normal font-sans disabled:opacity-75"
                placeholder="예: 비스듬히 내리쬐는 주황빛 노을빛이 창틀에 스며들고, 오래된 나무 책상 위에 놓인 따뜻한 홍차에서 피어오르는 온기가 아늑한 실내를 감싸 안습니다. 낡은 LP 턴테이블이 만드는 미세한 먼지 노이즈와 은은한 일렉트릭 피아노의 리버브 선율이 조화롭게 섞여 들어가며, 일상에 지쳐있던 마음을 어루만져 주는 편안하고 노스탤지어 가득한 로파이 BGM입니다."
                maxLength={300}
                disabled={isReadOnly}
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
                disabled={isReadOnly}
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
                  ) : thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 filter brightness-[0.85]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                      <span className="text-zinc-700 text-[10px] font-mono">이미지 없음</span>
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
                onClick={handleSave}
                disabled={isAnalyzingImage || isAnalyzingText}
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
