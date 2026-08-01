import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      version: "v7.7.0-CAM",
      timestamp: new Date().toISOString(),
      status: "LIVE"
    },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    }
  );
}
