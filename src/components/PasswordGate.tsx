'use client';

import { useState, useEffect } from 'react';
import { Logo } from './Logo';

// 🔒 오픈 전 비공개 비밀번호 게이트
const SITE_PASSWORD = 'Melodio2026!';
const STORAGE_KEY = 'melodio_gate_pass';

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedPass = localStorage.getItem(STORAGE_KEY);
      if (savedPass === SITE_PASSWORD) {
        setAuthenticated(true);
        // 백엔드 API 미들웨어 검증용 브라우저 쿠키 강제 싱크
        if (!document.cookie.includes(`${STORAGE_KEY}=${SITE_PASSWORD}`)) {
          document.cookie = `${STORAGE_KEY}=${SITE_PASSWORD}; path=/; max-age=31536000; SameSite=Lax; Secure`;
        }
      } else {
        setAuthenticated(false);
      }
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === SITE_PASSWORD) {
      localStorage.setItem(STORAGE_KEY, SITE_PASSWORD);
      // 백엔드 API 미들웨어 검증용 브라우저 쿠키 세팅 (1년 만료)
      document.cookie = `${STORAGE_KEY}=${SITE_PASSWORD}; path=/; max-age=31536000; SameSite=Lax; Secure`;
      setAuthenticated(true);
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  if (authenticated === null) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: '#07070a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#c084fc',
        fontWeight: 'bold',
        fontFamily: "monospace",
        letterSpacing: '1px',
      }}>
        <span style={{ animation: 'pulse 1.5s infinite' }}>LOADING MELODIO GATE...</span>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
          }
        `}</style>
      </div>
    );
  }

  if (authenticated) return <>{children}</>;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#07070a',
      fontFamily: "'Inter', 'Pretendard', sans-serif",
      overflowY: 'auto',
      padding: '24px 16px',
      boxSizing: 'border-box',
    }}>
      {/* 화려한 뒷배경 오로라 광원 */}
      <div style={{
        position: 'absolute',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(236,72,153,0.12) 0%, rgba(139,92,246,0.06) 50%, transparent 100%)',
        filter: 'blur(80px)',
        pointerEvents: 'none',
        zIndex: -1,
      }} />

      <div style={{
        width: '100%',
        maxWidth: '480px',
        textAlign: 'center',
        animation: 'fadeIn 0.6s ease-out',
      }}>
        
        {/* Logo & Branding */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '32px',
        }}>
          <Logo size="lg" />
          <p style={{
            margin: 0,
            fontSize: '11px',
            color: 'rgba(244,114,182,0.5)',
            fontWeight: 800,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            fontFamily: 'monospace',
          }}>
            Global AI Music Label SaaS
          </p>
        </div>

        {/* Glassmorphism Card */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.015)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '24px',
          padding: '40px 32px',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          animation: shake ? 'shake 0.5s ease-in-out' : undefined,
          boxSizing: 'border-box',
        }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{
              alignSelf: 'center',
              padding: '4px 12px',
              borderRadius: '9999px',
              background: 'rgba(244,114,182,0.1)',
              border: '1px solid rgba(244,114,182,0.2)',
              fontSize: '10px',
              fontWeight: 900,
              color: '#f472b6',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              fontFamily: 'monospace',
            }}>
              Development Phase
            </span>
            <h2 style={{
              margin: '8px 0 0 0',
              fontSize: '20px',
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '-0.5px',
            }}>
              비공개 베타 테스트 진행 중
            </h2>
          </div>

          <p style={{
            margin: 0,
            fontSize: '13px',
            color: 'rgba(245, 240, 232, 0.7)',
            lineHeight: '1.6',
            fontWeight: 500,
          }}>
            멜로디오의 AI 음악 생성 엔진 및 영상 자동화 플랫폼 빌드 검증을 위해 외부 접근을 통제하고 있습니다.<br />
            보안 서약이 완료된 관계자 전용 패스코드를 사용해 주십시오.
          </p>

          <div style={{
            height: '1px',
            background: 'rgba(255, 255, 255, 0.08)',
            margin: '4px 0',
          }} />

          {/* Form */}
          <form onSubmit={handleSubmit} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            textAlign: 'left',
          }}>
            <p style={{
              margin: 0,
              fontSize: '11px',
              color: 'rgba(245, 240, 232, 0.4)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}>
              🔑 테스터 전용 패스코드 인증
            </p>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                placeholder="패스코드를 입력해 주십시오."
                autoFocus
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: '16px',
                  border: `1px solid ${error ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                  background: 'rgba(15, 15, 18, 0.8)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 650,
                  outline: 'none',
                  transition: 'all 0.2s',
                  boxSizing: 'border-box',
                }}
              />

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '16px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 8px 16px rgba(236, 72, 153, 0.15)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                게이트 진입 🚀
              </button>
            </div>

            {error && (
              <p style={{
                margin: 0,
                color: '#ef4444',
                fontSize: '12px',
                fontWeight: 700,
                animation: 'shake 0.5s ease-in-out',
              }}>
                ❌ 올바르지 않은 패스코드입니다.
              </p>
            )}
          </form>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '32px',
          fontSize: '10px',
          color: 'rgba(245, 240, 232, 0.3)',
          fontWeight: 700,
          fontFamily: 'monospace',
          letterSpacing: '0.5px',
        }}>
          Melodio v0.1.0 © 2026. All rights reserved.
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}
