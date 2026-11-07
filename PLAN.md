# Pickleball SaaS — Frontend Build Plan

Source: `pickleball_saas_pwa_system_architecture_build_blueprint.md`
Scope: **frontend UI only** (React + TypeScript). The Laravel API isn't built yet, so every screen runs on a mock API shaped exactly like the blueprint's `/api/v1` contracts. Swapping in the real backend later only changes the base URL.
Theme: **dark mode only**, designed with the `frontend-design` skill.
Reference: PH pickleball booking sites. Since 2026-11-05 we follow that style and flows (landing page, explore courts, booking, join, owner sign-up), kept all-dark, with CourtFlex's own name, logo, wording and images. See §2A and the "Reference refresh" phase.

---

## 1. Blueprint analysis

### What we are building
Three apps on one API:

| App | Users | Form factor | Blueprint § |
|---|---|---|---|
| Player PWA | Players | Mobile-first, installable, works in the browser | 10.2 |
| Club Owner portal | Owners and staff (manager, front desk, attendant, scorer) | Desktop/tablet web | 2.2, 10.1 |
| Super Admin portal | Platform admins | Desktop web | 2.1, 10.1 |

### Rules that shape the UI
These come from the blueprint and change how screens behave, so they're design constraints, not backend trivia:

1. **Booking status and payment status are separate.** Every booking shows two badges, e.g. `Confirmed` and `Unpaid`.
2. **No online payment gateway, and only staff mark a booking paid.** *Changed 2026-11-05:* a venue can offer pay at court, GCash or Maya. For GCash or Maya the player pays in their own app, then uploads a receipt screenshot and reference number; the court is held as Pending until staff approve the receipt (details in the Reference refresh phase, R3). An upload alone never marks a booking paid.
3. **The server decides everything that matters**: price, availability, score, ELO, entitlements. The UI shows server values and never computes them as truth.
4. **Offline never lies.** With no connection, show a banner and disable booking, join, and scoring. A cached slot is not a reservation.
5. **Live Scorer has three states per point**: pending, accepted, official. They must look different.
6. **ELO**: singles and doubles are shown separately. Provisional players get a visible "provisional" marker and no meaningful rank number.
7. **Rankings by place**: barangay → city/municipality → province → country. Global is shown as "coming later" (disabled).
8. **Subscriptions are per club.** Owners with several clubs see a club switcher. Each club shows its own trial countdown and status.
9. **Expired clubs stay readable.** Expired or suspended clubs drop into read-only mode. Nothing disappears.
10. **Permission-aware navigation.** Staff only see what their role allows. Hiding is a courtesy; the backend still enforces.

### Gaps and decisions I'm making (tell me if any are wrong)
- **Product name: CourtFlex** (renamed from Rallix on 2026-11-05; booking codes use the CF- prefix).
- **Words (confirmed 2026-11-05).** A **venue** is a court business run by its owner and staff: courts, bookings, payments, staff, plan. A **club** is a player community, like a guild: members, admins, membership plans, sessions. Venues don't have members; players join clubs and pay the club's membership. Screens and page addresses say venue; the code and API keep the blueprint's name `club` for the venue until the backend is built.
- **One address for everyone (confirmed 2026-11-05).** Players at `/`, the owner portal at `/owner` (`/owner/v/:venue/…`), the Super Admin portal later at `/admin`. One sign-in page at `/login`: owners and staff go to the owner portal, players to `/home`, and a `?next=` address wins. People who are both switch sides from their menu. The two apps stay separate builds so the player app stays small on phones.
- **Build order (confirmed): web first.** Owner portal → Super Admin portal → Player PWA. Every screen is responsive from 360px phones up to desktop.
- **Repo shape.** The blueprint lets us choose. I'll use one pnpm workspace with two apps and shared packages, so there's one design system and one API client:
  ```
  apps/player     → Player PWA (Vite + vite-plugin-pwa)
  apps/portal     → Owner + Super Admin portal (one app, two protected areas)
  packages/ui     → design tokens + components (shared)
  packages/api    → typed API client, TanStack Query hooks, Zod schemas
  packages/mocks  → MSW handlers + seed data from blueprint §7
  ```
- **Stack**: React 19, TypeScript strict, Vite, React Router, TanStack Query, React Hook Form + Zod, Tailwind CSS v4 (driven by our tokens), MSW for mocks, Vitest + Testing Library, Playwright for flows.
- **Maps**: MapLibre with a dark style behind a small adapter, so you can switch to Google Maps or Mapbox later.
- **Language**: English first, structured so Filipino can be added.

---

## 2. Design direction

### Subject and audience
Players in the Philippines booking courts and joining open play on their phones, often at night under floodlights. Club staff running a front desk on a tablet. The main job: **get onto a court fast, and know your standing.**

### Concept: "Night session"
Courts in the PH are often played after dark, under lights, on blue and green acrylic. The UI is that court: a deep court-blue surface (not black), crisp white lines as the only structure, and ball-yellow reserved for the moment that counts: your slot, your point, your rank.

**Court lines as the structural system.** Dividers, selected states, and section breaks are drawn like court markings: 2px white lines with the kitchen (non-volley zone) proportion used for key layouts. This is the one bold idea. Everything else stays quiet.

### Color tokens
| Token | Hex | Use |
|---|---|---|
| `court-deep` | `#0F1B2D` | App background (night court blue) |
| `court-surface` | `#17283F` | Raised surfaces, sheets |
| `court-outer` | `#1E4D45` | Secondary surface (the green outer court): open play, "available" |
| `line` | `#E9EEF4` | Primary text and court-line dividers |
| `line-dim` | `#8A9BB3` | Secondary text |
| `ball` | `#D9F24A` | Your slot, live point, primary action. Used sparingly |
| `signal-red` | `#FF6B5B` | Errors, disputes, "court taken" |

Status colors use distinct shapes as well as color (outline, filled, or striped) so they work for color-blind users.

### Type
- **Archivo** (variable, width 62–125), one family for everything:
  - Expanded and heavy for big headings ("Find a court tonight")
  - Condensed with tabular figures for scores, ratings, times, and prices. Scores are the type moment: Live Scorer numbers fill the screen.
  - Normal width for body text, 16px on mobile, line length under 70 characters
