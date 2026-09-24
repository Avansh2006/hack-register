import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runAutomation } from "@/lib/delivery";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const supplied = request.headers.get("authorization") ?? "";
  if (
    !process.env.CRON_SECRET ||
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return new NextResponse("Unauthorized", { status: 401 });
  try {
    return NextResponse.json(await runAutomation());
  } catch {
    return NextResponse.json(
      {
        error:
          "Automation failed. Check database and integration configuration.",
      },
      { status: 500 },
    );
  }
}
