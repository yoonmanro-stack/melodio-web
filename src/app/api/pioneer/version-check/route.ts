import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      version: "v9.2.0-REALTIME-GPS",
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