- Sentence case everywhere. No all-caps eyebrow labels, no `→` on buttons.

### Layout sketches

Player home (mobile):
```
┌──────────────────────────┐
│ Good evening, Jamie      │
│ ┌──────────────────────┐ │  ← next booking drawn as a court
│ │  COURT 2 · 7:00 PM   │ │    (kitchen line splits time/place)
│ │──────────────────────│ │
│ │ Mauban PC   Unpaid ₱400│ │
│ └──────────────────────┘ │
│ Open play near you       │
│  [Sat social 6/8] [...]  │  horizontal scroll
│ Your rating              │
│  Doubles 1,216  ▲16      │
├──────────────────────────┤
│ Home Courts Play Rank Me │  bottom nav (5, per blueprint)
└──────────────────────────┘
```

Court availability (mobile): time slots are a vertical "court strip". Taken slots are struck through with a line, open slots are outlined, and your selection fills ball-yellow.
```
 6:00 ─────────── taken
 7:00 [  open  ₱400 ]
 8:00 [██ yours ₱400██]
 9:00 [  open  ₱350 ]
```

Live Scorer: two halves of a court, tap a side to score.
```
┌────────────┬────────────┐
│   TEAM A   │   TEAM B   │
│     9      │     7      │  giant condensed numerals
│  (tap +1)  │  (tap +1)  │
├────────────┴────────────┤
│ ● official  ◌ pending   │  point state legend
│ Undo last   Game 2 of 3 │
└─────────────────────────┘
```

Owner booking calendar (desktop): courts as columns, time as rows. Each court column is drawn with baseline and kitchen lines, so the grid reads as courts side by side. Walk-in booking opens from any empty cell.

### Principles
1. Lines, not boxes. Separate content with court lines and spacing instead of piles of rounded cards.
2. Yellow means "this is yours or this is live." If everything is yellow, nothing is.
3. Numbers are the hero: scores, ratings, prices, and times get the condensed, tabular treatment.
4. Every important screen has loading, empty, error, offline, and success states written as directions ("No courts open tonight. Try tomorrow or widen to 10 km.").

### Review against generic defaults (what I changed, first pass)
- **First draft** was near-black with a single neon-green accent. That's a stock "dark sports app" look. **Revised** to a court-blue base with a green secondary surface taken from real court colors, and yellow limited to "yours or live".
- **First draft** used a rounded card for every list item. That's the SaaS card kit. **Revised** to line-separated rows and court-line framing. Cards only appear for the next booking and open play sessions, where a ticket-like object makes sense.
- **Dropped** the numbered 01/02/03 steps the reference site uses for booking. Booking is a real sequence, so it gets a progress line drawn like a court baseline instead.

## 2A. Theme refresh (2026-11-05, replaces parts of §2)

The user asked for the reference style, kept **all dark**. What changes and what stays:

### Color tokens (new values, same token names so screens don't need rewriting)
| Token | Old | New | Use |
|---|---|---|---|
| `court-deep` | `#0F1B2D` | `#001321` | App background, deep navy |
| `court-surface` | `#17283F` | `#07233A` | Cards, sheets, nav |
| `court-raised` | `#1F3350` | `#12395A` | Hover, selected rows, inputs |
| `line-faint` | `#2B4060` | `#1D4466` | Borders, dividers |
| `ball` | `#D9F24A` | `#C5EA13` | Lime: primary actions, your slot, live |
| `ball-ink` | `#1A2400` | `#001321` | Text on lime |
| `court-outer` | `#1E4D45` | kept | Green secondary surface (open play, available) |
| `line`, `line-dim`, signals | | kept, `line-dim` checked for 4.5:1 on the new navy | Text and status |

### Type
- **Inter** (variable) replaces Archivo for everything. Headings extra bold with tight tracking; body regular 16px.
- `font-expanded` now means extra-bold display Inter; `font-condensed` now means tabular figures for times,
  prices and scores. Same utility names, so existing screens pick up the change.

### Shapes
- Buttons, tags, filter chips and segmented controls become pills (fully rounded).
- Venue cards, step cards and sheets get large rounded corners (16-24px). Rows inside lists keep line separators.

### Principles, updated
1. Lime means "do this" or "this is yours or live". One lime button per screen.
2. Cards where the reference uses them (venues, steps, roles, payment options); lines for lists and tables.
3. Numbers stay the hero: times, prices and scores in tabular figures.
4. The booking ticket keeps the court-line drawing: it's the one CourtFlex-only visual.
5. Style and flows follow the reference; name, logo, copy and images are CourtFlex's own.

---

## 3. Build phases (frontend)

Each phase ends with working screens on mock data, responsive down to 360px, keyboard-accessible, with tests.

