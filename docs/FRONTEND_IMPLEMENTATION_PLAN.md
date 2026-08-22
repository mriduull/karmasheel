# FRONTEND_IMPLEMENTATION_PLAN — Workforce Matching

Phased implementation plan for the React + TypeScript + Tailwind CSS client,
produced by cross-checking `docs/FRONTEND_DESIGN_SPEC (1).md` against the
actual repository: `backend/*/urls.py`, `models.py`, `serializers.py`,
`views.py`, `permissions.py`, `services.py`, and `backend/config/settings.py`,
read directly for this document (see §1 for what was verified). No frontend
or backend code, and no other document, was changed to produce this plan.

**This document does not implement anything.** It is the source a frontend
coding agent should follow phase by phase, stopping for review after each
phase per `CLAUDE.md` rule 15.

---

## 0. Naming note

The approved product name is **"Workforce Matching."** Repository identifiers
use compatible forms where spaces are invalid, such as
`workforce_matching_db`. User-visible strings (page titles, nav wordmark,
`<title>` tag, and the i18n catalog) use the full approved product name. If the
name changes later, it is a single change in the i18n catalog's brand key
(§7.7), not a structural change.

---

## 1. Source verification summary

Every backend claim this plan relies on was re-checked directly against
the repository, not taken on faith from `FRONTEND_CONTEXT.md`:

- **URLs** — `backend/config/urls.py` and all six apps' `urls.py` read in
  full; every path in `FRONTEND_CONTEXT.md` §5 matches exactly.
- **Permissions** — `accounts/permissions.py`, `jobs/permissions.py`
  (`IsVerifiedEmployer`), and `jobs/views.py` read in full; the
  verified-employer-only gate on `POST /api/jobs/` and
  `GET /api/recommendations/jobs/<id>/workers/` is confirmed, as is public
  `GET` access to individual active jobs and job browsing.
- **Settings** — `backend/config/settings.py` read in full: JWT auth is the
  only `DEFAULT_AUTHENTICATION_CLASSES`; no `SIMPLE_JWT` override exists
  (5-minute access token is the SimpleJWT default, confirmed by absence,
  not by a value); `CORS_ALLOWED_ORIGINS` is an explicit env-driven
  allow-list; `RECOMMENDATION_SETTINGS` weights (skill 0.40 / distance 0.20
  / experience 0.15 / availability 0.15 / reliability 0.10; skill
  sub-weights 0.70/0.30; near-miss band 40–75) all confirmed verbatim.
- **Models & serializers** — `profiles/models.py` + `serializers.py`,
  `jobs/models.py` + `serializers.py`, `applications/models.py` +
  `serializers.py` + `services.py`, `recommendations/serializers.py` all
  read in full. Confirmed: `WorkerProfileSerializer` and
  `JobPostSerializer` field lists and read/write-only splits;
  `EmployerProfileSerializer.verification_status` is read-only with no
  client-settable field; the 8 `Application.Status` values and the exact
  `WORKER_ALLOWED_TRANSITIONS` / `EMPLOYER_ALLOWED_TRANSITIONS` tables in
  `applications/services.py`; `ApplicationStatusUpdateView` also accepts
  an optional `worker_note`/`employer_note` alongside `status` in the same
  `PATCH` (confirmed in `applications/views.py`, not just the status-only
  serializer); `Rating`'s one-rating-per-direction-per-application
  constraint and `submit_rating`'s `COMPLETED`-only gate;
  `RecommendationResult`'s full field set including `reciprocal_preference_score`
  being explanatory-only.
- **Frontend directory** — `frontend/` exists and is completely empty (no
  `package.json`, no config files, nothing to preserve or overwrite).
- **No pagination anywhere** — every list view (`ActiveJobBrowseView`,
  `JobPostListCreateView`, `ApplicationListCreateView`, `JobApplicationsView`,
  `JobCandidatesView`, taxonomy list views) returns `Response(serializer.data)`
  over a plain queryset with no paginator class configured anywhere — confirmed.
- **No employer-wide applications endpoint** — `applications/urls.py` and
  `jobs/urls.py` expose applications only via
  `GET /api/jobs/<job_id>/applications/`, scoped to one job. There is no
  `GET /api/applications/` variant for employers (`ApplicationListCreateView.get`
  is worker-only, gated by `IsWorker`). Confirmed by reading the view.
- **No ratings-history-list endpoint** — only
  `GET /api/applications/ratings/summary/` (aggregate) and
  `GET /api/applications/<id>/rating/` (per-application, 0–2 entries) exist;
  there is no endpoint that returns "all ratings I've received" as one call.

Nothing in `FRONTEND_CONTEXT.md` was found to be inaccurate against the
current code. It remains priority-2 source of truth per its own §15 and
per this task's instructions; this plan treats the code itself as
authoritative wherever the two could ever diverge in the future.

---

## 2. Corrections applied to the design spec

The design spec (`docs/FRONTEND_DESIGN_SPEC (1).md`) is close to backend
reality and was written carefully — most of it is adopted as-is. Seven
corrections were mandated and are applied as follows:

