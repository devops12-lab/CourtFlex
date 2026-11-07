import { useEffect, useState, type CSSProperties } from "react";
import { AnnouncementBanner } from "@courtflex/features";
import { Link, Navigate, NavLink } from "react-router";
import { Menu, X } from "lucide-react";
import { useMe, usePlatformSettings } from "@courtflex/api";
import { cn, OfflineBanner, PageLoader, Reveal, Wordmark } from "@courtflex/ui";
import { HeroBoard } from "./HeroBoard";

// Owners and staff sign in on the same page as players, then go to the owner portal.
const OWNER_SIGN_IN = "/login?next=%2Fowner%2F";

// Cities with courts on CourtFlex today. Each opens the court search for that place.
const cities = ["Mauban", "Lucena City", "Tayabas City", "Lucban", "Quezon City", "Pasig City", "Cebu City"];

// Sections of the landing page. From other pages these open the landing page at that section.
const nav = [
  { href: "/#how", label: "How booking works" },
  { href: "/#open-play", label: "Open play and clubs" },
  { href: "/#owners", label: "For court owners" },
];

// Buttons respond to the hand: a soft glow on hover, a small press on click.
const press =
  "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97]";
const gold = cn(
  "inline-flex h-12 items-center justify-center rounded-full bg-ball px-6 font-semibold text-ball-ink hover:bg-ball-bright hover:shadow-[0_12px_34px_-10px_rgb(252_191_14/0.6)]",
  press,
);
const outline = cn(
  "inline-flex h-12 items-center justify-center rounded-full border border-line/60 px-6 font-semibold hover:border-line hover:bg-court-raised",
  press,
);

/** Staggers the hero's first lines. */
const rise = (ms: number) => ({ className: "rise", style: { "--rise-delay": `${ms}ms` } as CSSProperties });

/**
 * The front door for people who aren't signed in. Signed-in players go
 * straight to their home screen.
 */
export function LandingPage() {
  const me = useMe();
  // Same look as the splash screen, so the page doesn't flicker while the session loads.
  if (me.isPending) return <PageLoader />;
  if (me.data) return <Navigate to="/home" replace />;

  return (
    <div className="min-h-dvh">
      <OfflineBanner />
      <SiteHeader />
      <AnnouncementBanner audience="players" />
      <main>
        <Hero />
        <Reveal>
          <Cities />
        </Reveal>
        <HowItWorks />
        <OpenPlay />
        <Reveal>
          <Paying />
        </Reveal>
        <Reveal>
          <Owners />
        </Reveal>
        <Reveal>
          <Closing />
        </Reveal>
      </main>
      <SiteFooter />
    </div>
  );
}

