# Karmasheel

Karmasheel is a Django REST Framework workforce-matching platform for
blue-collar and local-service workers in Nepal. Workers describe their skills
in familiar language, employers publish structured jobs, and the platform
returns ranked matches with visible component scores and plain-language
reasons.

The repository includes:

- JWT registration, login, refresh and logout for worker and employer roles
- worker and employer profiles with manually reviewed verification
- a seeded skill taxonomy and English/Romanized-Nepali normalization
- jobs, distance/category filtering and an enforced application state machine
- explainable worker-to-job and job-to-worker recommendations
- HTML/PDF worker CVs, completed-work ratings and opportunity advisory
- Django admin workflows for every persisted model
- a dependency-free demonstration UI at `/`
- an importable Postman collection and a complete demonstration script

## Fastest local demo

The demo settings use a local SQLite database and a non-production secret.
They are intentionally zero-configuration and must not be deployed.

Prerequisites: Python 3.12 or newer and Git.

On PowerShell:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python backend\manage.py migrate --settings=config.demo_settings
python backend\manage.py seed_taxonomy --settings=config.demo_settings
python backend\manage.py createsuperuser --settings=config.demo_settings
python backend\manage.py runserver --settings=config.demo_settings
```

On macOS/Linux, activate with `source venv/bin/activate` and use `/` instead
of `\` in command paths.

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) for the demo interface
and [http://127.0.0.1:8000/admin/](http://127.0.0.1:8000/admin/) for the
interim admin dashboard.

The PDF endpoint prefers installed Edge/Chrome on Windows and WeasyPrint on
Unix-like systems. Both paths preserve Unicode; if neither is available,
Karmasheel uses a small dependency-free emergency PDF renderer. The
application and CV download therefore still run on a plain Windows setup.

## PostgreSQL development

The primary `config.settings` configuration uses PostgreSQL. Copy
`.env.example` to `.env`, replace every placeholder, create the configured
database/user, then run:

```powershell
python backend\manage.py migrate
python backend\manage.py seed_taxonomy
python backend\manage.py createsuperuser
python backend\manage.py runserver
```

The application reads secrets and database credentials from `.env`; `.env`
is ignored by Git. Never reuse the demo secret or sample Postman credentials
outside a disposable local database.

## Verification

The test configuration is self-contained and uses in-memory SQLite:

```powershell
python backend\manage.py check --settings=config.test_settings
python backend\manage.py makemigrations --check --dry-run --settings=config.test_settings
python backend\manage.py test accounts profiles taxonomy jobs applications recommendations config --settings=config.test_settings
```

For the PostgreSQL configuration, run the same commands without the
`--settings` flag after creating `.env` and the database.

When running tests without explicit app labels, first `cd backend`; Django's
default discovery starts from the current directory.

## Demonstration and API

- [End-to-end demo and API walkthrough](docs/DEMO_WALKTHROUGH.md)
- [Importable Postman collection](docs/Karmasheel.postman_collection.json)
- [Six-week implementation scope](docs/IMPLEMENTATION_PLAN.md)

The Postman collection uses `base_url`, `access`, and `refresh` collection
variables. Requests save worker/employer tokens and created resource IDs as
the workflow progresses.

## Project layout

```text
backend/
  accounts/          custom user, JWT workflow, demonstration frontend assets
  profiles/          worker/employer profiles and CV generation
  taxonomy/          categories, skills, aliases and normalization
  jobs/              job CRUD and coarse candidate filtering
  applications/      applications, state transitions and ratings
  recommendations/   scoring, explanations and opportunity advisory
  config/            project URLs and settings
docs/                scope, demo script and Postman collection
```

Business rules live in service modules, serializers validate and represent
data, and permissions explicitly separate public, worker, employer, owner
and verified-employer operations.

## Deferred scope

This six-week version intentionally does not include OTP/SMS delivery,
certification verification, payments, chat, attendance, wage enforcement,
native mobile apps, map/geocoding providers, background queues, vector
search, embeddings or machine learning. Contact and employer verification
remain manual Django-admin actions. See the defense note in the
[demo walkthrough](docs/DEMO_WALKTHROUGH.md#deferred-scope-and-defense-note).
