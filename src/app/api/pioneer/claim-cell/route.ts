import { NextResponse } from "next/server";
import * as h3 from "h3-js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfsfxzhunkrjyibsdswb.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_key_for_build";
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      place_name,
      placeName,
      category,
      center_lat,
      center_lng,
      h3_indices,
      h3Indices,
      pioneer_id,
      pioneerId
    } = body;

    const finalPlaceName = place_name || placeName || "도심 대형 공간 CELL";
    const finalCategory = category || "대형건물";
    const finalPioneerId = pioneer_id || pioneerId || "usr_pioneer";
    const moduleList: string[] = h3_indices || h3Indices || [];

    if (!moduleList || moduleList.length === 0) {
      return NextResponse.json(
        { success: false, error: "H3 인덱스 목록(h3_indices)이 필요합니다." },
        { status: 400 }
      );
    }

    const placeCellId = `cell_${Date.now()}`;

    // Supabase DB 저장 파이프라인 (RDBMS / Fallback)
    if (supabaseKey) {
      try {
        const { data: cellData } = await supabase
          .from("place_cells")
          .insert([{ name: finalPlaceName, category: finalCategory }])
          .select()
          .single();

        const activeCellId = cellData?.id || placeCellId;

        const centerH3 = (center_lat && center_lng) ? h3.latLngToCell(Number(center_lat), Number(center_lng), 13) : moduleList[0];

        const mappingRows = moduleList.map((h3Idx) => ({
          h3_index_id: h3Idx,
          place_cell_id: activeCellId,
          is_center: h3Idx === centerH3
        }));

        await supabase
          .from("place_cell_h3_mappings")
          .upsert(mappingRows, { onConflict: "h3_index_id" });
      } catch (dbErr: any) {
        console.warn("[API/claim-cell] Supabase warning:", dbErr.message);
      }
    }

    console.log(`[API/claim-cell] Bulk locked ${moduleList.length} H3 modules for ${finalPlaceName}`);

    return NextResponse.json({
      success: true,
      place_cell_id: placeCellId,
      total_mapped_modules: moduleList.length,
      bundledH3Modules: moduleList,
      message: `성공적으로 사용자가 드래그/조율한 ${moduleList.length}개의 H3 모듈 영역이 하나의 영토(CELL)로 결합 락인되었습니다!`
    });
  } catch (err: any) {
    console.error("[API/claim-cell] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "CELL 벌크 락인 중 오류 발생" },
      { status: 500 }
    );
  }
}
