'use client';

import { useState, useEffect, useRef } from "react";
import { 
  Mic2, Sparkles, Sliders, Disc, ShieldCheck, 
  Play, Pause, Upload, Layers, Volume2, Info, 
  Activity, Check, HelpCircle, Save, Database,
  ArrowRight, RefreshCw, Heart, Music, CheckCircle,
  HelpCircle as QuestionIcon, ArrowLeft, VolumeX,
  Search, Plus, X, ChevronRight, ChevronLeft, Trash2, Edit2, Zap, Link
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { defaultSystemVoices, buildVoicePromptFromAttributes, VoiceDnaRecord } from "@/lib/voice-dna-scrubber";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import { DEMO_LYRICS } from "@/data/demo-lyrics";

type VoiceType = "default" | "record" | "upload" | "blend";

const EXPLORE_VOICES = [
  {
    code: 'VD-1004',
    name: 'Aria',
    desc: 'Tender, Calm and Clear Soprano',
    gender: 'female',
    language: 'English',
    flag: '🇺🇸',
    category: 'Singing/Music',
    tags: ['Soprano', 'Smooth', 'Dreamy'],
    plays: '12K',
    physical_layers: { gender: 'female', age: 'young', pitch: 80, brightness: 85, chest: 40, head: 80 },
    textures: ['Crystal', 'Breathy'],
    emotions: ['Dreamy', 'Hopeful'],
    gradient: 'linear-gradient(135deg, #f43f5e, #fb923c)'
  },
  {
    code: 'VD-3802',
    name: 'Kaelen',
    desc: 'Deep & Rich Soul Baritone',
    gender: 'male',
    language: 'English',
    flag: '🇺🇸',
    category: 'Singing/Music',
    tags: ['Baritone', 'Husky', 'Dark'],
    plays: '8.4K',
    physical_layers: { gender: 'male', age: 'mature', pitch: 35, brightness: 45, chest: 85, head: 30 },
    textures: ['Smoky', 'Velvet'],
    emotions: ['Lonely', 'Dark'],
    gradient: 'linear-gradient(135deg, #3b82f6, #14b8a6)'
  },
  {
    code: 'VD-7705',
    name: 'Moe',
    desc: 'Sweet & Bright Kawaii J-Pop',
    gender: 'female',
    language: 'Japanese',
    flag: '🇯🇵',
    category: 'Singing/Music',
    tags: ['High-pitch', 'Smooth', 'Happy'],
    plays: '22K',
    physical_layers: { gender: 'female', age: 'childish', pitch: 90, brightness: 95, chest: 20, head: 90 },
    textures: ['Silky', 'Clean'],
    emotions: ['Passionate', 'Happy'],
    gradient: 'linear-gradient(135deg, #ec4899, #f43f5e)'
  },
  {
    code: 'VD-2001',
    name: 'Anna Kim',
    desc: 'Tender and Warm Pop Balladeer',
    gender: 'female',
    language: 'Korean',
    flag: '🇰🇷',
    category: 'Singing/Music',
    tags: ['Alto', 'Calm', 'Emotional'],
    plays: '18K',
    physical_layers: { gender: 'female', age: 'young', pitch: 65, brightness: 70, chest: 60, head: 50 },
    textures: ['Warm', 'Airy'],
    emotions: ['Sad', 'Calm'],
    gradient: 'linear-gradient(135deg, #a855f7, #ec4899)'
  },
  {
    code: 'VD-2002',
    name: 'Yeon Taek',
    desc: 'Vintage Smoky Rock Baritone',
    gender: 'male',
    language: 'Korean',
    flag: '🇰🇷',
    category: 'Singing/Music',
    tags: ['Baritone', 'Husky', 'Powerful'],
    plays: '15K',
    physical_layers: { gender: 'male', age: 'mature', pitch: 38, brightness: 50, chest: 90, head: 40 },
    textures: ['Smoky', 'Gravelly'],
    emotions: ['Passionate', 'Aggressive'],
    gradient: 'linear-gradient(135deg, #f59e0b, #eab308)'
  },
  {
    code: 'VD-2003',
    name: 'Junho',
    desc: 'Melancholic R&B Soul Groove',
    gender: 'male',
    language: 'Korean',
    flag: '🇰🇷',
    category: 'Singing/Music',
    tags: ['Tenor', 'Smooth', 'Sensual'],
    plays: '9.2K',
    physical_layers: { gender: 'male', age: 'young', pitch: 55, brightness: 60, chest: 70, head: 60 },
    textures: ['Velvet', 'Warm'],
    emotions: ['Lonely', 'Dreamy'],
    gradient: 'linear-gradient(135deg, #6366f1, #3b82f6)'
  },
  {
    code: 'VD-2004',
    name: 'Britney',
    desc: 'Calm & Calculative Dark Cyberpunk',
    gender: 'female',
    language: 'English',
    flag: '🇬🇧',
    category: 'Characters',
    tags: ['Soprano', 'Cold', 'Mysterious'],
    plays: '31K',
    physical_layers: { gender: 'female', age: 'mature', pitch: 70, brightness: 60, chest: 50, head: 70 },
    textures: ['Metallic', 'Whispering'],
    emotions: ['Dark', 'Cold'],
    gradient: 'linear-gradient(135deg, #10b981, #06b6d4)'
  },
  {
    code: 'VD-2005',
    name: 'Drew',
    desc: 'Deadpan Retro Jazz Baritone',
    gender: 'male',
    language: 'English',
    flag: '🇺🇸',
    category: 'Social Media',
    tags: ['Baritone', 'Smooth', 'Calm'],
    plays: '4.6K',
    physical_layers: { gender: 'male', age: 'mature', pitch: 30, brightness: 40, chest: 80, head: 30 },
    textures: ['Warm', 'Dry'],
    emotions: ['Calm', 'Lethargic'],
    gradient: 'linear-gradient(135deg, #84cc16, #10b981)'
  },
  {
    code: 'VD-2006',
    name: 'Sora',
    desc: 'Ethereal Japanese Ballad Alto',
    gender: 'female',
    language: 'Japanese',
    flag: '🇯🇵',
    category: 'Singing/Music',
    tags: ['Alto', 'Dreamy', 'Smooth'],
    plays: '11K',
    physical_layers: { gender: 'female', age: 'young', pitch: 60, brightness: 65, chest: 70, head: 55 },
    textures: ['Warm', 'Silky'],
    emotions: ['Sad', 'Calm'],
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)'
  },
  {
    code: 'VD-2007',
    name: 'Leo',
    desc: 'Bright French Acoustic Tenor',
    gender: 'male',
    language: 'English',
    flag: '🇫🇷',
    category: 'Singing/Music',
    tags: ['Tenor', 'Smooth', 'Happy'],
    plays: '7.8K',
    physical_layers: { gender: 'male', age: 'young', pitch: 58, brightness: 75, chest: 50, head: 65 },
    textures: ['Clean', 'Airy'],
    emotions: ['Hopeful', 'Happy'],
    gradient: 'linear-gradient(135deg, #f43f5e, #a855f7)'
  },
  {
    code: 'VD-2008',
    name: 'Ji-Eun',
    desc: 'Crisp Indie-Pop Female Singer',
    gender: 'female',
    language: 'Korean',
    flag: '🇰🇷',
    category: 'Singing/Music',
    tags: ['Soprano', 'Smooth', 'Powerful'],
    plays: '29K',
    physical_layers: { gender: 'female', age: 'young', pitch: 78, brightness: 80, chest: 45, head: 75 },
    textures: ['Crystal', 'Airy'],
    emotions: ['Happy', 'Hopeful'],
    gradient: 'linear-gradient(135deg, #fb923c, #ec4899)'
  },
  {
    code: 'VD-2009',
    name: 'Mateo',
    desc: 'Warm Spanish Passionate Baritone',
    gender: 'male',
    language: 'English',
    flag: '🇪🇸',
    category: 'Singing/Music',
    tags: ['Baritone', 'Powerful', 'Smooth'],
    plays: '6.2K',
    physical_layers: { gender: 'male', age: 'mature', pitch: 36, brightness: 52, chest: 80, head: 35 },
    textures: ['Smoky', 'Warm'],
    emotions: ['Passionate', 'Aggressive'],
    gradient: 'linear-gradient(135deg, #ef4444, #f59e0b)'
  },
  {
    code: 'VD-2010',
    name: 'Sakura',
    desc: 'Whispering J-Rock Melancholic',
    gender: 'female',
    language: 'Japanese',
    flag: '🇯🇵',
    category: 'Singing/Music',
    tags: ['Soprano', 'Husky', 'Calm'],
    plays: '16K',
    physical_layers: { gender: 'female', age: 'young', pitch: 72, brightness: 58, chest: 60, head: 68 },
    textures: ['Breathy', 'Smoky'],
    emotions: ['Sad', 'Lonely'],
    gradient: 'linear-gradient(135deg, #a855f7, #6366f1)'
  },
  {
    code: 'VD-2011',
    name: 'Minho',
    desc: 'Tender Pop-R&B Vocalist',
    gender: 'male',
    language: 'Korean',
    flag: '🇰🇷',
    category: 'Singing/Music',
    tags: ['Tenor', 'Smooth', 'Dreamy'],
    plays: '14K',
    physical_layers: { gender: 'male', age: 'young', pitch: 57, brightness: 64, chest: 65, head: 58 },
    textures: ['Velvet', 'Clean'],
    emotions: ['Dreamy', 'Calm'],
    gradient: 'linear-gradient(135deg, #14b8a6, #84cc16)'
  },
  {
    code: 'VD-2012',
    name: 'Chloe',
    desc: 'Rich Soul-Jazz Contralto',
    gender: 'female',
    language: 'English',
    flag: '🇺🇸',
    category: 'Singing/Music',
    tags: ['Alto', 'Husky', 'Powerful'],
    plays: '19K',
    physical_layers: { gender: 'female', age: 'mature', pitch: 48, brightness: 50, chest: 80, head: 45 },
    textures: ['Smoky', 'Gravelly'],
    emotions: ['Passionate', 'Lonely'],
    gradient: 'linear-gradient(135deg, #f43f5e, #fb7185)'
  },
  {
    code: 'VD-2013',
    name: 'Kenji',
    desc: 'High-Pitch Anime J-Pop Male',
    gender: 'male',
    language: 'Japanese',
    flag: '🇯🇵',
    category: 'Singing/Music',
    tags: ['Tenor', 'Smooth', 'Happy'],
    plays: '25K',
    physical_layers: { gender: 'male', age: 'childish', pitch: 70, brightness: 80, chest: 30, head: 80 },
    textures: ['Clean', 'Silky'],
    emotions: ['Happy', 'Hopeful'],
    gradient: 'linear-gradient(135deg, #06b6d4, #10b981)'
  },
  {
    code: 'VD-2014',
    name: 'Oliver',
    desc: 'Classic British Folk Storyteller',
    gender: 'male',
    language: 'English',
    flag: '🇬🇧',
    category: 'Social Media',
    tags: ['Baritone', 'Smooth', 'Calm'],
    plays: '5.1K',
    physical_layers: { gender: 'male', age: 'mature', pitch: 32, brightness: 45, chest: 82, head: 32 },
    textures: ['Warm', 'Dry'],
    emotions: ['Calm', 'Hopeful'],
    gradient: 'linear-gradient(135deg, #6b7280, #374151)'
  },
  {
    code: 'VD-2015',
    name: 'Sophia',
    desc: 'Clear & High Operatic Soprano',
    gender: 'female',
    language: 'English',
    flag: '🇬🇧',
    category: 'Singing/Music',
    tags: ['Soprano', 'Smooth', 'Powerful'],
    plays: '13K',
    physical_layers: { gender: 'female', age: 'mature', pitch: 85, brightness: 90, chest: 35, head: 90 },
    textures: ['Crystal', 'Metallic'],
    emotions: ['Passionate', 'Hopeful'],
    gradient: 'linear-gradient(135deg, #e0f2fe, #38bdf8)'
  }
];

// DEMO_LYRICS is now imported from @/data/demo-lyrics

const DEMO_AUDIO_TRACKS: Record<"female" | "male", Record<"ballad" | "pop" | "rnb" | "rock", string>> = {
  female: {
    ballad: "https://file.302.ai/gpt/imgs/20260721/bfe3e4d9f67efae7ebec1dd50b696ee3.mp3",
    pop: "https://file.302.ai/gpt/imgs/20260721/db2d8d80f833a695bcefa7b4b1a43a05.mp3",
    rnb: "https://file.302.ai/gpt/imgs/20260721/6b4fb245781a700084f7bbd743a18a99.mp3",
    rock: "https://file.302.ai/gpt/imgs/20260721/f8430ea6c836ec4ff4995f6efdf2a16d.mp3"
  },
  male: {
    ballad: "https://file.302.ai/gpt/imgs/20260721/9ceee5c56cbfccdf46ebddc932bfbc63.mp3",
    pop: "https://file.302.ai/gpt/imgs/20260721/3c2a38210fe522646d6b2b6241c2c31e.mp3",
    rnb: "https://file.302.ai/gpt/imgs/20260721/e3328e686cfc49d885d500980fae81bd.mp3",
    rock: "https://file.302.ai/gpt/imgs/20260721/bc3a2a5f8bccbbd366d2cebbd99cd130.mp3"
  }
};