/** The header for visitors: on the landing page and on public pages like court search. */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-300",
        scrolled || open
          ? "border-line-faint bg-court-deep/85 shadow-[0_12px_40px_-20px_rgb(0_0_0/0.8)]"
          : "border-transparent bg-court-deep/40",
      )}
    >
      <div className="mx-auto flex h-18 max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Link to="/" aria-label="CourtFlex home" className="shrink-0">
          <Wordmark size="md" />
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 lg:flex">
          <NavLink
            to="/courts"
            className={({ isActive }) =>
              cn(
                "rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors hover:bg-court-raised/60 hover:text-line",
                isActive ? "text-ball" : "text-line-dim",
              )
            }
          >
            Discover Courts
          </NavLink>
          <NavLink
            to="/find-booking"
            className={({ isActive }) =>
              cn(
                "rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors hover:bg-court-raised/60 hover:text-line",
                isActive ? "text-ball" : "text-line-dim",
              )
            }
          >
            View Bookings
          </NavLink>
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              // Landing sections show on wide screens; the menu has them on smaller ones.
              className="hidden rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap text-line-dim transition-colors hover:bg-court-raised/60 hover:text-line xl:inline-flex"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/login"
            className="hidden h-10 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-colors hover:bg-court-raised/60 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            to="/join"
            className={cn(
              "inline-flex h-10 items-center rounded-full bg-ball px-5 text-sm font-semibold whitespace-nowrap text-ball-ink hover:bg-ball-bright hover:shadow-[0_10px_30px_-10px_rgb(252_191_14/0.6)]",
              press,
            )}
          >
            Join CourtFlex
          </Link>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full border border-line-faint transition-colors hover:bg-court-raised xl:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
      {/* Slides open: the row grows from 0 to its natural height. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out xl:hidden",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        inert={!open}
      >
        <nav id="site-menu" aria-label="Site" className="overflow-hidden px-5">
          <ul className="flex flex-col border-t court-line pb-5">
            <li>
              <Link
                to="/courts"
                onClick={() => setOpen(false)}
                className="block border-b court-line py-3 font-semibold"
              >
                Discover Courts
              </Link>
            </li>
            {nav.map((n) => (
              <li key={n.href}>
                <a
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="block border-b court-line py-3 font-semibold"
                >
                  {n.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                to="/find-booking"
                onClick={() => setOpen(false)}
                className="block border-b court-line py-3 font-semibold"
              >
                View Bookings
              </Link>
            </li>
            <li>
              <Link to="/login" className="block py-3 font-semibold">
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Floodlight glow in the logo's green and gold, over a faint court grid. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 right-[-10%] size-[42rem] rounded-full bg-[radial-gradient(closest-side,rgb(18_213_156/0.16),transparent)] blur-2xl" />
        <div className="absolute top-40 left-[-15%] size-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(252_196_25/0.09),transparent)] blur-2xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgb(151_168_191/0.06)_1px,transparent_1px),linear-gradient(90deg,rgb(151_168_191/0.06)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_60%_30%,black,transparent_70%)] bg-[size:56px_56px]" />
      </div>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-14 pb-24 sm:px-8 lg:grid-cols-[7fr_5fr] lg:pt-24">
        <div>
          <h1
            {...rise(80)}
            className="rise max-w-[12ch] text-5xl leading-[0.98] font-expanded sm:text-6xl lg:text-7xl"
          >
            Book a court near you tonight.
          </h1>
          <p {...rise(200)} className="rise mt-6 max-w-[34rem] text-lg text-line-dim">
            See which courts are free, pick a time, and get a booking code. Pay the venue when you arrive.
          </p>
          <div {...rise(320)} className="rise mt-9 flex flex-wrap gap-3">
            <Link to="/courts" className={gold}>
              Discover Courts
            </Link>
            <Link to="/register" className={outline}>
              Create a free account
            </Link>
          </div>
          <p {...rise(420)} className="rise mt-6 text-sm text-line-dim">
            Courts in Quezon, Metro Manila and Cebu. Free for players.
          </p>
        </div>
        <div {...rise(260)} className="rise">
          <HeroBoard />
        </div>
      </div>
    </section>
  );
}

function Cities() {
  return (
    <section aria-labelledby="cities-h" className="border-y court-line bg-court-surface/60">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:px-8 md:flex-row md:items-center md:gap-8">
        <h2 id="cities-h" className="shrink-0 text-lg font-bold">
          Courts by city
        </h2>
        <ul className="flex flex-wrap gap-2">
          {cities.map((c) => (
            <li key={c}>
              <Link
                to={`/courts?q=${encodeURIComponent(c)}`}
                className="inline-flex h-10 items-center rounded-full border border-line-faint px-4 text-sm font-semibold transition-[border-color,color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-ball hover:bg-ball/5 hover:text-ball"
              >
                {c}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const steps = [
  {
    title: "Find a court",
    body: "Search by city, barangay or venue, or use your location. Every court shows its rates, hours and what's free.",
  },
  {
    title: "Pick your time",
    body: "Choose 1, 1.5 or 2 hours. You see the total from the venue's own rates before you confirm.",
  },
  {
    title: "Show your code",
    body: "You get a booking code straight away. Show it at the front desk and pay there.",
  },
];

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-h" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8">
      <Reveal>
        <h2 id="how-h" className="max-w-[18ch] text-4xl leading-tight font-expanded sm:text-5xl">
          Pick a time. Confirm. Play.
        </h2>
      </Reveal>
      <ol className="mt-12 grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal
            as="li"
            key={s.title}
            delay={i * 110}
            className="rounded-lg border border-line-faint bg-court-surface p-6 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-line-dim/60 hover:shadow-[0_24px_50px_-28px_rgb(0_0_0/0.9)]"
          >
            <span
              aria-hidden
              className="grid size-10 place-items-center rounded-full bg-ball text-lg font-extrabold text-ball-ink"
            >
              {i + 1}
            </span>
            <h3 className="mt-6 text-xl font-bold">{s.title}</h3>
            <p className="mt-2 text-line-dim">{s.body}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

function OpenPlay() {
  return (
    <section
      id="open-play"
      aria-labelledby="op-h"
      className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-20 sm:px-8"
    >
      <Reveal>
        <h2 id="op-h" className="text-4xl leading-tight font-expanded sm:text-5xl">
          No group? Join one.
        </h2>
      </Reveal>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Reveal as="article" className="flex flex-col rounded-lg bg-court-outer p-7">
          <h3 className="text-2xl font-bold">Open play</h3>
          <p className="mt-2 max-w-prose text-line/80">
            Sign up for a session, check in when you arrive, and the queue puts four players on each court in
            turn. Everyone gets their games.
          </p>
          <QueuePreview />
          <Link to="/sessions" className={cn(outline, "mt-auto self-start border-line/70")}>
            Browse open play
          </Link>
        </Reveal>
        <Reveal
          as="article"
          delay={120}
          className="flex flex-col rounded-lg border border-line-faint bg-court-surface p-7"
        >
          <h3 className="text-2xl font-bold">Clubs</h3>
          <p className="mt-2 max-w-prose text-line-dim">
            Clubs are groups of players who play together. Join one for member rates and members-only nights,
            or start a club for your barkada and run your own open play.
          </p>
          <ul className="my-8 flex flex-col gap-3 text-sm">
            <li className="flex justify-between gap-4 border-b court-line pb-3">
              <span>Members pay less per session</span>
              <span className="font-condensed text-line-dim">set by each club</span>
            </li>
            <li className="flex justify-between gap-4 border-b court-line pb-3">
              <span>Pay membership by GCash, Maya or in person</span>
              <span className="font-condensed text-line-dim">club checks it</span>
            </li>
          </ul>
          <Link to="/clubs" className={cn(outline, "mt-auto self-start")}>
            Browse clubs
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/** Four names on court, the next four waiting: what the queue looks like on the night. */
function QueuePreview() {
  return (
    <div aria-hidden className="my-8 grid grid-cols-[1fr_auto] items-center gap-4 text-sm">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border-2 border-line/70">
        {["Bea", "Migs", "Ana", "Paolo"].map((n) => (
          <span key={n} className="bg-court-outer-bright/40 px-3 py-2 font-semibold">
            {n}
          </span>
        ))}
      </div>
      <ol className="flex flex-col gap-1 text-line/80">
        <li>Next: Jo, Rica</li>
        <li>Then: Den, Kat</li>
      </ol>
    </div>
  );
}

function Paying() {
  return (
    <section aria-labelledby="pay-h" className="border-y court-line bg-court-surface/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 md:grid-cols-2">
        <h2 id="pay-h" className="text-4xl leading-tight font-expanded sm:text-5xl">
          Pay the venue, not the app.
        </h2>
        <div className="text-lg text-line-dim">
          <p>
            Booking is free. You pay at the front desk with cash, GCash or Maya, and the venue marks your
            booking paid. Your booking and its payment show separately, so you always know what's still due.
          </p>
          <p className="mt-4">
            Need to cancel? Each venue sets a deadline, and you can cancel in the app before it.
          </p>
        </div>
      </div>
    </section>
  );
}

const ownerPoints = [
  "A booking calendar for every court, with walk-ins",
  "Payments recorded at the desk, with daily totals",
  "Open play sessions with queues and check-in",
  "Opening hours, rates and closures per court",
];

function Owners() {
  const { settings } = usePlatformSettings();
  return (
    <section
      id="owners"
      aria-labelledby="owners-h"
      className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8"
    >
      <div className="rounded-lg border border-line-faint p-7 sm:p-10">
        <h2 id="owners-h" className="max-w-[16ch] text-4xl leading-tight font-expanded sm:text-5xl">
          Run your courts on CourtFlex.
        </h2>
        <ul className="mt-8 grid gap-x-10 gap-y-3 sm:grid-cols-2">
          {ownerPoints.map((p) => (
            <li key={p} className="flex gap-3 border-b court-line pb-3">
              <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-ball" />
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-line-dim">Each venue gets a {settings.trial_days}-day free trial.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to={OWNER_SIGN_IN} className={outline}>
            Owner sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section aria-labelledby="close-h" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
      <h2 id="close-h" className="text-5xl leading-[0.98] font-expanded sm:text-6xl">
        Your next game starts here.
      </h2>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/courts" className={gold}>
          Discover Courts
        </Link>
        <Link to="/join" className={outline}>
          Join CourtFlex
        </Link>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t court-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm sm:px-8 md:flex-row md:items-center md:justify-between">
        <div>
          <Wordmark size="lg" />
          <p className="mt-3 text-line-dim">Court booking and open play in the Philippines.</p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 font-semibold text-line-dim">
          <li>
            <Link to="/courts" className="hover:text-line">
              Discover Courts
            </Link>
          </li>
          <li>
            <Link to="/sessions" className="hover:text-line">
              Open play
            </Link>
          </li>
          <li>
            <Link to="/clubs" className="hover:text-line">
              Clubs
            </Link>
          </li>
          <li>
            <Link to="/tournaments" className="hover:text-line">
              Tournaments
            </Link>
          </li>
          <li>
            <Link to="/rankings" className="hover:text-line">
              Rankings
            </Link>
          </li>
          <li>
            <Link to="/find-booking" className="hover:text-line">
              View Bookings
            </Link>
          </li>
          <li>
            <Link to="/login" className="hover:text-line">
              Sign in
            </Link>
          </li>
          <li>
            <Link to={OWNER_SIGN_IN} className="hover:text-line">
              Owner sign in
            </Link>
          </li>
        </ul>
      </div>
      <p className="mx-auto max-w-6xl px-5 pb-8 text-xs text-line-dim sm:px-8">© 2026 CourtFlex</p>
    </footer>
  );
}
