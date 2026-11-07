import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router";
import {
  Award,
  CalendarCheck,
  House,
  LogOut,
  MapPinned,
  Medal,
  Swords,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { ApiError, useLogout, useMe } from "@courtflex/api";
import { cn, ErrorState, OfflineBanner, PageLoader, Wordmark } from "@courtflex/ui";
import { AnnouncementBanner } from "@courtflex/features";
import { SiteFooter, SiteHeader } from "../pages/landing/LandingPage";

/** Restores the cookie session; sends signed-out people to /login. */
export function RequireSession() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <PageLoader />;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.isUnauthenticated) {
      return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    }
    return (
      <div className="mx-auto max-w-lg p-6 pt-24">
        <ErrorState message={me.error.message} onRetry={() => me.refetch()} />
      </div>
    );
  }
  return <Outlet />;
}

/**
 * Pages anyone can open (court search, courts, venues). Signed-in players see
 * them inside the app; visitors get the public site header and footer.
 */
export function PublicOrPlayer() {
  const me = useMe();
  const { pathname } = useLocation();
  if (me.isPending) return <PageLoader />;
  if (me.data) {
    if (!me.data.email_verified) return <Navigate to="/verify" replace />;
    if (me.data.needs_onboarding) return <Navigate to="/onboarding" replace />;
    return <PlayerLayout />;
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <OfflineBanner />
      <SiteHeader />
      <AnnouncementBanner audience="players" />
      <main className="flex-1 px-4 pt-6 pb-16 sm:px-6">
        <div key={pathname} className="page-enter">
          <Outlet />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** New accounts verify their email and set up a profile before anything else. */
export function RequirePlayerReady() {
  const me = useMe();
  if (!me.data) return null;
  if (!me.data.email_verified) return <Navigate to="/verify" replace />;
  if (me.data.needs_onboarding) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

// Blueprint §10.2.4: Home, Courts, bookings, Open play, then clubs and you. Rankings join in Phase 5.
const nav = [
  { to: "/home", label: "Home", icon: House },
  { to: "/courts", label: "Courts", icon: MapPinned },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/sessions", label: "Open play", icon: Trophy },
  { to: "/matches", label: "Matches", icon: Swords },
  { to: "/rankings", label: "Rankings", icon: Medal },
  { to: "/tournaments", label: "Tournaments", icon: Award },
  { to: "/clubs", label: "Clubs", icon: Users },
  { to: "/me", label: "Me", icon: UserRound },
];
// Phones get five tabs; "Me" moves to the top bar.
// Phones fit five tabs: Matches, Rankings and Tournaments are linked from Me there.
const phoneNav = nav.filter((n) => !["/me", "/matches", "/rankings", "/tournaments"].includes(n.to));

/**
 * Mobile first: a bottom tab bar on phones, a sidebar from tablets up.
 * Rankings arrive in Phase 5.
 */
export function PlayerLayout() {
  const { pathname } = useLocation();
  const me = useMe();
  const logout = useLogout();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r court-line bg-court-surface md:flex lg:w-64">
        <div className="flex h-16 items-center px-5">
          <Link to="/home" aria-label="CourtFlex home">
            <Wordmark />
          </Link>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5 px-3 pt-4">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex h-11 items-center gap-3 rounded-sm border-l-2 px-3 font-semibold transition-colors",
                  isActive
                    ? "border-ball bg-court-raised text-line"
                    : "border-transparent text-line-dim hover:bg-court-raised/60 hover:text-line",
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t court-line p-4">
          <UserRound className="size-5 text-line-dim" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{me.data?.name}</span>
          <button
            type="button"
            onClick={() => logout.mutate(undefined, { onSettled: () => window.location.assign("/login") })}
            className="grid size-9 place-items-center rounded-sm text-line-dim hover:bg-court-raised hover:text-line"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b court-line bg-court-deep/95 px-4 backdrop-blur md:hidden">
          <Link to="/home" aria-label="CourtFlex home">
            <Wordmark />
          </Link>
          <NavLink
            to="/me"
            aria-label="Me"
            className={({ isActive }) =>
              cn(
                "grid size-10 place-items-center rounded-full border",
                isActive ? "border-ball text-line" : "border-line-faint text-line-dim hover:text-line",
              )
            }
          >
            <UserRound className="size-5" aria-hidden />
          </NavLink>
        </header>
        <AnnouncementBanner audience="players" />
        <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-12">
          {/* Keyed by page, so each new page settles in. */}
          <div key={pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t court-line bg-court-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {phoneNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex h-16 flex-1 flex-col items-center justify-center gap-1 border-t-2 text-xs font-semibold",
                isActive ? "border-ball text-line" : "border-transparent text-line-dim",
              )
            }
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
