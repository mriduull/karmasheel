# Frontend Context — Handoff Document

Complete handoff for a frontend designer and a frontend coding agent building
a React + TypeScript + Tailwind CSS client against the existing Workforce Matching
Django REST API. This document describes **only what the backend actually
does today**, verified by reading the repository (models, serializers,
views, URLs, permissions, settings) as of Week 6 Phase 4. It does not
describe aspirational or proposal-only functionality — see §15 for how to
resolve any conflict between this document, the proposal, and the code.

No application code, tests, models, migrations, database data, or frontend
files were changed to produce this document.

---

## 1. Product purpose and target users

Workforce Matching is a workforce-matching and opportunity-advisory platform
connecting **blue-collar and local-service workers** with **employers** in
Nepal, using structured skills, location, availability, experience,
preferences, and reliability indicators — with every match explained in
plain language rather than produced by an opaque model
(`backend/recommendations/services.py`).

**Target users** (per `docs/IMPLEMENTATION_PLAN.md` and the data model):

- **Blue-collar and local-service workers** — electricians, plumbers,
  masons, cleaners, cooks, etc. The seeded taxonomy
  (`backend/taxonomy/management/commands/seed_taxonomy.py`) reflects this:
  two categories ("Construction & Repair", "Domestic & Local Services"),
  five subcategories, twenty standardized skills.
- **Students searching for temporary or part-time gigs** — supported
  structurally through `JobPost.work_type` values `PART_TIME`, `CONTRACT`,
  and `ONE_TIME` (`backend/jobs/models.py`), though there is no
  student-specific role, filter, or UI concept anywhere in the backend.
  Treat this as "a worker looking for short-term work" — the same
  `WorkerProfile` and application flow apply.
- **Employers, businesses, households, and organizations** — modeled as a
  single `EmployerProfile` with an optional `organization_name`
  (`backend/profiles/models.py`); there is no distinct "household" vs.
  "business" account type.

**Nepal-specific usability considerations** the backend already bakes in,
which the frontend should honor rather than re-decide:

- **Romanized Nepali skill aliases** alongside English (e.g. "ghar wiring"
  → "House Wiring") via `SkillAlias.language` (`EN` / `NE_ROMANIZED`) —
  see §7. Any worker-facing skill-input field should communicate that both
  English and Romanized Nepali phrases are accepted.
- **PAN/VAT format validation** for employers — exactly 9 digits
  (`backend/profiles/models.py:pan_vat_number_validator`). Nepal's PAN/VAT
  registration number format.
- **Distance in kilometres**, not miles, throughout
  (`haversine_distance_km`, `MAX_DISTANCE_KM` default 20 km).
- **Phone number as a required, unique identifier** (`User.phone_number`,
  max length 10, `REQUIRED_FIELDS = ["phone_number"]`) — reflecting that
  phone numbers, not email, are the primary contact channel for this user
  base. Registration and profile forms should treat phone number as
  first-class, not secondary to email.
- No language-switcher exists yet in the backend (no i18n strings, no
  `Accept-Language` handling) — see §12 for localization-readiness
  guidance for the frontend.

---

## 2. Current implementation status

This is a condensed, frontend-focused view of
[`docs/DEFERRED_SCOPE.md`](DEFERRED_SCOPE.md) — read that file for the full
narrative; this section exists so a frontend agent doesn't have to
cross-reference two documents while scoping a screen.

### Fully implemented (build UI for these)

- Custom `User` model + JWT auth (login/refresh/logout/`me`), worker/
  employer roles (`backend/accounts/`).
- Worker & employer profile CRUD, PAN/VAT validation
  (`backend/profiles/`).
- Auto-generated worker CV — HTML preview + PDF download
  (`backend/profiles/services.py`, `backend/profiles/views.py`).
- Structured taxonomy browsing + skill normalization pipeline
  (`backend/taxonomy/`).
- Job-post CRUD, public browsing, category/subcategory/work-type/distance
  filtering in both directions (`backend/jobs/`).
- Application state machine, worker withdrawal, employer shortlist/
  contact/reject/hire/complete, duplicate-application prevention
  (`backend/applications/`).
- Ratings in both directions after a completed application, aggregate
  rating summary (`backend/applications/services.py`).
- Explainable hybrid recommendation engine (worker→job and job→worker)
  with a full score breakdown and human-readable reasons/warnings
  (`backend/recommendations/services.py`).
- Opportunity advisory: near-miss jobs + ranked missing-skill suggestions
  (`backend/recommendations/advisory.py`).
- `seed_demo` management command producing a complete, coherent demo
  dataset — see §10.

### Partially implemented (build UI carefully, don't over-promise)

- **Contact verification** (`User.is_contact_verified`) and **employer
  verification** (`EmployerProfile.verification_status`) are both manual
  admin toggles, not real OTP/SMS/email/document-verification flows.
  There is no user-facing "verify my phone" or "submit documents" screen
  to build, because no such endpoint exists — verification only happens
  via the Django admin.
- **No pagination anywhere.** Every list endpoint
  (`/api/jobs/browse/`, `/api/jobs/`, `/api/applications/`,
  `/api/jobs/<id>/candidates/`, taxonomy lists, recommendation lists)
  returns a plain JSON array, not a `{count, next, previous, results}`
  envelope. Design list screens assuming the full result set arrives in
  one response; do not build "next page" controls the API cannot serve.
- **No text search on jobs** — `/api/jobs/browse/` filters by category,
  subcategory, work type, and distance only, not by keyword.

### Intentionally deferred (do not build UI for these)

Complaints/disputes, trusted-worker rehiring, notifications, advanced
analytics, file/photo/document uploads, advanced NLP/embeddings, password
reset, production-only concerns (rate limiting, etc.). Full list in
[`docs/DEFERRED_SCOPE.md`](DEFERRED_SCOPE.md) §"Intentionally deferred" and
§"Future enhancements". Restated as explicit exclusions in §13 below.

### Mentioned in the proposal but absent from the repository

- A minimal HTML frontend was listed as optional Week 6 scope in
  `docs/IMPLEMENTATION_PLAN.md` — the `frontend/` directory exists and is
  empty. This handoff document is what replaces that gap.
- Any student-specific account type, filter, or badge — not modeled;
  students are just workers (see §1).
- Any "household" vs. "business" employer distinction — not modeled;
  employers are a single profile type with an optional organization name.

---

## 3. User roles and permissions

