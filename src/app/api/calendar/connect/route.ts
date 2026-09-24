import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionDb } from "@/lib/db";
export async function GET() {
  const db = await sessionDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return new NextResponse("Sign in first", { status: 401 });
  const { data: profile } = await db
    .from("users")
    .select("active")
    .eq("id", user.id)
    .single();
  if (!profile?.active)
    return new NextResponse("Active account required", { status: 403 });
  if (
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET ||
    !process.env.TOKEN_ENCRYPTION_KEY
  )
    return new NextResponse(
      "Calendar integration is not configured. Ask your administrator.",
      { status: 503 },
    );
  const state = randomBytes(32).toString("hex");
  (await cookies()).set("calendar_state", `${state}:${user.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/calendar",
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.APP_URL}/api/calendar/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events.owned",
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return NextResponse.redirect(url);
}
