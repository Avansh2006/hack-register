import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, any>[]>,
  claims: [] as Record<string, any>[],
  eligible: true,
  lock: true,
}));
vi.mock("../src/lib/db", () => ({
  requireResult: (r: any) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
  adminDb: () => ({
    rpc: async (name: string) => ({
      data:
        name === "acquire_worker"
          ? fixture.lock
          : name === "generate_reminders"
            ? 4
            : name === "notification_eligible"
              ? fixture.eligible
              : name === "claim_email"
                ? fixture.claims.splice(0, 1)
                : null,
      error: null,
    }),
    from: (table: string) => {
      let filters: [string, unknown][] = [];
      let op = "select";
      let payload: any;
      let singular = false;
      const q: any = {
        select: () => q,
        order: () => q,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return q;
        },
        single: () => {
          singular = true;
          return q;
        },
        maybeSingle: () => {
          singular = true;
          return q;
        },
        update: (v: any) => {
          op = "update";
          payload = v;
          return q;
        },
        delete: () => {
          op = "delete";
          return q;
        },
        upsert: (v: any) => {
          op = "upsert";
          payload = v;
          return q;
        },
        then: (resolve: any) => {
          const source = fixture.tables[table] ?? [];
          const selected = source.filter((row) =>
            filters.every(([k, v]) => row[k] === v),
          );
          if (op === "update")
            selected.forEach((row) => Object.assign(row, payload));
          if (op === "delete")
            fixture.tables[table] = source.filter(
              (row) => !selected.includes(row),
            );
          if (op === "upsert")
            for (const row of payload)
              if (
                !source.some(
                  (r) =>
                    r.deadline_id === row.deadline_id &&
                    r.user_id === row.user_id,
                )
              )
                source.push({
                  ...row,
                  generation: 1,
                  google_event_id: null,
                  synced_revision: null,
                  last_synced_at: null,
                });
          return Promise.resolve({
            data: singular ? (selected[0] ?? null) : selected,
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
  }),
}));
import { encrypt } from "../src/lib/crypto";
import { runAutomation, calendarEventId } from "../src/lib/delivery";
const requests: { url: string; method: string; body: any; key?: string }[] = [];
beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
  process.env.APP_URL = "https://app.example.test";
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  fixture.lock = true;
  fixture.eligible = true;
  fixture.claims = [];
  requests.length = 0;
  fixture.tables = {
    deadlines: [
      {
        id: "deadline",
        hackathon_id: "hack",
        kind: "PPT",
        due_date: "2030-09-28",
        revision: 1,
        completed_at: null,
        hackathons: { name: "ABC", timezone: "UTC", archived: false },
      },
    ],
    hackathon_members: [
      { hackathon_id: "hack", user_id: "user", active: true },
    ],
    users: [{ id: "user", active: true, email: "a@example.test" }],
    notification_preferences: [
      { user_id: "user", calendar: true, email: true },
    ],
    calendar_connections: [
      { user_id: "user", refresh_token_encrypted: encrypt("refresh-token") },
    ],
    calendar_events: [],
    notifications: [],
    worker_locks: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: any = {}) => {
      requests.push({
        url,
        method: options.method ?? "GET",
        body:
          typeof options.body === "string"
            ? JSON.parse(options.body)
            : options.body,
        key: options.headers?.["Idempotency-Key"],
      });
      if (url.includes("oauth2"))
        return Response.json({ access_token: "access-token" });
      if ((options.method ?? "GET") === "GET")
        return new Response(null, { status: 404 });
      return Response.json({ id: "provider-id" });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
it("creates Calendar events once and skips unchanged successfully synced events", async () => {
  await runAutomation();
  await runAutomation();
  const inserts = requests.filter(
    (r) => r.method === "POST" && r.url.includes("/events"),
  );
  expect(inserts).toHaveLength(1);
  expect(inserts[0].body.id).toBe(calendarEventId("deadline", "user", 1));
  expect(
    inserts[0].body.reminders.overrides.map((x: any) => x.minutes),
  ).toEqual([10080, 4320, 1440, 60, 0]);
  expect(fixture.tables.calendar_events[0].synced_revision).toBe(1);
});
it("updates a changed deadline in place without creating a duplicate", async () => {
  await runAutomation();
  fixture.tables.deadlines[0].revision = 2;
  fixture.tables.deadlines[0].due_date = "2030-09-30";
  const original = global.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: any, options: any) =>
      options?.method === "GET"
        ? Response.json({ status: "confirmed" })
        : original(url, options),
    ),
  );
  await runAutomation();
  const patch = requests.find((r) => r.method === "PATCH");
  expect(patch?.body.start.date).toBe("2030-09-30");
  expect(
    requests.filter((r) => r.method === "POST" && r.url.includes("/events")),
  ).toHaveLength(1);
});
it.each(["removal", "completion", "deactivation", "preference"])(
  "deletes managed Calendar event on %s",
  async (reason) => {
    await runAutomation();
    if (reason === "removal")
      fixture.tables.hackathon_members[0].active = false;
    if (reason === "completion")
      fixture.tables.deadlines[0].completed_at = new Date().toISOString();
    if (reason === "deactivation") fixture.tables.users[0].active = false;
    if (reason === "preference")
      fixture.tables.notification_preferences[0].calendar = false;
    await runAutomation();
    await runAutomation();
    expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(1);
    expect(fixture.tables.calendar_events[0].google_event_id).toBeNull();
  },
);
it("re-adding a removed member uses a new event generation", async () => {
  await runAutomation();
  fixture.tables.hackathon_members[0].active = false;
  await runAutomation();
  fixture.tables.hackathon_members[0].active = true;
  await runAutomation();
  const inserts = requests.filter(
    (r) => r.method === "POST" && r.url.includes("/events"),
  );
  expect(inserts).toHaveLength(2);
  expect(inserts[0].body.id).not.toBe(inserts[1].body.id);
});
it("records missing Calendar connection honestly without making provider calls", async () => {
  fixture.tables.calendar_connections = [];
  await runAutomation();
  expect(requests).toHaveLength(0);
  expect(fixture.tables.calendar_events[0].last_error).toContain(
    "Connect Google Calendar",
  );
});
it("uses stable email idempotency keys and retries uncertain failure with the same key", async () => {
  process.env.RESEND_API_KEY = "test";
  process.env.EMAIL_FROM = "team@example.test";
  fixture.tables.notification_preferences[0].calendar = false;
  const n = {
    id: "notification",
    user_id: "user",
    hackathon_id: "hack",
    claim_token: "claim",
    idempotency_key: "deadline:1:3:user",
    message: "PPT tomorrow",
    email_status: "sending",
  };
  fixture.tables.notifications = [n];
  fixture.claims = [{ ...n }];
  const original = global.fetch;
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: any, options: any) => {
      if (url.includes("resend") && fail) {
        fail = false;
        await original(url, options);
        throw new Error("Connection lost after request");
      }
      return original(url, options);
    }),
  );
  await runAutomation();
  expect(n.email_status).toBe("pending");
  fixture.claims = [{ ...n }];
  await runAutomation();
  expect(n.email_status).toBe("sent");
  expect(
    requests.filter((r) => r.url.includes("resend")).map((r) => r.key),
  ).toEqual([n.idempotency_key, n.idempotency_key]);
});
it("rechecks membership/completion before email dispatch and cancels ineligible claims", async () => {
  process.env.RESEND_API_KEY = "test";
  process.env.EMAIL_FROM = "team@example.test";
  fixture.tables.notification_preferences[0].calendar = false;
  fixture.eligible = false;
  const n = {
    id: "notification",
    user_id: "user",
    claim_token: "claim",
    email_status: "sending",
  };
  fixture.tables.notifications = [n];
  fixture.claims = [n];
  await runAutomation();
  expect(requests).toHaveLength(0);
  expect(n.email_status).toBe("cancelled");
});
it("a second live worker does not call external providers", async () => {
  fixture.lock = false;
  expect(await runAutomation()).toEqual({ busy: true });
  expect(requests).toHaveLength(0);
});
it("can remove an event after Google accepted an insert but its response was lost", async () => {
  const original = global.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: any, options: any) => {
      if (options?.method === "POST" && url.includes("/events"))
        throw new Error("Response lost");
      return original(url, options);
    }),
  );
  await runAutomation();
  expect(fixture.tables.calendar_events[0].google_event_id).toBe(
    calendarEventId("deadline", "user", 1),
  );
  expect(fixture.tables.calendar_events[0].synced_revision).toBeNull();
  fixture.tables.deadlines[0].completed_at = new Date().toISOString();
  await runAutomation();
  expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(1);
});
