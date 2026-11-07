import { Link, useNavigate } from "react-router";
import { ChevronLeft } from "lucide-react";
import { useCreateCommunity } from "@courtflex/api";
import { useToast } from "@courtflex/ui";
import { CommunityForm } from "./CommunityForm";

export function StartClubPage() {
  const create = useCreateCommunity();
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/clubs"
        className="tap inline-flex items-center gap-1 text-sm font-semibold text-line-dim hover:text-line"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Clubs
      </Link>
      <h1 className="mt-3 text-2xl font-expanded font-bold sm:text-3xl">Start a club</h1>
      <p className="mt-1 max-w-prose text-line-dim">
        For a group that plays together. CourtFlex checks new clubs before they appear in the directory. After
        that you can host sessions at any venue that allows it.
      </p>
      <div className="mt-8">
        <CommunityForm
          pending={create.isPending}
          error={create.error}
          submitLabel="Send for review"
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: (club) => {
                toast({
                  tone: "success",
                  message: `${club.name} is waiting for review. You can set up membership plans while you wait.`,
                });
                navigate(`/clubs/community/${club.slug}`);
              },
            })
          }
        />
      </div>
    </div>
  );
}
