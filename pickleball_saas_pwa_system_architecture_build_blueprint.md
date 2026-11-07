# Pickleball SaaS Platform

## Final System Architecture, Database Design, RBAC, and Build Roadmap

**Document type:** Senior System Architecture & Engineering
Specification\
**Product:** Multi-tenant Pickleball Court Booking and Community SaaS\
**Primary roles:** Super Admin, Court / Club Owner, Player\
**Trial:** 14 days per eligible club subscription\
**Initial market:** Philippines\
**Architecture:** Modular monolith, shared relational database,
tenant-isolated club data

------------------------------------------------------------------------

## 1. Finalized Product Decisions

The following decisions are authoritative for this architecture and
should be treated as the baseline for implementation.

  -----------------------------------------------------------------------
  Decision                Final choice            Architectural
                                                  implication
  ----------------------- ----------------------- -----------------------
  Court booking           Both player             One booking engine and
                          self-service and        one availability source
                          owner/staff walk-in     for all booking
                          booking                 channels

  Booking payment         On-site payment         Record amount due and
                                                  payment collected at
                                                  the club; no online
                                                  checkout in the initial
                                                  scope

  Ranking                 ELO                     Competitive ratings are
                                                  calculated from
                                                  verified eligible match
                                                  results

  Player identity         One global player       A player can use any
                          account                 participating club
                                                  without duplicate
                                                  accounts

  Open Play creation      Players can create      Player-created sessions
                          sessions                must follow club rules
                                                  and reserve a real
                                                  court slot

  SaaS subscription       Per club                Each club has its own
                                                  plan, 14-day trial,
                                                  billing lifecycle, and
                                                  entitlements
  -----------------------------------------------------------------------

#
## 1.2 Scope of this document

This is a **development and build specification only**. It covers product modules, database design, tables and sample rows, backend architecture and business logic, API contracts, frontend applications and pages, role permissions, testing and phased implementation.

It intentionally excludes infrastructure provisioning, hosting selection, CI/CD, domain configuration, release management, production deployment, app-store publication and operational deployment runbooks.

### 1.3 Required frontend deliverables

| Interface | Technology | Users | Installation requirement |
|---|---|---|---|
| Super Admin Portal | React + TypeScript web | Super Admin | Browser |
| Club Owner Portal | React + TypeScript web | Court / Club Owner and authorized staff | Browser |
| Player experience | React + TypeScript PWA | Players | Browser; optional Add to Home Screen; no APK/IPA |

### 1.4 Required backend and database deliverables

- Laravel API with versioned endpoints, authentication, authorization, validation, policies, services, jobs/events where appropriate, and API documentation.
- PostgreSQL relational database with migrations, foreign keys, unique constraints, indexes, check constraints, seeders and test factories.
- Explicit tenant isolation for club-owned records and global identity for players.
- Database transactions and concurrency protection for court availability, bookings, Open Play capacity, payment records, match finalization and ELO updates.
- Automated unit, feature, integration and frontend tests.
- No duplicated business rules in frontend clients.


## 1.1 Key product rules

1.  A Court / Club Owner may own or manage multiple clubs, but **each
    club has its own subscription**.
2.  A global user account may have more than one role. For example, a
    person can be a Player and also a Club Owner.
3.  All player profiles are global. Club membership, staff access,
    bookings, and club operations are tenant-scoped.
4.  Player bookings and staff-created walk-in bookings use the same
    booking and court-conflict validation service.
5.  All booking payments are collected on-site and recorded by
    authorized club staff. A booking can be reserved before it is paid,
    subject to the club's booking policy.
6.  Players may create Open Play sessions only at participating clubs
    that allow player-created sessions. A session must obtain a valid
    court reservation and comply with that club's capacity, fee, and
    approval rules.
7.  Only eligible, completed, verified competitive matches affect ELO.
    Casual matches can be recorded in history without changing
    competitive rating.
8.  Barangay, city/municipality, province, and country leaderboards use
    the player's verified home location. Global ranking is designed for
    future activation.
9.  Subscription expiration must never delete a club's data, historical
    bookings, payments, matches, or player records.
10. The backend is the authority for permissions, availability, payment
    records, match state, ELO calculations, and subscription
    entitlements.

------------------------------------------------------------------------

# 2. Product Boundaries and Applications

The platform consists of three role-based experiences backed by one API and one
shared database: Super Admin web portal, Club Owner web portal, and Player mobile-first PWA.

## 2.1 Super Admin Web Portal

Platform-wide administration:

-   Platform dashboard and aggregate metrics
-   User and role administration
-   Club review, approval, suspension, and reactivation
-   Subscription plan and per-club subscription management
-   Trial extension with reason and audit record
-   Platform-wide booking and Open Play monitoring
-   Match dispute review and ranking correction workflows
-   Geographic ranking configuration
-   Reports, announcements, system settings, and audit logs

## 2.2 Court / Club Owner Web Portal

Tenant management:

-   Club profile and public listing
-   Courts, court types, amenities, pricing, operating hours, and
    closures
-   Booking calendar and walk-in bookings
-   On-site payment recording and reconciliation
-   Open Play settings, sessions, participants, and check-in
-   Match scheduling, scorer assignment, and match result review
-   Club tournaments
-   Staff accounts and permission assignments
-   Club reports and activity logs
-   Per-club subscription, trial, invoices, and plan usage

## 2.3 Player Mobile-First Progressive Web Application (PWA)

Player experience:

-   Global account registration and profile
-   Home location and playing preferences
-   Nearby court discovery and manual location search
-   Court details, availability, and booking
-   Upcoming, completed, and cancelled bookings
-   On-site payment instructions and booking reference
-   Player-created Open Play sessions at eligible clubs
-   Join, leave, waitlist, and check-in
-   Match invitations, match participation, and Live Scorer
-   Recent plays, match history, and statistics
-   Barangay, city/municipality, province, and country rankings
-   Friends, notifications, reports, and privacy settings

------------------------------------------------------------------------

# 3. Recommended Technical Architecture

  -----------------------------------------------------------------------
  Layer                   Recommended technology  Responsibility
  ----------------------- ----------------------- -----------------------
  Backend                 Laravel 13              REST API, domain logic,
                                                  authentication,
                                                  authorization

  Web frontend            React + TypeScript      Super Admin and Club
                                                  Owner portals

  Player frontend         React + TypeScript PWA  Mobile-first browser experience

  Database                PostgreSQL              Relational
                                                  transactional source of
                                                  truth

  Authentication          Laravel Sanctum        Secure browser SPA
                          with cookie-based       authentication and
                          session authentication  CSRF protection      

  Real-time               Laravel Reverb /        Live scoring and live
                          WebSockets              session updates

  Cache and queues        Redis                   Cache, queue
                                                  coordination, temporary
                                                  locks, rate limiting

  Maps                    Google Maps or Mapbox   Court maps, geocoding,
                                                  nearby search

  Push notifications      Web Push API            Browser push where
                                                  supported; in-app
                                                  notifications baseline

  File storage            Laravel filesystem      Profile, club, court,
  abstraction                                     and tournament images
  -----------------------------------------------------------------------

For browser-based Player PWA authentication, prefer Laravel Sanctum's stateful SPA cookie/session model with secure, HTTP-only cookies and CSRF protection; configure trusted frontend origins and session domains deliberately. Do not put long-lived bearer tokens in localStorage. Use a **modular monolith** for the first implementation. Do not begin
with microservices. Organize domains into modules with explicit
services, policies, events, and tests so that modules can be separated
later if justified.

## 3.1 Logical architecture

``` mermaid
flowchart TB
    SA[Super Admin React Portal]
    CO[Court / Club Owner React Portal]
    PL[Player React PWA]

    API[Laravel API Layer]
    AUTH[Authentication and RBAC]
    TENANT[Tenant Context and Isolation]

    subgraph DOMAIN[Application Domain Modules]
      CLUB[Club and Staff]
      COURT[Court and Availability]
      BOOK[Booking and On-site Payments]
      OPEN[Open Play]
      MATCH[Matches and Live Scorer]
      RANK[ELO and Geographic Rankings]
      SUB[Per-Club Subscription]
      NOTIF[Notifications]
      REPORT[Reports and Audit]
    end

    DB[(PostgreSQL)]
    REDIS[(Redis)]
    WS[WebSocket / Reverb]

    SA --> API
    CO --> API
    PL --> API
    API --> AUTH
    API --> TENANT
    TENANT --> DOMAIN
    DOMAIN --> DB
    DOMAIN --> REDIS
    MATCH <--> WS
    OPEN <--> WS
    NOTIF --> REDIS
```

## 3.2 Backend module structure

Suggested Laravel organization:

``` text
app/
├── Modules/
│   ├── Identity/
│   ├── AccessControl/
│   ├── Players/
│   ├── Geography/
│   ├── Clubs/
│   ├── ClubStaff/
│   ├── Courts/
│   ├── Availability/
│   ├── Bookings/
│   ├── OnsitePayments/
│   ├── OpenPlay/
│   ├── Matches/
│   ├── LiveScorer/
│   ├── Rankings/
│   ├── Tournaments/
│   ├── Subscriptions/
│   ├── Notifications/
│   ├── Reports/
│   └── Audit/
├── Policies/
├── Events/
├── Listeners/
├── Jobs/
├── Notifications/
└── Support/
```

Each module should contain its own:

-   Models and relationships
-   Form Requests / validation
-   Actions or application services
-   Policies and authorization rules
-   API Resources / response transformers
-   Events and listeners, where appropriate
-   Tests

Controllers should remain thin. Do not place booking, ELO, subscription,
or scoring business logic directly inside controllers.

------------------------------------------------------------------------

# 4. Multi-Tenant and Identity Architecture

## 4.1 Global identity model

Use one `users` table for all people. Do not create separate
authentication tables for players, owners, and staff.

A user can have:

-   A global Super Admin role, if authorized
-   A Player profile
-   One or more club memberships with club-specific roles

A user may therefore be a player and a club owner at the same time. The
active interface and permissions depend on the selected context.

## 4.2 Tenant model

A club is the tenant boundary. Each club owns its courts, schedules,
bookings, Open Play sessions, staff, and private financial records.

Tenant-owned tables must include `club_id` directly or be connected
through a tenant-owned parent with enforceable authorization.

Every tenant-scoped query must derive the authorized club from the
authenticated user's membership. Never accept an arbitrary frontend
`club_id` as proof of access.

## 4.3 Subscription ownership

A subscription belongs to one club:

``` text
club A -> subscription A
club B -> subscription B
club C -> subscription C
```

A single owner managing three clubs has three separate club
subscriptions. Each subscription has its own plan, trial dates, billing
dates, status, and entitlements.

## 4.4 Global player location

Player location is stored as a selected and, where appropriate, verified
geographic hierarchy:

`country -> region -> province -> city/municipality -> barangay`