export default function VoiceDnaStudio() {
  const { language } = useLanguage();
  // ─── State Management ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"explore" | "design" | "collections" | "decoder">("explore");
  const [voiceType, setVoiceType] = useState<VoiceType>("default");
  
  // Explore Filters & Audio Preview State
  const [expSearchQuery, setExpSearchQuery] = useState("");
  const [expLanguage, setExpLanguage] = useState("all");
  const [expGender, setExpGender] = useState("all");
  const [expSelectedTags, setExpSelectedTags] = useState<string[]>([]);
  const [explorePlayingVoiceId, setExplorePlayingVoiceId] = useState<string | null>(null);
  const [exploreProgress, setExploreProgress] = useState(0);
  const [explorePlaying, setExplorePlaying] = useState(false);
  const [copiedLinkTrackId, setCopiedLinkTrackId] = useState<string | null>(null);
  const [expCurrentPage, setExpCurrentPage] = useState(1);
  const [favPage, setFavPage] = useState(1);
  const [customPage, setCustomPage] = useState(1);
  const [editingVoiceCode, setEditingVoiceCode] = useState<string | null>(null);
  const [editingVoiceName, setEditingVoiceName] = useState("");
  
  // Voice Attributes (0-100)
  const [stageName, setStageName] = useState("Vocal Prototype Alpha");
  const [gender, setGender] = useState<"female" | "male">("female");
  const [age, setAge] = useState<"young" | "mature" | "childish">("young");
  
  // Attribute Sliders
  const [pitch, setPitch] = useState(65);
  const [brightness, setBrightness] = useState(70);
  const [chestResonance, setChestResonance] = useState(50);
  const [headResonance, setHeadResonance] = useState(60);
  const [weight, setWeight] = useState(55);
  
  const [power, setPower] = useState(70);
  const [dynamics, setDynamics] = useState(65);
  const [vibrato, setVibrato] = useState(50);
  const [groove, setGroove] = useState(60);
  const [noiseEntropy, setNoiseEntropy] = useState(15);
  
  // Multi-select Materials & Emotions
  const [selectedTextures, setSelectedTextures] = useState<string[]>(["Crystal"]);
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>(["Dreamy"]);
  const [selectedReverb, setSelectedReverb] = useState<string>("Studio");

  // Custom Cloned Voices DB
  const [customVoices, setCustomVoices] = useState<VoiceDnaRecord[]>([]);
  const [lastSavedDna, setLastSavedDna] = useState<string | null>(null);

  // Audio Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const demoAudioRef = useRef<HTMLAudioElement | null>(null);
  const demoTimersRef = useRef<NodeJS.Timeout[]>([]);
  const demoAudioCtxRef = useRef<AudioContext | null>(null);
  const demoSynthIntervalRef = useRef<any>(null);

  // File Upload
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Voice Blend Source and Ratio States
  const [blendSourceA, setBlendSourceA] = useState<string>("VD-1004");
  const [blendSourceB, setBlendSourceB] = useState<string>("VD-3802");
  const [blendRatio, setBlendRatio] = useState<number>(50);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Radar chart tooltip state
  const [hoveredAttr, setHoveredAttr] = useState<{
    nameKo: string;
    value: number;
    x: number;
    y: number;
    color: string;
  } | null>(null);

  // Demo Singing Cockpit States
  const [selectedGenre, setSelectedGenre] = useState<"ballad" | "pop" | "rnb" | "rock" | "hiphop" | "dance" | "jazz" | "acoustic">("ballad");
  const [isDemoGenerating, setIsDemoGenerating] = useState(false);
  const [demoGenerateStep, setDemoGenerateStep] = useState(0);
  const [demoAudioUrl, setDemoAudioUrl] = useState<string | null>(null);
  const [demoAudioUrlB, setDemoAudioUrlB] = useState<string | null>(null);
  const [selectedVocalVersion, setSelectedVocalVersion] = useState<"A" | "B">("A");
  const [isDemoPlaying, setIsDemoPlaying] = useState(false);
  const [demoProgress, setDemoProgress] = useState(0);
  const [lyricIndex, setLyricIndex] = useState<number>(0);



  // VSC Decoder
  const [decodeInput, setDecodeInput] = useState("VD-1004");
  const [decodedData, setDecodedData] = useState<any>(null);
  const [decodeError, setDecodeError] = useState("");

  // ─── 유명 가수 음색 분석 검색기 State ─────────────────────────────────────
  const [singerQuery, setSingerQuery] = useState("");
  const [analyzedSinger, setAnalyzedSinger] = useState<any>(null);
  const [isSearchingSinger, setIsSearchingSinger] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [customSingerName, setCustomSingerName] = useState("");

  // ─── 1. 초보자 가이드 (Tutorial Mode) State ───────────────────────────────
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  const tutorialSteps = [
    {
      title: "1단계: Voice Source (입력 방식 선택)",
      description: "목소리의 시작점을 결정합니다. 기본 내장 AI 휠 조작 외에도 본인의 목소리 녹음, 음성 파일 업로드 또는 기존 Voice DNA간의 융합 믹스 중에서 자유롭게 선택할 수 있습니다.",
      target: "source-selector"
    },
    {
      title: "2단계: Voice Wheel (속성 가중치 휠)",
      description: "중앙의 원형 휠은 목소리의 뼈대를 잡는 6대 공명 축입니다. 우측에서 슬라이더를 당겨 휠을 조절하면, 목소리의 밝기(Bright)와 흉성(Chest) 등이 유기적으로 조합됩니다.",
      target: "voice-wheel"
    },
    {
      title: "3단계: Advanced Sliders (물리 및 가중치 제어)",
      description: "피치(음높이)와 노이즈 저감(Noise Entropy)을 미세 조종합니다. 특히 노이즈 필터는 Suno AI 고유 톤 복제를 막고 기계적인 쇳소리를 정밀 억제합니다.",
      target: "sliders-box"
    },
    {
      title: "4단계: Material & Emotion (재질과 감정 덧씌우기)",
      description: "목소리의 촉감 질감(부드러운 Velvet, 차가운 Metallic 등)과 가슴을 저미는 감정 상태를 카드 복수 토글 방식으로 음질 위에 융합 결합시킵니다.",
      target: "materials-box"
    },
    {
      title: "5단계: Save Designed Voice (DNA 코드 발급)",
      description: "설계가 끝나면 저장 버튼을 누르세요. 나만의 고유 암호화된 DNA 코드(VD-XXXX)가 생성되어 라이브러리에 저장되며, 음악 생성 시 즉각 적용 가능해집니다.",
      target: "save-btn"
    }
  ];

  // ─── 2. Web Audio API를 활용한 음색 데모 합성 엔진 (WOW Point) ────────────────
  const [playingDemoId, setPlayingDemoId] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<any[]>([]);
  const exploreAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopAllSynthesis = () => {
    oscillatorsRef.current.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    oscillatorsRef.current = [];
    setPlayingDemoId(null);
  };

  const playExploreVoiceDemo = (voice: any) => {
    stopExploreVoiceDemo();
    
    // Check if the voice record has a saved real Audio URL
    const realAudioUrl = voice.audio_url || voice.physical_layers?.audio_url;
    if (realAudioUrl) {
      setExplorePlayingVoiceId(voice.code);
      setExplorePlaying(true);
      setExploreProgress(0);

      const audio = new Audio(realAudioUrl);
      exploreAudioRef.current = audio;
      
      // Update progress as it plays
      audio.ontimeupdate = () => {
        if (audio.duration) {
          const percent = (audio.currentTime / audio.duration) * 100;
          setExploreProgress(percent);
        }
      };

      audio.onended = () => {
        setExplorePlaying(false);
        setExplorePlayingVoiceId(null);
        setExploreProgress(0);
      };

      audio.play().catch(err => {
        console.error("Failed to play explore audio url:", err);
        setExplorePlaying(false);
        setExplorePlayingVoiceId(null);
      });
      return;
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    setExplorePlayingVoiceId(voice.code);
    setExplorePlaying(true);
    setExploreProgress(0);

    const dest = ctx.destination;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.08, ctx.currentTime);
    masterGain.connect(dest);

    // Extract attributes dynamically to synthesize physical characteristics in real-time!
    const pitchVal = voice.physical_layers?.pitch !== undefined ? voice.physical_layers.pitch : 50;
    const brightnessVal = voice.physical_layers?.brightness !== undefined ? voice.physical_layers.brightness : 50;
    const powerVal = voice.physical_layers?.power !== undefined ? voice.physical_layers.power : 50;
    const genderVal = voice.physical_layers?.gender || 'female';

    const pitchMultiplier = 0.65 + (pitchVal / 100) * 0.8;
    const cutoffFreq = 400 + (brightnessVal / 100) * 2600;
    const isFemale = genderVal === 'female' || genderVal === 'duet';

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(cutoffFreq, ctx.currentTime);
    filter.connect(masterGain);

    const baseFreq = (isFemale ? 330 : 110) * pitchMultiplier;
    const chord = [1.0, 1.25, 1.5, 1.875, 2.0, 2.5, 3.0, 3.75]; // Major chord ratios

    let noteIdx = 0;
    
    // Play a nice rhythmic chord arpeggio loop!
    const intervalId = setInterval(() => {
      if (!audioCtxRef.current) return;
      const t = audioCtxRef.current.currentTime;
      const osc = audioCtxRef.current.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = isFemale ? 'sine' : 'triangle';
      const freq = baseFreq * chord[noteIdx % chord.length];
      osc.frequency.setValueAtTime(freq, t);

      // Vibrato
      const lfo = audioCtxRef.current.createOscillator();
      const lfoGain = audioCtxRef.current.createGain();
      lfo.frequency.value = 5.8;
      lfoGain.gain.value = freq * (0.005 + (powerVal / 100) * 0.025);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      // Attack / Decay
      gainNode.gain.setValueAtTime(0, t);
      gainNode.gain.linearRampToValueAtTime(0.08, t + 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);

      osc.connect(gainNode);
      gainNode.connect(filter);
      
      lfo.start(t);
      osc.start(t);
      
      oscillatorsRef.current.push(lfo);
      oscillatorsRef.current.push(osc);

      noteIdx++;
      
      setExploreProgress((prev) => {
        if (prev >= 100) {
          clearInterval(intervalId);
          setExplorePlaying(false);
          setExplorePlayingVoiceId(null);
          return 0;
        }
        return prev + 6.67; // ~15 seconds total
      });
    }, 1000);

    (window as any).exploreIntervalId = intervalId;
  };

  const stopExploreVoiceDemo = () => {
    if ((window as any).exploreIntervalId) {
      clearInterval((window as any).exploreIntervalId);
      (window as any).exploreIntervalId = null;
    }
    if (exploreAudioRef.current) {
      exploreAudioRef.current.pause();
      exploreAudioRef.current = null;
    }
    stopAllSynthesis();
    setExplorePlaying(false);
    setExplorePlayingVoiceId(null);
    setExploreProgress(0);
  };

  const playCurrentDesignedVoicePreview = () => {
    const tempVoice = {
      code: "DESIGNER_PREVIEW",
      name: stageName || "My Design Preview",
      desc: `Pitch: ${pitch}% • Brightness: ${brightness}% • Power: ${power}%`,
      flag: "🎛️",
      language: "Custom",
      tags: selectedTextures.length > 0 ? selectedTextures : ["Custom"],
      gradient: "linear-gradient(135deg, #d946ef 0%, #06b6d4 100%)",
      physical_layers: {
        gender,
        age,
        pitch,
        brightness,
        chest: chestResonance,
        head: headResonance,
        weight,
        power
      }
    };
    playExploreVoiceDemo(tempVoice);
  };

  const playVoiceSyntheticDemo = (code: string) => {
    stopAllSynthesis();
    
    // Web Audio API Context
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    setPlayingDemoId(code);

    const dest = ctx.destination;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.12, ctx.currentTime);
    masterGain.connect(dest);

    // Filter for warmth
    const filter = ctx.createBiquadFilter();
    filter.type = code === "VD-3802" ? "lowpass" : "peaking";
    filter.frequency.setValueAtTime(code === "VD-3802" ? 800 : 2500, ctx.currentTime);
    filter.connect(masterGain);

    const now = ctx.currentTime;
    
    if (code === "VD-1004") {
      // Aria - Sweet High Soprano: Pure Sine wave chords with warm vibrato
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);

        // Add vibrato LFO
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 5.5; // Vibrato speed
        lfoGain.gain.value = 6;     // Vibrato depth
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(now);
        oscillatorsRef.current.push(lfo);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.08, now + 0.3);
        gainNode.gain.setValueAtTime(0.08, now + 1.2);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

        osc.connect(gainNode);
        gainNode.connect(filter);
        osc.start(now);
        oscillatorsRef.current.push(osc);
      });
    } else if (code === "VD-3802") {
      // Kaelen - Husky Deep Baritone: Warm low triangle waves with heavy chest filter
      const freqs = [130.81, 164.81, 196.00]; // C3, E3, G3
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now);

        // Add slow chest vibrato LFO
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 4.0;
        lfoGain.gain.value = 2;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(now);
        oscillatorsRef.current.push(lfo);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.12, now + 0.4);
        gainNode.gain.setValueAtTime(0.12, now + 1.2);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

        osc.connect(gainNode);
        gainNode.connect(filter);
        osc.start(now);
        oscillatorsRef.current.push(osc);
      });
    } else if (code === "VD-7705") {
      // Moe - High Kawaii: Fast cute pulse waveforms
      const freqs = [880.00, 987.77, 1046.50]; // A5, B5, C6
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now);

        // Fast light vibrato
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 7.0;
        lfoGain.gain.value = 10;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(now);
        oscillatorsRef.current.push(lfo);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.05, now + 0.2);
        gainNode.gain.setValueAtTime(0.05, now + 1.0);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);

        osc.connect(gainNode);
        gainNode.connect(filter);
        osc.start(now);
        oscillatorsRef.current.push(osc);
      });
    }

    // Auto stop after 2.5 seconds
    setTimeout(() => {
      setPlayingDemoId(prev => prev === code ? null : prev);
    }, 2500);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllSynthesis();
    };
  }, []);

  // Load current user for Supabase sync
  useEffect(() => {
    supabase.auth.getUser().then((res: any) => {
      const user = res.data?.user;
      if (user) setCurrentUser(user);
    });
  }, []);

  // ─── 3. 1초 완성 퀵스타트 템플릿 로드 함수 ────────────────────────────────────
  const loadQuickStartTemplate = (type: "whisperer" | "belter" | "diva" | "baritone" | "soul" | "indie" | "hiphop" | "dance") => {
    if (type === "whisperer") {
      setStageName("Warm Lofi Whisperer");
      setGender("female");
      setAge("young");
      setPitch(50);
      setBrightness(30);
      setChestResonance(85);
      setHeadResonance(40);
      setWeight(70);
      setPower(40);
      setDynamics(60);
      setVibrato(45);
      setGroove(50);
      setNoiseEntropy(10);
      setSelectedTextures(["Velvet", "Breathy", "Smoky"]);
      setSelectedEmotions(["Dreamy", "Calm", "Lonely"]);
      setSelectedReverb("Rain Cafe");
    } else if (type === "belter") {
      setStageName("Steel Heavy Belter");
      setGender("male");
      setAge("mature");
      setPitch(45);
      setBrightness(75);
      setChestResonance(90);
      setHeadResonance(65);
      setWeight(85);
      setPower(95);
      setDynamics(80);
      setVibrato(80);
      setGroove(65);
      setNoiseEntropy(20);
      setSelectedTextures(["Metallic", "Wood", "Glass"]);
      setSelectedEmotions(["Powerful", "Dark", "Passionate"]);
      setSelectedReverb("Arena");
    } else if (type === "diva") {
      setStageName("Crystal Pop Diva");
      setGender("female");
      setAge("young");
      setPitch(85);
      setBrightness(90);
      setChestResonance(30);
      setHeadResonance(95);
      setWeight(40);
      setPower(75);
      setDynamics(80);
      setVibrato(70);
      setGroove(85);
      setNoiseEntropy(15);
      setSelectedTextures(["Crystal", "Silky", "Clean"]);
      setSelectedEmotions(["Hopeful", "Romantic", "Dreamy"]);
      setSelectedReverb("Concert Hall");
    } else if (type === "baritone") {
      setStageName("Midnight Velvet Baritone");
      setGender("male");
      setAge("mature");
      setPitch(25);
      setBrightness(40);
      setChestResonance(95);
      setHeadResonance(35);
      setWeight(80);
      setPower(70);
      setDynamics(75);
      setVibrato(65);
      setGroove(80);
      setNoiseEntropy(12);
      setSelectedTextures(["Velvet", "Smoky", "Breathy"]);
      setSelectedEmotions(["Lonely", "Romantic", "Calm"]);
      setSelectedReverb("Studio");
    } else if (type === "soul") {
      setStageName("Golden Retro Soul");
      setGender("female");
      setAge("young");
      setPitch(70);
      setBrightness(65);
      setChestResonance(65);
      setHeadResonance(80);
      setWeight(60);
      setPower(80);
      setDynamics(85);
      setVibrato(75);
      setGroove(90);
      setNoiseEntropy(14);
      setSelectedTextures(["Silky", "Breathy", "Wood"]);
      setSelectedEmotions(["Passionate", "Hopeful", "Dreamy"]);
      setSelectedReverb("Studio");
    } else if (type === "indie") {
      setStageName("Indie Acoustic Breeze");
      setGender("female");
      setAge("young");
      setPitch(75);
      setBrightness(80);
      setChestResonance(50);
      setHeadResonance(70);
      setWeight(45);
      setPower(60);
      setDynamics(70);
      setVibrato(50);
      setGroove(70);
      setNoiseEntropy(8);
      setSelectedTextures(["Crystal", "Clean", "Cotton"]);
      setSelectedEmotions(["Hopeful", "Calm", "Dreamy"]);
      setSelectedReverb("Rain Cafe");
    } else if (type === "hiphop") {
      setStageName("Street Lyricist Rap");
      setGender("male");
      setAge("young");
      setPitch(35);
      setBrightness(60);
      setChestResonance(80);
      setHeadResonance(50);
      setWeight(70);
      setPower(85);
      setDynamics(90);
      setVibrato(20);
      setGroove(95);
      setNoiseEntropy(25);
      setSelectedTextures(["Rough", "Breathy", "Metallic"]);
      setSelectedEmotions(["Powerful", "Dark", "Passionate"]);
      setSelectedReverb("Studio");
    } else if (type === "dance") {
      setStageName("Neon Electro Diva");
      setGender("female");
      setAge("young");
      setPitch(85);
      setBrightness(95);
      setChestResonance(40);
      setHeadResonance(90);
      setWeight(50);
      setPower(90);
      setDynamics(85);
      setVibrato(70);
      setGroove(90);
      setNoiseEntropy(18);
      setSelectedTextures(["Crystal", "Metallic", "Silky"]);
      setSelectedEmotions(["Hopeful", "Passionate", "Dreamy"]);
      setSelectedReverb("Arena");
    }
  };

  const getActiveQuickStart = () => {
    const hasTextures = (t: string[]) => selectedTextures.length === t.length && selectedTextures.every(x => t.includes(x));
    const hasEmotions = (e: string[]) => selectedEmotions.length === e.length && selectedEmotions.every(x => e.includes(x));

    if (gender === "female") {
      if (pitch === 50 && brightness === 30 && chestResonance === 85 && headResonance === 40 && power === 40 && noiseEntropy === 10 && selectedReverb === "Rain Cafe" && hasTextures(["Velvet", "Breathy", "Smoky"]) && hasEmotions(["Dreamy", "Calm", "Lonely"])) {
        return "whisperer";
      }
      if (pitch === 85 && brightness === 90 && chestResonance === 30 && headResonance === 95 && power === 75 && noiseEntropy === 15 && selectedReverb === "Concert Hall" && hasTextures(["Crystal", "Silky", "Clean"]) && hasEmotions(["Hopeful", "Romantic", "Dreamy"])) {
        return "diva";
      }
      if (pitch === 70 && brightness === 65 && chestResonance === 65 && headResonance === 80 && power === 80 && noiseEntropy === 14 && selectedReverb === "Studio" && hasTextures(["Silky", "Breathy", "Wood"]) && hasEmotions(["Passionate", "Hopeful", "Dreamy"])) {
        return "soul";
      }
      if (pitch === 75 && brightness === 80 && chestResonance === 50 && headResonance === 70 && power === 60 && noiseEntropy === 8 && selectedReverb === "Rain Cafe" && hasTextures(["Crystal", "Clean", "Cotton"]) && hasEmotions(["Hopeful", "Calm", "Dreamy"])) {
        return "indie";
      }
      if (pitch === 85 && brightness === 95 && chestResonance === 40 && headResonance === 90 && power === 90 && noiseEntropy === 18 && selectedReverb === "Arena" && hasTextures(["Crystal", "Metallic", "Silky"]) && hasEmotions(["Hopeful", "Passionate", "Dreamy"])) {
        return "dance";
      }
    } else { // male
      if (pitch === 45 && brightness === 75 && chestResonance === 90 && headResonance === 65 && power === 95 && noiseEntropy === 20 && selectedReverb === "Arena" && hasTextures(["Metallic", "Wood", "Glass"]) && hasEmotions(["Powerful", "Dark", "Passionate"])) {
        return "belter";
      }
      if (pitch === 25 && brightness === 40 && chestResonance === 95 && headResonance === 35 && power === 70 && noiseEntropy === 12 && selectedReverb === "Studio" && hasTextures(["Velvet", "Smoky", "Breathy"]) && hasEmotions(["Lonely", "Romantic", "Calm"])) {
        return "baritone";
      }
      if (pitch === 35 && brightness === 60 && chestResonance === 80 && headResonance === 50 && power === 85 && noiseEntropy === 25 && selectedReverb === "Studio" && hasTextures(["Rough", "Breathy", "Metallic"]) && hasEmotions(["Powerful", "Dark", "Passionate"])) {
        return "hiphop";
      }
    }
    return null;
  };

  const activeQuickStart = getActiveQuickStart();

  // ─── DB & Preload Fetching ─────────────────────────────────────────────────
  useEffect(() => {
    // Load custom voices from localStorage to simulate DB
    const saved = localStorage.getItem("custom_voice_dnas");
    if (saved) {
      try {
        setCustomVoices(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Synchronize Voice Blend Ratio with main attributes in real-time
  useEffect(() => {
    if (voiceType === "blend") {
      const voiceA = EXPLORE_VOICES.find(v => v.code === blendSourceA);
      const voiceB = EXPLORE_VOICES.find(v => v.code === blendSourceB);
      if (voiceA && voiceB) {
        const ratioA = (100 - blendRatio) / 100;
        const ratioB = blendRatio / 100;

        const layersA = voiceA.physical_layers as any;
        const layersB = voiceB.physical_layers as any;

        const blendedPitch = Math.round((layersA.pitch ?? 50) * ratioA + (layersB.pitch ?? 50) * ratioB);
        const blendedBrightness = Math.round((layersA.brightness ?? 50) * ratioA + (layersB.brightness ?? 50) * ratioB);
        const blendedChest = Math.round((layersA.chest ?? 50) * ratioA + (layersB.chest ?? 50) * ratioB);
        const blendedHead = Math.round((layersA.head ?? 50) * ratioA + (layersB.head ?? 50) * ratioB);
        const blendedWeight = Math.round((layersA.weight ?? 50) * ratioA + (layersB.weight ?? 50) * ratioB);
        const blendedPower = Math.round((layersA.power ?? 70) * ratioA + (layersB.power ?? 70) * ratioB);
        const blendedNoise = Math.round((layersA.noise ?? 15) * ratioA + (layersB.noise ?? 15) * ratioB);

        setPitch(blendedPitch);
        setBrightness(blendedBrightness);
        setChestResonance(blendedChest);
        setHeadResonance(blendedHead);
        setWeight(blendedWeight);
        setPower(blendedPower);
        setNoiseEntropy(blendedNoise);

        const activeGender = blendRatio >= 50 ? (voiceB.gender as "female" | "male") : (voiceA.gender as "female" | "male");
        setGender(activeGender);

        const activeAge = blendRatio >= 50 ? (layersB.age as "young" | "mature" | "childish") : (layersA.age as "young" | "mature" | "childish");
        setAge(activeAge);

        // Blend textures and emotions
        let blendedTextures: string[] = [];
        let blendedEmotions: string[] = [];
        if (blendRatio < 30) {
          blendedTextures = voiceA.textures ?? [];
          blendedEmotions = voiceA.emotions ?? [];
        } else if (blendRatio > 70) {
          blendedTextures = voiceB.textures ?? [];
          blendedEmotions = voiceB.emotions ?? [];
        } else {
          blendedTextures = Array.from(new Set([...(voiceA.textures ?? []), ...(voiceB.textures ?? [])]));
          blendedEmotions = Array.from(new Set([...(voiceA.emotions ?? []), ...(voiceB.emotions ?? [])]));
        }
        setSelectedTextures(blendedTextures);
        setSelectedEmotions(blendedEmotions);
      }
    }
  }, [voiceType, blendSourceA, blendSourceB, blendRatio]);

  // Reset demo player when attributes or parameters change
  useEffect(() => {
    if (demoAudioRef.current) {
      demoAudioRef.current.pause();
      demoAudioRef.current = null;
    }
    demoTimersRef.current.forEach(clearTimeout);
    demoTimersRef.current = [];
    setIsDemoPlaying(false);
    setDemoProgress(0);
    setDemoAudioUrl(null);
    setIsDemoGenerating(false);
  }, [gender, selectedGenre, pitch, brightness, chestResonance, headResonance, power, noiseEntropy]);

  // Clean up audio & timers on unmount
  useEffect(() => {
    return () => {
      if (demoAudioRef.current) {
        demoAudioRef.current.pause();
      }
      demoTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  // Demo Singing Generation — Real AI via /api/generate (Suno)
  const handleGenerateDemo = async () => {
    if (isDemoGenerating) return;
    setIsDemoGenerating(true);
    setDemoGenerateStep(0);
    setDemoAudioUrl(null);
    setDemoAudioUrlB(null);
    setSelectedVocalVersion("A");
    setIsDemoPlaying(false);

    // Stop any existing audio
    if (demoAudioRef.current) {
      demoAudioRef.current.pause();
      demoAudioRef.current = null;
    }

    // Clear any existing timers
    demoTimersRef.current.forEach(clearTimeout);
    demoTimersRef.current = [];

    try {
      // Build Voice DNA style prompt from current slider values
      const currentDna: VoiceDnaRecord = {
        vd_code: `VD-DEMO-${Date.now()}`,
        name: 'Demo Voice',
        physical_layers: {
          gender: gender,
          age: pitch > 70 ? 'young' : 'mature',
          pitch: pitch,
          brightness: brightness,
          chest: chestResonance,
          head: headResonance,
        },
        textures: selectedTextures,
        emotions: selectedEmotions,
        performance: {
          power: power,
          vibrato: pitch > 50 ? 60 : 40,
        },
        noise_entropy: noiseEntropy,
      };

      const { tags: voiceTags } = buildVoicePromptFromAttributes(currentDna, noiseEntropy);

      // Genre mapping for style prompt with dynamic language injection
      const languageDescs: Record<string, string> = {
        ko: 'Korean',
        en: 'English',
        ja: 'Japanese',
        es: 'Spanish',
        fr: 'French',
        de: 'German',
        pt: 'Portuguese',
        zh: 'Chinese',
        it: 'Italian',
        hi: 'Hindi'
      };
      const langDesc = languageDescs[language] || 'Korean';

      const genreStyleMap: Record<string, string> = {
        ballad: `emotional ${langDesc} ballad, piano, strings, 70 BPM, heartfelt`,
        pop: `upbeat ${langDesc} pop, bright synth, catchy melody, 120 BPM, energetic`,
        rnb: `smooth ${langDesc} R&B soul, groove bass, 90 BPM, sensual`,
        rock: `powerful ${langDesc} rock, electric guitar, drums, 140 BPM, intense`,
        hiphop: `rhythmic ${langDesc} hip-hop rap, street boom bap beat, 90 BPM, punchy`,
        dance: `energetic ${langDesc} dance EDM, heavy synth bass, 128 BPM, club party`,
        jazz: `cozy ${langDesc} jazz blues, smooth saxophone, trumpet, 80 BPM, retro`,
        acoustic: `warm ${langDesc} acoustic folk, acoustic guitar, gentle breeze, 75 BPM, intimate`,
      };

      const stylePrompt = `${genreStyleMap[selectedGenre]}, ${voiceTags}`;
      const lyrics = DEMO_LYRICS[language][gender][selectedGenre][lyricIndex];

      setDemoGenerateStep(1); // "Submitting to AI Engine..."

      // Call /api/generate — same pipeline as PromptBuilder
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `VoiceDNA Demo (${selectedGenre})`,
          stylePrompt: stylePrompt,
          lyricsPrompt: lyrics,
          engine: 'suno_v5',
          isInstrumental: false,
          sunoVersion: 'v5.5',
          metadata: {
            primaryGenre: selectedGenre,
            subGenre: '',
            bpm: selectedGenre === 'ballad' ? '70' : selectedGenre === 'pop' ? '120' : selectedGenre === 'rnb' ? '90' : selectedGenre === 'rock' ? '140' : selectedGenre === 'hiphop' ? '90' : selectedGenre === 'dance' ? '128' : selectedGenre === 'jazz' ? '80' : '75',
            mood: selectedEmotions[0] || 'emotional',
          },
          sourceMenu: 'voice-lab-demo',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API error: ${res.status}`);
      }

      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || '음원 생성 실패');
      }

      setDemoGenerateStep(2); // "AI Generating Vocal..."

      // Poll for completion (Suno async architecture)
      const generationId = data.track?.id;
      if (!generationId) {
        throw new Error('Generation ID를 받지 못했습니다.');
      }

      // Poll every 5 seconds for up to 3 minutes
      let pollCount = 0;
      const maxPolls = 36; // 36 * 5s = 3 minutes
      
      const pollForCompletion = () => {
        const pollTimer = setTimeout(async () => {
          try {
            pollCount++;
            const pollRes = await fetch(`/api/generations?id=${generationId}`);
            const pollData = await pollRes.json();
            const gen = pollData.generation;

            if (gen?.status === 'completed' && gen?.audio_url) {
              // Success! Set the real audio URL
              setDemoGenerateStep(3);
              setDemoAudioUrl(gen.audio_url);
              if (pollData.sibling?.audio_url) {
                setDemoAudioUrlB(pollData.sibling.audio_url);
              }
              setIsDemoGenerating(false);
              return;
            }

            if (gen?.status === 'failed') {
              throw new Error('AI 음원 생성 실패');
            }

            if (pollCount >= maxPolls) {
              throw new Error('음원 생성 시간 초과 (3분). 나중에 Track Library에서 확인해주세요.');
            }

            // Continue polling
            pollForCompletion();
          } catch (err) {
            console.error('[VoiceLab Demo] Poll error:', err);
            setIsDemoGenerating(false);
            alert(err instanceof Error ? err.message : '음원 확인 중 오류가 발생했습니다.');
          }
        }, 5000);

        demoTimersRef.current.push(pollTimer);
      };

      pollForCompletion();

    } catch (err) {
      console.error('[VoiceLab Demo] Generate error:', err);
      setIsDemoGenerating(false);
      alert(err instanceof Error ? err.message : '음원 생성 중 오류가 발생했습니다.');
    }
  };

  // Vocal version switching helper
  const handleSwitchVocalVersion = (version: "A" | "B") => {
    setSelectedVocalVersion(version);
    const targetUrl = version === "A" ? demoAudioUrl : demoAudioUrlB;
    if (!targetUrl) return;

    if (demoAudioRef.current) {
      const wasPlaying = isDemoPlaying;
      const curTime = demoAudioRef.current.currentTime;
      demoAudioRef.current.pause();
      demoAudioRef.current.src = targetUrl;
      
      const onLoadedMetadata = () => {
        if (demoAudioRef.current) {
          demoAudioRef.current.currentTime = curTime;
          if (wasPlaying) {
            demoAudioRef.current.play().catch(err => console.error("Audio switch play failed:", err));
          }
        }
      };
      
      demoAudioRef.current.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      demoAudioRef.current.load();
    } else {
      // If audio player wasn't initialized, just let toggle handle it on next play
      setDemoProgress(0);
    }
  };

  // Demo Audio Playback Handler (pure audio player — no synth overlay)
  const handleTogglePlayDemo = () => {
    const targetUrl = selectedVocalVersion === "A" ? demoAudioUrl : demoAudioUrlB;
    if (!targetUrl) return;

    if (!demoAudioRef.current) {
      const audio = new Audio(targetUrl);
      audio.volume = 1.0; // Full volume — this IS the final AI-generated vocal track
      demoAudioRef.current = audio;

      // Event Listeners
      audio.addEventListener("timeupdate", () => {
        if (audio.duration) {
          setDemoProgress((audio.currentTime / audio.duration) * 100);
        }
      });

      audio.addEventListener("ended", () => {
        setIsDemoPlaying(false);
        setDemoProgress(0);
      });
    }

    if (isDemoPlaying) {
      demoAudioRef.current.pause();
      setIsDemoPlaying(false);
    } else {
      if (demoAudioRef.current.src !== targetUrl) {
        demoAudioRef.current.src = targetUrl;
      }
      demoAudioRef.current.play().catch(err => console.error("Audio play failed:", err));
      setIsDemoPlaying(true);
    }
  };

  // ─── Recording Logic ───────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        setRecordedBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => {
          if (prev >= 15) { // Max 15s
            stopRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (e) {
      alert("마이크 사용 권한을 확인해주세요.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    }
  };

  // ─── DNA Extraction Simulation ─────────────────────────────────────────────
  const triggerDnaExtraction = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setPitch(Math.floor(Math.random() * 40) + 40);
      setBrightness(Math.floor(Math.random() * 30) + 50);
      setChestResonance(Math.floor(Math.random() * 50) + 30);
      setHeadResonance(Math.floor(Math.random() * 40) + 50);
      setWeight(Math.floor(Math.random() * 40) + 40);
      setPower(Math.floor(Math.random() * 30) + 60);
      
      setSelectedTextures(["Velvet", "Breathy"].slice(0, Math.floor(Math.random() * 2) + 1));
      setSelectedEmotions(["Lonely", "Calm"].slice(0, Math.floor(Math.random() * 2) + 1));
      
      setIsAnalyzing(false);
    }, 2500);
  };

  // ─── Save DNA ──────────────────────────────────────────────────────────────
  const handleSaveDna = () => {
    const vdCode = `VD-${Math.floor(Math.random() * 9000 + 1000)}`;
    const newDna: VoiceDnaRecord = {
      vd_code: vdCode,
      name: stageName,
      physical_layers: {
        gender,
        age,
        pitch,
        brightness,
        chest: chestResonance,
        head: headResonance,
        weight,
        audio_url: demoAudioUrl || undefined,
        audio_url_b: demoAudioUrlB || undefined
      },
      textures: selectedTextures,
      emotions: selectedEmotions,
      performance: {
        power,
        dynamics,
        vibrato,
        groove
      },
      style: selectedReverb,
      noise_entropy: noiseEntropy,
      audio_url: demoAudioUrl || undefined,
      audio_url_b: demoAudioUrlB || undefined
    };

    const updated = [newDna, ...customVoices];
    setCustomVoices(updated);
    setCustomPage(1);
    localStorage.setItem("custom_voice_dnas", JSON.stringify(updated));
    setLastSavedDna(vdCode);

    // Supabase DB Sync
    if (currentUser) {
      supabase.from('voice_dnas').insert({
        vd_code: vdCode,
        name: stageName,
        physical_layers: {
          gender,
          age,
          pitch,
          brightness,
          chest: chestResonance,
          head: headResonance,
          weight,
          audio_url: demoAudioUrl || undefined,
          audio_url_b: demoAudioUrlB || undefined
        },
        textures: selectedTextures,
        emotions: selectedEmotions,
        performance: {
          power,
          dynamics,
          vibrato,
          groove
        },
        style: selectedReverb,
        noise_entropy: noiseEntropy,
        user_id: currentUser.id
      }).then((res: any) => {
        if (res.error) console.error("Failed to sync custom Voice DNA to Supabase:", res.error);
      });
    }
  };

  const saveVoiceName = (code: string, newName: string) => {
    if (!newName.trim()) return;
    const updated = customVoices.map(v => {
      if (v.vd_code === code) {
        return { ...v, name: newName.trim() };
      }
      return v;
    });
    setCustomVoices(updated);
    localStorage.setItem("custom_voice_dnas", JSON.stringify(updated));

    // Supabase DB Sync
    if (currentUser) {
      supabase.from('voice_dnas')
        .update({ name: newName.trim() })
        .eq('vd_code', code)
        .eq('user_id', currentUser.id)
        .then((res: any) => {
          if (res.error) console.error("Failed to sync updated Voice DNA name to Supabase:", res.error);
        });
    }
    setEditingVoiceCode(null);
  };

  // ─── Decode VSC Code ───────────────────────────────────────────────────────
  const handleDecode = () => {
    setDecodeError("");
    setDecodedData(null);

    let matched = defaultSystemVoices[decodeInput];
    if (!matched) {
      matched = customVoices.find(v => v.vd_code === decodeInput) as VoiceDnaRecord;
    }

    if (matched) {
      const { tags } = buildVoicePromptFromAttributes(matched);
      setDecodedData({
        ...matched,
        compiledTags: tags
      });
    } else {
      setDecodeError("유효하지 않은 Voice DNA 코드입니다. (예: VD-1004)");
    }
  };

  // ─── Preset Loading ────────────────────────────────────────────────────────
  const loadPresetToSliders = (preset: VoiceDnaRecord) => {
    setStageName(preset.name);
    setGender(preset.physical_layers.gender === "male" ? "male" : "female");
    setAge(preset.physical_layers.age || "young");
    setPitch(preset.physical_layers.pitch || 50);
    setBrightness(preset.physical_layers.brightness || 50);
    setChestResonance(preset.physical_layers.chest || 50);
    setHeadResonance(preset.physical_layers.head || 50);
    setWeight(preset.physical_layers.weight || 50);
    
    setPower(preset.performance?.power || 50);
    setDynamics(preset.performance?.dynamics || 50);
    setVibrato(preset.performance?.vibrato || 50);
    setGroove(preset.performance?.groove || 50);
    setNoiseEntropy(preset.noise_entropy ?? 15);
    
    setSelectedTextures(preset.textures || []);
    setSelectedEmotions(preset.emotions || []);
    setSelectedReverb(preset.style || "Studio");
    
    // Restore generated audio URLs to the Design Tab if saved
    const savedAudioUrl = preset.audio_url || preset.physical_layers?.audio_url || null;
    const savedAudioUrlB = preset.audio_url_b || preset.physical_layers?.audio_url_b || null;
    setDemoAudioUrl(savedAudioUrl);
    setDemoAudioUrlB(savedAudioUrlB);
    
    setActiveTab("design");
  };

  // ─── Textures & Emotions Pools ─────────────────────────────────────────────
  const TEXTURES = ["Velvet", "Silky", "Breathy", "Smoky", "Metallic", "Crystal", "Glass", "Wood", "Cotton"];
  const EMOTIONS = ["Hopeful", "Lonely", "Broken", "Romantic", "Dark", "Powerful", "Dreamy", "Calm", "Passionate"];
  const REVERBS = ["Concert Hall", "Arena", "Studio", "Rain Cafe", "Sunset Beach"];

  const toggleTexture = (t: string) => {
    setSelectedTextures(prev => 
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t].slice(0, 3) // Max 3
    );
  };

  const toggleEmotion = (e: string) => {
    setSelectedEmotions(prev => 
      prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e].slice(0, 3) // Max 3
    );
  };

  // ─── 유명 가수 보이스 매핑 데이터베이스 ───────────────────────────────────
  const singerDatabase: Record<string, any> = {
    "임재범": {
      name: "임재범",
      conceptName: "Rusty Sandstorm (바리톤 락)",
      gender: "male",
      age: "mature",
      pitch: 30,
      brightness: 35,
      chestResonance: 95,
      headResonance: 30,
      weight: 85,
      power: 90,
      dynamics: 80,
      vibrato: 85,
      groove: 60,
      noiseEntropy: 15,
      textures: ["Smoky", "Rough", "Velvet"],
      emotions: ["Lonely", "Broken", "Romantic"],
      style: "Arena",
      desc: "거칠게 긁히는 사포 같은 질감과 묵직한 흉성이 가득한 로우 바리톤 보이스. 절규하듯 감정을 토해내는 횃불 같은 음색입니다."
    },
    "화사": {
      name: "화사",
      conceptName: "Midnight Velvet (R&B 스모키)",
      gender: "female",
      age: "young",
      pitch: 50,
      brightness: 50,
      chestResonance: 75,
      headResonance: 60,
      weight: 65,
      power: 80,
      dynamics: 75,
      vibrato: 70,
      groove: 85,
      noiseEntropy: 12,
      textures: ["Smoky", "Velvet", "Breathy"],
      emotions: ["Romantic", "Passionate", "Dreamy"],
      style: "Studio",
      desc: "부드럽지만 살짝 거친 벨벳 허스키 질감의 로우톤 보이스. 힘을 빼고 가까이에서 속삭이는 R&B 소울 그루브 음색입니다."
    },
    "아이유": {
      name: "아이유",
      conceptName: "Whispering Breeze (감성 포크)",
      gender: "female",
      age: "young",
      pitch: 80,
      brightness: 85,
      chestResonance: 45,
      headResonance: 75,
      weight: 45,
      power: 65,
      dynamics: 70,
      vibrato: 65,
      groove: 75,
      noiseEntropy: 10,
      textures: ["Silky", "Breathy", "Clean"],
      emotions: ["Hopeful", "Dreamy", "Calm"],
      style: "Concert Hall",
      desc: "맑고 깨끗한 진성과 속삭이는 듯한 반가성 호흡(공기 반 소리 반) 보이스"
    },
    "박효신": {
      name: "박효신",
      conceptName: "Deep Cathedral (소울 발라드)",
      gender: "male",
      age: "young",
      pitch: 45,
      brightness: 55,
      chestResonance: 80,
      headResonance: 75,
      weight: 70,
      power: 85,
      dynamics: 85,
      vibrato: 90,
      groove: 70,
      noiseEntropy: 8,
      textures: ["Velvet", "Crystal", "Silky"],
      emotions: ["Broken", "Romantic", "Passionate"],
      style: "Concert Hall",
      desc: "두껍고 어두운 저음과 부드럽게 감싸안는 풍부한 바이브레이션 미성 보이스"
    },
    "태연": {
      name: "태연",
      conceptName: "Crystal Raindrop (청량 팝)",
      gender: "female",
      age: "young",
      pitch: 75,
      brightness: 80,
      chestResonance: 50,
      headResonance: 85,
      weight: 50,
      power: 85,
      dynamics: 80,
      vibrato: 75,
      groove: 75,
      noiseEntropy: 12,
      textures: ["Crystal", "Clean", "Silky"],
      emotions: ["Powerful", "Hopeful", "Broken"],
      style: "Concert Hall",
      desc: "시원하게 뻗어나가는 청량한 음색과 넓은 음역대를 넘나드는 크리스탈 보컬"
    },
    "아델": {
      name: "아델",
      conceptName: "Stormy Soul (소울 디바)",
      gender: "female",
      age: "young",
      pitch: 60,
      brightness: 70,
      chestResonance: 85,
      headResonance: 70,
      weight: 80,
      power: 95,
      dynamics: 90,
      vibrato: 80,
      groove: 65,
      noiseEntropy: 15,
      textures: ["Smoky", "Velvet", "Rough"],
      emotions: ["Powerful", "Broken", "Dark"],
      style: "Arena",
      desc: "가슴을 저미는 짙은 소울 톤과 거대한 공간을 압도하는 파워풀 스모키 체스트 보이스"
    }
  };

  const handleSingerSearch = () => {
    if (!singerQuery.trim()) return;
    setIsSearchingSinger(true);
    setAnalyzedSinger(null);

    setTimeout(() => {
      const normalized = singerQuery.trim().toLowerCase();
      let found = null;
      
      for (const k of Object.keys(singerDatabase)) {
        if (k.toLowerCase() === normalized || normalized.includes(k.toLowerCase()) || k.toLowerCase().includes(normalized)) {
          found = singerDatabase[k];
          break;
        }
      }

      if (found) {
        setAnalyzedSinger(found);
        setCustomSingerName(found.conceptName);
      } else {
        const fallbackSinger = {
          name: singerQuery,
          conceptName: `${singerQuery} Concept Tone`,
          gender: Math.random() > 0.5 ? "female" : "male",
          age: Math.random() > 0.5 ? "young" : "mature",
          pitch: Math.floor(Math.random() * 40) + 40,
          brightness: Math.floor(Math.random() * 40) + 45,
          chestResonance: Math.floor(Math.random() * 50) + 35,
          headResonance: Math.floor(Math.random() * 40) + 45,
          weight: Math.floor(Math.random() * 40) + 45,
          power: Math.floor(Math.random() * 30) + 60,
          dynamics: Math.floor(Math.random() * 30) + 55,
          vibrato: Math.floor(Math.random() * 40) + 45,
          groove: Math.floor(Math.random() * 40) + 50,
          noiseEntropy: Math.floor(Math.random() * 15) + 10,
          textures: [TEXTURES[Math.floor(Math.random() * TEXTURES.length)], TEXTURES[Math.floor(Math.random() * TEXTURES.length)]].filter(Boolean),
          emotions: [EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)], EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)]].filter(Boolean),
          style: REVERBS[Math.floor(Math.random() * REVERBS.length)],
          desc: `가수 ${singerQuery}님의 시그니처 배음과 성대 특성을 추출 복원해낸 AI 시뮬레이션 보컬 특성`
        };
        setAnalyzedSinger(fallbackSinger);
        setCustomSingerName(fallbackSinger.conceptName);
      }
      setIsSearchingSinger(false);
    }, 1200);
  };

  // Dynamic description generator for the designed voice DNA
  const getDynamicDescription = () => {
    let toneDesc = "";
    if (brightness > 70 && pitch > 70) {
      toneDesc = "맑고 청아하며 화사한 고음역대";
    } else if (brightness > 70 && pitch <= 70) {
      toneDesc = "투명하고 깔끔하며 안정감 있는 미들 톤";
    } else if (brightness <= 70 && pitch > 70) {
      toneDesc = "독특한 음색을 지닌 개성 있는 하이 피치";
    } else {
      toneDesc = "묵직하고 따뜻하며 감성적인 저음역대";
    }

    const genderKorean = gender === "female" ? "여성" : "남성";
    
    return {
      summaryPrefix: "설계한 DNA는 다음과 같은 이유로 ",
      summaryBold: `${genderKorean} ${toneDesc}`,
      summarySuffix: " 사운드의 특성을 보입니다:",
      bullets: [
        pitch > 60 
          ? `Pitch: ${pitch}% (맑고 산뜻한 고피치 보컬 대역 확보)` 
          : pitch >= 40 
            ? `Pitch: ${pitch}% (자연스럽고 편안한 표준 미들 톤 음역대)` 
            : `Pitch: ${pitch}% (깊이 있고 묵직한 로우 피치 대역 형성)`,
        
        brightness > 60 
          ? `Brightness: ${brightness}% (고음역 배음이 강조되어 투명하고 청량함)` 
          : `Brightness: ${brightness}% (차분하고 밀도 높은 중저음 위주의 배음)`,
          
        chestResonance > 60 
          ? `Chest Resonance: ${chestResonance}% (풍부하고 웅장한 흉성 울림 발생)` 
          : chestResonance >= 40 
            ? `Chest Resonance: ${chestResonance}% (균형 잡힌 자연스러운 호흡 음색)` 
            : `Chest Resonance: ${chestResonance}% (가볍고 투명한 비성 대역 유도)`,
            
        headResonance > 60 
          ? `Head Resonance: ${headResonance}% (청아하고 곧게 뻗어나가는 두성 발성 극대화)` 
          : `Head Resonance: ${headResonance}% (차분하고 안정감 있는 흉성 위주의 발성)`,
          
        power > 60 
          ? `Power: ${power}% (성량이 풍부하며 컴프레션이 적용된 파워풀한 가창력)` 
          : `Power: ${power}% (호흡이 많이 가미된 속삭이듯 섬세하고 부드러운 가창)`,

        noiseEntropy > 40
          ? `Noise Entropy: ${noiseEntropy}% (아날로그 배음 성분을 추가하여 차갑고 건조한 기계음 억제)`
          : `Noise Entropy: ${noiseEntropy}% (기계음 변동이 억제되어 깔끔하고 플랫한 현대적 톤)`,
          
        selectedTextures.length > 0
          ? `Texture: ${selectedTextures.join(', ')} 질감의 음색 재질 레이어 합성`
          : null,
          
        selectedEmotions.length > 0
          ? `Emotion: ${selectedEmotions.join(', ')} 보컬 감정 표현 이입`
          : null,

        selectedReverb 
          ? `Reverb: [${selectedReverb}] 공간계 반사 잔향 효과 적용` 
          : null
      ].filter(Boolean) as string[]
    };
  };

  const dynamicDesc = getDynamicDescription();

  return (
    <div className="max-w-6xl mx-auto pt-2 min-h-screen flex flex-col no-scrollbar relative">
      
      {/* ─── 4. Interactive Tutorial Overlay ────────────────────────────────────── */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[99] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-950 border border-fuchsia-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl relative"
            >
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] uppercase font-mono tracking-widest text-fuchsia-400 font-bold">DNA Guide Step {tutorialStep + 1} of {tutorialSteps.length}</span>
                <button 
                  onClick={() => setShowTutorial(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 font-bold"
                >
                  Skip Tour
                </button>
              </div>

              <h3 className="text-lg font-bold text-white mb-2">{tutorialSteps[tutorialStep].title}</h3>
              <p className="text-zinc-400 text-xs leading-relaxed mb-6">
                {tutorialSteps[tutorialStep].description}
              </p>

              <div className="flex justify-between items-center">
                <button
                  disabled={tutorialStep === 0}
                  onClick={() => setTutorialStep(prev => prev - 1)}
                  className="px-3.5 py-1.5 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-white disabled:opacity-30 transition-all flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Prev
                </button>

                <div className="flex gap-1">
                  {tutorialSteps.map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`w-1.5 h-1.5 rounded-full transition-all ${idx === tutorialStep ? "bg-fuchsia-400 w-3" : "bg-zinc-800"}`} 
                    />
                  ))}
                </div>

                {tutorialStep < tutorialSteps.length - 1 ? (
                  <button
                    onClick={() => setTutorialStep(prev => prev + 1)}
                    className="px-3.5 py-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-bold transition-all flex items-center gap-1"
                  >
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowTutorial(false);
                      setTutorialStep(0);
                    }}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1"
                  >
                    Done <Check className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Header (통일된 표준 브랜드 헤더) ──────────────────────────────────────────────────────────── */}
      <header className="mb-8 border-b border-white/10 pb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">VoiceDNA Studio</h1>
          <p className="text-zinc-400 text-sm">인격(Person)이 아닌 음향 특징(Attribute)을 합성하여 Virtual Artist의 고유 목소리를 코딩합니다.</p>
        </div>

        {/* Action controls */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setTutorialStep(0);
              setShowTutorial(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-300 flex items-center gap-1.5 transition-all"
          >
            <QuestionIcon className="w-4 h-4 text-fuchsia-400" /> 초보자 가이드 투어
          </button>
          
          <AnimatePresence>
            {lastSavedDna && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2 text-xs font-semibold shadow-lg shadow-emerald-500/5 z-[70]"
              >
                <CheckCircle className="w-4 h-4" />
                <span>성공적으로 저장되었습니다! 코드: {lastSavedDna}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* ─── 5. 1초 완성 퀵스타트 템플릿 섹션 (초보자 최우선 개선) ───────────────── */}
      <section className="mb-6 bg-zinc-950/40 border border-white/5 rounded-2xl p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-fuchsia-400 animate-pulse" /> 1초 퀵스타트 템플릿
          </h3>
          <p className="text-[10px] text-zinc-500 mt-1 font-medium">
            ※ 아래 템플릿 선택 시 'Voice DNA Designer' 메뉴에서 원하는 보컬 보이스 디자인 하기
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <button 
            onClick={() => loadQuickStartTemplate("whisperer")}
            className={`flex items-center gap-4 p-3 rounded-xl text-left transition-all group border ${
              activeQuickStart === "whisperer" 
                ? "bg-fuchsia-500/10 border-fuchsia-500/60 shadow-lg shadow-fuchsia-500/5" 
                : "bg-black/40 hover:bg-fuchsia-950/10 border-white/5 hover:border-fuchsia-500/30"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
              activeQuickStart === "whisperer" 
                ? "bg-fuchsia-500/25 border-fuchsia-500/40" 
                : "bg-fuchsia-500/10 border-fuchsia-500/20 group-hover:bg-fuchsia-500/20"
            }`}>
              <Heart className="w-5 h-5 text-fuchsia-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">감성 발라드 (Warm Whisperer)</div>
              <div className="text-[10px] text-zinc-500 leading-normal mt-0.5">숨소리가 많은 벨벳 질감의 따뜻하고 편안한 음색</div>
            </div>
          </button>

          <button 
            onClick={() => loadQuickStartTemplate("belter")}
            className={`flex items-center gap-4 p-3 rounded-xl text-left transition-all group border ${
              activeQuickStart === "belter" 
                ? "bg-purple-500/10 border-purple-500/60 shadow-lg shadow-purple-500/5" 
                : "bg-black/40 hover:bg-purple-950/10 border-white/5 hover:border-purple-500/30"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
              activeQuickStart === "belter" 
                ? "bg-purple-500/25 border-purple-500/40" 
                : "bg-purple-500/10 border-purple-500/20 group-hover:bg-purple-500/20"
            }`}>
              <Sliders className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">파워풀 락 보컬 (Steel Belter)</div>
              <div className="text-[10px] text-zinc-500 leading-normal mt-0.5">금속성 배음이 강하고 가창력이 돋보이는 웅장한 목소리</div>
            </div>
          </button>

          <button 
            onClick={() => loadQuickStartTemplate("diva")}
            className={`flex items-center gap-4 p-3 rounded-xl text-left transition-all group border ${
              activeQuickStart === "diva" 
                ? "bg-cyan-500/10 border-cyan-500/60 shadow-lg shadow-cyan-500/5" 
                : "bg-black/40 hover:bg-cyan-950/10 border-white/5 hover:border-cyan-500/30"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
              activeQuickStart === "diva" 
                ? "bg-cyan-500/25 border-cyan-500/40" 
                : "bg-cyan-500/10 border-cyan-500/20 group-hover:bg-cyan-500/20"
            }`}>
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">청아한 소프라노 (Crystal Diva)</div>
              <div className="text-[10px] text-zinc-500 leading-normal mt-0.5">크리스탈처럼 맑고 깨끗하게 뻗어나가는 팝 보컬</div>
            </div>
          </button>

          <button 
            onClick={() => loadQuickStartTemplate("baritone")}
            className={`flex items-center gap-4 p-3 rounded-xl text-left transition-all group border ${
              activeQuickStart === "baritone" 
                ? "bg-indigo-500/10 border-indigo-500/60 shadow-lg shadow-indigo-500/5" 
                : "bg-black/40 hover:bg-indigo-950/10 border-white/5 hover:border-indigo-500/30"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
              activeQuickStart === "baritone" 
                ? "bg-indigo-500/25 border-indigo-500/40" 
                : "bg-indigo-500/10 border-indigo-500/20 group-hover:bg-indigo-500/20"
            }`}>
              <Disc className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">재즈 벨벳 바리톤 (Midnight Baritone)</div>
              <div className="text-[10px] text-zinc-500 leading-normal mt-0.5">낮고 묵직한 가슴 울림의 감미롭고 부드러운 중저음</div>
            </div>
          </button>

          <button 
            onClick={() => loadQuickStartTemplate("soul")}
            className={`flex items-center gap-4 p-3 rounded-xl text-left transition-all group border ${
              activeQuickStart === "soul" 
                ? "bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-500/5" 
                : "bg-black/40 hover:bg-amber-950/10 border-white/5 hover:border-amber-500/30"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
              activeQuickStart === "soul" 
                ? "bg-amber-500/25 border-amber-500/40" 
                : "bg-amber-500/10 border-amber-500/20 group-hover:bg-amber-500/20"
            }`}>
              <Music className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">레트로 R&B 소울 (Golden Retro Soul)</div>
              <div className="text-[10px] text-zinc-500 leading-normal mt-0.5">그루비하고 감정선이 깊은 소울풀한 알앤비 음색</div>
            </div>
          </button>

          <button 
            onClick={() => loadQuickStartTemplate("indie")}
            className={`flex items-center gap-4 p-3 rounded-xl text-left transition-all group border ${
              activeQuickStart === "indie" 
                ? "bg-emerald-500/10 border-emerald-500/60 shadow-lg shadow-emerald-500/5" 
                : "bg-black/40 hover:bg-emerald-950/10 border-white/5 hover:border-emerald-500/30"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
              activeQuickStart === "indie" 
                ? "bg-emerald-500/25 border-emerald-500/40" 
                : "bg-emerald-500/10 border-emerald-500/20 group-hover:bg-emerald-500/20"
            }`}>
              <Layers className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">인디 어쿠스틱 브리즈 (Acoustic Breeze)</div>
              <div className="text-[10px] text-zinc-500 leading-normal mt-0.5">맑고 따뜻한 감성으로 편안하게 속삭이는 포크 보컬</div>
            </div>
          </button>

          <button 
            onClick={() => loadQuickStartTemplate("hiphop")}
            className={`flex items-center gap-4 p-3 rounded-xl text-left transition-all group border ${
              activeQuickStart === "hiphop" 
                ? "bg-rose-500/10 border-rose-500/60 shadow-lg shadow-rose-500/5" 
                : "bg-black/40 hover:bg-rose-950/10 border-white/5 hover:border-rose-500/30"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
              activeQuickStart === "hiphop" 
                ? "bg-rose-500/25 border-rose-500/40" 
                : "bg-rose-500/10 border-rose-500/20 group-hover:bg-rose-500/20"
            }`}>
              <Mic2 className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">트렌디 힙합 래퍼 (Street Lyricist)</div>
              <div className="text-[10px] text-zinc-500 leading-normal mt-0.5">딕션이 뚜렷하고 리드미컬한 로우-미드톤 랩 보컬</div>
            </div>
          </button>

          <button 
            onClick={() => loadQuickStartTemplate("dance")}
            className={`flex items-center gap-4 p-3 rounded-xl text-left transition-all group border ${
              activeQuickStart === "dance" 
                ? "bg-yellow-500/10 border-yellow-500/60 shadow-lg shadow-yellow-500/5" 
                : "bg-black/40 hover:bg-yellow-950/10 border-white/5 hover:border-yellow-500/30"
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
              activeQuickStart === "dance" 
                ? "bg-yellow-500/25 border-yellow-500/40" 
                : "bg-yellow-500/10 border-yellow-500/20 group-hover:bg-yellow-500/20"
            }`}>
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">일렉트릭 댄스 디바 (Neon Electro Diva)</div>
              <div className="text-[10px] text-zinc-500 leading-normal mt-0.5">시원한 발성과 에너제틱한 비트 위의 클럽 댄스 보컬</div>
            </div>
          </button>
        </div>
      </section>

      {/* ─── 6. 유명 가수 음색 분석 검색기 (초우선 연동 추가) ───────────────── */}
      <section className="mb-6 bg-zinc-950/40 border border-white/5 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" /> 유명 가수 시그니처 음색 분석 & 즐겨찾기
        </h3>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={singerQuery}
            onChange={(e) => setSingerQuery(e.target.value)}
            placeholder="가수 이름을 입력하세요 (예: 임재범, 화사, 아이유, 박효신, 태연, 아델...)"
            className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white outline-none focus:border-cyan-500/50"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSingerSearch();
            }}
          />
          <button
            onClick={handleSingerSearch}
            disabled={isSearchingSinger || !singerQuery.trim()}
            className="px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 text-white text-xs font-bold transition-all flex items-center gap-1.5"
          >
            {isSearchingSinger ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                음색 모델 분석
              </>
            )}
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 leading-normal mb-4">
          ℹ️ <b>음향 특징 기반 분석 고지 (Legal Safety Disclaimer)</b>: 본 검색 시스템은 특정 가수의 목소리나 음원을 직접 복제하여 도용하지 않습니다. 사용자의 편의를 위해 가수가 가진 고유의 <b>음향적 공명(Resonance), 음색 질감(Textures), 표현 다이내믹스(Dynamics)</b>의 특징 비율을 AI 분석 가이드라인으로 변환하여, 브랜드 상표권 및 저작권에 무해한 순수 물리적 음향 서술자(Acoustic Descriptors) 기반 프롬프트를 발급합니다.
        </p>

        {/* Scan Result Card */}
        <AnimatePresence>
          {analyzedSinger && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="p-4 rounded-xl bg-cyan-950/10 border border-cyan-500/20 grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
            >
              <div className="md:col-span-8 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-[9px] text-cyan-400 font-bold font-mono">Concept Suggestion: {analyzedSinger.conceptName}</span>
                  <h4 className="text-sm font-bold text-white">{analyzedSinger.name} 시그니처 톤</h4>
                </div>
                <p className="text-[11px] text-cyan-300/80 leading-relaxed font-medium">
                  {analyzedSinger.desc}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {analyzedSinger.textures.map((t: string) => (
                    <span key={t} className="px-2 py-0.5 rounded bg-black/40 text-[9px] text-zinc-400 border border-white/5">{t}</span>
                  ))}
                  {analyzedSinger.emotions.map((e: string) => (
                    <span key={e} className="px-2 py-0.5 rounded bg-black/40 text-[9px] text-zinc-400 border border-white/5">{e}</span>
                  ))}
                  <span className="px-2 py-0.5 rounded bg-cyan-950/40 text-[9px] text-cyan-400 font-semibold border border-cyan-500/10">{analyzedSinger.style} 반향</span>
                </div>

                {/* Editable Voice Name Input (English Only recommendation) */}
                <div className="pt-3 space-y-1">
                  <label className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider block">나만의 보이스 명 설정 (English Name for easy recall)</label>
                  <input
                    type="text"
                    value={customSingerName}
                    onChange={(e) => setCustomSingerName(e.target.value.replace(/[^a-zA-Z0-9\s-_()]/g, ''))} // Filter to English / basic symbols
                    placeholder="Enter custom voice name in English"
                    className="w-full bg-black/60 border border-cyan-500/30 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/80"
                  />
                  <span className="text-[9px] text-zinc-500 block">※ 음원 생성 시 쉽게 구분할 수 있도록 직관적인 영문명을 입력하세요.</span>
                </div>
              </div>
              <div className="md:col-span-4 flex flex-col gap-2">
                <button
                  onClick={() => {
                    setStageName(customSingerName.trim() || analyzedSinger.conceptName);
                    setGender(analyzedSinger.gender);
                    setAge(analyzedSinger.age);
                    setPitch(analyzedSinger.pitch);
                    setBrightness(analyzedSinger.brightness);
                    setChestResonance(analyzedSinger.chestResonance);
                    setHeadResonance(analyzedSinger.headResonance);
                    setWeight(analyzedSinger.weight);
                    setPower(analyzedSinger.power);
                    setDynamics(analyzedSinger.dynamics);
                    setVibrato(analyzedSinger.vibrato);
                    setGroove(analyzedSinger.groove);
                    setNoiseEntropy(analyzedSinger.noiseEntropy);
                    setSelectedTextures(analyzedSinger.textures);
                    setSelectedEmotions(analyzedSinger.emotions);
                    setSelectedReverb(analyzedSinger.style);
                    setActiveTab("design");
                  }}
                  className="w-full py-2 rounded-lg bg-fuchsia-600/20 hover:bg-fuchsia-600/30 text-fuchsia-300 text-[11px] font-bold border border-fuchsia-500/30 transition-all text-center cursor-pointer shadow-[0_0_12px_rgba(217,70,239,0.05)]"
                >
                  보이스 디자인 후 음원 듣기
                </button>
                <div className="text-[9px] text-center text-zinc-500 py-0.5">ℹ️ 저장 시 지정한 이름으로 보관함에 즐겨찾기됩니다.</div>
                <button
                  onClick={() => {
                    const vdCode = `VD-${Math.floor(Math.random() * 9000 + 1000)}`;
                    const savedName = customSingerName.trim() || analyzedSinger.conceptName;
                    const newDna: VoiceDnaRecord = {
                      vd_code: vdCode,
                      name: savedName,
                      physical_layers: {
                        gender: analyzedSinger.gender,
                        age: analyzedSinger.age,
                        pitch: analyzedSinger.pitch,
                        brightness: analyzedSinger.brightness,
                        chest: analyzedSinger.chestResonance,
                        head: analyzedSinger.headResonance,
                        weight: analyzedSinger.weight
                      },
                      textures: analyzedSinger.textures,
                      emotions: analyzedSinger.emotions,
                      performance: {
                        power: analyzedSinger.power,
                        dynamics: analyzedSinger.dynamics,
                        vibrato: analyzedSinger.vibrato,
                        groove: analyzedSinger.groove
                      },
                      style: analyzedSinger.style,
                      noise_entropy: analyzedSinger.noiseEntropy
                    };

                    const updated = [newDna, ...customVoices];
                    setCustomVoices(updated);
                    localStorage.setItem("custom_voice_dnas", JSON.stringify(updated));
                    setLastSavedDna(vdCode);

                    // Supabase DB Sync
                    if (currentUser) {
                      supabase.from('voice_dnas').insert({
                        vd_code: vdCode,
                        name: savedName,
                        physical_layers: {
                          gender: analyzedSinger.gender,
                          age: analyzedSinger.age,
                          pitch: analyzedSinger.pitch,
                          brightness: analyzedSinger.brightness,
                          chest: analyzedSinger.chestResonance,
                          head: analyzedSinger.headResonance,
                          weight: analyzedSinger.weight
                        },
                        textures: analyzedSinger.textures,
                        emotions: analyzedSinger.emotions,
                        performance: {
                          power: analyzedSinger.power,
                          dynamics: analyzedSinger.dynamics,
                          vibrato: analyzedSinger.vibrato,
                          groove: analyzedSinger.groove
                        },
                        style: analyzedSinger.style,
                        noise_entropy: analyzedSinger.noiseEntropy,
                        user_id: currentUser.id
                      }).then((res: any) => {
                        if (res.error) console.error("Failed to sync custom Voice DNA to Supabase:", res.error);
                      });
                    }

                    setAnalyzedSinger(null);
                    setSingerQuery("");
                    setTimeout(() => setLastSavedDna(null), 4000);
                  }}
                  className="w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold transition-all text-center shadow-lg shadow-cyan-600/10"
                >
                  내 보관함에 저장 & 즐겨찾기
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ─── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-6 border-b border-white/5 pb-2 overflow-x-auto no-scrollbar shrink-0">
        <button 
          onClick={() => setActiveTab("explore")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all shrink-0 ${activeTab === "explore" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-400 hover:text-zinc-200"}`}
        >
          Explore Voices
        </button>
        <button 
          onClick={() => setActiveTab("design")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all shrink-0 ${activeTab === "design" ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20" : "text-zinc-400 hover:text-zinc-200"}`}
        >
          Voice DNA Designer
        </button>
        <button 
          onClick={() => setActiveTab("collections")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all shrink-0 flex items-center gap-1.5 ${activeTab === "collections" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" : "text-zinc-400 hover:text-zinc-200"}`}
        >
          <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500 shrink-0 animate-pulse" />
          <span>Voice Collections</span>
        </button>
        <button 
          onClick={() => setActiveTab("decoder")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all shrink-0 ${activeTab === "decoder" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-zinc-400 hover:text-zinc-200"}`}
        >
          DNA Decoder & Debugger
        </button>
      </div>

      {/* ─── Main Content Grid ───────────────────────────────────────────────── */}
      <div className="flex-1 min-h-[500px] pb-10">
        
        {/* TAB 0: EXPLORE VOICES */}
        {activeTab === "explore" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Filter Cockpit */}
            <div className="glass-panel p-6 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={expSearchQuery}
                    onChange={(e) => setExpSearchQuery(e.target.value)}
                    placeholder="보이스 이름, 설명, 태그 검색..."
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-cyan-500/50 transition-colors"
                  />
                  {expSearchQuery && (
                    <button
                      onClick={() => setExpSearchQuery("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-3 shrink-0">
                  <div className="flex flex-col gap-1">
                    <select
                      value={expLanguage}
                      onChange={(e) => setExpLanguage(e.target.value)}
                      className="px-3 py-2.5 rounded-xl text-xs bg-black/40 border border-white/5 text-zinc-300 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="all">모든 언어 (All Languages)</option>
                      <option value="Korean">한국어 (Korean)</option>
                      <option value="English">영어 (English)</option>
                      <option value="Japanese">일본어 (Japanese)</option>
                    </select>
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <select
                      value={expGender}
                      onChange={(e) => setExpGender(e.target.value)}
                      className="px-3 py-2.5 rounded-xl text-xs bg-black/40 border border-white/5 text-zinc-300 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="all">모든 성별 (All Genders)</option>
                      <option value="female">여성 보컬 (Female)</option>
                      <option value="male">남성 보컬 (Male)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Tag Selection Chips */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                {['Soprano', 'Baritone', 'Tenor', 'Alto', 'Husky', 'Smooth', 'Powerful', 'Calm', 'Dreamy', 'Dark'].map((tag) => {
                  const isSelected = expSelectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        setExpSelectedTags(prev => 
                          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        )
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        isSelected 
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-lg shadow-cyan-500/5' 
                          : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
                {expSelectedTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpSelectedTags([])}
                    className="px-3 py-1.5 rounded-full text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
                  >
                    필터 초기화 (Reset)
                  </button>
                )}
              </div>
            </div>

            {/* Voices List Grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" /> Trending Voices & Vocalists ({EXPLORE_VOICES.length})
                </h3>
                <span className="text-[11px] text-zinc-500">실시간 인기 보컬 리스트</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(() => {
                  const filtered = EXPLORE_VOICES.filter((voice) => {
                    if (expSearchQuery) {
                      const q = expSearchQuery.toLowerCase();
                      const matchesName = voice.name.toLowerCase().includes(q);
                      const matchesDesc = voice.desc.toLowerCase().includes(q);
                      const matchesTags = voice.tags.some(t => t.toLowerCase().includes(q));
                      if (!matchesName && !matchesDesc && !matchesTags) return false;
                    }
                    if (expLanguage !== 'all' && voice.language !== expLanguage) return false;
                    if (expGender !== 'all' && voice.gender !== expGender) return false;
                    if (expSelectedTags.length > 0) {
                      const hasAllTags = expSelectedTags.every(t => voice.tags.includes(t));
                      if (!hasAllTags) return false;
                    }
                    return true;
                  });

                  const itemsPerPage = 10;
                  const totalPages = Math.ceil(filtered.length / itemsPerPage);
                  const safePage = Math.min(expCurrentPage, Math.max(1, totalPages));
                  const startIndex = (safePage - 1) * itemsPerPage;
                  const paginated = filtered.slice(startIndex, startIndex + itemsPerPage);

                  return (
                    <>
                      {paginated.map((voice) => {
                        const isFav = customVoices.some(v => v.vd_code === voice.code);
                        const isPlaying = explorePlayingVoiceId === voice.code;

                        return (
                          <div
                            key={voice.code}
                            className="glass-panel p-2.5 px-3.5 hover:border-cyan-500/20 transition-all duration-300 group flex items-center gap-3 relative overflow-hidden"
                          >
                            {/* Avatar & Play/Pause Trigger - Circular Color Orb */}
                            <div 
                              className="relative w-10 h-10 shrink-0 rounded-full overflow-hidden flex items-center justify-center border border-white/10 transition-transform group-hover:scale-105 cursor-pointer shadow-md"
                              style={{ background: (voice as any).gradient }}
                              onClick={() => isPlaying ? stopExploreVoiceDemo() : playExploreVoiceDemo(voice)}
                            >
                              {/* Play Overlay */}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                {isPlaying ? (
                                  <Pause className="w-3.5 h-3.5 fill-white text-white" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
                                )}
                              </div>

                              {isPlaying && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                  <span className="flex gap-0.5 items-end justify-center w-5 h-5">
                                    <span className="w-0.5 h-2 bg-white rounded-full animate-[bounce_0.6s_infinite]" />
                                    <span className="w-0.5 h-3 bg-white rounded-full animate-[bounce_0.6s_infinite_0.15s]" />
                                    <span className="w-0.5 h-1.5 bg-white rounded-full animate-[bounce_0.6s_infinite_0.3s]" />
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Details - Compact & Tightly Spaced */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-base leading-none shrink-0" title={voice.language}>{voice.flag}</span>
                                <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors truncate leading-tight">
                                  {voice.name}
                                </h4>
                                <span className="text-[9px] text-zinc-500 font-medium truncate hidden sm:inline">
                                  ({voice.language})
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-400 leading-tight mt-0.5 truncate max-w-[170px] sm:max-w-none">
                                {voice.desc}
                              </p>
                              
                              {/* Tags list - only on sm+ to prevent squishing on narrow mobile screens */}
                              <div className="hidden sm:flex flex-wrap gap-1 mt-1">
                                {voice.tags.slice(0, 3).map(t => (
                                  <span key={t} className="px-1.5 py-0.2 rounded bg-black/40 text-[9px] text-zinc-500 border border-white/5">{t}</span>
                                ))}
                              </div>
                            </div>

                            {/* Actions - Slimmed & Responsive */}
                            <div className="flex flex-col items-end justify-between self-stretch shrink-0 gap-1.5">
                              <span className="text-[9px] text-zinc-500 font-semibold">{voice.plays} plays</span>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  const isFav = customVoices.some(v => v.vd_code === voice.code);
                                  let updated;
                                  if (isFav) {
                                    updated = customVoices.filter(v => v.vd_code !== voice.code);
                                  } else {
                                    const newDna: VoiceDnaRecord = {
                                      vd_code: voice.code,
                                      name: voice.name,
                                      physical_layers: voice.physical_layers as any,
                                      textures: voice.textures,
                                      emotions: voice.emotions,
                                      style: voice.category,
                                      noise_entropy: 15
                                    };
                                    updated = [...customVoices, newDna];
                                  }
                                  setCustomVoices(updated);
                                  localStorage.setItem("custom_voice_dnas", JSON.stringify(updated));
                                }}
                                className={`flex items-center gap-1 transition-all rounded-lg border px-2 py-1 text-[9px] font-bold ${
                                  isFav 
                                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                                    : 'bg-zinc-900 border-white/5 text-zinc-400 hover:border-cyan-500/30 hover:text-cyan-300'
                                }`}
                              >
                                {isFav ? (
                                  <>
                                    <Heart className="w-3 h-3 fill-purple-400 text-purple-400" />
                                    <span className="hidden sm:inline">즐겨찾기 해제</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    <span className="hidden sm:inline">즐겨찾기 추가</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Pagination block */}
                      {totalPages > 1 && (
                        <div className="col-span-1 md:col-span-2 flex items-center justify-center gap-1 pt-4 pb-2 shrink-0">
                          <button
                            type="button"
                            disabled={safePage === 1}
                            onClick={() => setExpCurrentPage(prev => Math.max(1, prev - 1))}
                            className="w-7 h-7 rounded-lg border border-white/5 flex items-center justify-center bg-black/40 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                              key={page}
                              type="button"
                              onClick={() => setExpCurrentPage(page)}
                              className={`w-7 h-7 rounded-lg text-[10px] font-mono font-bold transition-all border ${
                                safePage === page
                                  ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30 shadow-lg"
                                  : "bg-black/40 text-zinc-500 border-white/5 hover:text-zinc-300"
                              }`}
                            >
                              {page}
                            </button>
                          ))}

                          <button
                            type="button"
                            disabled={safePage === totalPages}
                            onClick={() => setExpCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            className="w-7 h-7 rounded-lg border border-white/5 flex items-center justify-center bg-black/40 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-400 transition-colors"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

          </div>
        )}

        {/* TAB 1: DESIGNER */}
        {activeTab === "design" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Box: Attribute Controller */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Box 1: Voice Source Selector */}
              <div id="source-selector" className="glass-panel p-6">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Database className="w-4 h-4 text-fuchsia-400" /> Voice Source 입력 방식
                </h3>

                <div className="grid grid-cols-4 gap-2 mb-4">
                  {(
                    [
                      { id: "default", label: "Default AI", desc: "순수 속성 합성" },
                      { id: "record", label: "Record Voice", desc: "즉석 마이크 녹음" },
                      { id: "upload", label: "Upload Audio", desc: "음성 파일 업로드" },
                      { id: "blend", label: "Voice Blend", desc: "기존 DNA 융합" }
                    ] as const
                  ).map(t => (
                    <button
                      key={t.id}
                      onClick={() => setVoiceType(t.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${voiceType === t.id ? "bg-fuchsia-600/10 border-fuchsia-500/50 text-fuchsia-300" : "bg-black/20 border-white/5 text-zinc-400 hover:bg-white/5"}`}
                    >
                      <div className="text-xs font-bold mb-0.5">{t.label}</div>
                      <div className="text-[9px] text-zinc-500 leading-tight">{t.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Dynamic Content based on Voice Source */}
                <AnimatePresence mode="wait">
                  {voiceType === "record" && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-400">마이크를 활성화하고 5초 이상 문장을 낭독해주세요.</span>
                        <span className="text-xs font-mono text-fuchsia-400">{recordingSeconds}s / 15s</span>
                      </div>
                      
                      <div className="flex gap-3 items-center">
                        <button
                          onClick={isRecording ? stopRecording : startRecording}
                          className={`px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${isRecording ? "bg-red-600 text-white animate-pulse" : "bg-fuchsia-600 hover:bg-fuchsia-500 text-white"}`}
                        >
                          <Mic2 className="w-4 h-4" />
                          {isRecording ? "Recording Stop" : "Start Live Record"}
                        </button>

                        {recordedBlob && !isRecording && (
                          <button
                            onClick={triggerDnaExtraction}
                            disabled={isAnalyzing}
                            className="px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 text-white text-xs font-semibold flex items-center gap-2 transition-all"
                          >
                            {isAnalyzing ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Analyzing DNA...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                Extract Voice DNA Attributes
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {voiceType === "upload" && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3"
                    >
                      <div className="border border-dashed border-zinc-700 hover:border-fuchsia-500 bg-black/20 rounded-lg p-5 text-center cursor-pointer transition-colors relative">
                        <input 
                          type="file" 
                          accept="audio/*"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              setUploadedFile(e.target.files[0]);
                            }
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                        <Upload className="w-6 h-6 text-zinc-500 mx-auto mb-2" />
                        <span className="text-[11px] text-zinc-400 block font-medium">
                          {uploadedFile ? uploadedFile.name : "WAV, MP3 음성 파일을 이곳에 드래그하거나 클릭하여 로드 (최대 10MB)"}
                        </span>
                      </div>

                      {uploadedFile && (
                        <button
                          onClick={triggerDnaExtraction}
                          disabled={isAnalyzing}
                          className="w-full py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-zinc-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                        >
                          {isAnalyzing ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Deconstructing Voice Print...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Extract Attributes from Uploaded File
                            </>
                          )}
                        </button>
                      )}
                    </motion.div>
                  )}

                  {voiceType === "blend" && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1.5 font-medium">Acoustic A Source (VSC)</label>
                          <select 
                            value={blendSourceA} 
                            onChange={e => setBlendSourceA(e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded-lg py-2 px-3 text-xs text-white outline-none"
                          >
                            {EXPLORE_VOICES.map(v => (
                              <option key={v.code} value={v.code}>{v.code} ({v.name} - {v.tags[0]})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1.5 font-medium">Acoustic B Source (VSC)</label>
                          <select 
                            value={blendSourceB} 
                            onChange={e => setBlendSourceB(e.target.value)}
                            className="w-full bg-black/60 border border-white/10 rounded-lg py-2 px-3 text-xs text-white outline-none"
                          >
                            {EXPLORE_VOICES.map(v => (
                              <option key={v.code} value={v.code}>{v.code} ({v.name} - {v.tags[0]})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                          <span>Voice A Ratio: {100 - blendRatio}%</span>
                          <span>Voice B Ratio: {blendRatio}%</span>
                        </div>
                        <input 
                           type="range" 
                           min="0"
                           max="100"
                           value={blendRatio}
                           onChange={e => setBlendRatio(Number(e.target.value))}
                           className="dna-slider slider-fuchsia" 
                           style={{
                             background: `linear-gradient(to right, #d946ef 0%, #d946ef ${blendRatio}%, rgba(255, 255, 255, 0.1) ${blendRatio}%, rgba(255, 255, 255, 0.1) 100%)`
                           }}
                         />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Box 2: Layers Slider Configurator */}
              <div id="sliders-box" className="glass-panel p-6 space-y-6">
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-fuchsia-400" /> Layer 1 & 4: Voice Attributes Sliders
                  </h3>
                  <div className="flex gap-2">
                    {(["female", "male"] as const).map(g => (
                      <button 
                        key={g}
                        onClick={() => setGender(g)}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold border transition-all ${gender === g ? "bg-fuchsia-600/20 border-fuchsia-500/40 text-fuchsia-400" : "bg-black/30 border-white/5 text-zinc-500"}`}
                      >
                        {g.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                  {/* Pitch */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400 flex items-center gap-1">
                        Pitch (음높이)
                        <div className="relative group inline-block">
                          <HelpCircle className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2 bg-zinc-950/95 border border-white/10 text-[10px] text-zinc-300 rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 text-center font-normal leading-normal">
                            목소리의 기본 주파수를 조절하여 고음 또는 저음 성향을 설정합니다.
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-zinc-950" />
                          </div>
                        </div>
                      </span>
                      <span className="text-fuchsia-400">{pitch}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={pitch} 
                      onChange={e => setPitch(Number(e.target.value))} 
                      className="dna-slider slider-fuchsia" 
                      style={{
                        background: `linear-gradient(to right, #d946ef 0%, #d946ef ${pitch}%, rgba(255, 255, 255, 0.1) ${pitch}%, rgba(255, 255, 255, 0.1) 100%)`
                      }}
                    />
                  </div>

                  {/* Brightness */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400 flex items-center gap-1">
                        Brightness (밝기)
                        <div className="relative group inline-block">
                          <HelpCircle className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2 bg-zinc-950/95 border border-white/10 text-[10px] text-zinc-300 rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 text-center font-normal leading-normal">
                            음색의 밝고 청량한 정도를 설정하며, 높을수록 화사하고 선명한 톤이 됩니다.
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-zinc-950" />
                          </div>
                        </div>
                      </span>
                      <span className="text-orange-400">{brightness}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={brightness} 
                      onChange={e => setBrightness(Number(e.target.value))} 
                      className="dna-slider slider-orange" 
                      style={{
                        background: `linear-gradient(to right, #f97316 0%, #f97316 ${brightness}%, rgba(255, 255, 255, 0.1) ${brightness}%, rgba(255, 255, 255, 0.1) 100%)`
                      }}
                    />
                  </div>

                  {/* Chest Resonance */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400 flex items-center gap-1">
                        Chest Resonance (흉성 공명)
                        <div className="relative group inline-block">
                          <HelpCircle className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2 bg-zinc-950/95 border border-white/10 text-[10px] text-zinc-300 rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 text-center font-normal leading-normal">
                            가슴에서 울리는 낮고 묵직한 공명감을 추가하여 목소리에 무게감을 줍니다.
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-zinc-950" />
                          </div>
                        </div>
                      </span>
                      <span className="text-violet-400">{chestResonance}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={chestResonance} 
                      onChange={e => setChestResonance(Number(e.target.value))} 
                      className="dna-slider slider-violet" 
                      style={{
                        background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${chestResonance}%, rgba(255, 255, 255, 0.1) ${chestResonance}%, rgba(255, 255, 255, 0.1) 100%)`
                      }}
                    />
                  </div>

                  {/* Head Resonance */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400 flex items-center gap-1">
                        Head Resonance (두성 공명)
                        <div className="relative group inline-block">
                          <HelpCircle className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2 bg-zinc-950/95 border border-white/10 text-[10px] text-zinc-300 rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 text-center font-normal leading-normal">
                            머리에서 울리는 맑고 높은 공명감을 추가하여 목소리를 청아하고 시원하게 만듭니다.
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-zinc-950" />
                          </div>
                        </div>
                      </span>
                      <span className="text-blue-400">{headResonance}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={headResonance} 
                      onChange={e => setHeadResonance(Number(e.target.value))} 
                      className="dna-slider slider-blue" 
                      style={{
                        background: `linear-gradient(to right, #2563eb 0%, #2563eb ${headResonance}%, rgba(255, 255, 255, 0.1) ${headResonance}%, rgba(255, 255, 255, 0.1) 100%)`
                      }}
                    />
                  </div>

                  {/* Power */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400 flex items-center gap-1">
                        Power (가창 출력)
                        <div className="relative group inline-block">
                          <HelpCircle className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2 bg-zinc-950/95 border border-white/10 text-[10px] text-zinc-300 rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 text-center font-normal leading-normal">
                            성대의 밀착도와 호흡의 압력을 조절하여 단단하고 힘찬 창법을 만들어줍니다.
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-zinc-950" />
                          </div>
                        </div>
                      </span>
                      <span className="text-cyan-400">{power}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={power} 
                      onChange={e => setPower(Number(e.target.value))} 
                      className="dna-slider slider-cyan" 
                      style={{
                        background: `linear-gradient(to right, #06b6d4 0%, #06b6d4 ${power}%, rgba(255, 255, 255, 0.1) ${power}%, rgba(255, 255, 255, 0.1) 100%)`
                      }}
                    />
                  </div>

                  {/* Noise Entropy Slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-zinc-400 flex items-center gap-1">
                        Noise Entropy (마모 저감 필터)
                        <div className="relative group inline-block">
                          <HelpCircle className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors" />
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2 bg-zinc-950/95 border border-white/10 text-[10px] text-zinc-300 rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 text-center font-normal leading-normal">
                            AI 특유의 기계음과 노이즈를 억제하여 더 자연스럽고 부드러운 목소리로 정제합니다.
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-zinc-950" />
                          </div>
                        </div>
                      </span>
                      <span className="text-emerald-400 font-bold">{noiseEntropy}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={noiseEntropy} 
                      onChange={e => setNoiseEntropy(Number(e.target.value))} 
                      className="dna-slider slider-emerald" 
                      style={{
                        background: `linear-gradient(to right, #10b981 0%, #10b981 ${noiseEntropy}%, rgba(255, 255, 255, 0.1) ${noiseEntropy}%, rgba(255, 255, 255, 0.1) 100%)`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Box 3: Materials (Layer 2) & Emotions (Layer 3) */}
              <div id="materials-box" className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Material Selection */}
                <div className="glass-panel p-6">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-fuchsia-400" /> Layer 2: Material Builder (음색 재질)
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {TEXTURES.map(t => {
                      const active = selectedTextures.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggleTexture(t)}
                          className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${active ? "bg-fuchsia-500/10 border-fuchsia-500/40 text-fuchsia-300" : "bg-black/30 border-white/5 text-zinc-500 hover:text-zinc-300"}`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Emotion Selection */}
                <div className="glass-panel p-6">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-purple-400" /> Layer 3: Emotion Builder (보컬 감정)
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {EMOTIONS.map(e => {
                      const active = selectedEmotions.includes(e);
                      return (
                        <button
                          key={e}
                          onClick={() => toggleEmotion(e)}
                          className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${active ? "bg-purple-500/10 border-purple-500/40 text-purple-300" : "bg-black/30 border-white/5 text-zinc-500 hover:text-zinc-300"}`}
                        >
                          {e}
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Box 4: Environment (Layer 5) */}
              <div className="glass-panel p-6">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-cyan-400" /> Layer 5: Environment & Reverb (음향 반사계)
                </h3>
                <div className="flex gap-2">
                  {REVERBS.map(r => (
                    <button
                      key={r}
                      onClick={() => setSelectedReverb(r)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border text-center transition-all ${selectedReverb === r ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.1)]" : "bg-black/30 border-white/5 text-zinc-500 hover:text-zinc-300"}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* Right Box: Dynamic Voice Wheel & Preview */}
            <div className="lg:col-span-4 flex flex-col">
              
              {/* Combined Dynamic Voice Wheel & Explanation Panel */}
              <div id="voice-wheel" className="glass-panel p-6 flex flex-col justify-between flex-1 h-full min-h-0">
                
                {/* Top Section: Header & Radar Chart */}
                <div className="flex flex-col items-center">
                  <div className="w-full flex justify-between items-center border-b border-white/5 pb-2 mb-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-fuchsia-400" /> Voice Wheel DNA
                    </h3>
                    <span className="text-[10px] text-fuchsia-400 font-bold bg-fuchsia-500/10 border border-fuchsia-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Zap className="w-3 h-3" /> BALANCE 10,000
                    </span>
                  </div>
                  
                  {/* SVG Concentric Hexagon Web representing DNA shape */}
                  <div className="w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 relative flex items-center justify-center my-auto shrink-0">
                    {/* Subtle spinning outer circle */}
                    <div className="absolute inset-0 border border-dashed border-zinc-700/50 rounded-full animate-[spin_20s_linear_infinite]" />
                    <div className="absolute inset-4 border border-zinc-800 rounded-full" />
                    
                    {/* Attribute Web SVG */}
                    <svg className="w-full h-full absolute" viewBox="0 0 200 200">
                      <defs>
                        <radialGradient id="grad" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="rgba(240, 70, 250, 0.05)" />
                          <stop offset="100%" stopColor="rgba(6, 182, 212, 0.2)" />
                        </radialGradient>
                      </defs>

                      {/* Concentric rings */}
                      <circle cx="100" cy="100" r="30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                      <circle cx="100" cy="100" r="60" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                      <circle cx="100" cy="100" r="85" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

                      {/* Axes lines */}
                      <line x1="100" y1="15" x2="100" y2="185" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                      <line x1="15" y1="100" x2="185" y2="100" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                      <line x1="40" y1="40" x2="160" y2="160" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

                      {/* Polygon mapping values dynamically */}
                      {(() => {
                        const center = 100;
                        const rBright = (brightness / 100) * 80 + 10;
                        const rPitch = (pitch / 100) * 80 + 10;
                        const rHead = (headResonance / 100) * 80 + 10;
                        const rNoise = (noiseEntropy / 100) * 80 + 10;
                        const rChest = (chestResonance / 100) * 80 + 10;
                        const rPower = (power / 100) * 80 + 10;

                        const p1 = { x: center, y: center - rBright };
                        const p2 = { x: center + rPitch * Math.cos(Math.PI/6), y: center - rPitch * Math.sin(Math.PI/6) };
                        const p3 = { x: center + rHead * Math.cos(Math.PI/6), y: center + rHead * Math.sin(Math.PI/6) };
                        const p4 = { x: center, y: center + rNoise };
                        const p5 = { x: center - rChest * Math.cos(Math.PI/6), y: center + rChest * Math.sin(Math.PI/6) };
                        const p6 = { x: center - rPower * Math.cos(Math.PI/6), y: center - rPower * Math.sin(Math.PI/6) };

                        const dStr = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${p4.x} ${p4.y} L ${p5.x} ${p5.y} L ${p6.x} ${p6.y} Z`;
                        
                        return (
                          <>
                            <path d={dStr} fill="url(#grad)" stroke="#c084fc" strokeWidth="2" />
                            {/* Visual Circles (Dynamic Radius on Hover, center stays absolutely static) */}
                            <circle cx={p1.x} cy={p1.y} r={hoveredAttr?.nameKo.includes("Brightness") ? 6.5 : 4} fill="#f97316" className="pointer-events-none transition-all duration-150" />
                            <circle cx={p2.x} cy={p2.y} r={hoveredAttr?.nameKo.includes("Pitch") ? 6.5 : 4} fill="#d946ef" className="pointer-events-none transition-all duration-150" />
                            <circle cx={p3.x} cy={p3.y} r={hoveredAttr?.nameKo.includes("Head") ? 6.5 : 4} fill="#2563eb" className="pointer-events-none transition-all duration-150" />
                            <circle cx={p4.x} cy={p4.y} r={hoveredAttr?.nameKo.includes("Noise") ? 6.5 : 4} fill="#10b981" className="pointer-events-none transition-all duration-150" />
                            <circle cx={p5.x} cy={p5.y} r={hoveredAttr?.nameKo.includes("Chest") ? 6.5 : 4} fill="#8b5cf6" className="pointer-events-none transition-all duration-150" />
                            <circle cx={p6.x} cy={p6.y} r={hoveredAttr?.nameKo.includes("Power") ? 6.5 : 4} fill="#06b6d4" className="pointer-events-none transition-all duration-150" />

                            {/* Large Invisible Hover Hit Areas (does not scale or move, completely stable) */}
                            {/* P1: Brightness */}
                            <circle 
                              cx={p1.x} cy={p1.y} r="14" 
                              fill="transparent" 
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredAttr({ nameKo: "Brightness (밝기)", value: brightness, x: p1.x, y: p1.y, color: "#f97316" })}
                              onMouseLeave={() => setHoveredAttr(null)}
                            />
                            {/* P2: Pitch */}
                            <circle 
                              cx={p2.x} cy={p2.y} r="14" 
                              fill="transparent" 
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredAttr({ nameKo: "Pitch (음높이)", value: pitch, x: p2.x, y: p2.y, color: "#d946ef" })}
                              onMouseLeave={() => setHoveredAttr(null)}
                            />
                            {/* P3: Head Resonance */}
                            <circle 
                              cx={p3.x} cy={p3.y} r="14" 
                              fill="transparent" 
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredAttr({ nameKo: "Head Resonance (두성 공명)", value: headResonance, x: p3.x, y: p3.y, color: "#2563eb" })}
                              onMouseLeave={() => setHoveredAttr(null)}
                            />
                            {/* P4: Noise Entropy */}
                            <circle 
                              cx={p4.x} cy={p4.y} r="14" 
                              fill="transparent" 
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredAttr({ nameKo: "Noise Entropy (마모 저감 필터)", value: noiseEntropy, x: p4.x, y: p4.y, color: "#10b981" })}
                              onMouseLeave={() => setHoveredAttr(null)}
                            />
                            {/* P5: Chest Resonance */}
                            <circle 
                              cx={p5.x} cy={p5.y} r="14" 
                              fill="transparent" 
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredAttr({ nameKo: "Chest Resonance (흉성 공명)", value: chestResonance, x: p5.x, y: p5.y, color: "#8b5cf6" })}
                              onMouseLeave={() => setHoveredAttr(null)}
                            />
                            {/* P6: Power */}
                            <circle 
                              cx={p6.x} cy={p6.y} r="14" 
                              fill="transparent" 
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredAttr({ nameKo: "Power (가창 출력)", value: power, x: p6.x, y: p6.y, color: "#06b6d4" })}
                              onMouseLeave={() => setHoveredAttr(null)}
                            />
                          </>
                        );
                      })()}

                      {/* Dynamic SVG Tooltip Overlay (drawn inside the SVG canvas to prevent page layout shift or scrollbar flicker) */}
                      {hoveredAttr && (
                        <g transform={`translate(${hoveredAttr.x}, ${hoveredAttr.y - 12})`} className="pointer-events-none">
                          <rect
                            x="-42"
                            y="-18"
                            width="84"
                            height="18"
                            rx="4"
                            fill="#09090b"
                            stroke="rgba(255,255,255,0.15)"
                            strokeWidth="0.8"
                            opacity="0.95"
                          />
                          <circle cx="-32" cy="-9" r="2.2" fill={hoveredAttr.color} />
                          <text
                            x="-24"
                            y="-7"
                            fill="#d4d4d8"
                            fontSize="7"
                            fontFamily="sans-serif"
                            fontWeight="bold"
                            textAnchor="start"
                          >
                            {hoveredAttr.nameKo.includes(" (") ? hoveredAttr.nameKo.split(" (")[1].replace(")", "") : hoveredAttr.nameKo}
                          </text>
                          <text
                            x="34"
                            y="-7"
                            fill={hoveredAttr.color}
                            fontSize="7"
                            fontFamily="sans-serif"
                            fontWeight="bold"
                            textAnchor="end"
                          >
                            {hoveredAttr.value}%
                          </text>
                        </g>
                      )}
                    </svg>

                    {/* Glowing core indicator */}
                    <div className="w-3 h-3 bg-fuchsia-500 rounded-full shadow-[0_0_15px_#f046fa] z-10" />
                  </div>
                </div>

                {/* Attribute inputs & dynamic summary panel */}
                <div className="w-full mt-6 space-y-4">
                  {/* Stage Name */}
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Stage Name</label>
                    <input 
                      type="text" 
                      value={stageName} 
                      onChange={e => setStageName(e.target.value)}
                      className="w-full bg-black/60 border border-white/10 rounded-lg py-2 px-3 text-xs text-white focus:border-fuchsia-500/50 outline-none" 
                    />
                  </div>

                  {/* Active Texture DNA */}
                  <div className="pt-2.5 border-t border-white/5">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Active Texture DNA</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedTextures.map(x => (
                        <span key={x} className="px-2 py-0.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20 text-[9px] text-fuchsia-400 font-bold">{x}</span>
                      ))}
                      {selectedEmotions.map(x => (
                        <span key={x} className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[9px] text-purple-400 font-bold">{x}</span>
                      ))}
                      {selectedTextures.length === 0 && selectedEmotions.length === 0 && (
                        <span className="text-[9px] text-zinc-600 italic">No active textures/emotions</span>
                      )}
                    </div>
                  </div>

                  {/* Dynamic Explain Designed Voice Panel */}
                  <div className="pt-3 border-t border-white/5 relative overflow-hidden bg-cyan-950/5 p-4 rounded-xl border border-cyan-500/10">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl" />
                    <h4 className="text-cyan-400 font-bold text-xs mb-2 flex items-center gap-1.5">
                      <Info className="w-4 h-4" /> Explain Designed Voice
                    </h4>
                    <p className="text-zinc-400 text-[11px] leading-relaxed mb-3">
                      {dynamicDesc.summaryPrefix}
                      <span className="font-bold text-white">{dynamicDesc.summaryBold}</span>
                      {dynamicDesc.summarySuffix}
                    </p>
                    <ul className="space-y-1.5 text-[10px] text-zinc-300">
                      {dynamicDesc.bullets.map((bullet, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Layer 6: Demo Singing Preview Cockpit (데모 가창 청음기) */}
                <div className="w-full mt-6 pt-5 border-t border-white/5 space-y-4">
                  <div>
                    <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-fuchsia-400" />
                      Layer 6: Demo Singing Preview Cockpit (데모 가창 청음기)
                    </h4>
                    <p className="text-[10px] text-zinc-500">
                      설계된 보이스 DNA 속성으로 AI가 실제 노래하는 15초 샘플 음원을 생성합니다. (Suno AI 엔진 사용, 약 1~2분 소요)
                    </p>
                  </div>

                  {/* Genre Selector */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-zinc-400">SELECT DEBUT GENRE (데모 가창 장르 선택)</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["ballad", "pop", "rnb", "rock", "hiphop", "dance", "jazz", "acoustic"] as const).map(g => (
                        <button
                          key={g}
                          onClick={() => setSelectedGenre(g)}
                          disabled={isDemoGenerating}
                          className={`py-2 px-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer text-center ${
                            selectedGenre === g
                              ? "bg-fuchsia-600/20 border-fuchsia-500/50 text-fuchsia-300 shadow-[0_0_8px_rgba(217,70,239,0.15)]"
                              : "bg-black/40 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {g === "ballad" && "Ballad"}
                          {g === "pop" && "Pop"}
                          {g === "rnb" && "R&B / Soul"}
                          {g === "rock" && "Rock"}
                          {g === "hiphop" && "Hip-Hop"}
                          {g === "dance" && "Dance / EDM"}
                          {g === "jazz" && "Jazz"}
                          {g === "acoustic" && "Acoustic"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Lyrics Display */}
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between text-[9px] font-bold text-zinc-500">
                      <span>LYRICS PREVIEW (매핑 가사 정보)</span>
                      <button 
                        onClick={() => setLyricIndex((prev) => (prev + 1) % 10)}
                        className="text-[8px] px-2 py-0.5 rounded bg-fuchsia-600/25 border border-fuchsia-500/40 text-fuchsia-300 hover:bg-fuchsia-500/30 transition-all font-bold cursor-pointer flex items-center gap-1"
                        title="클릭하여 다른 가사로 변경합니다 (총 10개)"
                      >
                        <span>가사 {lyricIndex + 1}/10</span>
                        <RefreshCw className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">
                      "{DEMO_LYRICS[language][gender][selectedGenre][lyricIndex]}"
                    </p>
                  </div>

                  {/* Audio Player and Generator Controls */}
                  <div className="space-y-3">
                    {isDemoGenerating ? (
                      <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-fuchsia-500/20 space-y-2.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-fuchsia-400 font-bold flex items-center gap-1.5">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            {demoGenerateStep === 0 && "Voice DNA → Suno 프롬프트 변환 중..."}
                            {demoGenerateStep === 1 && "AI 엔진에 음원 생성 요청 제출 완료"}
                            {demoGenerateStep === 2 && "🎤 AI가 보컬 노래를 생성하는 중... (약 1~2분 소요)"}
                          </span>
                          <span className="text-zinc-500 font-medium">
                            {demoGenerateStep === 0 && "10%"}
                            {demoGenerateStep === 1 && "30%"}
                            {demoGenerateStep === 2 && "생성 중..."}
                          </span>
                        </div>
                        <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-600 transition-all duration-700 ease-out" 
                            style={{ 
                              width: demoGenerateStep === 0 ? "10%" : demoGenerateStep === 1 ? "30%" : "60%" 
                            }} 
                          />
                        </div>
                      </div>
                    ) : demoAudioUrl ? (
                      /* Audio Player Panel */
                      <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-3">
                        <div className="space-y-2">
                          {/* Version A Row */}
                          <div 
                            onClick={() => {
                              if (selectedVocalVersion !== "A") {
                                handleSwitchVocalVersion("A");
                              } else {
                                handleTogglePlayDemo();
                              }
                            }}
                            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                              selectedVocalVersion === "A"
                                ? "bg-fuchsia-950/20 border-fuchsia-500/40 text-white shadow-[0_0_12px_rgba(217,70,239,0.1)]"
                                : "bg-black/20 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-black/30"
                            }`}
                          >
                            <button
                              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                                selectedVocalVersion === "A" && isDemoPlaying
                                  ? "bg-fuchsia-600 text-white"
                                  : selectedVocalVersion === "A"
                                  ? "bg-fuchsia-600/30 text-fuchsia-400"
                                  : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {selectedVocalVersion === "A" && isDemoPlaying ? (
                                <Pause className="w-3 h-3 fill-current" />
                              ) : (
                                <Play className="w-3 h-3 fill-current ml-0.5" />
                              )}
                            </button>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold">Vocal Version A</span>
                                <span className={`text-[9px] ${selectedVocalVersion === "A" ? "text-fuchsia-400" : "text-zinc-500"}`}>
                                  {selectedVocalVersion === "A" && isDemoPlaying ? "재생 중" : "대기 중"}
                                </span>
                              </div>
                              <span className="text-[9px] text-zinc-500 block mt-0.5 uppercase">
                                🎤 AI VOCAL GENERATED ({selectedGenre})
                              </span>
                            </div>
                          </div>

                          {/* Version B Row */}
                          {demoAudioUrlB && (
                            <div 
                              onClick={() => {
                                if (selectedVocalVersion !== "B") {
                                  handleSwitchVocalVersion("B");
                                } else {
                                  handleTogglePlayDemo();
                                }
                              }}
                              className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${
                                selectedVocalVersion === "B"
                                  ? "bg-fuchsia-950/20 border-fuchsia-500/40 text-white shadow-[0_0_12px_rgba(217,70,239,0.1)]"
                                  : "bg-black/20 border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-black/30"
                              }`}
                            >
                              <button
                                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                                  selectedVocalVersion === "B" && isDemoPlaying
                                    ? "bg-fuchsia-600 text-white"
                                    : selectedVocalVersion === "B"
                                    ? "bg-fuchsia-600/30 text-fuchsia-400"
                                    : "bg-zinc-800 text-zinc-400"
                                }`}
                              >
                                {selectedVocalVersion === "B" && isDemoPlaying ? (
                                  <Pause className="w-3 h-3 fill-current" />
                                ) : (
                                  <Play className="w-3 h-3 fill-current ml-0.5" />
                                )}
                              </button>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold">Vocal Version B</span>
                                  <span className={`text-[9px] ${selectedVocalVersion === "B" ? "text-fuchsia-400" : "text-zinc-500"}`}>
                                    {selectedVocalVersion === "B" && isDemoPlaying ? "재생 중" : "대기 중"}
                                  </span>
                                </div>
                                <span className="text-[9px] text-zinc-500 block mt-0.5 uppercase">
                                  🎤 AI VOCAL GENERATED ({selectedGenre}) (2)
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Progress Bar & Details */}
                        <div className="pt-1.5 space-y-2">
                          <div className="flex items-center justify-between text-[9px]">
                            <span className="text-zinc-400 font-bold truncate uppercase flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-ping" />
                              선택된 곡: Version {selectedVocalVersion}
                            </span>
                            <span className="text-zinc-500 font-medium">
                              Suno AI V5.5 Pro
                            </span>
                          </div>
                          
                          {/* Shared Progress Bar */}
                          <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden relative cursor-pointer group/progress">
                            <div 
                              className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-500 transition-all duration-100 ease-out"
                              style={{ width: `${demoProgress}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[9px] text-zinc-500 px-1 pt-0.5">
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-400" />
                            보이스 DNA 기반 AI 보컬 음원 생성 완료 ✨
                          </span>
                          <button 
                            onClick={handleGenerateDemo}
                            className="text-[9px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" /> 다시 생성
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Generate Button */
                      <button
                        onClick={handleGenerateDemo}
                        className="w-full py-2.5 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 hover:bg-fuchsia-500/10 text-fuchsia-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-fuchsia-600/5"
                      >
                        <Sparkles className="w-4 h-4 animate-pulse text-fuchsia-400" />
                        🎤 AI 보컬 샘플 음원 생성 (Suno AI, ~1분 소요)
                      </button>
                    )}
                  </div>
                </div>

                <div className="w-full mt-4 space-y-2">
                  <button
                    id="save-btn"
                    onClick={handleSaveDna}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-fuchsia-600/10 cursor-pointer"
                  >
                    <Save className="w-4 h-4" /> Save Designed Voice DNA
                  </button>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TAB 2: COLLECTIONS */}
        {/* TAB 2: COLLECTIONS */}
        {activeTab === "collections" && (() => {
          const signatureCodes = ['VD-1004', 'VD-3802', 'VD-7705'];
          const signatureVoices = signatureCodes.map(code => EXPLORE_VOICES.find(ev => ev.code === code)).filter(Boolean);

          const favVoices = customVoices.filter(v => EXPLORE_VOICES.some(ev => ev.code === v.vd_code));
          const userDesignedVoices = customVoices.filter(v => !EXPLORE_VOICES.some(ev => ev.code === v.vd_code));

          // Pagination Logic for Favorites
          const favItemsPerPage = 10;
          const totalFavPages = Math.ceil(favVoices.length / favItemsPerPage);
          const safeFavPage = Math.min(favPage, Math.max(1, totalFavPages));
          const paginatedFav = favVoices.slice((safeFavPage - 1) * favItemsPerPage, safeFavPage * favItemsPerPage);

          // Pagination Logic for Custom Designed Voices
          const customItemsPerPage = 10;
          const totalCustomPages = Math.ceil(userDesignedVoices.length / customItemsPerPage);
          const safeCustomPage = Math.min(customPage, Math.max(1, totalCustomPages));
          const paginatedCustom = userDesignedVoices.slice((safeCustomPage - 1) * customItemsPerPage, safeCustomPage * customItemsPerPage);

          return (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Section 1: Signature System Presets */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
                  <span className="w-1 h-3.5 bg-fuchsia-500 rounded-full" />
                  Signature System Presets (Hall of Voices)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {signatureVoices.map(voice => {
                    if (!voice) return null;
                    const isPlaying = explorePlayingVoiceId === voice.code && explorePlaying;
                    
                    return (
                      <div 
                        key={voice.code} 
                        className="glass-panel p-4 hover:border-fuchsia-500/30 transition-all duration-300 flex flex-col justify-between gap-3 relative overflow-hidden"
                      >
                        {/* Code Tag & Play Action in Header */}
                        <div className="flex justify-between items-center">
                          <span className="px-2 py-0.5 rounded bg-fuchsia-500/10 border border-fuchsia-500/20 text-[9px] text-fuchsia-400 font-bold font-mono tracking-wider">
                            {voice.code}
                          </span>
                          <button
                            onClick={() => isPlaying ? stopExploreVoiceDemo() : playExploreVoiceDemo(voice)}
                            className="w-7 h-7 rounded-full bg-white/5 hover:bg-fuchsia-500/20 border border-white/10 flex items-center justify-center text-fuchsia-400 hover:text-fuchsia-300 transition-all cursor-pointer shadow"
                            title="귀로 목소리 들어보기"
                          >
                            {isPlaying ? (
                              <VolumeX className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5 ml-0.5" />
                            )}
                          </button>
                        </div>

                        {/* Main Info Row: Circle Avatar & Texts Side-by-Side */}
                        <div className="flex items-start gap-3">
                          <div 
                            className="w-10 h-10 rounded-full border border-white/10 shrink-0 shadow-inner flex items-center justify-center overflow-hidden"
                            style={{ background: voice.gradient }}
                          >
                            {isPlaying && (
                              <span className="flex items-end gap-[1.5px] h-3.5 mb-[2.5px]">
                                <span className="w-[2px] bg-white animate-[eq_0.8s_ease-in-out_infinite]" />
                                <span className="w-[2px] bg-white animate-[eq_0.5s_ease-in-out_infinite_0.2s]" />
                                <span className="w-[2px] bg-white animate-[eq_0.7s_ease-in-out_infinite_0.4s]" />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1">
                              <span className="text-[12px] leading-none">{voice.flag}</span>
                              <h4 className="text-sm font-bold text-white truncate">{voice.name}</h4>
                            </div>
                            <p className="text-[10px] text-zinc-400 leading-snug mt-1 line-clamp-2" title={voice.desc}>
                              {voice.desc}
                            </p>
                          </div>
                        </div>

                        {/* Load DNA Action Button */}
                        <button 
                          onClick={() => loadPresetToSliders(defaultSystemVoices[voice.code as keyof typeof defaultSystemVoices])}
                          className="w-full py-2 rounded-lg bg-white/5 hover:bg-fuchsia-500/20 text-fuchsia-300 text-[11px] font-bold transition-all border border-white/5 hover:border-fuchsia-500/40"
                        >
                          Load DNA Attributes
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Favorited Voices */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
                  <span className="w-1 h-3.5 bg-rose-500 rounded-full animate-pulse" />
                  My Favorites (즐겨찾기 보관함)
                </h3>
                {favVoices.length === 0 ? (
                  <div className="py-8 text-center rounded-xl border border-dashed border-zinc-800 bg-black/10">
                    <Heart className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
                    <span className="text-[11px] text-zinc-500 block">즐겨찾기 추가한 보이스가 없습니다. Explore Voices에서 하트를 눌러보세요.</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {paginatedFav.map(fav => {
                        const voice = EXPLORE_VOICES.find(ev => ev.code === fav.vd_code);
                        if (!voice) return null;
                        const isPlaying = explorePlayingVoiceId === voice.code && explorePlaying;

                        return (
                          <div 
                            key={fav.vd_code} 
                            className="glass-panel p-3 px-4 hover:border-rose-500/20 transition-all duration-300 group flex items-center gap-3 relative overflow-hidden animate-in fade-in duration-200"
                          >
                            {/* Avatar & Play/Pause Trigger - Circular Color Orb */}
                            <div 
                              className="relative w-11 h-11 shrink-0 rounded-full overflow-hidden flex items-center justify-center border border-white/10 transition-transform group-hover:scale-105 cursor-pointer shadow-md"
                              style={{ background: voice.gradient }}
                              onClick={() => isPlaying ? stopExploreVoiceDemo() : playExploreVoiceDemo(voice)}
                            >
                              {/* Play Overlay */}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                {isPlaying ? (
                                  <Pause className="w-3.5 h-3.5 fill-white text-white" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
                                )}
                              </div>

                              {isPlaying && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                  <span className="flex gap-0.5 items-end justify-center w-5 h-5">
                                    <span className="w-0.5 h-2 bg-white rounded-full animate-[bounce_0.6s_infinite]" />
                                    <span className="w-0.5 h-3 bg-white rounded-full animate-[bounce_0.6s_infinite_0.15s]" />
                                    <span className="w-0.5 h-1.5 bg-white rounded-full animate-[bounce_0.6s_infinite_0.3s]" />
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Details - Layout matching main explore card */}
                            <div className="flex-1 min-w-0 pr-6">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-base leading-none shrink-0" title={voice.language}>{voice.flag}</span>
                                <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors truncate leading-tight">
                                  {voice.name}
                                </h4>
                                <span className="text-[9px] text-zinc-500 font-medium truncate">
                                  ({voice.language})
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-400 leading-tight mt-0.5 truncate">
                                {voice.desc}
                              </p>
                              
                              {/* Tags list */}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {voice.tags.slice(0, 3).map(t => (
                                  <span key={t} className="px-1.5 py-0.2 rounded bg-black/40 text-[9px] text-zinc-500 border border-white/5">{t}</span>
                                ))}
                              </div>
                            </div>

                            {/* Action Buttons on the Right */}
                            <div className="flex flex-col items-end justify-between self-stretch py-0.5 z-10 shrink-0">
                              <button
                                onClick={() => {
                                  const updated = customVoices.filter(v => v.vd_code !== fav.vd_code);
                                  setCustomVoices(updated);
                                  localStorage.setItem("custom_voice_dnas", JSON.stringify(updated));
                                }}
                                className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                                title="즐겨찾기 해제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              
                              <button 
                                onClick={() => loadPresetToSliders(defaultSystemVoices[voice.code as keyof typeof defaultSystemVoices] || fav)}
                                className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-[10px] text-zinc-300 font-bold transition-all"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination Controls for Favorites */}
                    {totalFavPages > 1 && (
                      <div className="flex items-center justify-center gap-2 mt-4 select-none">
                        <button
                          onClick={() => setFavPage(p => Math.max(1, p - 1))}
                          disabled={safeFavPage === 1}
                          className="p-1.5 rounded-lg bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-zinc-500 font-mono">
                          {safeFavPage} / {totalFavPages}
                        </span>
                        <button
                          onClick={() => setFavPage(p => Math.min(totalFavPages, p + 1))}
                          disabled={safeFavPage === totalFavPages}
                          className="p-1.5 rounded-lg bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Section 3: Custom Designed Voices */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
                  <span className="w-1 h-3.5 bg-cyan-500 rounded-full" />
                  Custom Designed Voices (나의 설계 보이스)
                </h3>
                {userDesignedVoices.length === 0 ? (
                  <div className="py-8 text-center rounded-xl border border-dashed border-zinc-800 bg-black/10">
                    <Sliders className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
                    <span className="text-[11px] text-zinc-500 block">설계하여 저장한 커스텀 보이스 DNA가 없습니다. 첫번째 탭에서 만들어 보세요.</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {paginatedCustom.map(v => {
                        // Generate a unique gradient background for the custom designed voice based on its code number
                        const numericId = parseInt(v.vd_code.replace(/\D/g, '')) || 0;
                        const hue1 = (numericId * 17) % 360;
                        const hue2 = (hue1 + 120) % 360;
                        const customGradient = `linear-gradient(135deg, hsl(${hue1}, 70%, 50%), hsl(${hue2}, 70%, 40%))`;

                        return (
                          <div 
                            key={v.vd_code} 
                            className="glass-panel p-3.5 hover:border-cyan-500/20 transition-all duration-300 flex flex-col justify-between gap-3 relative overflow-hidden"
                          >
                            {/* Header: Code & Delete Icon */}
                            <div className="flex justify-between items-center">
                              <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-[9px] text-cyan-400 font-bold font-mono tracking-wider">
                                {v.vd_code}
                              </span>
                              <button
                                onClick={() => {
                                  const updated = customVoices.filter(item => item.vd_code !== v.vd_code);
                                  setCustomVoices(updated);
                                  localStorage.setItem("custom_voice_dnas", JSON.stringify(updated));
                                }}
                                className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                                title="삭제하기"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Info Row: Generated Gradient Avatar & Custom Profile Details */}
                            {(() => {
                              const isPlaying = explorePlayingVoiceId === v.vd_code && explorePlaying;
                              return (
                                <div className="flex items-center gap-2.5">
                                  <div 
                                    className="relative w-9 h-9 rounded-full border border-white/10 shrink-0 shadow-inner flex items-center justify-center text-[10px] text-white font-bold select-none cursor-pointer overflow-hidden group/avatar transition-transform hover:scale-105"
                                    style={{ background: customGradient }}
                                    onClick={() => {
                                      const voiceObj = { code: v.vd_code, physical_layers: v.physical_layers };
                                      isPlaying ? stopExploreVoiceDemo() : playExploreVoiceDemo(voiceObj);
                                    }}
                                  >
                                    {/* Hover Play/Pause Overlay */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity">
                                      {isPlaying ? (
                                        <Pause className="w-3.5 h-3.5 text-white fill-white" />
                                      ) : (
                                        <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
                                      )}
                                    </div>

                                    {isPlaying ? (
                                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <span className="flex gap-[1.5px] items-end justify-center w-5 h-5 mb-[1.5px]">
                                          <span className="w-[1.5px] bg-white rounded-full animate-[eq_0.8s_ease-in-out_infinite]" />
                                          <span className="w-[1.5px] bg-white rounded-full animate-[eq_0.5s_ease-in-out_infinite_0.2s]" />
                                          <span className="w-[1.5px] bg-white rounded-full animate-[eq_0.7s_ease-in-out_infinite_0.4s]" />
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="group-hover/avatar:opacity-0 transition-opacity">
                                        {v.name.slice(0, 2).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      {editingVoiceCode === v.vd_code ? (
                                        <input
                                          type="text"
                                          value={editingVoiceName}
                                          onChange={(e) => setEditingVoiceName(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") saveVoiceName(v.vd_code, editingVoiceName);
                                            if (e.key === "Escape") setEditingVoiceCode(null);
                                          }}
                                          onBlur={() => saveVoiceName(v.vd_code, editingVoiceName)}
                                          autoFocus
                                          className="bg-zinc-800 border border-cyan-500/50 rounded px-1 py-0.5 text-[10px] text-white focus:outline-none w-20"
                                        />
                                      ) : (
                                        <div className="flex items-center gap-1 min-w-0 max-w-[80px] sm:max-w-[100px]">
                                          <h4 className="text-xs font-bold text-white truncate">{v.name}</h4>
                                          <button
                                            onClick={() => {
                                              setEditingVoiceCode(v.vd_code);
                                              setEditingVoiceName(v.name);
                                            }}
                                            className="text-zinc-400 hover:text-cyan-400 p-0.5 cursor-pointer shrink-0 ml-0.5 transition-colors"
                                            title="이름 수정"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                      <span className="px-1 py-0.2 rounded bg-zinc-800 text-[8px] text-zinc-400 uppercase font-bold tracking-wide shrink-0">
                                        {v.physical_layers.gender === 'female' ? '여성' : '남성'}
                                      </span>
                                    </div>
                                    <p className="text-[9px] text-zinc-500 truncate mt-0.5">
                                      {v.style || 'Custom Reverb'} • Pitch {v.physical_layers.pitch}%
                                    </p>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Texture Tags Row (tightly spaced) */}
                            {v.textures && v.textures.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {v.textures.slice(0, 3).map(t => (
                                  <span key={t} className="px-1.5 py-0.5 rounded bg-black/40 border border-white/5 text-[8px] text-zinc-400 leading-none">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Load Profile Button */}
                            <button
                              onClick={() => loadPresetToSliders(v)}
                              className="w-full py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-[10px] text-white font-bold transition-all"
                            >
                              Load Profile
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination Controls for Custom Designed Voices */}
                    {totalCustomPages > 1 && (
                      <div className="flex items-center justify-center gap-2 mt-4 select-none">
                        <button
                          onClick={() => setCustomPage(p => Math.max(1, p - 1))}
                          disabled={safeCustomPage === 1}
                          className="p-1.5 rounded-lg bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-zinc-500 font-mono">
                          {safeCustomPage} / {totalCustomPages}
                        </span>
                        <button
                          onClick={() => setCustomPage(p => Math.min(totalCustomPages, p + 1))}
                          disabled={safeCustomPage === totalCustomPages}
                          className="p-1.5 rounded-lg bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

            </div>
          );
        })()}

        {/* TAB 3: DECODER */}
        {activeTab === "decoder" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Decoder Input Console */}
            <div className="lg:col-span-4 glass-panel p-6 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" /> DNA Decoder Console
              </h3>
              
              <p className="text-zinc-400 text-xs leading-relaxed">
                임포트된 Voice DNA 코드(예: `VD-1004`)를 기재하여, 해당 목소리의 물리 공명 특성 및 프롬프트 인코딩 값을 판독해냅니다.
              </p>

              <div className="space-y-2">
                <label className="block text-[11px] text-zinc-500 font-medium uppercase">Enter VD Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={decodeInput}
                    onChange={e => setDecodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. VD-1004"
                    className="flex-1 bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono outline-none focus:border-cyan-500/50"
                  />
                  <button
                    onClick={handleDecode}
                    className="px-5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all shadow-lg shadow-cyan-600/10"
                  >
                    Decode
                  </button>
                </div>
                {decodeError && <p className="text-[10px] text-red-400 font-medium">{decodeError}</p>}
              </div>
            </div>

            {/* Decoder Output Panel */}
            <div className="lg:col-span-8">
              <AnimatePresence mode="wait">
                {decodedData ? (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="glass-panel p-6 space-y-6"
                  >
                    <div className="flex justify-between items-center border-b border-white/5 pb-4">
                      <div>
                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono text-cyan-400 font-bold">{decodedData.vd_code}</span>
                        <h4 className="text-xl font-bold text-white mt-1">{decodedData.name} Profile</h4>
                      </div>
                      <span className="text-xs text-zinc-500">Created: System Default</span>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      
                      {/* Physical Specifications */}
                      <div className="space-y-3">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block">Physical Specifications</span>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Gender</span>
                            <span className="text-white font-bold">{decodedData.physical_layers.gender?.toUpperCase()}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Pitch Accent</span>
                            <span className="text-white font-bold">{decodedData.physical_layers.pitch}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Chest Resonance</span>
                            <span className="text-white font-bold">{decodedData.physical_layers.chest}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Brightness</span>
                            <span className="text-white font-bold">{decodedData.physical_layers.brightness}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Performance & Materials */}
                      <div className="space-y-3">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block">Materials & Reverb</span>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Reverb / Style</span>
                            <span className="text-white font-bold">{decodedData.style}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Noise Entropy</span>
                            <span className="text-emerald-400 font-bold">{decodedData.noise_entropy}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Textures</span>
                            <span className="text-white font-semibold">{decodedData.textures?.join(', ')}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Emotions</span>
                            <span className="text-white font-semibold">{decodedData.emotions?.join(', ')}</span>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Compiled Suno prompt result */}
                    <div className="pt-4 border-t border-white/5 space-y-2">
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block">Compiled Suno Prompt Tags</span>
                      <div className="p-4 rounded-xl bg-black/60 border border-white/10 font-mono text-[11px] text-cyan-300 leading-relaxed break-words">
                        {decodedData.compiledTags}
                      </div>
                    </div>

                  </motion.div>
                ) : (
                  <div className="h-full flex items-center justify-center p-12 glass-panel border-dashed border-zinc-800 text-center">
                    <div>
                      <Mic2 className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                      <span className="text-xs text-zinc-500 block">임포트 코드를 입력하고 Decode 버튼을 클릭하세요.</span>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>

          </div>
        )}

      {/* Floating Success Toast */}
      <AnimatePresence>
        {lastSavedDna && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 right-6 z-[9999] p-4 rounded-2xl bg-zinc-950/95 border border-emerald-500/30 text-white shadow-2xl flex flex-col gap-3 max-w-sm backdrop-blur-md"
          >
            <div className="flex items-start gap-2.5">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-emerald-400">보이스 DNA 저장 완료!</h5>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  설계하신 보이스가 성공적으로 저장되었습니다.<br />
                  코드: <strong className="font-mono text-white">{lastSavedDna}</strong>
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end border-t border-white/5 pt-2.5">
              <button
                onClick={() => setLastSavedDna(null)}
                className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-[10px] text-zinc-400 font-bold transition-all cursor-pointer"
              >
                닫기
              </button>
              <button
                onClick={() => {
                  setActiveTab("collections");
                  setLastSavedDna(null);
                }}
                className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-[10px] text-zinc-950 font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                보관함으로 이동 <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Audio Player Bar */}
      {explorePlayingVoiceId && (() => {
        let voice = EXPLORE_VOICES.find(v => v.code === explorePlayingVoiceId);
        if (!voice && customVoices) {
          const customVoice = customVoices.find(v => v.vd_code === explorePlayingVoiceId);
          if (customVoice) {
            voice = {
              code: customVoice.vd_code,
              name: customVoice.name,
              desc: `${customVoice.physical_layers.gender === 'female' ? 'Female' : 'Male'} Custom Voice • Style: ${customVoice.style || 'Studio Reverb'}`,
              flag: '👤',
              language: 'Custom',
              tags: customVoice.textures || ['Custom'],
              gradient: `linear-gradient(135deg, hsl(${(parseInt(customVoice.vd_code.replace(/\D/g, '')) * 17) % 360}, 70%, 50%), hsl(${(parseInt(customVoice.vd_code.replace(/\D/g, '')) * 17 + 120) % 360}, 70%, 40%))`,
              physical_layers: customVoice.physical_layers
            } as any;
          } else if (explorePlayingVoiceId === "DESIGNER_PREVIEW") {
            voice = {
              code: "DESIGNER_PREVIEW",
              name: stageName || "My Design Preview",
              desc: `Previewing: ${gender === 'female' ? '여성' : '남성'} • Pitch ${pitch}% • Power ${power}%`,
              flag: "🎛️",
              language: "Custom Preview",
              tags: selectedTextures.length > 0 ? selectedTextures : ["Preview"],
              gradient: "linear-gradient(135deg, #d946ef 0%, #06b6d4 100%)",
              physical_layers: {
                gender,
                age,
                pitch,
                brightness,
                chest: chestResonance,
                head: headResonance,
                weight,
                power
              }
            } as any;
          }
        }
        if (!voice) return null;
        const isFav = customVoices.some(v => v.vd_code === voice.code);

        return (
          <div className="fixed bottom-0 left-0 md:left-64 right-0 z-50 bg-[#0d0a0a]/98 border-t border-white/10 backdrop-blur-xl px-4 md:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl animate-in slide-in-from-bottom duration-350">
            {/* Left: Info Section */}
            <div className="flex items-center gap-3.5 w-full md:w-auto md:max-w-md shrink-0">
              {/* Circle Avatar with Equalizer */}
              <div 
                className="relative w-11 h-11 rounded-full border border-white/10 shrink-0 shadow-md flex items-center justify-center overflow-hidden"
                style={{ background: voice.gradient }}
              >
                {explorePlaying && (
                  <span className="flex items-end gap-[2px] h-3.5 mb-[2px]">
                    <span className="w-[2.5px] bg-white rounded-full animate-[eq_0.8s_ease-in-out_infinite]" />
                    <span className="w-[2.5px] bg-white rounded-full animate-[eq_0.5s_ease-in-out_infinite_0.2s]" />
                    <span className="w-[2.5px] bg-white rounded-full animate-[eq_0.7s_ease-in-out_infinite_0.4s]" />
                  </span>
                )}
              </div>
              {/* Text Details matching the Voice Card exactly */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[14px] leading-none select-none">{voice.flag}</span>
                  <span className="text-sm font-bold text-white truncate leading-snug">{voice.name}</span>
                  <span className="text-xs text-zinc-400">({voice.language})</span>
                </div>
                <p className="text-xs text-zinc-300 truncate mt-0.5 max-w-[280px]">
                  {voice.desc}
                </p>
                <div className="hidden md:flex items-center gap-1 mt-1 flex-wrap">
                  {voice.tags.slice(0, 3).map((tag: string) => (
                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/50 text-zinc-400 leading-none select-none">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Center: Controls & Slider Section */}
            <div className="flex-1 max-w-xl w-full flex flex-col items-center gap-1.5">
              {/* Buttons Row */}
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Shuffle"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
                  </svg>
                </button>

                <button
                  type="button"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Previous"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6L18 6v12z"/>
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => explorePlaying ? stopExploreVoiceDemo() : playExploreVoiceDemo(voice)}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-all transform hover:scale-105 active:scale-95 shadow-md shrink-0"
                >
                  {explorePlaying ? (
                    <Pause className="w-4 h-4 fill-black text-black" />
                  ) : (
                    <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Next"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6zm9-12h2v12h-2z"/>
                  </svg>
                </button>

                <button
                  type="button"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Repeat"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                  </svg>
                </button>
              </div>

              {/* Progress Slider Row */}
              <div className="w-full flex items-center gap-3 px-2">
                <span className="text-[10px] text-zinc-500 font-mono w-7 text-right">
                  {`0:${Math.floor(exploreProgress * 0.15).toString().padStart(2, '0')}`}
                </span>
                <div 
                  className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden relative cursor-pointer group"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const percentage = Math.min(100, Math.max(0, (clickX / rect.width) * 100));
                    setExploreProgress(percentage);
                  }}
                >
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-white group-hover:bg-cyan-400 transition-all duration-100 rounded-full" 
                    style={{ width: `${exploreProgress}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-500 font-mono w-7">0:15</span>
              </div>
            </div>

            {/* Right: Actions (Add/Fav, Volume, Close) */}
            <div className="flex items-center gap-4 shrink-0 justify-end w-full md:w-auto">
              <button
                type="button"
                onClick={() => {
                  let updated;
                  if (isFav) {
                    updated = customVoices.filter(v => v.vd_code !== voice.code);
                  } else {
                    const newDna: VoiceDnaRecord = {
                      vd_code: voice.code,
                      name: voice.name,
                      physical_layers: voice.physical_layers as any,
                      textures: voice.textures,
                      emotions: voice.emotions,
                      style: voice.category,
                      noise_entropy: 15
                    };
                    updated = [...customVoices, newDna];
                  }
                  setCustomVoices(updated);
                  localStorage.setItem("custom_voice_dnas", JSON.stringify(updated));
                }}
                className={`px-3 py-2 rounded-xl border text-[10px] font-bold transition-all flex items-center gap-1.5 ${
                  isFav 
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                    : 'bg-zinc-900 border border-white/5 text-zinc-300 hover:border-cyan-500/30 hover:text-cyan-300'
                }`}
              >
                {isFav ? (
                  <>
                    <Heart className="w-3.5 h-3.5 fill-purple-400 text-purple-400" />
                    <span>즐겨찾기 완료 ✓</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3" />
                    <Heart className="w-3.5 h-3.5 text-zinc-400" />
                    <span>즐겨찾기 추가</span>
                  </>
                )}
              </button>

              {/* Copy Song Link Button */}
              <button
                type="button"
                onClick={() => {
                  const shareUrl = `${window.location.origin}/vault/share-${voice.code}`;
                  navigator.clipboard.writeText(shareUrl);
                  setCopiedLinkTrackId(voice.code);
                  setTimeout(() => setCopiedLinkTrackId(null), 2000);
                }}
                className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg"
                title="Copy Song Link"
              >
                {copiedLinkTrackId === voice.code ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Link className="w-4 h-4" />
                )}
              </button>

              <div className="hidden sm:flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                <Volume2 className="w-4 h-4" />
                <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden relative cursor-pointer">
                  <div className="absolute left-0 top-0 bottom-0 bg-white w-2/3 rounded-full" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => stopExploreVoiceDemo()}
                className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })()}

      </div>

      {/* Global CSS Styles for Equalizer keyframes & Sleek range sliders */}
      <style jsx global>{`
        @keyframes eq {
          0%, 100% { height: 4px; }
          50% { height: 12px; }
        }

        /* Custom range sliders styling to minimize visual fatigue and make them ultra-thin */
        .dna-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 3px !important; /* Extremely thin line */
          background: rgba(255, 255, 255, 0.1);
          border-radius: 9999px;
          outline: none;
          margin: 10px 0;
        }

        .dna-slider::-webkit-slider-runnable-track {
          height: 3px;
          border-radius: 9999px;
        }

        .dna-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          cursor: pointer;
          margin-top: -4.5px; /* Centers thumb on the 3px track */
          transition: transform 0.15s ease, background-color 0.15s ease;
        }

        /* Fuchsia Slider Thumbs (Soft fuchsia with mild glow) */
        .slider-fuchsia::-webkit-slider-thumb {
          background: #d946ef !important;
          box-shadow: 0 0 6px rgba(217, 70, 239, 0.4);
        }
        .slider-fuchsia::-webkit-slider-thumb:hover {
          transform: scale(1.25);
        }

        /* Cyan Slider Thumbs (Soft cyan with mild glow) */
        .slider-cyan::-webkit-slider-thumb {
          background: #06b6d4 !important;
          box-shadow: 0 0 6px rgba(6, 182, 212, 0.4);
        }
        .slider-cyan::-webkit-slider-thumb:hover {
          transform: scale(1.25);
        }

        /* Emerald Slider Thumbs (Soft emerald with mild glow) */
        .slider-emerald::-webkit-slider-thumb {
          background: #10b981 !important;
          box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
        }
        .slider-emerald::-webkit-slider-thumb:hover {
          transform: scale(1.25);
        }

        /* Orange Slider Thumbs */
        .slider-orange::-webkit-slider-thumb {
          background: #f97316 !important;
          box-shadow: 0 0 6px rgba(249, 115, 22, 0.4);
        }
        .slider-orange::-webkit-slider-thumb:hover {
          transform: scale(1.25);
        }

        /* Violet Slider Thumbs */
        .slider-violet::-webkit-slider-thumb {
          background: #8b5cf6 !important;
          box-shadow: 0 0 6px rgba(139, 92, 246, 0.4);
        }
        .slider-violet::-webkit-slider-thumb:hover {
          transform: scale(1.25);
        }

        /* Blue Slider Thumbs */
        .slider-blue::-webkit-slider-thumb {
          background: #2563eb !important;
          box-shadow: 0 0 6px rgba(37, 99, 235, 0.4);
        }
        .slider-blue::-webkit-slider-thumb:hover {
          transform: scale(1.25);
        }

        /* Firefox Support */
        .dna-slider::-moz-range-track {
          height: 3px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 9999px;
        }
        .dna-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .slider-fuchsia::-moz-range-thumb {
          background: #d946ef;
          box-shadow: 0 0 6px rgba(217, 70, 239, 0.4);
        }
        .slider-cyan::-moz-range-thumb {
          background: #06b6d4;
          box-shadow: 0 0 6px rgba(6, 182, 212, 0.4);
        }
        .slider-emerald::-moz-range-thumb {
          background: #10b981;
          box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
        }
        .slider-orange::-moz-range-thumb {
          background: #f97316;
          box-shadow: 0 0 6px rgba(249, 115, 22, 0.4);
        }
        .slider-violet::-moz-range-thumb {
          background: #8b5cf6;
          box-shadow: 0 0 6px rgba(139, 92, 246, 0.4);
        }
        .slider-blue::-moz-range-thumb {
          background: #2563eb;
          box-shadow: 0 0 6px rgba(37, 99, 235, 0.4);
        }
        .dna-slider::-moz-range-thumb:hover {
          transform: scale(1.25);
        }
      `}</style>

    </div>
  );
}
