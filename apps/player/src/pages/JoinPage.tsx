import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, Building2, CalendarCheck, CircleCheck, Trophy } from "lucide-react";
import { useMe, usePlatformSettings } from "@courtflex/api";
import { cn } from "@courtflex/ui";

// Owners and staff sign in on the shared page, then go on to the owner portal.
const OWNER_SIGN_IN = "/login?next=%2Fowner%2F";

const press =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 font-semibold transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.97]";

/**
 * Join: pick a path. Players make a free account; court owners list their venue.
 * One account works for both, so someone who plays and runs a venue can do both.
 */
export function JoinPage() {
  const me = useMe();
  const signedIn = !!me.data;
  const { settings } = usePlatformSettings();

  return (
    <div className="mx-auto max-w-5xl py-6 sm:py-10">
      <header className="rise text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-ball/40 bg-ball/10 px-4 py-1.5 text-xs font-bold tracking-[0.16em] text-ball uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-ball" />
          Join the CourtFlex community
        </p>
        <h1 className="mx-auto mt-5 max-w-[20ch] text-4xl leading-[1.05] font-expanded sm:max-w-none sm:text-6xl">
          <span className="sm:block">Built for Players.</span>{" "}
          <span className="sm:block">Designed for Court Owners.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[40rem] text-lg text-line-dim">
          Whether you're looking to book a court or manage your sports facility, CourtFlex makes it easy. Find
          your place, connect with players, and get in the game.
        </p>
      </header>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <PathCard
          icon={Building2}
          eyebrow="For venues"
          title="I manage a court"
          body="List your venue, take bookings and walk-ins, and run open play from one place."
          points={[
            "Players find and book your courts online",
            "Pay at the court, GCash or Maya, checked by your staff",
            `${settings.trial_days}-day free trial for each venue`,
          ]}
          action={
            <Link
              to="/join/owner"
              className={cn(press, "border border-field/60 text-line hover:border-field hover:bg-field/10")}
            >
              Get started as an owner
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
          note={
            <>
              Already run a venue here?{" "}
              <Link
                to={OWNER_SIGN_IN}
                className="font-semibold text-line underline underline-offset-4 hover:text-ball"
              >
                Owner sign in
              </Link>
            </>
          }
        />
        <PathCard
          featured
          icon={Trophy}
          eyebrow="For players"
          title="I'm here to play"
          body="Find courts and games near you, book in a few taps, and join open play and clubs."
          points={[
            "Book courts at venues across the Philippines",
            "Join open play sessions and get in the queue",
            "Join clubs and play with your people",
          ]}
          action={
            signedIn ? (
              <Link
                to="/home"
                className={cn(
                  press,
                  "bg-ball text-ball-ink hover:bg-ball-bright hover:shadow-[0_12px_34px_-10px_rgb(252_191_14/0.6)]",
                )}
              >
                You're signed in: go to your home
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <Link
                to="/register"
                className={cn(
                  press,
                  "bg-ball text-ball-ink hover:bg-ball-bright hover:shadow-[0_12px_34px_-10px_rgb(252_191_14/0.6)]",
                )}
              >
                Create a free account
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            )
          }
          note="Free for players. No app to install."
        />
      </div>

      {!signedIn && (
        <p className="mt-8 text-center text-line-dim">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-ball underline underline-offset-4">
            Sign in to your account
          </Link>
        </p>
      )}
      <p className="mt-3 text-center text-sm text-line-dim">
        <CalendarCheck className="mr-1.5 inline size-4 align-[-3px] text-field" aria-hidden />
        Just want to book once?{" "}
        <Link to="/courts" className="font-semibold text-line underline underline-offset-4 hover:text-ball">
          Book as a guest
        </Link>{" "}
        at venues that allow it.
      </p>
    </div>
  );
}

function PathCard({
  icon: Icon,
  eyebrow,
  title,
  body,
  points,
  action,
  note,
  featured,
}: {
  icon: typeof Trophy;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  action: ReactNode;
  note: ReactNode;
  featured?: boolean;
}) {
  return (
    <section
      aria-labelledby={`${eyebrow.toLowerCase().replace(/\W+/g, "-")}-h`}
      className={cn(
        "rise relative flex flex-col overflow-hidden rounded-[28px] border p-6 sm:p-8",
        // Most people are here to play: on phones the player path comes first.
        featured && "max-md:order-first",
        featured
          ? "border-ball/50 bg-court-surface shadow-[0_40px_90px_-40px_rgb(252_191_14/0.35)]"
          : "border-line-faint bg-court-surface/70",
      )}
      style={{ "--rise-delay": featured ? "160ms" : "80ms" } as CSSProperties}
    >
      <span
        className={cn(
          "grid size-12 place-items-center rounded-2xl",
          featured ? "bg-ball text-ball-ink" : "bg-field/15 text-field",
        )}
      >
        <Icon className="size-6" aria-hidden />
      </span>
      <p
        className={cn(
          "mt-5 text-xs font-bold tracking-[0.16em] uppercase",
          featured ? "text-ball" : "text-field",
        )}
      >
        {eyebrow}
      </p>
      <h2 id={`${eyebrow.toLowerCase().replace(/\W+/g, "-")}-h`} className="mt-1 text-3xl font-expanded">
        {title}
      </h2>
      <p className="mt-2 text-line-dim">{body}</p>
      <ul className="mt-5 flex flex-col gap-2.5">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm">
            <CircleCheck
              className={cn("mt-0.5 size-4 shrink-0", featured ? "text-ball" : "text-field")}
              aria-hidden
            />
            {p}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-7">
        {action}
        <p className="mt-3 text-center text-xs text-line-dim">{note}</p>
      </div>
    </section>
  );
}
