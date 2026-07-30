# FRONTEND_DESIGN_SPEC — Karmasheel

Design specification for the Karmasheel React + TypeScript + Tailwind CSS
web client. This document is a **design spec, not an implementation** — no
components are built here. It is written against the backend exactly as
documented in `FRONTEND_CONTEXT.md` and `DEFERRED_SCOPE.md` (source-of-truth
priority 1–2), consistent with `DEMO_SCRIPT.md` (priority 3), and uses the
proposal PDF and diagrams (priority 4) only for product intent, terminology,
and workflow framing. Wherever the proposal describes something the backend
does not implement (complaints, document-verification requests, direct
messages/"Send Direct Requests," notifications, rehire flows), it is
**excluded** here, per the conflict-resolution rule in `FRONTEND_CONTEXT.md`
§15.

No backend changes are proposed anywhere in this document. Anywhere the UI
appears to need something the API doesn't provide, it is called out
explicitly as an **omission**, not worked around.

---

## 0. Non-negotiable backend constraints (apply to every screen below)

- List endpoints return **bare JSON arrays** — no `count`/`next`/`previous`.
  No infinite-scroll-by-cursor, no "page 2" control anywhere.
- Jobs can be **closed, never deleted**. No "Delete job" button exists.
- Job Browse filters are **category, subcategory, work type, distance**
  only. No keyword/title/description search field anywhere.
- Employer verification and contact verification are **Django-admin-only**
  toggles. No "upload documents," "request verification," or "verify my
  phone" screen exists — only a **read-only status badge**.
- **No password reset** — Login has no "Forgot password?" link.
- **Access tokens expire in 5 minutes.** Every authenticated screen must
  tolerate a silent refresh + one retry cycle mid-session (§3.6).
- Skills are entered as **free text** (`skill_input` / `required_skills_input`
  / `preferred_skills_input`), normalized server-side. There is no skill
  alias browser — only unmatched-term feedback after submission.
- **No standalone public worker-profile or employer-directory page.**
  Worker/employer identity surfaces only inside applications, candidate
  lists, and recommendation results — never as a browsable directory.
- No chat, payments, uploads (photo/document), push/SMS/email
  notifications, complaints/disputes, trusted-worker/rehire lists, maps,
  or analytics dashboards. All of these appear in the proposal's use-case
  diagram but have no backing endpoint and are excluded (see
  `FRONTEND_CONTEXT.md` §13).
- Django admin (`/admin/`) is a **separate, server-rendered surface**. The
  SPA never replicates admin actions; where relevant, screens may state
  "an administrator handles this" but never link to `/admin/` as if it
  were part of the app's own navigation.

---

## 1. Visual identity and brand personality

**Product name:** Karmasheel ("skilled at work" — a name that signals
competence and dignity of labor, not a gig-economy novelty).

**Brand personality:** Karmasheel should feel like a **trustworthy
community notice board that grew up**, not a slick corporate SaaS
dashboard and not a flashy gig-app. The target users are electricians,
masons, cooks, cleaners, and similar blue-collar and local-service workers
in Nepal, alongside households, small businesses, and organizations hiring
them. Many users have limited digital experience and may be on mid-range
Android phones outdoors in bright sunlight. The interface should read as:

- **Plain-spoken** — short labels, everyday words, no jargon ("Match
  score" and "Why this job matched you," not "relevance vector").
  Terminology and job/skill vocabulary are drawn from the proposal (e.g.
  "opportunity advisory," "near-miss job," "reliability") but always
  translated into plain sentences in the UI, never displayed as raw field
  names or formulas.
- **Grounded and respectful** — visuals should suggest real trades (tools,
  hands, buildings, homes) rather than abstract tech iconography. No
  stock-photo gloss; if illustrations are used, they should be simple,
  warm, and geometric rather than hyper-realistic.
- **Calm and confidence-building** — no urgency-manufacturing patterns
  (countdown timers, "3 people viewing this job"). Status is always
  stated plainly (Active / Closed, Applied / Shortlisted / Hired, etc.).
- **Honest about limits** — when the system doesn't know something (e.g.
  distance unavailable), it says so in plain language rather than hiding
  the gap or inventing a placeholder.

---

## 2. Design systems

### 2.1 Color

A two-track palette: a **warm neutral base** (for the everyday, outdoor,
high-glare reading experience) plus a **small, high-contrast semantic set**
for status, since status clarity (active/pending/completed/rejected/
cancelled/closed) is a core requirement.

| Token | Role | Notes |
|---|---|---|
| `--color-bg` | Page background | Warm off-white (not pure white) to reduce glare fatigue |
| `--color-surface` | Card/panel background | White |
| `--color-surface-muted` | Secondary panel (e.g. disabled sections) | Light warm gray |
| `--color-text-primary` | Body/heading text | Near-black, not pure black (softer on eyes) |
| `--color-text-secondary` | Supporting text, metadata | Mid gray, still ≥ 4.5:1 contrast on `--color-bg` |
| `--color-brand-primary` | Primary actions, active nav, links | Deep terracotta/burnt-orange — evokes brick, tools, earth; warm without being a generic "app blue" |
| `--color-brand-primary-hover` | Hover/active state of primary | Slightly darker terracotta |
| `--color-brand-secondary` | Secondary accents, worker-side highlights | Deep teal-green — construction/safety-adjacent, distinct from status colors |
| `--color-success` | Active, Hired, Completed, Verified | Forest green |
| `--color-warning` | Pending, Shortlisted, near-miss, unmatched terms | Amber |
| `--color-danger` | Rejected, Cancelled, error states | Brick red |
| `--color-neutral-status` | Withdrawn, Closed (deliberately muted, not "bad") | Slate gray |
| `--color-focus-ring` | Keyboard focus outline | High-contrast blue, reserved solely for focus — never reused as a brand color, so focus is always unambiguous |

Rules:
- Status colors are **never reused for anything else** (e.g. amber is
  always "pending/caution," never used for a decorative accent).
- Every text/background pairing must meet WCAG AA (4.5:1 for body text,
  3:1 for large text/icons) — validated against the outdoor-glare use
  case, not just typical indoor screens.

### 2.2 Typography

- **Typeface:** A single humanist sans-serif with strong Devanagari
  companion support planned (even though only English ships today — see
  §23), e.g. Noto Sans as the pairing target, with a similarly-shaped
  Latin sans as primary (e.g. Inter or system-ui) for now. One font
  family across the whole app — no display/serif accent font, to keep
  rendering fast on low-end devices.
- **Base size:** 16px minimum body text (never smaller, per limited-
  digital-experience guidance). Larger default than a typical SaaS app.
- **Scale:** modest, restrained type scale (12 / 14 / 16 / 18 / 22 / 28 /
  34px) — few sizes, used consistently, so hierarchy stays legible at a
  glance rather than relying on many subtle gradations.
- **Line height:** 1.5 for body copy, 1.3 for headings — generous, since
  reading conditions may be imperfect (glare, motion, small viewport).
- **Weight:** Regular for body, Semibold for headings/labels/button text.
  Avoid Light/Thin weights entirely — they disappear in sunlight glare.

### 2.3 Spacing

- 4px base unit; scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
- Minimum 16px padding inside cards and form sections on mobile; 24px on
  tablet/desktop.
- Generous vertical rhythm between form sections to support progressive
  disclosure (§2.6) — sections should read as visually distinct "steps,"
  not a dense wall of fields.

### 2.4 Radius & shadow

- **Radius:** one consistent scale — 8px for buttons/inputs/small chips,
  12px for cards, 16px for modals/sheets. No sharp corners (feels overly
  formal/administrative) and no fully-pill everything (feels gig-app
  gimmicky) — 8–16px reads as approachable but sturdy.
