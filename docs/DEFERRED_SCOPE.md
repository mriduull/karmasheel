# Deferred Scope

Honest accounting of what Workforce Matching currently does, what's partial, and
what has been intentionally left out of the six-week scope described in
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md). Written during Week 6
Phase 4 (demo preparation) by inspecting the actual repository state, not
from memory of what was planned.

## Implemented and demo-ready

These features are complete, covered by automated tests, and populated with
realistic data by `python manage.py seed_demo` (see
[`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)):

- Custom `User` model, JWT auth (login/refresh/logout with blacklisting),
  worker/employer roles, manual contact verification via the admin.
- Worker and employer profile CRUD, PAN/VAT format validation.
- Auto-generated worker CV (deterministic, template-based HTML + PDF).
- Structured taxonomy (categories, subcategories, standardized skills,
  English/Romanized-Nepali aliases) and the skill-normalization pipeline
  (preprocessing -> exact name -> exact alias -> RapidFuzz fuzzy fallback
  -> unmatched-term storage for admin review).
- Job-post CRUD with required/preferred skills stored separately,
  active/closed status, employer-ownership permissions.
- Worker-to-job and job-to-worker filtering (category, subcategory,
  availability, Haversine distance).
- Application model with duplicate-application prevention and an enforced
  status state machine (worker withdrawal; employer shortlist / contact /
  reject / hire / complete).
- Ratings in both directions after a completed application, with an
  aggregate rating summary per user.
- The Week 4 explainable hybrid recommendation engine (skill coverage +
  cosine similarity, distance falloff, experience, availability/wage
  preference, cold-start-safe reliability, configurable weights,
  deterministic reasons/warnings) in both directions.
- Opportunity advisory: near-miss job detection and ranked missing-skill
  suggestions.
- Django admin registrations for every model above, with search, filtering,
  and verification/moderation actions.
- Postman collection covering the full API surface end to end.
- `seed_demo`: one idempotent command producing a coherent demo dataset
  covering every feature above.

## Partially implemented

- **Contact verification** is a manual admin toggle
  (`is_contact_verified`), not a real OTP/SMS/email verification flow. It
  demonstrates the *data model and gating* (e.g. reliability scoring reads
  it), not an actual verification channel.
- **Employer verification** is likewise a manual admin decision
  (`verification_status`), not an automated document-checking or
  third-party registry lookup.
- **List endpoints have no pagination** (job browsing, worker candidates,
  application lists). Fine at demo scale; would need addressing before a
  large production dataset.
- **Taxonomy search/browse** covers category/subcategory/skill listing and
  a nested tree, but there is no free-text search across skill aliases from
  the API (only from the normalization service internally, and from the
  Django admin's search fields).
- **CORS** is configured with an explicit allow-list (no wildcard), but
  there is no per-environment configuration beyond the one
  `CORS_ALLOWED_ORIGINS` environment variable.

## Intentionally deferred (proposal features not built)

These were never started - listed here so they aren't mistaken for bugs:

- **Complaints / dispute resolution.** No way for either party to flag a
  bad engagement beyond leaving a low rating; no moderation workflow beyond
  an admin deleting an individual `Rating`.
- **Trusted-worker rehiring.** No shortcut for an employer to directly
  re-engage a worker they've completed work with before, outside the normal
  apply/shortlist/hire flow. `Rating` history exists and could inform this,
  but the feature itself does not.
- **Notifications.** No email, SMS, push, or in-app notifications for
  application status changes, new matching jobs, ratings received, etc.
  All of this currently requires the user to check the API/admin directly.
- **Advanced analytics.** No admin dashboards, reporting endpoints, or
  aggregate platform metrics (e.g. fill rates, time-to-hire, category
  demand trends) beyond what Django admin's list/filter views expose
  incidentally.
- **File uploads.** No profile photos, ID/document uploads, or job-site
  images. `WorkerProfile`/`EmployerProfile`/`JobPost` have no `FileField`/
  `ImageField` at all.
- **Advanced NLP / embeddings.** By design (see `IMPLEMENTATION_PLAN.md`
  and the project's engineering rules) - skill matching is deliberately
  RapidFuzz + a curated alias table, not a trained model or vector search.
  Recommendations are deliberately a transparent weighted formula, not a
  learned ranking model.
- **Production deployment.** No Docker/Compose, no WSGI/ASGI server
  config (Gunicorn/uWSGI + reverse proxy), no CI/CD pipeline, no
  structured logging or error tracking, no rate limiting/throttling on any
  endpoint (including auth), no `SECURE_*`/HTTPS hardening, and
  `ALLOWED_HOSTS` is empty - none of this is wired up, since the project
  has run exclusively via `manage.py runserver` against a local database.
- **Password reset / forgot-password flow.** Only login, refresh, and
  logout exist; there is no "forgot password" email/token flow.
- **Minimal HTML frontend.** Listed as optional Week 6 scope in
  `IMPLEMENTATION_PLAN.md`; the `frontend/` directory exists but is empty.
  The platform has been demonstrated and tested entirely through the API
  (Postman/curl) and the Django admin.

## Future enhancements (beyond the original six-week scope)

- Real contact-verification channel (SMS OTP or email link) to replace the
  manual admin toggle.
- Pagination and rate limiting once real usage volume justifies the added
  complexity.
- A trusted-worker rehire shortcut built on top of existing `Rating` and
  `Application` history.
- A notification channel (starting with something as simple as
  transactional email) for status changes.
- A lightweight admin-facing analytics view once there's enough real data
  to make one meaningful.

Any of the above involving new infrastructure (queues, caches, search
clusters) should be weighed against this project's explicit constraint of
staying on transparent, lightweight, rule-based components - see the
"Engineering rules" in the project's `CLAUDE.md`.