Do not use free-text location as the canonical ranking key. Store
standardized geographic IDs. Support location exceptions and
administrative geography changes without losing historical records.

------------------------------------------------------------------------

# 5. Database Design

## 5.1 Database conventions

Recommended conventions:

-   PostgreSQL
-   UUID primary keys for externally referenced entities
-   `created_at` and `updated_at` on mutable business tables
-   `deleted_at` only where soft deletion is appropriate
-   Foreign keys and database constraints for data integrity
-   Numeric/decimal columns for money; never floating-point
-   UTC timestamps in storage; display in the club's configured timezone
-   Explicit status columns with documented allowed values
-   Index all foreign keys and common search/filter columns
-   Preserve financial and scoring event history; avoid destructive
    edits
-   Use database transactions for bookings, payment records, match
    finalization, and rating updates

Suggested money type: `NUMERIC(12,2)` with an explicit currency code,
initially `PHP`.

Suggested ID type: UUID. Use a consistent UUID strategy across all
modules.

## 5.2 Database domains and tables

### A. Identity and access control

  -------------------------------------------------------------------------------
  Table                       Important columns           Purpose
  --------------------------- --------------------------- -----------------------
  `users`                     id, name, email, phone,     Global authentication
                              password, status,           identity
                              email_verified_at,          
                              phone_verified_at           

  `player_profiles`           id, user_id, display_name,  Global player profile
                              avatar_path, birth_date,    
                              gender, home_barangay_id,   
                              preferred_play_level, bio,  
                              visibility                  

  `global_roles`              id, name, description       Platform-level roles
                                                          such as super_admin

  `user_global_roles`         id, user_id,                Assign global roles
                              global_role_id, assigned_by 

  `permissions`               id, key, name, description  Permission catalog

  `role_permissions`          id, role_key, permission_id Permission mapping for
                                                          defined roles

  `club_memberships`          id, club_id, user_id,       Owner and staff
                              role_key, status,           membership per club
                              invited_by, joined_at       

  `player_privacy_settings`   id, player_id,              Player privacy
                              profile_visibility,         preferences
                              match_history_visibility,   
                              allow_friend_requests       

  `player_blocks`             id, blocker_player_id,      Block relationships
                              blocked_player_id,          
                              created_at                  
  -------------------------------------------------------------------------------

`users` must have unique normalized email and/or phone according to the
chosen registration policy. Support account verification and secure
password reset.

### B. Geographic reference data

  -------------------------------------------------------------------------
  Table                     Important columns       Purpose
  ------------------------- ----------------------- -----------------------
  `countries`               id, iso2, iso3, name    Country reference

  `regions`                 id, country_id, code,   Region reference
                            name                    

  `provinces`               id, region_id, code,    Province reference
                            name                    

  `cities_municipalities`   id, province_id, code,  City or municipality
                            name, type              

  `barangays`               id,                     Barangay
                            city_municipality_id,   
                            code, name              
  -------------------------------------------------------------------------

Use standardized Philippine geographic reference codes where available.
Allow geographic reference updates without rewriting historical match
records.

### C. Clubs and facilities

  -----------------------------------------------------------------------------------
  Table                         Important columns             Purpose
  ----------------------------- ----------------------------- -----------------------
  `clubs`                       id, owner_user_id, name,      Tenant and public club
                                slug, description,            profile
                                contact_phone, contact_email, 
                                address, barangay_id,         
                                latitude, longitude,          
                                timezone, status              

  `club_settings`               id, club_id, booking_policy,  Club-specific operating
                                cancellation_policy,          rules
                                allow_player_open_play,       
                                require_open_play_approval,   
                                allow_walk_ins,               
                                default_slot_minutes,         
                                booking_window_days           

  `club_amenities`              id, club_id, name,            Club amenities
                                description                   

  `club_images`                 id, club_id, file_path,       Club gallery
                                sort_order                    

  `courts`                      id, club_id, name,            Physical court
                                court_code, court_type,       
                                surface_type, indoor_outdoor, 
                                capacity, base_price,         
                                currency, status              

  `court_amenities`             id, court_id, amenity_name    Court-specific
                                                              amenities

  `court_operating_hours`       id, court_id, weekday,        Recurring schedule
                                opens_at, closes_at,          
                                is_closed                     

  `court_schedule_exceptions`   id, court_id, starts_at,      Holidays, closures,
                                ends_at, exception_type,      special hours
                                reason                        

  `court_price_rules`           id, court_id, day_of_week,    Time/day pricing
                                starts_at, ends_at, price,    
                                currency                      

  `court_reservations`          id, club_id, court_id,        Shared court occupancy
                                reservation_type, starts_at,  record
                                ends_at, status, created_by   
  -----------------------------------------------------------------------------------

`court_reservations` is important: ordinary bookings, Open Play
sessions, and maintenance blocks must use the same court occupancy
source. This prevents one feature from reserving a court already
occupied by another feature.

Reservation types:

-   `booking`
-   `open_play`
-   `maintenance`
-   `private_event`

Reservation statuses:

-   `held`
-   `confirmed`
-   `active`
-   `cancelled`
-   `expired`
-   `completed`

Only occupancy statuses such as `held`, `confirmed`, and `active` should
block a court, subject to the configured hold-expiration rules.

### D. Booking and on-site payment

  --------------------------------------------------------------------------------
  Table                            Important columns       Purpose
  -------------------------------- ----------------------- -----------------------
  `bookings`                       id, club_id, court_id,  Player or walk-in
                                   reservation_id,         booking
                                   player_id,              
                                   booking_code, source,   
                                   starts_at, ends_at,     
                                   status, subtotal,       
                                   discount, total,        
                                   currency, notes,        
                                   created_by              

  `booking_participants`           id, booking_id,         Additional players on a
                                   player_id,              reservation
                                   participant_status      

  `booking_status_history`         id, booking_id,         Booking status audit
                                   old_status, new_status, 
                                   changed_by, reason      

  `booking_cancellation_records`   id, booking_id,         Cancellation details
                                   cancelled_by, reason,   
                                   refund_due,             
                                   cancelled_at            

  `onsite_payment_records`         id, club_id,            On-site collection
                                   booking_id, amount,     record
                                   currency, method,       
                                   status,                 
                                   reference_number,       
                                   received_by,            
                                   received_at             

  `payment_adjustments`            id, payment_record_id,  Refund, correction, or
                                   amount,                 reversal record
                                   adjustment_type,        
                                   reason, approved_by     
  --------------------------------------------------------------------------------

Booking source:

-   `player_app`
-   `staff_walk_in`
-   `owner_created`

Booking statuses:

-   `pending`
-   `confirmed`
-   `cancelled`
-   `expired`
-   `completed`
-   `no_show`

On-site payment methods may include `cash`, `gcash_at_venue`,
`maya_at_venue`, `card_at_venue`, and `other`. These are records of
payment collected by the club, not online payment processing or
automatic verification.

Payment statuses:

-   `unpaid`
-   `partially_paid`
-   `paid`
-   `refunded`
-   `voided`

Do not mark a booking paid merely because a player selected a payment
method. Only an authorized staff member may record a collection, subject
to the club's permissions and audit requirements.

### E. Open Play

  ----------------------------------------------------------------------------
  Table                        Important columns       Purpose
  ---------------------------- ----------------------- -----------------------
  `open_play_sessions`         id, club_id,            Open Play session
                               reservation_id,         
                               host_player_id, title,  
                               description, starts_at, 
                               ends_at, skill_min,     
                               skill_max, format,      
                               max_players,            
                               fee_per_player,         
                               currency,               
                               approval_status, status 

  `open_play_participants`     id, session_id,         Participant
                               player_id, status,      registration
                               joined_at,              
                               checked_in_at,          
                               fee_status              

  `open_play_waitlist`         id, session_id,         Waitlist
                               player_id, position,    
                               status, created_at      

  `open_play_invitations`      id, session_id,         Optional private
                               invited_player_id,      invitations
                               invited_by, status      

  `open_play_session_events`   id, session_id,         Session audit/activity
                               event_type,             
                               actor_user_id, payload, 
                               created_at              
  ----------------------------------------------------------------------------

Open Play formats:

-   `social`
-   `competitive`
-   `beginner`
-   `round_robin`
-   `king_of_the_court`
-   `mixed_doubles`
-   `custom`

Session statuses:

-   `draft`
-   `pending_approval`
-   `published`
-   `full`
-   `in_progress`
-   `completed`
-   `cancelled`

Participant statuses:

-   `requested`
-   `confirmed`
-   `waitlisted`
-   `cancelled`
-   `checked_in`
-   `no_show`

#### Player-created Open Play rules

1.  A player may create a session only at a club that enables
    `allow_player_open_play`.
2.  The selected court and time must be available.
3.  Creating a session must create or confirm a `court_reservations`
    record in the same transaction.
4.  If `require_open_play_approval` is enabled, the session remains
    `pending_approval` and is not publicly joinable until approved.
5.  The club defines permitted session durations, capacity limits,
    cancellation rules, and whether the host pays the court fee or
    participants share it.
6.  A player-created session must never bypass club pricing or facility
    rules.
7.  The host is responsible for session administration but cannot alter
    official club financial records.
8.  If the session is cancelled, the reservation must be released safely
    and all participants notified.
9.  Prevent a player from joining the same session more than once.
10. Enforce capacity and waitlist promotion atomically to prevent
    overbooking.

### F. Matches and Live Scorer

  ------------------------------------------------------------------------------
  Table                          Important columns       Purpose
  ------------------------------ ----------------------- -----------------------
  `matches`                      id, club_id, court_id,  Match header
                                 open_play_session_id,   
                                 tournament_id,          
                                 match_type,             
                                 play_category, format,  
                                 status, scheduled_at,   
                                 started_at, ended_at,   
                                 created_by,             
                                 scorer_user_id          

  `match_teams`                  id, match_id,           Team A or Team B
                                 team_number, team_name  

  `match_players`                id, match_id, team_id,  Player/team assignment
                                 player_id,              
                                 player_position,        
                                 confirmation_status     

  `match_games`                  id, match_id,           Game/set score summary
                                 game_number,            
                                 target_points, win_by,  
                                 team_a_score,           
                                 team_b_score,           
                                 winner_team_id, status  

  `score_events`                 id, match_id, game_id,  Immutable scoring event
                                 event_number,           log
                                 event_uuid, team_id,    
                                 point_value,            
                                 score_a_after,          
                                 score_b_after,          
                                 scorer_user_id,         
                                 event_type, created_at  

  `match_results`                id, match_id,           Result summary
                                 winning_team_id,        
                                 final_score,            
                                 verification_status,    
                                 submitted_by,           
                                 verified_at             

  `match_result_confirmations`   id, match_id,           Player confirmation
                                 player_id, response,    
                                 responded_at, note      

  `match_disputes`               id, match_id,           Dispute workflow
                                 reported_by, reason,    
                                 status, reviewed_by,    
                                 resolution, resolved_at 

  `match_status_history`         id, match_id,           Match audit
                                 old_status, new_status, 
                                 changed_by, reason      
  ------------------------------------------------------------------------------

