# CourtFlex

Pickleball court booking, open play and player clubs for the Philippines. Frontend only for now; see `PLAN.md` for the build plan and `pickleball_saas_pwa_system_architecture_build_blueprint.md` for the full spec.

## Run it

```sh
pnpm install
pnpm dev            # everything at http://localhost:5174 (players at /, owner portal at /owner)
pnpm test           # unit tests: booking rules against the mock API
pnpm e2e            # browser tests in Chrome, desktop and phone sizes
pnpm typecheck
pnpm lint
pnpm format         # Prettier, including Tailwind class order
```

Everyone signs in at http://localhost:5174/login. Court owners and staff go on to the owner portal at `/owner`; players go to `/home`. People who are both switch sides from their menu without signing in again.

The design system is at http://localhost:5174/owner/style. While the mock API is on, a flask button in the bottom-left corner opens controls to simulate offline or reset the sample data.

Note on TypeScript: packages type-check with TypeScript 7. The workspace root aliases `typescript` to `@typescript/typescript6` only so typescript-eslint, which doesn't support TS 7 yet, keeps working.

Demo accounts for the owner portal (password `password`):

| Email | Who |
|---|---|
| owner@example.test | Alex, owner of the venues Mauban Pickleball Courts (trial), Quezon Sports Courts (active Starter plan) and Lucena Dink House (expired, read-only) |
| manager@example.test | Dana, manager at Mauban. Courts, hours, rates, bookings, payments and refunds; no staff, settings or plan |
| staff@example.test | Taylor, front desk at Mauban. Books walk-ins and takes payments; no refunds |

Player demo accounts (same password) are listed on the sign-in page and in `PHASE4_CLUBS_OPEN_PLAY.md`.

## How it's put together

```
apps/portal      Owner portal for court owners and their staff, served at /owner. React + Vite
apps/player      Player web app at / (installable PWA), and the shared sign-in page: sign-up, onboarding, home, court search and map, clubs, open play, hosting
packages/features  Screens shared by both apps: sessions, queue, members, payments
packages/ui      Design tokens ("Night session" dark theme) and shared components
packages/api     Typed API client and TanStack Query hooks for the /api/v1 contracts
packages/mocks   Mock API (MSW) with the blueprint's sample data and booking rules
```

There's no backend yet. Every request is answered by `packages/mocks`, which enforces the same rules the Laravel API must: no overlapping court time, server-side prices, separate booking and payment status, and per-venue permissions. Demo data is kept for the browser tab, so the player app and owner portal see the same bookings; "Reset mock data" in the flask menu starts over.

Words: a **venue** is a court business run by its owner and staff (courts, bookings, payments, plan). A **club** is a player community, like a guild: members, admins, membership plans and sessions. Venues don't have members. In the code and API the venue is still called `club` (the blueprint's name); only the screens and page addresses say venue.

`pnpm build` writes one site to `apps/player/dist`, with the owner portal in `dist/owner`. The host must send unknown paths under `/owner/` to `/owner/index.html`, and the rest to `/index.html`.

To point at a real API, set `VITE_USE_MOCKS=false` and `VITE_API_URL=https://…/api/v1`.

### Endpoints assumed beyond the blueprint
The blueprint's §9 doesn't list these. The Laravel API will need them, or the screens will need adjusting:

- `GET /clubs/{club}/calendar?date=` — courts plus every court reservation for the day (bookings, open play, maintenance)
- `GET /clubs/{club}/reports/daily?date=` — collected money by method, balance still due, court hours booked
- `GET /clubs/{club}/courts/{court}/availability?date=&duration_minutes=` — club-scoped version of the player availability endpoint
- `GET /clubs/{club}/players?search=` — find a player for a walk-in
- `GET /clubs/{club}/bookings/{booking}` — booking detail with payments, adjustments and status history
- `GET /clubs/{club}/courts/{court}` — court with its weekly hours and price rules
- `PUT /clubs/{club}/courts/{court}/hours` — replace the court's weekly hours (the blueprint lists CRUD on `/court-hours`)
- `PUT /clubs/{club}/courts/{court}/price-rules` — replace the court's price rules
- `POST /clubs/{club}/bookings/{booking}/payments/{payment}/adjustments` — refund or correction

Error shape addition: changes blocked by existing bookings return `409` with the affected bookings in `errors.conflicts` (one readable line each).

### Clubs and open play endpoints (Phase 4)
Organizers are either a venue club or a community club, so these routes take `{type}` = `venue` or `community`:

- `GET /discovery/clubs`, `GET /discovery/clubs/{type}/{slug}` — directory and club pages
- `POST /communities`, `PATCH /communities/{id}` — start or edit a community club
- `GET /player/clubs` — the signed-in player's clubs and whether they can host
- `POST /organizers/{type}/{id}/join | leave`; `GET /organizers/{type}/{id}/members[/{member}]`; `POST .../members/{member}/{approve|reject|suspend|reactivate|renew|make-admin|remove-admin|dues}`
- `GET|POST|PATCH /organizers/{type}/{id}/plans[/{plan}]`
- `GET /organizers/{type}/{id}/sessions?when=upcoming|past|pending`, `GET /organizers/{type}/{id}/payments`, `GET /organizers/{type}/{id}/reports/revenue`
- `GET|POST /open-play`, `GET|PATCH /open-play/{session}`, `POST /open-play/{session}/{join|leave|waitlist|cancel|approve|reject}`
- `POST /open-play/{session}/participants`, `POST .../participants/{p}/{check-in|undo-check-in|no-show|remove|payments|refund}`, `POST /open-play/{session}/court-fee`
- `GET /open-play/{session}/queue`, `POST /open-play/{session}/queue/{fill|finish|move|rest}`
- `GET /venues/{venue}/court-options?starts_at&ends_at` — which courts are free for a session
- `GET /players?search=` — find a player to add to a session

The blueprint's `/clubs/{club}/open-play/...` routes are covered by these organizer routes; see `PHASE4_CLUBS_OPEN_PLAY.md` §6.

### Player accounts and discovery endpoints (Phase 1)
- `POST /auth/register`, `POST /auth/verify`, `POST /auth/verify/resend`, `POST /auth/forgot-password`, `POST /auth/reset-password`
- `GET|PATCH /player/profile`, `PATCH /player/location` (blueprint §9.1)
- `GET /geo/regions`, `GET /geo/{provinces|cities|barangays}?parent_id=` — location pickers
- `GET /player/home` — next game and home city
- `GET /discovery/courts?q&lat&lng&radius_km&indoor_outdoor&surface&max_price&amenities` — venues with matching courts, filtered by the server
- `GET /courts/{court}`, `GET /courts/{court}/availability?date&duration_minutes` — public court page and live availability within the booking window

`GET /me` now also returns `email_verified` and `needs_onboarding`. With the mock API, the verification code is 246810 and the password reset page shows the reset link instead of emailing it.