Status key: `[x]` done, `[~]` partly done (note says what's missing), `[ ]` not started.

### Phase 0 — Foundation (done)
- [x] pnpm workspace, TypeScript strict, Vitest
- [x] ESLint (typescript-eslint, React hooks, jsx-a11y) and Prettier (with Tailwind class sorting). `pnpm lint`, `pnpm format`
- [x] Playwright suite in `e2e/`: walk-in and payment, role and tenant limits, offline, style page. Runs on desktop and phone sizes with the installed Chrome. `pnpm e2e`
- [x] `packages/ui` tokens: CSS variables and Tailwind theme, Archivo variable font with width axis, court-line utility
- [x] `packages/ui` components: Button, Field/Input/Select/Textarea, Sheet (side panel / bottom sheet), Segmented control, Tabs, DataTable, booking/payment/subscription status badges, Toast, Skeleton, EmptyState, ErrorState, OfflineBanner, Wordmark
- [x] Calendar grid and court board: kept in the portal (`apps/portal/src/modules/bookings`) because they depend on booking data; shown on the style page
- [x] `packages/api`: fetch client (cookie auth, XSRF header, `{data, meta, message}` and validation-error shapes), TanStack Query hooks, display formatters
- [x] Zod schemas for every API response, tied to the TypeScript types. A response that doesn't match shows an error instead of bad data
- [x] `packages/mocks`: MSW with blueprint seed data, "slot just taken" conflicts, latency, permission and tenant checks
- [x] Offline: real browser offline and a simulated offline switch (mock API controls) both show the banner and disable booking and payment actions
- [x] Living style page at `/style` showing every token, component and state, plus the mock API controls

### Phase 1 — Player PWA: account and discovery (done)
- [x] Welcome page for signed-out visitors; register (name, email, optional mobile, password rules, terms); sign in; forgot password and reset link (single use, 30 minutes); email verification code with 5 tries and a 60-second resend limit
- [x] Unverified accounts go to verification, and new players to onboarding, before anything else
- [x] Onboarding in three steps: name and level (with descriptions), home location (region → province → city or municipality → barangay, PSGC-style codes), play preferences and profile visibility
- [x] Home: your next game, open play in your city, courts in your city, your clubs
- [x] Explore courts: text search (club, city, province, barangay), "Use my location" only when tapped, distance radius, nearest first, filters for indoor or outdoor, surface, price and amenities; list and map views (MapLibre, free dark basemap, lazy-loaded); clear message and manual search when location is blocked
- [x] Court page: live availability within the club's booking window, rates by time of day, opening hours, closures, amenities, cancellation policy; venue pages link to each court
- [x] Edit profile and home location (a new location needs re-verifying before it counts for rankings)
- [x] PWA: manifest (start URL /home, standalone, theme colors), 192, 512, maskable and Apple icons, app-shell service worker that never caches API responses, "new version" prompt; offline banner as before
- [x] Five more demo venues across Quezon, Metro Manila and Cebu so search and the map have real spread

Notes: the service worker only registers against the real API; with the mock API on, the mock's own worker owns the page (two workers can't share a scope). Booking from the court page is Phase 2.

### Phase 2 — Player PWA: booking (folded into the Reference refresh, step R3)
Written on 2026-11-05 and type-checked, not yet tested. Restyled and finished in R3.
- [x] One booking service in the mock API for player and walk-in bookings (same rules, `source` says which)
- [x] Player booking rules on the server: 1, 1.5 or 2 hours, starts on the hour or half hour, inside the booking window and opening hours, no closures, a player can't hold two bookings at the same time
- [x] Server quote with the price broken down by rate; the booking is refused with `price_changed` if the price moved since the player saw it
- [x] "Slot was just taken" (409 `slot_taken`) with free alternatives: the same time on other courts, then the nearest times on the same court
- [x] Booking review page, confirmation with the booking code drawn on a court, My bookings (upcoming, past, cancelled) with separate booking and payment badges
- [x] Cancel in the app until the club's deadline (new setting, hours before start); refused once paid or too late, with a call-the-venue message
- [x] New club settings in the portal: in-app cancellation deadline and how to pay at the venue
- [x] Home shows a court booking as the next game when it comes first; navigation gains Bookings (phones: Me moves to the top bar)
- [ ] Tests (unit and browser)

### Reference refresh — all-dark style (started 2026-11-05)
Decisions confirmed by the user: all-dark navy and lime; guest booking allowed; booking page matched to screenshots the user will send; pay at court or GCash/Maya with a receipt; build theme and landing first and check in.

**R1. Theme and landing page**
- [x] New tokens, Inter, pill buttons and tags, rounded cards (§2A), applied in `packages/ui` so the player app and the owner portal change together
- [x] Landing page at `/` for signed-out visitors: hero with a drawn booking board, courts by city, booking in three steps, open play and clubs, paying, for court owners, closing call to action, footer. Sections for guest booking, receipt payments and owner sign-up are added when R3, R4 and R6 exist, so the page never advertises something that isn't built
- [x] City links keep their search through sign-in (`/courts?q=Lucban`)
- [x] Header for visitors: Explore courts, How booking works, Open play and clubs, For court owners, Sign in, Join CourtFlex. "Find my booking" is added with guest booking (R4)
- [x] Screenshots on desktop and phone for the user to check before R2

