'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Hexagon, Sparkles, Globe, Heart } from 'lucide-react'
import Link from 'next/link'
import { Logo } from './Logo'

interface Slide {
  id: number
  icon: React.ReactNode
  title: string
  desc: string
  element?: React.ReactNode
}

export default function AuthSlider() {
  const [current, setCurrent] = useState(0)

  const slides: Slide[] = [
    {
      id: 0,
      icon: <Hexagon className="w-12 h-12 text-cyan-400 animate-pulse" />,
      title: 'Welcome back,\nMaestro.',
      desc: 'Sign in to orchestrate your virtual artists and automate your music empire.',
      element: (
        <div className="flex gap-2 justify-center mt-6">
          <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-cyan-300 font-mono">
            🎹 Synthesizers
          </div>
          <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-fuchsia-300 font-mono">
            🥁 Drum Machines
          </div>
        </div>
      )
    },
    {
      id: 1,
      icon: <Sparkles className="w-12 h-12 text-fuchsia-400" />,
      title: 'Step 1:\nYour First Artist',
      desc: 'After signing up, you will be guided to construct your first Virtual Artist Persona using our AI Architect.',
      element: (
        <div className="flex -space-x-2.5 justify-center mt-6">
          <div className="w-11 h-11 rounded-full border-2 border-[#302b63] bg-fuchsia-950 flex items-center justify-center text-xs font-semibold text-fuchsia-300 shadow-md">Vibe</div>
          <div className="w-11 h-11 rounded-full border-2 border-[#302b63] bg-purple-950 flex items-center justify-center text-xs font-semibold text-purple-300 shadow-md">Voice</div>
          <div className="w-11 h-11 rounded-full border-2 border-[#302b63] bg-cyan-950 flex items-center justify-center text-xs font-semibold text-cyan-300 shadow-md">Lore</div>
        </div>
      )
    },
    {
      id: 2,
      icon: <Globe className="w-12 h-12 text-emerald-400" />,
      title: '🎌 Japan Market\nEarly Access',
      desc: "Take over the world's 2nd largest music market. Create J-Lofi, City Pop, and Tokyo Jazz playlist compilations instantly.",
      element: (
        <div className="flex gap-3 justify-center mt-6 text-xl">
          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>🌸</span>
          <span className="animate-bounce" style={{ animationDelay: '200ms' }}>🗼</span>
          <span className="animate-bounce" style={{ animationDelay: '400ms' }}>🎷</span>
          <span className="animate-bounce" style={{ animationDelay: '600ms' }}>🎧</span>
        </div>
      )
    }
  ]

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length)
    }, 4500)
    return () => clearInterval(timer)
  }, [slides.length])

  return (
    <div className="bg-gradient-to-br from-[#0f0c29] via-[#201d4a] to-[#24243e] p-10 flex flex-col justify-between relative overflow-hidden h-full">
      {/* 백그라운드 노이즈 텍스처 */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-25 mix-blend-overlay pointer-events-none"></div>

      <Link href="/" className="z-10 block">
        <Logo size="md" />
      </Link>

      {/* 캐러셀 영역 */}
      <div className="z-10 flex-1 flex flex-col justify-center max-w-sm mx-auto w-full text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="space-y-6"
          >
            {/* 아이콘 */}
            <div className="flex justify-center">{slides[current].icon}</div>
            
            {/* 제목 & 설명 */}
            <div className="space-y-3">
              <h2 className="text-3xl font-black text-white leading-tight whitespace-pre-line tracking-tight">
                {slides[current].title}
              </h2>
              <p className="text-zinc-300 text-sm leading-relaxed px-2">
                {slides[current].desc}
              </p>
            </div>

            {/* 카드별 커스텀 엘리먼트 */}
            {slides[current].element}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 슬라이드 인디케이터 도트 */}
      <div className="z-10 flex justify-center gap-2 mt-auto">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              current === idx ? 'w-6 bg-fuchsia-500' : 'w-1.5 bg-white/20 hover:bg-white/40'
            }`}
            title={`슬라이드 ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