Match types:

-   `singles`
-   `doubles`

Play categories:

-   `casual`
-   `competitive`
-   `tournament`

Match statuses:

-   `scheduled`
-   `in_progress`
-   `awaiting_confirmation`
-   `completed`
-   `disputed`
-   `voided`

Verification statuses:

-   `pending`
-   `confirmed`
-   `disputed`
-   `verified`
-   `rejected`

#### Live Scorer rules

-   The backend owns the official score state.
-   Every scoring action creates a unique `score_events` record.
-   A unique `event_uuid` prevents duplicate point submissions after
    retries or reconnection.
-   The server validates match status, scorer authorization, game rules,
    and event sequence.
-   Undo must create a compensating event or a traceable correction; do
    not delete the original scoring event.
-   Reconnecting clients fetch the latest authoritative score and
    missing events.
-   Only an authorized scorer, organizer, or explicitly permitted player
    may score.
-   A match must not update ELO until the result reaches the required
    verified state.
-   Score corrections after verification require an audited dispute or
    correction workflow.

### G. ELO ratings and geographic rankings

  ------------------------------------------------------------------------
  Table                   Important columns        Purpose
  ----------------------- ------------------------ -----------------------
  `rating_profiles`       id, player_id,           Current player rating
                          rating_type,             per format
                          rating_value,            
                          games_played, wins,      
                          losses, provisional,     
                          last_match_at            

  `rating_events`         id, match_id, player_id, Immutable rating ledger
                          rating_type, old_rating, 
                          rating_change,           
                          new_rating,              
                          calculation_version,     
                          created_at               

  `ranking_scopes`        id, scope_type,          Barangay, city,
                          geographic_id,           province, country,
                          is_enabled               future global

  `ranking_snapshots`     id, ranking_scope_id,    Historical leaderboard
                          rating_type, player_id,  position
                          rank_position,           
                          rating_value,            
                          games_played,            
                          snapshot_at              

  `ranking_rules`         id, rating_type,         ELO configuration
                          initial_rating,          
                          k_factor,                
                          minimum_matches,         
                          provisional_threshold,   
                          is_active                

  `ranking_adjustments`   id, player_id,           Audited administrative
                          rating_type, old_rating, correction
                          new_rating, reason,      
                          approved_by, created_at  
  ------------------------------------------------------------------------

Rating types should initially include:

-   `singles`
-   `doubles`

Do not mix singles and doubles ratings into one rating pool.

#### ELO rules

1.  Use a documented ELO formula and version the calculation.
2.  Only verified competitive matches are eligible.
3.  Casual matches do not change ELO.
4.  For doubles, calculate expected result from the two teams' rating
    averages or another documented team-rating method, then apply a
    consistent change to eligible participants.
5.  Apply rating changes in one database transaction after result
    verification.
6.  Prevent duplicate rating processing with a unique constraint on
    match, player, and rating type.
7.  Keep a rating ledger so a result can be audited and, when necessary,
    reversed through compensating events.
8.  Mark players provisional until they meet the minimum qualifying
    match count.
9.  Configure minimum matches, K-factor, initial rating, and inactivity
    policy centrally.
10. Do not expose a rank position as meaningful when the player does not
    meet the eligibility threshold.

#### Geographic ranking model

Use the player's verified home geography to determine leaderboard
membership:

-   Barangay
-   City / Municipality
-   Province
-   Country
-   Global (future, disabled initially)

The same rating within a rating type is filtered into each applicable
geographic leaderboard. Do not create a separate ELO rating for every
barangay or province. This preserves one coherent player rating while
allowing local leaderboards.

A player's location change must not silently rewrite historical
leaderboard snapshots. New snapshots should use the current verified
location, while past snapshots retain the scope used at the time they
were created.

Global ranking should be represented in the schema but disabled until
international geographic coverage, verification, and ranking policies
are ready.

### H. SaaS subscription and billing

  ------------------------------------------------------------------------------------
  Table                            Important columns           Purpose
  -------------------------------- --------------------------- -----------------------
  `subscription_plans`             id, name, code,             Plan catalog
                                   description, price,         
                                   currency, billing_interval, 
                                   is_active                   

  `plan_features`                  id, plan_id, feature_key,   Plan feature limits
                                   feature_value               

  `club_subscriptions`             id, club_id, plan_id,       Per-club subscription
                                   status, trial_starts_at,    
                                   trial_ends_at,              
                                   current_period_starts_at,   
                                   current_period_ends_at,     
                                   cancelled_at                

  `subscription_invoices`          id, subscription_id,        Billing record
                                   invoice_number, amount,     
                                   currency, status,           
                                   issued_at, due_at, paid_at  

  `subscription_payment_records`   id, invoice_id, amount,     Subscription payment
                                   currency, payment_method,   record
                                   reference_number, status,   
                                   received_by, received_at    

  `subscription_events`            id, subscription_id,        Subscription audit
                                   event_type, old_status,     
                                   new_status, reason,         
                                   actor_user_id, occurred_at  

  `subscription_entitlements`      id, subscription_id,        Effective feature
                                   feature_key, limit_value,   limits
                                   effective_from,             
                                   effective_until             
  ------------------------------------------------------------------------------------

Each club gets its own 14-day trial when it becomes eligible and
activates the trial. The server generates the trial start and end
timestamps. Trial eligibility must be protected against duplicate trial
abuse.

Suggested subscription statuses:

-   `trialing`
-   `active`
-   `past_due`
-   `grace_period`
-   `cancelled`
-   `expired`
-   `suspended`

Subscription rules:

-   The trial lasts exactly 14 days from the server-recorded start
    timestamp.
-   Reminders can be sent 7 days, 3 days, and 1 day before trial
    expiration.
-   A trial extension requires Super Admin permission, a reason, and an
    audit event.
-   A club subscription is independent of subscriptions belonging to the
    same owner's other clubs.
-   Cancellation does not immediately remove access if the paid period
    remains active.
-   Grace-period behavior must be configurable and clearly communicated.
-   Expired or suspended clubs retain historical data.
-   Restrict new management actions after expiration according to the
    product policy; preserve read-only access to essential historical
    records where appropriate.
-   Entitlements must be checked by backend middleware/services, not
    only by frontend plan labels.

Because booking payment is on-site, the initial booking flow does not
require an online payment gateway. Subscription payment collection is a
separate SaaS billing concern and can be recorded through the selected
administrative billing process.

### I. Notifications, social, reporting, and audit

  ----------------------------------------------------------------------------
  Table                        Important columns       Purpose
  ---------------------------- ----------------------- -----------------------
  `notifications`              id, user_id, type,      In-app notifications
                               title, body, data,      
                               read_at, created_at     

  `notification_devices`       id, user_id,            Push notification
                               device_token, platform, devices
                               last_seen_at            

  `notification_preferences`   id, user_id,            Notification
                               notification_type,      preferences
                               in_app_enabled,         
                               push_enabled,           
                               email_enabled           

  `friendships`                id,                     Player connections
                               requester_player_id,    
                               addressee_player_id,    
                               status, created_at      

  `player_reports`             id, reporter_player_id, Player safety reports
                               reported_player_id,     
                               category, description,  
                               status, reviewed_by     

  `audit_logs`                 id, actor_user_id,      Sensitive action audit
                               club_id, action,        
                               subject_type,           
                               subject_id,             
                               before_data,            
                               after_data, ip_address, 
                               created_at              

  `activity_logs`              id, actor_user_id,      Operational activity
                               club_id, activity_type, history
                               description, metadata,  
                               created_at              
  ----------------------------------------------------------------------------

Avoid storing unnecessary sensitive information in logs. Restrict
audit-log access and define retention policies.

------------------------------------------------------------------------

# 6. Entity Relationship Diagram

The following ERD shows the primary relationships. It is a logical
overview; the detailed table definitions above remain authoritative.

``` mermaid
erDiagram
    USERS ||--o| PLAYER_PROFILES : has
    USERS ||--o{ USER_GLOBAL_ROLES : assigned
    GLOBAL_ROLES ||--o{ USER_GLOBAL_ROLES : grants
    USERS ||--o{ CLUB_MEMBERSHIPS : joins
    CLUBS ||--o{ CLUB_MEMBERSHIPS : has

    USERS ||--o{ CLUBS : owns
    CLUBS ||--o{ COURTS : contains
    COURTS ||--o{ COURT_RESERVATIONS : occupied_by
    CLUBS ||--o{ COURT_RESERVATIONS : owns

    COURT_RESERVATIONS ||--o| BOOKINGS : supports
    COURT_RESERVATIONS ||--o| OPEN_PLAY_SESSIONS : supports
    CLUBS ||--o{ BOOKINGS : receives
    USERS ||--o{ BOOKINGS : books
    BOOKINGS ||--o{ ONSITE_PAYMENT_RECORDS : paid_by

    USERS ||--o{ OPEN_PLAY_SESSIONS : hosts
    OPEN_PLAY_SESSIONS ||--o{ OPEN_PLAY_PARTICIPANTS : contains
    USERS ||--o{ OPEN_PLAY_PARTICIPANTS : joins
    OPEN_PLAY_SESSIONS ||--o{ OPEN_PLAY_WAITLIST : has

    CLUBS ||--o{ MATCHES : hosts
    MATCHES ||--o{ MATCH_TEAMS : contains
    MATCH_TEAMS ||--o{ MATCH_PLAYERS : includes
    USERS ||--o{ MATCH_PLAYERS : participates
    MATCHES ||--o{ SCORE_EVENTS : records
    MATCHES ||--o| MATCH_RESULTS : concludes
    MATCHES ||--o{ MATCH_DISPUTES : may_have

    USERS ||--o{ RATING_PROFILES : owns
    USERS ||--o{ RATING_EVENTS : receives
    MATCHES ||--o{ RATING_EVENTS : generates
    RANKING_SCOPES ||--o{ RANKING_SNAPSHOTS : contains
    USERS ||--o{ RANKING_SNAPSHOTS : ranked

    CLUBS ||--o| CLUB_SUBSCRIPTIONS : subscribes
    SUBSCRIPTION_PLANS ||--o{ CLUB_SUBSCRIPTIONS : selected
    CLUB_SUBSCRIPTIONS ||--o{ SUBSCRIPTION_INVOICES : billed
    SUBSCRIPTION_INVOICES ||--o{ SUBSCRIPTION_PAYMENT_RECORDS : paid
```

## 6.1 Important relationship constraints

-   `users.email` and normalized phone must be unique when present.
-   `player_profiles.user_id` must be unique.
-   `club_memberships` must have a unique `(club_id, user_id)` pair.
-   A club must have one current subscription record at a time, with
    historical subscription changes retained through events or
    subscription history.
