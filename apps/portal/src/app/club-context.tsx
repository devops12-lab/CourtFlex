import { createContext, useContext } from "react";
import type { Club, ClubMembershipSummary, Permission } from "@courtflex/api";

export interface ClubContextValue {
  club: Club;
  membership: ClubMembershipSummary;
  /** UI courtesy only. The API enforces every permission again. */
  can: (permission: Permission) => boolean;
  /** The Super Admin managing a venue they aren't on the staff of. */
  superAdmin?: boolean;
}

export const ClubContext = createContext<ClubContextValue | null>(null);

export function useClubContext(): ClubContextValue {
  const value = useContext(ClubContext);
  if (!value) throw new Error("useClubContext must be used inside ClubLayout");
  return value;
}

export const roleLabels: Record<ClubMembershipSummary["role_key"], string> = {
  owner: "Owner",
  manager: "Manager",
  front_desk: "Front desk",
  court_attendant: "Court attendant",
  scorer: "Scorer",
};
