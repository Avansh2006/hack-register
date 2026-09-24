# Hackathon OS — team reminder slice

This empty workspace is being bootstrapped around the requested reminder workflow. The wider supplied product brief is a roadmap; expenses, projects, Drive and templates are separate future slices.

## Flow

Google sign-in → approved user → create hackathon with existing members and deadlines → creator and active global members included transactionally → scheduled job selects all current active members → in-app history + optional email; Calendar reconciles one event per member/deadline. Dashboard and detail read the same deadlines. Submission completion atomically closes the deadline and records the actor.

## Data and permissions

Supabase Auth identifies users. Users are inactive until an administrator approves them; first administrator is bootstrapped through the Supabase SQL editor. Global status applies to new hackathons; memberships snapshot whether inclusion was global. Only admin or owner manages membership/deadlines, active non-viewer members can submit or manage their own tasks. Viewers only read. Admin critical alerts are opt-in and do not grant membership. Preferences are editable only by their owner. RLS protects every public table. Sensitive writes go through service-only SQL functions called after server-side Auth verification; no browser receives service keys. Audit records are immutable to clients.

## Reminder rules

Date-only deadlines use each hackathon's IANA timezone. Default stages: 7, 3, 1, 0, overdue (once). Only the current stage is emitted, never a backlog of missed stages. Unique history key: recipient + entity + deadline revision + stage. Date changes increment revision, notify current active members and invalidate stale unsent deliveries. Tasks address only the assignee. Completion notification is optional. In-app and Calendar default on; email defaults off. New members receive the current applicable stage; removed/inactive members cannot receive subsequent stages. History remains for accountability.

## Integrations and concurrency

Vercel Cron calls an authenticated endpoint. Database advisory locking serializes stage generation against mutation functions. Database uniqueness prevents duplicate history; delivery claims use row locks. Email uses a deterministic provider idempotency key with a bounded retry period below Resend's 24-hour retention. An uncertain send after that period is held for manual inspection, never automatically resent. External delivery cannot be atomically committed with Postgres; already-dispatched network requests cannot be recalled. Eligibility is checked immediately before dispatch.

Calendar requires each user's explicit OAuth connection and writes a private event to their primary calendar. Deterministic event IDs avoid duplicate inserts, PATCH applies edits, DELETE removes completed/removed-member events. Reconciliation uses a leased job lock, network timeouts and bounded batches; failed operations retry on later runs. Re-adding after deletion uses a new generation ID. Calendar event reminders are configured at 7/3/1 days and deadline day; in-app handles overdue. No invitation emails are sent. Disconnected Calendar is shown as requiring connection, never reported as delivered.

## Validation

Run actual SQL in embedded PostgreSQL (PGlite) with simulated Supabase roles/auth; exercise recipient selection, revisions, member churn, task isolation, completion, global members, RLS and duplicate generation. Typecheck and production build. Live OAuth/email/calendar require deployment secrets and provider configuration; these are not simulated successes.
