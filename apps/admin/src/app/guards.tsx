import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { ApiError, useLogout, useMe } from "@courtflex/api";
import { Button, ErrorState, PageLoader, Wordmark } from "@courtflex/ui";

/** The shared sign-in page, outside this app. It sends the person back to `path` (inside /admin) afterwards. */
export const signInUrl = (path = "/") => `/login?next=${encodeURIComponent(`/admin${path}`)}`;

/** Leaves for the shared sign-in page. A full page load, since it's another app. */
export function SignInRedirect({ to }: { to?: string }) {
  const location = useLocation();
  const from = to ?? (location.state as { from?: string } | null)?.from ?? "/";
  useEffect(() => window.location.replace(signInUrl(from)), [from]);
  return <PageLoader />;
}

/**
 * Restores the session and lets only the Super Admin in. Everyone else is
 * told plainly, with a way back; the server refuses them too.
 */
export function RequireAdmin() {
  const me = useMe();
  const location = useLocation();
  const logout = useLogout();

  if (me.isPending) return <PageLoader />;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.isUnauthenticated) {
      return <SignInRedirect to={location.pathname + location.search} />;
    }
    return (
      <div className="mx-auto max-w-lg p-6 pt-24">
        <ErrorState message={me.error.message} onRetry={() => me.refetch()} />
      </div>
    );
  }
  if (!me.data.global_roles.includes("super_admin")) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-6">
        <Wordmark />
        <h1 className="text-3xl font-expanded">This area is for the Super Admin</h1>
        <p className="text-line-dim">
          You're signed in as {me.data.email}, which doesn't have Super Admin access.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={me.data.memberships.length > 0 ? "/owner/" : "/home"}
            className="inline-flex h-11 items-center rounded-full bg-ball px-5 font-semibold text-ball-ink hover:bg-ball-bright"
          >
            {me.data.memberships.length > 0 ? "Go to your venue" : "Go to your home"}
          </a>
          <Button
            onClick={() => logout.mutate(undefined, { onSettled: () => window.location.assign(signInUrl()) })}
          >
            Sign in with another account
          </Button>
        </div>
      </main>
    );
  }
  return <Outlet />;
}
