# Karmasheel

Karmasheel is a Django REST Framework and PostgreSQL workforce-matching
platform connecting blue-collar and local-service workers with employers in
Nepal, using structured skills, location, availability, experience,
preferences, and reliability indicators. Recommendations are transparent and
explainable - every match score comes with a plain-language breakdown, never
a black-box model.

## Implemented features

- **Accounts** - custom `User` model (username + unique phone number),
  JWT authentication (login/refresh/logout with blacklisting), worker/employer
  roles, manual contact verification via the Django admin.
- **Profiles** - worker and employer profile CRUD; PAN/VAT format validation;
  auto-generated worker CV (HTML preview and PDF download) built entirely
  from stored profile fields.
- **Taxonomy** - structured categories, subcategories, and standardized
  skills; English and Romanized-Nepali aliases; a skill-normalization
  service (text preprocessing -> exact name match -> exact alias match ->
  RapidFuzz fuzzy fallback -> unmatched-term storage for admin review).
- **Jobs** - job-post CRUD with required/preferred skills stored separately,
  active/closed status, employer-ownership permissions, worker job browsing,
  category/subcategory/availability/Haversine-distance filtering in both
  directions (worker-to-job and job-to-worker).
- **Applications** - duplicate-prevention, an enforced application-status
  state machine (worker withdrawal; employer shortlist/contact/reject/hire/
  complete), and post-completion ratings in both directions with an
  aggregate rating summary per user.
- **Recommendations** - an explainable hybrid scoring engine: required-skill
  coverage + cosine similarity over binary skill vectors, Haversine-distance
  falloff, experience scoring, wage/travel-radius preference scoring, and a
  cold-start-safe reliability score, combined into a configurable weighted
  final score with deterministic, human-readable reasons/warnings. Also
  includes opportunity advisory: near-miss job detection and ranked
  missing-skill suggestions for a worker.
- **Demo data** - a single idempotent management command
  (`seed_demo`, see below) that builds a complete, coherent demonstration
  dataset exercising every feature above.

## Technology stack

- Python 3.12
- Django 6.0 / Django REST Framework
- PostgreSQL
- Simple JWT (`djangorestframework-simplejwt`)
- RapidFuzz (fuzzy skill matching)
- WeasyPrint (CV PDF generation)
- django-cors-headers

## Prerequisites

- Python 3.12+
- PostgreSQL 14+ (running locally or reachable over the network)
- A C toolchain / system libraries required by WeasyPrint for PDF rendering
  (Pango, Cairo, GDK-Pixbuf). On Debian/Ubuntu:
  ```bash
  sudo apt-get install libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libcairo2
  ```

## Repository structure

```
karmasheel/
├── backend/                 # Django project
│   ├── config/               # Settings, root URLconf, WSGI/ASGI, test_settings
│   ├── accounts/              # Custom User model, auth endpoints, seed_demo command
│   ├── profiles/              # Worker/employer profiles, CV generation
│   ├── taxonomy/              # Categories, subcategories, skills, aliases, seed_taxonomy
│   ├── jobs/                  # Job posts, filtering services
│   ├── applications/          # Applications, state machine, ratings
│   ├── recommendations/       # Hybrid scoring engine, opportunity advisory
│   └── manage.py
├── docs/
│   ├── IMPLEMENTATION_PLAN.md  # Original six-week scope
│   ├── DEFERRED_SCOPE.md       # What's implemented vs. deferred (Phase 4)
│   ├── DEMO_SCRIPT.md          # Step-by-step demonstration walkthrough
│   └── postman/                # Postman collection, environment, walkthrough
├── frontend/                 # Reserved for a minimal HTML frontend (not yet built - see DEFERRED_SCOPE.md)
├── .env.example
└── requirements.txt
```

## Setup

### 1. Clone and create a virtual environment

```bash
cd karmasheel
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Copy the example file and fill in real local values - **never commit `.env`**:

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `DJANGO_SECRET_KEY` | Django's cryptographic secret key. Generate your own (e.g. `python -c "import secrets; print(secrets.token_urlsafe(50))"`) - do not reuse the example value anywhere. |
| `DJANGO_DEBUG` | `True` for local development. **Must be `False` in production.** `seed_demo` refuses to run when this is `False` (see below). |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | PostgreSQL connection settings. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of origins allowed to call the API (e.g. a local frontend dev server). No wildcard is used. |
| `SKILL_MATCH_THRESHOLD` | Optional. RapidFuzz confidence (0-100) above which a fuzzy skill match is auto-accepted. Defaults to `85`. |
| `RECOMMENDATION_MAX_DISTANCE_KM` | Optional. Distance at which the distance score reaches 0. Defaults to `20`. |
| `RECOMMENDATION_NEAR_MISS_MIN_SCORE` / `_MAX_SCORE` | Optional. Inclusive final-score range treated as a "near miss" by the opportunity advisory. Defaults to `40` / `75`. |

### 4. Create the PostgreSQL database

```bash
sudo -u postgres psql -c "CREATE DATABASE karmasheel_db;"
sudo -u postgres psql -c "CREATE USER karmasheel_user WITH PASSWORD 'your-postgresql-password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE karmasheel_db TO karmasheel_user;"
```

Match the database/user names and password to whatever you put in `.env`.

### 5. Run migrations

```bash
cd backend
python manage.py migrate
```

### 6. Seed data

Two management commands are available, and can be run independently or
together:

```bash
# Taxonomy only (categories, subcategories, skills, aliases) - no accounts, jobs, or applications.
python manage.py seed_taxonomy

