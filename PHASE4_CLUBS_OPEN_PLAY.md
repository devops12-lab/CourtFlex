# Phase 4 — Clubs, Members and Open Play: analysis and plan


## Decisions (from you)
1. **Both kinds of club.** Venue clubs (the blueprint's tenant: courts, bookings, staff, subscription) stay. **Community clubs** are added: player groups with members, admins and sessions, playing at venues. Both are *organizers*, so members, membership plans and open play sessions work the same for each.
2. **Player side now.** A new `apps/player` web app (mobile first) gets the club directory, club pages, sessions, registration, waitlist, joining clubs, creating a community and hosting. PWA install features stay in Phase 1.
3. **Rotation:** automatic, staff can override. When a court frees up, the four players waiting longest go on it; after the game they rejoin the back of the line. Hosts can pick players manually, move people in the line, or mark them as resting.

How a community session gets courts: it reserves court time at a venue through the same `court_reservations` source as bookings, so overlaps stay impossible. If the venue requires approval, the session waits in the venue's approval queue. The venue sees the court fee due from the host and records it on site.

Shared screens (session card, players and check-in, queue board, members, plans, payments ledger) live in a new `packages/features`, used by both apps.

---

## What the reference site actually does

- **Clubs are communities, not venues.** A club ("Tara Pikol", "Weekend Pickleball Circle") is a group of players with members and sessions. Venues are a separate section, "Find a Court".
- **Club directory:** cards with logo, name, short description, city, member count and a "Live sessions" tag. Search, "near me" with a distance slider, and filters. 58 clubs, paginated.
- **Club page:** header with logo and city, a collapsible "About club" panel, and tabs for Sessions, Members and Statistics. Sessions are split into "Current & upcoming" and "Past".
- **Session card:** club, title, status (Live or Upcoming), date and time, venue, level ("All levels"), number of courts, fee ("Free"), and how many have joined ("8/12 joined").
- **Sessions page:** all sessions across clubs, filtered by level (Unrated, Beginner, Novice, Intermediate, Advanced, Professional), with tabs for Hosted, Joined and Past. Anyone can create a session.
- **Look:** light theme, navy and yellow, rounded white cards. We keep our dark "Night session" design, because you asked for dark mode across the app. The reference shapes the structure, not the colors.

---

## 1. Existing architecture (CourtFlex today)

| Part | What's there |
|---|---|
| Apps | `apps/portal` (club owner and staff web portal). The Super Admin portal and Player PWA aren't built yet |
| Frontend | React 19, TypeScript, Vite, React Router, TanStack Query, Tailwind 4, our `packages/ui` components |
| API | `packages/api`: typed client, Zod-checked responses, hooks for `/api/v1` (Laravel contracts from the blueprint) |
| Backend | Not built. `packages/mocks` (MSW) acts as the API with the blueprint's rules |
| Auth | Sanctum cookie session (mocked). One global user; club roles → permissions; tenant guard on every request |
| Roles | owner, manager, front_desk, court_attendant, scorer (+ super_admin globally) |
| Tests | Vitest (30 rule tests against the mock API), Playwright (42 browser tests, desktop and phone) |

## 2. What we reuse (no duplicates)

| Need in the brief | Already built — reuse it |
|---|---|
| Courts, indoor/outdoor, maintenance status | Courts pages, court status |
| Court schedule, no overlapping bookings | One `court_reservations` source; the calendar already draws open play blocks |
| Operating hours, closures | Per-court hours and closures |
| Club settings, contact info, rules | Club settings page (`allow_player_open_play`, `require_open_play_approval` already exist) |
| Payments, payment history, refunds | On-site payment records and adjustments (refunds and corrections) |
| Club admins | Staff page with roles (the brief's `club_admins`) |
| Reservations, schedule | Bookings calendar and Today page |
| Plan limits | Per-club subscription entitlements (`open_play` feature) |
| Read-only expired clubs, audit-friendly records | Read-only mode; status history on bookings |

**Name clash to avoid:** the blueprint's `club_memberships` table is **staff**. Player membership needs its own table (`club_members` below), not a second meaning for the same table.

## 3. What's missing

1. Player membership of clubs: plans, join requests, approval, status, expiry, dues, history
2. Open play sessions run by the club: multi-court, capacity, skill level, session type, fee, registration deadline
3. Registration, cancellation by club rules, waitlist with automatic promotion, no duplicates or overbooking
4. Live queue: check-in, queue positions, court assignment, rotation, player status, tablet-friendly
5. Payments for session fees and membership dues, plus a club revenue report
6. Club profile media and directory fields: logo, cover image, rules, membership options
7. Player-facing screens: club directory, club page, session browse/register/waitlist, my sessions, join club
8. Club applications and approval, and platform-wide monitoring (Super Admin, Phase 6)
9. Audit log for admin actions

## 4. Proposed database changes (blueprint-aligned)

| Table | Change | Notes |
|---|---|---|
| `clubs` | add `logo_path`, `cover_path`, `rules`, status `rejected` | `pending_review`, `active`, `suspended` already exist |
| `club_membership_plans` | **new**: club_id, name, price, duration_days, perks (session discount %, early registration hours), is_active | |
| `club_members` | **new**: club_id, player_id, plan_id, status (pending, active, expired, suspended, rejected), starts_at, expires_at, decided_by | unique (club_id, player_id) |
| `club_member_events` | **new**: history of joins, approvals, renewals, suspensions with actor and reason | |
| `open_play_sessions` | blueprint table + `session_type`, `registration_deadline`, `members_only`, `host_type` (club or player) | blueprint already has fee, skill range, capacity, approval status |
| `open_play_session_courts` | **new**: session_id, court_id, reservation_id | one `court_reservations` row per court, created in the same transaction |
| `open_play_participants` | blueprint table, statuses: registered, waitlisted, checked_in, cancelled, no_show | unique (session_id, player_id) |
| `open_play_waitlist` | blueprint table (position) | promotion is atomic |
| `open_play_queue_entries` | **new**: session_id, participant_id, position, state (waiting, playing, resting, done), games_played | the live queue |
| rotation games | **reuse `matches`** (blueprint F) as casual matches linked to the session and court | so the Live Scorer and history in Phase 5 pick them up |
| `onsite_payment_records` | add `payable_type` (booking, session_registration, club_membership) + `payable_id` | instead of a separate `club_payments` table |
| `audit_logs` | blueprint table, now written for approvals, suspensions, refunds, role changes | |

## 5. Proposed pages

**Club portal (staff):** new navigation items for Open play, Members and Payments. Bookings stays as Reservations and Schedule; nothing is duplicated.
- **Open play:** upcoming, live and past sessions, plus the approval queue for player-hosted sessions
- **Create or edit session:** courts (several), date, time, capacity, level, type, fee, deadline. Court conflicts are shown before saving
- **Session page:** tabs for Players (registered, waitlist), Check-in, and Queue
- **Live queue board (tablet first):** courts with who's playing, the waiting line, one tap to start or end a game and rotate
- **Members:** directory with search and filters, join requests, member page with history and dues, suspend or reactivate, membership plans
- **Payments:** one ledger for court bookings, session fees and dues, refunds, and a revenue report by type, method and date range
- **Today:** adds today's sessions and member counts
- **Settings:** logo, cover image, rules, membership options

**Player side** (directory, club page, sessions, register, waitlist, my sessions, join club): see question 2 below.

**Super Admin** (club applications, approve or reject, suspend, platform monitoring): Phase 6, already planned.

## 6. API endpoints (additions to `/api/v1`)

```
Club staff
GET    /clubs/{club}/open-play                         list (status, date filters)
POST   /clubs/{club}/open-play                         create (reserves courts atomically)
GET    /clubs/{club}/open-play/{session}               detail with participants, waitlist, queue
PATCH  /clubs/{club}/open-play/{session}               edit
POST   /clubs/{club}/open-play/{session}/cancel        cancel (releases courts, notifies players)
POST   /clubs/{club}/open-play/{session}/approve       blueprint
POST   /clubs/{club}/open-play/{session}/check-in      blueprint
POST   /clubs/{club}/open-play/{session}/participants  add a walk-in player
POST   /clubs/{club}/open-play/{session}/queue/next    fill a free court from the queue
POST   /clubs/{club}/open-play/{session}/games/{game}/finish   end a game, players return to the queue
POST   /clubs/{club}/open-play/{session}/participants/{p}/payments   record the session fee on site
GET    /clubs/{club}/members        POST approve|reject|suspend|reactivate|renew on /members/{member}/...
CRUD   /clubs/{club}/membership-plans
GET    /clubs/{club}/payments       unified ledger;  GET /clubs/{club}/reports/revenue
PATCH  /clubs/{club}                 adds logo, cover, rules

Players
GET    /discovery/clubs   GET /discovery/clubs/{slug}   GET /open-play   GET /open-play/{session}
POST   /open-play/{session}/join | leave | waitlist     (blueprint)
POST   /clubs/{club}/join                                 membership request
GET    /player/open-play   GET /player/clubs
```

Rules the server enforces: no duplicate registration, capacity, and waitlist promotion done atomically. Registration closes at the deadline. Cancellation follows the club's policy. Members-only sessions are checked. Each session court gets a reservation with no overlaps. Fees are recorded on site, with no online gateway, per blueprint §8.5.

Live updates: the blueprint plans WebSockets through Laravel Reverb. Until the backend exists, the queue board polls every few seconds and updates instantly across open tabs.

## 7. Phases and size

| Step | Scope | Size |
|---|---|---|
| 4a | Open play sessions for staff: list, create/edit with multi-court reservation, cancel, approval queue, on calendar | M–L |
| 4b | Registrations, waitlist and promotion, check-in, no-shows, session fees on site | M |
| 4c | Live queue board and court rotation, tablet first | L |
| 4d | Members: join requests, approval, plans, expiry, suspend/reactivate, history, dues | M |
| 4e | Payments ledger and revenue report (bookings, sessions, dues) | M |
| 4f | Club profile media (logo, cover), rules, membership options in settings; Today additions | S |
| 4g | Player side: directory, club page, sessions, register, waitlist, join | M–L (see question 2) |
| — | Club applications and approval, platform monitoring | Phase 6 |

Each step ships with mock API rules, unit tests for the rules, and browser tests, like Phase 3.


---

## What was built

| Area | Where |
|---|---|
| Types, Zod schemas, hooks | `packages/api/src/open-play-*.ts` |
| Mock API rules and seed data | `packages/mocks/src/open-play-db.ts`, `handlers-open-play.ts` |
| Shared screens | `packages/features`: session card and grid, session form, players and check-in, queue board, members and plans, payments ledger, club card and cover, image picker, mock controls |
| Club portal | Open play (list, approval, session console, create and edit), Members, Payments, Today additions, Settings additions |
| Player app | `apps/player`: sign-in, sessions, session page, run session, host a session, club directory, club page, start a club, manage club, my games |

### Rules enforced by the API (and tested)
- Registration: closes at the deadline; no duplicates; capacity can't be exceeded; full sessions offer the waitlist; leaving promotes the next person in order
- Members-only sessions need an active membership; suspended members can't register; lapsed members pay the full fee
- Cancelling is free until the organizer's cutoff (hours before start); after that the player is told to message the host
- Sessions reserve their courts in the shared reservation table; clashes with bookings, closures, hours or other sessions are refused and named
- Community sessions at venues that require approval stay hidden until approved; turning one down frees the courts
- Queue: only hosts run it; a player can't be on two courts; finishing a game sends all four to the back and starts the next four
- Payments can't exceed what's owed; refunds can't exceed what was collected; front desk can't see the ledger
- A club's members, plans and money are visible only to its own admins or staff

### Demo accounts
| App | Email | Who |
|---|---|---|
| Player (5174) | player1@example.test | Jamie, owner of Tara Pikol Mauban, running tonight's live session |
| Player | carla@example.test | Carla, owner of Lucena Dinkers (approves members) |
| Player | player2@example.test | Sam, owner of Sunrise Paddle Circle (waiting for review) |
| Player | trisha@example.test | Trisha, Tara Pikol member |
| Portal (5173) | owner@example.test | Alex, Mauban owner: approvals, members, payments |

### Known gaps
- Live updates poll every 4 seconds. Laravel Reverb WebSockets replace this when the backend exists.
- Images are sent inline as data URLs until the backend's file storage exists.
- Approving community clubs is a mock control until the Super Admin portal (Phase 6).
- Player registration, onboarding and court booking in the player app are Phases 1 and 2.
