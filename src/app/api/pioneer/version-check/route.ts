import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      version: "v8.0.0-NFC-PIONEER",
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
