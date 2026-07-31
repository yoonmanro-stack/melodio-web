'use client'

// 멜로디오 전역 단일 음원 재생 관리자 (Global Singleton Audio Manager)
let activeAudioInstance: HTMLAudioElement | null = null
let activeStopCallback: (() => void) | null = null

export function registerActiveAudio(audio: HTMLAudioElement, stopCb?: () => void) {
  if (typeof window === 'undefined') return

  // 이전에 재생 중이던 오디오가 있다면 일시정지 및 UI 상태 초기화
  if (activeAudioInstance && activeAudioInstance !== audio) {
    try {
      activeAudioInstance.pause()
    } catch {
      // ignore
    }
    if (activeStopCallback) {
      try {
        activeStopCallback()
      } catch {
        // ignore
      }
    }
  }

  activeAudioInstance = audio
  activeStopCallback = stopCb || null

  window.dispatchEvent(new CustomEvent('melodio-audio-started', { detail: { audio } }))
}

export function stopActiveAudio() {
  if (typeof window === 'undefined') return

  if (activeAudioInstance) {
    try {
      activeAudioInstance.pause()
    } catch {
      // ignore
    }
    activeAudioInstance = null
  }
  if (activeStopCallback) {
    try {
      activeStopCallback()
    } catch {
      // ignore
    }
    activeStopCallback = null
  }
  window.dispatchEvent(new CustomEvent('melodio-audio-stopped'))
}