-   A court reservation must belong to the same club as its court.
-   A booking's `club_id`, `court_id`, and `reservation_id` must agree.
-   An Open Play session's reservation must belong to the session's club
    and selected court.
-   A player must not be assigned twice to the same match.
-   A player must not join the same Open Play session more than once.
-   A rating event must be unique for
    `(match_id, player_id, rating_type)`.
-   A score event must have a unique `event_uuid`.
-   Geographic ranking snapshots must have unique
    `(ranking_scope_id, rating_type, player_id, snapshot_at)` or an
    equivalent snapshot-batch key.

## 6.2 Preventing overlapping court reservations

Use a single `court_reservations` table for all court occupancy. Add a
PostgreSQL exclusion constraint using `btree_gist` and a
`tstzrange(starts_at, ends_at, '[)')` range so two active reservations
cannot overlap on the same court.

Conceptual example:

``` sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE court_reservations
ADD CONSTRAINT court_reservations_no_overlap
EXCLUDE USING gist (
    court_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
)
WHERE (status IN ('held', 'confirmed', 'active'));
```

The application must still validate operating hours, court closures,
booking windows, duration limits, and club policies. The database
constraint is the final protection against concurrent overlap.

Use half-open intervals `[start, end)` so a reservation ending at 10:00
and another beginning at 10:00 can coexist.

------------------------------------------------------------------------

# 7. Example Database Rows

The following are illustrative seed/sample records. UUIDs and values are
examples, not production identities.

## 7.1 Users

  id        name              email                  status
  --------- ----------------- ---------------------- --------
  `u-001`   Platform Admin    admin@example.test     active
  `u-002`   Alex Club Owner   owner@example.test     active
  `u-003`   Jamie Player      player1@example.test   active
  `u-004`   Sam Player        player2@example.test   active
  `u-005`   Taylor Staff      staff@example.test     active

## 7.2 Clubs

  id        owner_user_id   name                     status
  --------- --------------- ------------------------ --------
  `c-001`   `u-002`         Mauban Pickleball Club   active
  `c-002`   `u-002`         Quezon Sports Courts     active

The same owner has two clubs. Each club must have a separate
subscription.

## 7.3 Club memberships

  id         club_id   user_id   role_key     status
  ---------- --------- --------- ------------ --------
  `cm-001`   `c-001`   `u-002`   owner        active
  `cm-002`   `c-001`   `u-005`   front_desk   active
  `cm-003`   `c-002`   `u-002`   owner        active

## 7.4 Courts

  id            club_id   name      court_type     base_price currency   status
  ------------- --------- --------- ------------ ------------ ---------- --------
  `court-001`   `c-001`   Court 1   outdoor            300.00 PHP        active
  `court-002`   `c-001`   Court 2   indoor             400.00 PHP        active
  `court-003`   `c-002`   Court A   outdoor            250.00 PHP        active

## 7.5 Club subscriptions

  --------------------------------------------------------------------------------------
  id          club_id     plan_id          status      trial_starts_at   trial_ends_at
  ----------- ----------- ---------------- ----------- ----------------- ---------------
  `sub-001`   `c-001`     `plan-pro`       trialing    2026-11-04 00:00  2026-11-18
                                                       UTC               00:00 UTC

  `sub-002`   `c-002`     `plan-starter`   active      NULL              NULL
  --------------------------------------------------------------------------------------

The example illustrates per-club subscriptions. In the actual
implementation, timestamps must be generated by the server and stored in
UTC. The exact trial end boundary must be documented and consistently
enforced.

## 7.6 Bookings

  -----------------------------------------------------------------------------------------
  id           club_id   court_id      player_id   source          status             total
  ------------ --------- ------------- ----------- --------------- ----------- ------------
  `book-001`   `c-001`   `court-001`   `u-003`     player_app      confirmed         300.00

  `book-002`   `c-001`   `court-002`   `u-004`     staff_walk_in   confirmed         400.00
  -----------------------------------------------------------------------------------------

## 7.7 On-site payment records

  id          booking_id     amount method           status   received_by
  ----------- ------------ -------- ---------------- -------- -------------
  `pay-001`   `book-001`     300.00 cash             paid     `u-005`
  `pay-002`   `book-002`     400.00 gcash_at_venue   paid     `u-005`

These rows represent payment recorded by club staff at the venue. They
do not represent an online payment gateway transaction.

## 7.8 Open Play

  -------------------------------------------------------------------------------
  id          club_id     host_player_id   title          max_players status
  ----------- ----------- ---------------- ----------- -------------- -----------
  `op-001`    `c-001`     `u-003`          Saturday                 8 published
                                           Social Open                
                                           Play                       

  -------------------------------------------------------------------------------

## 7.9 Match and ELO sample

  match_id      category      status      result
  ------------- ------------- ----------- ----------------------
  `match-001`   competitive   completed   Team A 11 - Team B 7

  player_id   rating_type     old_rating   change   new_rating
  ----------- ------------- ------------ -------- ------------
  `u-003`     singles               1200      +16         1216
  `u-004`     singles               1200      -16         1184

This is only an illustrative ELO ledger. The actual result depends on
the configured formula, opponent rating, rating type, and match
verification.

------------------------------------------------------------------------

# 8. Backend Architecture and Business Services

## 8.1 Backend layers

Use these logical layers:

1.  **API layer:** route definitions, controllers, request validation,
    API resources.
2.  **Application layer:** actions/use cases coordinating domain
    operations.
3.  **Domain layer:** booking rules, scoring rules, ELO rules,
    subscription policies.
4.  **Persistence layer:** Eloquent models, repositories where
    justified, database transactions.
5.  **Infrastructure layer:** queues, notifications, WebSockets, maps
    integration, file storage.

Avoid unnecessary repository abstractions around every Eloquent model.
Introduce interfaces where they protect a meaningful boundary or make a
provider replaceable.

## 8.2 Authentication

Requirements:

-   Secure registration, login, logout, password reset, and verification
-   Token/session revocation
-   Rate limiting on authentication endpoints
-   Secure password hashing
-   Account status checks
-   Device/session management
-   Role and active-club context resolution
-   Optional social login in a later phase

The same user identity must work in the Player app and any authorized
Owner/Staff portal.

## 8.3 Authorization

Use policy-based authorization and permission checks.

Examples:

-   `viewClub`
-   `updateClub`
-   `manageCourts`
-   `manageCourtSchedules`
-   `viewBookings`
-   `createWalkInBooking`
-   `recordOnsitePayment`
-   `cancelBooking`
-   `manageOpenPlay`
-   `approvePlayerOpenPlay`
-   `assignMatchScorer`
-   `scoreMatch`
-   `verifyMatchResult`
-   `manageClubStaff`
-   `viewClubReports`
-   `manageClubSubscription`
-   `manageGlobalPlans`
-   `manageGlobalRankings`
-   `reviewMatchDispute`

The backend must check both the permission and the tenant boundary.

## 8.4 Booking service

Recommended application services:

-   `SearchAvailableCourts`
-   `CalculateBookingPrice`
-   `CreatePlayerBooking`
-   `CreateWalkInBooking`
-   `ConfirmBooking`
-   `CancelBooking`
-   `RescheduleBooking`
-   `ExpireUnconfirmedBooking`
-   `RecordOnsitePayment`
-   `ReconcileBookingPayment`

Booking creation must run inside a database transaction:

1.  Resolve authenticated player or staff actor.
2.  Resolve the authorized club and court.
3.  Validate court status and operating hours.
4.  Validate date, time, duration, booking window, and club policy.
5.  Calculate price on the server.
6.  Create court reservation.
7.  Create booking record.
8.  Create status history.
9.  Commit transaction.
10. Dispatch notifications after commit.

If two users try to reserve the same court/time, only one transaction
may succeed. Handle exclusion-constraint conflicts and return a clear
availability error.

Player and walk-in booking must use the same service. The source field
records how the booking was created.

## 8.5 On-site payment service

Initial booking payment behavior:

-   Booking may be confirmed while payment is unpaid if the club policy
    permits.
-   Staff records actual amount collected at the venue.
-   Partial payment is supported only if enabled by the club's policy.
-   Payment method and optional reference number are recorded.
-   Only authorized staff can mark a payment as collected.
-   Corrections and refunds are recorded as adjustments; do not
    overwrite historical collection events.
-   Booking status and payment status remain separate.

## 8.6 Open Play service

Recommended services:

-   `CreatePlayerOpenPlaySession`
-   `ApproveOpenPlaySession`
-   `PublishOpenPlaySession`
-   `JoinOpenPlaySession`
-   `LeaveOpenPlaySession`
-   `PromoteWaitlistedPlayer`
-   `CheckInOpenPlayParticipant`
-   `CancelOpenPlaySession`
-   `GenerateOpenPlayMatches`

Player-created sessions must check club settings, reserve a court,
validate the host, enforce capacity, and apply approval rules.

## 8.7 Match and scoring service

Recommended services:

-   `CreateMatch`
-   `AssignMatchPlayers`
-   `AssignScorer`
-   `StartMatch`
-   `RecordScoreEvent`
-   `UndoScoreEvent`
-   `FinalizeGame`
-   `SubmitMatchResult`
-   `ConfirmMatchResult`
-   `DisputeMatchResult`
-   `VerifyMatchResult`
-   `VoidMatch`

The server must validate scoring transitions and calculate the official
score. WebSocket messages distribute authoritative updates; they do not
replace database persistence.

## 8.8 ELO service

Recommended services:

-   `CalculateExpectedScore`
-   `CalculateRatingChange`
-   `ApplyVerifiedMatchRatings`
-   `ReverseRatingEvents`
-   `BuildRankingSnapshot`
-   `GetPlayerRanking`

Process rating updates idempotently. Use a database transaction and
unique constraints to ensure a verified match is processed once per
player and rating type.

## 8.9 Subscription service

Recommended services:

-   `StartClubTrial`
-   `GetClubEntitlements`
-   `ChangeClubPlan`
-   `RecordSubscriptionPayment`
-   `RenewClubSubscription`
-   `CancelClubSubscription`
-   `ExpireClubSubscription`
-   `ExtendClubTrial`
-   `ApplyGracePeriod`

The subscription guard must resolve the active club and check that
club's subscription. Do not accidentally apply one owner's subscription
to all of their clubs.

------------------------------------------------------------------------

# 9. API Design

Use versioned REST endpoints under `/api/v1`. Return consistent JSON
structures, validation errors, pagination metadata, and appropriate HTTP
status codes.

Suggested response shape:

``` json
{
  "data": {},
  "meta": {},
  "message": "Request completed successfully"
}
```

Validation error shape:

``` json
{
  "message": "The given data was invalid.",
  "errors": {
    "starts_at": ["The selected time is unavailable."]
  }
}
```