| # | Correction | Spec section affected | Resolution in this plan |
|---|---|---|---|
| 1 | Consistent product branding | §1 Visual identity | "Workforce Matching" is used as the display label throughout the UI (see §0 above). |
| 2 | Registration must not auto-login | §5.2 "Success (201): auto-redirect to Login **(or directly attempt login)**" | The "or directly attempt login" branch is removed. Phase F1 implements exactly one path: `201` → confirmation message shown on the same screen → explicit redirect to `/login` (no token is ever requested as part of registration). See §5.2 in Phase F1 below. |
| 3 | Ratings: aggregate + rate-from-completed-application first; full history reconstruction lower priority | §14/§20 describe "list of individual ratings received" as part of the initial Ratings screen | Phase F4 ships `RatingSummaryCard` (aggregate) and the inline "Rate this engagement" action from each `COMPLETED` application row (already the correct backend-cheap path, since there is no bulk-ratings endpoint — see §1). A full per-application history list is explicitly marked as a stretch item inside F4, not a completion-blocking deliverable, since building it requires one `GET /api/applications/<id>/rating/` call per completed application. |
| 4 | No employer-wide Applicants screen | §3.4 mobile nav lists a standalone "Applicants" bottom-tab item; §18 route is scoped correctly but the nav implies a global list | No route or screen aggregates applications across jobs, because no endpoint supports it (§1). The mobile bottom tab labeled "Applicants" is corrected to **"My Jobs"** — same entry point as desktop — and the applications screen is only ever reached as `/employer/jobs/:id/applications` from a specific job. See Phase F3 §3.4 correction below. |
| 5 | Geolocation optional, no maps | §6, §13 (design spec) | Already correct in the spec — carried through unchanged into F2. `useGeolocation()` is a best-effort hook; denial or absence never blocks a save. No map component appears in this plan. |
| 6 | No candidate side-by-side comparison in first build | §19.2 proposes an optional "select up to 3 to compare" toggle | Explicitly excluded from Phase F4. Ranked `RecommendationCard`s with an expandable per-candidate score breakdown are the only comparison mechanism shipped. If a comparison view is wanted later, it is new scope to confirm with the user, not part of this plan. |
| 7 | No unsupported features | Whole spec | Already correctly excludes all of: search, job/application deletion, password reset, verification-request/document-upload, chat, payments, notifications, complaints, maps, trusted-worker/rehire, public directory, analytics. Nothing further to remove — confirmed by re-reading the spec's own §0 and §13 against the actual URL/view inventory in §1 above. |

No backend changes are proposed anywhere in this plan.

---

## 3. Architecture decisions

### 3.1 React application structure

Vite + React 18 + TypeScript, feature-oriented `src/` layout:

```
frontend/
  index.html
  vite.config.ts
  tailwind.config.ts
  postcss.config.js
  tsconfig.json
  .env.example                # documents VITE_API_BASE_URL only
  src/
    main.tsx
    App.tsx
    api/
      client.ts               # fetch wrapper, auth header, 401 refresh+retry
      errors.ts                # DRF error -> plain-language translation
      endpoints/
        auth.ts
        profiles.ts
        taxonomy.ts
        jobs.ts
        applications.ts
        recommendations.ts
    types/
      user.ts profile.ts taxonomy.ts job.ts application.ts
      rating.ts recommendation.ts api.ts (shared ApiError, etc.)
    state/
      authStore.ts             # Zustand: access token (memory), user, role
    lib/
      queryClient.ts           # TanStack Query client + default options
      useGeolocation.ts
    routes/
      router.tsx
      guards.tsx               # RequireAuth, RequireRole, RequireVerifiedEmployer
    i18n/
      index.ts
      en.ts                    # flat message catalog, brand key included
    components/
      layout/  (TopBar, BottomTabBar, TabletMoreMenu, AppShell)
      primitives/ (TextField, PasswordField, PhoneField, PanVatField,
                   NumberField, ToggleSwitch, PrimaryButton,
                   InlineErrorMessage, ErrorBanner, SkeletonBlock,
                   SkeletonCard, EmptyState, StatusBadge, StatusChip)
      shared/ (SkillChipInput, UnmatchedTermNotice, CategorySelect,
                SubcategorySelect, WorkTypeSelect, ProfileSectionAccordion,
                CoordinateCapture, JobCard, RecommendationCard, ScoreBar,
                ReasonsList, WarningsList, MutualFitBadge,
                RatingSummaryCard, StarRatingDisplay)
    pages/
      public/ (Landing, Login, Register)
      worker/  (Dashboard, Profile, Applications, Recommendations,
                 Opportunities, CV, Ratings)
      employer/ (Dashboard, Profile, Jobs, JobForm, JobDetail,
                  Applications, Candidates, Recommendations, Ratings)
      shared/ (JobBrowse, JobDetail)
    test/
      setup.ts
      msw/handlers.ts
      msw/server.ts
```

Every subdirectory above is created incrementally by the phase that first
needs it (§4) — F0 creates the skeleton and empty barrels only.

### 3.2 Routing strategy

React Router v6 (`createBrowserRouter` + `RouterProvider`), defined once in
`src/routes/router.tsx`. Route guards are wrapper components, not loader
redirects, so they can read the Zustand auth store synchronously and render
a redirect (`<Navigate>`) or the protected element:

- `<RequireAuth>` — redirects to `/login` (preserving the intended path in
  router state) if no authenticated user.
- `<RequireRole role="WORKER" | "EMPLOYER">` — wraps `<RequireAuth>`;
  redirects to the other role's dashboard if the role doesn't match, since
  a worker hitting an employer route (or vice versa) is a routing mistake,
  not a permission error to surface as text.
- `<RequireVerifiedEmployer>` — wraps `<RequireRole role="EMPLOYER">`;
  used only on `/employer/jobs/new` and
  `/employer/jobs/:id/recommendations`. Renders the route only if
  `EmployerProfile.verification_status === "VERIFIED"` (read from a cached
  `GET /api/profiles/employer/me/` query); otherwise renders an inline
  "Available once your account is verified" message with a link back to
  `/employer/profile`, matching design spec §16 — never a raw 403 page.
- Public-only routes (`/login`, `/register`) redirect an already-authenticated
  user to their role dashboard.

### 3.3 API-client structure

A single small typed `fetch` wrapper in `src/api/client.ts` — no axios
dependency, since the API surface is small and uniform (JSON in, JSON/HTML/PDF
out per `FRONTEND_CONTEXT.md` §11). Responsibilities:

- Attach `Authorization: Bearer <accessToken>` from the auth store to every
  request except `register`/`login`/`token/refresh`.
- Parse JSON responses; pass through `text/html` and `application/pdf`
  responses as-is (`.text()` / `.blob()`) for the two CV endpoints.
- On a `401` from any request other than the refresh call itself, trigger
  the refresh-and-retry flow (§3.4).
- Throw a typed `ApiError { status, detail?, fieldErrors? }` on any
  non-2xx response, normalized from DRF's two error shapes
  (`{"detail": "..."}` and field-keyed arrays) — this is what
  `src/api/errors.ts` (§3.10) consumes.

Per-resource functions live in `src/api/endpoints/*.ts` (e.g.
`jobs.listMine()`, `jobs.browse(filters)`, `applications.transition(id, status, note?)`),
each returning a typed promise. Pages never call `fetch` directly.

### 3.4 Access/refresh token handling and one-refresh-and-retry