- **Shadow:** minimal, used only to lift interactive cards (job cards,
  candidate cards) or floating elements (bottom sheet, dropdown). Flat
  design elsewhere — shadows are not used decoratively, keeping contrast
  and legibility predictable under bright light.

### 2.5 Icons & motion

- **Icon style:** one consistent outline icon set throughout (e.g.
  Lucide-style), always paired with a text label in navigation —
  icon-only navigation is not used anywhere, per the explicit requirement.
- **Icon sizing:** minimum 24px for standalone tap targets, scaling with
  the 44px minimum touch-target box around them.
- **Motion:** subtle and functional only — state changes (status badge
  updates, form validation, tab switches) use short (150–200ms) fades/
  slides. No decorative motion, no parallax, no attention-grabbing
  animation loops. Motion must respect `prefers-reduced-motion`.

### 2.6 Progressive disclosure pattern (used across all long forms)

Applies to Worker Profile, Employer Profile, and Job Create/Edit:

- Break the form into **named sections** (e.g. Worker Profile: Basics →
  Location → Skills → Availability & Wage), one section visible/expanded
  at a time on mobile (accordion or step pattern), all sections visible
  as clearly separated cards on desktop.
- Each section can be **saved independently** via `PATCH` (the backend
  supports partial updates on every profile/job endpoint) — so a user can
  fill in Basics, leave, and come back to Skills later without losing
  progress or being forced through the whole form in one sitting.
- Section headers show a simple completion indicator (e.g. a filled vs.
  outline dot), not a percentage bar — keeps it legible without implying
  a precise score.

---

## 3. Navigation

### 3.1 Principles

- **Icon + short text label, always** — no icon-only bars anywhere, per
  requirement.
- Navigation itself never fetches restricted data speculatively; each
  destination screen fetches only when it becomes active.
- Nav items are role-aware: Worker and Employer see different item sets
  after login (derived from `GET /api/auth/me/` → `role`); Public
  visitors see a minimal set.

### 3.2 Desktop (≥1024px)

- **Top bar**: logo/wordmark (left) · primary nav as icon+text items in a
  horizontal row (center/left-of-actions) · right-aligned account menu
  (avatar-less — a simple username + role chip, since there are no
  profile photos) with Logout.
- Public top bar items: Browse Jobs · Login · Register.
- Worker top bar items: Dashboard · Browse Jobs · My Applications ·
  Recommendations · Opportunity Advisory · Profile · CV · Ratings.
  (If this reads as too many top-level items at ≥1024px, group
  Recommendations + Opportunity Advisory + Ratings under a "For You"
  disclosure menu — still icon+text per item inside it.)
- Employer top bar items: Dashboard · My Jobs · Post a Job (disabled/
  tooltip-gated if unverified) · Profile · Ratings.
- No sidebar is required at this breadth of nav; a persistent top bar is
  sufficient and keeps the content column wide for data-dense screens
  (candidate lists, applications).

### 3.3 Tablet (768–1023px)

- Top bar collapses secondary items into a labeled "More" menu (still
  icon+text rows in a dropdown), keeping the 3–4 most-used items
  (Dashboard, Browse Jobs / My Jobs, Applications, Profile) directly
  visible.
- Forms and lists shift from a fixed-width desktop layout to a fluid,
  single-column-with-wider-cards layout (§ per-screen "tablet adaptation").

### 3.4 Mobile (<768px)

- **Bottom tab bar**, icon+text, 4–5 items max (the pattern most familiar
  to this audience from other apps, and easiest to reach one-handed):
  - Worker: Home · Browse · Applications · For You (recommendations +
    advisory) · Profile
  - Employer: Home · My Jobs · Applicants · Profile
- Anything not on the bottom bar (CV, Ratings, Logout) lives in the
  Profile tab as a simple icon+text list — not hidden behind a hamburger,
  since hamburger menus are harder to discover for less digitally
  experienced users.
- All bottom-tab targets are ≥44px tall with adequate horizontal
  spacing to prevent mis-taps.

### 3.5 Unauthenticated navigation

- Public visitor sees Browse Jobs, Login, Register only. Attempting to
  reach a protected route redirects to Login with a plain-language
  message ("Log in to see your applications") rather than a raw 401.

### 3.6 Silent refresh & retry (not a visible screen, but a global behavior)

- Every authenticated request attaches the current access token.
- On a `401`, the client performs **exactly one** silent
  `POST /api/auth/token/refresh/` using the stored refresh token, then
  retries the original request once.
- If the refresh call itself fails (expired/blacklisted refresh token),
  the client logs the user out and redirects to Login with a plain
  message ("Your session ended — please log in again"), preserving the
  page they were on to return to after login where reasonably possible.
- This logic is invisible to the user in the success path — no spinner
  flicker for the refresh itself, only the normal loading state of the
  action they took.

---

## 4. Public Landing Page

- **Route:** `/`
- **Permitted role:** Public (unauthenticated); logged-in users are
  redirected to their role dashboard instead.
- **Page hierarchy:** Hero (value proposition + two CTAs: "Find Work" /
  "Hire Workers") → How it works (3-step explainer, plain language) →
  Browse-by-category teaser (pulls from the taxonomy tree) → Register
  CTA → Footer (About, Login/Register links; no dead links to
  unsupported features).
