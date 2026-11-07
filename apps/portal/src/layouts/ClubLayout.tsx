import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import {
  ArrowLeftRight,
  Award,
  CalendarDays,
  Check,
  ChevronDown,
  Ellipsis,
  LayoutGrid,
  LogOut,
  Receipt,
  Settings,
  Sun,
  Swords,
  Users,
  Trophy,
  Wallet,
} from "lucide-react";
import type { ClubMembershipSummary, Permission } from "@courtflex/api";
import {
  allPermissions,
  formatDateShort,
  useAdminVenue,
  useClub,
  useLogout,
  useMe,
  useSubscription,
  usePlatformSettings,
} from "@courtflex/api";
import { cn, ErrorState, OfflineBanner, Sheet, Skeleton, Wordmark } from "@courtflex/ui";
import { AnnouncementBanner } from "@courtflex/features";
import { ClubContext, roleLabels, useClubContext, type ClubContextValue } from "../app/club-context";
import { FullPageLoading } from "../app/guards";
import { NotFoundPage } from "../modules/clubs/NotFoundPage";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Sun;
  /** Shown when the person has any of these. */
  anyOf: Permission[];
  end?: boolean;
}

const nav: NavItem[] = [
  { to: "", label: "Today", icon: Sun, anyOf: ["viewBookings"], end: true },
  { to: "bookings", label: "Bookings", icon: CalendarDays, anyOf: ["viewBookings"] },
  {
    to: "open-play",
    label: "Open play",
    icon: Trophy,
    anyOf: ["manageOpenPlay", "checkInOpenPlay", "approvePlayerOpenPlay"],
  },
  { to: "matches", label: "Matches", icon: Swords, anyOf: ["viewBookings"] },
  { to: "tournaments", label: "Tournaments", icon: Award, anyOf: ["viewBookings"] },
  { to: "payments", label: "Payments", icon: Wallet, anyOf: ["viewClubReports"] },
  { to: "courts", label: "Courts", icon: LayoutGrid, anyOf: ["manageCourts", "manageCourtSchedules"] },
  { to: "staff", label: "Staff", icon: Users, anyOf: ["manageClubStaff"] },
  { to: "settings", label: "Settings", icon: Settings, anyOf: ["updateClub"] },
  { to: "subscription", label: "Plan", icon: Receipt, anyOf: ["manageClubSubscription"] },
];

/** Phones fit four tabs; anything more goes under "More". */
const PHONE_TABS = 4;