Enforced via `accounts/permissions.py`, `jobs/permissions.py`, and
per-view `permission_classes`/`get_permissions()` overrides. There is no
separate "roles" table — role is a single `User.role` field
(`WORKER` / `EMPLOYER` / `""` for staff-only accounts).

| Role | How it's determined | What it can do |
|---|---|---|
| **Public visitor** (unauthenticated) | No token | Browse active jobs (`GET /api/jobs/browse/`), view one active job's public detail (`GET /api/jobs/<id>/`), browse the full taxonomy tree/list endpoints. Cannot see any employer contact info, PAN/VAT, phone numbers, or non-active jobs. |
| **Worker** | `User.role == "WORKER"` | Everything a public visitor can, plus: manage own `WorkerProfile` and CV, apply to jobs, view/withdraw own applications, view own recommendations and opportunity advisory, rate an employer after a completed application, view own rating summary. Cannot post jobs or view other workers' data. |
| **Employer** | `User.role == "EMPLOYER"` | Manage own `EmployerProfile` (verification status is read-only to them — set only by an admin), list/view own job posts, view applications and candidates for own jobs, transition own jobs' applications (shortlist/contact/reject/hire/complete), rate a worker after completion, view own rating summary. **Cannot create a job post or request worker recommendations until verified** — see below. |
| **Verified employer** | `EmployerProfile.verification_status == "VERIFIED"`, checked by `IsVerifiedEmployer` (`backend/jobs/permissions.py`) | Everything an employer can, plus: create job posts (`POST /api/jobs/`), request ranked worker recommendations for a job (`GET /api/recommendations/jobs/<job_id>/workers/`). An unverified/pending employer gets `403 Forbidden` on both. |
| **Django administrator** | `is_staff` / `is_superuser` | Full Django admin access at `/admin/`: verify/reject employers, mark contact verified/unverified, review and resolve `UnmatchedSkillTerm` entries, inspect/moderate (not create) ratings, manage taxonomy, and — for newly-created applications only — edit fields directly (existing applications lock `worker`/`job`/`status` to force all status changes through the state-machine service; see `backend/applications/admin.py`). **The Django admin is server-rendered, not part of the React frontend** — link out to it or treat it as out of scope for the SPA, per the frontend's own screen inventory in §14.

