import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router";
import { ApiError } from "@courtflex/api";
import { ToastProvider } from "@courtflex/ui";
import { MockControls } from "@courtflex/features";
import { PlayerLayout, PublicOrPlayer, RequirePlayerReady, RequireSession } from "./layout";
import { LoginPage } from "../pages/LoginPage";
import { SessionsPage } from "../pages/SessionsPage";
import { SessionPage } from "../pages/SessionPage";
import { RunSessionPage } from "../pages/RunSessionPage";
import { HostSessionPage } from "../pages/HostSessionPage";
import { ClubsPage } from "../pages/ClubsPage";
import { ClubPage } from "../pages/ClubPage";
import { StartClubPage } from "../pages/StartClubPage";
import { ManageClubPage } from "../pages/ManageClubPage";
import { MePage } from "../pages/MePage";
import { NotFound } from "../pages/NotFound";
import { LandingPage } from "../pages/landing/LandingPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { VerifyPage } from "../pages/auth/VerifyPage";
import { ForgotPasswordPage, ResetPasswordPage } from "../pages/auth/RecoverPages";
import { OnboardingPage } from "../pages/OnboardingPage";
import { HomePage } from "../pages/HomePage";
import { CourtsPage } from "../pages/CourtsPage";
import { CourtPage } from "../pages/CourtPage";
import { EditProfilePage } from "../pages/EditProfilePage";
import { VenueBookingPage } from "../pages/bookings/VenueBookingPage";
import { FindBookingPage } from "../pages/bookings/FindBookingPage";
import { JoinPage } from "../pages/JoinPage";
import { OwnerSignupPage } from "../pages/OwnerSignupPage";
import { MatchPage } from "../pages/matches/MatchPage";
import { MatchesPage, NewMatchPage } from "../pages/matches/MatchesPages";
import { PlayerStatsPage } from "../pages/matches/PlayerStatsPage";
import { RankingsPage } from "../pages/matches/RankingsPage";
import { TournamentPage, TournamentsPage } from "../pages/tournaments/TournamentsPages";
import { NewTournamentPage } from "../pages/tournaments/NewTournamentPage";
import { CourtBookRedirect } from "../pages/bookings/CourtBookRedirect";
import { BookingPage } from "../pages/bookings/BookingPage";
import { MyBookingsPage } from "../pages/bookings/MyBookingsPage";
import { UpdatePrompt } from "./pwa";
import { JoinClubPage } from "../pages/join/JoinClubPage";
import { MembershipPage } from "../pages/join/MembershipPage";

function VenueRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/venues/${slug}`} replace />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        !(error instanceof ApiError && error.status > 0 && error.status < 500) && count < 2,
    },
  },
});

const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  // Open to visitors: explore courts and venues without an account. Booking asks them to sign in.
  {
    element: <PublicOrPlayer />,
    children: [
      { path: "/courts", element: <CourtsPage /> },
      { path: "/courts/:courtId", element: <CourtPage /> },
      { path: "/venues/:slug", element: <ClubPage venue /> },
      { path: "/venues/:slug/book", element: <VenueBookingPage /> },
      { path: "/find-booking", element: <FindBookingPage /> },
      { path: "/join", element: <JoinPage /> },
      { path: "/join/owner", element: <OwnerSignupPage /> },
      // Anyone with the link can watch a match; its scorer scores here.
      { path: "/matches/:matchId", element: <MatchPage /> },
      { path: "/rankings", element: <RankingsPage /> },
      { path: "/tournaments", element: <TournamentsPage /> },
      { path: "/tournaments/new", element: <NewTournamentPage /> },
      { path: "/tournaments/:slug", element: <TournamentPage /> },
      // Old address for booking one court: opens the venue booking page with that court picked.
      { path: "/courts/:courtId/book", element: <CourtBookRedirect /> },
    ],
  },
  {
    element: <RequireSession />,
    children: [
      { path: "/verify", element: <VerifyPage /> },
      { path: "/onboarding", element: <OnboardingPage /> },
      {
        element: <RequirePlayerReady />,
        children: [
          {
            element: <PlayerLayout />,
            children: [
              { path: "/home", element: <HomePage /> },
              { path: "/bookings", element: <MyBookingsPage /> },
              { path: "/bookings/:bookingId", element: <BookingPage /> },
              { path: "/me/profile", element: <EditProfilePage /> },
              { path: "/sessions", element: <SessionsPage /> },
              { path: "/matches", element: <MatchesPage /> },
              { path: "/matches/new", element: <NewMatchPage /> },
              { path: "/players/:playerId", element: <PlayerStatsPage /> },
              { path: "/sessions/new", element: <HostSessionPage /> },
              { path: "/sessions/:sessionId", element: <SessionPage /> },
              { path: "/sessions/:sessionId/run", element: <RunSessionPage /> },
              { path: "/sessions/:sessionId/edit", element: <HostSessionPage /> },
              { path: "/clubs", element: <ClubsPage /> },
              { path: "/clubs/new", element: <StartClubPage /> },
              // Old venue addresses: venues aren't clubs.
              { path: "/clubs/venue/:slug", element: <VenueRedirect /> },
              { path: "/clubs/community/:slug/join", element: <JoinClubPage /> },
              { path: "/clubs/community/:slug/membership", element: <MembershipPage /> },
              { path: "/clubs/:type/:slug", element: <ClubPage /> },
              { path: "/clubs/:type/:slug/manage", element: <ManageClubPage /> },
              { path: "/me", element: <MePage /> },
              { path: "*", element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
        <MockControls />
        <UpdatePrompt />
      </ToastProvider>
    </QueryClientProvider>
  );
}
