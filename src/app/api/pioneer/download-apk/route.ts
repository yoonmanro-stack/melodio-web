import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const apkUrl = `${url.protocol}//${url.host}/Pioneer119Rescue.apk`;
    return NextResponse.redirect(apkUrl, 302);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "APK 다운로드 실패" }, { status: 500 });
  }
}