Frontend routing implication: role-based routing should branch on
`GET /api/auth/me/` → `role` immediately after login (§6), and a verified-
employer-only affordance (e.g. "Post a Job" button, "View Recommended
Workers") should additionally check
`EmployerProfile.verification_status` from `GET /api/profiles/employer/me/`
before rendering as enabled, since the backend will otherwise return `403`.

---

## 4. Actual user journeys supported by the backend

Each of these is fully backed by working endpoints (§5) and covered by
automated tests (`backend/*/tests.py`):

1. **Worker registration → login → profile.** Register
   (`POST /api/auth/register/`, `role: "WORKER"`) auto-creates an empty
   `WorkerProfile` server-side (`accounts/serializers.py:RegisterSerializer.create`)
   → log in → `GET/PUT/PATCH /api/profiles/worker/me/` to fill in
   address, coordinates, experience, availability, wage, travel radius,
   and skills (via `skill_input`, free text, normalized server-side).
2. **Employer registration → login → profile → verification.** Same
   registration flow with `role: "EMPLOYER"` auto-creates an empty
   `EmployerProfile` → fill in organization name, address, coordinates,
   PAN/VAT → **verification is out-of-band** (an admin must change
   `verification_status` via `/admin/`; there is no self-serve "request
   verification" endpoint to build a button for — only a status *display*).
3. **Taxonomy browsing and skill normalization.** A worker or job form
   offers free-text skill entry; the backend resolves each phrase through
   `normalize_skill_phrase` (preprocess → exact name → exact alias →
   RapidFuzz fuzzy ≥ threshold → unmatched) and returns which phrases
   matched vs. which didn't (`unmatched_terms` / `unmatched_required_terms`
   / `unmatched_preferred_terms` in the response — see §7). The frontend
   should surface unmatched terms back to the user ("we couldn't confidently
   match: 'X' — an admin will review it") rather than silently dropping
   them.
4. **Job browsing and filtering** (public, no login required) by category,
   subcategory, work type, and distance (`GET /api/jobs/browse/`).
5. **Job creation and management** (verified employers only): create,
   view own list, update, and — the only status-changing action available
   — set `status: "CLOSED"` via `PATCH`. **There is no delete-job
   endpoint.**
6. **Application workflow**: worker applies → appears in the employer's
   `GET /api/jobs/<job_id>/applications/` → employer shortlists/contacts/
   hires/rejects → worker can withdraw at any point while still in
   `APPLIED`/`SHORTLISTED`/`CONTACTED` → employer marks `COMPLETED` (only
   reachable from `HIRED`) or `CANCELLED`. Full transition table in §8.
7. **Recommendations**: a worker sees ranked, explained job matches
   (`GET /api/recommendations/jobs/`); a verified employer sees ranked,
   explained worker candidates for one of their jobs
   (`GET /api/recommendations/jobs/<job_id>/workers/`).
8. **Opportunity advisory**: a worker sees "near miss" jobs (final score in
   a configurable band, currently 40–75) and which specific skills, if
   learned, would unlock the most of them
   (`GET /api/recommendations/opportunities/`).
9. **CV preview and PDF**: a worker previews (`GET .../cv/preview/`, HTML)
   or downloads (`GET .../cv/pdf/`, `application/pdf`) an auto-generated CV
   built entirely from their own stored profile data — no manual CV
   editor exists; the content is deterministic and derived, not
   free-form-editable.
10. **Ratings after completed work**: once an application reaches
    `COMPLETED`, both the worker and the employer may each submit exactly
    one rating (1–5 + optional text) about the other party
    (`POST /api/applications/<id>/rating/`), and can view their own
    aggregate rating summary (`GET /api/applications/ratings/summary/`).

---

## 5. API inventory grouped by screen and role

Base URL: whatever `CORS_ALLOWED_ORIGINS` in `.env` points the frontend at
(local dev default in `.env.example`: backend at `http://127.0.0.1:8000`,
frontend expected at `http://localhost:5173` / `http://127.0.0.1:5173` —
i.e. a Vite dev server, consistent with the React/TypeScript stack this
frontend is being built in). All paths below are relative to that base URL
and already include the `/api/...` prefix used throughout
`backend/config/urls.py`.

Unless noted otherwise, request/response bodies are JSON
(`Content-Type: application/json`).

### 5.1 Shared authentication screens (public)

| Method & Path | Role | Purpose | Key request fields | Key response fields | Success | Likely errors |
|---|---|---|---|---|---|---|
| `POST /api/auth/register/` | Public | Create a worker or employer account | `username`, `email`, `phone_number` (10 digits), `password`, `role` (`WORKER`\|`EMPLOYER`) | `id`, `username`, `email`, `phone_number`, `role` | `201` | `400` (username/phone taken, weak password, invalid role) |
| `POST /api/auth/login/` | Public | Obtain JWT pair | `username`, `password` | `access`, `refresh` | `200` | `401` (bad credentials) |
| `POST /api/auth/token/refresh/` | Public (needs valid refresh token) | Exchange refresh token for a new access token | `refresh` | `access` | `200` | `401` (expired/invalid/blacklisted refresh token) |
| `POST /api/auth/logout/` | Authenticated | Blacklist the current refresh token | `refresh` | *(empty body)* | `204` | `400` (missing/invalid/expired token), `403` (token belongs to a different user) |
| `GET /api/auth/me/` | Authenticated | Current account summary — **use this to drive role-based routing** | — | `id`, `username`, `email`, `phone_number`, `role`, `is_contact_verified` | `200` | `401` |

**Screen mapping:** Register screen, Login screen, silent token-refresh
logic (not a visible screen), post-login role router.

### 5.2 Worker screens

| Method & Path | Role | Purpose | Key request fields | Key response fields | Success | Likely errors |
|---|---|---|---|---|---|---|
| `GET /api/profiles/worker/me/` | Worker | Load own profile | — | `id`, `address`, `latitude`, `longitude`, `experience_years`, `is_available`, `expected_wage`, `preferred_travel_radius_km`, `skills` (nested, read-only), `unmatched_terms`, `created_at`, `updated_at` | `200` | `404` (no profile yet — shouldn't normally happen, registration auto-creates one), `403` (not a worker) |
| `POST /api/profiles/worker/me/` | Worker | Create profile (rare — registration already creates an empty one) | same writable fields + `skill_input: string[]` | same as GET | `201` | `400` (profile already exists) |
| `PUT`/`PATCH /api/profiles/worker/me/` | Worker | Update profile / set skills | `address`, `latitude`, `longitude`, `experience_years`, `is_available`, `expected_wage`, `preferred_travel_radius_km`, `skill_input: string[]` (free-text; replaces the whole skill set) | updated profile + `unmatched_terms: string[]` | `200` | `400` (validation), `404` |
| `GET /api/profiles/worker/me/cv/preview/` | Worker | HTML CV preview | — | HTML document (`Content-Type: text/html`) | `200` | `404` (no profile) |
| `GET /api/profiles/worker/me/cv/pdf/` | Worker | Download CV as PDF | — | Binary PDF, `Content-Disposition: attachment; filename="cv-<username>.pdf"` | `200` | `404` |
| `GET /api/jobs/browse/?category=&subcategory=&work_type=&latitude=&longitude=&max_distance_km=` | Public/Worker | Browse active jobs | query params only, all optional; `latitude`/`longitude` must be supplied together | array of job objects — see §7 `PublicJobPostSerializer` | `200` | `400` (bad query param) |
| `GET /api/jobs/<id>/` | Public/Worker | View one job's public detail | — | public job fields (§7) | `200` | `404` (not found, or not active and not the owner) |
| `POST /api/applications/` | Worker | Apply to a job | `job` (id), `worker_note` (optional) | `id`, `job`, `job_title`, `worker_username`, `status`, `worker_note`, `employer_note`, `created_at`, `updated_at` | `201` | `400` (job not active, already applied), `404` (no worker profile) |
| `GET /api/applications/` | Worker | List own applications | — | array of application objects | `200` | `404` (no worker profile) |
| `PATCH /api/applications/<id>/status/` | Worker (or Employer, same endpoint) | Transition an application's status | `status` (target), plus `worker_note`/`employer_note` optional | updated application | `200` | `400` (illegal transition), `403` (not a participant), `404` |
| `GET /api/recommendations/jobs/?limit=` | Worker | Ranked, explained job recommendations | `limit` optional (default from `RECOMMENDATION_SETTINGS.DEFAULT_RESULT_LIMIT`, currently 20; max `MAX_RESULT_LIMIT`, currently 50) | array of recommendation objects — see §9 | `200` | `400` (bad limit), `404` (no worker profile) |
| `GET /api/recommendations/opportunities/` | Worker | Near-miss jobs + missing-skill advice | — | `near_miss_jobs[]`, `missing_skills[]` — see §9 | `200` | `404` (no worker profile) |
| `GET /api/applications/<id>/rating/` | Worker (participant) | View ratings on one application | — | array of `Rating` objects (0, 1, or 2 entries) | `200` | `403` (not a participant), `404` |
| `POST /api/applications/<id>/rating/` | Worker (participant) | Rate the employer after completion | `score` (1–5), `review_text` (optional) | created `Rating` | `201` | `400` (not completed yet, already rated), `403` |
| `GET /api/applications/ratings/summary/` | Worker | Own aggregate rating | — | `average_rating` (float or `null`), `rating_count` | `200` | `401` |

**Screen mapping:** Worker Profile screen, Worker CV screen, Job Browse
screen, Job Detail screen, Apply action, My Applications screen, Worker
Recommendations screen, Opportunity Advisory screen, Ratings screen.

### 5.3 Employer screens

| Method & Path | Role | Purpose | Key request fields | Key response fields | Success | Likely errors |
|---|---|---|---|---|---|---|
| `GET /api/profiles/employer/me/` | Employer | Load own profile | — | `id`, `organization_name`, `address`, `latitude`, `longitude`, `pan_vat_number`, `verification_status` (read-only), `created_at`, `updated_at` | `200` | `404`, `403` |
| `PUT`/`PATCH /api/profiles/employer/me/` | Employer | Update profile | `organization_name`, `address`, `latitude`, `longitude`, `pan_vat_number` | updated profile | `200` | `400` (bad PAN/VAT format — must be exactly 9 digits; PAN/VAT already registered to another employer) |
| `GET /api/jobs/` | Employer | List own job posts | — | array of full job objects (§7 `JobPostSerializer`, includes `status`) | `200` | `403` |
| `POST /api/jobs/` | **Verified** employer | Create a job post | `title`, `category`, `subcategory`, `description`, `address`, `latitude`, `longitude`, `required_experience_years`, `wage_type`, `wage_amount`, `work_type`, `scheduled_datetime`, `duration_days`, `number_of_workers_required`, `application_deadline`, `required_skills_input: string[]`, `preferred_skills_input: string[]` | created job + `unmatched_required_terms`/`unmatched_preferred_terms` | `201` | `400` (subcategory doesn't belong to category, deadline in the past), `403` (not verified) |
| `GET /api/jobs/<id>/` | Employer (owner) | View own job (full detail incl. required/preferred skills) | — | full job object | `200` | `404` |
| `PUT`/`PATCH /api/jobs/<id>/` | Employer (owner) | Update a job / set `status: "CLOSED"` | any writable job field | updated job | `200` | `400` (reopening a closed job is rejected), `403` (not the owner) |
| `GET /api/jobs/<id>/candidates/?max_distance_km=` | Employer (owner) | Coarse-filtered candidate workers (no scoring) | query param optional | array — see §7 `WorkerCandidateSerializer` (no phone number) | `200` | `403`, `404` |
| `GET /api/jobs/<job_id>/applications/` | Employer (owner) | Applications received for one job | — | array of application objects | `200` | `403`, `404` |
| `PATCH /api/applications/<id>/status/` | Employer (owner side) | Shortlist/contact/reject/hire/complete/cancel | `status`, `employer_note` optional | updated application | `200` | `400` (illegal transition), `403` |
| `GET /api/recommendations/jobs/<job_id>/workers/?limit=` | **Verified** employer (owner) | Ranked, explained worker candidates for own job | `limit` optional | array of recommendation objects — see §9 | `200` | `400`, `403` (not owner or not verified), `404` |
| `GET /api/applications/<id>/rating/` / `POST` | Employer (participant) | View / submit rating of the worker | `score`, `review_text` | `Rating` object(s) | `200`/`201` | same shape as worker-side |
| `GET /api/applications/ratings/summary/` | Employer | Own aggregate rating (as a rated worker-employer, i.e. ratings received) | — | `average_rating`, `rating_count` | `200` | `401` |

**Screen mapping:** Employer Profile screen (with a read-only verification-
status badge), My Jobs list, Job Create/Edit form, Job Detail (owner view),
Candidates screen, Applications-for-this-job screen, Worker Recommendations
screen (verified only), Ratings screen.

### 5.4 Shared/public taxonomy screens

| Method & Path | Role | Purpose | Key response fields | Success | Frontend use |
|---|---|---|---|---|---|
| `GET /api/taxonomy/categories/` | Public | List categories | `id`, `name` | `200` | Category dropdown/filter |
| `GET /api/taxonomy/subcategories/?category=` | Public | List subcategories, optionally scoped | `id`, `name`, `category` | `200` | Subcategory dropdown, dependent on selected category |
| `GET /api/taxonomy/skills/?subcategory=&search=` | Public | List active standardized skills | `id`, `name`, `subcategory` | `200` | Skill autocomplete/typeahead |
| `GET /api/taxonomy/tree/` | Public | Full nested tree: categories → subcategories → skills | `id`, `name`, `subcategories: [{id, name, skills: [{id, name}]}]` | `200` | One-shot load for a taxonomy browser or a "browse by category" landing page |

---

## 6. Authentication behavior

- **Token pair**: `POST /api/auth/login/` (DRF SimpleJWT's
  `TokenObtainPairView`, wired directly in `backend/accounts/urls.py` — no
  custom serializer) returns `{ "access": "...", "refresh": "..." }`.
- **Access token lifetime: 5 minutes** (SimpleJWT default; no `SIMPLE_JWT`
  override exists in `backend/config/settings.py`). **This is short** —
  the frontend must handle expiry gracefully mid-session, not just at
  login. Recommended strategy: attach the access token to every request,
  and on a `401` response, attempt exactly one silent
  `POST /api/auth/token/refresh/` using the stored refresh token, then
  retry the original request once; if the refresh itself fails, force a
  logout/redirect-to-login.
- **Refresh token lifetime: 1 day**, **no rotation**
  (`ROTATE_REFRESH_TOKENS=False`, `BLACKLIST_AFTER_ROTATION=False` —
  SimpleJWT defaults, unmodified) — the same refresh token is reused for
  every silent refresh until it naturally expires or is explicitly
  blacklisted via logout. `rest_framework_simplejwt.token_blacklist` is
  installed (`INSTALLED_APPS`), so `POST /api/auth/logout/` really
  invalidates the refresh token server-side — treat logout as
  security-meaningful, not just a client-side token wipe.
- **Storage**: not prescribed by the backend. Given the 5-minute access
  token lifetime and the need to survive a page reload without forcing
  re-login, storing both tokens in memory + a persisted store (e.g.
  `localStorage`/secure cookie via the app's own auth layer) is reasonable;
  this is a frontend architecture decision, not a backend constraint —
  just be aware no CSRF token flow exists for the JWT-authenticated API
  (CSRF only matters for the separate, server-rendered Django admin, which
  is out of scope for this SPA per §14).
- **Current-user / role source of truth**: `GET /api/auth/me/` returns
  `role` (`"WORKER"` / `"EMPLOYER"`) — use this immediately after login (and
  on app boot, if a token is already stored) to decide which app shell to
  render. For an employer, also fetch
  `GET /api/profiles/employer/me/` → `verification_status` to decide
  whether to render verified-only affordances (post job, view worker
  recommendations) as enabled or disabled/pending.
- **No password-reset endpoint exists** — do not build a "forgot password"
  screen; there is nothing for it to call (see §2, §13).

---

## 7. Domain-data shapes required by the UI

All shapes below are taken directly from the serializers that produce
them — field names are exact.

### User (`backend/accounts/serializers.py:CurrentUserSerializer`)

```json
{
  "id": 1,
  "username": "demo_worker_electrician",
  "email": "demo_worker_electrician@workforce-matching.local",
  "phone_number": "9811100011",
  "role": "WORKER",
  "is_contact_verified": true
}
```

### WorkerProfile (`backend/profiles/serializers.py:WorkerProfileSerializer`)

```json
{
  "id": 3,
  "address": "Koteshwor, Kathmandu",
  "latitude": "27.677800",
  "longitude": "85.348800",
  "experience_years": 6,
  "is_available": true,
  "expected_wage": "1200.00",
  "preferred_travel_radius_km": 15,
  "skills": [
    {"id": 2, "name": "House Wiring", "subcategory": "Electrical"}
  ],
  "skill_input": ["ghar wiring", "Circuit Breaker Installation"],
  "unmatched_terms": ["some unrecognized phrase"],
  "created_at": "2026-07-22T12:00:00Z",
  "updated_at": "2026-07-22T12:00:00Z"
}
```

`skill_input` is **write-only** (never present in a response body it
wasn't just sent in); `skills` and `unmatched_terms` are **read-only**.
`skills[].subcategory` here is a plain string (`StringRelatedField`), not
an object — different shape from the taxonomy endpoints in §5.4.

### EmployerProfile (`backend/profiles/serializers.py:EmployerProfileSerializer`)

```json
{
  "id": 1,
  "organization_name": "Kathmandu Home Services Pvt. Ltd.",
  "address": "Baneshwor, Kathmandu",
  "latitude": "27.693800",
  "longitude": "85.335500",
  "pan_vat_number": "100200300",
  "verification_status": "VERIFIED",
  "created_at": "2026-07-22T12:00:00Z",
  "updated_at": "2026-07-22T12:00:00Z"
}
```

`verification_status` is one of `UNVERIFIED` / `PENDING` / `VERIFIED` /
`REJECTED` (`EmployerProfile.VerificationStatus`) and is **read-only** to
the employer themselves — there is no request field that changes it.

### Category / Subcategory / SkillTag / SkillAlias

Category (`backend/taxonomy/serializers.py:CategorySerializer`):
```json
{"id": 1, "name": "Construction & Repair"}
```

Subcategory (`SubcategorySerializer`) — `category` is the raw id, not nested:
```json
{"id": 1, "name": "Electrical", "category": 1}
```

SkillTag (`SkillTagSerializer`) — `subcategory` is the raw id here:
```json
{"id": 2, "name": "House Wiring", "subcategory": 1}
```

Taxonomy tree (`CategoryTreeSerializer`, from `GET /api/taxonomy/tree/`)
nests fully and omits ids-as-foreign-keys in favor of embedded objects:
```json
{
  "id": 1,
  "name": "Construction & Repair",
  "subcategories": [
    {
      "id": 1,
      "name": "Electrical",
      "skills": [{"id": 2, "name": "House Wiring"}]
    }
  ]
}
```

`SkillAlias` (English / Romanized-Nepali phrases like "ghar wiring") is
**not exposed through any API endpoint** — it only exists as a matching
input inside `normalize_skill_phrase` (`backend/taxonomy/services.py`) and
in the Django admin (`SkillAlias`/`SkillAliasInline`,
`backend/taxonomy/admin.py`). The frontend cannot list or browse aliases
directly; it only ever sees the *effect* of alias matching (a free-text
`skill_input` phrase resolving to a canonical `SkillTag`, or landing in
`unmatched_terms` if it doesn't).

### JobPost — owner view (`backend/jobs/serializers.py:JobPostSerializer`)

```json
{
  "id": 5,
  "title": "House Wiring for New Apartment Block",
  "category": 1,
  "category_name": "Construction & Repair",
  "subcategory": 1,
  "subcategory_name": "Electrical",
  "employer_name": "Kathmandu Home Services Pvt. Ltd.",
  "required_skills": [{"id": 2, "name": "House Wiring", "subcategory": "Electrical"}],
  "preferred_skills": [{"id": 4, "name": "Electrical Repair", "subcategory": "Electrical"}],
  "required_skills_input": ["House Wiring", "Circuit Breaker Installation"],
  "preferred_skills_input": ["Electrical Repair"],
  "unmatched_required_terms": [],
  "unmatched_preferred_terms": [],
  "description": "Complete wiring and breaker installation for a new four-unit apartment block.",
  "address": "Baneshwor, Kathmandu",
  "latitude": "27.693800",
  "longitude": "85.335500",
  "required_experience_years": 3,
  "wage_type": "DAILY",
  "wage_amount": "1300.00",
  "work_type": "CONTRACT",
  "scheduled_datetime": null,
  "duration_days": null,
  "number_of_workers_required": 2,
  "application_deadline": "2026-08-21T12:00:00Z",
  "status": "ACTIVE",
  "created_at": "2026-07-22T12:00:00Z",
  "updated_at": "2026-07-22T12:00:00Z"
}
```

`wage_type` ∈ `HOURLY`/`DAILY`/`MONTHLY`/`FIXED`; `work_type` ∈
`FULL_TIME`/`PART_TIME`/`CONTRACT`/`ONE_TIME`; `status` ∈ `ACTIVE`/`CLOSED`
(`backend/jobs/models.py:JobPost`).

**Public/browse view** (`PublicJobPostSerializer`, used by
`GET /api/jobs/browse/` and `GET /api/jobs/<id>/` for non-owners) is the
same shape *minus* `required_skills_input`/`preferred_skills_input`/
`unmatched_*_terms`, and *plus* `employer_verification_status` — it
deliberately never includes anything that would leak employer contact
details, PAN/VAT, or the raw skill-input fields.

### Application (`backend/applications/serializers.py:ApplicationSerializer`)

```json
{
  "id": 8,
  "job": 5,
  "job_title": "House Wiring for New Apartment Block",
  "worker_username": "demo_worker_electrician",
  "status": "COMPLETED",
  "worker_note": "",
  "employer_note": "",
  "created_at": "2026-07-22T12:00:00Z",
  "updated_at": "2026-07-22T12:00:00Z"
}
```

`status` is one of the eight values in §8. Creating an application
(`ApplicationCreateSerializer`) only accepts `job` and `worker_note`.

### Rating (`backend/applications/serializers.py:RatingSerializer`)

```json
{
  "id": 12,
  "application": 8,
  "direction": "WORKER_TO_EMPLOYER",
  "reviewer_username": "demo_worker_electrician",
  "reviewed_username": "demo_employer_verified",
  "score": 5,
  "review_text": "Paid on time and the site was well organized.",
  "created_at": "2026-07-22T12:00:00Z"
}
```

`direction` ∈ `WORKER_TO_EMPLOYER` / `EMPLOYER_TO_WORKER`. Submitting one
(`RatingCreateSerializer`) only accepts `score` (1–5) and optional
`review_text` — `direction`/`reviewer`/`reviewed_user` are always derived
server-side from which participant is authenticated, never client input.

### Recommendation results and Opportunity-advisory results

See §9 — the full shape, with every score-component field name, is
documented there rather than duplicated.

---

## 8. Application state machine

Source of truth: `backend/applications/services.py`
(`WORKER_ALLOWED_TRANSITIONS`, `EMPLOYER_ALLOWED_TRANSITIONS`,
`transition_application_status`).

**All 8 statuses**: `APPLIED`, `SHORTLISTED`, `CONTACTED`, `HIRED`,
`REJECTED`, `WITHDRAWN`, `COMPLETED`, `CANCELLED`.

| From | Worker can → | Employer can → |
|---|---|---|
| `APPLIED` | `WITHDRAWN` | `SHORTLISTED`, `CONTACTED`, `REJECTED` |
| `SHORTLISTED` | `WITHDRAWN` | `CONTACTED`, `HIRED`, `REJECTED` |
| `CONTACTED` | `WITHDRAWN` | `HIRED`, `REJECTED` |
| `HIRED` | *(none — worker cannot withdraw after being hired)* | `COMPLETED`, `CANCELLED` |
| `REJECTED` | *(terminal)* | *(terminal)* |
| `WITHDRAWN` | *(terminal)* | *(terminal)* |
| `COMPLETED` | *(terminal)* | *(terminal)* |
| `CANCELLED` | *(terminal)* | *(terminal)* |

**Actor determination**: the backend derives whether the requester is the
"worker side" or "employer side" from `application.worker.user_id` /
`application.job.employer.user_id` matched against the authenticated user
— never from a client-supplied role flag. A non-participant gets `403`
regardless of what status they request.

**Frontend UI implications:**
- Compute the allowed next-status set for the current user from the table
  above (current `status` + whether the viewer is the worker or the
  employer participant) and render only those as actionable buttons —
  everything else should be visually absent, not just disabled, to avoid
  implying an action exists that will always 400.
- Once a status is one of the four terminal ones, render the application
  as read-only/history (no action buttons at all) for both participants.
- Ratings only become available once `status === "COMPLETED"` — gate the
  "Rate this engagement" button on that, matching
  `applications/services.py:submit_rating`'s own guard (`400` otherwise).
- A single `PATCH /api/applications/<id>/status/` endpoint serves both
  worker- and employer-initiated transitions — the frontend does not call
  different endpoints per role, just different allowed `status` values.

---

## 9. Recommendation presentation

Every field below comes directly from
`backend/recommendations/serializers.py` and the `RecommendationResult`
dataclass in `backend/recommendations/services.py` — nothing here is
inferred or invented.

### Worker-to-job recommendation (`GET /api/recommendations/jobs/`)

Array of objects shaped like `JobRecommendationSerializer`:

```json
{
  "final_score": 97.79,
  "job": {
    "id": 5,
    "title": "House Wiring for New Apartment Block",
    "category_name": "Construction & Repair",
    "subcategory_name": "Electrical",
    "employer_name": "Kathmandu Home Services Pvt. Ltd.",
    "address": "Baneshwor, Kathmandu",
    "required_experience_years": 3,
    "wage_type": "DAILY",
    "wage_amount": "1300.00",
    "work_type": "CONTRACT",
    "status": "ACTIVE"
  },
  "skill": {
    "skill_score": 100.0,
    "required_skill_coverage": 100.0,
    "cosine_similarity_score": 90.0,
    "matched_required_skills": [{"id": 2, "name": "House Wiring", "subcategory": "Electrical"}],
    "missing_required_skills": [],
    "matched_preferred_skills": [{"id": 4, "name": "Electrical Repair", "subcategory": "Electrical"}]
  },
  "distance_km": 2.13,
  "distance_score": 89.35,
  "experience_score": 100.0,
  "availability_preference_score": 100.0,
  "availability_sub_scores": {
    "is_available": true,
    "wage_compatibility_score": 100.0,
    "travel_radius_compatibility_score": 100.0
  },
  "reliability_verification_score": 84.0,
  "reliability_sub_scores": {
    "verification_status": "VERIFIED",
    "contact_verified": true,
    "profile_completeness": 100.0
  },
  "employer_side_suitability": 94.67,
  "worker_side_suitability": 91.12,
  "reciprocal_preference_score": 93.25,
  "reasons": [
    "Matches 2 of 2 required skills.",
    "Also matches 1 preferred skills.",
    "Located 2.13 km from the job.",
    "Meets the required experience.",
    "Available for work.",
    "Job wage meets the worker's expected wage.",
    "Employer profile is verified."
  ],
  "warnings": []
}
```

**Note**: `distance_km` and `distance_score` are `null` (never invented)
when the worker has no coordinates on file — the frontend must render a
"distance unknown" state rather than `0 km`/`0%`, and expect a
corresponding warning string like *"Worker location is unavailable;
distance could not be calculated."* in `warnings`.

### Job-to-worker recommendation (`GET /api/recommendations/jobs/<job_id>/workers/`)

Same shape, except `job` is replaced by `worker`
(`RecommendedWorkerSerializer`):

```json
{
  "id": 3,
  "username": "demo_worker_electrician",
  "address": "Koteshwor, Kathmandu",
  "experience_years": 6,
  "is_available": true,
  "expected_wage": "1200.00",
  "preferred_travel_radius_km": 15,
  "skills": [{"id": 2, "name": "House Wiring", "subcategory": "Electrical"}]
}
```

No phone number or other private contact detail is ever included here —
do not add a "call this worker" affordance from this data; there is
nothing to call with.

### Score components — what to actually show

Render these as a labeled breakdown (e.g. a horizontal bar per component),
not just the single `final_score`, since "explainable" is the whole point
of this engine:

| Field | Range | Meaning |
|---|---|---|
| `final_score` | 0–100 | The overall ranking score (weighted sum of the five components below; weights come from `settings.RECOMMENDATION_SETTINGS`, currently skill 40% / distance 20% / experience 15% / availability 15% / reliability 10%) |
| `skill.skill_score` | 0–100 | 70% required-skill coverage + 30% cosine similarity (weights configurable) |
| `distance_score` | 0–100 or `null` | 100 at 0 km, linearly to 0 at `MAX_DISTANCE_KM` (currently 20 km) |
| `experience_score` | 0–100 | Worker experience vs. required experience |
| `availability_preference_score` | 0–100 | Average of wage compatibility + travel-radius comfort (see `availability_sub_scores`) |
| `reliability_verification_score` | 0–100 | Cold-start-safe: contact verification + (employer verification status, worker-to-job direction only) + profile completeness |
| `reciprocal_preference_score` | 0–100 | A separate "mutual fit" metric (60% employer-side suitability + 40% worker-side suitability) — **explanatory only, not part of `final_score`**; label it distinctly (e.g. "Mutual fit") so it isn't mistaken for a second ranking score |
| `reasons` | string[] | Deterministic, human-readable positives — show as a bullet list |
| `warnings` | string[] | Deterministic, human-readable caveats (missing skills, distance unknown, below-expected wage, etc.) — show visually distinct from `reasons` (e.g. amber vs. green) |

### Opportunity advisory (`GET /api/recommendations/opportunities/`)

```json
{
  "near_miss_jobs": [
    { "...": "same shape as a worker-to-job recommendation object above" }
  ],
  "missing_skills": [
    {
      "skill": {"id": 6, "name": "Tile Installation", "subcategory": "Masonry"},
      "missing_frequency": 1,
      "required_frequency": 1,
      "job_ids": [7]
    }
  ]
}
```

`missing_frequency` = how many of the listed near-miss jobs are missing
this skill; `required_frequency` = how many near-miss jobs require it at
all (matched or not) — a broader demand signal. `job_ids` lets the
frontend deep-link "learn this skill to unlock: [Job A, Job B]" back to
the relevant job detail pages. Present this as the advisory's core
call-to-action screen: "You're close on N jobs — learning **Tile
Installation** would help with 1 of them."

---

## 10. Existing demo data

Command: `python manage.py seed_demo` (idempotent, safe to rerun — see
`backend/accounts/management/commands/seed_demo.py` and
`docs/DEMO_SCRIPT.md` for the full walkthrough). Password for every
account below is **`DemoPass123!`**.

| Username | Role | Notes |
|---|---|---|
| `demo_admin` | Superuser | Django admin only (`/admin/`), not an API-usable worker/employer account |
| `demo_employer_verified` | Employer — **VERIFIED** | "Kathmandu Home Services Pvt. Ltd.", owns all 5 demo jobs, PAN/VAT `100200300` |
| `demo_employer_pending` | Employer — **PENDING** | "Pending Facility Works" — use this to demo the not-yet-verified state (e.g. a disabled "Post a Job" button, a `403` if attempted anyway) |
| `demo_worker_electrician` | Worker | Electrical skills, 6 yrs experience, contact-verified, close to the wiring job → strong match (~98) and a **fully COMPLETED** application with ratings in both directions |
| `demo_worker_sita` | Worker | Cleaning skills, 2 yrs experience, contact-verified → strong match (~98), application status **SHORTLISTED** |
| `demo_worker_hari` | Worker | Masonry (only 1 of 2 required skills), contact **unverified**, no wage/travel-radius preference → **near-miss** match (~67), application status **APPLIED**, missing-skill advisory surfaces "Tile Installation" |
| `demo_worker_gita` | Worker | Cooking skills, no location on file (exercises the "distance unknown" UI state), contact unverified → **near-miss** match (~65), application **WITHDRAWN**, missing-skill advisory surfaces "Kitchen Helper" |

**Useful demonstration records:**
- 5 active jobs, one per taxonomy subcategory that has a demo worker
  overlap (Electrical, Cleaning, Masonry, Cooking) plus one with no
  matching demo worker at all (Plumbing — "Water Tank Installation & Pipe
  Fitting"), useful for showing an employer's recommendation screen
  legitimately returning an empty list.
- One `UnmatchedSkillTerm` ("cnc machine operation") pre-seeded for
  demonstrating the admin-review taxonomy workflow — not reachable from
  the frontend (admin-only, see §7).
- Application states across the board: `APPLIED`, `SHORTLISTED`,
  `WITHDRAWN`, and a full `COMPLETED` lifecycle with both ratings — enough
  to screenshot/demo every state-dependent UI in §8 without needing to
  manufacture states manually first.

---

## 11. Frontend technical constraints

- **Stack**: React + TypeScript + Tailwind CSS, responsive web (not
  native mobile).
- **Backend**: Django REST Framework at the existing base URL — no new
  backend routes, serializers, or response shapes should be invented by
  the frontend team; if a screen seems to need data the API doesn't
  provide, treat that as a gap to flag (see the final report accompanying
  this document), not something to route around with a new endpoint.
- **CORS**: already configured via `CORS_ALLOWED_ORIGINS` in `.env`
  (`backend/config/settings.py`); local dev default is
  `http://localhost:5173` and `http://127.0.0.1:5173` — i.e. Vite's
  default dev-server ports. No wildcard origin is allowed
  (`django-cors-headers`, explicit allow-list only) — if the frontend dev
  server runs on a different port, `.env`'s `CORS_ALLOWED_ORIGINS` needs
  updating (a backend config change, not a frontend one).
- **No backend formula or API behavior changes** unless a genuine blocker
  is found during frontend implementation — in that case, stop and flag it
  rather than silently reinterpreting a response shape or score formula
  client-side.
- **No pagination** (§2) — every list response is a full JSON array.
- **Content types to handle beyond JSON**: `text/html` (CV preview) and
  `application/pdf` (CV download, as a binary blob with a suggested
  filename in `Content-Disposition`) — both from
  `backend/profiles/views.py`.

---

## 12. UX requirements

- **Desktop, tablet, and mobile support** — Tailwind's responsive utility
  classes should drive breakpoints; no backend constraint here, purely a
  frontend implementation concern.
- **Large touch targets** — this user base includes manual laborers who
  may be using a phone one-handed, outdoors, or with limited screen
  precision; buttons and form controls should follow standard large-
  touch-target sizing (e.g. ~44px minimum).
- **Short labels, icon + text navigation** — favor recognizable icons
  paired with short text over icon-only or text-dense navigation, given
  the "limited digital experience" consideration below.
- **Progressive forms** — the profile and job-creation forms have many
  optional fields (see §7's shapes); do not force every field onto one
  overwhelming screen. Group by relevance (e.g. Worker Profile: Basics →
  Location → Skills → Availability/Wage) and allow partial saves (the
  backend already supports `PATCH` for partial updates on every profile/
  job endpoint).
- **Strong contrast** — plan for outdoor/bright-sunlight mobile usage;
  avoid low-contrast gray-on-gray patterns.
- **Understandable error messages** — DRF's default error bodies are
  developer-oriented (e.g. `{"detail": "..."}` or field-keyed validation
  arrays); the frontend must translate these into plain language rather
  than surfacing raw API error text. In particular, translate the
  service-layer messages already written in plain English by the backend
  (e.g. `"Cannot transition application from APPLIED to COMPLETED."`,
  `"You have already applied to this job."`, `"Only completed applications
  can be rated."`) rather than replacing them with something vaguer — they
  are already reasonably user-facing, just need consistent placement/
  styling.
- **Loading, empty, offline, and success states** — every list screen in
  §5 needs an explicit empty state (e.g. "No jobs match your filters yet"
  — remember §9's Plumbing job has **no** matching demo worker, a real,
  legitimate empty case to design for, not just an edge case); every
  mutating action (apply, transition status, submit rating, save profile)
  needs a loading state and a success confirmation, since this audience
  may not infer success from a silent UI update alone.
- **Suitability for users with limited digital experience** — prefer
  explicit confirmation steps for consequential, hard-to-reverse actions
  (withdrawing an application, closing a job — there is no "delete job"
  to worry about since the endpoint doesn't exist, §2/§5.3) over
  relying on undo.
- **Future Nepali localization readiness** — the backend has no i18n
  strings or `Accept-Language` handling today (all `reasons`/`warnings`/
  error messages are English-only, hardcoded in Python — see
  `backend/recommendations/services.py:_build_reasons_and_warnings` and
  the various `ValidationError` call sites). Structure the frontend's own
  UI copy (labels, buttons, navigation, static strings) through a proper
  i18n library/message-catalog layer from the start, even though only
  English is shipped now, so a future Nepali translation is a content
  addition rather than a rewrite. Backend-sourced strings (`reasons`,
  `warnings`, error `detail` messages) cannot be localized by the frontend
  alone — that would require backend changes out of scope here; if
  localization of those specific strings becomes a requirement, flag it
  as a backend change, not a frontend workaround (e.g. do not attempt
  client-side string-matching/translation of backend English text, which
  would silently break the moment the backend wording changes).

---

## 13. Explicit frontend exclusions

Do not design or implement UI for any of the following — no supporting
endpoint exists, and building screens for them would set user expectations
the backend cannot fulfill:

- **Chat / messaging** between workers and employers.
- **Payments** of any kind (wages are recorded as data on a job post,
  never processed or transferred through the platform).
- **Advanced notifications** (email/SMS/push for status changes, new
  matches, etc.) — no notification model, channel, or endpoint exists.
- **Profile-photo or document uploads** — no `FileField`/`ImageField`
  exists on any model; there is nothing to upload to.
- **Complaints interface** — no complaint/dispute model or endpoint;
  the only recourse after a bad engagement is a low `Rating` score.
- **Trusted-worker management** (e.g. an employer's "favorites" list or a
  one-click rehire flow) — no such model or endpoint.
- **Advanced analytics** (dashboards, reporting, aggregate platform
  metrics) — nothing beyond what's directly returned by the endpoints in
  §5.
- **Live maps** — coordinates exist as plain decimal `latitude`/
  `longitude` fields used only for Haversine-distance calculation
  server-side; there is no map-tile integration, geocoding endpoint, or
  reverse-geocoding anywhere in the backend. If a map view is desired, it
  would need a separate, frontend-only mapping-provider integration
  layered on top of the existing lat/long fields — treat this as new
  scope to confirm with the user first, not something implied by the data
  being present.
- Anything else listed under "Intentionally deferred" in
  [`docs/DEFERRED_SCOPE.md`](DEFERRED_SCOPE.md): password reset, real
  OTP/document verification flows, pagination-dependent UI patterns (e.g.
  infinite scroll relying on a `next` cursor the API doesn't return).

---

## 14. Recommended screen inventory

Mapping real backend capabilities (§5) to a screen list — a starting
point for the frontend designer, not a rigid spec:

### Public pages (no auth)
- Landing / taxonomy browse (`GET /api/taxonomy/tree/`)
- Job Browse (`GET /api/jobs/browse/` with filters)
- Job Detail — public view (`GET /api/jobs/<id>/`)
- Register
- Login

### Shared authentication pages
- Register (role toggle: Worker / Employer)
- Login
- (Silent) token-refresh handling — not a visible screen
- Post-login role router (reads `GET /api/auth/me/`)

### Worker pages
- Worker Profile (view/edit, skill input with unmatched-term feedback)
- Worker CV (preview + PDF download)
- Job Browse (auth-aware: uses the worker's own coordinates/radius when
  signed in, per `ActiveJobBrowseView`'s behavior)
- Job Detail (public view + an "Apply" action when authenticated as a
  worker and the job is active)
- My Applications (list + status + withdraw action where legal, §8)
- Recommendations (ranked jobs with full score breakdown, §9)
- Opportunity Advisory (near-miss jobs + missing-skill call-to-action, §9)
- Ratings (view own rating summary; rate an employer once an application
  is `COMPLETED`)

### Employer pages
- Employer Profile (view/edit; read-only verification-status badge)
- My Jobs (list, create, edit, close)
- Job Detail — owner view (full fields, edit/close actions)
- Candidates for a Job (coarse-filtered list, no scoring)
- Applications for a Job (list + status-transition actions, §8)
- Worker Recommendations for a Job (verified employers only, §9)
- Ratings (view own rating summary; rate a worker once an application is
  `COMPLETED`)

**Not part of this SPA**: the Django admin (`/admin/`) — verification,
taxonomy admin-review, and rating moderation all happen there, by design
(§3). Do not attempt to replicate admin-only actions inside the React app.

---

## 15. Source-of-truth hierarchy

When any of these disagree, resolve in this order:

1. **Current repository behavior and serializers** — the actual code in
   `backend/*/models.py`, `backend/*/serializers.py`, `backend/*/views.py`,
   `backend/*/urls.py`, `backend/*/services.py`, and
   `backend/config/settings.py`. This document was written by reading
   that code directly; if the code changes after this document is
   written, the code wins.
2. **`README.md` and `docs/DEFERRED_SCOPE.md`** — authoritative for setup
   instructions, test commands, and the implemented/partial/deferred
   feature breakdown, kept in sync with the repository by the backend
   team.
3. **`docs/IMPLEMENTATION_PLAN.md`** (the original proposal) — high-level
   intent and motivation only. Where it describes something not present
   in the code (e.g. a minimal HTML frontend, or any student-specific
   feature), treat it as context for *why* the project exists, never as a
   spec for what an endpoint currently returns.

If a frontend screen needs data or behavior the API genuinely doesn't
support, that is a backend gap to raise explicitly — not something to
infer, mock, or route around silently.