# A full demo dataset: taxonomy (via seed_taxonomy) + a superuser, verified
# and pending employers, four workers with varied skills/experience/
# location/availability/reliability, active jobs across every subcategory,
# applications in several valid states, a completed application rated in
# both directions, and one unmatched skill term for admin review.
python manage.py seed_demo
```

`seed_demo` is **idempotent** - safe to run as many times as you like. It
prints a summary of what was created vs. already up to date, plus every demo
account's username and shared password. It refuses to run when
`DJANGO_DEBUG=False` (pass `--force` only if you are certain the target
database is not production - you should not need this for local development).

### 7. Create an admin account (if you skipped `seed_demo`)

`seed_demo` already creates a superuser (`demo_admin`, printed at the end of
the command). If you'd rather create your own instead:

```bash
python manage.py createsuperuser
```

### 8. Run the development server

```bash
python manage.py runserver
```

The API is now available at `http://127.0.0.1:8000/`, and the Django admin
at `http://127.0.0.1:8000/admin/`.

## API base paths

All endpoints are namespaced under `/api/`:

| Path | App |
|---|---|
| `/api/auth/` | Registration, login, token refresh, logout, `/me/` |
| `/api/profiles/` | Worker/employer profile CRUD, CV preview/PDF |
| `/api/taxonomy/` | Categories, subcategories, skills, taxonomy tree |
| `/api/jobs/` | Job CRUD, public browsing, candidate listing |
| `/api/applications/` | Apply, status transitions, ratings |
| `/api/recommendations/` | Worker-to-job / job-to-worker recommendations, opportunity advisory |
| `/admin/` | Django admin |

## Postman collection

Located at `docs/postman/`:

- `Karmasheel_API.postman_collection.json` - the full request collection.
- `Karmasheel_Local.postman_environment.json` - matching environment
  (local-only demo credentials).
- `POSTMAN_WALKTHROUGH.md` - setup, run order, and a fresh-database manual
  verification step (an employer must be verified before it can post jobs).

To run it: import both JSON files into Postman, select the **Karmasheel
Local** environment, confirm `base_url` matches your running server, then
follow the run order in `POSTMAN_WALKTHROUGH.md`.

## Running tests

```bash
cd backend
python manage.py test --settings=config.test_settings --keepdb
```

`config.test_settings` swaps in a fast, intentionally-insecure password
hasher so fixture users don't pay real PBKDF2 cost on every test; `--keepdb`
reuses the test database between runs instead of rebuilding it each time.

To run one app's tests only:

```bash
python manage.py test accounts --settings=config.test_settings --keepdb
```

Or a focused class/method:

```bash
python manage.py test accounts.tests.SeedDemoCommandTests --settings=config.test_settings --keepdb
```

## Known limitations and deferred scope

See [`docs/DEFERRED_SCOPE.md`](docs/DEFERRED_SCOPE.md) for a full breakdown
of implemented, partially-implemented, and intentionally-deferred features
(complaints, trusted-worker rehiring, notifications, advanced analytics,
file uploads, embeddings/NLP, production deployment, and more).

The `frontend/` directory is currently empty - only the API is implemented
and demonstrated (via Postman/curl and the Django admin). A minimal HTML
frontend was listed as optional Week 6 scope but has not been built.

## Common setup problems and fixes

| Problem | Fix |
|---|---|
| `django.db.utils.OperationalError: connection to server ... failed` | PostgreSQL isn't running, or `DB_HOST`/`DB_PORT` in `.env` don't match. Confirm with `pg_isready` or `sudo systemctl status postgresql`. |
| `django.db.utils.OperationalError: password authentication failed` | `DB_USER`/`DB_PASSWORD` in `.env` don't match the database role you created. |
| `KeyError: 'DJANGO_SECRET_KEY'` (or `DB_NAME`, etc.) on startup | `.env` is missing or not in the repository root (`config/settings.py` loads it from `BASE_DIR.parent / ".env"`, i.e. `karmasheel/.env`, not `backend/.env`). |
| `seed_demo` raises `CommandError: ... refuses to run with DEBUG=False` | Set `DJANGO_DEBUG=True` in `.env` for local development, or pass `--force` if you are certain the database is not production. |
| WeasyPrint import/PDF errors (`OSError: cannot load library ...`) | Install the system libraries listed under Prerequisites - WeasyPrint needs Pango/Cairo/GDK-Pixbuf, not just the Python package. |
| Job creation returns `403 Forbidden` for an employer that should be allowed | Only employers with `verification_status = VERIFIED` may create jobs (`IsVerifiedEmployer`). Verify the employer through the Django admin, or run `seed_demo`, which seeds an already-verified employer. |
| Tests are slow / hang on user creation | Make sure you passed `--settings=config.test_settings` - it swaps in a fast password hasher; without it, hundreds of fixture users each pay real PBKDF2 cost. |
| Re-running `seed_demo` seems to create duplicate-looking jobs/applications | It shouldn't - every record is matched by a natural key (username, employer+title, worker+job) via `get_or_create`/`update_or_create`. If you see unexpected duplicates, check whether they predate `seed_demo` (e.g. from earlier manual testing or a Postman run) rather than being created by it. |