**R2. Explore courts** (done 2026-11-05)
- [x] Search by place or venue (search band with "Discover Courts. Book. Play."), Use my location, popular cities
- [x] Toggle filters: available today, nearby (25 km), indoor or outdoor, price under ₱200 / ₱500 / ₱1,000, surface and amenities under Filters, clear all
- [x] Sort: recommended (bookable first; then nearest with a location, else free today), available soonest, lowest price, highest price
- [x] Grid, list and map views (the map re-fits when its box changes size)
- [x] Venue cards: court drawing or photo, indoor/outdoor tag, "Book online" or "Not bookable yet", open play tag, address, court count, type, next free time today, amenities, "From ₱X/hr", View availability (first court's times; R3 replaces this with the venue booking page) or View venue
- [x] Pages of results (6 a page); filters, sort, view and page live in the address; sidebar to open play, clubs and owner sign-in; courts by city
- [x] Open to visitors: `/courts`, `/courts/:id` and `/venues/:slug` work signed out with the public header; booking asks them to sign in and brings them back
- [x] New venue setting "Take bookings in the app" (`allow_online_booking`); the server refuses bookings when it's off
- [x] Six more sample venues (13 in total) in Calamba, Santa Rosa, Makati, Taguig, Talisay and Sampaloc; two don't take bookings in the app; "Lahug Pickle Club" renamed "Lahug Pickle Hub"
- [x] API: venue results add `bookable`, `next_free_at`, `free_slots_today`; search takes `available_today` and `sort`; court details add `venue.bookable`
- [x] Tests: 4 new unit tests (visitors, sorts, available today, refusal) and new browser tests (search and filter as a visitor, list view with price sort and pages, nearby, location blocked, sign-in before booking)

**R3. Booking flow and payments** (built 2026-11-05; layout taken from the reference booking page, since no screenshots came)
- [x] Venue booking page `/venues/:slug/book`, open to visitors: venue header (photo or court drawing, address, Directions, base rate, courts, booking), steps Schedule → Payment → Review, date strip for the booking window, a grid with one column per court and one row per hour (server prices, booked, unavailable, closed, different-rate marker), pick a start and tap the next hours for up to 3 hours, "Your booking" panel and a sticky bar with the total and Continue. Everything lives in the address, so sign-in brings visitors back to the payment step. `/courts/:id/book` forwards here with the court picked
- [x] Review step: the server's price lines, payment choice, cancellation deadline and policy; "slot just taken" offers other times; a changed price asks to confirm again
- [x] Payment choice from what the venue offers:
  - Pay at court: confirmed straight away, unpaid; staff record payment at the desk
  - GCash or Maya: court held as **Pending** for 30 minutes; the booking page shows a countdown, the venue's account name, number (Copy) and QR, and a receipt upload (image up to 5 MB) with the reference number; no accepted receipt in time frees the court ("Book again")
- [x] Staff check receipts in the portal: "Receipts to check" on Today (refreshes every 30 s) and a receipt panel in each booking; approve makes the booking Confirmed and Paid and adds a payment record with the reference; turning down needs a reason, the player sees it and gets a fresh 30 minutes to send another; staff can switch a booking to pay at court. A receipt waiting to be checked keeps the hold
- [x] A reference number can't be used on two bookings at a venue; receipts are visible only to the player and the venue's staff
- [x] Venue settings "Payments for app bookings": pay at court, GCash, Maya (account name, 11-digit number, QR), require payment before play; checked on save. The leftover venue "Members" setting was removed
- [x] Confirmation with booking code, My bookings, cancel (from Phase 2), with payment and receipt status
- [x] Tests: 11 new unit tests (pay at court, GCash hold, two players one slot, expired hold frees the court, receipt reject → re-upload → approve with payment record, duplicate reference, switch to pay at court, staff-only review, venue payment choices and prepayment, public day grid, settings checks); browser tests for the whole GCash flow through owner approval and for a prepayment-only venue (pass on desktop and phone)
- Fixes after the user's check (2026-11-05): demo data saved in a tab by older code is now detected by a fingerprint of the sample data's shape and thrown away (it had hidden every court); signed-in players no longer see the "List your venue" card; the sign-in check no longer reloads pages for visitors in a loop; "Paid" lines show ₱0.00 instead of "Free"; the approval message shows even though the receipt panel closes
- API: `GET /venues/{slug}/booking-day?date=` (public), `POST /bookings` takes `payment_method`, `POST /bookings/{id}/receipt`, `GET /clubs/{club}/receipts`, `POST /clubs/{club}/bookings/{id}/receipt/approve|reject`, `POST /clubs/{club}/bookings/{id}/pay-at-court`; bookings add `payment_method`, `hold_expires_at`, `receipt`; settings add `booking_payments`; mock control `POST /__mock/age-holds`

**R4. Guest booking** (done 2026-11-05)
- [x] Book without an account: visitors get a "Your details" step (full name, mobile, email; "Have an account? Sign in" keeps their choice); at review "Email me a code to confirm" sends a 6-digit code (10 minutes, 5 tries, one unused code a minute per email) and the booking is made only with it; pay at court, GCash or Maya as for players; one email can't hold two overlapping bookings
- [x] View Bookings (`/find-booking`, in the header and footer; renamed from "Find my booking"): booking code plus email; the same booking page as players (code, GCash/Maya payment with receipt upload, cancel within the deadline); a wrong code or email is "not found", and 10 wrong tries lock that code for 15 minutes; the tab remembers the open booking; the form keeps what was typed
- [x] Venues can turn guest booking off ("Let people book without an account" in Settings; Quezon Sports Courts has it off in the demo, so visitors there sign in); explore cards show "Guest booking"; guest bookings show in the portal as "Guest booking, no account" with name, mobile and email
- [x] API: `POST /guest/code`, `POST /guest/bookings`, `POST /guest/booking` (lookup; email in the body, not the address), `POST /guest/booking/receipt`, `POST /guest/booking/cancel`; `GET /bookings/quote` works for visitors; bookings add `guest_email` and source `guest_web`; settings add `allow_guest_booking`; venue results and the booking day add `guest_booking`. The mock code is always 246810
- [x] Tests: 7 new unit tests (code checks and limits, wrong codes, single-use code, guest details in the portal, overlapping bookings, venue setting, lookup and its lock, GCash receipt and cancel); browser tests for the whole guest flow and a venue that asks visitors to sign in, on desktop and phone
- Also fixed: the site header no longer wraps at laptop widths (landing section links show from 1280 px; the menu has them below that)

**R5. Join**
- [x] Role picker at `/join` (done 2026-11-05): "Pick the path that fits you." with two cards. "I'm here to play" → Create a free account (signed-in players: go to your home), shown first on phones; "I manage a court" → Owner sign in for now (R6 switches it to owner sign-up). "Join CourtFlex" in the header and "New to CourtFlex? Join CourtFlex" on the sign-in page open it; it also points to guest booking. Coaches aren't in the blueprint, so they're left out. Browser tests on desktop and phone

**R6. Owner sign-up** (done 2026-11-06, at `/join/owner`; the Join page's owner card says "Get started as an owner", with "Owner sign in" under it)
- [x] Step 1, venue: name, map pin (tap or drag on the map, or "Use my location"), region to barangay, street or landmark, 1 to 10 courts (trial limit), venue mobile, optional email. Names already on CourtFlex and pins outside the Philippines are refused
- [x] Step 2, owner account: name, email, password, 6-digit email code (10 minutes, 5 tries, one code a minute; mock code 246810). Someone signed in skips it and the venue joins their account
- [x] Step 3, first courts: indoor or outdoor, opening and closing time, hourly rate (₱50 to ₱5,000), applied to every court and editable later. Pay at court is on; GCash and Maya are added in Settings
- [x] Progress saved on the device (never the password or code). The server checks every step again. The venue is created "waiting for CourtFlex approval": hidden from court search and booking, an amber banner in the owner portal, a note on the Plan page. "Approve clubs and venues in review" in the mock controls stands in for the admin portal (Phase 6) and starts the 14-day Pro trial
- [x] Tests: 6 rule tests, browser test of the full flow on desktop and phone

### Phase 3 — Owner portal: club operations (done)
- [x] Login, club picker, club switcher, per-club trial banner
- [x] Club dashboard (Today): court board, up next with "Record payment", collected today, court hours taken
- [x] Booking calendar (courts × time, tap empty time to book), booking details panel with payment and status history. Closed time (outside hours, closures, inactive courts) is drawn and can't be tapped
- [x] Walk-in booking (registered player search or guest), using the shared availability and pricing endpoints
- [x] Record on-site payment (amount, method, reference) with a confirm step; part payments follow club settings
- [x] Refunds and corrections: recorded against a payment with a reason and a confirm step; the original payment is never edited. Owner and manager only
- [x] Cancel booking with a required reason
- [x] Daily collection summary (on the Today page), net of refunds
- [x] Permission-aware navigation for owner, manager and front desk; phones show four tabs plus "More"
- [x] Subscription page: plan, 14-day trial track, what's included with usage, invoices
- [x] Read-only mode: Lucena Dink House (expired) shows its history, but every form is locked and the server refuses changes
- [x] Courts list, add court (plan limit enforced), court details editor; taking a court out of service is refused while it has upcoming bookings
- [x] Opening hours per court and weekday; refused if they'd strand upcoming bookings (the bookings are listed)
- [x] Rates (price rules) per court: every day or one weekday, no overlaps within the same days, one-day rates win
- [x] Closures (holidays, repairs, weather); refused over existing bookings, shown on the calendar
- [x] Club profile and settings: contact details, walk-ins, part payments, booking length step, booking window, cancellation policy, open play rules
- [x] Staff: invite (plan limit counts invites), change role, remove; owner can't be removed or demoted; role descriptions shown

### Phase 4 — Clubs, members and open play (done, details in `PHASE4_CLUBS_OPEN_PLAY.md`)
Scope grew to cover `Club_and_OpenPlay_features.txt`: community clubs alongside venue clubs, membership, a live queue, and a player web app.
- [x] Community clubs: start a club (logo, cover, rules, join policy), CourtFlex review before it goes public, club page with sessions, about and statistics
- [x] Club directory for players: clubs only since 2026-11-05 (venues are under Courts), search, city filter, live tag, member, court and session counts
- [x] Membership for clubs (venue membership removed 2026-11-05): plans (price, length, session discount), join or ask to join, approve or turn down, suspend, reactivate, renew, admins, dues recorded on site, full history
- [x] Open play sessions: venue-run or community-run, several courts, type, level, capacity, fee and member fee, registration deadline, members only; courts reserved through the shared reservation table so nothing overlaps
- [x] Venue approval of community sessions; court fee owed by the community, recorded by venue staff
- [x] Players: browse with level filter and Joined, Hosting and Past tabs; register, cancel within the club's window, waitlist with automatic promotion; no duplicates or overbooking
- [x] Running a session: check-in, no-shows, walk-in players, fees and refunds, all tablet-sized
- [x] Live queue: courts drawn as courts, finish a game and the next four go on automatically, pick players by hand, move up, sit out, recent games; polls every 4 seconds until WebSockets exist
- [x] Payments: one ledger per club for bookings, session fees, dues and court fees, with refunds and a revenue report
- [x] Portal: Open play and Payments pages (the Members page was removed 2026-11-05), open play on the Today page, venue logo, cover, rules, join policy and cancellation window in Settings
- [x] New `apps/player` web app (port 5174) and shared `packages/features` used by both apps
- [ ] Super Admin approval of community clubs (a mock control stands in until Phase 6)

### Phase 5 — Matches, Live Scorer, rankings, tournaments (done 2026-11-07)
Decisions (2026-11-06):
- A competitive result is official when the other side confirms it, or automatically 48 hours after it's submitted with no dispute. The organizer (open play host, venue staff, club owner, tournament organizer) or the Super Admin can verify it right away. A dispute stops it from counting until resolved
- Organizers (open play hosts, venue staff) create matches for their sessions and courts; players can also log their own matches (casual or competitive). Any of them picks a scorer
- Tournament formats first: single elimination, round robin, and pool play then knockout (double elimination later)
- Live updates: screens poll about once a second (the mock can't push); the real backend pushes over WebSockets
- Ratings: start 1200; provisional until 5 rated matches; K-factor 32 while provisional, 24 after; the Super Admin can change these (M5)

- [x] M1. Matches and Live Scorer (built 2026-11-06):
  - Scoring rules as one shared function (packages/api/src/scoring.ts): side-out scoring with doubles servers 1 and 2 and the "0-0-2" start, or rally scoring; games to 11, 15 or 21, win by 2; one game or best of 3 (sides alternate serving first); game point and match point; undo replays the events without the cancelled rally, nothing is deleted
  - Matches: players log their own (they must be in it), open play hosts and venue staff score a queue game from its court ("Score this game"), venue staff can put a match on their courts; singles or doubles, casual or competitive, who serves first, who keeps score
  - Live Scorer (/matches/:id): one big court board, tap a side when it wins a rally; the server's score is official; each tap has its own id, so a retry after a dropped connection never counts twice (Reconnecting note, resent automatically); undo; point history; game and match point; submit the result (competitive results then wait for confirmation, M2)
  - Anyone with the link can watch (no account needed); the board updates every second while live; Share to watch
  - Matches page (desktop menu; Home and Me on phones), Log a match; organizer controls: change the scorer, void with a reason
  - Owner portal: Matches page with the venue's live, upcoming and recent matches; open play courts show the live score
  - Not yet: staff creating a standalone match on a court from the owner portal (comes with the tournament match manager, M4)
- [x] M2. Results and ratings (built 2026-11-06):
  - A competitive result submitted by a player waits for anyone on the other side to confirm it; official automatically 48 hours after submitting with no dispute; organizers who aren't playing (and the Super Admin) can make it official right away; a result submitted by an organizer who isn't playing is official at once; casual results are final at once and never rated
  - Dispute with a reason: the result doesn't count until an organizer who isn't playing, or the Super Admin, makes it official or voids it (the admin dispute queue is M5)
  - Ratings (packages/api/src/rating.ts, version elo-v1): start 1200; doubles use each side's average; K 32 while provisional (under 5 rated matches), 24 after; singles and doubles separate; a ledger of every change; a match is rated once per player
  - Match page: Confirm result, Dispute, Make result official, rating changes; Matches page: Needs your confirmation; stats page (/players/me, /players/:id): singles and doubles ratings with Provisional, record and win rate, last 5, rating-over-time chart (hover or arrow keys, Show as a table), recent matches
  - Demo data: 120 confirmed competitive matches over six weeks at Mauban; better players usually win, so ratings follow skill
  - Fixed: section labels with spaces in their ids (Matches page, Join page) weren't read by screen readers
- [x] M3. Rankings (built 2026-11-06):
  - One rating per player per format, filtered by verified home barangay into barangay, city/municipality, province and country boards (no separate rating per area); global is shown and explains it isn't open yet
  - Ranked: 5 or more confirmed competitive matches, best rating first (ties by matches played); provisional players listed separately with matches to go, never with a position; players with a private profile are left out (except for themselves)
  - Movement since a week ago, worked out from the rating ledger
  - Rankings page (public; players start on their city, visitors on the country; choose another area; the address keeps format, level and area), your position card, top three set apart, links to player stats; stats pages show the player's rank in each home area
  - Not built: stored ranking snapshots (blueprint: location changes mustn't rewrite past standings). Movement is computed from the ledger with current home locations; the backend should snapshot weekly
- [x] M4. Tournaments (built 2026-11-07):
  - Run by a venue's owner or managers, a club's owner or admins (at the club's home venue), or the Super Admin; venue, courts, start, registration close, 4 to 32 entries, entry fee paid at the venue, game rules
  - Registration: one entry per player; doubles pick a partner who isn't entered; withdraw until the draw; stops at capacity and at closing time
  - Start: entries seeded by rating (doubles: the team's average). Single elimination in standard bracket order with byes for the top seeds; round robin by the circle method; pool play by snake seeding, then the top two of each pool go to a knockout (winners and runners-up seeded so no pool's first two meet in the first knockout round)
  - Every draw slot is a real match (category tournament): scored on the Live Scorer, the organizer is the scorer (changeable), submitted by an organizer who isn't playing so official at once, rated like competitive matches; winners move on and the next match is created automatically; a disputed match holds its part of the draw; a voided one gets a fresh match; standings by wins, point difference, points, head to head
  - Pages: Tournaments (public), each tournament (register with partner picker, organizer start and cancel, Draw tab with bracket or standings and matches, Entries tab), Run a tournament; owner portal Tournaments page and New match on a court (finishes the M1 item)
  - Demo: Mauban Doubles Open (taking entries), Lucena Dinkers Singles Round Robin (being played), Saturday Shootout (finished, pools then knockout)
  - Not built: reserving the courts for the tournament day (the form shows which courts are free; book them with the venue), and partner confirmation for doubles entries
- [x] M5. Super Admin competition tools (built 2026-11-07), admin portal > Competition:
  - Disputes: every disputed result, oldest first, with the reason and where it was played; keep the result (official and rated; a tournament winner moves on) or void the match (a tournament gets a fresh match), with a note the players see on the match page; settled disputes listed too; the dashboard counts disputes waiting
  - Reverse an official result: the match is voided and its rating changes undone with compensating ledger entries (nothing deleted; once only); tournament matches that already moved the draw on can't be reversed
  - Rating corrections: find a player, set a singles or doubles rating with a reason; a ledger entry and a corrections list; leaderboards follow
  - Rating rules: starting rating, matches to be ranked, K-factor while provisional and after (no higher than provisional); apply to results from then on; who's ranked updates at once
  - Everything is in the audit log (new Competition filter)
  - Fixed: on phones, screen-reader-only labels inside sideways-scrolling tables made admin pages wider than the screen, pushing bottom sheets partly off it

### Permissions by role (from the product owner, 2026-11-06)

| Feature | Court owner (venue) | Club owner (community club) | Super Admin (owner of the whole system) |
|---|---|---|---|
| Court management | Full | No | Full |
| Court bookings | Full | View and book | Full |
| Create tournaments | Yes | Yes | Yes |
| Manage matches | Own tournaments | Own tournaments | All |
| Live scoring | Assign scorers | Assign scorers | All |
| Rankings | View facility events | View club events | All |
| Manage clubs | No | Own club | All |

The Super Admin is the owner of the whole system (never called "CourtFlex staff" on screen): full access everywhere, including subscriptions, revenue and every user account.

Tournaments, matches, live scoring and rankings follow this in Phase 5. Super Admin "Full/All" for courts, bookings and clubs is built in Phase 6 (A2): staff can manage any venue or club, and those changes are recorded in the audit log.

### Phase 6 — Super Admin portal (separate app at `/admin`, decided 2026-11-06; done 2026-11-06)
- [x] A1. Admin app and dashboard (done 2026-11-06): sign-in sends the Super Admin to `/admin`; review queue, platform numbers, revenue, trials ending, recent admin activity; other accounts are kept out
- [x] A2. Venues and clubs (done 2026-11-06): lists with search (name, city, owner) and status filter; details pages; approve, decline, suspend, reactivate with a confirm step (declining and suspending need a reason the owner sees). Approving a venue starts its 14-day trial once. Suspended venues are hidden from players and view-only for their staff (bookings and payments kept), with a red banner and the reason in the owner portal. "Manage this venue" opens the owner portal with full access and a Super Admin banner; changes made through it are in the audit log. "Manage this club" opens the club's management page. The mock "Approve clubs and venues in review" control now uses the same rules and audit log
  - Note: open play changes the Super Admin makes at a venue aren't in the audit log yet (only venue settings, courts, hours, bookings, payments and staff are)
- [x] A3. Users (done 2026-11-06): search by name, email or mobile; filter by role (Super Admin, venue owner or staff, club admin, player) and status; account page with roles, venues, clubs, player profile and bookings; suspend (reason required) or reactivate; send a password reset link. Suspended accounts can't sign in (they see the reason) and an open session ends. The Super Admin can't be suspended. Everything is in the audit log
- [x] A4. Billing and revenue (built 2026-11-06). Plans and each venue's subscription are now stored (seeded from the sample data) instead of computed, so they can change:
  - Billing > Subscriptions: every venue's plan, status, trial or renewal date and what's owed (overdue first). Extend a trial by 3 to 30 days with a reason (only started trials); change plan (refused if the venue has more courts or staff than the new plan allows; limits apply now, price from the next invoice)
  - Billing > Invoices: record a payment (GCash, Maya, bank transfer need a reference; cash doesn't). Paying the last unpaid invoice of an expired plan makes it active again for a month and lifts read-only. Void an invoice with a reason
  - Billing > Plans: create and edit plans (price, court and staff limits, features); retire a plan (its venues keep it); at least one plan must stay offered
  - Revenue: monthly recurring revenue and yearly rate, paying and trial venues, unpaid and overdue, last 6 months of subscription income (and booking payments at venues for comparison), revenue by plan
  - Every change is in the audit log and the venue's history
- [x] A5. Audit log, announcements and settings (built 2026-11-06):
  - Audit log page: every Super Admin action, newest first, 25 a page; search (what, who, why); filter by venues, clubs, users, billing, plans, announcements, settings; each entry links to what it's about
  - Announcements: title and message for players, venue owners and staff, or everyone; information or warning; optional start and end (Manila time). Shown as a banner in the player app (landing page, visitor pages, signed-in pages) and/or the owner portal; dismissible per device; end early or edit
  - Settings: free trial length (7 to 60 days; used for newly approved venues and in all trial wording across the apps), owner sign-up open or paused (paused: /join/owner explains and sign-up is refused), support email and phone (shown to suspended players, owners of suspended or declined venues, and when sign-up is paused)
  - Fixed while testing (2026-11-06): pages that keep their state in the address (booking steps, court search filters, admin lists) could lose a choice when two changes came quickly (choose GCash, then Continue: the booking fell back to pay at the court). Each change now builds on the current address
  - Not built: a grace period setting. It needs a real billing cycle that issues and chases invoices on a schedule (backend job); the mock data doesn't run one
- Match disputes and ranking adjustments move to Phase 5, built with matches and rankings (decided 2026-11-06)

### Phase 7 — Notifications, profile, polish
- [ ] Notifications center, friends, player profile, privacy, location settings, help/report
- [ ] Tournaments (later-enhancement screens, if wanted)
- [ ] Accessibility pass, reduced motion, Lighthouse PWA audit, Playwright flows for the 12 critical scenarios in blueprint §15.3 that have a UI side

---

## 4. Order of work and first milestone
Web first, so the phase order ran: **0 → 3 (Owner) → 4 → 1 → 2**. From 2026-11-05: **Reference refresh R1 → R6** (R3 finishes Phase 2), then **6 (Super Admin) → 5 → 7**.

**Milestone 1 = Phase 0 + first slice of Phase 3**: Alex signs in to the owner portal, switches between their two clubs, sees today's board at Mauban Pickleball Courts, adds a walk-in on Court 2 at 7 PM, and records ₱400 GCash at the venue. Front-desk staff (Taylor) sign in and see only what their role allows. This proves the design system, the mock API, and the shared booking rules before the rest of the portals.

## 5. Progress

**Milestone 1: done (2026-11-04).** The walk-in → GCash payment flow works end to end on desktop and phone. A browser run checked 6 behaviours: server price shown, Paid after payment, a booked slot is no longer offered, an active club shows no trial banner, front desk sees no Plan link, and front desk is refused the plan page. 11 automated tests cover the booking rules (no overlaps, back-to-back allowed, peak pricing, payment can't exceed balance, booking and payment status separate, role and tenant checks, per-club subscriptions, signed-out requests rejected).

**Phase 0: done (2026-11-04).** Checks: type check, lint and format check are clean; 11 unit tests and 24 browser tests (12 scenarios × desktop and phone) pass.

**Phase 3: done (2026-11-04).** Checks: type check, lint and format check are clean; 30 unit tests and 42 browser tests (21 scenarios × desktop and phone) pass.

Decisions made in Phase 3 that the backend needs to match:
- New permission `adjustOnsitePayment` (owner and manager) for refunds and corrections; the blueprint implies it but doesn't name it
- Opening hours, rates and closures are saved per court. Changes that would strand upcoming bookings return 409 with the bookings listed in `errors.conflicts`
- Hours and rates are replaced as a whole week / whole set (`PUT`), so a save is all-or-nothing
- Plan limits (courts, staff including invites) are enforced by the server with a 403 explaining the limit

**Phase 4: done (2026-11-04).** 47 unit tests (17 new for open play, membership, queue and payments) and the browser suite cover both apps; see the test summary in `PHASE4_CLUBS_OPEN_PLAY.md`.

**Phase 1: done (2026-11-05).** 60 unit tests (13 new for accounts, onboarding, location and discovery) and browser tests for sign-up, password reset, court search with and without location.

**Phase 2: written (2026-11-05), not yet tested.** Folded into the Reference refresh, step R3.

Decisions made on 2026-11-05 that the backend needs to match:
- Booking payment can be pay at court, or GCash/Maya with a receipt upload checked by staff (replaces "on-site only"). Needs receipt storage, a receipt review endpoint for staff and a hold that expires
- Guest bookings without an account, confirmed by an email code
- Owner self sign-up with CourtFlex approval
- New club settings: `player_cancellation_hours`, `payment_instructions`, then payment options, wallet accounts and QR codes, guest booking on or off
- 409 errors can carry `code` and `details` (`slot_taken` with alternatives, `price_changed` with the new total)

**One address and venue wording: done (2026-11-05).**
- Owner portal moved to `/owner` (Vite `base`, router `basename`); in development the player server passes `/owner` through to the portal server, so everything opens at http://localhost:5174. `pnpm dev` starts both; `pnpm build` writes one site with the portal in `dist/owner`
- One sign-in page for everyone; the portal's own sign-in page is gone (`/owner/login` forwards to `/login?next=…`). Demo accounts for players and for owners and staff are listed on it
- Switch links: "Owner portal" on the player's Me page, "Switch to player app" in the portal menu for owners and staff who play
- The player app's offline cache never answers `/owner` or `/admin`
- Demo data is shared for the browser tab: both apps use one mock worker at the site root and save the data to the tab's storage, so a player's booking shows in the owner's calendar. "Reset mock data" starts over for both
- Portal wording: every "club" that meant the venue now says venue (switcher, settings, staff, plan, errors). Members page removed from the portal
- Venues have no members: venue membership plans and members removed from the sample data, the API refuses venue membership requests (404), venue sessions have no member fee or members-only option
- Player app: the Clubs page lists clubs only; venue pages moved to `/venues/:slug` (old `/clubs/venue/…` addresses redirect) with no join button, members or plans
- Checks: type check, lint and format clean; 61 unit tests; browser tests pass on desktop (all specs) and phone (sign-in, roles, venue setup), including 3 new tests for the shared address and shared data

**Club join flow: done (2026-11-05)**, from the user's screenshots. Decisions: membership is paid like court bookings (GCash or Maya with a receipt a club admin checks, or in person); every detail on the form is required, including date of birth, gender and emergency contact; players sign by drawing or by typing their full name.
- Join page `/clubs/community/:slug/join`, four steps: your details (name, email, mobile, date of birth, gender, emergency contact) → pickleball profile (level cards with rating ranges, playing hand, play focus, usual times; pre-filled from the player profile) → membership plan (plan cards with price per period, session discount, included and not-included perks, a Recommended badge) and how you'll pay → the club's membership agreement, "I agree", and a drawn or typed signature
- Membership page `/clubs/community/:slug/membership`: the club's GCash or Maya account (name, number with Copy, QR code) and the amount, receipt screenshot upload with reference number, then "Receipt sent"; a turned-down receipt shows the admin's reason and can be sent again; pay-in-person instructions; pending, active and other states
- Free plan at an open club: in straight away. Free plan at an approval club: waits for an admin. Paid plan: starts when an admin confirms the GCash or Maya receipt (which approves them) or records the in-person payment. A receipt upload never counts as paid by itself
- Club admins (Manage club): membership agreement text and payment accounts (in person, GCash, Maya with account name, 11-digit number and QR, notes) in the club details; perks and Recommended on each plan; "Receipt to check" in the member list; the member sheet shows the receipt, reference and the whole join form with the signature, with "Confirm payment and approve", "Turn down receipt" (reason required) and "Turn down request"
- API: `POST /organizers/community/:id/join` takes the application and payment method, and validates every field (phone formats, age, typed signature must match the name, waiver accepted); `POST /organizers/community/:id/membership/receipt`; member actions `confirm-payment` and `reject-payment`; plans gain `perks` and `recommended`; clubs gain `waiver` and `payment_options`; members gain `application` and `payment`
- Demo data: the venue is now "Mauban Pickleball Courts" (`/owner/v/mauban-pickleball-courts`) and its owner "Alex Venue Owner"; Tara Pikol has three plans with perks and takes GCash, Maya and in person; one applicant's GCash receipt is waiting for Jamie to check
- Checks: type check, lint and format clean; 64 unit tests (3 new for joining); 41 desktop browser tests and the join, open play and address tests on phone, including a new test of the whole join flow through to the admin confirming the receipt

**Logo, loading and motion: done (2026-11-05).**
- The user's logo (`logo/logo.png`) made transparent (`logo/logo-transparent.png`), used everywhere through `Wordmark` (WebP with PNG fallback); the ball alone for compact headers, the favicon and the installed-app icons
- Branded splash in both `index.html` files, drawn before any script loads (no blank page), handed over to an identical `PageLoader` while the session loads, then faded out
- Motion system in `theme.css`, one easing curve: pages settle in on every navigation, landing sections ease in on scroll (`Reveal`), the hero's lines arrive in turn, smooth anchor scrolling, shimmering placeholders, buttons with a press and a soft glow. Reduced motion turns all of it off
- Landing: header deepens once you scroll, phone menu slides open, a soft floodlight glow in the logo's green and gold behind the hero; copy updated for venues and clubs
- Checks: type check, lint and format clean; 64 unit tests; 41 desktop browser tests; build

**Brand colors from the logo: done (2026-11-05).** The user chose to match the UI to the logo: `ball` is now logo gold `#fcbf0e` (main action, yours, live, focus), new `field` is logo green `#00d29a` (confirmed, paid, active, done), and `signal-amber` moved to orange `#ff9440` so warnings never look like gold buttons. Navy surfaces unchanged.

**Sign-in and Create account restyled after the reference login page: done (2026-11-05).** Same structure as the reference (left: eyebrow, big headline, intro, three icon points on a rule; right: rounded card with the logo, "Welcome back", divider, icon labels, rounded inputs, show-password eye, right-aligned "Forgot password?", full-width button, "New to …? Create an account →", "Back to CourtFlex"; two decorative rings), in the navy and logo gold/green theme. The left side hides on phones. The same frame now wraps password recovery, email verification and onboarding (wider card). Demo accounts sit in a fold-out under the sign-in card. Field labels are now "Email address", "Full name" and "Confirm password".

**Mobile pass: done (2026-11-05).** A browser audit opened 35 pages (visitor, player and owner) at 360, 414, 768 and 1024 px and checked sideways scrolling, elements off screen, text spilling out of its box, and tap targets under 32 px. Fixed: session cards forced 360 px phones to scroll sideways (capacity dots and label now wrap; cards can't outgrow their column); text overflow in the club name, the booking page's venue stats and court card stats; tables in the portal and club pages become stacked cards on phones (`DataTable`: first column as the title, other columns as label and value); a `tap` utility gives small text and back links a 44 px tap area below 1024 px without changing their look; bigger map pins and zoom buttons; a 44 px logo link in the portal's phone header; a taller terms checkbox row; session dates no longer break mid-date. After the fixes the audit finds no overflow on any page or width. Checks: type check, lint, format, 86 unit tests, all 92 browser tests on desktop and phone.

**Next, in order:**
1. Reference refresh R1: done (2026-11-05), waiting for the user's review of the screenshots
2. R2 explore courts: done (2026-11-05). R3 booking flow and payments: built (2026-11-05). R4 guest booking: done (2026-11-05). R5 join: done (2026-11-05). R6 owner sign-up: done (2026-11-06). Reference refresh finished. Phase 6 Super Admin: done (2026-11-06). Phase 5 matches, ratings, rankings, tournaments: done (2026-11-07). Next: Phase 7 (notifications, profile, polish)
3. Phase 6: Super Admin portal (includes approving community clubs and new venues)
