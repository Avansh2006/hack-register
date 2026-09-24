# Hackathon OS

A Next.js + Supabase implementation of the **team-wide reminder system**. This repository was empty at the start. The implemented slice covers authenticated membership, Global Members, deadlines, submissions, personal tasks, notification preferences/history, Google Calendar reconciliation and optional email. The larger product brief's expenses, Drive, project library, templates and analytics are not implemented in this slice.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Without environment variables the app shows an explicit setup screen. It does not pretend to send notifications or store shared data in the browser.

## Supabase setup

1. Create a Supabase project and apply `supabase/migrations/20260924073858_team_reminders.sql` in the SQL editor (once), or use the Supabase CLI migration workflow. `supabase/schema.sql` is the canonical, identical source used by the tests.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and your deployment environment. Set `APP_URL` to the exact app origin, with no trailing slash.
3. Enable Google in Supabase Auth. Configure the Google OAuth client's authorized redirect URI using the callback shown in Supabase. Set Supabase's site URL to `APP_URL` and allow `APP_URL/auth/callback`.
4. Sign in once. New users start inactive and have no team access. Bootstrap your first admin using trusted Supabase SQL editor access:

```sql
update public.users
set role = 'admin', active = true
where email = 'YOUR_EXACT_GOOGLE_EMAIL';
```

5. Reload the app. Other people sign in using Google, then an admin activates them in **Members**. Set Global Members there. Role and activation changes are never taken from user-editable auth metadata.

Only apply this schema to a new, dedicated project. It is not an automatic migration from an unknown existing application.

## Google Calendar

Enable the Google Calendar API in your Google project. Configure its OAuth consent screen and users; an external app left in Google testing mode may require reconnection as test refresh tokens expire. Add `APP_URL/api/calendar/callback` as an authorized redirect URI. Set:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY`: 32 random bytes encoded as base64; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Each member connects Google Calendar in **Settings**. Refresh tokens are encrypted with AES-256-GCM and stored in a table inaccessible to browser roles. Do not rotate the encryption key without re-encrypting the stored tokens or reconnecting every user.

The worker creates one all-day event per active member/deadline in each user's primary calendar. Popup reminders use 7/3/1 days and the deadline day. All-day notification timing follows the recipient calendar's timezone; in-app scheduling uses the hackathon's timezone. Calendar must be connected for that user. Google Calendar does not provide a native repeated overdue event reminder; overdue alerts are in-app and optionally email.

Date changes update the existing event. Completion, removal, deactivation, archiving or disabling Calendar removes managed events on the next successful worker run. Externally deleted events are detected during daily reconciliation or **Retry Calendar sync**. Failed synchronization is shown in Settings. If access is revoked, the user must reconnect before the app can remove remaining events. Provider operations are asynchronous: a request already dispatched during a simultaneous completion/removal cannot be recalled, and will be reconciled next run.

## Email and scheduling

Email defaults off. Configure `RESEND_API_KEY` and `EMAIL_FROM` using a verified sender domain to enable it. Configure a long random `CRON_SECRET`. The authenticated `/api/cron` endpoint runs independent of any browser session. Mutations and Calendar connection also request a sync after the response, with cron providing durable retries.

`vercel.json` requests a run every 15 minutes. Use a Vercel plan that supports that frequency, or another scheduler that makes authenticated requests. Do not substitute a daily schedule if you expect prompt membership/date synchronization. The route has a 60-second execution budget and bounded delivery work. For a small team, pending work drains over successive runs. No external queue service is required.

Manual run from PowerShell (after loading the secret into your shell environment):

```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/api/cron' -Headers @{Authorization="Bearer $env:CRON_SECRET"}
```

In-app history is inserted transactionally with unique `(recipient, entity, revision, stage)` keys. Email claims use leases and provider idempotency keys. Retries stop after 23 hours because Resend's idempotency retention is 24 hours. A `held` delivery requires manual inspection of provider history before any deliberate resend; the system never assumes that a timed-out request failed. Provider-independent exactly-once delivery across a network is not possible. Duplicate cron runs do not create duplicate notifications or events.

Current stages only: 7 days, 3 days, tomorrow, today, overdue once. Missed stages are not replayed. Adding a member mid-stage gives that member the applicable current reminder; removing a member cancels pending sends and excludes them from later stages. Tasks only notify their active assignee. Admin critical alerts are opt-in for tomorrow/today/overdue via in-app/email and do not implicitly add admins to teams.

History is retained, including cancelled/held deliveries. In-app resolved alerts remain labelled for reference. Dashboard/detail refresh after mutations, on window focus, and every minute while visible. Deadline edits create a new revision; completing a submission writes the submission, closes its deadline and adds an immutable activity record in one transaction.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Database tests execute the real schema in embedded PostgreSQL (PGlite) with Supabase-like auth roles, RLS, transactions and constraints. They verify the four-member example, duplicate runs, overdue behavior, membership churn, completion, date changes, personal tasks, Global Members, admin opt-in, timezone boundaries, email claims and privilege restrictions. PGlite serializes queries; testing distinct concurrent PostgreSQL connections remains a deployment check. Browser smoke tests exercise the unconfigured app at desktop/mobile sizes and cron authentication. Live OAuth, provider delivery and authenticated browser flows require configured Supabase/Google/Resend accounts and have not been verified by these tests.

For production, run Supabase security/performance advisors, verify Google consent, test two simultaneous cron requests, and perform the ABC Hackathon workflow with your real team accounts before enabling scheduled delivery. No deployment, provider account changes, or real team messages are performed by this repository setup.

## Architecture

See [the concise design](docs/design.md). Server actions validate with Zod, verify the Supabase user, then call service-only SQL mutations with the verified actor. Database functions enforce roles and membership again. Authenticated clients have SELECT access under RLS; they cannot write audit logs, role fields, delivery state or tokens. Service keys and refresh tokens never enter client components.

Integration references: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Google Calendar events](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
