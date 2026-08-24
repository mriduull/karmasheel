# Defense-report screenshot guide

Use the current React application at `http://localhost:5173`, not the older
Django debug interface at port 8000. All captures must use the synthetic
`demo_*` dataset created by `seed_demo`.

The refreshed report-ready PNG files live in
[`appendix-c/screenshots-2026-08-24/`](appendix-c/screenshots-2026-08-24/).
Presentation-ready 4:3 versions with larger text live in
[`appendix-c/screenshots-2026-08-24-4x3-presentation/`](appendix-c/screenshots-2026-08-24-4x3-presentation/).
The previous [`appendix-c/screenshots/`](appendix-c/screenshots/) folder is
retained as history and should not be mixed with the refreshed sets.

The refreshed report directory contains these 16 files:

- `c01-public-landing.png`
- `c02-public-job-discovery.png`
- `c03a-worker-profile-photo-basics.png`
- `c03b-worker-profile-location-skills.png`
- `c04-worker-job-recommendations.png`
- `c05a-opportunity-near-miss.png`
- `c05b-opportunity-skill-gap.png`
- `c06-worker-applications-ratings.png`
- `c07-generated-worker-cv.png`
- `c08-employer-job-management.png`
- `c09-employer-application-lifecycle.png`
- `c10-employer-worker-recommendations.png`
- `c11-pending-employer-boundary.png`
- `c12a-admin-employer-moderation.png`
- `c12b-admin-taxonomy-moderation.png`
- `c13-mobile-job-discovery.png`

Figures C03, C05, and C12 use two readable screenshots each. C13 is the mobile
capture; the remaining files are desktop captures. The presentation version
frames the true mobile viewport inside a 1440×1080 canvas so every PNG retains
the requested 4:3 slide ratio.

## Prepare a clean capture state

1. Use the disposable SQLite demo database, never production data.
2. Run migrations and `seed_demo` using `config.local_sqlite_settings`.
3. Start Django at `127.0.0.1:8000` and Vite at `localhost:5173`.
4. Confirm the backend `/api/health/` and `/api/readiness/` endpoints return
   `200`.
5. Use a fresh Chrome/Edge guest profile or temporary browser profile with
   extensions, address autofill, password suggestions, bookmarks, and
   notifications absent.
6. Use 1440×900 at 100% zoom for desktop figures and 390×844 for one mobile
   figure. Wait for all loading indicators to disappear.
7. Keep `demo_employer_pending` pending and leave `cnc machine operation`
   unresolved until moderation captures are complete.

Every demo account uses the local-only password printed by `seed_demo`.
Passwords must never appear in a screenshot or caption.

## Main report figures

| Figure | Route and actor | Evidence to keep visible | Suggested caption |
|---|---|---|---|
| C01 | Anonymous `/` | Brand, value proposition, main navigation, feature summary | “Public landing page of the Workforce Matching platform.” |
| C02 | Anonymous `/jobs` | Page heading, category/subcategory/work-type filters, resulting job cards | “Public job discovery using structured taxonomy and work-type filters.” |
| C03 | `demo_worker_electrician`, `/worker/profile` | Profile fields and canonical skill chips; optionally demonstrate `ghar wiring` becoming `House Wiring` with a disposable Worker | “Worker profile with normalized canonical skills and work preferences.” |
| C04 | Same Worker, `/worker/recommendations` | Top three actionable jobs, score/rank, expanded “Why this match?”, five component bars, reasons/warnings | “Explainable worker-to-job ranking exposing every scoring component.” |
| C05 | `demo_worker_hari`, `/worker/opportunities` | Near-miss masonry jobs and recurring `Tile Installation` suggestion linked to two jobs | “Opportunity advisory identifies a recurring missing skill across near-miss jobs.” |
| C06 | `demo_worker_electrician`, `/worker/applications` | Completed application, status, rating state, and aggregate reputation where visible | “Completed application and post-engagement reputation workflow.” |
| C07 | Same Worker, `/worker/cv` | Generated summary, canonical skills, experience, rating, preview/download controls | “Automatically generated worker CV derived from stored profile and work history.” |
| C08 | `demo_employer_verified`, `/employer/jobs` | Verified status, owned active jobs, management actions | “Verified Employer workspace for structured job management.” |
| C09 | Employer → House Wiring → applications | `COMPLETED`, `SHORTLISTED`, and `REJECTED` applicants and only legal actions | “Role-aware application state machine shown across three lifecycle states.” |
| C10 | Employer → House Wiring → recommendations | Top Worker plus lower/far candidate, scores, expanded component explanation | “Job-to-worker ranking demonstrating skill and distance-sensitive ordering.” |
| C11 | `demo_employer_pending`, `/employer` | Pending-verification banner and unavailable job-posting action | “Server-enforced Employer verification boundary.” |
| C12 | `demo_admin`, `/admin/` | Employer verification list or pending unmatched term; no password fields | “Administrator moderation for Employer verification and unmatched skill terms.” |
| C13 | Anonymous `/jobs`, 390×844 | Responsive navigation, filter controls, readable job card | “Responsive mobile job discovery interface.” |

