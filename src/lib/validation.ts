import { z } from "zod";
export const kinds = [
  "Registration",
  "PPT",
  "Prototype",
  "Final submission",
  "Presentation",
  "Result",
] as const;
const id = z.uuid();
const date = z.iso.date();
const url = z.union([
  z.literal(""),
  z.url().refine((v) => /^https?:\/\//.test(v), "Use an HTTP or HTTPS URL"),
]);
export const operations = {
  create: z.object({
    name: z.string().trim().min(1).max(120),
    organizer: z.string().trim().min(1).max(120),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Invalid timezone"),
    members: z.array(id).max(100),
    deadlines: z
      .array(z.object({ kind: z.enum(kinds), due_date: date }))
      .max(6),
  }),
  member: z.object({ hackathon_id: id, user_id: id, active: z.boolean() }),
  deadline: z.object({ hackathon_id: id, id, due_date: date }),
  add_deadline: z.object({
    hackathon_id: id,
    kind: z.enum(kinds),
    due_date: date,
  }),
  submit: z.object({
    hackathon_id: id,
    id,
    url,
    notes: z.string().max(2000),
    notify: z.boolean(),
  }),
  task: z.object({
    hackathon_id: id,
    title: z.string().trim().min(1).max(200),
    assigned_to: id,
    due_date: date,
  }),
  task_done: z.object({ hackathon_id: id, id }),
  preferences: z.object({
    in_app: z.boolean(),
    email: z.boolean(),
    calendar: z.boolean(),
    admin_critical: z.boolean(),
  }),
  user: z.object({
    id,
    role: z.enum(["admin", "member", "viewer"]),
    active: z.boolean(),
    global_member: z.boolean(),
  }),
  read: z.object({ id }),
  calendar_retry: z.object({}),
};
export type Operation = keyof typeof operations;
