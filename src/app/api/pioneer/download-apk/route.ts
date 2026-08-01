import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: Request) {
  try {
    const filePath = path.join(process.cwd(), "public", "Pioneer119Rescue.apk");
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": 'attachment; filename="Pioneer119Rescue.apk"',
          "Content-Length": fileBuffer.length.toString(),
          "Cache-Control": "no-cache, no-store, must-revalidate"
        }
      });
    }

    const url = new URL(req.url);
    return NextResponse.redirect(`${url.protocol}//${url.host}/Pioneer119Rescue.apk`, 302);
  } catch (err: any) {
    const url = new URL(req.url);
    return NextResponse.redirect(`${url.protocol}//${url.host}/Pioneer119Rescue.apk`, 302);
  }
}
