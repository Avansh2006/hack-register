import { describe, it, expect } from "vitest";
import { operations } from "../src/lib/validation";
import { encrypt, decrypt } from "../src/lib/crypto";
describe("input validation and token storage", () => {
  it("rejects invalid dates, timezone, roles and unsafe submission links", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(
      operations.deadline.safeParse({
        hackathon_id: id,
        id,
        due_date: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      operations.create.safeParse({
        name: "ABC",
        organizer: "A",
        timezone: "Bad/Zone",
        members: [],
        deadlines: [],
      }).success,
    ).toBe(false);
    expect(
      operations.submit.safeParse({
        hackathon_id: id,
        id,
        url: "javascript:alert(1)",
        notes: "",
        notify: true,
      }).success,
    ).toBe(false);
    expect(
      operations.user.safeParse({
        id,
        role: "superadmin",
        active: true,
        global_member: false,
      }).success,
    ).toBe(false);
  });
  it("encrypts refresh tokens with authenticated encryption and detects tampering", () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const encrypted = encrypt("example-refresh-token");
    expect(encrypted).not.toContain("example-refresh-token");
    expect(decrypt(encrypted)).toBe("example-refresh-token");
    const parts = encrypted.split(".");
    parts[2] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
});