For recommendations, expand the explanation so the screenshot proves the
system is transparent; a score badge alone is weak evidence. Prefer two
readable crops instead of one very tall, unreadable full-page image.

## Appendix verification figures

Capture these separately from the application UI after the final commit and
CI run, so the displayed test count and short commit SHA match the submitted
repository:

- Complete Django test result with the command, final test count, `OK`, and
  exit code.
- Frontend lint, full Vitest count, and production Vite build summary.
- `makemigrations --check --dry-run`, production `check --deploy`, and
  health/readiness responses.
- Selected Postman evidence: `/api/auth/me/` 200, verified-Employer job create
  201, pending-Employer denial 403, illegal application transition 400, and a
  recommendation response 200.

Never reveal an Authorization header or JWT. Collapse request headers and
environment variables before capturing Postman. Direct terminal screenshots
are stronger test evidence than recreated/stylized terminal cards.

## What to hide or remove

Never include:

- access/refresh tokens, cookies, local/session storage, secret keys, database
  URLs/passwords, `.env` content, cloud credentials, or typed passwords;
- real email addresses, phone numbers, PAN/VAT numbers, exact home coordinates,
  faces, addresses, or personal review text;
- autofill/password-manager menus, bookmarks, notifications, terminal history,
  local filesystem paths, or unrelated browser tabs;
- real production/admin data.

The synthetic `demo_*` usernames and synthetic job data are safe when the
caption explicitly says “synthetic demo data.” Prefer a clearly synthetic or
consented avatar if profile-photo upload is shown.

If a value is redacted, state “sensitive value redacted” in the caption. Do
not silently alter evidence.

## Caption and quality standard

Use:

```text
Figure C.n — <actor and action>; <visible result>. Captured from commit
<short SHA> on <date> using synthetic demo data.
```

Before inserting a figure into the report, verify:

- heading, actor/navigation context, input/action, and outcome are readable;
- no spinner, empty accidental state, browser overlay, or console error exists;
- branding, demo data, commit, and caption all belong to the same revision;
- the PNG is inserted without stretching; text remains legible at report size;
- the report discusses what the figure proves rather than merely repeating its
  title.

## Defense-day rehearsal

- Re-seed a fresh disposable database or restore a known-good demo backup.
  `seed_demo` is idempotent but deliberately does not move a manually advanced
  application backward.
- Verify all demo logins, the Worker advisory, the completed/rated application,
  CV preview/PDF, pending Employer denial, and admin moderation.
- Pre-open routes in presentation order and rehearse account switching.
- Do not depend on live geolocation; seeded coordinates already demonstrate
  distance scoring.
- Keep the static screenshot appendix available as fallback if venue internet,
  browser, or projector setup fails.
