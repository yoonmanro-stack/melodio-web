import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfsfxzhunkrjyibsdswb.supabase.co";
function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("A Supabase API key is required");
  return createClient(supabaseUrl, key);
}

export async function GET() {
  const supabase = getSupabase();
  try {
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
      const spotFp = flagObj?.spot_fingerprint || {};

      return {
        placeCellId: cell.id,
        flagId: flagObj?.id || cell.id,
        name: spotFp.place_name || cell.name,
        place_name: spotFp.place_name || cell.name,
        place_desc: spotFp.place_desc || cell.description || "",
        category: spotFp.category || cell.category || "CAFE_FOOD",
        floor_type: spotFp.floor_type || "GROUND",
        floor_number: spotFp.floor_number || "지상 1층",
        lat: spotFp.lat || 37.5665,
        lng: spotFp.lng || 126.9780,
        status: cell.status || "active",
        createdAt: flagObj?.created_at || cell.created_at,
        photos: flagObj?.photo_urls || [],
        spotFingerprint: spotFp,
        h3Index: spotFp.h3Index || h3List[0] || "8d30e1ce04c003f",
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