export function ClubLayout() {
  const { pathname } = useLocation();
  const { clubSlug } = useParams();
  const me = useMe();
  const staff = me.data?.memberships.find((m) => m.club_slug === clubSlug);
  // The Super Admin owns the whole system: full access to any venue, looked up by its address.
  const isSuperAdmin = !!me.data?.global_roles.includes("super_admin");
  const lookup = useAdminVenue(!staff && isSuperAdmin ? clubSlug : undefined);
  const membership = useMemo<ClubMembershipSummary | undefined>(
    () =>
      staff ??
      (lookup.data && {
        club_id: lookup.data.id,
        club_slug: lookup.data.slug,
        club_name: lookup.data.name,
        role_key: "owner",
        permissions: allPermissions,
      }),
    [staff, lookup.data],
  );
  const club = useClub(membership?.club_id);

  const value = useMemo<ClubContextValue | null>(() => {
    if (!membership || !club.data) return null;
    return {
      club: club.data,
      membership,
      can: (p) => membership.permissions.includes(p),
      superAdmin: !staff,
    };
  }, [membership, club.data, staff]);

  if (!staff && isSuperAdmin && lookup.isPending) return <FullPageLoading />;
  if (!membership)
    return <NotFoundPage message="You aren't on the staff of this venue, or it doesn't exist." />;
  if (club.isPending) return <FullPageLoading />;
  if (club.error || !value) {
    return (
      <div className="mx-auto max-w-lg p-6 pt-24">
        <ErrorState
          message={club.error?.message ?? "Couldn't load this venue."}
          onRetry={() => club.refetch()}
        />
      </div>
    );
  }

  const items = nav.filter((n) => n.anyOf.some((p) => value.can(p)));

  return (
    <ClubContext.Provider value={value}>
      <div className="flex min-h-dvh flex-col md:flex-row">
        {/* Sidebar, tablet and up */}
        <aside className="hidden w-56 shrink-0 flex-col border-r court-line bg-court-surface md:flex lg:w-64">
          <div className="flex h-16 items-center px-5">
            <Link to="/" aria-label="CourtFlex home">
              <Wordmark />
            </Link>
          </div>
          <nav aria-label="Venue" className="flex flex-col gap-0.5 px-3 pt-4">
            {items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={label}
                to={to}
                end={end}
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
          <div className="mt-auto border-t court-line p-4">
            <UserBlock />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <OfflineBanner />
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b court-line bg-court-deep/95 px-4 backdrop-blur sm:px-6">
            <Link
              to="/"
              className="grid size-11 shrink-0 place-items-center md:hidden"
              aria-label="CourtFlex home"
            >
              <Wordmark compact />
            </Link>
            <ClubSwitcher />
            <div className="ml-auto md:hidden">
              <UserBlock compact />
            </div>
          </header>
          <AnnouncementBanner audience="owners" />
          <TrialBanner />
          <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-10">
            <div key={pathname} className="page-enter">
              <Outlet />
            </div>
          </main>
        </div>

        {/* Bottom bar, phones */}
        <PhoneNav items={items} />
      </div>
    </ClubContext.Provider>
  );
}

function ClubSwitcher() {
  const me = useMe();
  const { club, membership, superAdmin } = useClubContext();
  const memberships = me.data?.memberships ?? [];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = (
    <span className="min-w-0 text-left">
      <span className="block truncate leading-tight font-expanded font-bold">{club.name}</span>
      <span className="flex gap-2 truncate text-xs text-line-dim">
        <span>
          {club.city}, {club.province}
        </span>
        <span className="border-l court-line pl-2">
          {superAdmin ? "Super Admin" : roleLabels[membership.role_key]}
        </span>
      </span>
    </span>
  );

  if (memberships.length < 2) return <div className="min-w-0">{label}</div>;

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="-ml-2 flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-court-surface"
      >
        {label}
        <ChevronDown
          className={cn("size-4 shrink-0 text-line-dim transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Switch venue"
          className="absolute top-full left-0 z-40 mt-2 w-72 border border-line-faint bg-court-raised py-1 shadow-[0_16px_40px_rgba(5,11,20,0.7)]"
        >
          {memberships.map((m) => (
            <li key={m.club_id} role="option" aria-selected={m.club_id === club.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-court-surface"
                onClick={() => {
                  setOpen(false);
                  navigate(`/v/${m.club_slug}`);
                }}
              >
                <span>
                  <span className="block font-semibold">{m.club_name}</span>
                  <span className="block text-xs text-line-dim">{roleLabels[m.role_key]}</span>
                </span>
                {m.club_id === club.id && <Check className="size-4 text-ball" aria-label="Current venue" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserBlock({ compact }: { compact?: boolean }) {
  const me = useMe();
  const logout = useLogout();
  const signOut = () => logout.mutate(undefined, { onSettled: () => window.location.assign("/login") });
  // Owners and staff who also play switch sides without signing in again.
  const plays = !!me.data?.has_player_profile;

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {plays && (
          <a
            href="/home"
            className="grid size-10 place-items-center rounded-full text-line-dim hover:bg-court-surface hover:text-line"
            aria-label="Switch to the player app"
          >
            <ArrowLeftRight className="size-5" />
          </a>
        )}
        <button
          type="button"
          onClick={signOut}
          className="grid size-10 place-items-center rounded-full text-line-dim hover:bg-court-surface hover:text-line"
          aria-label={`Sign out ${me.data?.name ?? ""}`}
        >
          <LogOut className="size-5" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {plays && (
        <a
          href="/home"
          className="flex h-10 items-center gap-2 rounded-full border border-line-faint px-4 text-sm font-semibold hover:border-line-dim"
        >
          <ArrowLeftRight className="size-4" aria-hidden />
          Switch to player app
        </a>
      )}
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
    </div>
  );
}

/** Per-club subscription notice. Only people who manage the plan see trial details. */
function TrialBanner() {
  const { club, can, superAdmin } = useClubContext();
  const { settings } = usePlatformSettings();
  const canManage = can("manageClubSubscription");
  const sub = useSubscription(club.id, canManage && club.subscription_status !== "active");

  if (superAdmin) {
    return (
      <div role="status" className="border-b border-field/50 bg-field/10 px-4 py-3 text-sm sm:px-6">
        <strong className="font-semibold">You're managing {club.name} as Super Admin.</strong> You have full
        access. Changes you make are recorded in the audit log.{" "}
        <a href={`/admin/venues/${club.id}`} className="font-semibold underline underline-offset-4">
          Back to the admin portal
        </a>
      </div>
    );
  }

  if (club.status === "suspended" || club.status === "rejected") {
    return (
      <div role="alert" className="border-b border-signal-red/60 bg-signal-red/10 px-4 py-3 text-sm sm:px-6">
        <strong className="font-semibold">
          {club.status === "suspended" ? "CourtFlex suspended this venue." : "CourtFlex declined this venue."}
        </strong>{" "}
        Players can't find or book it, and changes are turned off. Your bookings and payments are kept.
        {club.status_reason && <span className="mt-1 block">Reason: {club.status_reason}</span>}
        <span className="mt-1 block">
          Questions? Contact CourtFlex support at {settings.support_email} or {settings.support_phone}.
        </span>
      </div>
    );
  }

  // A venue that just signed up: set it up while CourtFlex checks it.
  if (club.status === "pending_review") {
    return (
      <div
        role="status"
        className="border-b border-signal-amber/50 bg-signal-amber/10 px-4 py-3 text-sm sm:px-6"
      >
        <strong className="font-semibold">Waiting for CourtFlex approval.</strong> Players can't find or book{" "}
        {club.name} yet. Meanwhile, set up your courts, hours and rates, payments and staff. Your{" "}
        {settings.trial_days}-day free trial starts when it's approved.
      </div>
    );
  }

  if (club.read_only) {
    return (
      <div
        role="status"
        className="border-b border-signal-red/50 bg-signal-red/10 px-4 py-2.5 text-sm sm:px-6"
      >
        <strong className="font-semibold">This venue is read-only.</strong> Bookings and records stay visible.
        New bookings and payments are paused until the subscription is renewed.
      </div>
    );
  }
  if (!canManage || club.subscription_status !== "trialing") return null;
  if (sub.isPending) return <Skeleton className="h-10 rounded-none" />;
  if (!sub.data || sub.data.trial_days_left === null || !sub.data.trial_ends_at) return null;

  const days = sub.data.trial_days_left;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b court-line bg-court-surface px-4 py-2.5 text-sm sm:px-6">
      <span>
        <strong className="font-semibold">
          {days} {days === 1 ? "day" : "days"} left
        </strong>{" "}
        in this venue's free trial of {sub.data.plan.name}. It ends{" "}
        {formatDateShort(sub.data.trial_ends_at, club.timezone)}.
      </span>
      <Link to="subscription" className="tap font-semibold text-ball underline underline-offset-4">
        View plan
      </Link>
    </div>
  );
}

function PhoneNav({ items }: { items: NavItem[] }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const overflow = items.length > PHONE_TABS;
  const tabs = overflow ? items.slice(0, PHONE_TABS - 1) : items;
  const rest = overflow ? items.slice(PHONE_TABS - 1) : [];
  const restActive = rest.some((i) => pathname.split("/").includes(i.to));
  const tabClass = (active: boolean) =>
    cn(
      "flex h-16 flex-1 flex-col items-center justify-center gap-1 border-t-2 text-xs font-semibold",
      active ? "border-ball text-line" : "border-transparent text-line-dim",
    );

  return (
    <>
      <nav
        aria-label="Venue"
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
