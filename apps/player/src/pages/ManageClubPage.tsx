import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ChevronLeft } from "lucide-react";
import type { ClubProfile, OrganizerType } from "@courtflex/api";
import { useClubProfile, useUpdateCommunity } from "@courtflex/api";
import { ErrorState, Skeleton, Tabs, useToast } from "@courtflex/ui";
import { LedgerPanel, MembersPanel, PlansEditor } from "@courtflex/features";
import { CommunityForm } from "./CommunityForm";
import { NotFound } from "./NotFound";

type Tab = "members" | "plans" | "payments" | "details";

/** Owners and admins run their community club here. Venues are managed in the owner portal (/owner). */
export function ManageClubPage() {
  const { type, slug } = useParams();
  const profile = useClubProfile(type as OrganizerType, slug);
  const [tab, setTab] = useState<Tab>("members");

  if (profile.isPending) return <Skeleton className="mx-auto h-96 max-w-5xl" />;
  if (profile.error) return <ErrorState message={profile.error.message} onRetry={() => profile.refetch()} />;
  const club = profile.data;
  if (club.type === "venue")
    return <NotFound message="Venues are managed by their staff in the CourtFlex owner portal." />;
  if (!club.me.can_manage) return <NotFound message="Only the club's owner and admins can manage it." />;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        to=".."
        relative="path"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {club.name}
      </Link>
      <h1 className="mt-3 text-2xl font-expanded font-bold sm:text-3xl">Manage {club.name}</h1>
      <Tabs
        className="mt-6"
        label="Manage club"
        value={tab}
        onChange={setTab}
        items={[
          { value: "members", label: "Members", count: club.member_count },
          { value: "plans", label: "Membership plans" },
          { value: "payments", label: "Payments" },
          { value: "details", label: "Club details" },
        ]}
      >
        {(t) =>
          t === "members" ? (
            <MembersPanel
              type="community"
              id={club.id}
              canChooseAdmins={club.me.role === "owner"}
              readOnly={false}
            />
          ) : t === "plans" ? (
            <PlansEditor type="community" id={club.id} readOnly={false} />
          ) : t === "payments" ? (
            <LedgerPanel type="community" id={club.id} kinds={["session_fee", "membership_dues"]} />
          ) : (
            <DetailsTab club={club} />
          )
        }
      </Tabs>
    </div>
  );
}

function DetailsTab({ club }: { club: ClubProfile }) {
  const update = useUpdateCommunity(club.id);
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <CommunityForm
      initial={club}
      pending={update.isPending}
      error={update.error}
      submitLabel="Save details"
      onSubmit={(input) =>
        update.mutate(input, {
          onSuccess: (c) => {
            toast({ tone: "success", message: "Club details saved." });
            if (c.slug !== club.slug) navigate(`/clubs/community/${c.slug}/manage`, { replace: true });
          },
        })
      }
    />
  );
}
