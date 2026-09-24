import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schedule from "../netlify/functions/reminder-schedule.mjs";
import worker from "../netlify/functions/reminder-worker-background.mjs";

beforeEach(() => {
  vi.stubEnv("CONTEXT", "production");
  vi.stubEnv("URL", "https://hackathon-os.example");
  vi.stubEnv("CRON_SECRET", "test-only-secret");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 202 })),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("dispatches scheduled reminders with authentication to the background worker", async () => {
  await schedule();
  expect(fetch).toHaveBeenCalledOnce();
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(String(url)).toBe(
    "https://hackathon-os.example/.netlify/functions/reminder-worker-background",
  );
  expect(options?.headers).toEqual({
    Authorization: "Bearer test-only-secret",
  });
});
it("does not run schedules on deploy previews", async () => {
  vi.stubEnv("CONTEXT", "deploy-preview");
  await schedule();
  expect(fetch).not.toHaveBeenCalled();
});
it("fails visibly when dispatch is rejected", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));
  await expect(schedule()).rejects.toThrow("dispatch failed");
});
it("rejects unauthorized worker invocations without running reminders", async () => {
  await worker(new Request("https://example.test"));
  expect(fetch).not.toHaveBeenCalled();
});
it("authorized background worker invokes the protected cron endpoint", async () => {
  await worker(
    new Request("https://example.test", {
      headers: { Authorization: "Bearer test-only-secret" },
    }),
  );
  const [url, options] = vi.mocked(fetch).mock.calls[0];
  expect(String(url)).toBe("https://hackathon-os.example/api/cron");
  expect(options?.redirect).toBe("error");
});