- **API endpoints used:** `GET /api/taxonomy/tree/` (category teaser
  tiles), optionally `GET /api/jobs/browse/` (a small "recent active
  jobs" preview strip, unfiltered).
- **Primary actions:** "Find Work" → Register (Worker), "Hire Workers" →
  Register (Employer).
- **Secondary actions:** "Browse jobs without an account" → Job Browse;
  "Log in" (top bar).
- **Desktop layout:** Full-width hero with two large side-by-side CTA
  cards; category tiles in a 4–6 column grid below.
- **Tablet/mobile adaptation:** Hero CTAs stack vertically, full-width;
  category tiles reflow to a 2-column (tablet) / 1-column (mobile) grid.
- **Reusable components:** `CategoryTile`, `JobCardCompact`, `CTAButton`,
  `SectionHeading`.
- **States:** Loading (skeleton category tiles), empty (if taxonomy tree
  or job preview is empty, hide that section gracefully rather than
  showing a broken empty box), no error/unauthorized cases (fully public).
- **Omitted:** no login-wall content teasers, no map of nearby jobs (no
  geocoding/map layer exists), no "X jobs posted this week" analytics
  banner (no analytics endpoint).

---

## 5. Login and Registration

### 5.1 Login

- **Route:** `/login`
- **Permitted role:** Public only (redirects away if already authenticated).
- **Page hierarchy:** Username field → Password field → Submit → "New
  here? Register" link. **No "Forgot password?" link** — omitted, since
  no endpoint exists.
- **API endpoint:** `POST /api/auth/login/`.
- **Primary action:** Log in.
- **Secondary action:** Go to Register.
- **Desktop layout:** Centered card, max-width ~420px, vertically centered
  in viewport.
- **Tablet/mobile:** Same card pattern, full-width with side margins;
  large (≥44px) input fields and submit button.
- **Reusable components:** `AuthCard`, `TextField`, `PasswordField`,
  `PrimaryButton`, `InlineErrorMessage`.
- **States:**
  - Loading: submit button shows an inline spinner, fields disabled.
  - Success: redirect based on `GET /api/auth/me/` → `role`.
  - Error (`401`): plain-language inline message ("That username or
    password isn't right. Please try again.") — never the raw DRF error.
  - Offline: a top-of-form banner ("You appear to be offline") if the
    request fails to reach the network at all, distinct from a 401.
- **Omitted:** password reset, "remember me" beyond normal token storage,
  social login (none exist in the backend).

### 5.2 Registration (Worker / Employer)

- **Route:** `/register`
- **Permitted role:** Public only.
- **Page hierarchy:** Role toggle (Worker / Employer, prominent, large
  tap targets) → shared fields (username, email, phone number, password)
  → Submit → link to Login.
- **API endpoint:** `POST /api/auth/register/`.
- **Primary action:** Create account.
- **Secondary action:** Switch to Login.
- **Desktop layout:** Centered card, similar width to Login; role toggle
  as two large side-by-side segmented buttons above the field list.
- **Tablet/mobile:** Role toggle stacks as two full-width buttons;
  fields full-width, one per row.
- **Fields:** username, email, phone number (10 digits, explicitly
  labeled "We'll use this to reach you — required," reflecting phone as
  the primary contact channel), password, role.
- **Reusable components:** `RoleToggle`, `TextField`, `PhoneField`
  (10-digit format hint), `PasswordField`, `PrimaryButton`.
- **States:**
  - Loading: submit disabled + spinner.
  - Success (`201`): auto-redirect to Login (or directly attempt login)
    with a plain confirmation ("Account created — let's set up your
    profile next").
  - Error (`400`): field-level plain-language messages (username taken,
    phone number taken, weak password, invalid role) mapped from DRF's
    field-keyed error arrays.
- **Omitted:** no document upload during registration, no OTP/SMS
  verification step in this flow (verification is admin-side and later,
  §16), no student-specific toggle (students register as Workers, per
  `FRONTEND_CONTEXT.md` §1).

---

## 6. Worker Onboarding & Profile Completion

- **Route:** `/worker/profile` (also the forced first stop right after a
  new Worker's first login, if the profile is still empty)
- **Permitted role:** Worker only.
- **Page hierarchy:** Profile header (completion status, plain language:
  "Your profile is ready to show employers" vs. "Add a few more details
  to get better matches") → progressive sections: **Basics** (address,
  experience years) → **Location** (address text + lat/long — see note
  below) → **Skills** (free-text skill input with live add/remove chips)
  → **Availability & Wage** (is_available toggle, expected wage,
  preferred travel radius).
- **API endpoints:** `GET /api/profiles/worker/me/`,
  `PUT`/`PATCH /api/profiles/worker/me/`.
- **Primary actions:** Save each section (independent `PATCH` per
  section, per §2.6).
- **Secondary actions:** "Preview my CV" (links to CV screen, §13).
- **Desktop layout:** Two-column — left column: section accordion/stepper
  with the active section's form; right column: a live-updating summary
  card ("Here's what employers will see") reflecting current saved state.
- **Tablet/mobile adaptation:** Single column; summary card moves below
  the active section, or collapses into a "Preview" button that opens a
  bottom sheet — no permanent side-by-side split below 1024px.
- **Skills section detail:** free-text input where the worker types
  skill phrases (English or Romanized Nepali, e.g. "ghar wiring") one at
  a time, added as chips. On save, the response's `skills` (matched,
  standardized) is shown as confirmed chips, and any `unmatched_terms`
  is shown separately and gently: "We couldn't confidently match: 'X' —
  our team will review it and it may appear as a matched skill soon."
  Never silently drop unmatched terms.
- **Reusable components:** `ProfileSectionAccordion`, `AddressField`,
  `CoordinateCapture` (see note), `NumberField`, `ToggleSwitch`,
  `SkillChipInput`, `UnmatchedTermNotice`, `ProfileSummaryCard`.
- **Note on coordinates:** the backend requires `latitude`/`longitude` as
  plain decimal fields (used only for Haversine distance) — no map
  picker exists in scope (§13 exclusion). The frontend should offer a
  "Use my current location" button (standard browser geolocation API,
  not a backend feature) to fill lat/long automatically, with a manual
  fallback of typing the address only — distance-dependent features
  (recommendations, distance-filtered browse) will show "distance
  unknown" if coordinates are never supplied, and that is an acceptable,
  expected state, not an error.
- **States:**
  - Loading: skeleton form sections on first load.
  - Empty: a brand-new profile (auto-created empty at registration)
    shows all sections as clearly incomplete but never blocks navigation
    elsewhere in the app.
  - Success: inline "Saved" confirmation per section (toast or inline
    check), not just a silent field update.
  - Warning: unmatched skill terms (amber notice, as above).
  - Error (`400`): field-level validation messages, plain language.
- **Omitted:** no profile photo upload, no certification/document
  upload field (not modeled by the backend despite proposal mentions),
  no map-based location picker.

---

## 7. Worker Dashboard

- **Route:** `/worker` (post-login landing for Workers)
- **Permitted role:** Worker.
- **Page hierarchy:** Welcome header → profile-completion nudge (if
  incomplete) → at-a-glance summary cards (Active applications count,
  Top recommendation preview, Rating summary snippet) → shortcut tiles
  to Browse Jobs / My Applications / Recommendations / Opportunity
  Advisory / CV.
- **API endpoints:** `GET /api/auth/me/`, `GET /api/profiles/worker/me/`,
  `GET /api/applications/` (for the count/snippet),
  `GET /api/recommendations/jobs/?limit=1` (top preview),
  `GET /api/applications/ratings/summary/`.
- **Primary actions:** "Browse Jobs," "View Recommendations."
- **Secondary actions:** "Complete your profile" (if incomplete),
  "View all applications."
- **Desktop layout:** Grid of summary cards (2–3 per row) above a row of
  shortcut tiles.
- **Tablet/mobile adaptation:** Summary cards stack to 1–2 per row;
  shortcut tiles become full-width list rows with icon+text.
- **Reusable components:** `SummaryCard`, `ShortcutTile`,
  `ProfileNudgeBanner`, `StatusChip`.
- **States:**
  - Loading: skeleton summary cards.
  - Empty: "You haven't applied to any jobs yet — browse jobs to get
    started" in place of an empty applications count; recommendations
    card shows "Complete your profile to see matches" if no worker
    profile data exists yet.
  - Error: any failed summary fetch degrades gracefully (that one card
    shows a small retry prompt) without blocking the rest of the
    dashboard.
- **Omitted:** no notification bell/feed (no notification model exists).

---

## 8. Job Browsing

- **Route:** `/jobs`
- **Permitted role:** Public and Worker (auth-aware: when logged in as a
  Worker, distance filtering defaults to the worker's own stored
  coordinates/radius, per `ActiveJobBrowseView`'s documented behavior).
- **Page hierarchy:** Filter bar (Category → Subcategory, dependent
  dropdown; Work type; Distance) → Results list/grid → Job cards linking
  to Job Detail.
- **API endpoints:** `GET /api/taxonomy/categories/`,
  `GET /api/taxonomy/subcategories/?category=`,
  `GET /api/jobs/browse/?category=&subcategory=&work_type=&latitude=&longitude=&max_distance_km=`.
- **Primary action:** Apply a filter combination (auto-runs the query on
  change; no separate "Search" button needed for a filter-only model).
- **Secondary action:** "Clear filters."
- **Desktop layout:** Filter bar as a horizontal row above a 2–3 column
  job-card grid, or a left-side filter rail with results on the right —
  either is acceptable; a left rail scales better if more filters are
  added later.
- **Tablet adaptation:** Filter bar collapses into a single "Filters"
  button opening a panel/drawer; results in a 2-column grid.
- **Mobile adaptation:** "Filters" button opens a full-height bottom
  sheet with the same four controls; results in a single-column list of
  full-width cards.
- **Reusable components:** `FilterBar`/`FilterSheet`, `CategorySelect`,
  `SubcategorySelect` (disabled until a category is chosen, or shows all
  if none), `WorkTypeSelect`, `DistanceSlider`, `JobCard`, `EmptyState`.
- **Job card contents:** title, category/subcategory, employer name (from
  `PublicJobPostSerializer`), address, wage type + amount, work type,
  distance (if available), `employer_verification_status` shown as a
  small badge.
- **States:**
  - Loading: skeleton job cards (5–8 placeholders).
  - Empty: "No jobs match your filters yet" with a "Clear filters"
    shortcut — an explicitly designed, legitimate state (per
    `FRONTEND_CONTEXT.md` §12's Plumbing-job example), not just an edge
    case afterthought.
  - Error: inline retry banner above the (possibly stale) results.
- **Omitted:** no keyword/title/description search box anywhere on this
  screen; no "sort by relevance" (sorting, if offered, is limited to
  fields actually returned, e.g. distance or date — not a relevance
  score the browse endpoint doesn't compute); no infinite scroll relying
  on a `next` cursor — since the endpoint returns the full array, the
  frontend renders it all directly (optionally with a client-side "show
  more" reveal for very long lists, but not a server-paginated one); no
  map view.

---

## 9. Job Detail & Application

- **Route:** `/jobs/:id`
- **Permitted role:** Public (limited), Worker (full, with Apply action),
  Employer-owner sees a different owner view (§17).
- **Page hierarchy:** Job header (title, category/subcategory, status
  badge) → Employer summary (name, verification badge — no contact
  details) → Details (description, wage, work type, schedule/duration,
  required experience, number of workers required, application deadline)
  → Required/Preferred skills (chips) → Apply action (Worker only, when
  `status === "ACTIVE"`).
- **API endpoints:** `GET /api/jobs/<id>/` (public shape for non-owners);
  `POST /api/applications/` (Apply, Worker only).
- **Primary action (Worker, job active, not yet applied):** "Apply" —
  opens a small optional note field (`worker_note`) then submits.
- **Primary action (already applied):** button replaced by a status chip
  ("You applied — Shortlisted") linking to My Applications, not a
  duplicate-apply button (backend rejects duplicates with `400`
  regardless, but the UI should prevent the confusing attempt).
- **Secondary action:** "Back to Browse."
- **Desktop layout:** Two-column — left: full job details; right: sticky
  employer summary + Apply card.
- **Tablet/mobile adaptation:** Single column, Apply card as a
  full-width block pinned near the top of the scroll (or a sticky bottom
  bar with the Apply button on mobile for easy one-handed reach).
- **Reusable components:** `JobDetailHeader`, `StatusBadge`,
  `EmployerSummaryCard`, `SkillChipList`, `ApplyPanel`, `NoteTextArea`.
- **States:**
  - Loading: skeleton detail blocks.
  - Not found / not active for non-owner (`404`): plain message ("This
    job isn't available anymore") with a link back to Browse.
  - Apply success (`201`): confirmation state, Apply card replaced with
    the new application's status.
  - Apply error (`400`, job not active / already applied): inline plain
    message, no raw DRF text.
  - Apply error (`404`, no worker profile — shouldn't normally occur
    since registration auto-creates one, but handled defensively):
    redirect/prompt to complete profile first.
- **Omitted:** no "message the employer" action, no "save/bookmark job"
  (no such endpoint), no employer contact info display of any kind.

---

## 10. Worker Application Tracking

- **Route:** `/worker/applications`
- **Permitted role:** Worker.
- **Page hierarchy:** Status filter tabs/chips (All / Active-in-progress
  / Completed / Closed-out) → application list, each row expandable to
  detail (job title, current status, dates, notes, and — where legal —
  a Withdraw action).
- **API endpoints:** `GET /api/applications/`,
  `PATCH /api/applications/<id>/status/` (Withdraw, when the current
  status is `APPLIED`/`SHORTLISTED`/`CONTACTED`).
- **Primary action:** "Withdraw" (only rendered when legal per the
  transition table — absent entirely once `HIRED` or later).
- **Secondary action:** "View job" (links back to Job Detail),
  "Rate this employer" (only once `status === "COMPLETED"` and unrated).
- **Desktop layout:** Table-like list (status chip, job title, employer
  name, date, action) with generous row height (not a dense data-grid,
  given the audience).
- **Tablet/mobile adaptation:** Card-per-application instead of a table
  row, stacked vertically, same information reflowed.
- **Distinguishing states visually (critical requirement):** each of the
  8 statuses gets a distinct, consistent `StatusChip` color/label:
  - `APPLIED` — neutral/blue-gray, "Applied"
  - `SHORTLISTED` — amber, "Shortlisted"
  - `CONTACTED` — amber-deeper, "Contacted"
  - `HIRED` — green, "Hired"
  - `COMPLETED` — green-check, "Completed"
  - `REJECTED` — red, "Not selected"
  - `WITHDRAWN` — slate/muted, "Withdrawn by you"
  - `CANCELLED` — slate/muted, "Cancelled by employer"
  Terminal statuses (`REJECTED`, `WITHDRAWN`, `COMPLETED`, `CANCELLED`)
  render as read-only history rows — no action buttons at all, per the
  state-machine guidance.
- **Reusable components:** `StatusFilterTabs`, `ApplicationRow`/
  `ApplicationCard`, `StatusChip`, `WithdrawConfirmDialog`,
  `RateEngagementButton`.
- **States:**
  - Loading: skeleton rows.
  - Empty: "You haven't applied to any jobs yet" with a CTA to Browse.
  - Withdraw confirmation: an explicit confirm dialog before submitting
    (consequential, hard-to-reverse action, per §12 requirement).
  - Error (`400` illegal transition — shouldn't surface if buttons are
    gated correctly, but handled defensively with a plain retry message).
- **Omitted:** no "resubmit" or "reapply" action (not modeled; a new
  application to the same job is simply blocked as a duplicate while any
  non-terminal application exists).

---

## 11. Recommended Jobs (Worker)

- **Route:** `/worker/recommendations`
- **Permitted role:** Worker.
- **Page hierarchy:** Header explaining the feature in plain language
  ("Jobs matched to your profile, with reasons why") → ranked list of
  recommendation cards → expandable "Why this match?" detail per card.
- **API endpoint:** `GET /api/recommendations/jobs/?limit=`.
- **Primary action:** "View job" / "Apply" (deep-links into Job Detail).
- **Secondary action:** Expand/collapse the score breakdown.
- **Desktop layout:** Single-column ranked list, generous card height;
  score breakdown expands inline below the card (accordion), not a
  separate modal, to keep ranking context visible.
- **Tablet/mobile adaptation:** Same single-column list; breakdown
  accordion still inline, full width.
- **"Explainable, not technical" presentation (critical requirement):**
  - Show `final_score` as a simple labeled bar/ring ("92 out of 100
    match"), not a raw decimal.
  - Show the five ranking components (`skill.skill_score`,
    `distance_score`, `experience_score`,
    `availability_preference_score`, `reliability_verification_score`)
    as short horizontal bars with plain labels: "Skills," "Distance,"
    "Experience," "Availability & wage fit," "Trust & reliability."
  - Show `reciprocal_preference_score` separately and clearly labeled
    "Mutual fit" with a short explanatory line ("How well this suits
    both you and the employer") — never presented as a second ranking
    number, per the backend's explicit note that it is explanatory only.
  - Render `reasons` as a green bullet list in plain sentences (already
    plain-language strings from the backend — display them directly,
    don't re-derive or paraphrase into something less precise).
  - Render `warnings` as a visually distinct (amber) bullet list below
    reasons.
  - When `distance_km`/`distance_score` are `null`, show "Distance:
    unknown" (never `0 km`) plus the corresponding warning string.
  - Never show raw component field names, weights, or formulas from the
    proposal's equations — those are backend implementation detail, not
    user-facing content.
- **Reusable components:** `RecommendationCard`, `ScoreBar`,
  `MatchScoreRing`, `ReasonsList`, `WarningsList`, `MutualFitBadge`.
- **States:**
  - Loading: skeleton recommendation cards.
  - Empty (`404`, no worker profile yet): prompt to complete the profile
    first, linking to §6.
  - Empty (profile exists, but the array is genuinely empty): "No
    matches yet — try broadening your availability or adding more
    skills," a supportive, non-alarming message.
  - Error (`400` bad limit — shouldn't occur from normal UI use, but
    defensively handled): fall back to default limit silently and retry.
- **Omitted:** no manual re-ranking/sorting by the user (ranking is
  server-computed only), no "hide this recommendation" action (no such
  endpoint).

---

## 12. Opportunity Advisory (Worker)

- **Route:** `/worker/opportunities`
- **Permitted role:** Worker.
- **Page hierarchy:** Header explaining the feature plainly ("Jobs you're
  close to qualifying for, and what would help") → Near-miss jobs list
  (same recommendation-card presentation as §11, since it's the same
  object shape) → Missing-skills section ("Skills that would help you
  qualify for more jobs"), each skill showing which/how-many near-miss
  jobs it would unlock, deep-linking to those jobs.
- **API endpoint:** `GET /api/recommendations/opportunities/`.
- **Primary action:** "View job" on a near-miss card (deep-link to Job
  Detail); "See the N jobs this would help with" on a missing-skill row
  (deep-links using `job_ids`, e.g. opens a small list/modal of those
  job titles linking out).
- **Secondary action:** "Update your skills" → links to Worker Profile
  Skills section (§6), since adding a skill is the natural next step,
  even though the advisory itself doesn't submit anything.
- **Desktop layout:** Two clearly separated sections stacked vertically
  (Near-miss jobs, then Missing skills) — not tabs, since both are useful
  together as "here's the gap, here's why."
- **Tablet/mobile adaptation:** Same vertical stacking, full width;
  missing-skill rows collapse extra job links behind a "See all N jobs"
  expandable line if the list is long.
- **Presentation detail:** each missing-skill row is phrased as a
  sentence, not a table: "**Tile Installation** — needed for 1 job you're
  close to qualifying for," using `missing_frequency`/`job_ids` to
  compute the sentence, matching the proposal's own worked example
  phrasing style ("Suggested Skill: X — Reason: …") translated into UI
  copy.
- **Reusable components:** `NearMissJobCard` (reuses `RecommendationCard`),
  `MissingSkillRow`, `UnlockedJobsLink`.
- **States:**
  - Loading: skeleton sections.
  - Empty (no near-miss jobs and no missing skills): a positive framing
    ("You're either well-matched already or there's nothing close yet —
    check Recommended Jobs") rather than a bare "no data" message.
  - Warning: cold-start cases where a worker has no coordinates on file
    surface the same "distance unknown" warning pattern as §11 within
    the near-miss cards.
  - Error: standard retry banner.
- **Omitted:** no "start a course" or training-provider integration (the
  proposal's "future expansion" — explicitly out of scope for this
  version), no direct "request this skill be added" form (unmatched-term
  handling is admin-side only, surfaced passively during profile save,
  §6).

---

## 13. CV Preview & PDF Download (Worker)

- **Route:** `/worker/cv`
- **Permitted role:** Worker.
- **Page hierarchy:** Explanatory header ("Your CV, generated
  automatically from your profile") → embedded HTML preview → Download
  PDF button → note that editing happens on the Profile screen, not here.
- **API endpoints:** `GET /api/profiles/worker/me/cv/preview/` (HTML),
  `GET /api/profiles/worker/me/cv/pdf/` (binary PDF, filename from
  `Content-Disposition`).
- **Primary action:** "Download PDF."
- **Secondary action:** "Edit your profile" (links to §6, since there is
  no in-place CV editor — content is fully derived).
- **Desktop layout:** Centered, page-like preview (mimicking a printed
  CV's proportions) with the Download button fixed above/below it.
- **Tablet/mobile adaptation:** Preview scales to full viewport width,
  scrollable; Download button as a full-width sticky bottom bar.
- **Reusable components:** `CVPreviewFrame` (renders the returned HTML
  safely, e.g. sandboxed iframe or sanitized render), `DownloadButton`.
- **States:**
  - Loading: skeleton page-shaped placeholder.
  - Empty/`404` (no profile yet — edge case): prompt to complete the
    profile first.
  - Success: PDF download triggers the browser's normal save flow using
    the server-provided filename.
  - Error: retry banner; if the PDF endpoint fails while preview
    succeeded, only the Download button shows an inline error, not the
    whole page.
- **Omitted:** no manual CV text editing, no alternate CV templates/
  themes (single deterministic template only), no photo on the CV (no
  image field exists).

---

## 14. Worker Ratings Summary

- **Route:** `/worker/ratings`
- **Permitted role:** Worker.
- **Page hierarchy:** Aggregate summary card (`average_rating`,
  `rating_count`) → list of individual ratings received (from completed
  applications), each showing score, review text, and which employer/
  engagement it relates to.
- **API endpoints:** `GET /api/applications/ratings/summary/`;
  individual ratings surface via `GET /api/applications/<id>/rating/`
  accessed from each completed application row in §10 (there is no
  separate "list all my ratings" endpoint — the summary + per-application
  detail is the full picture the backend provides).
- **Primary action:** none (read-only screen) — rating submission itself
  happens from the relevant completed application in §10, not from this
  summary screen.
- **Desktop layout:** Summary card at top (large average-rating number +
  star-style visual + count), list of past ratings below.
- **Tablet/mobile adaptation:** Same stacking, full width.
- **Reusable components:** `RatingSummaryCard`, `StarRatingDisplay`,
  `RatingHistoryRow`.
- **States:**
  - Loading: skeleton summary + rows.
  - Empty (`rating_count: 0`, `average_rating: null`): "No ratings yet —
    complete a job to start building your rating," a supportive framing
    rather than implying a problem.
  - Error: retry banner.
- **Omitted:** no ability to dispute/flag a received rating (no
  complaint model exists) and no editing of a submitted rating after the
  fact (not supported by `RatingCreateSerializer`, which only creates).

---

## 15. Employer Dashboard

- **Route:** `/employer`
- **Permitted role:** Employer.
- **Page hierarchy:** Welcome header → verification-status banner
  (prominent if not yet verified — see §16) → summary cards (Open jobs
  count, New applications count, Rating summary snippet) → shortcut
  tiles (Post a Job [disabled until verified], My Jobs, Applicants,
  Profile).
- **API endpoints:** `GET /api/auth/me/`,
  `GET /api/profiles/employer/me/` (for `verification_status`),
  `GET /api/jobs/` (counts/snippets),
  `GET /api/applications/ratings/summary/`.
- **Primary action:** "Post a Job" (enabled only if
  `verification_status === "VERIFIED"`; otherwise shown disabled with a
  tooltip/inline note: "Available once your account is verified").
- **Secondary action:** "View My Jobs," "View Applicants."
- **Desktop layout:** Verification banner full-width at top (if
  relevant), then a 2–3 column summary-card grid, then shortcut tiles.
- **Tablet/mobile adaptation:** Same vertical order, cards/tiles reflow
  to 1–2 per row.
- **Reusable components:** `VerificationStatusBanner`, `SummaryCard`,
  `ShortcutTile` (shared with Worker Dashboard).
- **States:**
  - Loading: skeleton cards.
  - Empty (no jobs posted yet, verified employer): "You haven't posted a
    job yet" CTA straight to Post a Job.
  - Empty (unverified employer): dashboard still fully viewable; only
    the job-posting/worker-recommendation affordances are gated, with
    plain copy explaining why, not a blank/broken screen.
  - Error: per-card graceful degradation, as in §7.
- **Omitted:** no "request verification" button anywhere on this
  dashboard (§16 explains why), no platform-wide analytics.

---

## 16. Employer Profile & Verification Status

- **Route:** `/employer/profile`
- **Permitted role:** Employer.
- **Page hierarchy:** Verification-status badge (read-only, prominent,
  at the top) → progressive sections: **Organization** (organization
  name, PAN/VAT) → **Location** (address + lat/long, same pattern as §6)
  → Save actions per section.
- **API endpoints:** `GET /api/profiles/employer/me/`,
  `PUT`/`PATCH /api/profiles/employer/me/`.
- **Primary action:** Save each section independently (`PATCH`).
- **Secondary action:** none additional — no verification-request
  button, per constraint.
- **Verification badge states (must be visually distinct and plainly
  worded):**
  - `VERIFIED` — green badge, "Verified employer."
  - `PENDING` — amber badge, "Verification pending — an administrator
    will review your account. You'll be able to post jobs once
    verified." (No estimated timeframe invented, since the backend
    doesn't provide one.)
  - `REJECTED` (if this status value exists in the backend's choices) —
    red/muted badge with a plain statement that verification was not
    approved, and no in-app appeal action (none exists) — if the person
    needs to know why or how to proceed, direct them to how they'd reach
    an administrator through whatever contact channel the organization
    actually offers outside this app; do not invent an in-app appeal flow.
- **Desktop layout:** Badge banner full width at top; two-column form
  below (Organization fields left, Location fields right) or stacked
  cards — either works; stacked cards are simpler to keep consistent
  with the Worker Profile pattern.
- **Tablet/mobile adaptation:** Single column, same accordion pattern as
  §6.
- **PAN/VAT field:** explicit format hint ("9 digits, e.g. 123456789"),
  inline validation matching the backend's exact-9-digit rule, with the
  backend's own duplicate-PAN error surfaced in plain language ("This
  PAN/VAT number is already registered to another employer account").
- **Reusable components:** `VerificationStatusBanner` (shared with §15),
  `ProfileSectionAccordion` (shared with §6), `PanVatField`.
- **States:**
  - Loading: skeleton.
  - Success: inline "Saved" confirmation per section.
  - Error (`400`): field-level plain-language messages (bad PAN/VAT
    format, duplicate PAN/VAT).
- **Omitted:** no document/photo upload for verification, no self-service
  "submit verification request" button or status-tracking timeline
  beyond the current badge — because no such endpoint exists; the
  Django admin is where verification actually happens (§0).

---

## 17. Job Creation, Editing, Listing, and Closing (Employer)

### 17.1 My Jobs (list)

- **Route:** `/employer/jobs`
- **Permitted role:** Employer.
- **API endpoint:** `GET /api/jobs/`.
- **Primary action:** "Post a Job" (verified employers only — disabled
  with explanatory tooltip otherwise).
- **Secondary action:** filter/tab by `status` (`ACTIVE` / `CLOSED`) —
  a client-side filter over the single returned array, not a server
  query param (the backend doesn't filter this list server-side; the
  full array is fetched once and filtered/tabbed in the UI).
- **Desktop layout:** Table-like list (title, status badge, applicant
  count if derivable, posted date) with row click → owner Job Detail.
- **Tablet/mobile adaptation:** Card-per-job, stacked.
- **Reusable components:** `JobStatusFilterTabs`, `JobOwnerRow`/
  `JobOwnerCard`, `StatusBadge` (Active = green, Closed = slate/muted —
  never implying "closed" is a failure state).
- **States:** loading skeleton; empty ("You haven't posted a job yet");
  error retry banner.
- **Omitted:** no delete action anywhere in this list — closing is the
  only status-changing action, and it's irreversible in the UI's own
  framing (the backend rejects reopening a closed job with `400`), so
  Close requires an explicit confirmation dialog (§12 requirement for
  consequential actions).

### 17.2 Job Create / Edit

- **Route:** `/employer/jobs/new` and `/employer/jobs/:id/edit`
- **Permitted role:** Verified employer (create); owning employer (edit,
  any verification status — editing an existing job doesn't require
  re-verification, only initial creation does, per the backend's
  `IsVerifiedEmployer` gate on `POST` only).
- **Page hierarchy (progressive form):** **Basics** (title, category →
  subcategory, description) → **Location** (address + lat/long) →
  **Terms** (wage_type, wage_amount, work_type, required_experience_years,
  scheduled_datetime, duration_days, number_of_workers_required,
  application_deadline) → **Skills** (required_skills_input,
  preferred_skills_input — same free-text chip pattern as §6, clearly
  separating "Required" from "Preferred" as two distinct chip lists).
- **API endpoints:** `POST /api/jobs/` (create),
  `PUT`/`PATCH /api/jobs/<id>/` (edit).
- **Primary action:** "Publish job" (create) / "Save changes" (edit).
- **Secondary action:** "Save as draft" — **omitted**: the backend has no
  draft/status value beyond `ACTIVE`/`CLOSED`, so there is no draft
  state; a created job is immediately `ACTIVE`. The form should message
  this plainly ("This job will be visible to workers as soon as you
  publish it") rather than implying a hidden draft exists.
- **Desktop layout:** Same accordion/section pattern as profile forms;
  a live "Preview" panel on the right showing how the job will appear on
  Job Browse/Detail.
- **Tablet/mobile adaptation:** Single column, sections expand one at a
  time; Preview becomes a "Preview" button opening a bottom sheet/modal.
- **Skill input detail:** unmatched terms
  (`unmatched_required_terms`/`unmatched_preferred_terms`) surfaced with
  the same amber notice pattern as §6, separately for required vs.
  preferred.
- **Category/Subcategory:** dependent dropdowns from
  `GET /api/taxonomy/categories/` and
  `GET /api/taxonomy/subcategories/?category=`; the form prevents
  submitting a subcategory that doesn't belong to the chosen category
  client-side (defensive validation ahead of the backend's own `400`).
- **Reusable components:** `ProfileSectionAccordion` (reused),
  `CategorySelect`/`SubcategorySelect` (reused from Browse), `WageFields`
  (type + amount), `WorkTypeSelect`, `DateTimeField`,
  `ApplicationDeadlineField`, `SkillChipInput` ×2 (required/preferred),
  `JobPreviewCard`.
- **States:**
  - Loading (edit mode): skeleton form pre-filled from
    `GET /api/jobs/<id>/`.
  - Success: redirect to owner Job Detail with confirmation.
  - Error (`400`): subcategory-mismatch, past-deadline, and other
    field errors shown inline in plain language; `403` (creating while
    unverified — shouldn't be reachable if the Post-a-Job entry point is
    correctly gated, but handled defensively with a redirect back to the
    verification-status explanation in §16).
- **Omitted:** no photo/attachment upload on a job post, no "boost" or
  "featured job" paid option (no payments exist), no draft-save state.

### 17.3 Owner Job Detail (view/edit/close)

- **Route:** `/employer/jobs/:id`
- **Permitted role:** Owning employer.
- **Page hierarchy:** Job header + status badge → full detail (same
  fields as public detail, plus owner-only fields like raw skill-input
  lists) → action row (Edit, Close) → quick links (Applications for this
  job, Candidates, Worker Recommendations if verified).
- **API endpoint:** `GET /api/jobs/<id>/` (owner view),
  `PATCH /api/jobs/<id>/` (Close: `status: "CLOSED"`).
- **Primary action:** "Close this job" — explicit confirmation dialog
  ("This will stop new applications. You can't reopen a closed job.
  Continue?"), matching the backend's rejection of reopening.
- **Secondary action:** "Edit job."
- **Desktop layout:** Two-column — details left, action/quick-links panel
  right (sticky).
- **Tablet/mobile adaptation:** Single column; action buttons as a
  sticky bottom bar.
- **Reusable components:** `JobDetailHeader` (reused), `StatusBadge`,
  `CloseJobConfirmDialog`, `QuickLinkCard`.
- **States:** loading skeleton; `403`/`404` (not owner / not found) →
  redirect to My Jobs with a plain message; Close success → status badge
  updates in place to "Closed" (slate), action row updates to remove
  further status actions (closed is terminal).
- **Omitted:** no reopen/delete actions.

---

## 18. Applicant Management & Valid Application-State Actions (Employer)

- **Route:** `/employer/jobs/:id/applications`
- **Permitted role:** Owning employer.
- **Page hierarchy:** Job context header (title, status) → status filter
  tabs (mirroring the 8 statuses, grouped sensibly: "New" = `APPLIED`,
  "In progress" = `SHORTLISTED`/`CONTACTED`/`HIRED`, "Closed out" =
  `REJECTED`/`WITHDRAWN`/`COMPLETED`/`CANCELLED`) → applicant list, each
  row showing worker username, applied date, current status, and
  action buttons computed from the transition table.
- **API endpoints:** `GET /api/jobs/<job_id>/applications/`,
  `PATCH /api/applications/<id>/status/`.
- **Primary actions (rendered only when legal for the current status,
  per §8 of the backend context):**
  - `APPLIED` → Shortlist / Contact / Reject
  - `SHORTLISTED` → Contact / Hire / Reject
  - `CONTACTED` → Hire / Reject
  - `HIRED` → Mark Completed / Cancel
  - Terminal statuses → no buttons, read-only row.
- **Secondary action:** "View worker's application details" (expands
  `worker_note`, and once completed, links to "Rate this worker").
- **Desktop layout:** Table-like list similar to §10 but from the
  employer's side, action buttons as a button group per row.
- **Tablet/mobile adaptation:** Card-per-applicant, action buttons as a
  full-width stacked group within the card.
- **Reusable components:** `ApplicationStatusFilterTabs` (reused
  pattern from §10), `ApplicantRow`/`ApplicantCard`, `StatusChip`
  (shared palette with §10 — identical colors/labels both sides, since
  it's the same status for the same application, just viewed from the
  other participant), `StatusTransitionButtonGroup`,
  `EmployerNoteField` (optional note attached to a transition),
  `RateEngagementButton`.
- **Consequential-action confirmation:** Reject and Cancel show a brief
  confirm step (they're not reversible); Shortlist/Contact/Hire/Complete
  do not need confirmation (they're forward progress, not destructive).
- **States:**
  - Loading: skeleton rows.
  - Empty: "No applications yet for this job."
  - Error (`400` illegal transition): shouldn't surface given button
    gating, but defensively shown as a plain retry message if it does
    (e.g. a race condition where the worker withdrew moments earlier).
  - Success: status updates in place with a brief confirmation toast.
- **Omitted:** no bulk actions (not modeled by the single-application
  `PATCH` endpoint), no messaging the applicant directly.

---

## 19. Recommended Workers & Candidate Comparison (Employer)

### 19.1 Candidates (coarse list, any employer)

- **Route:** `/employer/jobs/:id/candidates`
- **Permitted role:** Owning employer (any verification status).
- **API endpoint:** `GET /api/jobs/<id>/candidates/?max_distance_km=`.
- **Page hierarchy:** Distance filter (optional param) → plain candidate
  list (`WorkerCandidateSerializer` fields: username, address,
  experience, availability, skills — **no phone number, no score**).
- **Primary action:** none beyond viewing (this list is intentionally
  unscored — a coarse pre-filter, not a ranking).
- **Reusable components:** `CandidateCard` (distinct, simpler than
  `RecommendationCard` — no score bars, since none exist for this
  endpoint).
- **States:** loading skeleton; empty ("No candidates found within this
  distance — try widening it"); error retry.
- **Omitted:** no contact action (no phone number in this shape), no
  scoring/ranking display (this endpoint deliberately has none — do not
  synthesize a score client-side).

### 19.2 Worker Recommendations (verified employers only)

- **Route:** `/employer/jobs/:id/recommendations`
- **Permitted role:** **Verified** employer, job owner only — gated both
  by hiding the nav entry point for unverified employers and by handling
  a `403` gracefully if reached directly.
- **API endpoint:** `GET /api/recommendations/jobs/<job_id>/workers/?limit=`.
- **Page hierarchy:** Same explainable-score presentation as §11's
  `RecommendationCard`, adapted for `RecommendedWorkerSerializer` (no
  phone number — never add a "contact this worker" affordance).
- **Primary action:** none beyond viewing/comparing (there is no "invite
  to apply" or "send request" endpoint — the proposal's "Send Direct
  Requests" use case is not implemented and is excluded here).
- **Candidate comparison:** presenting the ranked list itself, with each
  worker's score breakdown expandable, **is** the comparison mechanism —
  no separate side-by-side comparison table is needed since the ranking
  order plus per-candidate reasons already lets an employer compare at a
  glance; a side-by-side view can be offered as a "select up to 3 to
  compare" toggle that shows their score bars aligned in columns, purely
  as a client-side re-layout of already-fetched data (not a new endpoint).
- **Desktop layout:** Same ranked-card-list pattern as §11.
- **Tablet/mobile adaptation:** Same single-column pattern as §11.
- **Reusable components:** `RecommendationCard` (shared, with
  worker-oriented fields), `ScoreBar`, `ReasonsList`, `WarningsList`,
  `MutualFitBadge`, optional `CompareColumnsView`.
- **States:**
  - `403` (not verified, or not owner): redirect/plain message pointing
    back to the verification-status explanation (§16) or My Jobs.
  - Empty: "No matching workers yet for this job."
  - Loading/error: standard patterns as §11.
- **Omitted:** no direct-invite/request action, no worker contact
  details, no chat.

---

## 20. Employer Ratings Summary

- **Route:** `/employer/ratings`
- **Permitted role:** Employer.
- **Page hierarchy:** Aggregate summary (`average_rating`,
  `rating_count`, as rated *by* workers) → per-application rating
  history, same pattern as §14 but employer-facing.
- **API endpoints:** `GET /api/applications/ratings/summary/`; individual
  ratings via `GET /api/applications/<id>/rating/` from each completed
  application row in §18.
- **Primary action:** none (read-only) — rating submission happens from
  the completed application row in §18, not here.
- **Layout/components/states:** identical pattern to §14
  (`RatingSummaryCard`, `StarRatingDisplay`, `RatingHistoryRow`), reused
  wholesale — the only difference is which side's aggregate is fetched.
- **Omitted:** same as §14 — no dispute/flagging, no editing after
  submission.

---

## 21. Loading, Empty, Success, Warning, Error, Unauthorized, Offline States — global patterns

These patterns are referenced by name throughout §4–20; this section
defines them once as shared, reusable components/behaviors.

| State | Pattern | Notes |
|---|---|---|
| **Loading** | Skeleton shapes matching the eventual content's layout (never a generic spinner-only screen for content-bearing views); a small inline spinner is acceptable only for button-level actions (Save, Apply, Log in). | Skeletons prevent layout jump and read as "working," not "broken," to less experienced users. |
| **Skeleton** | Rounded gray blocks at 60–70% opacity, same radius tokens as real content, subtle pulse animation (respecting `prefers-reduced-motion`). | Shared `SkeletonBlock`/`SkeletonCard` components. |
| **Empty** | Always a specific, supportive sentence (never a bare "No data" or blank space) plus, where relevant, a CTA to the natural next action (e.g. Browse Jobs, Complete Profile, Clear Filters). | Every list screen in §5 of the backend context has a designed empty state per the requirement — this table is the shared implementation of that. |
| **Success** | Explicit confirmation for every mutating action — inline "Saved"/checkmark for form saves, toast/banner for standalone actions (Apply, Withdraw, Close job, status transitions, rating submitted). | Never rely on a silent UI update; this audience may not infer success without a signal. |
| **Warning** | Amber-colored, visually distinct from both error (red) and reason/success (green) — used for unmatched skill terms, near-miss/distance-unknown notices, pending verification. | Warnings inform without blocking the user's flow. |
| **Error** | Plain-language, field-level where possible; a shared `ErrorBanner`/`InlineFieldError` translates DRF's `{"detail": "..."}` or field-keyed arrays, including passing through already-plain service-layer messages verbatim (e.g. "Cannot transition application from APPLIED to COMPLETED.") rather than re-wording them into something vaguer. | Never show raw JSON or stack traces. |
| **Unauthorized** | `401` on a protected route → attempt silent refresh + one retry (§3.6) → if that fails, redirect to Login with "Your session ended — please log in again," preserving intended destination where feasible. A `403` (e.g. unverified employer hitting a gated action) → plain explanatory message with a link to the relevant status screen (§16), not a generic "Forbidden." | Distinguish 401 (session) from 403 (permission) in messaging — they mean different things to the user. |
| **Offline** | A top-of-screen persistent banner ("You appear to be offline — some actions won't work until you're back online") when a request fails due to no network reachability (distinct from a server error). Retryable actions queue a manual "Retry" button rather than silently failing. | Relevant given the audience may be on inconsistent mobile data. |

---

## 22. Accessibility & usability for limited digital experience

- **Touch targets:** ≥44×44px minimum for every interactive element,
  including checkboxes, chip-remove buttons, and status filter tabs.
- **Contrast:** WCAG AA minimum throughout (§2.1), with extra margin for
  primary actions given the outdoor-use case.
- **Icon + text everywhere in navigation** (already required in §3) —
  extended here to in-page controls too: filter chips, action buttons,
  and tab bars all pair a recognizable icon with a short label, never
  icon-only.
- **Plain-language error and status copy** throughout (§21) — no DRF
  jargon, no technical field names surfaced to the user.
- **Explicit confirmation for consequential, hard-to-reverse actions:**
  Withdraw application, Close job, Reject/Cancel an application. No
  reliance on "undo" patterns, since undo requires understanding a
  transient toast affordance that's easy to miss.
- **Progressive disclosure for long forms** (§2.6) so no single screen
  ever presents an overwhelming number of fields at once.
- **Consistent, limited iconography and color vocabulary** — the same
  icon always means the same thing across the whole app (e.g. the same
  "clock" icon for "Pending" everywhere it appears), so recognition
  transfers between screens instead of requiring re-learning.
- **Screen-reader and keyboard support:** all interactive elements
  reachable via keyboard tab order; status changes (e.g. a status chip
  updating) announced via `aria-live` regions; form errors associated
  with their fields via `aria-describedby`.
- **Forgiving input:** phone number and PAN/VAT fields accept digits with
  or without spaces/dashes and normalize client-side before submission;
  skill-input chips are easy to remove (large "×" tap target) in case of
  a mis-typed entry.
- **No reliance on hover-only affordances** (hover states have no
  meaning on touch devices, which this audience predominantly uses) —
  every hover-revealed action also has a persistently visible or
  tap-revealed equivalent.

---

## 23. Future Nepali-language readiness

The backend has no i18n strings or `Accept-Language` handling today — all
`reasons`, `warnings`, and error `detail` messages are English-only,
generated server-side (per `FRONTEND_CONTEXT.md` §12). This section
specifies how the *frontend* should be structured today so that adding
Nepali later is a content addition, not a rewrite — without implying any
localization exists yet.

- **All frontend-owned copy** (navigation labels, buttons, static page
  text, form labels, empty/success/error wrapper copy, onboarding
  explanations) should be routed through a message-catalog/i18n library
  from the start (e.g. keyed strings rather than inline literals),
  even though only an English catalog ships in this version.
- **Backend-sourced strings** (`reasons`, `warnings`, DRF error `detail`
  text, service-layer validation messages) are rendered **as received**
  — the frontend must not attempt client-side translation, string-
  matching, or pattern-based localization of these, since that would
  silently break the moment backend wording changes. If localizing these
  specific strings becomes a requirement, that is a backend change to
  flag separately, not a frontend workaround.
- **Layout tolerance for longer strings:** since Nepali (Devanagari) text
  is often visually taller/denser than English, buttons, chips, and nav
  labels should be built with flexible width/height (no hard-truncated,
  fixed-pixel label boxes) so a future translation doesn't break layout.
- **Font pairing:** the primary typeface choice (§2.2) should have a
  same-family or visually-compatible Devanagari counterpart available in
  advance (e.g. Noto Sans / Noto Sans Devanagari), so swapping in Nepali
  content later doesn't require a typography redesign.
- **No language switcher is built in this version** — since the backend
  doesn't support it yet, adding a switcher control now would be a
  non-functional UI element. This is deferred until backend i18n support
  exists.
- **Skill-input hint text** already acknowledges Romanized Nepali phrases
  are accepted (§6, §17.2) as a content-level nod to the target
  audience, distinct from full UI localization.

---

## Appendix: Shared component inventory (referenced throughout)

`AuthCard`, `TextField`, `PasswordField`, `PhoneField`, `PanVatField`,
`NumberField`, `ToggleSwitch`, `RoleToggle`, `PrimaryButton`,
`InlineErrorMessage`, `ErrorBanner`, `SkeletonBlock`/`SkeletonCard`,
`EmptyState`, `StatusBadge`/`StatusChip` (shared 8-status palette),
`ProfileSectionAccordion`, `AddressField`, `CoordinateCapture`,
`SkillChipInput`, `UnmatchedTermNotice`, `CategorySelect`,
`SubcategorySelect`, `WorkTypeSelect`, `DistanceSlider`/`DistanceField`,
`WageFields`, `DateTimeField`, `ApplicationDeadlineField`, `JobCard`,
`JobDetailHeader`, `EmployerSummaryCard`, `ApplyPanel`,
`RecommendationCard`, `ScoreBar`, `MatchScoreRing`, `MutualFitBadge`,
`ReasonsList`, `WarningsList`, `NearMissJobCard`, `MissingSkillRow`,
`CVPreviewFrame`, `DownloadButton`, `RatingSummaryCard`,
`StarRatingDisplay`, `RatingHistoryRow`, `VerificationStatusBanner`,
`CandidateCard`, `ApplicantRow`/`ApplicantCard`,
`StatusTransitionButtonGroup`, `CloseJobConfirmDialog`,
`WithdrawConfirmDialog`, `ShortcutTile`, `SummaryCard`,
`CategoryTile`, `SectionHeading`, `CTAButton`.

---

*End of FRONTEND_DESIGN_SPEC. No implementation code, components, or
backend changes are included — this document is a design specification
only, to be handed to a frontend coding agent as the next step.*
