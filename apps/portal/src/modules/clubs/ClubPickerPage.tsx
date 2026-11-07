import { Link } from "react-router";
import { useLogout, useMe } from "@courtflex/api";
import { Button, EmptyState, Wordmark } from "@courtflex/ui";
import { roleLabels } from "../../app/club-context";

export function ClubPickerPage() {
  const me = useMe();
  const logout = useLogout();
  const memberships = me.data?.memberships ?? [];

  return (
    <div className="page-enter mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-8 sm:py-14">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logout.mutate(undefined, { onSettled: () => location.assign("/login") })}
        >
          Sign out
        </Button>
      </header>

      <main className="mt-14">
        <h1 className="text-2xl font-expanded font-bold sm:text-3xl">Choose a venue</h1>
        <p className="mt-2 text-line-dim">
          Each venue has its own courts, staff and subscription. You can switch any time from the top bar.
        </p>

        {memberships.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="You're not on any venue's staff yet"
              body={
                me.data?.global_roles.includes("super_admin")
                  ? "You're the Super Admin. Open any venue from the admin portal to manage it."
                  : "Ask the venue owner to invite you with this email address, or register a new venue."
              }
              action={
                me.data?.global_roles.includes("super_admin") ? (
                  <a href="/admin/venues" className="font-semibold text-ball underline underline-offset-4">
                    Open the admin portal
                  </a>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul className="mt-10 border-t court-line">
            {memberships.map((m) => (
              <li key={m.club_id} className="border-b court-line">
                <Link
                  to={`/v/${m.club_slug}`}
                  className="group flex items-center justify-between gap-4 px-1 py-5 hover:bg-court-surface"
                >
                  <span className="text-lg font-expanded font-semibold group-hover:text-ball">
                    {m.club_name}
                  </span>
                  <span className="text-sm text-line-dim">{roleLabels[m.role_key]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