## 9.1 Authentication and identity

  Method   Endpoint                         Purpose
  -------- -------------------------------- ----------------------------------
  POST     `/api/v1/auth/register`          Register account
  POST     `/api/v1/auth/login`             Login
  POST     `/api/v1/auth/logout`            Revoke current session
  POST     `/api/v1/auth/forgot-password`   Request reset
  POST     `/api/v1/auth/reset-password`    Reset password
  GET      `/api/v1/me`                     Current user and available roles
  PATCH    `/api/v1/me`                     Update account profile
  GET      `/api/v1/player/profile`         Get player profile
  PATCH    `/api/v1/player/profile`         Update player profile
  PATCH    `/api/v1/player/location`        Update home geography

## 9.2 Super Admin

  -----------------------------------------------------------------------------------------------------------
  Method                  Endpoint                                                    Purpose
  ----------------------- ----------------------------------------------------------- -----------------------
  GET                     `/api/v1/admin/dashboard`                                   Platform metrics

  GET                     `/api/v1/admin/clubs`                                       Search and review clubs

  PATCH                   `/api/v1/admin/clubs/{club}`                                Update club status

  GET                     `/api/v1/admin/users`                                       Search users

  PATCH                   `/api/v1/admin/users/{user}/status`                         Suspend/reactivate user

  CRUD                    `/api/v1/admin/subscription-plans`                          Manage plans

  GET                     `/api/v1/admin/subscriptions`                               View all club
                                                                                      subscriptions

  POST                    `/api/v1/admin/subscriptions/{subscription}/extend-trial`   Extend trial with
                                                                                      reason

  GET                     `/api/v1/admin/match-disputes`                              Review disputes

  POST                    `/api/v1/admin/match-disputes/{dispute}/resolve`            Resolve dispute

  GET                     `/api/v1/admin/rankings`                                    Inspect rankings

  POST                    `/api/v1/admin/ranking-adjustments`                         Audited correction

  GET                     `/api/v1/admin/audit-logs`                                  Review audit records
  -----------------------------------------------------------------------------------------------------------

## 9.3 Club Owner and Staff

Use a selected club context, such as `/api/v1/clubs/{club}`. Every
endpoint must authorize membership and permission.

  -----------------------------------------------------------------------------------------------------
  Method                  Endpoint                                              Purpose
  ----------------------- ----------------------------------------------------- -----------------------
  GET                     `/api/v1/owner/clubs`                                 List clubs accessible
                                                                                to owner

  POST                    `/api/v1/owner/clubs`                                 Create club

  GET                     `/api/v1/clubs/{club}`                                Club details

  PATCH                   `/api/v1/clubs/{club}`                                Update club

  CRUD                    `/api/v1/clubs/{club}/courts`                         Court management

  CRUD                    `/api/v1/clubs/{club}/court-hours`                    Operating hours

  CRUD                    `/api/v1/clubs/{club}/court-exceptions`               Closures and special
                                                                                hours

  GET                     `/api/v1/clubs/{club}/bookings`                       Booking calendar/list

  POST                    `/api/v1/clubs/{club}/bookings/walk-in`               Create walk-in booking

  POST                    `/api/v1/clubs/{club}/bookings/{booking}/cancel`      Cancel booking

  POST                    `/api/v1/clubs/{club}/bookings/{booking}/payments`    Record on-site
                                                                                collection

  CRUD                    `/api/v1/clubs/{club}/staff`                          Staff management

  GET                     `/api/v1/clubs/{club}/open-play`                      List club sessions

  POST                    `/api/v1/clubs/{club}/open-play/{session}/approve`    Approve player session

  POST                    `/api/v1/clubs/{club}/open-play/{session}/check-in`   Check in participant

  GET                     `/api/v1/clubs/{club}/reports`                        Club reports

  GET                     `/api/v1/clubs/{club}/subscription`                   Club subscription

  POST                    `/api/v1/clubs/{club}/subscription/change-plan`       Change plan
  -----------------------------------------------------------------------------------------------------

## 9.4 Player discovery and booking

  Method   Endpoint                                Purpose
  -------- --------------------------------------- -----------------------
  GET      `/api/v1/discovery/clubs`               Search clubs
  GET      `/api/v1/discovery/courts`              Search courts
  GET      `/api/v1/courts/{court}`                Court detail
  GET      `/api/v1/courts/{court}/availability`   Available time ranges
  POST     `/api/v1/bookings`                      Create player booking
  GET      `/api/v1/player/bookings`               Player bookings
  GET      `/api/v1/bookings/{booking}`            Booking details
  POST     `/api/v1/bookings/{booking}/cancel`     Cancel booking
  GET      `/api/v1/player/play-history`           Match history
  GET      `/api/v1/player/statistics`             Player statistics

## 9.5 Open Play

  Method   Endpoint                                 Purpose
  -------- ---------------------------------------- -----------------------
  GET      `/api/v1/open-play`                      Discover sessions
  POST     `/api/v1/open-play`                      Create player session
  GET      `/api/v1/open-play/{session}`            Session details
  POST     `/api/v1/open-play/{session}/join`       Join session
  POST     `/api/v1/open-play/{session}/leave`      Leave session
  POST     `/api/v1/open-play/{session}/waitlist`   Join waitlist
  POST     `/api/v1/open-play/{session}/cancel`     Host cancellation
  GET      `/api/v1/player/open-play`               Player's sessions

## 9.6 Matches, Live Scorer, and rankings

  ------------------------------------------------------------------------------------------
  Method                  Endpoint                                   Purpose
  ----------------------- ------------------------------------------ -----------------------
  POST                    `/api/v1/matches`                          Create match

  GET                     `/api/v1/matches/{match}`                  Match details

  POST                    `/api/v1/matches/{match}/start`            Start match

  POST                    `/api/v1/matches/{match}/score-events`     Record point/event

  POST                    `/api/v1/matches/{match}/undo`             Undo through
                                                                     compensating event

  POST                    `/api/v1/matches/{match}/submit-result`    Submit final result

  POST                    `/api/v1/matches/{match}/confirm-result`   Player confirmation

  POST                    `/api/v1/matches/{match}/dispute`          Dispute result

  GET                     `/api/v1/matches/{match}/events`           Score event history

  GET                     `/api/v1/rankings`                         Geographic leaderboard

  GET                     `/api/v1/player/rankings`                  Player's rank positions

  GET                     `/api/v1/rankings/{scope}`                 Scope-specific
                                                                     leaderboard
  ------------------------------------------------------------------------------------------

------------------------------------------------------------------------

# 10. Frontend Architecture

## 10.1 React web application

Build one React application with separate protected areas for Super
Admin and Club Owner/Staff.

Suggested structure:

``` text
src/
├── app/
│   ├── router/
│   ├── providers/
│   ├── layouts/
│   └── guards/
├── modules/
│   ├── auth/
│   ├── admin-dashboard/
│   ├── users/
│   ├── clubs/
│   ├── subscriptions/
│   ├── plans/
│   ├── courts/
│   ├── availability/
│   ├── bookings/
│   ├── onsite-payments/
│   ├── open-play/
│   ├── matches/
│   ├── tournaments/
│   ├── rankings/
│   ├── reports/
│   ├── staff/
│   └── settings/
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── services/
│   ├── types/
│   ├── utils/
│   └── validation/
└── styles/
```

### Super Admin screens

-   Login and password recovery
-   Dashboard
-   Clubs and club details
-   Users and player profiles
-   Subscription plans
-   Per-club subscriptions
-   Trial management
-   Invoices and subscription payment records
-   Match disputes
-   Ranking configuration and adjustments
-   Platform reports
-   Announcements
-   Global settings
-   Audit logs

### Owner / Staff screens

-   Login
-   Club selector when user has multiple clubs
-   Club dashboard
-   Club profile
-   Court list and court editor
-   Court calendar and operating hours
-   Availability exceptions
-   Booking calendar and booking details
-   Walk-in booking form
-   On-site payment collection form
-   Open Play management
-   Session approval and participant list
-   Check-in interface
-   Match management and Live Scorer
-   Tournament management
-   Staff and permissions
-   Reports
-   Subscription and billing
-   Club settings

### React frontend requirements

-   TypeScript and strict typing
-   Feature-based module structure
-   Protected routes and permission-aware navigation
-   Server state management with a consistent query/cache library
-   Shared API client and error handling
-   Form validation that mirrors backend validation but never replaces
    it
-   Loading, empty, error, and success states
-   Responsive desktop/tablet layouts
-   Accessible controls and keyboard navigation
-   Confirmations for destructive or financially sensitive actions
-   Explicit active-club context
-   No hardcoded subscription entitlements or role assumptions

## 10.2 Player Progressive Web Application (PWA)

**The Player interface MUST be a mobile-first Progressive Web Application. Do not build a native Flutter, React Native, Android, or iOS application for the Player role. Players must access the platform through a mobile browser using a normal HTTPS URL. They must not need to download or install an APK, IPA, or app-store application.**

The PWA may be added to the phone's home screen using the browser's "Add to Home Screen" / "Install" feature, but this is optional. Core player features must remain accessible in the browser even when the player chooses not to install the PWA.

### 10.2.1 Recommended implementation

Use the existing React + TypeScript frontend codebase and create a separate Player PWA experience within it, or create a dedicated React PWA frontend package that consumes the same Laravel API. Choose one approach before implementation and document the decision. Do not create a second business-logic implementation.

Recommended stack:

- React + TypeScript
- Vite
- React Router
- Tailwind CSS or the project's selected design system
- TanStack Query for API/server state
- React Hook Form + Zod for form handling and client-side validation
- Workbox or `vite-plugin-pwa` for service worker and web app manifest
- WebSocket client for live match score updates
- Browser Geolocation API with explicit permission and manual search fallback
- IndexedDB for carefully scoped, non-authoritative client cache and pending UI state
- HTTPS in all non-local environments

### 10.2.2 PWA application structure

```text
player-pwa/
├── public/
│   ├── icons/
│   ├── favicon/
│   └── manifest.webmanifest
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router/
│   │   ├── providers/
│   │   ├── layouts/
│   │   └── route-guards/
│   ├── modules/
│   │   ├── authentication/
│   │   ├── onboarding/
│   │   ├── player-home/
│   │   ├── discovery/
│   │   ├── club-directory/
│   │   ├── court-details/
│   │   ├── availability/
│   │   ├── bookings/
│   │   ├── open-play/
│   │   ├── match-center/
│   │   ├── live-scorer/
│   │   ├── play-history/
│   │   ├── player-statistics/
│   │   ├── rankings/
│   │   ├── notifications/
│   │   ├── friends/
│   │   └── player-profile/
│   ├── shared/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── schemas/
│   │   ├── types/
│   │   ├── utils/
│   │   └── constants/
│   ├── pwa/
│   │   ├── register-service-worker.ts
│   │   ├── update-manager.ts
│   │   └── offline-fallback.tsx
│   ├── styles/
│   └── main.tsx
├── tests/
└── vite.config.ts
```

