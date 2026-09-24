"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb, sessionDb, requireResult } from "@/lib/db";
import { operations, kinds, Operation } from "@/lib/validation";
import { after } from "next/server";
import { runAutomation } from "@/lib/delivery";

export async function signIn() {
  const db = await sessionDb();
  const { data, error } = await db.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${process.env.APP_URL}/auth/callback` },
  });
  if (error) throw error;
  redirect(data.url);
}
export async function signOut() {
  const db = await sessionDb();
  await db.auth.signOut();
  redirect("/");
}
export async function mutateAction(
  _previous: { message: string; ok: boolean },
  form: FormData,
) {
  try {
    const db = await sessionDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error("Sign in to continue");
    const op = String(form.get("operation")) as Operation;
    if (!(op in operations)) throw new Error("Unknown action");
    const raw: Record<string, unknown> = Object.fromEntries(form.entries());
    for (const k of [
      "active",
      "global_member",
      "in_app",
      "email",
      "calendar",
      "admin_critical",
      "notify",
    ])
      raw[k] = form.get(k) === "on";
    if (op === "create") {
      raw.members = form.getAll("members");
      raw.deadlines = kinds
        .filter((k) => form.get(k))
        .map((k) => ({ kind: k, due_date: form.get(k) }));
    }
    const payload = operations[op].parse(raw);
    const service = adminDb();
    requireResult(
      await service.rpc("mutate", { actor: user.id, operation: op, payload }),
    );
    revalidatePath("/", "layout");
    if (op !== "read")
      after(async () => {
        try {
          await runAutomation();
        } catch {
          console.error(
            "Post-save automation failed; scheduled retry will follow.",
          );
        }
      });
    return {
      ok: true,
      message:
        op === "submit"
          ? "Submission completed. Future reminders stopped."
          : op === "deadline"
            ? "Deadline updated. Team alerts recorded; Calendar will sync shortly."
            : op === "create"
              ? "Hackathon created. Members and deadlines are ready. Calendar will sync shortly."
              : "Saved successfully.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save. Please try again.",
    };
  }
}
