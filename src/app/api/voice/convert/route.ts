import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jfsfxzhunkrjyibsdswb.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { generationId, voiceModelId = "qr_yoon", pitchShift = 0 } = body;

    if (!generationId) {
      return NextResponse.json({ error: "generationId is required" }, { status: 400 });
    }

    // 1. Generation 조회
    const { data: track, error: fetchErr } = await supabase
      .from("generations")
      .select("id, audio_url, stem_vocals_url, is_stem_extracted, metadata")
      .eq("id", generationId)
      .single();

    if (fetchErr || !track) {
      return NextResponse.json({ error: "음원을 찾을 수 없습니다." }, { status: 404 });
    }

    // 2. 스템 분리가 안 되어 있는 경우 먼저 분리 상태로 설정
    const updates: any = {
      voice_conversion_status: "pending",
      voice_model_id: voiceModelId,
      pitch_shift: pitchShift,
      metadata: {
        ...(track.metadata || {}),
        requested_voice_conversion_at: new Date().toISOString(),
        voiceModelId,
        pitchShift,
      }
    };

    if (!track.is_stem_extracted && !track.stem_vocals_url) {
      updates.status = "pending"; // 맥미니 워커가 스템 분리 후 보이스 변환까지 연속 처리
    }

    const { error: updateErr } = await supabase
      .from("generations")
      .update(updates)
      .eq("id", generationId);

    if (updateErr) {
      return NextResponse.json({ error: `상태 업데이트 실패: ${updateErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "1:1 실제 음성 변환(RVC) 작업이 맥미니 AI 워커에 큐잉되었습니다.",
      generationId,
      status: "pending",
      voiceModelId,
    });
  } catch (err: any) {
    console.error("Voice conversion error:", err);
    return NextResponse.json({ error: err.message || "서버 오류" }, { status: 500 });
  }
}