### 10.2.3 Player PWA pages and routes

| Page | Suggested route | Purpose |
|---|---|---|
| Welcome / landing | `/` | Explain the platform and provide sign-in / registration |
| Register | `/register` | Create one global player account |
| Login | `/login` | Authenticate player |
| Forgot password | `/forgot-password` | Start account recovery |
| Verify account | `/verify` | Complete configured verification flow |
| Onboarding | `/onboarding` | Set display name, profile, home location, skill level and preferences |
| Home | `/home` | Nearby courts, next booking, Open Play suggestions, recent activity and rating summary |
| Explore courts | `/courts` | Search nearby or manually search by barangay, city, province or club |
| Map results | `/courts/map` | Map/list discovery where map provider and permission are available |
| Club details | `/clubs/:clubSlug` | Club information, amenities, location, policies and courts |
| Court details | `/courts/:courtId` | Court description, pricing, rules and available slots |
| Booking review | `/bookings/review` | Confirm court, date, time, duration, player count and price |
| Booking confirmation | `/bookings/:bookingId` | Booking reference, status, onsite payment instructions and cancellation policy |
| My bookings | `/my-bookings` | Upcoming, past, cancelled and no-show bookings |
| Open Play discovery | `/open-play` | Browse sessions with filters for location, date, level and open slots |
| Open Play details | `/open-play/:sessionId` | Session details, host, participants, capacity, fee and join/leave actions |
| Create Open Play | `/open-play/create` | Create a player-hosted session at an eligible club and reserve its court |
| My Open Play | `/my-open-play` | Sessions hosted or joined by the player |
| Match center | `/matches/:matchId` | Match participants, format, status, result and score |
| Live Scorer | `/matches/:matchId/live` | Authorized live score entry and spectator view |
| Recent plays | `/activity` | Chronological recent play activity |
| Match history | `/match-history` | Completed, pending verification and disputed matches |
| Statistics | `/statistics` | Win/loss, match count, recent form and rating movement |
| Rankings | `/rankings` | ELO leaderboards by barangay, city/municipality, province and country |
| Player profile | `/players/:playerId` | Public player profile and permitted statistics |
| Notifications | `/notifications` | Booking, Open Play, match and ranking notifications |
| Friends | `/friends` | Player connections and invitations, if enabled |
| Edit profile | `/settings/profile` | Update player information and profile visibility |
| Location settings | `/settings/location` | Manage home location and location consent |
| Privacy and security | `/settings/privacy` | Session, privacy and account controls |
| Help / report | `/help` | Support requests, abuse reports and match disputes |

### 10.2.4 PWA navigation and mobile UX

Use a compact mobile bottom navigation:

1. Home
2. Courts
3. Open Play
4. Rankings
5. Profile

Bookings, activity, match history, notifications and statistics should be accessible through the Home page, Profile page, and relevant feature screens. Do not overload the bottom navigation.

The interface must be responsive from narrow mobile screens through tablet and desktop widths. Use touch-friendly controls, readable typography, safe-area spacing, accessible contrast, clear loading states, and minimal multi-step forms.

### 10.2.5 PWA manifest requirements

Create `manifest.webmanifest` with:

- `name`: product's approved full name
- `short_name`: approved short brand
- `start_url`: `/home`
- `scope`: `/`
- `display`: `standalone`
- `theme_color` and `background_color`: approved brand tokens
- correctly sized 192x192 and 512x512 icons
- maskable icon where available
- portrait orientation preference where appropriate

The manifest enables optional home-screen installation. It does not mean the user must install the PWA to use the service.

### 10.2.6 Service worker and offline boundaries

The service worker must use an explicit caching strategy. It must never make stale court availability or booking information appear authoritative.

**May be cached for offline viewing:**

- App shell and static assets
- Public help content
- Previously viewed public club/court descriptions, clearly marked as cached
- Non-sensitive UI preferences

**Must be fetched from the backend before an authoritative action:**

- Current court availability
- Booking creation, modification and cancellation
- Open Play creation, joining, leaving and capacity
- Payment collection records
- Match verification and official score updates
- ELO rating and leaderboard values
- Subscription or club operational status

If connectivity is unavailable, show a clear offline banner and disable actions requiring server confirmation. Do not queue a booking and later silently confirm it. A cached slot is not a reservation. A score entered offline must not be represented as official or synchronized until the server accepts it.

### 10.2.7 Browser capabilities and limitations

- Geolocation: request only after the player chooses nearby discovery; always provide manual location search.
- Notifications: use Web Push where supported and only after clear player consent. Provide in-app notifications as the baseline.
- Live scoring: use WebSockets where available, with authenticated reconnect and a polling fallback.
- Camera / QR scanning: optional enhancement only; provide manual booking-reference entry.
- Add to Home Screen: optional convenience, never a prerequisite.
- Browser storage: do not store passwords, payment credentials, or authoritative booking/rating data in local storage or IndexedDB.
- Authentication: use secure, HTTP-only, SameSite cookies where the chosen Laravel SPA authentication architecture supports it. Apply CSRF protection. Do not expose long-lived bearer tokens to browser JavaScript.

### 10.2.8 PWA acceptance criteria

- A player can register, sign in and use all core player features in Chrome, Safari and other supported mobile browsers without installing anything.
- The platform does not require an APK, IPA, Play Store listing or App Store listing.
- The PWA can optionally be added to the phone home screen.
- All pages are responsive and usable on common mobile viewport sizes.
- Booking and Open Play actions require live server validation.
- Live Scorer clearly distinguishes pending, accepted and official score states.
- Offline mode never claims a booking, payment, match result or rating update succeeded when the server has not confirmed it.
- Service worker updates do not strand users on incompatible cached application code.
- Accessibility, browser permission denial, network interruption and expired-session states are tested.


------------------------------------------------------------------------

# 11. Role Permission Matrix

`Own` means only records belonging to the authorized club or user.
`Assigned` means only the staff member's permitted operational scope.

  ------------------------------------------------------------------------------------------------
  Capability       Super     Club     Club       Front Desk Court       Scorer     Player
                   Admin     Owner    Manager               Attendant              
  ---------------- --------- -------- ---------- ---------- ----------- ---------- ---------------
  View platform    Yes       No       No         No         No          No         No
  dashboard                                                                        

  Manage global    Yes       No       No         No         No          No         No
  plans                                                                            

  Manage all clubs Yes       No       No         No         No          No         No

  Manage own club  Audited   Own      Assigned   No         No          No         No
  profile                                                                          

  Manage courts    Audited   Own      Assigned   No         Limited     No         No

  Manage court     Audited   Own      Assigned   No         No          No         No
  hours                                                                            

  Search public    Yes       Yes      Yes        Yes        Yes         Yes        Yes
  courts                                                                           

  Create player    Yes\*     Yes\*    Yes\*      Yes\*      No          No         Yes
  booking                                                                          

  Create walk-in   Yes\*     Own      Assigned   Yes        Limited     No         No
  booking                                                                          

  Cancel booking   Yes\*     Own      Assigned   Assigned   Limited     No         Own, by policy

  Record on-site   Audited   Own      Assigned   Yes        Limited     No         No
  payment                                                                          

  Create Open Play Yes\*     Own      Assigned   No         No          No         Yes, if club
                                                                                   permits

  Approve player   Yes\*     Own      Assigned   No         No          No         No
  Open Play                                                                        

  Join Open Play   Yes\*     Yes\*    Yes\*      Yes\*      Yes\*       Yes\*      Yes

  Check in         Yes\*     Own      Assigned   Yes        Yes         No         Self, if
  participants                                                                     enabled

  Create matches   Yes\*     Own      Assigned   No         Limited     Assigned   Eligible
                                                                                   session/host
                                                                                   rules

  Score assigned   Yes\*     Own      Assigned   No         Assigned    Yes        Only if
  match                                                                            explicitly
                                                                                   authorized

  Verify/dispute   Review    Own      Assigned   No         No          No         Own
  result                                                                           participation

  Manage global    Yes       No       No         No         No          No         No
  rankings                                                                         

  View public      Yes       Yes      Yes        Yes        Yes         Yes        Yes
  rankings                                                                         

  Manage club      Audited   Own      Limited    No         No          No         No
  staff                                                                            

  Manage club      Audited   Own      No         No         No          No         No
  subscription                                                                     

  View own play    Yes\*     Yes\*    Yes\*      Yes\*      Yes\*       Yes\*      Own
  history                                                                          
  ------------------------------------------------------------------------------------------------

`*` Subject to explicit platform/club policy and audit rules. A global
administrator's access to personal data must be limited to legitimate
support, safety, and administrative purposes.

------------------------------------------------------------------------

# 12. Detailed User and Business Flows

## 12.1 Club registration and 14-day trial

1.  User registers or logs in.
2.  User selects the Court / Club Owner experience.
3.  User creates a club profile.
4.  Backend validates required club details.
5.  Backend creates the club tenant.
6.  Backend creates the owner's club membership.
7.  Owner selects an eligible subscription plan.
8.  Backend creates the club's 14-day trial using server time.
9.  Backend creates subscription entitlements.
10. Owner enters the club dashboard.
11. Trial reminders are scheduled.
12. Owner can manage features included in the selected plan.

Trial eligibility must be enforced server-side. Creating another staff
member must not create another trial. A new club owned by the same
person is a separate subscription, but trial eligibility rules should
prevent repeated abuse and be configurable by Super Admin.

## 12.2 Player court booking

1.  Player opens Explore.
2.  Player grants location access or searches manually.
3.  Backend returns public clubs and courts matching the location and
    filters.
4.  Player opens a court.
5.  App requests available times from the backend.
6.  Player selects date, time, and duration.
7.  Backend recalculates the price and validates policy.
8.  Backend creates the court reservation and booking atomically.
9.  Booking is confirmed or marked pending according to club rules.
10. Player receives booking reference and on-site payment instructions.
11. Club staff sees the booking in the calendar.
12. Staff records payment when collected at the venue.
13. Booking is marked completed after the session, or no-show according
    to club procedure.

## 12.3 Staff walk-in booking

1.  Authorized staff selects a court and time.
2.  Staff searches for an existing player or records a permitted guest
    booking.
3.  Backend checks the same availability and pricing rules used for
    player bookings.
4.  Backend creates reservation and booking.
5.  Staff records on-site payment if collected.
6.  Booking appears in the same club calendar and reports.

Do not build a separate walk-in availability engine.

## 12.4 Player-created Open Play

1.  Player opens Open Play.
2.  Player chooses a club that allows player-created sessions.
3.  Player chooses a court, date, and time.
4.  Backend checks club rules, operating hours, court availability, and
    session limits.
5.  Player configures title, skill range, format, capacity, and
    participation fee if allowed.
6.  Backend creates the court reservation and Open Play session in one
    transaction.
