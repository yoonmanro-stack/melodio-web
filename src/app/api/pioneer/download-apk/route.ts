import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "public", "Pioneer119Rescue.apk");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "APK file not found on server" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="Pioneer119Rescue.apk"',
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "public, max-age=3600"
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Download failed" }, { status: 500 });
  }
}
