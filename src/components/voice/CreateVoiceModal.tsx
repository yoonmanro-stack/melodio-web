"use client";

import React, { useState, useRef, useEffect } from "react";
import { useVoice, VoiceItem } from "@/contexts/VoiceContext";
import { buildVoicePromptFromAttributes } from "@/lib/voice-dna-scrubber";
import {
  Mic,
  MicOff,
  Upload,
  Sliders,
  Music,
  Play,
  Pause,
  X,
  Check,
  Sparkles,
  ArrowLeft,
  Wand2,
  Activity,
  CheckCircle2,
  Info,
  Save,
  FolderOpen
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// AI 음색/창법 프리셋 템플릿
const VOCAL_TIMBRE_PRESETS = [
  {
    id: "crystal_soprano",
    label: "✨ 맑고 청아한 고음 소프라노 (아이유/태연 스타일)",
    gender: "female" as const,
    prompt: "female vocals, crystal clear soprano highs, bell-like pure vocal clarity, delicate breathy head resonance, emotional intimate delivery, warm acoustic plate reverb, pristine studio recording",
    tags: ["Soprano", "Pure", "Clean", "Airy"],
  },
  {
    id: "husky_rock",
    label: "🎸 허스키 빈티지 록 바리톤 (YB/국카스텐 스타일)",
    gender: "male" as const,
    prompt: "male vocals, raw powerful rock baritone, vintage gravelly distortion, aggressive chest resonance, raspy vocal fry, dynamic emotional delivery, vintage analog warmth",
    tags: ["Rock", "Raspy", "Gravelly", "Powerful"],
  },
  {
    id: "warm_ballad_tenor",
    label: "☕ 감미로운 감성 테너 (성시경/폴킴 스타일)",
    gender: "male" as const,
    prompt: "male vocals, warm velvety mid-range tenor, sweet acoustic chest resonance, smooth breathy vocal texture, heartfelt intimate delivery, close-mic proximity effect",
    tags: ["Ballad", "Warm", "Velvet", "Intimate"],
  },
  {
    id: "trendy_kpop",
    label: "⚡ 트렌디 하이톤 팝 보컬 (뉴진스/에스파 스타일)",
    gender: "female" as const,
    prompt: "female vocals, bright energetic trendy pop timbre, crisp head resonance, playful dynamic cadence, modern pop vocal compression, polished autotuned sheen, tight dry mix",
    tags: ["K-Pop", "Trendy", "Bright", "Harmonies"],
  },
  {
    id: "dreamy_rnb",
    label: "🌙 몽환적 위스퍼 R&B (딘/SZA 스타일)",
    gender: "female" as const,
    prompt: "female vocals, lush sensual R&B timbre, breathy head-voice falsetto, smooth melodic runs, neo-soul vocal layering, intimate warm resonance, silky dry mix",
    tags: ["R&B", "Falsetto", "Neo-Soul", "Silky"],
  },
];

interface AudioAnalysisData {
  gender: "female" | "male";
  vocalRange: string;
  timbre: string;
  language: string;
  physicalLayers: {
    pitch: number;
    brightness: number;
    chest: number;
    head: number;
    breathiness: number;
    vibrato: number;
    reverb: number;
    clarity: number;
    raspiness: number;
  };
  tags: string[];
  stylePrompt: string;
  summary: string;
  sunoAdvice: string;
}

export function CreateVoiceModal() {
  const { isCreateModalOpen, closeCreateModal, addVoice, updateVoice, voices, activeVoice, openVoiceModal } = useVoice();
  const [mode, setMode] = useState<"record" | "upload" | "dna" | "extract">("record");
  const [loadedVoiceId, setLoadedVoiceId] = useState<string | null>(null);

  // 공통 폼 필드
  const [voiceName, setVoiceName] = useState("");
  const [voiceDesc, setVoiceDesc] = useState("");
  const [gender, setGender] = useState<"female" | "male" | "duet">("female");
  const [language, setLanguage] = useState("Korean");
  const [tagsInput, setTagsInput] = useState("Pop, Tender, Soprano");
  const [selectedTimbreId, setSelectedTimbreId] = useState<string>("crystal_soprano");

  // AI 오디오 음향 DNA 분석 상태
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
  const [analysisData, setAnalysisData] = useState<AudioAnalysisData | null>(null);

  // [1. 녹음 모드 상태]
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // [2. 업로드 모드 상태]
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // [3. DNA 슬라이더 모드 상태]
  const [sliders, setSliders] = useState({
    pitch: 75,
    brightness: 80,
    chest: 50,
    head: 70,
    breathiness: 40,
    airiness: 60,
    roughness: 20,
    warmth: 70,
    vibrato: 50,
  });

  // [4. 내 음원 추출 모드 상태]
  const [myTracks, setMyTracks] = useState<Array<{ id: string; title: string; audio_url: string; style_prompt?: string }>>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);

  // 미리듣기 오디오 ref
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isCreateModalOpen && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    }
  }, [isCreateModalOpen]);

  useEffect(() => {
    if (mode === "extract" && myTracks.length === 0) {
      setIsLoadingTracks(true);
      fetch("/api/generations?limit=10")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setMyTracks(data);
          } else if (data?.data && Array.isArray(data.data)) {
            setMyTracks(data.data);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingTracks(false));
    }
  }, [mode, myTracks.length]);

  if (!isCreateModalOpen) return null;

  // --- AI 오디오 음향 정밀 분석 실행기 ---
  const analyzeAudioSource = async (fileOrBlob: File | Blob, defaultName?: string) => {
    setIsAnalyzingAudio(true);
    try {
      const fd = new FormData();
      fd.append("file", fileOrBlob, (fileOrBlob as File).name || "vocal_source.wav");
      fd.append("gender", gender);
      fd.append("pitch", String(sliders.pitch));
      fd.append("brightness", String(sliders.brightness));

      const res = await fetch("/api/voice/analyze-audio", {
        method: "POST",
        body: fd,
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.analysis) {
          const a: AudioAnalysisData = json.analysis;
          setAnalysisData(a);
          setGender(a.gender);
          setLanguage(a.language || "Korean");
          if (a.gender === "male") {
            setSelectedTimbreId("warm_ballad_tenor");
          } else {
            setSelectedTimbreId("crystal_soprano");
          }
          if (a.tags && a.tags.length > 0) {
            setTagsInput(a.tags.join(", "));
          }
          if (a.summary) {
            setVoiceDesc(a.summary);
          }
          if (!voiceName) {
            setVoiceName(defaultName || `내 음색 (${a.vocalRange})`);
          }
          if (a.physicalLayers) {
            setSliders((prev) => ({
              ...prev,
              pitch: a.physicalLayers.pitch || prev.pitch,
              brightness: a.physicalLayers.brightness || prev.brightness,
              chest: a.physicalLayers.chest || prev.chest,
              head: a.physicalLayers.head || prev.head,
              breathiness: a.physicalLayers.breathiness || prev.breathiness,
              roughness: a.physicalLayers.raspiness || prev.roughness,
              vibrato: a.physicalLayers.vibrato || prev.vibrato,
            }));
          }
        }
      }
    } catch (err) {
      console.error("AI audio analysis failed:", err);
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  // --- 녹음 핸들러 ---
  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(url);
        // 녹음 완료 시 AI 음향 DNA 자동 분석 발동
        analyzeAudioSource(audioBlob, "내 마이크 녹음 보컬");
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordDuration(0);

      timerRef.current = setInterval(() => {
        setRecordDuration((prev) => {
          if (prev >= 30) {
            stopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      alert("마이크 접근 권한이 필요합니다.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  // --- 파일 업로드 핸들러 ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      const url = URL.createObjectURL(file);
      setUploadedAudioUrl(url);
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      if (!voiceName) {
        setVoiceName(baseName);
      }
      // 파일 업로드 즉시 AI 음향 DNA 정밀 분석 발동
      analyzeAudioSource(file, baseName);
    }
  };

  // --- 미리듣기 재생/정지 ---
  const togglePlayPreview = (url: string) => {
    if (isPlayingPreview) {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
      }
      previewAudioRef.current.src = url;
      previewAudioRef.current.play().catch(() => {});
      previewAudioRef.current.onended = () => setIsPlayingPreview(false);
      setIsPlayingPreview(true);
    }
  };

  // --- 기존 보이스 불러오기 핸들러 ---
  const handleLoadExistingVoice = (v: VoiceItem) => {
    setLoadedVoiceId(v.id);
    setVoiceName(v.name);
    setVoiceDesc(v.desc || "");
    setGender(v.gender);
    setLanguage(v.language || "Korean");
    setTagsInput((v.tags || []).join(", "));
    if (v.physicalLayers) {
      setSliders((prev) => ({
        ...prev,
        ...v.physicalLayers,
      }));
    }
    setMode("dna");
  };

  // --- 최종 제출 (Voice 생성 / 수정 완료) ---
  const handleSaveVoice = (overwrite: boolean = false) => {
    try {
      const finalName = voiceName.trim() || `${gender === "female" ? "Female" : "Male"} Voice #${Math.floor(Math.random() * 900 + 100)}`;
      const parsedTags = (tagsInput || "").split(",").map((t) => t.trim()).filter(Boolean);

      let stylePrompt = "";
      let finalAudioUrl = "";
      let sourceType: VoiceItem["sourceType"] = "dna_designed";

      const selectedTimbre = VOCAL_TIMBRE_PRESETS.find((t) => t.id === selectedTimbreId);

      if (mode === "record") {
        sourceType = "recorded";
        finalAudioUrl = recordedAudioUrl || "";
        if (analysisData?.stylePrompt) {
          stylePrompt = analysisData.stylePrompt;
        } else {
          const basePrompt = selectedTimbre ? selectedTimbre.prompt : `${gender} vocals, organic recorded acoustic timbre, clear close-mic delivery`;
          stylePrompt = `${basePrompt}${parsedTags.length > 0 ? `, ${parsedTags.join(", ")}` : ""}`;
        }
      } else if (mode === "upload") {
        sourceType = "uploaded";
        finalAudioUrl = uploadedAudioUrl || "";
        if (analysisData?.stylePrompt) {
          stylePrompt = analysisData.stylePrompt;
        } else {
          const basePrompt = selectedTimbre ? selectedTimbre.prompt : `${gender} vocals, high-fidelity acoustic vocal profile, detailed resonance`;
          stylePrompt = `${basePrompt}${parsedTags.length > 0 ? `, ${parsedTags.join(", ")}` : ""}`;
        }
      } else if (mode === "dna") {
        sourceType = "dna_designed";
        const dnaResult = buildVoicePromptFromAttributes({
          vd_code: `VD-${Date.now()}`,
          name: finalName,
          physical_layers: {
            gender,
            pitch: sliders.pitch,
            brightness: sliders.brightness,
            chest: sliders.chest,
            head: sliders.head,
          },
          textures: sliders.breathiness > 50 ? ["Breathy", "Airy"] : ["Warm", "Silky"],
          emotions: ["Emotional", "Passionate"],
          performance: {
            vibrato: sliders.vibrato,
          },
        });
        stylePrompt = dnaResult.tags;
      } else if (mode === "extract") {
        sourceType = "extracted";
        const selTrack = (myTracks || []).find((t) => t && t.id === selectedTrackId);
        finalAudioUrl = selTrack?.audio_url || "";
        stylePrompt = selTrack?.style_prompt || `${gender} vocals, studio master vocal extracted from hit track, ${parsedTags.join(", ")}`;
      }

      if (!stylePrompt) {
        stylePrompt = gender === "female"
          ? "female vocals, crystalline soprano highs, pure bell-like vocal clarity, warm acoustic resonance, intimate close-mic delivery"
          : "male vocals, warm velvety chest-dominant baritone, sweet acoustic resonance, smooth breathy vocal texture, heartfelt intimate delivery";
      }

      if (overwrite && loadedVoiceId) {
        updateVoice(loadedVoiceId, {
          name: finalName,
          desc: voiceDesc || `${language} ${gender} Vocalist`,
          gender,
          language,
          tags: parsedTags.length > 0 ? parsedTags : ["Custom", gender],
          stylePrompt,
          physicalLayers: sliders,
        });
      } else {
        const isUserVoice = mode === "upload" || mode === "record" || !!loadedVoiceId || finalName.includes("QR.Yoon");
        const saveName = overwrite ? finalName : (loadedVoiceId && !finalName.includes("v2") && !finalName.includes("튜닝") ? `${finalName} (v2)` : finalName);
        addVoice({
          name: saveName,
          desc: voiceDesc || `${language} ${gender} Vocalist (100% 육성 보컬)`,
          gender,
          language,
          tags: parsedTags.length > 0 ? parsedTags : ["Custom", gender],
          audioUrl: finalAudioUrl,
          sourceType,
          stylePrompt,
          isFavorite: true,
          voice_model_id: isUserVoice ? "qr_yoon" : undefined,
          is100PercentSync: isUserVoice,
          physicalLayers: mode === "dna" || analysisData ? sliders : undefined,
        });
      }

      // Reset state
      setLoadedVoiceId(null);
      setVoiceName("");
      setVoiceDesc("");
      setUploadedFile(null);
      setUploadedAudioUrl(null);
      setRecordedAudioUrl(null);
      setAnalysisData(null);

      closeCreateModal();

      if (typeof window !== "undefined" && !window.location.pathname.includes("voice-lab")) {
        openVoiceModal();
      }
    } catch (err) {
      console.error("Failed to create/update voice:", err);
      closeCreateModal();
    }
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-xl bg-[#141416] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                closeCreateModal();
                openVoiceModal();
              }}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">새 보컬(가수) 등록하기</h3>
              <p className="text-xs text-zinc-400">내 플레이리스트 음악에 사용할 보컬 목소리를 만듭니다</p>
            </div>
          </div>
          <button
            onClick={closeCreateModal}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Mode Selection Tabs */}
        <div className="px-6 mt-4">
          <div className="grid grid-cols-4 gap-1.5 p-1 bg-zinc-900/90 rounded-2xl border border-white/5">
            <button
              onClick={() => setMode("record")}
              className={`py-2 text-xs font-bold rounded-xl transition-all flex flex-col items-center gap-1 cursor-pointer ${
                mode === "record" ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>1. 직접 녹음</span>
            </button>
            <button
              onClick={() => setMode("upload")}
              className={`py-2 text-xs font-bold rounded-xl transition-all flex flex-col items-center gap-1 cursor-pointer ${
                mode === "upload" ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>2. 파일 올리기</span>
            </button>
            <button
              onClick={() => setMode("dna")}
              className={`py-2 text-xs font-bold rounded-xl transition-all flex flex-col items-center gap-1 cursor-pointer ${
                mode === "dna" ? "bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/30" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>3. 톤 직접 조절</span>
            </button>
            <button
              onClick={() => setMode("extract")}
              className={`relative py-2 text-xs font-bold rounded-xl transition-all flex flex-col items-center gap-1 cursor-pointer ${
                mode === "extract" ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Music className="w-4 h-4" />
              <span>4. 완성곡 추출</span>
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-gradient-to-r from-amber-400 to-orange-500 text-black text-[9px] font-extrabold rounded-full shadow">
                추천
              </span>
            </button>
          </div>
        </div>

        {/* Dynamic Studio Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
          {/* Mode 1: Record */}
          {mode === "record" && (
            <div className="p-5 rounded-2xl bg-gradient-to-b from-rose-950/20 to-zinc-900/60 border border-rose-500/20 text-center space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">마이크로 목소리 녹음하기</h4>
                <p className="text-xs text-zinc-400">10초~30초 동안 편안하게 노래나 멘트를 녹음해 주세요.</p>
              </div>

              <div className="flex flex-col items-center justify-center py-4">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                    isRecording
                      ? "bg-red-600 text-white animate-pulse ring-8 ring-red-500/20"
                      : "bg-gradient-to-br from-rose-500 to-orange-500 text-white hover:scale-105 shadow-xl shadow-rose-500/30"
                  }`}
                >
                  {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                </button>
                <div className="mt-3 font-mono text-sm font-bold text-zinc-300">
                  {isRecording ? `00:${recordDuration.toString().padStart(2, "0")} / 00:30` : recordedAudioUrl ? "녹음 완료 ✅" : "녹음 대기 중"}
                </div>
              </div>

              {recordedAudioUrl && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => togglePlayPreview(recordedAudioUrl)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold text-white flex items-center gap-2 hover:bg-zinc-700 cursor-pointer"
                  >
                    {isPlayingPreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    <span>녹음본 확인하기</span>
                  </button>
                  <button
                    onClick={() => {
                      setRecordedAudioUrl(null);
                      setRecordDuration(0);
                      setAnalysisData(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-white/5 text-xs text-zinc-400 hover:text-white cursor-pointer"
                  >
                    다시 녹음
                  </button>
                </div>
              )}

              {/* AI 음향 분석 안내/피드백 카드 */}
              {isAnalyzingAudio && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-left">
                  <Activity className="w-5 h-5 text-rose-400 animate-spin shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-rose-200">AI 음향 DNA 정밀 분석 중...</p>
                    <p className="text-[11px] text-zinc-400">성종, 기음 피치, 흉성/두성 공명, 질감 주파수를 추출하고 있습니다.</p>
                  </div>
                </div>
              )}

              {analysisData && (
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-left space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      AI 음향 DNA 분석 완료
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 font-bold">
                      {analysisData.vocalRange} ({analysisData.timbre})
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 font-medium">{analysisData.summary}</p>
                  <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-[11px] text-zinc-400 font-mono">
                    <span className="text-rose-400 font-bold">스타일 프롬프트: </span>
                    {analysisData.stylePrompt}
                  </div>
                </div>
              )}

              {/* 보컬 창법 스타일 매칭 */}
              <div className="pt-3 border-t border-white/5 text-left">
                <label className="text-[11px] font-bold text-rose-400 flex items-center gap-1 mb-2">
                  <Sparkles className="w-3 h-3" />
                  <span>내 목소리 톤 & 창법 스타일 보정 (AI 음색 역추출)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {VOCAL_TIMBRE_PRESETS.map((t) => {
                    const isSelected = selectedTimbreId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTimbreId(t.id);
                          setGender(t.gender);
                        }}
                        className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                          isSelected
                            ? "bg-rose-500/20 border-rose-500 text-rose-200 shadow-md shadow-rose-500/10 font-bold"
                            : "bg-black/30 border-white/5 text-zinc-400 hover:border-white/20 hover:text-white"
                        }`}
                      >
                        <div>{t.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: Upload */}
          {mode === "upload" && (
            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-white/5 text-center space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/10 hover:border-amber-500/50 rounded-2xl p-8 cursor-pointer transition-colors bg-zinc-900/40"
              >
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-white">오디오 파일 선택 또는 드래그</h4>
                <p className="text-xs text-zinc-400 mt-1">MP3, WAV, M4A, FLAC 파일 지원 (최대 30MB)</p>
                {uploadedFile && (
                  <p className="text-xs text-amber-400 font-bold mt-2">선택됨: {uploadedFile.name}</p>
                )}
              </div>

              {uploadedAudioUrl && (
                <button
                  onClick={() => togglePlayPreview(uploadedAudioUrl)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-xs font-bold text-white flex items-center gap-2 mx-auto hover:bg-zinc-700 cursor-pointer"
                >
                  {isPlayingPreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  <span>업로드 음원 재생</span>
                </button>
              )}

              {/* AI 음향 분석 안내/피드백 카드 */}
              {isAnalyzingAudio && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-left">
                  <Activity className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-amber-200">AI 음향 DNA 정밀 분석 중...</p>
                    <p className="text-[11px] text-zinc-400">성종, 기음 피치, 흉성/두성 공명, 질감 주파수를 추출하고 있습니다.</p>
                  </div>
                </div>
              )}

              {analysisData && (
                <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-left space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      AI 음향 DNA 분석 완료
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 font-bold">
                      {analysisData.vocalRange} ({analysisData.timbre})
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 font-medium">{analysisData.summary}</p>
                  <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-[11px] text-zinc-400 font-mono">
                    <span className="text-amber-400 font-bold">스타일 프롬프트: </span>
                    {analysisData.stylePrompt}
                  </div>
                </div>
              )}

              {/* 가이드 안내 */}
              <div className="p-3 rounded-xl bg-black/40 border border-white/5 text-left text-xs text-zinc-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-zinc-300">AI 음향 DNA 매칭 작동 방식</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                    업로드하신 목소리의 음역대(성종), 흉성/두성 비율, 허스키/공기감 주파수를 AI가 실시간 분석하여 가장 유사한 보컬 톤으로 음악을 작곡하도록 맞춤 설계합니다.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Mode 3: DNA Sliders */}
          {mode === "dna" && (
            <div className="space-y-4">
              {/* 📂 기존 등록된 내 보이스 불러와서 다듬기 카드 선택기 */}
              <div className="p-3.5 rounded-2xl bg-fuchsia-950/20 border border-fuchsia-500/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-fuchsia-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
                    📂 기존 등록된 보이스 불러와서 다듬기 (원클릭 로드)
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {voices.length}개 보이스 보유
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                  {voices.map((v) => {
                    const isSelected = loadedVoiceId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => handleLoadExistingVoice(v)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? "bg-fuchsia-600/30 border-fuchsia-500 text-white shadow-md shadow-fuchsia-500/20"
                            : "bg-zinc-900/80 border-white/5 text-zinc-300 hover:border-white/20 hover:bg-zinc-800"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="text-xs font-bold truncate flex items-center gap-1">
                            {v.name}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                            v.gender === "male" ? "bg-blue-500/20 text-blue-300" : "bg-pink-500/20 text-pink-300"
                          }`}>
                            {v.gender === "male" ? "남성" : "여성"}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">
                          {v.tags?.slice(0, 2).join(", ") || v.desc || "커스텀 보이스"}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {loadedVoiceId && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>[{voiceName}]</strong>의 음향 DNA가 로드되었습니다. 아래 슬라이더로 톤을 다듬은 후 저장하세요!
                    </span>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-fuchsia-400 uppercase tracking-wider">
                    12대 음색 정밀 제어 (Voice DNA)
                  </h4>
                  <Wand2 className="w-4 h-4 text-fuchsia-400" />
                </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>음역 (Pitch)</span>
                    <span className="text-white font-bold">{sliders.pitch}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={sliders.pitch}
                    onChange={(e) => setSliders({ ...sliders, pitch: Number(e.target.value) })}
                    className="w-full accent-fuchsia-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>밝기 (Brightness)</span>
                    <span className="text-white font-bold">{sliders.brightness}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={sliders.brightness}
                    onChange={(e) => setSliders({ ...sliders, brightness: Number(e.target.value) })}
                    className="w-full accent-fuchsia-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>흉성 (Chest)</span>
                    <span className="text-white font-bold">{sliders.chest}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={sliders.chest}
                    onChange={(e) => setSliders({ ...sliders, chest: Number(e.target.value) })}
                    className="w-full accent-fuchsia-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>두성 (Head)</span>
                    <span className="text-white font-bold">{sliders.head}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={sliders.head}
                    onChange={(e) => setSliders({ ...sliders, head: Number(e.target.value) })}
                    className="w-full accent-fuchsia-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>숨소리 (Breathiness)</span>
                    <span className="text-white font-bold">{sliders.breathiness}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={sliders.breathiness}
                    onChange={(e) => setSliders({ ...sliders, breathiness: Number(e.target.value) })}
                    className="w-full accent-fuchsia-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-zinc-400 mb-1">
                    <span>공기감 (Airiness)</span>
                    <span className="text-white font-bold">{sliders.airiness}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={sliders.airiness}
                    onChange={(e) => setSliders({ ...sliders, airiness: Number(e.target.value) })}
                    className="w-full accent-fuchsia-500"
                  />
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Mode 4: Extract from My Track */}
          {mode === "extract" && (
            <div className="p-5 rounded-2xl bg-gradient-to-b from-cyan-950/30 to-zinc-900/60 border border-cyan-500/30 space-y-4">
              {/* 수노 공식 추천 가이드 배너 */}
              <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-cyan-200">✨ 수노(Suno) 공식 추천: 100% 보컬 일관성 유지 (Persona)</p>
                  <p className="text-zinc-300 text-[11px] mt-1 leading-relaxed">
                    Melodio에서 생성한 곡 중 마음에 드는 가수를 선택하세요. 수노의 잠재 보컬 임베딩(Latent Vector)을 그대로 계승하여 후속 앨범 및 모든 신곡에서 100% 동일한 아티스트 목소리로 작곡됩니다.
                  </p>
                </div>
              </div>

              <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                내 보관함 생성곡에서 보컬 아티스트 선택
              </h4>

              {isLoadingTracks ? (
                <div className="text-center py-8 text-xs text-zinc-500">생성곡 목록 로딩 중...</div>
              ) : myTracks.length === 0 ? (
                <div className="text-center py-6 text-xs text-zinc-500">
                  생성된 곡이 없습니다. 먼저 곡을 생성해 보세요.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {myTracks.map((track) => (
                    <div
                      key={track.id}
                      onClick={() => {
                        setSelectedTrackId(track.id);
                        if (!voiceName) setVoiceName(`${track.title} Vocal`);
                      }}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        selectedTrackId === track.id
                          ? "bg-cyan-500/20 border-cyan-500 text-cyan-200 font-bold shadow-md shadow-cyan-500/10"
                          : "bg-zinc-900/80 border-white/5 text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      <div className="truncate text-xs">{track.title}</div>
                      {selectedTrackId === track.id && <Check className="w-4 h-4 text-cyan-400" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Voice Meta Form */}
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-white/5 space-y-3 text-xs">
            <div>
              <label className="block text-zinc-400 mb-1 font-medium">보이스 이름</label>
              <input
                type="text"
                placeholder="예: 따뜻한 발라드 보컬, 지우"
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 mb-1 font-medium">성별</label>
                <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-900 rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setGender("female")}
                    className={`py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      gender === "female" ? "bg-fuchsia-600 text-white" : "text-zinc-400"
                    }`}
                  >
                    여성
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender("male")}
                    className={`py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      gender === "male" ? "bg-blue-600 text-white" : "text-zinc-400"
                    }`}
                  >
                    남성
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1 font-medium">스타일 태그</label>
                <input
                  type="text"
                  placeholder="예: 발라드, 맑은음색, 감성"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-fuchsia-500/50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="px-6 py-4 border-t border-white/5 bg-zinc-950/70 flex items-center justify-between">
          <button
            onClick={() => {
              closeCreateModal();
              openVoiceModal();
            }}
            className="text-xs text-zinc-400 hover:text-white cursor-pointer"
          >
            취소
          </button>
          
          <div className="flex items-center gap-2">
            {loadedVoiceId && (
              <button
                type="button"
                onClick={() => handleSaveVoice(true)}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs shadow-lg transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-emerald-400" />
                <span>기존 보이스에 덮어쓰기</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSaveVoice(false)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 via-fuchsia-600 to-indigo-600 hover:from-rose-400 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-fuchsia-500/25 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{loadedVoiceId ? "✨ 새 버전으로 복제 저장 (v2)" : "보이스 저장하기"}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
