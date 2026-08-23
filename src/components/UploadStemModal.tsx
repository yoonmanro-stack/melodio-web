'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, X, Music, Sparkles, Loader2, CheckCircle2, AlertCircle, FileAudio } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface UploadStemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (generationId: string) => void;
}

export default function UploadStemModal({ isOpen, onClose, onSuccess }: UploadStemModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    setErrorMsg(null);
    if (!selectedFile.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(selectedFile.name)) {
      setErrorMsg('MP3, WAV, M4A, AAC 등 오디오 파일만 업로드 가능합니다.');
      return;
    }
    if (selectedFile.size > 80 * 1024 * 1024) {
      setErrorMsg('파일 크기는 최대 80MB 이하만 가능합니다.');
      return;
    }
    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsUploading(true);
    setErrorMsg(null);
    setUploadStep('1/3. 안전한 직통 업로드 링크 생성 중...');

    try {
      // 1. Vercel 서버리스 4.5MB 제한 우회를 위한 서명된 업로드 URL 요청 (소형 JSON)
      const prepResp = await fetch('/api/stems/prepare-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
        }),
      });

      let prepData;
      try {
        prepData = await prepResp.json();
      } catch {
        throw new Error('업로드 서버와 통신할 수 없습니다.');
      }

      if (!prepResp.ok || !prepData.success) {
        throw new Error(prepData.error || '업로드 세션 생성 실패');
      }

      setUploadStep('2/3. 클라우드 스토리지로 직접 업로드 중... (초고속 전송)');

      // 2. 브라우저에서 Supabase Storage로 직접 스트리밍 업로드 (대용량 파일 100% 지원)
      const { path, token, signedUrl } = prepData;
      
      let uploadSuccess = false;
      const { error: uploadError } = await supabase.storage
        .from('melodio-assets')
        .uploadToSignedUrl(path, token, file, {
          contentType: file.type || 'audio/mpeg',
        });

      if (!uploadError) {
        uploadSuccess = true;
      } else {
        // Fallback: fetch PUT directly to signedUrl
        console.warn('[UploadStemModal] SDK uploadToSignedUrl failed, trying fetch PUT fallback:', uploadError.message);
        const putResp = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'audio/mpeg' },
          body: file,
        });
        if (putResp.ok) {
          uploadSuccess = true;
        } else {
          throw new Error('스토리지 직접 업로드 실패: ' + uploadError.message);
        }
      }

      setUploadStep('3/3. AI 4채널 스템 분리 큐에 등록 중...');

      // 3. 서버에 DB 등록 및 맥미니 Demucs 워커 큐 진입
      const confirmResp = await fetch('/api/stems/confirm-and-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId: prepData.generationId,
          path: prepData.path,
          title: title.trim() || file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          fileSize: file.size,
        }),
      });

      let confirmData;
      try {
        confirmData = await confirmResp.json();
      } catch {
        throw new Error('분리 큐 등록 응답 처리 실패');
      }

      if (!confirmResp.ok || !confirmData.success) {
        throw new Error(confirmData.error || '분리 큐 등록 실패');
      }

      setUploadStep('✨ 4채널 스템 분리 큐 진입 완료! 스템 플레이어로 이동합니다.');
      
      setTimeout(() => {
        setIsUploading(false);
        setFile(null);
        setTitle('');
        setUploadStep('');
        onSuccess(prepData.generationId);
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('[UploadStemModal] error:', err);
      setErrorMsg(err.message || '오디오 업로드 중 오류가 발생했습니다.');
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
        {/* 백드롭 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={!isUploading ? onClose : undefined}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* 모달 창 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg rounded-2xl bg-zinc-950 border border-white/10 p-6 shadow-2xl overflow-hidden z-10"
          style={{
            boxShadow: '0 0 50px rgba(192,38,211,0.15), 0 0 100px rgba(6,182,212,0.1)',
          }}
        >
          {/* 닫기 버튼 */}
          {!isUploading && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* 헤더 */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                내 오디오 업로드 & 4채널 스템 분리
              </h3>
              <p className="text-xs text-zinc-400">
                보컬 제거(MR), 드럼/베이스 추출, 아카펠라 분리를 100% 무료로 실행합니다.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 드래그앤드롭 영역 */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                isDragOver
                  ? 'border-fuchsia-500 bg-fuchsia-500/10'
                  : file
                  ? 'border-cyan-500/40 bg-cyan-500/5'
                  : 'border-white/10 hover:border-white/20 bg-white/[0.02]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              {file ? (
                <div className="flex items-center justify-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center flex-shrink-0">
                    <FileAudio className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{file.name}</p>
                    <p className="text-xs text-zinc-400">{(file.size / (1024 * 1024)).toFixed(2)} MB · 준비 완료</p>
                  </div>
                  <span className="text-[11px] text-cyan-400 font-semibold px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/20">
                    변경
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-full bg-white/5 flex items-center justify-center text-zinc-400">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-zinc-200">
                    여기로 MP3 또는 WAV 파일을 끌어다 놓으세요
                  </p>
                  <p className="text-xs text-zinc-500">
                    또는 클릭하여 파일 선택 (최대 50MB · 가요/팝송/MR/보컬)
                  </p>
                </div>
              )}
            </div>

            {/* 곡 제목 입력 */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                곡 제목 (트랙명)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: My Favorite Song (Original Mix)"
                disabled={isUploading}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-fuchsia-500 transition-colors"
              />
            </div>

            {/* 에러 메시지 */}
            {errorMsg && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 상태 알림 및 진행 피드백 */}
            {isUploading && (
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-fuchsia-400 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {uploadStep}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 animate-pulse w-full rounded-full" />
                </div>
                <p className="text-[11px] text-zinc-500">
                  ※ 업로드 완료 후 맥미니 Demucs AI가 4채널 분리를 백그라운드에서 실시간 처리합니다.
                </p>
              </div>
            )}

            {/* 제출 버튼 */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading}
                className="w-1/3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!file || isUploading}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 hover:from-fuchsia-500 hover:to-cyan-400 text-white text-xs font-bold shadow-lg shadow-fuchsia-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>처리 중...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>4채널 스템 분리 시작</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
