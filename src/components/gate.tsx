import { ArrowRight, Check, Users, CalendarDays, Bell } from "lucide-react";
import { signIn, signOut } from "@/app/actions";
import type { Snapshot } from "@/lib/data";
export function Gate({ data }: { data: Snapshot }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ONE WORKSPACE. YOUR WHOLE TEAM.</p>
          <h1>Great ideas need a clear runway.</h1>
          <p className="muted">
            Keep the building moving. We’ll keep everyone in the loop.
          </p>
        </div>
      </div>
      <section className="welcome-hero">
        <div>
          <span className="tag">THE TEAM’S COMMAND CENTER</span>
          <h2>
            Every deadline.
            <br />
            Everyone in sync.
          </h2>
          <p>
            From the first pitch to the final submission, one shared view of
            what matters next.
          </p>
          <div className="hero-checks">
            <span>
              <Check size={16} /> Team-wide reminders
            </span>
            <span>
              <Check size={16} /> One-click submissions
            </span>
            <span>
              <Check size={16} /> No duplicate alerts
            </span>
          </div>
        </div>
        <div className="orbit">
          <div className="orbit-card">
            <span className="icon-tile">
              <Users />
            </span>
            <strong>Your whole team</strong>
            <p>Active members + Global Members</p>
            <div className="avatar-stack">
              {["A", "R", "P", "A"].map((a, i) => (
                <span key={i} className={`avatar color-${i}`}>
                  {a}
                </span>
              ))}
              <span className="everyone">Everyone included</span>
            </div>
            <div className="orbit-divider" />
            <span className="schedule-line">
              <CalendarDays size={17} /> 7 days · 3 days · Tomorrow · 1 hr left · Today
            </span>
            <span className="schedule-line">
              <Bell size={17} /> In-app + Google Calendar
            </span>
          </div>
        </div>
      </section>
      <section className="setup-panel">
        <div>
          <p className="eyebrow">
            {data.mode === "setup"
              ? "CONNECT YOUR WORKSPACE"
              : data.mode === "pending"
                ? "ACCOUNT APPROVAL"
                : "WELCOME BACK"}
          </p>
          <h2>
            {data.mode === "setup"
              ? "Your workspace is ready to connect."
              : data.mode === "pending"
                ? "You’re signed in. Approval is next."
                : "A shared plan starts here."}
          </h2>
          <p className="muted">
            {data.mode === "setup"
              ? "Configure Supabase to enable secure sign-in, shared hackathons, and reliable reminder history. No live notifications are being sent."
              : data.mode === "pending"
                ? "An administrator needs to activate your account before you can access the team workspace."
                : "Sign in with your Google account to see your hackathons, tasks, and team deadlines."}
          </p>
          {data.mode === "signed-out" && (
            <form action={signIn}>
              <button className="button">
                Continue with Google <ArrowRight size={16} />
              </button>
            </form>
          )}
          {data.mode === "pending" && (
            <form action={signOut}>
              <button className="button secondary">Sign out</button>
            </form>
          )}
        </div>
        {data.mode === "setup" && (
          <ol className="setup-list">
            <li>
              <span>01</span>
              <div>
                <strong>Create your Supabase project</strong>
                <p>Apply the migration in supabase/migrations.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Add environment variables</strong>
                <p>Copy .env.example to .env.local and fill in your keys.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Enable Google sign-in</strong>
                <p>Follow README.md for OAuth and first-admin setup.</p>
              </div>
            </li>
          </ol>
        )}
      </section>
    </>
  );
}
