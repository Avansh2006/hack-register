import { NextRequest, NextResponse } from "next/server";
import { sessionDb } from "@/lib/db";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const db = await sessionDb();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", process.env.APP_URL));
  }
  return NextResponse.redirect(
    new URL(
      "/?error=Sign-in%20failed.%20Please%20try%20again.",
      process.env.APP_URL,
    ),
  );
}
