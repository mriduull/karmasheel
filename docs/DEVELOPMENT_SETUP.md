# Development Setup

Exact, copyable steps to get a full local copy of Karmasheel (Django API +
React/Vite frontend) running from a fresh clone. This document is the single
source of truth for full-stack local setup; `README.md` only links here.

If any command below disagrees with what's actually in the repository,
trust the repository (`backend/config/settings.py`, `backend/requirements.txt`
→ root `requirements.txt`, `frontend/package.json`, `frontend/vite.config.ts`).

---

## Prerequisites

- **Git**
- **Python 3.12+** (this repository is developed and tested with Python
  3.12.3; see `backend/config/settings.py` / `requirements.txt` for the
  exact dependency versions the project pins)
- **PostgreSQL 14+**, running locally or reachable over the network (this
  environment currently runs PostgreSQL 16.14 — any 14+ server works)
- **Node.js and npm** — `frontend/package.json` does not pin an exact
  `engines` version; this environment currently runs Node v24.18.0 / npm
  11.16.0. Any reasonably recent Node LTS (20+) should work.
- **A C toolchain / system libraries for WeasyPrint** (CV PDF generation) —
  on Debian/Ubuntu:
  ```bash
  sudo apt-get install libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libcairo2
  ```
- **VS Code** (optional) — not required, no editor-specific config is
  committed (`.vscode/` is gitignored).

---

## Clone and branch setup

```bash
git clone <repository-url>
cd karmasheel
git checkout <development-branch>   # e.g. the branch your team is using
```

The exact remote URL depends on where your team hosts the repository —
use whatever URL/protocol (HTTPS or SSH) you already have access with.

---

## Optional: verify your setup

At any point — right after cloning, or after any step below — you can run
a non-destructive checker (standard-library only, no dependencies
required) that reports what's missing without printing any secret values,
creating a database, or modifying any file:

```bash
python scripts/check_dev_setup.py
```

It checks for `backend/manage.py` and `frontend/package.json`, whether
root `.env` and `frontend/.env` exist and define the required variable
*names* (never their values), whether Python/Node/npm are on `PATH`, and
whether port 5173 is already occupied. It exits non-zero only on a
blocking failure (e.g. a missing `.env`); an occupied port 5173 is
reported as a warning, not a failure, since it doesn't block anything
except starting Vite right now.

---

## Backend setup

All commands below assume you start at the repository root
(`karmasheel/`).

### 1. Create and activate a virtual environment

```bash
python3 -m venv .venv
```

Linux/macOS:

```bash
source .venv/bin/activate
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

### 2. Install backend dependencies

```bash
pip install -r requirements.txt
```

(`requirements.txt` lives at the repository root, not inside `backend/` —
confirmed in `backend/manage.py`'s sibling layout.)

### 3. Create your local environment file

```bash
cp .env.example .env
```

Then edit `.env` and fill in your own local values — **never commit this
file** (`.env` is listed in the root `.gitignore`). See the table below and
the comments inside `.env.example` for what each variable does.

| Variable | Required? | Purpose |
|---|---|---|
| `DJANGO_SECRET_KEY` | Yes | Django's cryptographic secret key. Generate your own — do not reuse the placeholder. |
| `DJANGO_DEBUG` | No (defaults `False`) | `True` for local development. `seed_demo` refuses to run when this is `False`. |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Yes | PostgreSQL connection settings. |
| `DB_HOST` | No (defaults `localhost`) | PostgreSQL host. |
| `DB_PORT` | No (defaults `5432`) | PostgreSQL port. |
| `CORS_ALLOWED_ORIGINS` | No (defaults to none allowed) | Comma-separated list of origins allowed to call the API. Must include your frontend dev server's exact origin (scheme + host + port) or the browser will block every request. |
| `SKILL_MATCH_THRESHOLD` | No (defaults `85`) | RapidFuzz confidence (0–100) for an automatic fuzzy skill match. |
| `RECOMMENDATION_MAX_DISTANCE_KM` | No (defaults `20`) | Distance at which the recommendation engine's distance score reaches 0. |
| `RECOMMENDATION_NEAR_MISS_MIN_SCORE` / `_MAX_SCORE` | No (default `40` / `75`) | Score range the opportunity advisory treats as a "near miss". |

`DJANGO_SECRET_KEY`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` are read via
`os.environ[...]` in `backend/config/settings.py` — Django will crash on
startup with a `KeyError` if any of these four are missing from `.env`.

### 4. Configure PostgreSQL

