import {
  useId,
  useState,
  type ComponentType,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { CalendarCheck, Eye, EyeOff, Trophy, Users, Wallet } from "lucide-react";
import { cn, OfflineBanner, Wordmark } from "@courtflex/ui";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export interface AuthAside {
  eyebrow: string;
  title: string;
  intro: string;
  points: Array<{ icon: Icon; title: string; body: string }>;
}

/** What the left side says when a page doesn't bring its own. */
export const defaultAside: AuthAside = {
  eyebrow: "Welcome back",
  title: "Book courts and play more, in one place.",
  intro:
    "Players, court owners and their staff all sign in here. Owners and staff go straight to their venue.",
  points: [
    {
      icon: CalendarCheck,
      title: "Bookings at a glance",
      body: "Your courts, times and booking codes in one list.",
    },
    { icon: Wallet, title: "Pay your way", body: "GCash, Maya, or cash at the front desk." },
    { icon: Trophy, title: "Open play and clubs", body: "Join a session, get in the queue, find your club." },
  ],
};

export const joinAside: AuthAside = {
  eyebrow: "Join CourtFlex",
  title: "Your next game starts with one account.",
  intro: "Free for players. It works at every venue and club on CourtFlex.",
  points: [
    {
      icon: CalendarCheck,
      title: "Book a court in minutes",
      body: "See what's free, pick a time, get a booking code.",
    },
    { icon: Trophy, title: "Join open play", body: "Sign up for a session and the queue does the rest." },
    { icon: Users, title: "Find your club", body: "Join a club and pay your membership in the app." },
  ],
};

/**
 * The frame for sign-in, sign-up and recovery: what CourtFlex is on the left
 * (tablets and up), and the form on a card on the right.
 */
export function AuthShell({
  title,
  intro,
  aside = defaultAside,
  wide,
  below,
  children,
}: {
  title: string;
  intro?: ReactNode;
  aside?: AuthAside;
  /** Longer forms (onboarding) get a wider card. */
  wide?: boolean;
  /** Anything that sits under the card, like the demo accounts. */
  below?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden">
      <OfflineBanner />
      {/* Two rings, like the lines of a court seen up close: a thin green one, a heavy one behind the card. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="absolute top-20 -left-40 size-[22rem] rounded-full border border-field/35" />
        <span className="absolute -right-44 -bottom-56 size-[34rem] rounded-full border-[44px] border-court-raised/45" />
        <span className="absolute top-1/3 right-1/4 size-[30rem] rounded-full bg-[radial-gradient(closest-side,rgb(252_191_14/0.07),transparent)] blur-2xl" />
      </div>

      <div
        className={cn(
          "mx-auto grid min-h-dvh max-w-6xl items-center gap-12 px-4 py-10 sm:px-8",
          wide ? "lg:grid-cols-[4fr_7fr]" : "lg:grid-cols-[5fr_4fr] lg:gap-20",
        )}
      >
        <AsideCopy aside={aside} />

        <div className="page-enter mx-auto w-full max-w-[30rem] lg:max-w-none">
          <main className="rounded-[28px] border border-line-faint bg-court-surface/95 px-6 py-9 shadow-[0_40px_90px_-40px_rgb(0_0_0/0.9)] backdrop-blur sm:px-8">
            <div className="text-center">
              <Link to="/" aria-label="CourtFlex home" className="inline-block">
                <Wordmark size="lg" />
              </Link>
              <h1 className="mt-6 text-[1.85rem] leading-tight font-expanded">{title}</h1>
              {intro && <div className="mt-2 text-line-dim">{intro}</div>}
            </div>
            <hr className="my-7 border-line-faint" />
            {children}
          </main>
          {below}
        </div>
      </div>
    </div>
  );
}

function AsideCopy({ aside }: { aside: AuthAside }) {
  return (
    <section aria-label="About CourtFlex" className="hidden lg:block">
      <p className="rise text-sm font-bold tracking-[0.2em] text-ball uppercase">{aside.eyebrow}</p>
      <p
        className="rise mt-5 max-w-[13ch] text-5xl leading-[1.04] font-expanded xl:text-6xl"
        style={{ "--rise-delay": "80ms" } as CSSProperties}
      >
        {aside.title}
      </p>
      <p
        className="rise mt-6 max-w-[30rem] text-lg text-line-dim"
        style={{ "--rise-delay": "160ms" } as CSSProperties}
      >
        {aside.intro}
      </p>
      <ul
        className="rise mt-10 flex flex-col gap-6 border-l border-line-faint pl-6"
        style={{ "--rise-delay": "240ms" } as CSSProperties}
      >
        {aside.points.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-4">
            <Icon className="mt-0.5 size-5 shrink-0 text-field" aria-hidden />
            <div>
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-line-dim">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A labelled field with a small icon before the label, as on the sign-in card. */
export function AuthField({
  label,
  icon: Icon,
  hint,
  error,
  children,
}: {
  label: string;
  icon: Icon;
  hint?: ReactNode;
  error?: string;
  children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}) {
  const id = useId();
  const described =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
        <Icon className="size-4 text-line-dim" aria-hidden />
        {label}
      </label>
      {children({ id, "aria-describedby": described, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-line-dim">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-signal-red">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass =
  "h-[3.25rem] w-full rounded-2xl border border-line-faint bg-court-deep/70 px-4 text-base text-line placeholder:text-line-dim/60 transition-[border-color,box-shadow] duration-200 focus:border-ball/70 focus:shadow-[0_0_0_4px_rgb(252_191_14/0.12)] focus:outline-none focus-visible:outline-none aria-invalid:border-signal-red";

export function AuthInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...rest} />;
}

/** A password box with an eye to show what was typed. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input type={shown ? "text" : "password"} className={cn(inputClass, "pr-14")} {...props} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        title={shown ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-line-dim transition-colors hover:bg-court-raised hover:text-line"
      >
        {shown ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        <span className="sr-only">{shown ? "Hide what you typed" : "Show what you typed"}</span>
      </button>
    </div>
  );
}

/** The big gold submit button on the card. */
export const authSubmit =
  "h-14 w-full rounded-2xl text-base hover:shadow-[0_14px_36px_-12px_rgb(252_191_14/0.6)]";

/** "New to CourtFlex? Create an account" and "Back to CourtFlex", under the button. */
export function AuthFooter({ prompt, to, action }: { prompt: string; to: string; action: string }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 text-center">
      <p className="text-line-dim">
        {prompt}{" "}
        <Link to={to} className="tap font-semibold text-ball underline-offset-4 hover:underline">
          {action} →
        </Link>
      </p>
      <Link to="/" className="tap text-sm text-line-dim hover:text-line">
        Back to CourtFlex
      </Link>
    </div>
  );
}

/** Shown only while the mock API runs, in place of the email the real backend sends. */
export function MockHint({ children }: { children: ReactNode }) {
  if (import.meta.env.VITE_USE_MOCKS === "false") return null;
  return (
    <p className="mt-6 rounded-xl border border-dashed border-line-faint px-3 py-2 text-sm text-line-dim">
      <span className="font-semibold text-line">Mock API:</span> {children}
    </p>
  );
}
