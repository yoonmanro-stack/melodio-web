import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      status: "coming_soon",
      error: "실제 목소리 변환 기능은 준비 중입니다.",
    },
    { status: 503 },
  );
}
