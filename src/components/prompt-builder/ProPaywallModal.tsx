'use client'

import { Crown, Check, X, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ProPaywallModalProps {
  isOpen: boolean
  onClose: () => void
  feature?: 'presets' | 'stems'
}

export default function ProPaywallModal({ isOpen, onClose, feature }: ProPaywallModalProps) {
  const router = useRouter()

  if (!isOpen) return null

  const handleGoToPricing = () => {
    onClose()
    router.push('/settings')
  }

  // 1. 클릭한 기능에 따라 맞춤 상단 배너 노출
  const getBannerInfo = () => {
    switch (feature) {
      case 'presets':
        return {
          title: '커스텀 프리셋 만들기',
          desc: '장르 조합, 가사 구조, 악기 구성까지 나만의 시그니처 템플릿을 저장하는 기능은 PRO 요금제 전용입니다.'
        }
      case 'stems':
        return {
          title: '멀티트랙 음원 분리 (Split Stems)',
          desc: '완성된 음원에서 보컬, 드럼, 베이스, 멜로디 파트를 각각 4개 트랙으로 분리·추출하는 기능은 PRO 요금제 전용입니다.'
        }
      default:
        return {
          title: 'PRO 멤버십 전용 기능',
          desc: '더 많은 작곡 크레딧과 상업용 BGM 자동화 도구를 무제한으로 사용하세요.'
        }
    }
  }

  const banner = getBannerInfo()

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        className="w-full max-w-lg bg-zinc-950 border border-amber-500/20 rounded-2xl p-6 shadow-2xl relative text-center space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 왕관 아이콘 */}
        <div className="w-12 h-12 mx-auto bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/10">
          <Crown className="w-6 h-6 text-black fill-black" />
        </div>

        {/* 헤더 */}
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-amber-400 tracking-wide font-mono flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>PRO Creator 플랜 혜택</span>
          </h3>
          
          {/* 특정 클릭 피처 하이라이트 배너 */}
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 text-left mt-2">
            <h4 className="text-xs font-bold text-amber-300 mb-1">💡 {banner.title} 안내</h4>
            <p className="text-[11px] text-zinc-400 leading-relaxed">{banner.desc}</p>
          </div>
        </div>

        {/* 비교 테이블 */}
        <div className="border border-white/5 rounded-xl overflow-hidden bg-white/[0.01]">
          <div className="grid grid-cols-3 bg-white/5 p-2 text-xs font-bold text-zinc-400 border-b border-white/5 text-center">
            <div>혜택 구분</div>
            <div>Free Tier</div>
            <div className="text-amber-400">PRO Creator</div>
          </div>
          
          <div className="divide-y divide-white/5 text-[11px] text-zinc-300">
            {/* 크레딧 */}
            <div className="grid grid-cols-3 p-2.5 items-center text-center">
              <div className="font-semibold text-left pl-2">월간 크레딧</div>
              <div className="text-zinc-500">1,000 Credits</div>
              <div className="font-bold text-white">10,000 Credits</div>
            </div>
            
            {/* 저장 공간 */}
            <div className="grid grid-cols-3 p-2.5 items-center text-center">
              <div className="font-semibold text-left pl-2">클라우드 저장소</div>
              <div className="text-zinc-500">1 GB</div>
              <div className="font-bold text-white">10 GB (여유로운 보관)</div>
            </div>

            {/* 커스텀 프리셋 */}
            <div className="grid grid-cols-3 p-2.5 items-center text-center">
              <div className="font-semibold text-left pl-2">커스텀 프리셋</div>
              <div className="text-zinc-500">미지원</div>
              <div className="font-bold text-fuchsia-400">지원 (최대 10개)</div>
            </div>

            {/* 음원 분리 */}
            <div className="grid grid-cols-3 p-2.5 items-center text-center">
              <div className="font-semibold text-left pl-2">음원 분리(Stems)</div>
              <div className="text-zinc-500">미지원</div>
              <div className="font-bold text-cyan-400">무제한 이용 (추출 무료)</div>
            </div>

            {/* 유튜브 최적화 */}
            <div className="grid grid-cols-3 p-2.5 items-center text-center">
              <div className="font-semibold text-left pl-2">유튜브 메타데이터</div>
              <div className="text-zinc-500">미지원</div>
              <div className="font-bold text-white">AI 자동완성 패키지</div>
            </div>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex flex-col gap-2 pt-1">
          <button 
            onClick={handleGoToPricing}
            className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-bold rounded-xl shadow-lg shadow-amber-500/5 hover:shadow-amber-500/10 active:scale-98 transition-all"
          >
            PRO 플랜 업그레이드 하기
          </button>
          <button 
            onClick={onClose}
            className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white text-xs font-semibold rounded-xl transition-all"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
