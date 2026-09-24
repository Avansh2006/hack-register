import type { Metadata } from "next";
import "./globals.css";
import { snapshot } from "@/lib/data";
import { Shell } from "@/components/shell";
import { Refresh } from "@/components/refresh";
import { connection } from "next/server";
export const maxDuration = 60;
export const metadata: Metadata = {
  title: "Hackathon OS — Your team, in sync",
  description:
    "A shared workspace for hackathons, deadlines, and team-wide reminders.",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const data = await snapshot();
  return (
    <html lang="en">
      <body>
        {data.mode === "live" && <Refresh />}
        <Shell data={data}>{children}</Shell>
      </body>
    </html>
  );
}
