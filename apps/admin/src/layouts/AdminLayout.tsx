import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import {
  Building2,
  Ellipsis,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Receipt,
  ScrollText,
  Settings,
  Swords,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { useLogout, useMe } from "@courtflex/api";
import { cn, OfflineBanner, Sheet, Wordmark } from "@courtflex/ui";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

/** Sections are added here as they're built, so the menu never links to an empty page. */
export const nav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/venues", label: "Venues", icon: Building2 },
  { to: "/clubs", label: "Clubs", icon: Users },
  { to: "/users", label: "Users", icon: UserRound },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/revenue", label: "Revenue", icon: TrendingUp },
  { to: "/competition", label: "Competition", icon: Swords },
  { to: "/announcements", label: "Announcements", icon: Megaphone },
  { to: "/audit-log", label: "Audit log", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
];

/** Phones fit four tabs; anything more goes under "More". */
const PHONE_TABS = 4;

export function AdminLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r court-line bg-court-surface md:flex lg:w-64">
        <div className="flex h-16 items-center gap-2 px-5">
          <Link to="/" aria-label="CourtFlex admin home">
            <Wordmark />
          </Link>
        </div>
        <p className="mx-5 w-fit rounded-full border border-field/50 bg-field/10 px-2.5 py-0.5 text-xs font-semibold text-field">
          Super Admin
        </p>
        <nav aria-label="Admin" className="flex flex-col gap-0.5 px-3 pt-4">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex h-11 items-center gap-3 rounded-sm border-l-2 px-3 font-semibold transition-colors",
                  isActive
                    ? "border-field bg-court-raised text-line"
                    : "border-transparent text-line-dim hover:bg-court-raised/60 hover:text-line",
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t court-line p-4">
          <UserBlock />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b court-line bg-court-deep/95 px-4 backdrop-blur md:hidden">
          <Link to="/" aria-label="CourtFlex admin home">
            <Wordmark compact />
          </Link>
          <p className="rounded-full border border-field/50 bg-field/10 px-2.5 py-0.5 text-xs font-semibold text-field">
            Super Admin
          </p>
          <div className="ml-auto">
            <UserBlock compact />
          </div>
        </header>
        <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 md:pt-10 md:pb-10 lg:px-10">
          <div key={pathname} className="page-enter mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      {nav.length > 1 && <PhoneNav />}
    </div>
  );
}

function UserBlock({ compact }: { compact?: boolean }) {
  const me = useMe();
  const logout = useLogout();
  const signOut = () => logout.mutate(undefined, { onSettled: () => window.location.assign("/login") });
  if (compact) {
    return (
      <button
        type="button"
        onClick={signOut}
        className="grid size-10 place-items-center rounded-full text-line-dim hover:bg-court-surface hover:text-line"
        aria-label={`Sign out ${me.data?.name ?? ""}`}
      >
        <LogOut className="size-5" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{me.data?.name}</p>
        <p className="truncate text-xs text-line-dim">{me.data?.email}</p>
      </div>
      <button
        type="button"
        onClick={signOut}
        className="grid size-9 place-items-center rounded-full text-line-dim hover:bg-court-raised hover:text-line"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

function PhoneNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const overflow = nav.length > PHONE_TABS;
  const tabs = overflow ? nav.slice(0, PHONE_TABS - 1) : nav;
  const rest = overflow ? nav.slice(PHONE_TABS - 1) : [];
  const restActive = rest.some((i) => pathname.startsWith(i.to) && i.to !== "/");
  const tabClass = (active: boolean) =>
    cn(
      "flex h-16 flex-1 flex-col items-center justify-center gap-1 border-t-2 text-xs font-semibold",
      active ? "border-field text-line" : "border-transparent text-line-dim",
    );
  return (
    <>
      <nav
        aria-label="Admin"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t court-line bg-court-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={label} to={to} end={end} className={({ isActive }) => tabClass(isActive)}>
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
        {overflow && (
          <button type="button" className={tabClass(restActive)} onClick={() => setMoreOpen(true)}>
            <Ellipsis className="size-5" aria-hidden />
            More
          </button>
        )}
      </nav>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="-mx-2 flex flex-col">
          {rest.map(({ to, label, icon: Icon }) => (
            <li key={label}>
              <NavLink
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex h-14 items-center gap-3 rounded-sm px-2 font-semibold",
                    isActive ? "text-line" : "text-line-dim hover:text-line",
                  )
                }
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