See the [PostgreSQL setup](#postgresql-setup) section below, then come back
here.

### 5. Run migrations

```bash
cd backend
python manage.py migrate
```

### 6. Confirm the backend is healthy

```bash
python manage.py check
```

### 7. Seed the taxonomy and demo data

```bash
# Taxonomy only — categories, subcategories, standardized skills, aliases.
python manage.py seed_taxonomy

# Full demo dataset (also seeds the taxonomy internally): employers,
# workers, jobs, applications, ratings — everything the recommendation
# engine and the frontend demo walkthrough need.
python manage.py seed_demo
```

Both commands are idempotent — safe to re-run any time. `seed_demo` prints
every demo account's username and shared password when it finishes; see
[Demo accounts](#demo-accounts) below.

### 8. Start Django

```bash
python manage.py runserver 127.0.0.1:8000
```

The API is now at `http://127.0.0.1:8000/`, and the Django admin at
`http://127.0.0.1:8000/admin/`.

---

## PostgreSQL setup

- Unless your team connects to a shared hosted database, **every
  teammate needs their own local PostgreSQL database** — this is normal;
  local databases aren't shared or synced between developers.
- The five `DB_*` values in `.env` map directly to a PostgreSQL role and
  database: `DB_NAME` is the database, `DB_USER`/`DB_PASSWORD` are a role
  with access to it, `DB_HOST`/`DB_PORT` are where PostgreSQL is listening
  (`localhost:5432` for a local install).
- **Never commit a real PostgreSQL password** anywhere in the repository —
  it belongs only in your local, gitignored `.env`.
- Migrations (`python manage.py migrate`) create the schema; they don't
  create the database or role itself — you do that once, up front.
- `seed_taxonomy` and `seed_demo` populate reproducible development data
  on top of that schema — no manual data entry is needed to get a working
  local dataset.

Example (Debian/Ubuntu, using the `postgres` superuser role via `sudo`) —
match the names/password to whatever you put in `.env`, and use your own
password instead of the placeholder shown:

```bash
sudo -u postgres psql -c "CREATE DATABASE karmasheel_db;"
sudo -u postgres psql -c "CREATE USER karmasheel_user WITH PASSWORD 'your-local-password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE karmasheel_db TO karmasheel_user;"
```

If your local PostgreSQL install doesn't use the `sudo -u postgres psql`
convention (e.g. it's already configured for password auth as your own
user, or you're on macOS/Homebrew), use whatever `psql`/`createdb`/
`createuser` invocation your install expects to create the same
database/role/grant — the exact commands are environment-specific, but the
end state (a database and a role that can connect to it) must match your
`.env` values either way.

---

## Frontend setup

All commands below assume you start at the repository root.

### 1. Enter the frontend directory

```bash
cd frontend
```

### 2. Create your local environment file

```bash
cp .env.example .env
```

`frontend/.env` is gitignored — never commit it. The default value,
`VITE_API_BASE_URL=http://127.0.0.1:8000`, already matches the Django
`runserver` address above; you shouldn't need to change it for local
development.

### 3. Install dependencies

This repository has a committed `frontend/package-lock.json`, so prefer a
reproducible install:

```bash
npm ci
```

(`npm install` also works if you're intentionally updating the lockfile,
but `npm ci` is the correct choice for "just get the exact versions the
project already pins".)

### 4. Start the dev server

```bash
npm run dev
```

`vite.config.ts` now fixes the dev server to **port 5173 with
`strictPort: true`** — if port 5173 is already in use, `npm run dev` fails
immediately with a clear "Port 5173 is already in use" error instead of
silently starting on 5174 (which would then fail CORS against the
backend's `CORS_ALLOWED_ORIGINS` and look like an unrelated bug). See
[Troubleshooting](#troubleshooting) below for how to free the port, or to
deliberately opt into a different one.

### 5. Open the app

```
http://localhost:5173
```

### Identifying/freeing port 5173

Only free the port after confirming what's actually using it — don't kill
processes blind.

**Linux:**

```bash
# Identify what's listening on 5173
ss -ltnp | grep :5173
# or, if lsof is installed:
lsof -i :5173

# Once you've confirmed it's safe to stop (e.g. a stale Vite process from
# an earlier session), stop it by PID:
kill <PID>
```

**Windows PowerShell:**

```powershell
# Identify what's listening on 5173
Get-NetTCPConnection -LocalPort 5173 | Select-Object LocalPort, State, OwningProcess

# Confirm what that process actually is before stopping it:
Get-Process -Id <OwningProcess>

# Then stop it:
Stop-Process -Id <OwningProcess>
```

---

## Starting the full system

Two terminals, both starting from the repository root.

**Terminal 1 — backend:**

```bash
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
cd backend
python manage.py runserver 127.0.0.1:8000
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm run dev
```

Vite starts on `http://localhost:5173`.

**Useful local URLs:**

| URL | What |
|---|---|
| `http://localhost:5173` | Frontend (Workforce Match UI) |
| `http://127.0.0.1:8000/api/` | Backend API root (see `README.md`'s API base-paths table) |
| `http://127.0.0.1:8000/admin/` | Django admin |

---

## Demo accounts

Run `python manage.py seed_demo` (step 7 above) to populate a full set of
demo worker/employer accounts, jobs, applications, and ratings. Every demo
account shares the same intentionally-public synthetic password,
**`DemoPass123!`** — this is demo-only data seeded locally by you, not a
real secret.

For the full account list, what each account demonstrates, and a guided
walkthrough of the app using them, see
**[`docs/DEMO_SCRIPT.md`](DEMO_SCRIPT.md)** rather than duplicating that
table here.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Browser console shows a CORS error (`No 'Access-Control-Allow-Origin' header...`) | The frontend's actual origin isn't in the backend's `CORS_ALLOWED_ORIGINS`. This almost always means Vite silently started on a different port than 5173 in the past, or you deliberately ran on 5174 without updating the backend `.env`. With `strictPort: true` now set, `npm run dev` should always be on exactly 5173 unless you passed `--port` yourself — check what port Vite actually printed, and make sure that exact `http://<host>:<port>` origin is listed in `CORS_ALLOWED_ORIGINS`, then restart Django (it only reads `.env` at process startup). |
| `npm run dev` fails immediately with "Port 5173 is already in use" | This is the intended behavior — see [Identifying/freeing port 5173](#identifyingfreeing-port-5173) above. Don't work around it by letting Vite fall back to another port; free 5173 or deliberately choose and document a different one. |
| Frontend shows "Cannot reach the server" | Django isn't running, isn't reachable at the address in `frontend/.env`'s `VITE_API_BASE_URL`, or the request was CORS-blocked (see above). Confirm with `curl http://127.0.0.1:8000/api/taxonomy/categories/` — if that fails, start/fix the backend first. |
| `django.db.utils.OperationalError: connection to server ... failed` | PostgreSQL isn't running, or `DB_HOST`/`DB_PORT` in `.env` don't match. Confirm with `pg_isready` or `sudo systemctl status postgresql`. |
| `django.db.utils.OperationalError: password authentication failed` | `DB_USER`/`DB_PASSWORD` in `.env` don't match the database role you created — see [PostgreSQL setup](#postgresql-setup). |
| `KeyError: 'DJANGO_SECRET_KEY'` (or `DB_NAME`, etc.) on Django startup | Root `.env` is missing, or not actually at the repository root (`backend/config/settings.py` loads it from `BASE_DIR.parent / ".env"`, i.e. `karmasheel/.env`, not `backend/.env`). Run `cp .env.example .env` from the repository root and fill it in. |
| Frontend behaves oddly / logs `VITE_API_BASE_URL is not set` in the console | `frontend/.env` is missing. Run `cp .env.example .env` inside `frontend/`. |
| `relation "..." does not exist` / API 500s referencing missing tables | Migrations haven't been applied. Run `python manage.py migrate` from `backend/`. |
| Taxonomy/job-browse/recommendation endpoints return empty results | The database has no seeded data yet. Run `python manage.py seed_taxonomy` and/or `python manage.py seed_demo` from `backend/` — both are idempotent, safe to re-run. |
| Logged-in pages suddenly redirect to `/login` with "Your session ended" | Your locally stored refresh token expired or was invalidated (e.g. after a database reset). This isn't a bug — log in again. To force-clear a stuck session manually, remove the `workforce-match.refreshToken` key from the browser's `localStorage` for `http://localhost:5173` (DevTools → Application → Local Storage), then reload. |
| Not sure whether the backend itself is healthy | Run `python manage.py check` from `backend/` — it validates settings, models, and the recommendation-weight configuration without touching the database. |

**A CORS-blocked request and a stopped backend are *not* the same as your
computer being offline.** The frontend's API client distinguishes these:
a genuinely offline browser (`navigator.onLine === false`) shows "You
appear to be offline"; a backend that's stopped, unreachable, or
CORS-blocked while your browser has normal connectivity shows "Cannot
reach the server" instead (`frontend/src/api/errors.ts`). If you see
"offline" while your internet connection is clearly fine, that specific
message would itself be a bug worth reporting — the CORS/stopped-backend
cases above should always show the "Cannot reach the server" wording.