- **Access token**: kept in memory only (a Zustand store field, not
  `localStorage`) — it is short-lived (5 minutes) and re-derivable from the
  refresh token, so there is no reason to persist it to storage that
  survives a reload.
- **Refresh token**: persisted to `localStorage` under a single namespaced
  key (`workforce-match.refreshToken`), since it must survive a page reload
  (5-minute access-token lifetime makes "log in again after every reload"
  unacceptable) and the backend already treats logout as
  security-meaningful via blacklisting (`FRONTEND_CONTEXT.md` §6) — the
  client mirrors that by clearing the stored refresh token on any logout,
  explicit or forced.
- **App boot**: if a refresh token exists in `localStorage`, immediately
  call `POST /api/auth/token/refresh/` before rendering protected routes,
  to obtain a fresh access token; if that call fails, clear storage and
  render as logged out. This avoids a flash of authenticated UI followed by
  a bounce.
- **One-refresh-and-retry**: `api/client.ts` maintains a single in-flight
  refresh `Promise<string> | null` at module scope. The first `401` any
  request receives triggers exactly one `POST /api/auth/token/refresh/`;
  any other requests that 401 while that refresh is in flight await the
  same promise instead of firing their own refresh calls (a simple mutex),
  then all retry their original request exactly once with the new access
  token. If the refresh call itself fails, the store is cleared, the user
  is redirected to `/login` with "Your session ended — please log in
  again," and the originally-intended path is preserved in router state so
  a successful re-login can return there.

### 3.5 Role-based route guards

Covered in §3.2. Source of truth for role is always a fresh
`GET /api/auth/me/` result cached by TanStack Query (`queryKey: ["me"]`),
refetched on login and on window focus after a long idle gap — never a
client-side-decoded JWT claim, since the backend is the only source of
truth for `role` and `is_contact_verified`.

### 3.6 Server-state management

**TanStack Query (React Query) v5.** Justification: nearly every screen is
a GET-then-render or GET-then-mutate-then-invalidate pattern against a
backend with no pagination (§1) — TanStack Query's cache, `invalidateQueries`,
and `useMutation` cover this with minimal boilerplate and no need for a
separate global store beyond auth (§3.7). Query keys are namespaced by
resource and, where relevant, by owner (e.g. `["jobs", "mine"]`,
`["job", id]`, `["applications", "mine"]`, `["recommendations", "jobs"]`).
Every mutating action (`useMutation`) invalidates the specific query keys
it affects, never a blanket refetch-everything.

### 3.7 Client (non-server) state management

**Zustand**, one small store (`authStore`) holding `{ accessToken, user,
isBootstrapping }` and `login/logout/setUser` actions. Nothing else needs
global client state — form state lives in React Hook Form instances,
per-component UI state (accordion open/closed, filter-drawer open) is local
`useState`.

### 3.8 Form management and validation

**React Hook Form + Zod** (`@hookform/resolvers/zod`). One Zod schema per
form, colocated with the page/component that owns it, mirroring backend
constraints exactly so client-side errors appear before a round trip
wherever cheaply possible:

