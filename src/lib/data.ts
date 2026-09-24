import { cache } from "react";
import { configured, sessionDb, requireResult } from "./db";
export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member" | "viewer";
  active: boolean;
  global_member: boolean;
};
export type Hackathon = {
  id: string;
  name: string;
  organizer: string;
  timezone: string;
  created_by: string;
  archived: boolean;
};
export type Member = {
  hackathon_id: string;
  user_id: string;
  active: boolean;
  global_inclusion: boolean;
};
export type Deadline = {
  id: string;
  hackathon_id: string;
  kind: string;
  due_date: string;
  revision: number;
  completed_at: string | null;
};
export type Task = {
  id: string;
  hackathon_id: string;
  title: string;
  assigned_to: string;
  due_date: string;
  completed_at: string | null;
};
export type Notification = {
  id: string;
  hackathon_id: string;
  deadline_id: string | null;
  task_id: string | null;
  revision: number;
  stage: string;
  message: string;
  in_app: boolean;
  email_status: string;
  created_at: string;
  read_at: string | null;
};
export type Activity = {
  id: string;
  hackathon_id: string;
  actor_id: string;
  action: string;
  created_at: string;
  details: Record<string, string>;
};
export type CalendarEvent = {
  deadline_id: string;
  user_id: string;
  google_event_id: string | null;
  last_error: string | null;
  last_synced_at: string | null;
  synced_revision: number | null;
};
export type Preferences = {
  in_app: boolean;
  email: boolean;
  calendar: boolean;
  admin_critical: boolean;
};
export type Snapshot = {
  mode: "setup" | "signed-out" | "pending" | "live";
  me: User | null;
  users: User[];
  hackathons: Hackathon[];
  members: Member[];
  deadlines: Deadline[];
  tasks: Task[];
  notifications: Notification[];
  activities: Activity[];
  calendar: CalendarEvent[];
  preferences: Preferences;
};
export const snapshot = cache(async (): Promise<Snapshot> => {
  const base: Snapshot = {
    mode: "setup",
    me: null,
    users: [],
    hackathons: [],
    members: [],
    deadlines: [],
    tasks: [],
    notifications: [],
    activities: [],
    calendar: [],
    preferences: {
      in_app: true,
      email: false,
      calendar: true,
      admin_critical: false,
    },
  };
  if (!configured()) return base;
  const db = await sessionDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ...base, mode: "signed-out" };
  const me = requireResult(
    await db.from("users").select("*").eq("id", user.id).single(),
  ) as User;
  if (!me?.active) return { ...base, me, mode: "pending" };
  const results = await Promise.all([
    db.from("users").select("*").order("name"),
    db.from("hackathons").select("*").order("created_at", { ascending: false }),
    db.from("hackathon_members").select("*"),
    db.from("deadlines").select("*").order("due_date"),
    db.from("tasks").select("*").order("due_date"),
    db
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("calendar_events").select("*"),
    db
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single(),
  ]);
  const [
    users,
    hackathons,
    members,
    deadlines,
    tasks,
    notifications,
    activities,
    calendar,
    preferences,
  ] = results.map(requireResult);
  return {
    mode: "live",
    me,
    users,
    hackathons,
    members,
    deadlines,
    tasks,
    notifications,
    activities,
    calendar,
    preferences,
  } as Snapshot;
});
export function daysLeft(
  date: string,
  timezone = "Asia/Kolkata",
  now = new Date(),
) {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Math.round((Date.parse(date) - Date.parse(local)) / 86400000);
}
export function urgency(date: string, timezone?: string) {
  const days = daysLeft(date, timezone);
  return days < 0
    ? `${Math.abs(days)}d overdue`
    : days === 0
      ? "Due today"
      : days === 1
        ? "Tomorrow"
        : `In ${days} days`;
}
export function formatDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
