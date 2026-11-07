import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ArrowRight,
  Building2,
  CircleCheck,
  ChevronDown,
  LayoutGrid,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Search,
  SlidersHorizontal,
  Trophy,
  Users,
  X,
} from "lucide-react";
import type { CourtSort, VenueResult } from "@courtflex/api";
import { formatTime, useCourtSearch, useMe } from "@courtflex/api";
import { Button, cn, EmptyState, ErrorState, Skeleton } from "@courtflex/ui";
import { ClubCover, pesos } from "@courtflex/features";

const VenueMap = lazy(() => import("../components/VenueMap"));

const TZ = "Asia/Manila";
const PER_PAGE = 6;
const POPULAR = ["Mauban", "Lucena City", "Quezon City", "Cebu City"];
const AMENITIES = [
  "Parking",
  "Lights",
  "Restrooms",
  "Covered court",
  "Air-conditioned",
  "Paddle rental",
  "Showers",
  "Lockers",
  "Food nearby",
  "Pro shop",
];
const SURFACES = ["Acrylic", "Sport tile", "Concrete", "Asphalt", "Wood"];
const PRICES = [200, 500, 1000];
const SORTS: Array<{ value: CourtSort; label: string }> = [
  { value: "recommended", label: "Recommended" },
  { value: "availability", label: "Available soonest" },
  { value: "price_asc", label: "Lowest price" },
  { value: "price_desc", label: "Highest price" },
];
type View = "grid" | "list" | "map";
const OWNER_SIGN_IN = "/login?next=%2Fowner%2F";

type Located =
  | { status: "off" }
  | { status: "asking" }
  | { status: "on"; lat: number; lng: number }
  | { status: "denied"; message: string };

/**
 * Explore courts. Every filter, the sort, the view and the page live in the
 * address, so a search can be shared and Back works. Location is asked for
 * only when someone turns on "Nearby".
 */
