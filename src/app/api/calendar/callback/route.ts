import { cookies } from "next/headers";
import { NextRequest, NextResponse, after } from "next/server";
import { runAutomation } from "@/lib/delivery";
export const maxDuration = 60;
import { adminDb, sessionDb, requireResult } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
export async function GET(request: NextRequest) {
  const jar = await cookies();
  const saved = jar.get("calendar_state")?.value;
  jar.delete("calendar_state");
  const db = await sessionDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!user || !state || saved !== `${state}:${user.id}` || !code)
    return new NextResponse(
      "Calendar authorization failed. Reconnect from Settings.",
      { status: 400 },
    );
  const { data: profile } = await db
    .from("users")
    .select("active")
    .eq("id", user.id)
    .single();
  if (!profile?.active)
    return new NextResponse("Active account required", { status: 403 });
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.APP_URL}/api/calendar/callback`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(8000),
    });
    const token = await response.json();
    if (!response.ok || !token.refresh_token)
      throw new Error("Google did not grant offline Calendar access.");
    requireResult(
      await adminDb()
        .from("calendar_connections")
        .upsert({
          user_id: user.id,
          refresh_token_encrypted: encrypt(token.refresh_token),
        }),
    );
    after(async () => {
      try {
        await runAutomation();
      } catch {
        console.error("Calendar sync deferred to scheduled retry.");
      }
    });
    return NextResponse.redirect(
      new URL("/settings?connected=1", process.env.APP_URL),
    );
  } catch {
    return new NextResponse(
      "Calendar connection could not be saved. Please reconnect from Settings.",
      { status: 502 },
    );
  }
}
