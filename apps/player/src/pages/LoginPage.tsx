import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { ApiError, useLogin, useMe, type Me } from "@courtflex/api";
import { LockKeyhole, Mail } from "lucide-react";
import { Button, useOnline } from "@courtflex/ui";
import { AuthField, AuthFooter, AuthInput, AuthShell, authSubmit, PasswordInput } from "./auth/AuthShell";

const demo = [
  {
    group: "Players",
    people: [
      { email: "player1@example.test", who: "Jamie", note: "runs Tara Pikol Mauban, playing tonight" },
      { email: "carla@example.test", who: "Carla", note: "runs Lucena Dinkers" },
      { email: "player2@example.test", who: "Sam", note: "just started a club, waiting for review" },
      { email: "trisha@example.test", who: "Trisha", note: "new player, member of Tara Pikol" },
    ],
  },
  {
    group: "Court owners and staff",
    people: [
      { email: "owner@example.test", who: "Alex", note: "owns three venues" },
      { email: "manager@example.test", who: "Dana", note: "manager at Mauban" },
      { email: "staff@example.test", who: "Taylor", note: "front desk at Mauban" },
    ],
  },
  {
    group: "CourtFlex",
    people: [
      { email: "admin@example.test", who: "Super Admin", note: "owns the whole system, opens /admin" },
    ],
  },
];

/** Only paths on this site, never another address. */
const safeNext = (next: string | null) =>
  next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;

/** The owner portal and the admin portal are separate apps: going there is a full page load. */
const isPortal = (path: string) => /^\/(owner|admin)(\/|$)/.test(path);

/**
 * Where someone goes when no page asked for sign-in. The Super Admin goes to the admin portal;
 * court owners and staff to their venue, even if they also play: they switch to the player
 * app from the portal's menu.
 */
const homeFor = (me: Me) =>
  me.global_roles.includes("super_admin") ? "/admin/" : me.memberships.length > 0 ? "/owner/" : "/home";

/**
 * The one sign-in page for everyone: players, court owners and their staff.
 * The owner portal (/owner) is a separate app, so going there is a full page load.
 */
export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const online = useOnline();
  const location = useLocation();
  const asked =
    safeNext(new URLSearchParams(location.search).get("next")) ??
    (location.state as { from?: string } | null)?.from ??
    null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const go = (who: Me) => {
    const to = asked ?? homeFor(who);
    if (isPortal(to)) window.location.replace(to);
    else navigate(to, { replace: true });
  };

  if (me.data) {
    const to = asked ?? homeFor(me.data);
    if (isPortal(to)) {
      window.location.replace(to);
      return null;
    }
    return <Navigate to={to} replace />;
  }
  const error =
    login.error instanceof ApiError
      ? (login.error.field("email") ?? login.error.message)
      : login.error?.message;

  const portalNext = !!asked && isPortal(asked);

  return (
    <AuthShell
      title="Welcome back"
      intro={
        portalNext
          ? "Court owners and staff: you'll go straight to your venue."
          : "Sign in to your CourtFlex account."
      }
      below={
        <details className="group mt-4 rounded-2xl border border-line-faint bg-court-surface/60 px-5 py-3 text-sm">
          <summary className="tap cursor-pointer list-none font-semibold text-line-dim marker:hidden hover:text-line">
            Demo accounts <span className="font-normal">(password is “password”)</span>
          </summary>
          {demo.map((g) => (
            <section key={g.group} className="mt-3">
              <h2 className="text-xs font-semibold text-line-dim">{g.group}</h2>
              <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                {g.people.map((d) => (
                  <li key={d.email}>
                    <button
                      type="button"
                      className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-court-raised"
                      onClick={() => {
                        setEmail(d.email);
                        setPassword("password");
                      }}
                    >
                      <span className="block font-semibold">{d.who}</span>
                      <span className="block text-xs text-line-dim">{d.note}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </details>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ email, password }, { onSuccess: go });
        }}
      >
        <AuthField label="Email address" icon={Mail}>
          {(p) => (
            <AuthInput
              {...p}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </AuthField>
        <div className="flex flex-col gap-3">
          <AuthField label="Password" icon={LockKeyhole} error={error}>
            {(p) => (
              <PasswordInput
                {...p}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </AuthField>
          <Link
            to="/forgot-password"
            className="tap self-end text-sm font-semibold text-ball underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          className={authSubmit}
          loading={login.isPending}
          disabled={!online}
        >
          Sign in
        </Button>
      </form>
      <AuthFooter prompt="New to CourtFlex?" to="/join" action="Join CourtFlex" />
    </AuthShell>
  );
}
