"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleStop, FileAudio, Loader2, Mic2, ShieldCheck, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useVoice } from "@/contexts/VoiceContext";
import { VoiceSampleEditor, type VoiceSampleSelection } from "@/components/voice/VoiceSampleEditor";
import { VoiceUploadGuide } from "@/components/voice/VoiceUploadGuide";
import { failureGuidance, restoreRegistration, registrationPresentation, REGISTRATION_STEPS } from "@/components/voice/registrationUi";
import { MAX_VOICE_SOURCE_BYTES, trimVoiceSampleToWav } from "@/lib/audio/voiceSample";

type Registration = {
  id: string;
  name: string;
  description: string;
  style: string;
  gender: "female" | "male";
  language: string;
  singerSkillLevel: string;
  sourceType: "recorded" | "uploaded";
  status: string;
  validationPhrase?: string;
  errorCode?: string;
  createdAt: string;
};

type UploadTicket = {
  id: string;
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
};

const STATUS_TEXT: Record<string, string> = {
  validation_submitting: "검증 문구 요청을 접수하고 있습니다…",
  validation_pending: "검증 문구를 만들고 있습니다…",
  voice_submitting: "목소리 등록 요청을 접수하고 있습니다…",
  voice_pending: "목소리 특징을 등록하고 있습니다…",
  availability_pending: "Suno V6에서 사용할 수 있는지 확인하고 있습니다…",
};

// Browser recordings are often WebM with an infinite metadata duration.
// Decode and send ordinary mono PCM WAV, supported by both storage and Kie.
async function prepareAudio(file: File) {
  if (file.size > MAX_VOICE_SOURCE_BYTES) throw new Error("40MB 이하 음성 파일을 사용해 주세요.");
  if (normalizedContentType(file) !== "audio/webm") return file;
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > 60) throw new Error("녹음은 60초 이내로 준비해 주세요.");
    const frames = decoded.length;
    if (44 + frames * 2 > MAX_VOICE_SOURCE_BYTES) throw new Error("변환된 음성 파일이 40MB를 넘습니다. 더 짧은 구간을 선택해 주세요.");
    const buffer = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(buffer);
    const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    text(0, "RIFF"); view.setUint32(4, 36 + frames * 2, true); text(8, "WAVE");
    text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, decoded.sampleRate, true);
    view.setUint32(28, decoded.sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, "data"); view.setUint32(40, frames * 2, true);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    for (let i = 0; i < frames; i++) {
      const sample = Math.max(-1, Math.min(1, channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length));
      view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    return new File([buffer], file.name.replace(/\.[^.]+$/, "") + ".wav", { type: "audio/wav" });
  } finally { await context.close(); }
}

function normalizedContentType(file: File) {
  const type = file.type.split(";")[0].toLowerCase();
  if (type === "audio/x-m4a") return "audio/mp4";
  return type || "audio/webm";
}

async function audioDuration(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error("음성 파일 길이를 확인할 수 없습니다."));
      audio.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function api(body: Record<string, unknown>) {
  const response = await fetch("/api/voice/custom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "목소리 등록 요청에 실패했습니다.");
  return data;
}

async function uploadPrivate(file: File, ticket: UploadTicket) {
  const contentType = normalizedContentType(file);
  const uploadFile = file.type === contentType
    ? file
    : new File([file], file.name, { type: contentType, lastModified: file.lastModified });
  const supabase = createClient();
  const { error } = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(
    ticket.path,
    ticket.token,
    uploadFile,
    { contentType },
  );
  if (!error) return;
  const fallback = await fetch(ticket.signedUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: uploadFile });
  if (!fallback.ok) throw new Error("비공개 음성 업로드에 실패했습니다.");
}