7.  If approval is required, the session waits for club approval.
8.  Once published, other players can join.
9.  Capacity is enforced atomically.
10. Additional players enter the waitlist.
11. Club staff or authorized host checks participants in.
12. Matches can be generated and played.
13. Session completion releases the reservation and preserves session
    history.

The fee policy must clearly state who is responsible for the court fee:
the host, equal participant split, or another club-approved arrangement.
The initial system records on-site collection rather than processing
participant payments online.

## 12.5 Live scoring and verified match

1.  Organizer creates a match and assigns players/teams.
2.  Match is assigned to a court and, optionally, an Open Play session
    or tournament.
3.  Authorized scorer opens Live Scorer.
4.  Scorer starts the match.
5.  Each point is sent to the backend as a unique event.
6.  Backend validates and persists the event.
7.  Backend broadcasts the authoritative score to subscribed viewers.
8.  Match reaches its configured end condition.
9.  Final result is submitted.
10. Players confirm or dispute, or an authorized organizer verifies
    according to the selected competition policy.
11. Verified competitive result is processed by the ELO service.
12. Rating ledger and ranking snapshots are updated.
13. Player history and statistics are refreshed.

## 12.6 Geographic ranking

-   Player has a canonical verified home location.
-   ELO rating is maintained by rating type, such as singles or doubles.
-   Leaderboards filter eligible player ratings by geographic scope.
-   Minimum match eligibility and provisional status are visible.
-   Ranking snapshots preserve historical standings.
-   Country ranking is enabled for the initial Philippine market.
-   Global ranking remains disabled until international coverage is
    implemented.

------------------------------------------------------------------------

# 13. Important Business Rules and Edge Cases

## 13.1 Booking

-   A court cannot have overlapping active reservations.
-   A booking must be within operating hours and outside closure
    exceptions.
-   Price is calculated on the server.
-   A player cannot book an inactive court.
-   Booking cancellation and rescheduling follow club policies.
-   Booking status and payment status are separate.
-   Booking expiration must release its court reservation.
-   Staff overrides require permission and audit logging.
-   Timezone is taken from the club, not assumed from the player's
    device.

## 13.2 On-site payment

-   No online booking payment gateway in the initial scope.
-   Payment collection is recorded by staff at the venue.
-   Amount, currency, method, receiver, and timestamp are stored.
-   Partial payments are allowed only if configured.
-   Refunds and corrections use adjustment records.
-   Players must see whether the booking is unpaid, partially paid, or
    paid.
-   Financial reports use payment records, not merely booking totals.

## 13.3 Open Play

-   A session requires a valid club and court reservation.
-   Player-created sessions respect club opt-in and approval rules.
-   Capacity must never be exceeded.
-   Waitlist promotion must be atomic.
-   Host cancellation notifies all participants.
-   Participant status transitions must be validated.
-   A player cannot join their own session twice.
-   Session host cannot alter club payment records.

## 13.4 Live Scorer

-   Score events are immutable.
-   Duplicate event IDs are rejected or safely treated as already
    processed.
-   Server validates scoring sequence and match status.
-   Undo creates a traceable compensating event.
-   Only authorized users can score.
-   Disputed results do not affect ELO until resolved.
-   A result must not be rated twice.

## 13.5 Rankings

-   Only verified competitive matches affect ELO.
-   Singles and doubles ratings are separate.
-   Casual matches remain in history but do not affect ELO.
-   Provisional players are clearly identified.
-   Rating formula and version are stored.
-   Administrative adjustments require a reason and audit record.
-   Location changes do not rewrite old snapshots.

## 13.6 Subscriptions

-   Subscription is per club.
-   Trial is 14 days and server-controlled.
-   Plan feature limits are checked on the backend.
-   Subscription expiration does not delete data.
-   Owner's other clubs are unaffected by one club's expired
    subscription.
-   Trial extensions are audited.
-   Subscription billing records are separate from court booking
    payments.

------------------------------------------------------------------------

# 14. Phase-by-Phase Development / Build Blueprint

Build in dependency order. Complete the backend contract and database
model for a phase before building dependent frontend behavior. Backend
and frontend can then be developed in parallel against documented API
contracts.

## Phase 1 --- Requirements, repository structure, and domain foundation

### Backend

-   Establish Laravel module boundaries.
-   Define naming conventions, API response standards, error format, and
    UUID strategy.
-   Define user identity and multi-role model.
-   Define tenant context resolution.
-   Define audit strategy.
-   Create shared validation and authorization conventions.

### Database

-   Create migrations for users, global roles, permissions, and club
    memberships.
-   Create geography reference tables.
-   Create clubs and club settings.
-   Add foreign keys, indexes, and unique constraints.

### Frontend

-   Establish React app shell and routing.
-   Establish Player React PWA shell, browser routing, manifest and service-worker foundation.
-   Define design tokens, typography, spacing, and reusable components.
-   Define typed API clients and error handling.

### Acceptance criteria

-   One user can have multiple roles.
-   One user can belong to multiple clubs.
-   Club context is explicit.
-   Cross-tenant access is denied by default.

## Phase 2 --- Authentication, profile, and RBAC

### Backend

-   Registration, login, logout, verification, password recovery.
-   Token/session lifecycle.
-   Player profile services.
-   Global role and club membership policies.
-   Staff permission catalog.
-   Account suspension and status checks.

### Database

-   Complete identity and access tables.
-   Add player privacy settings and account status fields.

### React

-   Authentication pages.
-   Super Admin protected layout.
-   Owner/Staff protected layout.
-   Club selector for users with multiple memberships.
-   Permission-aware navigation.

### Player PWA

-   Registration/login.
-   Session restoration.
-   Player onboarding.
-   Profile and home location editor.

### Acceptance criteria

-   Unauthorized roles cannot access protected endpoints.
-   Staff permissions are enforced by the backend.
-   A Player can use the same account across multiple clubs.
-   A person can be both Player and Owner without duplicate accounts.

## Phase 3 --- SaaS plans, per-club subscriptions, and 14-day trial

### Backend

-   Plan and feature catalog.
-   Per-club subscription creation.
-   Trial start and expiration rules.
-   Entitlement service and middleware.
-   Trial reminder events.
-   Cancellation, grace, past-due, expired, and suspended handling.
-   Super Admin trial extension with reason and audit.

### Database

-   Plans, plan features, club subscriptions, invoices, payment records,
    events, entitlements.

### React

-   Plan management.
-   Club subscription overview.
-   Trial countdown and status.
-   Billing history.
-   Super Admin subscription administration.

### Player PWA

-   No club subscription purchase flow required for Players.
-   Display club availability/status only where relevant to player
    discovery.

### Acceptance criteria

-   Each club has an independent subscription.
-   Two clubs owned by the same person can have different plans and
    statuses.
-   Trial duration is exactly 14 days according to the documented
    boundary.
-   Expired subscription never deletes historical data.
-   Backend rejects restricted actions for expired tenants.

## Phase 4 --- Club, court, and availability management

### Backend

-   Club profile CRUD.
-   Court CRUD.
-   Amenities and images.
-   Operating hours and exceptions.
-   Pricing rules.
-   Court availability search.
-   Reservation conflict service.

### Database

-   Clubs, settings, courts, hours, exceptions, price rules, court
    reservations.
-   PostgreSQL no-overlap constraint.

### React

-   Club profile editor.
-   Court list and court editor.
-   Operating hours.
-   Calendar and closure management.
-   Pricing configuration.

### Player PWA

-   Public club details.
-   Court details.
-   Court amenities and images.

### Acceptance criteria

-   Court availability respects hours, exceptions, and reservations.
-   Concurrent requests cannot reserve overlapping times.
-   All dates display in the club's timezone.
-   Only authorized club members can edit club facilities.

## Phase 5 --- Booking engine and on-site payment

### Backend

-   Player booking.
-   Staff walk-in booking.
-   Booking cancellation and rescheduling.
-   Booking status history.
-   On-site payment collection.
-   Payment adjustments.
-   Booking expiration and notifications.
-   Booking reports.

### Database

-   Bookings, participants, status history, cancellation records,
    payment records, adjustments.

### React

-   Booking calendar.
-   Booking details.
-   Walk-in booking form.
-   Payment collection form.
-   Payment history and daily collection summary.

### Player PWA

-   Search availability.
-   Select court/date/time.
-   Booking review and confirmation.
-   My bookings.
-   Cancellation request.
-   On-site payment instructions and status.

### Acceptance criteria

-   Player and staff booking use the same availability service.
-   No double booking is possible.
-   Server recalculates all booking prices.
-   Payment status is independent of booking status.
-   Only authorized staff can record collected payment.

## Phase 6 --- Player discovery and geographic search

### Backend

-   Club and court search.
-   Geographic radius and bounding-box search.
-   Filter and sort services.
-   Distance calculation.
-   Public club profile endpoint.
-   Search pagination.

### Database

-   Geographic reference relationships.
-   Spatial index for club coordinates where appropriate.
-   Search indexes for club and court fields.

### React

-   Optional public club preview pages and administrative map view.

### Player PWA

-   Nearby map.
-   List view.
-   Manual location search.
-   Filters for distance, availability, price, indoor/outdoor, surface,
    and amenities.
-   Club and court detail pages.

### Acceptance criteria

-   Discovery works when location permission is denied by allowing
    manual search.
-   Only public/active clubs and bookable courts are shown.
-   Search filters are applied by the backend.
-   Distance and timezone are handled consistently.

## Phase 7 --- Open Play, including player-created sessions

### Backend

-   Club Open Play configuration.
-   Player-created session service.
-   Approval workflow.
-   Court reservation integration.
-   Join/leave and waitlist.
-   Capacity locking.
-   Participant check-in.
-   Session cancellation and event history.

### Database

-   Open Play sessions, participants, waitlist, invitations, session
    events.

### React

-   Open Play management.
-   Approval queue.
-   Participant list.
-   Check-in management.
-   Session reporting.

### Player PWA

-   Open Play discovery.
-   Session details.
-   Create session.
-   Join/leave.
-   Waitlist.
-   Participant list.
-   Check-in and notifications.

### Acceptance criteria

-   Player-created sessions are allowed only when the club permits them.
-   Session creation cannot bypass court availability.
-   Court reservation and session creation are atomic.
-   Capacity and waitlist operations cannot overfill a session.
-   Club approval rules are enforced.

## Phase 8 --- Match management and Live Scorer

### Backend

-   Match creation and team assignment.
-   Singles/doubles support.
-   Match format configuration.
-   Scorer assignment.
-   Server-authoritative score event service.
-   WebSocket broadcasting.
-   Reconnection and event synchronization.
-   Match finalization and result verification.
-   Dispute workflow.

### Database

-   Matches, teams, players, games, score events, results,
    confirmations, disputes, status history.

### React

-   Club match manager.
-   Scorer assignment.
-   Live match viewer.
-   Result verification and dispute review.

