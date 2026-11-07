import { createBrowserRouter } from "react-router";
import { RequireSession, HomeRedirect, SignInRedirect } from "./guards";
import { ClubLayout } from "../layouts/ClubLayout";
import { ClubPickerPage } from "../modules/clubs/ClubPickerPage";
import { TodayPage } from "../modules/today/TodayPage";
import { BookingsPage } from "../modules/bookings/BookingsPage";
import { SubscriptionPage } from "../modules/subscription/SubscriptionPage";
import { NotFoundPage } from "../modules/clubs/NotFoundPage";
import { StylePage } from "../modules/style/StylePage";
import { CourtsPage } from "../modules/courts/CourtsPage";
import { CourtDetailPage } from "../modules/courts/CourtDetailPage";
import { StaffPage } from "../modules/staff/StaffPage";
import { SettingsPage } from "../modules/settings/SettingsPage";
import { OpenPlayPage } from "../modules/open-play/OpenPlayPage";
import { OpenPlaySessionPage } from "../modules/open-play/OpenPlaySessionPage";
import { SessionEditorPage } from "../modules/open-play/SessionEditorPage";
import { PaymentsPage } from "../modules/payments/PaymentsPage";
import { MatchesPage } from "../modules/matches/MatchesPage";
import { TournamentsPage } from "../modules/tournaments/TournamentsPage";

/** Paths below are inside /owner. Everyone signs in on the shared page at /login. */
export const router = createBrowserRouter(
  [
    { path: "/login", element: <SignInRedirect /> },
    { path: "/style", element: <StylePage /> },
    {
      element: <RequireSession />,
      children: [
        { path: "/", element: <HomeRedirect /> },
        { path: "/venues", element: <ClubPickerPage /> },
        {
          path: "/v/:clubSlug",
          element: <ClubLayout />,
          children: [
            { index: true, element: <TodayPage /> },
            { path: "bookings", element: <BookingsPage /> },
            { path: "open-play", element: <OpenPlayPage /> },
            { path: "open-play/new", element: <SessionEditorPage /> },
            { path: "open-play/:sessionId", element: <OpenPlaySessionPage /> },
            { path: "open-play/:sessionId/edit", element: <SessionEditorPage /> },
            { path: "payments", element: <PaymentsPage /> },
            { path: "matches", element: <MatchesPage /> },
            { path: "tournaments", element: <TournamentsPage /> },
            { path: "courts", element: <CourtsPage /> },
            { path: "courts/:courtId", element: <CourtDetailPage /> },
            { path: "staff", element: <StaffPage /> },
            { path: "settings", element: <SettingsPage /> },
            { path: "subscription", element: <SubscriptionPage /> },
          ],
        },
      ],
    },
    { path: "*", element: <NotFoundPage /> },
  ],
  { basename: "/owner" },
);
