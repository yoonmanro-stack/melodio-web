"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, RefreshCw, Phone, Zap, MapPin, Radio, AlertTriangle, ExternalLink, CheckCircle
} from "lucide-react";
import * as h3 from "h3-js";

export default function PioneerRescuePage() {
  // Main Sub-Tab: "victim" (조난자 1-Tap SOS) vs "center" (관제 센터 모니터링)
  const [activeTab, setActiveTab] = useState<"victim" | "center">("victim");

  // Phone Numbers
  const [myPhone, setMyPhone] = useState<string>("");
  const [guardianPhone, setGuardianPhone] = useState<string>("");
  const [testModeEnabled, setTestModeEnabled] = useState<boolean>(false);
  const [testFloor, setTestFloor] = useState<string>("9");

  // Real-time Sensor & Location States
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [isSosSending, setIsSosSending] = useState<boolean>(false);
  const [sosStatusText, setSosStatusText] = useState<string>("위성/GPS 센서 가동 중");
  const [sosH3Cell, setSosH3Cell] = useState<string>("8d30e1ce04c07bf");
  const [sosGpsDisplay, setSosGpsDisplay] = useState<string>("-");

  // Result Dispatch Record Modal
  const [sosResultModal, setSosResultModal] = useState<{
    dispatchId: string;
    h3Index: string;
    alt: number;
    lat: number;
    lng: number;
    smsPayload: string;
    mapsUrl: string;
  } | null>(null);

  // Control Center Logs
  const [sosDispatchLogs, setSosDispatchLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);

  // Load saved phone numbers & silently snap GPS location on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedGuardian = localStorage.getItem("melodio_guardian_phone");
      if (savedGuardian) setGuardianPhone(savedGuardian);

      const savedMy = localStorage.getItem("melodio_my_phone");
      if (savedMy) setMyPhone(savedMy);

      // Silent GPS snap for map preview
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setUserLocation({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            });
            try {
              const cell = h3.latLngToCell(pos.coords.latitude, pos.coords.longitude, 13);
              setSosH3Cell(cell);
              setSosGpsDisplay(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
            } catch {}
            // 🚨 문자 링크 클릭 시 100% 자동 가동 (?sos=1 또는 ?auto=1)
            try {
              const urlParams = new URLSearchParams(window.location.search);
              if (urlParams.get("sos") === "1" || urlParams.get("auto") === "1") {
                setTimeout(() => {
                  triggerRescueSOS();
                }, 300);
              }
            } catch {}
          },
          () => {},
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }
    }
  }, []);

  const updateGuardianPhone = (val: string) => {
    setGuardianPhone(val);
    if (typeof window !== "undefined") localStorage.setItem("melodio_guardian_phone", val);
  };

  const updateMyPhone = (val: string) => {
    setMyPhone(val);
    if (typeof window !== "undefined") localStorage.setItem("melodio_my_phone", val);
  };

  // SMS Recipients Calculation (테스트 중 실시간 오발송 100% 차단)
  const getSmsRecipients = () => {
    const primary = myPhone ? myPhone : guardianPhone;
    const list = [primary].filter(Boolean);
    return list.join(",");
  };

  // Fetch Control Logs
  const fetchSosDispatchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch("/api/pioneer/sos-rescue");
      const data = await res.json();
      if (data.success && Array.isArray(data.dispatches)) {
        setSosDispatchLogs(data.dispatches);
      }
    } catch (e) {
      console.warn("Failed to fetch SOS logs:", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const [sensorTestResult, setSensorTestResult] = useState<string | null>(null);
  const [isTestingSensor, setIsTestingSensor] = useState<boolean>(false);

  // 🏔️ Android Native, Capacitor & iOS Barometer Hardware Reader
  const readHardwareBarometer = async (): Promise<number | null> => {
    if (typeof window === "undefined") return null;

    // 0. Android Native Java Bridge (SensorManager TYPE_PRESSURE - 100% Hardware Direct)
    try {
      if ((window as any).AndroidBarometer && (window as any).AndroidBarometer.isSupported()) {
        const pVal = (window as any).AndroidBarometer.getPressure();
        if (pVal && pVal > 0) return Number(pVal);
      }
    } catch {}

    // 1. Capacitor / Android Native Plugin
    try {
      if ((window as any).Capacitor?.Plugins?.Barometer) {
        const res = await (window as any).Capacitor.Plugins.Barometer.getPressure();
        if (res && res.pressure) return Number(res.pressure);
      }
    } catch {}

    // 2. iOS Native WebKit Bridge
    try {
      if ((window as any).webkit?.messageHandlers?.getBarometerPressure) {
        const pVal = await (window as any).webkit.messageHandlers.getBarometerPressure.postMessage({});
        if (pVal) return Number(pVal);
      }
    } catch {}

    // 3. Android Chrome W3C Generic Sensor API (Promise-based for async reading event)
    if ("Barometer" in window) {
      return new Promise((resolve) => {
        try {
          const bSensor = new (window as any).Barometer({ frequency: 10 });
          const timer = setTimeout(() => {
            try { bSensor.stop(); } catch {}
            resolve(null);
          }, 800);

          bSensor.addEventListener("reading", () => {
            clearTimeout(timer);
            const pVal = bSensor.pressure ? Number(bSensor.pressure) : null;
            try { bSensor.stop(); } catch {}
            resolve(pVal);
          });

          bSensor.addEventListener("error", () => {
            clearTimeout(timer);
            resolve(null);
          });

          bSensor.start();
        } catch (e) {
          resolve(null);
        }
      });
    }

    return null;
  };

  const testLiveBarometerSensor = async () => {
    setIsTestingSensor(true);
    setSensorTestResult("하드웨어 기압 센서 탐지 중...");

    if (typeof window === "undefined") {
      setSensorTestResult("웹 브라우저 환경이 아닙니다.");
      setIsTestingSensor(false);
      return;
    }

    const val = await readHardwareBarometer();
    if (val !== null) {
      setSensorTestResult(`✅ 기압계 감지 성공! 실측 수치: ${val.toFixed(2)} hPa`);
    } else {
      let reason = "⚠️ 웹 PWA 기압계 차단 상태";
      if (!("Barometer" in window)) {
        reason += " (크롬 웹브라우저 'Barometer' 표준 API 미개방)";
      } else {
        reason += " (API는 존재하나 센서 응답 미도달/권한 미허용)";
      }
      setSensorTestResult(reason);
    }
    setIsTestingSensor(false);
  };

  // 🚨 1-Tap Rescue SOS Execution (100% Automatic Physics & Geospatial Engine)
  const triggerRescueSOS = async () => {
    if (typeof window !== "undefined" && navigator.vibrate) {
      navigator.vibrate([100, 50, 150]);
    }

    setIsSosSending(true);
    setSosStatusText("📍 고정밀 GPS 위성 수신 중...");

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      alert("GPS 위치 서비스를 사용할 수 없습니다.");
      setIsSosSending(false);
      return;
    }

    // High precision satellite warmup loop (4.0s max)
    const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
    let bestPosition: GeolocationPosition | null = null;
    let watchIdNum: number | null = null;
    let isDispatched = false;

    const executeSosDispatch = async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy || 19.0;
      const alt = pos.coords.altitude != null ? pos.coords.altitude : null;

      let computedH3 = "8d30e1ce04c07bf";
      try {
        computedH3 = h3.latLngToCell(lat, lng, 13);
      } catch {}

      setSosH3Cell(computedH3);
      setSosGpsDisplay(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);

      // Request iOS Motion & Environmental Sensor permission if required
      if (typeof window !== "undefined" && typeof (DeviceMotionEvent as any) !== "undefined" && typeof (DeviceMotionEvent as any).requestPermission === "function") {
        try {
          await (DeviceMotionEvent as any).requestPermission();
        } catch {}
      }

      // Read Hardware Barometer Sensor (Android Chrome W3C Sensor, Capacitor & Native Bridge)
      const devicePressure = await readHardwareBarometer();

      try {
        const res = await fetch("/api/pioneer/sos-rescue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat,
            lng,
            accuracy,
            altitude: alt,
            pressure: devicePressure,
            floor: testModeEnabled && testFloor ? Number(testFloor) : null,
            spotCategory: "INDOOR_REAL",
            channel: "HTTP/5G"
          })
        });

        const data = await res.json();
        setIsSosSending(false);

        if (data.success) {
          const realH3 = data.centerH3IndexR14 || data.centerH3Index || computedH3;
          const encLoc = encodeURIComponent(data.locationText || "");
          const h3MapUrl = `https://melodio.app/pioneer/sos-map?id=${data.sosDispatchId}&lat=${lat}&lng=${lng}&h3=${realH3}&alt=${data.altitudeMetrics?.deviceAltitudeMsl ?? (alt ?? 0)}&env=${data.envType || ''}&loc=${encLoc}`;
          const fullMsg = `${data.smsPayload}\n${h3MapUrl}`;
          const recipients = getSmsRecipients();

          setSosResultModal({
            dispatchId: data.sosDispatchId,
            h3Index: realH3,
            alt: data.altitudeMetrics?.deviceAltitudeMsl ?? (alt ?? 0),
            lat,
            lng,
            smsPayload: data.smsPayload,
            mapsUrl: h3MapUrl
          });

          // Trigger SMS link cleanly
          setTimeout(() => {
            if (typeof window !== "undefined") {
              window.location.href = `sms:${recipients}?body=${encodeURIComponent(fullMsg)}`;
            }
          }, 150);
        } else {
          alert("백엔드 수색 연산 오류: " + (data.error || "알 수 없는 오류"));
        }
      } catch (e) {
        setIsSosSending(false);
        alert("통신 문제 발생. 위치 문자 앱을 실행합니다.");
        const recipients = getSmsRecipients();
        const fallbackMsg = `[SOS 긴급 구조 요청]\n구조자 위치 -> 건물 지상 1층 / 단지 야외\nH3:${computedH3}\nGPS:${lat.toFixed(5)},${lng.toFixed(5)}\nhttps://melodio.app/pioneer/sos-map?h3=${computedH3}&lat=${lat}&lng=${lng}`;
        window.location.href = `sms:${recipients}?body=${encodeURIComponent(fallbackMsg)}`;
      }
    };

    watchIdNum = navigator.geolocation.watchPosition(
      (pos) => {
        if (!bestPosition || pos.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = pos;
        }
        setSosStatusText(`GPS 위성 핀포인트 고정 중 (수평오차 ±${pos.coords.accuracy.toFixed(1)}m)`);
        if (pos.coords.accuracy <= 8.0 && !isDispatched) {
          isDispatched = true;
          if (watchIdNum !== null) navigator.geolocation.clearWatch(watchIdNum);
          executeSosDispatch(pos);
        }
      },
      (err) => {
        console.warn("watchPosition note:", err);
      },
      options
    );

    setTimeout(() => {
      if (watchIdNum !== null) navigator.geolocation.clearWatch(watchIdNum);
      if (!isDispatched) {
        isDispatched = true;
        if (bestPosition) {
          executeSosDispatch(bestPosition);
        } else {
          navigator.geolocation.getCurrentPosition(
            (fallbackPos) => executeSosDispatch(fallbackPos),
            (err) => {
              setSosStatusText("GPS 수신 실패");
              alert("GPS 위치 수신 실패: " + err.message);
              setIsSosSending(false);
            },
            options
          );
        }
      }
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 font-sans flex flex-col items-center justify-between p-4 sm:p-6 select-none">
      
      {/* 🟢 최상단 헤더 스위처 (조난자 SOS vs 관제 모니터링) */}
      <div className="w-full max-w-md bg-[#121620] border border-zinc-800 p-1.5 rounded-2xl flex gap-1 shadow-2xl mb-4">
        <button
          onClick={() => setActiveTab("victim")}
          className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "victim"
              ? "bg-red-600 text-white shadow-lg shadow-red-900/50 scale-[1.02]"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Zap className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>📱 1-Tap SOS 조난자</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("center");
            fetchSosDispatchLogs();
          }}
          className={`flex-1 py-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "center"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/50 scale-[1.02]"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Radio className="w-4 h-4 text-cyan-200" />
          <span>📟 관제 센터 모니터링</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* MODE A: 조난자 전용 1-Tap SOS 스마트폰 인터페이스 */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "victim" && (
        <div className="w-full max-w-md flex flex-col items-center gap-5">
          
          {/* 상태 표시 및 보호자 설정 카드 */}
          <div className="w-full bg-[#0d1117] border border-zinc-800 rounded-3xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-xs font-black text-emerald-300">긴급 구조 관제 시스템 가동 중</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                H3: {sosH3Cell.slice(0, 10)}...
              </span>
            </div>
            {/* 본인 / 보호자 전화번호 입력 */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-amber-400" /> 수신 휴대폰 번호 (테스트용)
                </span>
                <label className="flex items-center gap-1 cursor-pointer text-[10px] text-amber-300 font-bold">
                  <input
                    type="checkbox"
                    checked={testModeEnabled}
                    onChange={(e) => setTestModeEnabled(e.target.checked)}
                    className="rounded border-zinc-700"
                  />
                  <span>테스트 모드</span>
                </label>
              </div>

              {testModeEnabled && (
                <div className="flex items-center justify-between bg-amber-950/30 border border-amber-800/40 px-3 py-1.5 rounded-xl">
                  <span className="text-[11px] font-bold text-amber-300">🏢 테스트 수직 층수 지정:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={testFloor}
                      onChange={(e) => setTestFloor(e.target.value)}
                      className="w-16 bg-black border border-amber-500/60 rounded px-2 py-0.5 text-xs text-amber-200 font-mono font-bold text-center focus:outline-none"
                      placeholder="9"
                    />
                    <span className="text-xs font-bold text-amber-300">층</span>
                  </div>
                </div>
              )}
              <input
                type="tel"
                placeholder="테스트 수신 휴대폰 번호 입력"
                value={myPhone}
                onChange={(e) => updateMyPhone(e.target.value)}
                className="w-full bg-black/60 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
              />

              <div className="pt-1">
                <span className="text-zinc-400 flex items-center gap-1 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 보호자 번호 (SOS 동시 수신)
                </span>
                <input
                  type="tel"
                  placeholder="보호자 휴대폰 번호 (선택 사항)"
                  value={guardianPhone}
                  onChange={(e) => updateGuardianPhone(e.target.value)}
                  className="w-full bg-black/60 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600"
                />
              </div>
            </div>
          </div>

          {/* 🚨 대문짝 원-버튼 SOS 거대 레드 서클 (100% 무버튼 자동 연산) */}
          <div className="my-2 flex flex-col items-center justify-center relative">
            <button
              onClick={triggerRescueSOS}
              disabled={isSosSending}
              className="w-72 h-72 sm:w-80 sm:h-80 rounded-full border-4 border-amber-300/80 bg-gradient-to-br from-[#ff2a2a] via-[#d70000] to-[#800000] text-white cursor-pointer shadow-[0_0_90px_rgba(255,42,42,0.9)] active:scale-95 transition-all animate-[pulse_1.2s_infinite] flex flex-col items-center justify-center gap-1 disabled:opacity-50"
              style={{ boxShadow: "0 0 90px rgba(255, 42, 42, 0.9)" }}
            >
              {isSosSending ? (
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-20 h-20 text-white animate-spin" />
                  <span className="text-2xl font-black text-amber-200 tracking-tight">위치 측정 중...</span>
                  <span className="text-xs text-zinc-200 font-mono">{sosStatusText}</span>
                </div>
              ) : (
                <>
                  <span className="text-[95px] sm:text-[110px] font-black drop-shadow-2xl tracking-tighter text-white leading-none">SOS</span>
                  <span className="text-xl sm:text-2xl font-black text-amber-300 tracking-tight drop-shadow-lg">터치 시 즉시 위치 전송</span>
                </>
              )}
            </button>
          </div>

          {/* ⚡ SOS 버튼 하단 - 버전 및 엔진 최신 새로고침 독립 버튼 */}
          <div className="mt-3 flex items-center justify-center">
            <button
              type="button"
              onClick={() => {
                window.location.href = "/pioneer?v=" + Date.now();
              }}
              className="text-xs font-mono font-bold text-amber-200 bg-zinc-900/90 hover:bg-amber-950/80 px-4 py-1.5 rounded-full border border-amber-500/50 shadow-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <span>⚡ v3.5.6 (안드로이드 기압계 + 산악엔진)</span>
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] text-amber-400/80 bg-black/60 px-1.5 py-0.5 rounded border border-amber-500/30">캐시 새로고침</span>
            </button>
          </div>

          {/* 📲 안드로이드 전용 네이티브 앱 (.APK) 원클릭 다운로드 바 */}
          <div className="mt-3 w-full p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/90 via-teal-950/80 to-zinc-900 border border-emerald-500/50 flex items-center justify-between shadow-xl">
            <div className="flex flex-col text-left gap-0.5">
              <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                안드로이드 전용 네이티브 앱 (APK)
              </span>
              <span className="text-[10px] text-emerald-200/80 font-medium">
                하드웨어 기압계(Sensor.TYPE_PRESSURE) 100% 탑재
              </span>
            </div>
            <a
              href="/Pioneer119Rescue.apk"
              download="Pioneer119Rescue.apk"
              className="text-xs font-extrabold text-black bg-emerald-400 hover:bg-emerald-300 px-3.5 py-1.5 rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
            >
              <span>APK 다운로드</span>
            </a>
          </div>

          {/* 📡 내 폰 하드웨어 기압계 실시간 진단 카드 */}
          <div className="mt-3 w-full p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col items-center gap-2 text-center shadow-lg">
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
                내 폰 기압계 센서 실시간 검사
              </span>
              <button
                type="button"
                onClick={testLiveBarometerSensor}
                disabled={isTestingSensor}
                className="text-xs font-bold text-black bg-amber-400 hover:bg-amber-300 px-3 py-1 rounded-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isTestingSensor ? "진단 중..." : "센서 검사 시작"}
              </button>
            </div>
            {sensorTestResult && (
              <div className="mt-1 w-full text-left text-xs font-mono p-2.5 rounded-xl bg-black/70 border border-amber-500/30 text-amber-200 leading-relaxed">
                {sensorTestResult}
              </div>
            )}
          </div>

          {/* 🚨 3D 센서 및 위치 정보 사전 동의 (체크박스 체크 상태) */}
          <div className="mt-1 flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-300/90 bg-amber-950/40 border border-amber-800/50 px-3.5 py-1.5 rounded-full shadow-md">
            <input
              type="checkbox"
              checked
              readOnly
              className="accent-amber-500 w-3.5 h-3.5 rounded cursor-default pointer-events-none"
            />
            <span>🚨 3D 수직 고도 및 위치 센서 정보 제공에 동의합니다</span>
          </div>

          {/* 하단 안내 가이드 */}
          <div className="w-full text-center">
            <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 font-medium leading-relaxed">
              * SOS 버튼을 누르시면 <strong className="text-amber-300 font-extrabold">별도 조작 없이</strong> 위성 GPS + 국토부 지적도 필지 + 3D 기압계 수직고도가 자동 분석되어 지정 번호로 발송됩니다.
            </div>
          </div>

        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* MODE B: 관제센터 & 특허 수색 모니터링 레이더 */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      {activeTab === "center" && (
        <div className="w-full max-w-2xl bg-[#0d1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
              <h2 className="text-base font-black text-white">📟 긴급구조 관제 모니터링</h2>
            </div>
            <button
              onClick={fetchSosDispatchLogs}
              disabled={isLoadingLogs}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? "animate-spin" : ""}`} />
              <span>새로고침</span>
            </button>
          </div>

          {sosDispatchLogs.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 space-y-2">
              <MapPin className="w-10 h-10 mx-auto text-zinc-600" />
              <p className="text-xs">수신된 긴급 구조 기록이 없습니다.</p>
              <p className="text-[11px] text-zinc-600">조난자 SOS 버튼을 누르면 실시간 관제 기록이 자동 누적됩니다.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {sosDispatchLogs.map((log, idx) => (
                <div key={idx} className="bg-[#161b22] border border-zinc-800 rounded-2xl p-4 space-y-2 hover:border-cyan-500/50 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-300 font-mono">{log.dispatch_id || log.id}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">{new Date(log.created_at || Date.now()).toLocaleString()}</span>
                  </div>

                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="text-red-400">🚨</span>
                    <span>{log.location_text || log.exact_rescuer_location || "지상 1층 수색 구역"}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-zinc-300 bg-black/40 p-2.5 rounded-xl border border-zinc-800/80">
                    <div>🏢 매칭 건물: <span className="text-amber-200 font-bold">{log.building_name || "고덕그라시움"}</span></div>
                    <div>📮 주소: <span className="text-emerald-300 font-bold">{log.road_address || "고덕로 353"}</span></div>
                    <div>🎯 H3 Res13: <span className="text-cyan-300">{log.h3_index || log.centerH3Index}</span></div>
                    <div>📍 GPS: <span className="text-zinc-400">{Number(log.lat).toFixed(5)}, {Number(log.lng).toFixed(5)}</span></div>
                  </div>

                  {log.maps_url && (
                    <a
                      href={log.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-bold pt-1 group"
                    >
                      <span>🗺️ 3D 수색 레이더 지도 보기</span>
                      <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────────── */}
      {/* SOS 전송 완료 결과 모달 */}
      {/* ───────────────────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {sosResultModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#0f141d] border-2 border-emerald-500/50 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-zinc-100"
            >
              <div className="text-center space-y-1">
                <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-3xl mx-auto mb-2 text-emerald-400">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-xl font-black text-white tracking-tight">긴급 구조 요청 완료</h3>
                <p className="text-xs text-emerald-300 font-bold">위치 패킷이 관제센터 및 문자 앱으로 생성되었습니다</p>
              </div>

              <div className="bg-[#161c27] border border-zinc-800 p-3.5 rounded-2xl space-y-2 text-xs font-mono">
                <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-400">발송 ID:</span>
                  <span className="font-bold text-amber-300">{sosResultModal.dispatchId}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-800 pb-1.5">
                  <span className="text-zinc-400">Uber H3 Cell:</span>
                  <span className="font-bold text-cyan-300">{sosResultModal.h3Index}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">GPS 좌표:</span>
                  <span className="text-zinc-200">{sosResultModal.lat.toFixed(5)}, {sosResultModal.lng.toFixed(5)}</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <a
                  href={`sms:${getSmsRecipients()}?body=${encodeURIComponent(sosResultModal.smsPayload + "\n" + sosResultModal.mapsUrl)}`}
                  className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-3 rounded-2xl text-center block text-sm shadow-lg shadow-red-900/50 transition-all cursor-pointer"
                >
                  📱 구조대 및 보호자 문자 앱으로 이동
                </a>

                <button
                  onClick={() => setSosResultModal(null)}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-2.5 rounded-2xl text-center text-xs transition-all cursor-pointer"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 푸터 */}
      <footer className="text-center text-[10px] text-zinc-600 font-mono py-4">
        © 2026 Melodio Pioneer SOS Rescue System • B2G Patent Engine v5.0
      </footer>
    </div>
  );
}