### Player PWA

-   Match details.
-   Live Scorer interface.
-   Real-time score display.
-   Score history.
-   Match confirmation/dispute.

### Acceptance criteria

-   Score events persist before broadcast as official score.
-   Duplicate event IDs do not add duplicate points.
-   Reconnecting clients recover the authoritative state.
-   Only authorized scorers can submit score events.
-   Corrections are auditable.
-   Unverified results do not affect ELO.

## Phase 9 --- Player history, statistics, and ELO rankings

### Backend

-   Match history aggregation.
-   Player statistics.
-   ELO calculation and versioning.
-   Singles/doubles rating pools.
-   Rating event ledger.
-   Geographic leaderboard queries.
-   Ranking snapshots.
-   Provisional eligibility.
-   Audited rating correction.

### Database

-   Rating profiles, rating events, ranking scopes, ranking snapshots,
    ranking rules, adjustments.

### React

-   Club match statistics.
-   Ranking administration.
-   Dispute and correction workflows.
-   Club-level player activity reports.

### Player PWA

-   Recent plays.
-   Full match history.
-   Wins/losses and performance.
-   Singles and doubles rating.
-   Barangay, city/municipality, province, and country leaderboards.
-   Provisional and eligibility indicators.

### Acceptance criteria

-   Only verified competitive matches change ELO.
-   A match is processed once.
-   Singles and doubles ratings are separate.
-   Geographic ranking uses canonical player location.
-   Historical ranking snapshots remain reproducible.
-   Global ranking remains disabled until explicitly activated.

## Phase 10 --- Tournaments and community enhancements

### Backend

-   Tournament creation and registration.
-   Tournament categories and formats.
-   Bracket generation.
-   Match scheduling.
-   Tournament result linkage to matches.
-   Friends and player reports.
-   Achievements and activity events where approved.

### React

-   Tournament management.
-   Registration management.
-   Brackets and schedules.
-   Tournament reporting.

### Player PWA

-   Tournament discovery and registration.
-   Bracket view.
-   Match schedule.
-   Friends and player community.
-   Achievements and shareable match summaries.

### Acceptance criteria

-   Tournament matches use the same match and scoring engine.
-   Tournament results follow the same verification and ELO eligibility
    rules.
-   Player privacy settings are respected.

## Phase 11 --- Quality, security, and release-readiness validation

This phase is application validation, not deployment instruction.

-   Full functional regression testing.
-   Tenant-isolation testing.
-   RBAC and permission testing.
-   Booking concurrency and overlap testing.
-   Subscription lifecycle testing.
-   Trial abuse and boundary testing.
-   On-site payment reconciliation testing.
-   Open Play capacity and waitlist race-condition testing.
-   WebSocket reconnect and duplicate-event testing.
-   ELO idempotency and reversal testing.
-   Geographic ranking correctness testing.
-   Accessibility and responsive UI testing.
-   API validation and rate-limit testing.
-   Database backup/restore behavior testing as an application
    data-safety requirement.
-   User acceptance testing for all three roles.

------------------------------------------------------------------------

# 15. Testing Strategy

## 15.1 Backend tests

-   Unit tests for ELO formula and game scoring rules.
-   Feature tests for every API role and tenant boundary.
-   Database tests for foreign keys, uniqueness, and exclusion
    constraints.
-   Booking concurrency tests.
-   Subscription trial and expiration tests.
-   Payment status and adjustment tests.
-   Open Play capacity and waitlist concurrency tests.
-   Score event idempotency tests.
-   Match verification and rating processing tests.
-   Ranking snapshot tests.

## 15.2 Frontend tests

React:

-   Route protection and permission-aware rendering.
-   Club context switching.
-   Forms and validation.
-   Booking calendar and walk-in workflow.
-   Payment collection workflow.
-   Subscription state presentation.
-   Open Play approval and participant management.
-   Live match viewer.

Player PWA:

-   Authentication and session restoration.
-   Location permission and manual search fallback.
-   Court discovery and booking.
-   Booking status and payment instructions.
-   Open Play creation and joining.
-   Live Scorer reconnection.
-   Match history and ranking display.
-   Notification routing.
-   Accessibility and responsive layout.

## 15.3 Critical acceptance scenarios

1.  A player cannot book a court already reserved by another player.
2.  A staff walk-in booking cannot overlap a player booking.
3.  A player cannot view another player's private booking details.
4.  A Club Owner cannot access another club's private reports.
5.  A club's expired subscription does not affect another club owned by
    the same user.
6.  A player-created Open Play session cannot reserve a disabled or
    unavailable court.
7.  Two players cannot claim the final Open Play slot simultaneously.
8.  A duplicate scoring event does not change the score twice.
9.  A disputed match does not update ELO.
10. A verified match updates each eligible rating exactly once.
11. A player changing home barangay does not rewrite old ranking
    snapshots.
12. On-site payment cannot be recorded by a player or unauthorized staff
    member.

------------------------------------------------------------------------

# 16. Recommended MVP Scope

Do not attempt to build every advanced feature before the core booking
and club workflows are reliable.

## MVP --- Required

-   Global authentication and player identity
-   Super Admin portal
-   Club Owner portal
-   Per-club 14-day trial and subscription entitlement
-   Club and court management
-   Operating hours and court availability
-   Player court discovery
-   Player booking
-   Staff walk-in booking
-   On-site payment recording
-   Player-created Open Play with club controls
-   Match creation
-   Basic Live Scorer
-   Match history
-   Verified competitive result workflow
-   ELO singles and doubles
-   Barangay, city/municipality, province, and country ranking
-   Essential notifications
-   Audit logs and tenant isolation

## Later enhancements

-   Global ranking
-   Advanced tournament brackets
-   Advanced matchmaking
-   Friends and social feeds
-   Achievements and badges
-   Club reviews and ratings
-   Advanced analytics
-   Additional countries and geographic datasets
-   Advanced subscription add-ons and usage-based billing

------------------------------------------------------------------------

# 17. Development Standards and Non-Negotiable Rules

1.  Read and understand the existing repository before modifying code.
2.  Do not replace working project architecture without a documented
    reason.
3.  Build database migrations and backend domain rules before relying on
    frontend assumptions.
4.  Keep business logic out of controllers and UI components.
5.  Use Form Requests or equivalent request validation.
6.  Use API Resources or consistent response transformers.
7.  Enforce tenant isolation on every tenant-owned resource.
8.  Enforce permissions on the backend.
9.  Use database transactions for booking, Open Play reservation,
    payment adjustment, match finalization, and rating updates.
10. Use unique constraints and idempotency keys for
    concurrency-sensitive operations.
11. Do not trust client-calculated prices, scores, subscription status,
    or ranking values.
12. Preserve audit history for sensitive changes.
13. Never delete financial, scoring, or rating history to correct an
    error; use adjustments or compensating events.
14. Keep API documentation aligned with actual request and response
    contracts.
15. Build responsive, accessible, professional interfaces with
    consistent design components.
16. Include loading, empty, validation, error, and success states for
    every important screen.
17. Add automated tests with each module, not only at the end.
18. Do not implement a feature as a nonfunctional placeholder while
    presenting it as complete.
19. Do not add online court-booking payments to the initial build;
    payment is collected and recorded on-site.
20. Do not enable global ranking until its data and governance
    requirements are ready.

------------------------------------------------------------------------


# 17.1 Mandatory PWA-specific development checklist

- [ ] Player frontend is a React + TypeScript PWA, not a native mobile app.
- [ ] No native Android/iOS project, APK or IPA is required for Player access.
- [ ] Every core player route works directly in a mobile browser.
- [ ] PWA manifest, icons, theme metadata and service worker are implemented.
- [ ] Optional home-screen installation is tested but never required.
- [ ] Service worker caches only approved static/public content.
- [ ] Booking, court availability, Open Play capacity, payment records, scores and rankings are always server-authoritative.
- [ ] Manual location search works when geolocation is denied or unavailable.
- [ ] Web Push is progressive enhancement; in-app notifications remain available.
- [ ] Live scoring reconnect and stale-connection states are visible.
- [ ] Browser storage contains no secrets or authoritative records.
- [ ] Responsive, accessibility, offline, permission-denial and session-expiry tests pass.

# 17.2 Development deliverables by engineering layer

| Layer | Required deliverables |
|---|---|
| Database | ERD, normalized schema, migrations, constraints, indexes, seeders, factories and sample rows |
| Backend foundation | Laravel modules, DTOs/resources, Form Requests, policies, services, repositories only where useful, events/jobs, API versioning |
| Identity and security | Global user identity, player profile, club membership, role/permission assignment, session security, audit trail |
| SaaS | Plans, per-club subscriptions, 14-day trial lifecycle, entitlements, subscription status enforcement |
| Club operations | Clubs, courts, schedules, pricing, closures, staff, bookings, walk-ins and onsite payments |
| Player experience | Discovery, court search, bookings, Open Play, history, profile, statistics and notifications |
| Competition | Matches, live scoring, score event history, verification, disputes, ELO calculation and geographic leaderboards |
| Super Admin frontend | Platform dashboard, club/user administration, plans, subscriptions, moderation, disputes, ranking governance and audit pages |
| Owner frontend | Club dashboard, court/calendar management, bookings, onsite collections, Open Play, matches, staff, reports and subscription pages |
| Player PWA frontend | Mobile-first pages and routes listed in Section 10.2.3, responsive browser experience and optional home-screen installation |
| Quality | Backend tests, frontend tests, authorization tests, tenant-isolation tests, concurrency tests, accessibility and PWA tests |


# 18. Final Architecture Summary

The final platform is a multi-tenant pickleball SaaS product with:

-   Three primary roles: Super Admin, Court / Club Owner, and Player
-   One global user identity and player profile
-   One subscription per club, each with its own 14-day trial
-   A shared booking engine for player reservations and staff walk-ins
-   On-site booking payment recording
-   Player-created Open Play governed by participating club rules
-   A shared court reservation model preventing booking/Open Play
    conflicts
-   Server-authoritative Live Scorer with immutable score events
-   Verified competitive match results feeding ELO
-   Separate singles and doubles rating pools
-   Geographic leaderboards for barangay, city/municipality, province,
    and country
-   Global ranking represented as a future capability
-   Laravel API, React web portals, React Player PWA, and PostgreSQL
    database

**Core engineering principle:** Build one reliable source of truth for
identity, tenant authorization, court availability, bookings, payments,
match results, and rankings. Every frontend must consume these backend
rules rather than duplicating them.

This specification is the baseline for the development team to produce
migrations, models, services, API endpoints, frontend modules, and
automated tests in the defined phase order.


---

## Final scope reminder

This blueprint ends at a tested, build-complete application codebase and its development artifacts. It does not prescribe or include a deployment flow. The Player product is a mobile-first PWA accessible by URL in a browser; installing an APK or native application is not part of the requirements.
