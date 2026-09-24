import Link from "next/link";
import {
  LayoutDashboard,
  Flag,
  Bell,
  Users,
  Settings,
  CalendarDays,
  CheckCheck,
  ArrowUpRight,
  Command,
  Zap,
} from "lucide-react";
import type { Snapshot } from "@/lib/data";
import { signOut } from "@/app/actions";
const navigation = [
  ["/", "Overview", LayoutDashboard],
  ["/hackathons", "Hackathons", Flag],
  ["/my-work", "My work", CheckCheck],
  ["/calendar", "Calendar", CalendarDays],
  ["/alerts", "Alerts", Bell],
] as const;
export function Shell({
  data,
  children,
}: {
  data: Snapshot;
  children: React.ReactNode;
}) {
  const unread = data.notifications.filter(
    (n) => n.in_app && !n.read_at,
  ).length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Command size={23} />
          </span>
          <span>
            hackathon<span className="brand-os">OS</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">H</span>
          <div>
            Team workspace<small>Build something that matters</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {navigation.map(([href, label, Icon]) => (
            <Link key={href} href={href}>
              <Icon size={18} />
              {label}
              {label === "Alerts" && unread > 0 && (
                <span className="nav-count">{unread}</span>
              )}
            </Link>
          ))}
        </nav>
        <p className="nav-label">MANAGE</p>
        <nav>
          {data.me?.role === "admin" && (
            <Link href="/members">
              <Users size={18} />
              Members
            </Link>
          )}
          <Link href="/settings">
            <Settings size={18} />
            Settings
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="team-note">
            <Zap size={18} />
            <strong>Less admin. More building.</strong>
            <p>
              Your deadlines, in sync.
              <br />
              Your whole team, in the loop.
            </p>
          </div>
          <div className="profile">
            <span className="avatar">
              {data.me?.name.slice(0, 2).toUpperCase() ?? "OS"}
            </span>
            <div>
              {data.me?.name ?? "Your workspace"}
              <small>{data.me?.role ?? "Ready when you are"}</small>
            </div>
            {data.me && (
              <form action={signOut}>
                <button
                  className="icon-button"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <ArrowUpRight size={18} />
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span>{" "}
            <strong>Hackathon OS</strong>
          </span>
          <span className="topbar-right">
            <span className="live-dot" />
            {data.mode === "live" ? "Team workspace" : "Workspace setup"}
            <Link href="/alerts" aria-label="Open notifications">
              <Bell size={18} />
            </Link>
          </span>
        </header>
        <main>{children}</main>
        <footer>
          Built for the team. Focused on what’s next.<span>Hackathon OS</span>
        </footer>
      </div>
    </div>
  );
}
