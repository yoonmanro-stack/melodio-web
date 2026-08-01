import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfsfxzhunkrjyibsdswb.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_key_for_build";
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    if (!supabaseKey) {
      return NextResponse.json({ success: true, flags: [] });
    }

    // Read file-persisted flags backup
    let localFlags: any[] = [];
    try {
      const fs = require("fs");
      const path = require("path");
      const flagsFilePath = path.join("/tmp", "pioneer_claimed_flags.json");
      if (fs.existsSync(flagsFilePath)) {
        const raw = fs.readFileSync(flagsFilePath, "utf8");
        localFlags = JSON.parse(raw);
      }
    } catch {}

    // 1. Fetch place_cells from Supabase
    const { data: cells, error: cellErr } = await supabase
      .from("place_cells")
      .select("*")
      .order("created_at", { ascending: false });

    if (cellErr || !cells || cells.length === 0) {
      console.warn("[API/list-flags] place_cells query fallback to local flags file. count:", localFlags.length);
      return NextResponse.json({ success: true, flags: localFlags, count: localFlags.length });
    }

    const cellIds = cells.map((c) => c.id);

    // 2. Fetch flags for these cell IDs
    const { data: flagsData } = await supabase
      .from("flags")
      .select("*")
      .in("place_cell_id", cellIds);

    // 3. Fetch h3_modules for these cell IDs
    const { data: modulesData } = await supabase
      .from("h3_modules")
      .select("*")
      .in("place_cell_id", cellIds);

    const flagsMap: Record<string, any> = {};
    if (Array.isArray(flagsData)) {
      flagsData.forEach((f) => {
        if (!flagsMap[f.place_cell_id]) {
          flagsMap[f.place_cell_id] = f;
        }
      });
    }

    const modulesMap: Record<string, string[]> = {};
    if (Array.isArray(modulesData)) {
      modulesData.forEach((m) => {
        if (!modulesMap[m.place_cell_id]) {
          modulesMap[m.place_cell_id] = [];
        }
        modulesMap[m.place_cell_id].push(m.h3_index);
      });
    }

    const formattedFlags = cells.map((cell: any) => {
      const flagObj = flagsMap[cell.id] || null;
      const h3List = modulesMap[cell.id] || [];
      const fp = flagObj?.spot_fingerprint || {};

      return {
        placeCellId: cell.id,
        id: cell.id,
        name: cell.name,
        place_name: fp.place_name || cell.name,
        place_desc: fp.place_desc || "공간 개척 완료!",
        category: fp.category || cell.category || "CAFE_FOOD",
        floor_type: fp.floor_type || "GROUND",
        floor_number: fp.floor_number || "지상 층",
        buildingName: fp.buildingName || cell.name,
        roadAddress: fp.roadAddress || "서울특별시 강동구 고덕동 333 (고덕동)",
        lat: fp.lat || 37.55771,
        lng: fp.lng || 127.16192,
        h3Index: h3List[0] || fp.h3Index || "8e30e1ce04c0087",
        status: cell.status,
        createdAt: flagObj?.created_at || cell.created_at,
        photos: flagObj?.photo_urls || [],
        spotFingerprint: fp,
        h3Modules: h3List,
        modulesCount: h3List.length
      };
    });

    const combinedFlags = [...formattedFlags];
    const existingIds = new Set(combinedFlags.map((f) => f.placeCellId));
    localFlags.forEach((lf) => {
      if (!existingIds.has(lf.placeCellId)) {
        combinedFlags.push(lf);
      }
    });

    console.log(`[API/list-flags] Combined total ${combinedFlags.length} claimed flags.`);

    return NextResponse.json({
      success: true,
      count: combinedFlags.length,
      flags: combinedFlags
    });
  } catch (err: any) {
    console.error("[API/list-flags] Exception:", err);
    return NextResponse.json(
      { success: false, error: err.message || "깃발 목록 조회 중 오류 발생" },
      { status: 500 }
    );
  }
}