- `phone_number`: exactly 10 digits (matches `User.phone_number`,
  `max_length=10`; the backend enforces uniqueness, not format beyond
  length, but the field is treated as digits-only client-side per the
  design spec's `PhoneField`).
- `pan_vat_number`: exactly 9 digits, matching
  `profiles/models.py:pan_vat_number_validator` (`^\d{9}$`) precisely.
- `experience_years`, `preferred_travel_radius_km`,
  `number_of_workers_required`: non-negative integers, matching each
  model field's `PositiveSmallIntegerField`/`PositiveIntegerField` +
  validators.
- `expected_wage`, `wage_amount`: non-negative decimals
  (`MinValueValidator(0)`).
- `application_deadline` (create only): must not be in the past, mirroring
  `JobPostSerializer.validate_application_deadline` (the backend only
  rejects this on create, not edit — the client schema matches that
  asymmetry rather than over-validating).
- `category`/`subcategory` pair: client-side cross-check that the chosen
  subcategory belongs to the chosen category, ahead of the backend's own
  `400` from `JobPostSerializer.validate`.
- Client-side validation is a UX improvement only — every submit path still
  handles the backend's own `400` response and surfaces
  server-authoritative field errors (e.g. duplicate PAN/VAT, username
  taken) via `setError` from `src/api/errors.ts` (§3.10), since some rules
  (uniqueness) cannot be validated client-side at all.

### 3.9 Tailwind design tokens (exact values)

Implemented as CSS custom properties in `src/index.css` (`:root`), mapped
into `tailwind.config.ts` `theme.extend.colors` so both raw CSS and
Tailwind utility classes (`bg-brand-primary`, `text-danger`, etc.) resolve
to the same source of truth. Single light theme only — the design spec's
brief is an outdoor/bright-glare warm palette, not a dark-mode requirement,
and no dark-mode need is stated anywhere in `FRONTEND_CONTEXT.md` or the
design spec, so none is built.

| Token | Hex | Intended pairing |
|---|---|---|
| `--color-bg` | `#FAF8F3` | Page background; `--color-text-primary` on top (contrast ≫ 4.5:1) |
| `--color-surface` | `#FFFFFF` | Cards/panels; `--color-text-primary`/`--color-text-secondary` on top |
| `--color-surface-muted` | `#EDE6DA` | Disabled/secondary panels |
| `--color-text-primary` | `#1C1917` | Body/heading text on `--color-bg` or `--color-surface` |
| `--color-text-secondary` | `#57534E` | Metadata/supporting text on `--color-bg` or `--color-surface` |
| `--color-brand-primary` | `#9A3412` | Primary buttons/links; paired with **white** text |
| `--color-brand-primary-hover` | `#7C2D12` | Hover/active state of primary |
| `--color-brand-secondary` | `#115E59` | Secondary accents; paired with **white** text |
| `--color-success` | `#15803D` | Solid success elements; paired with **white** text |
| `--color-success-bg` / `--color-success-text` | `#DCFCE7` / `#166534` | Success **badges** (light bg + dark text pairing, since a mid-green badge fill with white text reads poorly at small chip sizes) |
| `--color-warning-bg` / `--color-warning-text` | `#FEF3C7` / `#92400E` | Warning badges/notices — amber itself fails AA as text-on-light, so warning is always this light-bg/dark-text pair, never amber text on a light page background |
| `--color-danger` | `#B91C1C` | Solid danger buttons/elements; paired with **white** text |
| `--color-danger-bg` / `--color-danger-text` | `#FEE2E2` / `#991B1B` | Danger badges |
| `--color-neutral-status-bg` / `--color-neutral-status-text` | `#E7E5E4` / `#44403C` | Withdrawn/Closed badges — deliberately muted |
| `--color-focus-ring` | `#2563EB` | Keyboard focus outline only — never reused elsewhere |

Rule carried from the design spec unchanged: status colors are never reused
decoratively. **Contrast is validated with automated tooling, not asserted
by eye** — F0 wires `axe-core`/`jest-axe` into the test setup (§4, Phase F0
test requirements) and F5 runs a full accessibility sweep (§4, Phase F5) as
the actual verification step for every pairing in this table, including the
badge light-bg/dark-text pairs.

### 3.10 English message-catalog approach (future localization)

**`react-i18next`**, initialized once in `src/i18n/index.ts` with a single
`en` namespace (`src/i18n/en.ts`) — chosen over a hand-rolled catalog
because it already supports interpolation and pluralization (needed for
copy like "N jobs" / "1 job") and lazy namespace loading, both of which a
future Nepali/Devanagari catalog will need without a rewrite, per design
spec §23. Every frontend-owned string (nav labels, buttons, empty/success/
error wrapper copy, the "Workforce Matching" brand string itself) is a key in
`en.ts`, accessed via `useTranslation()`'s `t()` — never an inline string
literal in a component.

**Backend-sourced strings are never routed through i18next** —
`reasons[]`, `warnings[]`, and DRF `detail`/field-error text are rendered
exactly as received (after the generic error-shape translation in §3.11,
which restructures *where* an error appears, not *what it says*). This
matches `FRONTEND_CONTEXT.md` §12's explicit warning against client-side
translation of backend English text.

### 3.11 Error translation strategy

`src/api/errors.ts` exports `toFormErrors(error: ApiError): Record<string, string> | null`
and `toBannerMessage(error: ApiError): string`:

- A field-keyed `400` body (`{"phone_number": ["..."]}`) → mapped directly
  onto the matching React Hook Form field via `setError(field, {message})`,
  using the backend's own message text verbatim (already plain English per
  `FRONTEND_CONTEXT.md` §12's examples) — not re-worded.
- A `{"detail": "..."}` body (service-layer messages like "Cannot
  transition application from APPLIED to COMPLETED.", generic `403`s) →
  shown verbatim in an `ErrorBanner`/`InlineErrorMessage`, distinguishing
  `401` vs `403` copy: `401` triggers the refresh-and-retry flow (§3.4)
  and only becomes user-visible if that fails ("Your session ended...");
  `403` always renders as a plain permission explanation with a link to
  the relevant status screen (verification badge, etc.), never a bare
  "Forbidden."
- Network failures (fetch throws, no response at all) → a distinct
  "You appear to be offline" banner, per design spec §21, never conflated
  with a `400`/`401`/`403`.
- A generic fallback ("Something went wrong — please try again.") only
  fires for genuinely unexpected shapes (5xx, malformed JSON) — never as
  the first-choice message for a normal validation error.

### 3.12 Environment variable for the backend base URL

**`VITE_API_BASE_URL`** (Vite requires the `VITE_` prefix to expose a
variable to client code). Documented in `frontend/.env.example` as
`VITE_API_BASE_URL=http://127.0.0.1:8000`, matching the backend's local
dev default (`FRONTEND_CONTEXT.md` §5). `src/api/client.ts` reads
`import.meta.env.VITE_API_BASE_URL` once at module load and prefixes every
request with it plus `/api`. No other frontend env var is required by
anything in this plan (no map/geocoding provider is used, per correction
#5/#6).

### 3.13 Frontend testing tools

None currently exist in the repository (`frontend/` is empty — confirmed
§1). Introduced in Phase F0:

- **Vitest** — test runner, integrates natively with Vite's config/transform
  pipeline (no separate Jest/Babel config needed).
- **React Testing Library** (+ `@testing-library/jest-dom`,
  `@testing-library/user-event`) — component/interaction tests.
- **MSW (Mock Service Worker)** — intercepts `fetch` at the network layer
  in tests, so tests exercise the real `api/client.ts` and
  `api/endpoints/*.ts` code paths (including the refresh-and-retry logic)
  against realistic mocked backend responses shaped exactly like the
  serializers verified in §1, rather than mocking `fetch` ad hoc per test.
- **jest-axe** (or `@axe-core/react` in dev mode) — automated accessibility
  assertions, used starting in F0's smoke test and expanded in F5.
- **Playwright** — explicitly **not** part of the required stack for this
  plan; each phase's "manual verification steps" against the running
  backend (using `seed_demo` data) serve as the end-to-end check, per
  `CLAUDE.md`'s lightweight-infrastructure engineering rule. It can be
  added later as a stretch item in F5 if time remains, not a completion
  requirement of any phase.

---

## 4. Phased implementation plan

### Phase F0 — Frontend foundation and architecture

**Files created:**
`frontend/package.json`, `vite.config.ts`, `tsconfig.json`,
`tsconfig.node.json`, `index.html`, `postcss.config.js`,
`tailwind.config.ts`, `.env.example`, `src/main.tsx`, `src/App.tsx`,
`src/index.css` (design tokens, §3.9), `src/api/client.ts`,
`src/api/errors.ts`, `src/types/api.ts`, `src/state/authStore.ts`,
`src/lib/queryClient.ts`, `src/routes/router.tsx`, `src/routes/guards.tsx`,
`src/i18n/index.ts`, `src/i18n/en.ts`, `src/components/layout/AppShell.tsx`,
`src/components/primitives/{ErrorBanner,SkeletonBlock,SkeletonCard}.tsx`,
`src/test/setup.ts`, `src/test/msw/{handlers,server}.ts`, `vitest.config.ts`.

**Routes:** a single placeholder `/` rendering `AppShell` — no real pages
yet.

**API endpoints used:** none invoked by UI yet; `api/client.ts` is built
and unit-tested directly (including the refresh-and-retry mutex) against
MSW-mocked `/api/auth/token/refresh/` responses.

**Reusable components:** `AppShell`, `ErrorBanner`, `SkeletonBlock`,
`SkeletonCard` — foundational primitives only.

**TypeScript data types:** `ApiError`, `ApiSuccess<T>` shared envelope
types in `src/types/api.ts`.

**State-management approach:** Zustand `authStore` scaffolded (§3.7);
TanStack Query client configured (§3.6) with sane defaults (no automatic
retries on 4xx, since those are never transient).

**Validation approach:** Zod + `@hookform/resolvers` installed; no forms
exist yet to apply it to.

**Test requirements:** `api/client.ts` refresh-and-retry unit tests
(single in-flight refresh under concurrent 401s; forced logout when
refresh itself fails); one smoke test rendering `<App />` inside
`RouterProvider`/`QueryClientProvider` with no console errors; `jest-axe`
wired and passing on the empty shell.

**Manual verification steps:** `npm install && npm run dev` boots at
`http://localhost:5173`; blank shell renders with no console errors;
confirm a request from the dev server to the running Django backend
(`python manage.py runserver`) succeeds without a CORS error (backend
`.env` already allow-lists `http://localhost:5173`, confirmed in §1 —
no backend change needed); `npm run typecheck`, `npm run lint`,
`npm run test` all pass.

**Completion criteria:** scaffold builds, typechecks, and lints clean;
refresh-and-retry logic is unit-tested and correct; directory structure
matches §3.1.

**Dependencies:** none (first phase).

**Checkpoint commit message:**
`chore(frontend): scaffold Vite/React/TS/Tailwind foundation with API client, auth store, routing, and test harness`

---

### Phase F1 — Public pages and authentication

**Files created:**
`src/pages/public/{Landing,Login,Register}.tsx`,
`src/api/endpoints/auth.ts`, `src/types/user.ts`,
`src/components/primitives/{TextField,PasswordField,PhoneField,PrimaryButton,InlineErrorMessage}.tsx`,
`src/components/auth/{AuthCard,RoleToggle}.tsx`,
`src/components/shared/{CategoryTile,SectionHeading}.tsx`,
`authStore.ts` wired to real `login`/`logout`/bootstrap calls,
`guards.tsx` implemented for real (`RequireAuth`, public-only redirect).

**Routes:** `/`, `/login`, `/register`. Post-login role router (not a
visible route — a redirect performed after `GET /api/auth/me/` resolves,
targeting `/worker` or `/employer`, both still 404 placeholders until F2/F3).

**API endpoints used:** `POST /api/auth/register/`, `POST /api/auth/login/`,
`POST /api/auth/token/refresh/`, `POST /api/auth/logout/`,
`GET /api/auth/me/`, `GET /api/taxonomy/tree/` (Landing category teaser).

**Reusable components:** `AuthCard`, `TextField`, `PasswordField`,
`PhoneField`, `RoleToggle`, `PrimaryButton`, `InlineErrorMessage`,
`CategoryTile`, `SectionHeading`.

**TypeScript data types:** `User`, `Role`, `RegisterPayload`,
`LoginPayload`, `TokenPair`.

**State-management approach:** `authStore` fully wired; `["me"]` TanStack
Query drives the role router; `["taxonomy", "tree"]` query for Landing.

**Validation approach:** Zod `registerSchema` (username required,
email format, `phone_number` exactly 10 digits, password non-empty —
strength itself is validated server-side by Django's password validators
and surfaced via `toFormErrors`, not duplicated client-side, since the
rules are configurable server config, not a fixed client-known pattern),
`loginSchema` (username + password required).

**Test requirements:** Register form — submits correct payload shape,
shows the exact confirmation-then-redirect flow from correction #2 (assert
no access token is set in `authStore` after a successful `201`, and that
navigation lands on `/login`, not any authenticated route), field-error
mapping test for a `400` (username taken). Login form — success redirects
based on mocked `role`; `401` shows the plain-language message from §3.11,
never raw DRF text. `RequireAuth`/public-only guard redirect tests.

**Manual verification steps:** Against the running backend with
`seed_demo` data — register a new worker account, confirm the exact
sequence "Account created" confirmation → land on `/login` → nothing is
auto-authenticated (verify by checking `localStorage`/network tab: no
`/token/refresh/` or authenticated request fires before an explicit login);
then log in with the new account and confirm redirect; separately log in
as `demo_worker_electrician` / `DemoPass123!` and `demo_employer_verified` /
`DemoPass123!` and confirm both redirect to their (still-placeholder)
dashboards; attempt login with a bad password and confirm the plain-language
`401` message; reload the page after login and confirm the session survives
via the refresh token (no forced logout).

**Completion criteria:** registration flow matches correction #2 exactly —
no code path exists that authenticates a user as a side effect of
registration; login/logout/refresh fully functional against the live
backend; role is read from `/me` and stored, ready for F2/F3's route
guards to consume.

**Dependencies:** Phase F0.

**Checkpoint commit message:**
`feat(frontend): public landing, login, and confirm-then-login-only registration`

---

### Phase F2 — Worker profile, job browsing, job detail, and applications

**Files created:**
`src/pages/worker/{Dashboard,Profile,Applications}.tsx`,
`src/pages/shared/{JobBrowse,JobDetail}.tsx`,
`src/api/endpoints/{profiles,jobs,applications}.ts`,
`src/types/{profile,taxonomy,job,application}.ts`,
`src/lib/useGeolocation.ts`,
`src/components/shared/{ProfileSectionAccordion,AddressField,CoordinateCapture,
SkillChipInput,UnmatchedTermNotice,ProfileSummaryCard,CategorySelect,
SubcategorySelect,WorkTypeSelect,DistanceSlider,JobCard,FilterBar,
FilterSheet,EmptyState,ApplyPanel,NoteTextArea,StatusChip,
StatusFilterTabs,WithdrawConfirmDialog}.tsx`,
`src/components/layout/{TopBar,BottomTabBar}.tsx` (worker item set only;
employer item set added in F3).

A minimal Worker Dashboard (`/worker`) is included in this phase, not
listed separately in the task's phase breakdown, because it is the
unavoidable landing target of F1's post-login role router — without it
there is nowhere for a logged-in worker to land. It ships with the
at-a-glance summary cards from design spec §7 (applications count, top
recommendation preview, rating snippet) using endpoints already available
in this phase plus `GET /api/recommendations/jobs/?limit=1` and
`GET /api/applications/ratings/summary/`.

**Routes:** `/worker` (guarded, `RequireRole("WORKER")`),
`/worker/profile` (guarded), `/jobs` (public + worker-aware — auth-aware
distance defaulting per `ActiveJobBrowseView`'s behavior, confirmed §1),
`/jobs/:id` (public, with an Apply action rendered only for an
authenticated worker on an `ACTIVE` job), `/worker/applications` (guarded).

**API endpoints used:** `GET`/`PUT`/`PATCH /api/profiles/worker/me/`,
`GET /api/taxonomy/categories/`, `GET /api/taxonomy/subcategories/?category=`,
`GET /api/jobs/browse/?...`, `GET /api/jobs/<id>/`, `POST /api/applications/`,
`GET /api/applications/`, `PATCH /api/applications/<id>/status/`.

**Reusable components:** listed above; `JobCard`, `StatusChip`,
`CategorySelect`/`SubcategorySelect` are shared forward into F3.

**TypeScript data types:** `WorkerProfile`, `SkillTagSummary`, `Category`,
`Subcategory`, `JobPost` (owner and public variants, matching
`JobPostSerializer` vs `PublicJobPostSerializer`'s different field sets —
confirmed §1), `Application`, `ApplicationStatus` (the 8-value union),
plus a typed constant mirroring `WORKER_ALLOWED_TRANSITIONS` so the UI's
button-gating logic is a direct, testable copy of the backend's table
rather than an independently-invented one.

**State-management approach:** TanStack Query for all reads; `useMutation`
for profile section saves (`PATCH`, one per accordion section per design
spec §2.6), apply, and withdraw — each invalidates only its own query key.

**Validation approach:** Zod schemas per profile section (Basics, Location,
Skills, Availability & Wage) matching the constraints in §3.8;
`skill_input` validated as a non-empty array of non-empty strings client-side,
with `unmatched_terms` from the response surfaced via `UnmatchedTermNotice`,
never silently dropped (per `FRONTEND_CONTEXT.md` §4.3).

**Test requirements:** independent per-section `PATCH` save tests
(confirm a Skills-only save doesn't touch other fields); unmatched-terms
display test; job browse filter tests including the dependent
subcategory dropdown and the legitimate "Plumbing job, no demo worker
match" empty state (per `FRONTEND_CONTEXT.md` §12); duplicate-apply
blocked test (`400` surfaced correctly); a table-driven test asserting,
for each of the 8 `Application.Status` values and each actor
(worker/employer), that only the buttons legal per
`WORKER_ALLOWED_TRANSITIONS`/`EMPLOYER_ALLOWED_TRANSITIONS` render — this
test is written once here and reused/extended in F3 for the employer side;
`WithdrawConfirmDialog` interaction test (cancel vs. confirm).

**Manual verification steps:** browse `/jobs` unauthenticated, then as
`demo_worker_electrician` (confirm distance defaults to the worker's stored
coordinates without supplying `latitude`/`longitude` query params);
open the "Water Tank Installation & Pipe Fitting" (Plumbing) job detail
directly and confirm it renders correctly with no matching-worker-specific
UI breakage; apply to an active job with a fresh test worker account and
confirm the duplicate-apply attempt is blocked by the UI before it would
even hit the backend's `400`; view `/worker/applications` logged in as
`demo_worker_hari` (`APPLIED`) and `demo_worker_sita` (`SHORTLISTED`) and
confirm each shows exactly the status chip and action set the transition
table allows; attempt Withdraw and confirm the confirmation dialog
appears before the `PATCH` fires; deny browser geolocation permission
during profile setup and confirm the flow completes anyway with
"distance unknown" as an accepted, non-error state.

**Completion criteria:** a worker can complete their profile section by
section with independent saves; job browsing/detail/apply/withdraw all
work end-to-end against the live backend; the state-machine button-gating
table is implemented as a direct, tested mirror of the backend's own
transition tables; geolocation is verified optional, not required.

**Dependencies:** Phase F0, Phase F1 (auth, routing, guards).

**Checkpoint commit message:**
`feat(frontend): worker profile, job browsing/detail, and application lifecycle`

---

### Phase F3 — Employer profile, job management, and applicant transitions

**Files created:**
`src/pages/employer/{Dashboard,Profile,Jobs,JobForm,JobDetail,Applications}.tsx`,
`src/components/shared/{VerificationStatusBanner,PanVatField,
JobStatusFilterTabs,JobOwnerRow,JobOwnerCard,WageFields,DateTimeField,
ApplicationDeadlineField,JobPreviewCard,ApplicantRow,ApplicantCard,
StatusTransitionButtonGroup,EmployerNoteField,CloseJobConfirmDialog,
ConfirmDialog (generic, used by Reject/Cancel too, per design spec §18)}.tsx`,
`src/components/layout/{TopBar,BottomTabBar}.tsx` extended with the
employer item set, `guards.tsx` extended with `RequireVerifiedEmployer`.

**Correction #4 applied here:** the mobile bottom tab bar's employer item
set is **Home · My Jobs · Profile** (three items, not the design spec's
four including "Applicants") — plus whatever overflow pattern the tablet
"More" menu already provides for less-frequent items (Ratings, CV n/a for
employers). No route, component, or nav entry anywhere aggregates
applications across jobs; `/employer/jobs/:id/applications` is reachable
only by first opening a specific job from `/employer/jobs` or
`/employer/jobs/:id`.

**Routes:** `/employer` (guarded, `RequireRole("EMPLOYER")`),
`/employer/profile` (guarded), `/employer/jobs` (guarded),
`/employer/jobs/new` (guarded by `RequireVerifiedEmployer`),
`/employer/jobs/:id/edit` (guarded, owner-only, any verification status —
matches the backend's `IsVerifiedEmployer` gate being `POST`-only,
confirmed §1), `/employer/jobs/:id` (guarded, owner-only),
`/employer/jobs/:id/applications` (guarded, owner-only).

**API endpoints used:** `GET`/`PATCH /api/profiles/employer/me/`,
`GET`/`POST /api/jobs/`, `GET`/`PUT`/`PATCH /api/jobs/<id>/`,
`GET /api/jobs/<job_id>/applications/`,
`PATCH /api/applications/<id>/status/`, plus `GET /api/taxonomy/categories/`
and `.../subcategories/?category=` reused from F2.

**Reusable components:** listed above, plus `CategorySelect`,
`SubcategorySelect`, `SkillChipInput`, `StatusChip` reused directly from
F2 with no modification.

**TypeScript data types:** `EmployerProfile`, `JobPostCreatePayload` /
`JobPostUpdatePayload` (distinct from the read shape — `required_skills_input`/
`preferred_skills_input` are write-only per `JobPostSerializer`, confirmed
§1), employer-side transition constant mirroring
`EMPLOYER_ALLOWED_TRANSITIONS`.

**State-management approach:** TanStack Query for `["jobs", "mine"]`,
`["job", id]`, `["job", id, "applications"]`; mutations for
create/update/close a job and each status transition, each invalidating
precisely the affected query keys (a status transition invalidates that
job's applications list, not the whole jobs list).

**Validation approach:** Zod `employerProfileSchema` (PAN/VAT exactly 9
digits per §3.8, with the backend's own duplicate-PAN `400` surfaced
verbatim via `toFormErrors`), `jobFormSchema` (title, category/subcategory
with the client-side cross-check from §3.8, description, address,
lat/long, `required_experience_years` ≥ 0, `wage_type`/`wage_amount`,
`work_type`, `application_deadline` not-in-past **on create only**,
`number_of_workers_required` ≥ 1, required/preferred skill-input arrays
kept as two visually and structurally separate `SkillChipInput`s so a
term is never ambiguously "required or preferred").

**Test requirements:** PAN/VAT validation tests (valid 9-digit passes;
8/10-digit and non-digit rejected client-side; duplicate-PAN `400`
surfaced as a field error, not a banner); "Post a Job" disabled +
`RequireVerifiedEmployer` route-guard test using a `PENDING`-status mocked
employer; employer-side table-driven status-transition button-gating test
(extends F2's test with `EMPLOYER_ALLOWED_TRANSITIONS`); Close-job
confirmation-dialog test plus a test asserting no "reopen" action is ever
rendered once a job is `CLOSED`; category/subcategory mismatch prevented
client-side before submit.

**Manual verification steps:** log in as `demo_employer_pending` and
confirm "Post a Job" is disabled with the exact explanatory copy from
design spec §16/§15, and that navigating directly to `/employer/jobs/new`
renders the blocked message rather than the form; log in as
`demo_employer_verified`, create a job, edit a field, close it, and
confirm attempting to "reopen" (there is no such button, but confirm the
edit form doesn't allow setting status back to `ACTIVE`) is impossible;
open the wiring job's Applications screen and drive `demo_worker_hari`'s
`APPLIED` application through Shortlist → Contact → Hire (confirming each
step's button set changes correctly) without ever seeing an Applicants nav
item anywhere outside a specific job's page.

**Completion criteria:** full employer job lifecycle (create, edit, close,
never delete) works against the live backend; verification gating matches
backend `403` behavior exactly in both the enabled and disabled UI paths;
no employer-wide applications aggregation exists anywhere in the app,
per correction #4.

**Dependencies:** Phase F0, F1, F2 (shares `CategorySelect`,
`SubcategorySelect`, `SkillChipInput`, `StatusChip`, `ProfileSectionAccordion`
built in F2).

**Checkpoint commit message:**
`feat(frontend): employer profile, job management, and applicant status transitions`

---

### Phase F4 — Recommendations, opportunity advisory, CV, and ratings

**Files created:**
`src/pages/worker/{Recommendations,Opportunities,CV,Ratings}.tsx`,
`src/pages/employer/{Candidates,Recommendations,Ratings}.tsx`,
`src/api/endpoints/recommendations.ts`, `src/types/recommendation.ts`,
`src/types/rating.ts`,
`src/components/shared/{RecommendationCard,ScoreBar,MatchScoreRing,
ReasonsList,WarningsList,MutualFitBadge,NearMissJobCard,MissingSkillRow,
UnlockedJobsLink,CVPreviewFrame,DownloadButton,RatingSummaryCard,
StarRatingDisplay,RatingHistoryRow,RateEngagementButton,RatingFormDialog,
CandidateCard}.tsx`.

**Correction #3 applied here:** the Ratings screens (`/worker/ratings`,
`/employer/ratings`) ship `RatingSummaryCard` (aggregate,
`GET /api/applications/ratings/summary/`) and rely on the "Rate this
engagement" action already present on each `COMPLETED` application row
(built in F2/F3's Applications screens) calling
`POST /api/applications/<id>/rating/` directly from that row. A
`RatingHistoryRow` **list** reconstructed by calling
`GET /api/applications/<id>/rating/` once per completed application is
built only if time remains after the rest of this phase — it is not a
completion-blocking deliverable, since it costs one request per completed
application against a backend with no bulk-ratings endpoint (confirmed §1).

**Correction #6 applied here:** `/employer/jobs/:id/recommendations` ships
only the ranked `RecommendationCard` list with expandable per-candidate
score breakdowns. No "select up to 3 to compare" toggle or side-by-side
column view is built.

**Routes:** `/worker/recommendations`, `/worker/opportunities`,
`/worker/cv`, `/worker/ratings` (all guarded, `RequireRole("WORKER")`);
`/employer/jobs/:id/candidates` (guarded, owner-only, any verification
status), `/employer/jobs/:id/recommendations` (guarded by
`RequireVerifiedEmployer` + owner-only), `/employer/ratings` (guarded,
`RequireRole("EMPLOYER")`).

**API endpoints used:** `GET /api/recommendations/jobs/?limit=`,
`GET /api/recommendations/jobs/<job_id>/workers/?limit=`,
`GET /api/recommendations/opportunities/`,
`GET /api/jobs/<id>/candidates/?max_distance_km=`,
`GET /api/profiles/worker/me/cv/preview/`,
`GET /api/profiles/worker/me/cv/pdf/`,
`GET`/`POST /api/applications/<id>/rating/`,
`GET /api/applications/ratings/summary/`.

**Reusable components:** listed above; `RecommendationCard` is shared
verbatim between worker-side job recommendations, employer-side worker
recommendations, and near-miss jobs in Opportunity Advisory, per design
spec §11/§12/§19.2.

**TypeScript data types:** `RecommendationResult<TSubject>` generic
(subject = job or worker), `SkillScore`, `AvailabilitySubScores`,
`ReliabilitySubScores`, `OpportunityAdvisory`
(`near_miss_jobs`, `missing_skills`), `MissingSkillAdvisory`, `Rating`,
`RatingSummary` — all field names taken directly from
`recommendations/serializers.py` and `applications/serializers.py`,
confirmed §1.

**State-management approach:** TanStack Query, read-only for all
recommendation/advisory/CV-preview data (`staleTime` tuned modestly since
scores are computed fresh per request, not cached server-side); rating
submission as a `useMutation` invalidating that application's rating query
and the ratings-summary query together.

**Validation approach:** rating submission form — `score` 1–5 required,
`review_text` optional, ≤1000 chars (matches `RatingCreateSerializer`);
gated so the "Rate this engagement" action only renders when
`status === "COMPLETED"` **and** no existing rating in that direction is
present (checked via a `GET /api/applications/<id>/rating/` call on that
row), matching `submit_rating`'s own guard.

**Test requirements:** score-breakdown rendering — `distance_km`/`distance_score`
`null` renders "Distance unknown" text, never `0 km`/`0%`;
`reciprocal_preference_score` always rendered as a separately-labeled
"Mutual fit" element, never combined visually with `final_score`;
`reasons`/`warnings` render as visually distinct lists (green/amber);
opportunity-advisory empty-state test and missing-skill sentence-construction
test (`missing_frequency`/`job_ids` → "X — needed for N job(s) you're close
to qualifying for"); CV preview renders the returned HTML safely (sandboxed
iframe or sanitized render — no `dangerouslySetInnerHTML` without
sanitization) and PDF download test asserts the filename is read from
`Content-Disposition`, not hardcoded; rating-gated-on-COMPLETED test;
`RequireVerifiedEmployer` 403-fallback test for
`/employer/jobs/:id/recommendations`.

**Manual verification steps:** as `demo_worker_electrician`, view
Recommendations (expect a top score around 98 per
`FRONTEND_CONTEXT.md` §10) and Opportunity Advisory; as `demo_worker_hari`,
confirm the near-miss Masonry match (~67) surfaces "Tile Installation" as
a missing-skill suggestion linking back to the correct job; as
`demo_worker_gita`, confirm "distance unknown" renders correctly (no
coordinates on file, per seed data); download the CV as PDF and confirm
the browser save dialog uses the server-provided filename; as
`demo_worker_electrician`, submit a rating on the `COMPLETED` application with
`demo_employer_verified` and confirm the aggregate summary updates
immediately; as `demo_employer_verified`, view worker recommendations for
a job; as `demo_employer_pending`, confirm the same route renders the
blocked/explanatory state instead of a raw error.

**Completion criteria:** all five ranking components plus the
explanatory "Mutual fit" metric are rendered per the plain-language rules
in design spec §11; ratings work end-to-end for the aggregate-plus-inline
pattern mandated by correction #3; CV preview/PDF fully functional; no
candidate comparison feature exists, per correction #6.

**Dependencies:** Phase F0–F3 (the "Rate this engagement" entry point
lives on Applications rows built in F2/F3; this phase wires its target
screens and the submission itself).

**Checkpoint commit message:**
`feat(frontend): explainable recommendations, opportunity advisory, CV, and ratings`

---

### Phase F5 — Responsive polish, accessibility, testing, and demo validation

**Files created/changed:** no new feature pages. Changes concentrated in
`src/components/layout/{TopBar,BottomTabBar,TabletMoreMenu}.tsx` (final
breakpoint behavior per design spec §3.2–§3.4), a global a11y pass across
existing components (`aria-live` on `StatusChip` updates, `aria-describedby`
wiring on every form field's error message, verifying the focus-ring token
from §3.9 is applied consistently and never overridden), `src/index.css`
`prefers-reduced-motion` handling for skeletons/transitions,
`frontend/README.md` (frontend-specific dev setup instructions), and a
final i18n sweep replacing any inline string literal missed in F1–F4 with
an `en.ts` catalog key.

**Routes:** none new.

**API endpoints used:** none new.

**Reusable components:** none new — this phase hardens existing ones.

**TypeScript data types:** none new.

**State-management approach:** unchanged.

**Validation approach:** unchanged.

**Test requirements:** full Vitest suite green (`npm run test`);
`jest-axe` accessibility assertions added for every top-level page, not
just the F0 smoke test; responsive rendering tests at the three documented
breakpoints (≥1024px top bar, 768–1023px collapsed "More" menu, <768px
bottom tab bar) confirming the correct nav pattern and the corrected
three-item employer mobile tab set from Phase F3; a full run-through test
suite (or a single long integration test) that walks the exact sequence in
`docs/DEMO_SCRIPT.md` against MSW-mocked responses shaped from the real
`seed_demo` data, covering every state referenced there (the no-match
Plumbing job, `demo_worker_gita`'s distance-unknown state, the
unverified-employer gate, the full `COMPLETED` + bidirectional-rating
lifecycle).

**Manual verification steps:** resize the browser continuously through
all three breakpoints and confirm the nav pattern transitions correctly
with no layout jump; complete a full task (e.g. apply to a job) using only
the keyboard, confirming a visible focus ring throughout and no keyboard
trap; increase OS/browser font size and zoom to confirm no text
truncation or overlap (per design spec §23's "no hard-truncated,
fixed-pixel label boxes" requirement); run `docs/DEMO_SCRIPT.md` live,
start to finish, in the actual running frontend against the actual running
backend with `seed_demo` data, confirming every referenced state renders
correctly and no console errors/warnings appear on any screen.

**Completion criteria:** the full engineering-rule test command set passes
(`npm run typecheck`, `npm run lint`, `npm run test`); an automated
accessibility check passes on every page with no unresolved contrast or
ARIA violations against the §3.9 token table; the demo script runs
cleanly end-to-end in the browser with no manual workarounds.

**Dependencies:** all prior phases (F0–F4).

**Checkpoint commit message:**
`chore(frontend): responsive polish, accessibility pass, and demo validation for Week 6 frontend`

---

## 5. Summary of what was NOT changed

No file outside `docs/FRONTEND_IMPLEMENTATION_PLAN.md` was created or
modified to produce this plan. No package was installed. No backend or
frontend code was written. `docs/FRONTEND_DESIGN_SPEC (1).md` was read but
not edited.