export function CourtsPage() {
  const [params, setParams] = useSearchParams();
  const signedIn = !!useMe().data;
  const q = params.get("q") ?? "";
  const today = params.get("today") === "1";
  const near = params.get("near") === "1";
  const io = (params.get("io") ?? "") as "" | "indoor" | "outdoor";
  const maxPrice = Number(params.get("max") ?? 0);
  const surface = params.get("surface") ?? "";
  const amenities = (params.get("amen") ?? "").split(",").filter(Boolean);
  const sort = (
    SORTS.some((s) => s.value === params.get("sort")) ? params.get("sort") : "recommended"
  ) as CourtSort;
  const view = (
    ["grid", "list", "map"].includes(params.get("view") ?? "") ? params.get("view") : "grid"
  ) as View;
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  /** Changes some parameters; anything that changes the results goes back to page 1. */
  const update = useCallback(
    (next: Record<string, string | null>, keepPage = false) =>
      setParams(
        // From the address as it is now, so two quick filter taps don't undo each other.
        () => {
          const n = new URLSearchParams(window.location.search);
          for (const [k, v] of Object.entries(next)) {
            if (v === null || v === "") n.delete(k);
            else n.set(k, v);
          }
          if (!keepPage) n.delete("page");
          return n;
        },
        { replace: !keepPage },
      ),
    [setParams],
  );

  // The search box follows the address: typing edits a draft until Search is pressed.
  const [typed, setTyped] = useState({ forQ: q, text: q });
  const draft = typed.forQ === q ? typed.text : q;
  const setDraft = (text: string) => setTyped({ forQ: q, text });

  const [located, setLocated] = useState<Located>({ status: "off" });
  const point = near && located.status === "on" ? { lat: located.lat, lng: located.lng } : null;
  /** Asks the browser for the position. Results arrive in callbacks, never during render. */
  const askPosition = useCallback(() => {
    if (!("geolocation" in navigator)) {
      queueMicrotask(() =>
        setLocated({
          status: "denied",
          message: "This browser can't share your location. Search by city or barangay instead.",
        }),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocated({ status: "on", lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        setLocated({
          status: "denied",
          message:
            err.code === err.PERMISSION_DENIED
              ? "Location is off for CourtFlex. Search by city, barangay or venue instead, or allow location in your browser settings."
              : "Couldn't find your location just now. Search by city, barangay or venue instead.",
        }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);
  const locate = () => {
    setLocated({ status: "asking" });
    askPosition();
  };
  // "Nearby" in a shared link: ask once when the page opens.
  const asked = useRef(false);
  useEffect(() => {
    if (near && !asked.current) {
      asked.current = true;
      askPosition();
    }
  }, [near, askPosition]);
  const finding = near && (located.status === "asking" || located.status === "off");
  const toggleNear = () => {
    if (near) {
      update({ near: null });
      return;
    }
    update({ near: "1" });
    if (located.status !== "on") locate();
  };

  const results = useCourtSearch({
    q,
    indoor_outdoor: io,
    surface,
    max_price: maxPrice,
    amenities,
    available_today: today,
    sort,
    ...(point ? { lat: point.lat, lng: point.lng, radius_km: 25 } : {}),
  });

  const list = results.data ?? [];
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const current = Math.min(page, pages);
  const shown = view === "map" ? list : list.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const active =
    (today ? 1 : 0) +
    (near ? 1 : 0) +
    (io ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (surface ? 1 : 0) +
    amenities.length;
  const clearAll = () =>
    update({ today: null, near: null, io: null, max: null, surface: null, amen: null, q: null });

  const resultsTop = useRef<HTMLDivElement>(null);
  const goTo = (n: number) => {
    update({ page: n === 1 ? null : String(n) }, true);
    resultsTop.current?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="-mx-4 -mt-6 sm:-mx-6 md:-mt-6">
      {/* Search band */}
      <section className="border-b court-line bg-court-surface/40 px-4 pt-8 pb-7 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-bold tracking-[0.18em] text-ball uppercase">
              Pickleball courts near you
            </span>
            <span aria-hidden className="hidden h-4 border-l border-line-faint sm:block" />
            <span className="text-line-dim">Search, compare and book from the web</span>
          </p>
          <h1 className="mt-3 text-4xl leading-tight font-expanded sm:text-5xl">
            Discover Courts.{" "}
            <mark className="rounded-lg bg-ball box-decoration-clone px-2 text-ball-ink">Book. Play.</mark>
          </h1>

          <form
            role="search"
            className="mt-6 flex max-w-4xl flex-col gap-2 rounded-2xl border border-line-faint bg-court-deep/70 p-2 shadow-[0_20px_50px_-30px_rgb(0_0_0/0.9)] sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: draft.trim() || null });
            }}
          >
            <label className="flex flex-1 items-center gap-3 px-3">
              <MapPin className="size-5 shrink-0 text-field" aria-hidden />
              <span className="sr-only">Search by city, barangay or venue</span>
              <input
                type="search"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Mauban, Lucena, or venue name…"
                className="h-12 w-full bg-transparent text-base text-line placeholder:text-line-dim/70 focus:outline-none"
              />
            </label>
            <Button type="submit" variant="primary" size="lg" className="rounded-xl">
              <Search className="size-4" aria-hidden />
              Search
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Chip pressed={today} onClick={() => update({ today: today ? null : "1" })}>
              Available today
            </Chip>
            <Chip pressed={near} onClick={toggleNear} busy={finding}>
              Nearby
            </Chip>
            <Menu label={io ? (io === "indoor" ? "Indoor" : "Outdoor") : "Indoor / Outdoor"} on={!!io}>
              {(close) =>
                (["", "indoor", "outdoor"] as const).map((v) => (
                  <MenuItem
                    key={v || "any"}
                    selected={io === v}
                    onClick={() => {
                      update({ io: v || null });
                      close();
                    }}
                  >
                    {v === "" ? "Any court" : v === "indoor" ? "Indoor" : "Outdoor"}
                  </MenuItem>
                ))
              }
            </Menu>
            <Menu label={maxPrice ? `Under ${pesos(maxPrice)}` : "Price"} on={!!maxPrice}>
              {(close) =>
                [0, ...PRICES].map((p) => (
                  <MenuItem
                    key={p}
                    selected={maxPrice === p}
                    onClick={() => {
                      update({ max: p ? String(p) : null });
                      close();
                    }}
                  >
                    {p ? `Under ${pesos(p)} an hour` : "Any price"}
                  </MenuItem>
                ))
              }
            </Menu>
            <Menu
              label="Filters"
              icon={<SlidersHorizontal className="size-4" aria-hidden />}
              on={!!surface || amenities.length > 0}
              count={(surface ? 1 : 0) + amenities.length}
              wide
            >
              {() => (
                <div className="flex flex-col gap-4 p-2">
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Surface</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {["", ...SURFACES].map((s) => (
                        <Pill
                          key={s || "any"}
                          on={surface === s}
                          onClick={() => update({ surface: s || null })}
                        >
                          {s || "Any"}
                        </Pill>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold">Must have</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {AMENITIES.map((a) => {
                        const on = amenities.includes(a);
                        return (
                          <Pill
                            key={a}
                            on={on}
                            onClick={() =>
                              update({
                                amen:
                                  (on ? amenities.filter((x) => x !== a) : [...amenities, a]).join(",") ||
                                  null,
                              })
                            }
                          >
                            {a}
                          </Pill>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
              )}
            </Menu>
            {active > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-line-dim hover:text-line"
              >
                <X className="size-4" aria-hidden />
                Clear all
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-field/40 bg-field/10 px-3 font-semibold text-field">
              <CircleCheck className="size-4" aria-hidden />
              Book on the web
              <span className="font-normal text-line-dim">· no app needed</span>
            </span>
            <span className="ml-1 text-line-dim">Popular:</span>
            {POPULAR.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={q === c}
                onClick={() => update({ q: q === c ? null : c })}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3 transition-colors",
                  q === c ? "border-ball text-ball" : "border-line-faint hover:border-line-dim",
                )}
              >
                {c}
              </button>
            ))}
            {!near && (
              <button
                type="button"
                onClick={toggleNear}
                className="inline-flex h-9 items-center gap-1.5 px-2 font-semibold text-ball underline-offset-4 hover:underline"
              >
                <LocateFixed className="size-4" aria-hidden />
                Use my location
              </button>
            )}
          </div>
          {located.status === "denied" && near && (
            <p role="status" className="mt-3 border-l-2 border-signal-amber pl-3 text-sm">
              {located.message}
            </p>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="px-4 py-8 sm:px-6" aria-labelledby="results-h">
        <div ref={resultsTop} className="mx-auto max-w-6xl scroll-mt-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div aria-live="polite">
              <h2 id="results-h" className="text-3xl font-expanded">
                {results.isPending
                  ? "Finding courts…"
                  : `${list.length} ${list.length === 1 ? "venue" : "venues"} found`}
              </h2>
              <p className="mt-1 text-line-dim">
                {point
                  ? "Within 25 km of you. "
                  : near && located.status === "asking"
                    ? "Finding your location… "
                    : ""}
                Compare availability, price and location.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-line-dim">
                Sort by
                <span className="relative">
                  <select
                    value={sort}
                    onChange={(e) =>
                      update({ sort: e.target.value === "recommended" ? null : e.target.value })
                    }
                    className="h-11 appearance-none rounded-full border border-line-faint bg-court-surface pr-9 pl-4 font-semibold text-line focus:border-ball/70 focus:outline-none"
                  >
                    {SORTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                </span>
              </label>
              <div
                role="radiogroup"
                aria-label="View"
                className="flex rounded-full border border-line-faint bg-court-surface p-1"
              >
                {(
                  [
                    ["grid", "Grid", LayoutGrid],
                    ["list", "List", List],
                    ["map", "Map", MapIcon],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={view === value}
                    onClick={() => update({ view: value === "grid" ? null : value }, true)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
                      view === value ? "bg-line text-court-deep" : "text-line-dim hover:text-line",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_17rem]">
            <div className="min-w-0">
              {results.isPending && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-[30rem] rounded-[22px]" />
                  ))}
                </div>
              )}
              {results.error && (
                <ErrorState message={results.error.message} onRetry={() => results.refetch()} />
              )}
              {results.data && list.length === 0 && (
                <EmptyState
                  title="No courts match"
                  body={
                    today
                      ? "Nothing is free for the rest of today with these filters. Try tomorrow from a venue's page, or fewer filters."
                      : point
                        ? "Nothing within 25 km matches. Turn off Nearby or try fewer filters."
                        : "Try another place, or fewer filters."
                  }
                  action={
                    active > 0 || q ? (
                      <Button size="sm" onClick={clearAll}>
                        Clear all
                      </Button>
                    ) : undefined
                  }
                />
              )}

              {list.length > 0 && view === "grid" && (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map((v) => (
                    <li key={v.id}>
                      <VenueCard venue={v} />
                    </li>
                  ))}
                </ul>
              )}
              {list.length > 0 && view === "list" && (
                <ul className="flex flex-col gap-4">
                  {shown.map((v) => (
                    <li key={v.id}>
                      <VenueListRow venue={v} />
                    </li>
                  ))}
                </ul>
              )}
              {list.length > 0 && view === "map" && <MapView venues={list} me={point} />}

              {view !== "map" && pages > 1 && <Pager page={current} pages={pages} onPage={goTo} />}
            </div>

            <aside aria-label="More on CourtFlex" className="hidden flex-col gap-4 xl:flex">
              <SideCard
                icon={Trophy}
                title="No group? Join open play"
                body="Sign up for a session and the queue puts you on court."
                to="/sessions"
                action="Browse open play"
              />
              <SideCard
                icon={Users}
                title="Find your club"
                body="Join a club for member rates and members-only nights."
                to="/clubs"
                action="Browse clubs"
              />
              {/* For court owners: only visitors see it, not signed-in players. */}
              {!signedIn && (
                <SideCard
                  icon={Building2}
                  title="List your venue"
                  body="Take bookings and walk-ins, and run open play, all in one place."
                  to={OWNER_SIGN_IN}
                  action="For court owners"
                />
              )}
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Cards ─────────────────────────────────────────────────

function courtType(v: VenueResult) {
  const kinds = new Set(v.courts.map((c) => c.indoor_outdoor));
  return kinds.size > 1 ? "Indoor and outdoor" : kinds.has("indoor") ? "Indoor" : "Outdoor";
}

/** Where the main button goes: the venue's booking page, or its info page when it doesn't take bookings. */
function venueTarget(v: VenueResult) {
  return v.bookable ? `/venues/${v.slug}/book` : `/venues/${v.slug}`;
}

function Badges({ venue: v }: { venue: VenueResult }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
      {v.bookable ? (
        <span className="rounded-full bg-ball/15 px-2.5 py-1 tracking-wide text-ball uppercase">
          Book online
        </span>
      ) : (
        <span className="rounded-full border border-line-faint px-2.5 py-1 tracking-wide text-line-dim uppercase">
          Not bookable yet
        </span>
      )}
      {v.guest_booking && (
        <span className="rounded-full border border-line-faint px-2.5 py-1 font-semibold text-line-dim">
          Guest booking
        </span>
      )}
      {v.upcoming_session_count > 0 && (
        <span className="rounded-full bg-field/10 px-2.5 py-1 font-semibold text-field">Open play</span>
      )}
    </div>
  );
}

function Photo({ venue: v, className }: { venue: VenueResult; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-court-outer", className)}>
      <ClubCover name={v.name} url={v.cover_url} className="h-full w-full" />
      <span className="absolute top-3 left-3 rounded-full bg-court-deep/85 px-3 py-1 text-xs font-semibold backdrop-blur">
        {courtType(v)}
      </span>
    </div>
  );
}

const nextFree = (v: VenueResult) =>
  !v.bookable ? "—" : v.next_free_at ? formatTime(v.next_free_at, TZ) : "Full";

function VenueCard({ venue: v }: { venue: VenueResult }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[22px] border border-line-faint bg-court-surface transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-line-dim/60 hover:shadow-[0_24px_50px_-28px_rgb(0_0_0/0.9)]">
      <Photo venue={v} className="h-40" />
      <div className="flex flex-1 flex-col p-4">
        <Badges venue={v} />
        <h3 className="mt-3 text-lg leading-snug font-bold">
          <Link to={`/venues/${v.slug}`} className="hover:underline">
            {v.name}
          </Link>
        </h3>
        <p className="mt-2 flex gap-1.5 text-sm text-line-dim">
          <MapPin className="mt-0.5 size-4 shrink-0 text-field" aria-hidden />
          <span className="line-clamp-2">
            {v.address}, {v.city}, {v.province}
            {v.distance_km !== null ? ` · ${v.distance_km} km away` : ""}
          </span>
        </p>
        <dl className="mt-4 grid grid-cols-3 divide-x divide-line-faint rounded-2xl border border-line-faint text-center">
          <Stat label="Courts" value={String(v.courts.length)} />
          <Stat label="Type" value={courtType(v).replace("Indoor and outdoor", "Both")} />
          <Stat label="Today" value={nextFree(v)} accent={!!v.next_free_at} />
        </dl>
        <Amenities list={v.amenities} />
        <div className="mt-auto pt-4">
          <div className="border-t court-line pt-3">
            <p className="text-xs font-semibold tracking-wide text-line-dim uppercase">From</p>
            <p className="text-2xl font-extrabold font-condensed">
              {pesos(v.price_from)}
              <span className="text-sm font-normal text-line-dim">/hr</span>
            </p>
          </div>
          <MainAction venue={v} className="mt-3 w-full" />
        </div>
      </div>
    </article>
  );
}

function VenueListRow({ venue: v }: { venue: VenueResult }) {
  return (
    <article className="grid overflow-hidden rounded-[22px] border border-line-faint bg-court-surface md:grid-cols-[15rem_1fr_15rem]">
      <Photo venue={v} className="h-44 md:h-full" />
      <div className="p-5">
        <Badges venue={v} />
        <h3 className="mt-3 text-xl font-bold">
          <Link to={`/venues/${v.slug}`} className="hover:underline">
            {v.name}
          </Link>
        </h3>
        <p className="mt-1 flex gap-1.5 text-sm text-line-dim">
          <MapPin className="mt-0.5 size-4 shrink-0 text-field" aria-hidden />
          {v.address}, {v.city}, {v.province}
          {v.distance_km !== null ? ` · ${v.distance_km} km away` : ""}
        </p>
        <p className="mt-3 text-sm">
          {v.courts.length} {v.courts.length === 1 ? "court" : "courts"}
          <span className="ml-3 text-line-dim">{courtType(v)}</span>
        </p>
        <Amenities list={v.amenities} />
      </div>
      <div className="flex flex-col justify-center gap-4 border-t border-line-faint bg-court-raised/30 p-5 md:border-t-0 md:border-l">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-line-dim uppercase">Next available</p>
          {!v.bookable ? (
            <p className="mt-1 font-semibold text-line-dim">Call the venue to book</p>
          ) : v.next_free_at ? (
            <>
              <p className="mt-1 text-lg font-bold">Today, {formatTime(v.next_free_at, TZ)}</p>
              <p className="text-sm text-field">
                {v.free_slots_today} {v.free_slots_today === 1 ? "hour" : "hours"} free today
              </p>
            </>
          ) : (
            <p className="mt-1 font-semibold">Full for today</p>
          )}
        </div>
        <div className="border-t court-line pt-3">
          <p className="text-xs font-bold tracking-[0.16em] text-line-dim uppercase">From</p>
          <p className="text-2xl font-extrabold font-condensed">
            {pesos(v.price_from)}
            <span className="text-sm font-normal text-line-dim">/hour</span>
          </p>
        </div>
        <MainAction venue={v} className="w-full" />
      </div>
    </article>
  );
}

function MainAction({ venue: v, className }: { venue: VenueResult; className?: string }) {
  return (
    <Link
      to={venueTarget(v)}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.97]",
        v.bookable
          ? "bg-ball text-ball-ink hover:bg-ball-bright hover:shadow-[0_10px_30px_-10px_rgb(252_191_14/0.55)]"
          : "border border-line-faint hover:border-line-dim hover:bg-court-raised",
        className,
      )}
    >
      {v.bookable ? "View availability" : "View venue"}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 px-1 py-2.5">
      <dt className="text-[0.65rem] font-semibold tracking-wide text-line-dim uppercase">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-[0.8rem] font-bold font-condensed [overflow-wrap:anywhere] sm:text-sm",
          accent && "text-ball",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Amenities({ list }: { list: string[] }) {
  if (!list.length) return null;
  const more = list.length - 3;
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Amenities">
      {list.slice(0, 3).map((a) => (
        <li key={a} className="rounded-full bg-court-raised/70 px-2.5 py-1 text-xs text-line-dim">
          {a}
        </li>
      ))}
      {more > 0 && <li className="px-1 py-1 text-xs text-line-dim">+{more} more</li>}
    </ul>
  );
}

function MapView({ venues, me }: { venues: VenueResult[]; me: { lat: number; lng: number } | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const onSelect = useCallback((id: string) => setSelected(id), []);
  const side = selected ? venues.filter((v) => v.id === selected) : venues;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="h-[65vh] min-h-96 overflow-hidden rounded-[22px] border border-line-faint">
        <Suspense fallback={<Skeleton className="h-full" />}>
          <VenueMap venues={venues} selectedId={selected} onSelect={onSelect} me={me} />
        </Suspense>
      </div>
      <ul className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto">
        {side.map((v) => (
          <li key={v.id} className="rounded-2xl border border-line-faint bg-court-surface p-4">
            <Badges venue={v} />
            <h3 className="mt-2 font-bold">
              <Link to={`/venues/${v.slug}`} className="hover:underline">
                {v.name}
              </Link>
            </h3>
            <p className="text-sm text-line-dim">
              {v.city} · from {pesos(v.price_from)}/hr · today {nextFree(v)}
            </p>
            <MainAction venue={v} className="mt-3 h-9 w-full" />
          </li>
        ))}
        {selected && (
          <li>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Show all venues
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  return (
    <nav aria-label="Pages" className="mt-8 flex items-center justify-center gap-2">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
        className="h-10 rounded-full border border-line-faint px-4 text-sm font-semibold disabled:text-line-dim disabled:opacity-50"
      >
        Previous
      </button>
      {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-current={n === page ? "page" : undefined}
          onClick={() => onPage(n)}
          className={cn(
            "size-10 rounded-full text-sm font-bold",
            n === page ? "bg-line text-court-deep" : "border border-line-faint hover:border-line-dim",
          )}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        disabled={page === pages}
        onClick={() => onPage(page + 1)}
        className="h-10 rounded-full border border-line-faint px-4 text-sm font-semibold disabled:text-line-dim disabled:opacity-50"
      >
        Next
      </button>
    </nav>
  );
}

function SideCard({
  icon: Icon,
  title,
  body,
  to,
  action,
}: {
  icon: typeof Trophy;
  title: string;
  body: string;
  to: string;
  action: string;
}) {
  return (
    <div className="rounded-[22px] border border-line-faint bg-court-surface p-5">
      <Icon className="size-6 text-field" aria-hidden />
      <h3 className="mt-3 text-lg leading-snug font-bold">{title}</h3>
      <p className="mt-1 text-sm text-line-dim">{body}</p>
      <Link
        to={to}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-line-faint px-4 text-sm font-semibold transition-colors hover:border-line-dim hover:bg-court-raised"
      >
        {action}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

// ── Filter controls ───────────────────────────────────────

function Chip({
  pressed,
  onClick,
  busy,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-busy={busy || undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
        pressed ? "border-ball bg-ball/10 text-ball" : "border-line-faint hover:border-line-dim",
      )}
    >
      {pressed && <CircleCheck className="size-4" aria-hidden />}
      {children}
    </button>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-3 text-sm font-semibold transition-colors",
        on ? "border-ball bg-ball/10 text-ball" : "border-line-faint text-line-dim hover:text-line",
      )}
    >
      {children}
    </button>
  );
}

/** A chip that opens a small panel. Closes on outside click or Escape. */
function Menu({
  label,
  icon,
  on,
  count,
  wide,
  children,
}: {
  label: string;
  icon?: ReactNode;
  on: boolean;
  count?: number;
  wide?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
          on ? "border-ball bg-ball/10 text-ball" : "border-line-faint hover:border-line-dim",
        )}
      >
        {icon}
        {label}
        {!!count && <span className="rounded-full bg-ball px-1.5 text-xs text-ball-ink">{count}</span>}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full left-0 z-30 mt-2 rounded-2xl border border-line-faint bg-court-raised p-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)]",
            wide ? "w-[min(22rem,calc(100vw-2rem))]" : "min-w-52",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold",
        selected ? "text-ball" : "hover:bg-court-surface",
      )}
    >
      {children}
      {selected && <CircleCheck className="size-4" aria-hidden />}
    </button>
  );
}

export function clock(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return `${h! % 12 === 0 ? 12 : h! % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h! < 12 ? "AM" : "PM"}`;
}
