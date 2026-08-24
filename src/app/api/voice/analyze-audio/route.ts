import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      status: "coming_soon",
      error: "목소리 녹음·업로드 분석 기능은 준비 중입니다.",
    },
    { status: 503 },
  );
}
