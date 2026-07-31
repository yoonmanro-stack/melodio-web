import React, { useId } from 'react'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
}

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  const uniqueId = useId()
  // 특수 문자 콜론(:)이 포함된 useId의 기본 반환값을 SVG ID 규격에 안전한 영문자와 대시 조합으로 변환
  const safeId = uniqueId.replace(/[^a-zA-Z0-9-]/g, '')

  // 사이즈별 크기 정의 (TailwindCSS에 부합하도록 유효한 클래스 규격으로 정정)
  const dimensions = {
    sm: { box: 'w-8 h-8', symbol: 'w-7 h-7', text: 'text-lg' },
    md: { box: 'w-10 h-10', symbol: 'w-9 h-9', text: 'text-2xl' },
    lg: { box: 'w-12 h-12', symbol: 'w-11 h-11', text: 'text-3xl' },
    xl: { box: 'w-16 h-16', symbol: 'w-14 h-14', text: 'text-4xl' },
  }

  const current = dimensions[size]

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      {/* 1. 마크 (찌그러진 타원을 없애고 완벽한 정원(Perfect Circle) 형태의 3D 입체 에메랄드 옥반지 구현) */}
      <div className={`${current.box} flex items-center justify-center relative`}>
        {/* 영롱하게 빛나는 3D 에메랄드 정원(Circle) 고리 SVG */}
        <svg 
          viewBox="0 0 100 100" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg" 
          style={{ width: size === 'sm' ? '28px' : size === 'md' ? '36px' : size === 'lg' ? '44px' : '56px', height: size === 'sm' ? '28px' : size === 'md' ? '36px' : size === 'lg' ? '44px' : '56px' }}
          className="drop-shadow-[0_3px_6px_rgba(4,120,87,0.45)] transition-transform duration-500 hover:scale-105"
        >
          <defs>
            {/* 정원 형태의 에메랄드 옥(Jade) 3D 질감 그라데이션 */}
            <linearGradient id={`emeraldMainCircle-${safeId}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a7f3d0" /> {/* 투명한 옥빛 */}
              <stop offset="40%" stopColor="#34d399" />
              <stop offset="75%" stopColor="#059669" />
              <stop offset="100%" stopColor="#047857" /> {/* 깊은 에메랄드 */}
            </linearGradient>

            {/* 3D 깊이와 반대편 그림자를 잡기 위한 다크 에메랄드 */}
            <linearGradient id={`emeraldDarkCircle-${safeId}`} x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#064e3b" /> {/* 깊은 옥 음영 */}
              <stop offset="50%" stopColor="#047857" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>

            {/* 옥반지 상단의 반짝이는 유리질 하이라이트 광원 */}
            <linearGradient id={`jadeHighlightCircle-${safeId}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#e6fbf4" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </linearGradient>
            
            {/* 에메랄드 아우라 광채 필터 */}
            <filter id={`emeraldGlowCircle-${safeId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 3D 뒤쪽 고리 몸통 (에메랄드의 은은하고 깊은 내부 음영 연출) */}
          <circle 
            cx="50" 
            cy="50" 
            r="32" 
            stroke={`url(#emeraldDarkCircle-${safeId})`} 
            strokeWidth="16" 
            className="opacity-95"
          />

          {/* 3D 앞쪽 입체 루프 (눈앞에 튀어나와 투명하게 빛나는 정원 바디) */}
          <path 
            d="M 18 50 A 32 32 0 1 1 82 50 A 32 32 0 0 1 18 50" 
            stroke={`url(#emeraldMainCircle-${safeId})`} 
            strokeWidth="15" 
            strokeLinecap="round"
            filter={`url(#emeraldGlowCircle-${safeId})`}
          />

          {/* 옥반지 상단 광택 하이라이트 (원형 구 표면의 반사 효과 극대화) */}
          <path 
            d="M 22 36 A 32 32 0 0 1 78 36" 
            stroke={`url(#jadeHighlightCircle-${safeId})`} 
            strokeWidth="5" 
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* 2. 영문로고 (자간을 좁히고 두께를 극대화한 오리지널 고급 메탈릭 타이포 매칭) */}
      {showText && (
        <span 
          className={`${current.text} font-black tracking-tight bg-gradient-to-b from-[#ffffff] via-[#e4e4e7] to-[#9f9fa7] bg-clip-text text-transparent drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)] font-sans uppercase`}
          style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
        >
          MELODIO
        </span>
      )}
    </div>
  )
}