export function CreateVoiceModal() {
  const { isCreateModalOpen, closeCreateModal, syncRegisteredVoice } = useVoice();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("");
  const [gender, setGender] = useState<"female" | "male">("female");
  const [language, setLanguage] = useState("ko");
  const [skill, setSkill] = useState("intermediate");
  const [sourceMode, setSourceMode] = useState<"recorded" | "uploaded">("uploaded");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceSelection, setSourceSelection] = useState<VoiceSampleSelection | null>(null);
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [current, setCurrent] = useState<Registration | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recordingTarget, setRecordingTarget] = useState<"source" | "verification" | null>(null);
  const [registrationLoadState, setRegistrationLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [registrationLoadAttempt, setRegistrationLoadAttempt] = useState(0);
  const [verificationPreviewUrl, setVerificationPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingSessionRef = useRef(0);
  const dialogRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const presentation = registrationPresentation(current?.status, current?.validationPhrase);

  const chooseSourceFile = (file: File | null, mode: "recorded" | "uploaded") => {
    setSourceSelection(null);
    if (file && file.size > MAX_VOICE_SOURCE_BYTES) {
      setSourceFile(null);
      setError("40MB 이하 음성 파일을 사용해 주세요.");
      return;
    }
    setError("");
    setSourceFile(file);
    setSourceMode(mode);
  };

  const changeSourceMode = (mode: "recorded" | "uploaded") => {
    if (mode === sourceMode) return;
    recordingSessionRef.current += 1;
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setRecordingTarget(null);
    setSourceMode(mode);
    setSourceFile(null);
    setSourceSelection(null);
  };

  const updateSourceSelection = useCallback((selection: VoiceSampleSelection) => {
    setSourceSelection((previous) => previous?.startSeconds === selection.startSeconds &&
      previous?.endSeconds === selection.endSeconds && previous?.durationSeconds === selection.durationSeconds &&
      previous?.valid === selection.valid ? previous : selection);
  }, []);

  const syncVoice = useCallback((registration: Registration) => {
    if (registration.status !== "ready") return;
    const stylePrompt = registration.style || `${registration.gender} vocals, preserve the registered singer identity and natural expression`;
    syncRegisteredVoice({
      customVoiceId: registration.id,
      name: registration.name,
      desc: registration.description || "Kie · Suno V6 등록 목소리",
      gender: registration.gender,
      language: registration.language,
      category: "Registered Voice",
      tags: ["Suno Voice", registration.style || "Custom"],
      sourceType: registration.sourceType,
      stylePrompt,
      isFavorite: false,
      avatarGradient: registration.gender === "female"
        ? "linear-gradient(135deg, #fb7185, #a855f7)"
        : "linear-gradient(135deg, #22d3ee, #6366f1)",
      voice_model_id: undefined,
      is100PercentSync: false,
    });
  }, [syncRegisteredVoice]);

  const loadRegistrations = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/voice/custom", { cache: "no-store", signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "등록 목소리를 불러오지 못했습니다.");
    if (!Array.isArray(data.voices)) throw new Error("등록 상태를 확인하지 못했습니다. 다시 불러와 주세요.");
    const list = data.voices as Registration[];
    if (signal?.aborted) return list;
    setRegistrations(list);
    list.filter((item) => item.status === "ready").forEach((item) => syncVoice(item));
    setCurrent(restoreRegistration(list));
    return list;
  }, [syncVoice]);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    const controller = new AbortController();
    setRegistrationLoadState("loading");
    setError("");
    void loadRegistrations(controller.signal).then(() => {
      if (!controller.signal.aborted) setRegistrationLoadState("ready");
    }).catch((reason) => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "등록 목소리를 불러오지 못했습니다.");
      setRegistrationLoadState("error");
    });
    return () => { controller.abort(); setRegistrationLoadState("loading"); };
  }, [isCreateModalOpen, loadRegistrations, registrationLoadAttempt]);

  useEffect(() => {
    if (!isCreateModalOpen || !verificationFile) { setVerificationPreviewUrl(null); return; }
    const previewUrl = URL.createObjectURL(verificationFile);
    setVerificationPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [isCreateModalOpen, verificationFile]);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const main = document.querySelector<HTMLElement>("main");
    const previousMainOverflow = main?.style.overflowY;
    document.body.style.overflow = "hidden";
    if (main) main.style.overflowY = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeCreateModal(); return; }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, audio[controls], [href], [tabindex]:not([tabindex="-1"])'))
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (!controls.includes(document.activeElement as HTMLElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (main) main.style.overflowY = previousMainOverflow || "";
      previousFocus?.focus();
    };
  // The close action is stable in behavior; rerenders must not reset keyboard focus.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateModalOpen]);

  useEffect(() => {
    if (isCreateModalOpen && registrationLoadState === "ready") headingRef.current?.focus();
  }, [isCreateModalOpen, registrationLoadState, presentation.step]);

  const currentId = current?.id;
  const currentStatus = current?.status;
  useEffect(() => { setVerificationFile(null); }, [currentId, current?.validationPhrase]);

  useEffect(() => {
    if (!currentId || !currentStatus || !STATUS_TEXT[currentStatus]) return;
    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await api({ action: "poll", id: currentId });
        if (cancelled) return;
        const next = data.voice as Registration;
        setCurrent(next);
        setRegistrations((items) => [next, ...items.filter((item) => item.id !== next.id)]);
        if (next.status === "ready") syncVoice(next);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "상태 확인에 실패했습니다.");
      } finally { inFlight = false; }
    };
    void poll();
    const timer = window.setInterval(poll, 4_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [currentId, currentStatus, syncVoice]);

  useEffect(() => () => {
    recordingSessionRef.current += 1;
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setRecordingTarget(null);
  }, [isCreateModalOpen]);

  const startRecording = async (target: "source" | "verification") => {
    const session = ++recordingSessionRef.current;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("이 브라우저에서는 녹음할 수 없습니다. 음성 파일을 업로드해 주세요.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (session !== recordingSessionRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (session === recordingSessionRef.current && event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        if (session !== recordingSessionRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
        const type = (recorder.mimeType || "audio/webm").split(";")[0];
        const extension = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
        const file = new File(chunksRef.current, `${target}-${Date.now()}.${extension}`, { type });
        if (target === "source") chooseSourceFile(file, "recorded");
        else setVerificationFile(file);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setRecordingTarget(null);
      };
      recorder.start(500);
      setRecordingTarget(target);
    } catch {
      if (session !== recordingSessionRef.current) return;
      setError("마이크 권한을 확인하거나 음성 파일을 업로드해 주세요.");
    }
  };

  const stopRecording = () => mediaRecorderRef.current?.stop();

  const beginRegistration = async () => {
    if (registrationLoadState !== "ready") return;
    if (!sourceFile || !sourceSelection?.valid || !name.trim() || !consent) {
      setError("이름, 6초~2분 음성 구간, 사용 권한 확인이 필요합니다.");
      return;
    }
    setBusy(true); setError("");
    let registrationId = "";
    let submissionStarted = false;
    try {
      const { file: prepared, durationSeconds: duration } = await trimVoiceSampleToWav(
        sourceFile, sourceSelection.startSeconds, sourceSelection.endSeconds,
      );
      const ticket = await api({
        action: "prepare-source-upload", name: name.trim(), description, style, gender, language,
        singerSkillLevel: skill, sourceType: sourceMode, consent: true,
        contentType: normalizedContentType(prepared), fileSize: prepared.size,
      }) as UploadTicket;
      registrationId = ticket.id;
      await uploadPrivate(prepared, ticket);
      submissionStarted = true;
      const data = await api({ action: "start-validation", id: ticket.id, durationSeconds: duration });
      setCurrent(data.voice as Registration);
    } catch (reason) {
      if (registrationId && !submissionStarted) {
        void fetch("/api/voice/custom", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: registrationId }) });
      } else if (registrationId) {
        const list = await loadRegistrations().catch(() => [] as Registration[]);
        const saved = list.find((item) => item.id === registrationId);
        if (saved) setCurrent(saved);
        if (saved?.status === "failed") return;
      }
      setError(reason instanceof Error ? reason.message : "목소리 등록을 시작하지 못했습니다.");
    } finally { setBusy(false); }
  };

  const submitVerification = async () => {
    if (registrationLoadState !== "ready") return;
    if (!current || !verificationFile) { setError("검증 문구를 읽은 녹음이 필요합니다."); return; }
    setBusy(true); setError("");
    try {
      const prepared = await prepareAudio(verificationFile);
      const duration = await audioDuration(prepared);
      if (!Number.isFinite(duration) || duration < 2) throw new Error("검증 문구 전체가 들리는 녹음을 사용해 주세요.");
      const ticket = await api({ action: "prepare-verification-upload", id: current.id,
        contentType: normalizedContentType(prepared), fileSize: prepared.size }) as UploadTicket;
      await uploadPrivate(prepared, ticket);
      const data = await api({ action: "start-creation", id: current.id });
      setCurrent(data.voice as Registration);
    } catch (reason) {
      const list = await loadRegistrations().catch(() => [] as Registration[]);
      const saved = list.find((item) => item.id === current.id);
      if (saved) setCurrent(saved);
      if (saved?.status === "failed") return;
      setError(reason instanceof Error ? reason.message : "본인 확인 녹음을 제출하지 못했습니다.");
    } finally { setBusy(false); }
  };

  const resetForm = () => {
    setCurrent(null); setSourceFile(null); setSourceSelection(null); setVerificationFile(null); setConsent(false); setError("");
  };

  if (!isCreateModalOpen || typeof document === "undefined") return null;

  const pending = current && STATUS_TEXT[current.status];
  const draft = current?.status === "draft";
  const ready = current?.status === "ready";
  const phraseReady = current?.status === "phrase_ready";
  const failed = current?.status === "failed";
  const failure = failed ? failureGuidance(current.errorCode, current.validationPhrase) : null;
  const previousFailure = registrations.find((item) => item.status === "failed");

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-voice-title" aria-describedby="create-voice-description" tabIndex={-1} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-fuchsia-500/30 bg-[#121116] shadow-2xl outline-none">
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-white/10 bg-[#121116] px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 ref={headingRef} id="create-voice-title" tabIndex={-1} className="text-xl font-bold text-white outline-none">{registrationLoadState === "ready" ? presentation.title : "이전 등록 상태 확인"}</h2>
            </div>
            <p id="create-voice-description" className="mt-2 text-xs leading-relaxed text-zinc-400">{registrationLoadState === "ready" ? presentation.description : "진행 중인 등록을 확인한 뒤 해당 단계로 이어갑니다."}</p>
            {registrationLoadState === "ready" && <ol aria-label="목소리 등록 진행 단계" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px]">
              {REGISTRATION_STEPS.map((step, index) => <li key={step} aria-current={presentation.step === index + 1 ? "step" : undefined} className={`flex items-center gap-1.5 ${presentation.step === index + 1 ? "font-bold text-fuchsia-200" : "text-zinc-500"}`}><span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full border border-current">{index + 1}</span>{step}</li>)}
            </ol>}
          </div>
          <button type="button" onClick={closeCreateModal} aria-label="목소리 등록 창 닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"><X aria-hidden="true" className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">{error}</div>}
          {registrationLoadState === "loading" && <div role="status" className="flex flex-col items-center gap-3 py-10 text-center text-sm text-zinc-300"><Loader2 aria-hidden="true" className="h-7 w-7 animate-spin" />이전 등록 상태를 불러오고 있습니다.</div>}
          {registrationLoadState === "error" && <div className="space-y-4 py-8 text-center"><p className="text-sm text-zinc-400">진행 중인 등록을 확인하지 못했습니다. 상태를 확인한 뒤 이어서 진행해 주세요.</p><button type="button" onClick={() => setRegistrationLoadAttempt(attempt => attempt + 1)} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white">등록 상태 다시 불러오기</button></div>}

          {registrationLoadState === "ready" && pending && (
            <div role="status" className="flex flex-col items-center py-14 text-center">
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-fuchsia-400" />
              <h3 className="font-bold text-white">{current.errorCode === "provider_result_unrecognized" ? failureGuidance(current.errorCode).title : pending}</h3>
              <p className="mt-2 text-xs text-zinc-400">{current.errorCode === "provider_result_unrecognized"
                ? failureGuidance(current.errorCode).detail
                : current.status === "validation_submitting" || current.status === "validation_pending"
                ? "샘플 확인이 끝나면 본인 확인용 문구가 표시됩니다. 창을 닫아도 작업은 계속되며 다시 열면 상태를 확인할 수 있습니다."
                : "창을 닫아도 작업은 계속되며 다시 열면 상태를 이어서 확인합니다."}</p>
              {current.errorCode === "provider_result_unrecognized" && <p className="mt-3 select-text break-all text-[11px] text-zinc-500">등록 ID: {current.id}</p>}
            </div>
          )}

          {registrationLoadState === "ready" && draft && (
            <div className="py-10 text-center">
              <h3 className="font-bold text-white">목소리 등록 준비를 완료하지 못했습니다</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">검증 요청을 보내기 전 단계에서 멈췄습니다. 입력 화면으로 돌아가 안내된 오류를 확인해 주세요. 선택한 파일과 음성 구간은 유지됩니다.</p>
              <p className="mt-3 select-text break-all text-[11px] text-zinc-500">등록 ID: {current.id}</p>
              <button type="button" onClick={() => setCurrent(null)} className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white">입력 화면으로 돌아가기</button>
            </div>
          )}

          {registrationLoadState === "ready" && phraseReady && (
            <div className="space-y-5">
              <p className="text-sm leading-relaxed text-zinc-300"><strong className="text-white">{current.name}</strong>의 목소리 샘플을 이미 제출했습니다. 같은 사람이 아래 문구를 읽은 새 녹음을 준비해 주세요.</p>
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-5">
                <span className="text-[10px] font-bold tracking-wider text-cyan-300">본인 확인용 문구 · 그대로 읽어 주세요</span>
                <p lang={current.language} className="mt-2 select-text text-lg font-bold leading-relaxed text-white">{current.validationPhrase}</p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">노래 샘플을 다시 제출하는 단계가 아닙니다. 위 문구만 자연스럽게 말로 읽어 녹음해 주세요. 음악이나 다른 사람의 목소리가 섞이지 않아야 합니다.</p>
              </div>
              <div className="space-y-3">
                <button type="button" disabled={busy} onClick={() => recordingTarget === "verification" ? stopRecording() : startRecording("verification")} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-4 text-sm font-bold text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-40">
                  {recordingTarget === "verification" ? <CircleStop className="h-5 w-5" /> : <Mic2 className="h-5 w-5" />}
                  {recordingTarget === "verification" ? "녹음 끝내기" : "위 문구 읽고 녹음하기"}
                </button>
                <details className="rounded-xl border border-white/10 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-zinc-300">이미 녹음한 본인 확인 문구 파일 사용</summary>
                  <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-3 text-xs font-semibold text-zinc-200 hover:bg-white/10 focus-within:ring-2 focus-within:ring-fuchsia-400">
                    <Upload aria-hidden="true" className="h-4 w-4" /> 검증 문구를 읽은 녹음 파일 선택
                    <input type="file" accept="audio/*" aria-label="검증 문구를 읽은 녹음 파일 선택" disabled={busy || !!recordingTarget} className="sr-only" onChange={(event) => setVerificationFile(event.target.files?.[0] || null)} />
                  </label>
                </details>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">본인 확인 문구 전체를 읽은 말소리 녹음 · 멜로디오 기준 최대 40MB · MP3/WAV 권장. M4A/AAC/OGG/WebM은 브라우저의 재생·변환 지원에 따라 사용할 수 있습니다.</p>
              {verificationFile && <div className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-xs text-emerald-300"><FileAudio className="h-4 w-4" />{verificationFile.name}</div>}
              {verificationPreviewUrl && <audio controls preload="metadata" src={verificationPreviewUrl} aria-label="본인 확인 녹음 미리듣기" className="w-full" />}
              <button type="button" disabled={!verificationFile || busy || !!recordingTarget} onClick={submitVerification} className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 px-5 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "본인 확인 요청 중…" : "본인 확인 요청"}</button>
              <p className="text-center text-xs text-zinc-400">검증을 통과하면 내 음색 스타일에 저장됩니다.</p>
            </div>
          )}

          {registrationLoadState === "ready" && ready && (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300"><Check className="h-7 w-7" /></div>
              <h3 className="text-xl font-bold text-white">{current.name} 등록 완료</h3>
              <p className="mt-2 text-xs text-zinc-400">목소리 선택 목록에 추가되었습니다. Suno V6 보컬곡 생성에 사용할 수 있습니다.</p>
              <button type="button" onClick={() => { resetForm(); closeCreateModal(); }} className="mt-6 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-zinc-950">완료</button>
            </div>
          )}

          {registrationLoadState === "ready" && failed && (
            <div className="flex flex-col items-center py-12 text-center">
              <X className="mb-3 h-10 w-10 text-red-400" />
              <h3 className="font-bold text-white">{failure?.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">{failure?.detail}</p>
              <p className="mt-3 select-text break-all text-[11px] text-zinc-500">등록 ID: {current.id}</p>
              {failure?.canStartNew && <button type="button" onClick={resetForm} className="mt-5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white">새 등록 화면</button>}
            </div>
          )}

          {registrationLoadState === "ready" && !current && (
            <div className="space-y-5">
              {previousFailure && (
                <details className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-zinc-300">
                  <summary className="cursor-pointer font-semibold text-amber-200">이전 등록 실패 기록 보기 · 자동 재요청 없음</summary>
                  <p className="mt-3 leading-relaxed">{failureGuidance(previousFailure.errorCode, previousFailure.validationPhrase).detail}</p>
                  <p className="mt-2 select-text break-all text-zinc-400">등록 ID: {previousFailure.id}</p>
                </details>
              )}
              <label className="block text-xs font-semibold text-zinc-300">목소리 이름<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="예: My Warm Vocal" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-fuchsia-500/60" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-zinc-400">성별<select value={gender} onChange={(event) => setGender(event.target.value as "female" | "male")} className="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white"><option value="female">여성</option><option value="male">남성</option></select></label>
                <label className="text-xs text-zinc-400">검증 문구 언어<select value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white"><option value="ko">한국어</option><option value="en">English</option><option value="ja">日本語</option></select></label>
              </div>
              <VoiceUploadGuide />

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex gap-2">
                  <button type="button" disabled={busy || !!recordingTarget} onClick={() => changeSourceMode("uploaded")} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold ${sourceMode === "uploaded" ? "bg-fuchsia-600 text-white" : "bg-white/5 text-zinc-400"}`}>파일 선택</button>
                  <button type="button" disabled={busy || !!recordingTarget} onClick={() => changeSourceMode("recorded")} className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold ${sourceMode === "recorded" ? "bg-fuchsia-600 text-white" : "bg-white/5 text-zinc-400"}`}>직접 녹음</button>
                </div>
                {sourceMode === "uploaded" ? (
                  <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-white/15 px-4 py-6 text-center hover:border-fuchsia-500/50 focus-within:ring-2 focus-within:ring-fuchsia-400"><Upload className="mb-2 h-6 w-6 text-fuchsia-400" /><span className="text-sm font-bold text-white">목소리 샘플 파일 선택</span><span className="mt-1 text-[11px] text-zinc-400">멜로디오 업로드 기준: 최대 40MB · 업로드 후 6초~2분 구간 선택</span><input type="file" accept="audio/*" aria-label="목소리 샘플 파일 선택" disabled={busy || !!recordingTarget} className="sr-only" onChange={(event) => chooseSourceFile(event.target.files?.[0] || null, "uploaded")} /></label>
                ) : (
                  <button type="button" onClick={() => recordingTarget === "source" ? stopRecording() : startRecording("source")} className="flex w-full flex-col items-center rounded-xl border border-dashed border-white/15 px-4 py-6 hover:border-fuchsia-500/50"><Mic2 className="mb-2 h-6 w-6 text-fuchsia-400" /><span className="text-sm font-bold text-white">{recordingTarget === "source" ? "녹음 끝내기" : "목소리 샘플 녹음"}</span><span className="mt-1 text-[11px] text-zinc-500">반주 없이 노래하거나 말한 뒤 6초~2분 구간을 선택해 주세요</span></button>
                )}
                {sourceFile && <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"><FileAudio className="h-4 w-4" />{sourceFile.name}</div>}
                {sourceFile && <VoiceSampleEditor file={sourceFile} onSelectionChange={updateSourceSelection} />}
              </div>

              <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <summary className="cursor-pointer text-xs font-semibold text-zinc-300">추가 정보 (선택)</summary>
                <div className="mt-4 space-y-4">
                  <label className="block text-xs font-semibold text-zinc-300">보컬 스타일<input value={style} onChange={(event) => setStyle(event.target.value)} maxLength={120} placeholder="예: warm indie pop" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-fuchsia-500/60" /></label>
                  <label className="block text-xs font-semibold text-zinc-300">설명<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} placeholder="선택 사항" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-fuchsia-500/60" /></label>
                  <label className="block text-xs text-zinc-400">숙련도<select value={skill} onChange={(event) => setSkill(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white"><option value="beginner">입문</option><option value="intermediate">중급</option><option value="advanced">고급</option><option value="professional">전문</option></select></label>
                </div>
              </details>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4 accent-fuchsia-600" />
                <span className="text-xs leading-relaxed text-zinc-300"><strong className="text-white">본인의 목소리이거나 명시적 허가를 받은 목소리</strong>임을 확인합니다. 샘플은 비공개로 저장되고 Kie.ai의 등록 처리에 사용되며, 등록 완료 후 Melodio 저장본은 삭제됩니다.</span>
              </label>
              <div className="flex items-start gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-400" /><p className="text-xs leading-relaxed text-zinc-400">샘플 확인이 끝나면 본인 확인용 문구가 표시됩니다. 같은 사람이 문구를 그대로 읽어 새로 녹음해 주세요.</p></div>
              <button type="button" disabled={!name.trim() || !sourceFile || !sourceSelection?.valid || !consent || busy || !!recordingTarget} onClick={beginRegistration} className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 px-5 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "샘플 제출 중…" : "샘플 제출하고 본인 확인으로"}</button>

              {registrations.some((item) => item.status === "ready") && (
                <div className="border-t border-white/10 pt-5"><h3 className="mb-2 text-xs font-bold text-zinc-300">등록 완료된 목소리</h3><div className="space-y-2">{registrations.filter((item) => item.status === "ready").map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"><span className="text-sm font-semibold text-white">{item.name}</span><span className="text-[10px] font-bold text-emerald-300">사용 가능</span></div>)}</div></div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>, document.body,
  );
}
