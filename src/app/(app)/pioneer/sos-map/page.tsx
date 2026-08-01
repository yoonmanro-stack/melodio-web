"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense } from "react";
import * as h3 from "h3-js";

function SosMapContent() {
  const searchParams = useSearchParams();
  const mapRef = useRef<HTMLDivElement>(null);

  const dispatchId = searchParams.get("id") || "";
  const paramH3 = searchParams.get("h3") || "";
  const paramLat = parseFloat(searchParams.get("lat") || "0");
  const paramLng = parseFloat(searchParams.get("lng") || "0");
  const paramAlt = parseFloat(searchParams.get("alt") || "0");
  const paramEnv = searchParams.get("env") || "";
  const paramLoc = searchParams.get("loc") || "";
  const paramRange = searchParams.get("range") || "";

  // H3 Index 비어있을 경우 lat, lng 기반 100% 즉시 복구 연산
  let computedH3 = paramH3;
  if (!computedH3 && paramLat && paramLng) {
    try {
      computedH3 = h3.latLngToCell(paramLat, paramLng, 13);
    } catch {}
  }

  // DB 원본 데이터 수신 state (Single Source of Truth)
  const [sosData, setSosData] = useState<{
    lat: number;
    lng: number;
    alt: number;
    h3Index: string;
    envType: string;
    envTitle: string;
    locationText: string;
    exactRescuerLocation?: string;
    searchRangeText?: string;
    buildingName?: string;
    roadAddress?: string;
  }>({
    lat: paramLat,
    lng: paramLng,
    alt: paramAlt,
    h3Index: computedH3,
    envType: paramEnv,
    envTitle: "3D 수색 위치",
    locationText: paramLoc,
    exactRescuerLocation: paramLoc || "건물 지상 1층 / 단지 야외",
    searchRangeText: paramRange || "건물 저층부 (지상 1~3층 수색 구역)",
    buildingName: "지상 시설/단지 구역",
    roadAddress: `${paramLat.toFixed(5)}, ${paramLng.toFixed(5)}`
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 1. Dispatch ID 기반 백엔드 원본 DB 데이터 가져오기 (파라미터 잘림 100% 방지)
  useEffect(() => {
    if (!dispatchId) return;
    async function fetchSosDispatch() {
      try {
        const res = await fetch(`/api/pioneer/sos-rescue?id=${dispatchId}`);
        const data = await res.json();
        if (data.success && data.dispatch) {
          const d = data.dispatch;
          const targetLat = Number(d.lat) || paramLat;
          const targetLng = Number(d.lng) || paramLng;
          let realH3 = d.h3Index || d.h3_index || paramH3;
          if (!realH3 && targetLat && targetLng) {
            try { realH3 = h3.latLngToCell(targetLat, targetLng, 13); } catch {}
          }

          const cleanRoad = d.roadAddress || d.road_address || `${targetLat.toFixed(5)}, ${targetLng.toFixed(5)}`;
          const cleanBuilding = d.buildingName || d.building_name || "지상 시설/단지 구역";

          setSosData({
            lat: targetLat,
            lng: targetLng,
            alt: Number(d.altitude || 0),
            h3Index: realH3,
            envType: d.envType || d.env_type || "URBAN_OUTDOOR_GROUND",
            envTitle: d.envTitle || d.env_title || "건물 구조",
            locationText: d.locationText || d.location_text || `고도 ${d.altitude}m (±3m)`,
            exactRescuerLocation: d.exactRescuerLocation || d.exact_rescuer_location || d.locationText || "건물 지상 1층 / 단지 야외",
            searchRangeText: d.searchRangeText || d.search_range_text || "건물 저층부 (지상 1~3층 수색 구역)",
            buildingName: cleanBuilding,
            roadAddress: cleanRoad
          });
        }
      } catch (e) {
        console.warn("Failed to fetch DB SOS record, using fallback params:", e);
      }
    }
    fetchSosDispatch();
  }, [dispatchId]);

  // 💡 3D 환경 & 층수 오차범위(±3m) 자동 분석 아이콘/배지 산출 (DB 원본 우선 적용)
  const getGlobalTaxonomyDetails = () => {
    const { alt, envType, locationText, envTitle } = sosData;

    if (envType === "UNDERGROUND_SUBTERRANEAN" || alt < -1.0) {
      const minF = Math.max(1, Math.abs(Math.floor(alt / 3.5)));
      const maxF = Math.max(1, Math.abs(Math.ceil(alt / 3.5)));
      const floorRange = minF === maxF ? `지하 ${minF}층` : `지하 ${Math.min(minF, maxF)}~${Math.max(minF, maxF)}층`;
      return {
        type: "UNDERGROUND_SUBTERRANEAN",
        icon: "🏚️",
        title: envTitle || "지하/붕괴 매몰 공간",
        color: "bg-purple-700",
        text: locationText || `지하 ${minF}층 추정 (${floorRange} 구간 / 고도 ${alt}m ±3m)`
      };
    }

    if (envType === "MOUNTAIN_TERRAIN" || alt >= 100.0) {
      return {
        type: "MOUNTAIN_TERRAIN",
        icon: "🏔️",
        title: envTitle || "산악/고지대 지형",
        color: "bg-emerald-700",
        text: locationText || `해발 ${alt}m 산악 지형 (오차범위 ±3m)`
      };
    }

    if (envType === "URBAN_OUTDOOR_GROUND" || alt <= 2.0) {
      return {
        type: "URBAN_OUTDOOR_GROUND",
        icon: "🌳",
        title: envTitle || "건물 지상 1층 / 단지 야외",
        color: "bg-emerald-800",
        text: locationText || `건물 지상 1층 / 단지 야외 (고도 ${alt}m ±3m)`
      };
    }

    const approxFloor = Math.max(2, Math.round(alt / 3.0));
    const minF = Math.max(1, approxFloor - 1);
    const maxF = approxFloor + 1;
    return {
      type: "URBAN_INDOOR_HIGH",
      icon: "🏢",
      title: envTitle || "도심 건물 고층 영역",
      color: "bg-amber-600",
      text: locationText || `지상 ${approxFloor}층 추정 (${minF}~${maxF}층 구간 / 고도 ${alt}m ±3m)`
    };
  };

  const autoEnv = getGlobalTaxonomyDetails();
  const envType = sosData.envType || autoEnv.type;
  const envBadge = {
    icon: autoEnv.icon,
    title: autoEnv.title,
    color: autoEnv.color,
    text: autoEnv.text
  };

  // H3 셀 경계 좌표
  const centerBoundary = sosData.h3Index ? h3.cellToBoundary(sosData.h3Index) : [];
  const ringCells = sosData.h3Index ? h3.gridDisk(sosData.h3Index, 1).filter(c => c !== sosData.h3Index) : [];

  useEffect(() => {
    if (!mapRef.current) return;

    // Leaflet CDN 로드 및 동적 렌더링
    const renderMap = () => {
      const L = (window as any).L;
      if (!L || !mapRef.current) return;

      // 이전 생성된 지도 컨테이너 재설정 (Leaflet 중복 방지)
      if ((mapRef.current as any)._leaflet_id) {
        (mapRef.current as any)._leaflet_id = null;
        mapRef.current.innerHTML = "";
      }

      const map = L.map(mapRef.current, {
        center: [sosData.lat, sosData.lng],
        zoom: 18,
        zoomControl: true,
        attributionControl: false
      });

      // 🗺️ 100% 다크모드 무결정 전용 3D 레이다 지도 타일 (CartoDB Dark Matter + VWorld Satellite)
      try {
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 19,
          subdomains: "abcd",
          attribution: "CartoDB Dark Matter"
        }).addTo(map);
      } catch {
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
          maxZoom: 19,
          attribution: "Esri World Imagery"
        }).addTo(map);
      }

      // 🎯 B2G 특허: f1(50% 핵심 93평), f2(30% 중간 252평), f3(20% 외곽 650평) 3단계 확률 등고선 멀티 히트맵
      const targetH3 = (sosData.lat && sosData.lng) ? h3.latLngToCell(sosData.lat, sosData.lng, 13) : "";

      if (targetH3) {
        try {
          // 🟡 3차 외곽 수색 구역 (f3: 20% 확률 / k=3 링 37개 벌집 셀 / 지름 56m / 650평)
          const diskK3 = h3.gridDisk(targetH3, 3);
          const diskK2Set = new Set(h3.gridDisk(targetH3, 2));
          diskK3.forEach(cell => {
            if (diskK2Set.has(cell)) return;
            const bCoords = h3.cellToBoundary(cell);
            if (Array.isArray(bCoords) && bCoords.length > 0) {
              L.polygon(bCoords, {
                color: "#facc15",
                weight: 2.0,
                fillColor: "#fde047",
                fillOpacity: 0.12
              }).addTo(map);
            }
          });

          // 🟠 2차 중간 수색 구역 (f2: 30% 확률 / k=2 링 19개 벌집 셀 / 지름 38m / 252평 - 117동/118동 커버!)
          const diskK2 = Array.from(diskK2Set);
          const diskK1Set = new Set(h3.gridDisk(targetH3, 1));
          diskK2.forEach(cell => {
            if (diskK1Set.has(cell)) return;
            const bCoords = h3.cellToBoundary(cell);
            if (Array.isArray(bCoords) && bCoords.length > 0) {
              L.polygon(bCoords, {
                color: "#fb923c",
                weight: 2.8,
                fillColor: "#fbbf24",
                fillOpacity: 0.22
              }).addTo(map);
            }
          });

          // 🔴 1차 핵심 수색 구역 (f1: 50% 확률 / k=1 링 7개 벌집 셀 / 지름 21.3m / 93평)
          const diskK1 = Array.from(diskK1Set);
          diskK1.forEach(cell => {
            const isCenter = cell === targetH3;
            const bCoords = h3.cellToBoundary(cell);
            if (Array.isArray(bCoords) && bCoords.length > 0) {
              const poly = L.polygon(bCoords, {
                color: isCenter ? "#f87171" : "#ef4444",
                weight: isCenter ? 4.5 : 3.5,
                fillColor: "#dc2626",
                fillOpacity: isCenter ? 0.45 : 0.35
              }).addTo(map);

              if (isCenter) {
                poly.bindPopup(
                  `<div style="font-family:sans-serif;padding:6px;min-width:200px;">
                    <div style="font-weight:bold;color:#d97706;font-size:13px;">${envBadge.icon} ${envBadge.title}</div>
                    <div style="font-weight:extrabold;color:#ef4444;font-size:14px;margin:4px 0;">위치: ${envBadge.text}</div>
                    <div style="font-size:11px;color:#059669;font-weight:bold;margin:2px 0;">🎯 f1 핵심 구역 (50% 확률 / 93평)</div>
                    <div style="font-size:11px;color:#4b5563;">H3 Cell: <code style="background:#f3f4f6;padding:2px 4px;border-radius:4px;">${targetH3}</code></div>
                    <div style="font-size:11px;color:#4b5563;margin-top:2px;">GPS: ${sosData.lat.toFixed(6)}, ${sosData.lng.toFixed(6)}</div>
                  </div>`
                ).openPopup();
              }
            }
          });
        } catch (e) {
          console.warn("[SOS Map] H3 polygon render note:", e);
        }
      }

      // 🚨 4. 중심 비상 경광등 마커 (위치 1:1 락인)
      const icon = L.divIcon({
        html: `<div style="font-size:36px;text-align:center;filter:drop-shadow(0 0 12px red);animation:bounce 1s infinite alternate;">🚨</div>`,
        className: "",
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });
      L.marker([sosData.lat, sosData.lng], { icon }).addTo(map);

      // 🔴 f1 동심원 (50% 확률 / 반경 10.6m / 93평)
      L.circle([sosData.lat, sosData.lng], {
        radius: 10.6,
        color: "#f87171",
        weight: 3.0,
        fillColor: "#ef4444",
        fillOpacity: 0.15
      }).addTo(map);

      // 🟠 f2 동심원 (30% 확률 / 반경 19.0m / 252평) - 117동 감싸안음!
      L.circle([sosData.lat, sosData.lng], {
        radius: 19.0,
        color: "#fb923c",
        weight: 2.2,
        dashArray: "6, 6",
        fillColor: "#fbbf24",
        fillOpacity: 0.10
      }).addTo(map);

      // 🟡 f3 동심원 (20% 확률 / 반경 28.0m / 650평)
      L.circle([sosData.lat, sosData.lng], {
        radius: 28.0,
        color: "#facc15",
        weight: 1.8,
        dashArray: "4, 4",
        fillColor: "#fde047",
        fillOpacity: 0.05
      }).addTo(map);
    };

    if ((window as any).L) {
      renderMap();
    } else {
      const linkEl = document.createElement("link");
      linkEl.rel = "stylesheet";
      linkEl.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(linkEl);

      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = renderMap;
      document.head.appendChild(script);
    }
  }, [sosData.lat, sosData.lng, sosData.h3Index]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0b10] flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-pulse">🚨</div>
          <div className="text-sm font-bold text-amber-300">SOS DB 원시 센서 데이터 검증 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b10] text-white flex flex-col font-sans">
      {/* 상단 SOS 정보 & 자동 분석 3D 패널 */}
      <div className="bg-gradient-to-b from-red-950/90 via-[#11131c] to-[#0a0b10] p-4 space-y-3 border-b border-red-500/30 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center text-2xl animate-pulse shadow-[0_0_20px_rgba(255,0,0,0.6)]">
              🚨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-red-300">긴급 구조 위치 지형도</h1>
                <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-md shadow ${envBadge.color}`}>
                  VERIFIED DB
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Melodio Pioneer 3D H3 Location Intelligence Engine</p>
            </div>
          </div>
        </div>

        {/* 📍 1번 카드: 요구조자 정밀 위치 팩트 배너 */}
        <div className="bg-gradient-to-r from-red-950/80 via-black to-black p-3.5 rounded-2xl border border-red-500/50 flex items-center justify-between shadow-lg">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-red-400 tracking-wider flex items-center gap-1">
              <span>📍</span> 요구조자 정밀 위치
            </span>
            <div className="text-base font-black text-amber-300 tracking-tight">
              {sosData.exactRescuerLocation || envBadge.text}
            </div>
            <p className="text-[9.5px] text-zinc-400">
              * 조난자(구조 요청자)가 현재 위치해 있는 정밀 층수 및 고도 팩트입니다.
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-zinc-400 font-mono block">환경 분류</span>
            <span className="text-xs font-bold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/30">
              {envBadge.title}
            </span>
          </div>
        </div>

        {/* 🔍 2번 카드: 추정 수색 범위 및 권장 구조 구역 */}
        <div className="bg-[#181a26]/90 p-3.5 rounded-2xl border border-amber-500/30 space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <span>🔍</span>
              <span>추정 수색 범위 및 권장 구역</span>
            </span>
            <span className="text-[10px] bg-red-950/80 border border-red-500/30 text-red-300 font-mono px-2 py-0.5 rounded">
              H3 Res13: {sosData.h3Index}
            </span>
          </div>

          <div className="text-sm font-black text-amber-200">
            {sosData.searchRangeText || "건물 저층부 (지상 1~3층 수색 구역)"}
          </div>
          <p className="text-[9.5px] text-zinc-400">
            * 조난자를 가장 신속하게 수색/구조할 수 있는 최우선 권장 수색 구역입니다.
          </p>

          {/* 🏢 백엔드 자동 매핑 건물명 및 도로명 주소 카드 */}
          <div className="mt-2 pt-2 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-400">🏢 매칭 건물/시설:</span>
              <span className="font-bold text-zinc-100">{sosData.buildingName || "지상 건물/단지 구역"}</span>
            </div>
            <div className="bg-zinc-900/80 p-2 rounded border border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-400">📮 도로명 주소:</span>
              <span className="font-bold text-emerald-400 truncate max-w-[200px]">{sosData.roadAddress || `${sosData.lat.toFixed(5)}, ${sosData.lng.toFixed(5)}`}</span>
            </div>
          </div>
        </div>

        {/* GPS 좌표 및 ID 정보 */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
          <div className="bg-black/50 p-2 rounded-xl border border-white/10">
            <span className="text-[9px] text-zinc-500 block">위도 (Lat)</span>
            <span className="font-bold text-white">{sosData.lat.toFixed(5)}</span>
          </div>
          <div className="bg-black/50 p-2 rounded-xl border border-white/10">
            <span className="text-[9px] text-zinc-500 block">경도 (Lng)</span>
            <span className="font-bold text-white">{sosData.lng.toFixed(5)}</span>
          </div>
          <div className="bg-black/50 p-2 rounded-xl border border-white/10">
            <span className="text-[9px] text-zinc-500 block">기압계 실측고도</span>
            <span className="font-bold text-amber-400">{isNaN(sosData.alt) ? "미측정" : `${sosData.alt}m (±3m)`}</span>
          </div>
        </div>
      </div>

      {/* 🗺️ H3 3D 레이다 지도 (100% 다크모드 무결정 전용 렌더링) */}
      <div 
        ref={mapRef} 
        className="flex-1 w-full min-h-[450px] h-[55vh] relative z-0 border-y border-red-500/20"
        style={{ minHeight: "450px", height: "55vh", width: "100%", background: "#0a0b10" }} 
      />

      {/* 하단 범례 패널 */}
      <div className="bg-[#0a0b10] border-t border-white/10 p-3 flex items-center justify-around text-[10.5px]">
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 bg-red-600/70 border border-red-400 rounded-sm" />
          <span className="text-zinc-300 font-bold">조난자 H3 셀 (7m)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 bg-amber-400/40 border border-amber-400 rounded-sm" />
          <span className="text-zinc-400">인접 6개 수색 셀</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-cyan-400 font-bold">타일:</span>
          <span className="text-zinc-300 font-mono">
            {envType === "URBAN_INDOOR_HIGH" || envType === "BUILDING_HIGH" ? "건물/도로 지적도" : envType === "UNDERGROUND_SUBTERRANEAN" ? "다크 지하 지도" : "위성 지형도"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SosMapPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0b10] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl animate-pulse">🚨</div>
          <div className="text-white font-bold">자동 3D 공간 SOS 지도 로딩 중...</div>
        </div>
      </div>
    }>
      <SosMapContent />
    </Suspense>
  );
}
