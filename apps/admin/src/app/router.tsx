import { createBrowserRouter } from "react-router";
import { RequireAdmin, SignInRedirect } from "./guards";
import { AdminLayout } from "../layouts/AdminLayout";
import { DashboardPage } from "../modules/dashboard/DashboardPage";
import { NotFoundPage } from "../modules/NotFoundPage";
import { ClubsPage, VenuesPage } from "../modules/orgs/ListPages";
import { ClubDetailPage, VenueDetailPage } from "../modules/orgs/DetailPages";
import { UserDetailPage, UsersPage } from "../modules/users/UsersPages";
import { BillingPage } from "../modules/billing/BillingPage";
import { RevenuePage } from "../modules/revenue/RevenuePage";
import { CompetitionPage } from "../modules/competition/CompetitionPage";
import { AuditLogPage } from "../modules/platform/AuditLogPage";
import { AnnouncementsPage } from "../modules/platform/AnnouncementsPage";
import { SettingsPage } from "../modules/platform/SettingsPage";

/** Paths below are inside /admin. Everyone signs in on the shared page at /login. */
export const router = createBrowserRouter(
  [
    { path: "/login", element: <SignInRedirect /> },
    {
      element: <RequireAdmin />,
      children: [
        {
          element: <AdminLayout />,
          children: [
            { path: "/", element: <DashboardPage /> },
            { path: "/venues", element: <VenuesPage /> },
            { path: "/venues/:id", element: <VenueDetailPage /> },
            { path: "/clubs", element: <ClubsPage /> },
            { path: "/clubs/:id", element: <ClubDetailPage /> },
            { path: "/users", element: <UsersPage /> },
            { path: "/users/:id", element: <UserDetailPage /> },
            { path: "/billing", element: <BillingPage /> },
            { path: "/revenue", element: <RevenuePage /> },
            { path: "/competition", element: <CompetitionPage /> },
            { path: "/audit-log", element: <AuditLogPage /> },
            { path: "/announcements", element: <AnnouncementsPage /> },
            { path: "/settings", element: <SettingsPage /> },
            { path: "*", element: <NotFoundPage /> },
          ],
        },
      ],
    },
  ],
  { basename: "/admin" },
);
