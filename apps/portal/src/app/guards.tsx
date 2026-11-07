import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { ApiError, useMe } from "@courtflex/api";
import { ErrorState, PageLoader } from "@courtflex/ui";

export function FullPageLoading() {
  return <PageLoader />;
}

/** The shared sign-in page, outside this app. It sends the person back to `path` (inside /owner) afterwards. */
export const signInUrl = (path = "/") => `/login?next=${encodeURIComponent(`/owner${path}`)}`;

/** Leaves the portal for the shared sign-in page. A full page load, since it's another app. */
export function SignInRedirect({ to }: { to?: string }) {
  const location = useLocation();
  const from = to ?? (location.state as { from?: string } | null)?.from ?? "/";
  useEffect(() => window.location.replace(signInUrl(from)), [from]);
  return <FullPageLoading />;
}

/** Restores the cookie session; sends signed-out people to the shared sign-in page. */
export function RequireSession() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <FullPageLoading />;
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
  return <Outlet />;
}

/** Sends people to their venue, or the picker when they have several. */
export function HomeRedirect() {
  const me = useMe();
  const memberships = me.data?.memberships ?? [];
  if (memberships.length === 1) return <Navigate to={`/v/${memberships[0]!.club_slug}`} replace />;
  return <Navigate to="/venues" replace />;
}
