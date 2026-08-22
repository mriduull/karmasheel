# Production deployment guide

This repository is prepared for a conventional two-service deployment:

- `frontend/`: a React/Vite static site (the canonical user interface)
- `backend/`: a Django/Gunicorn API and admin service
- PostgreSQL: the production database
- persistent media storage: required if profile-photo uploads are enabled

The Django root returns an API index when `DEBUG=False`; the older
Django-rendered demonstration interface is local-debug-only. Do not deploy
SQLite, Vite's development server, or Django's `runserver`.

## 1. Required production services

Provision:

1. An HTTPS static-site service for `frontend/dist`.
2. An HTTPS Linux web service for Django with Python 3.12.
3. PostgreSQL with automated backups and TLS where supported.
4. A persistent disk mounted to the Django service for profile photos, or an
   object-storage integration before scaling beyond one instance.

Use separate hostnames such as:

```text
https://app.example.com       React frontend
https://api.example.com       Django API and admin
```

For `CV_PDF_ENGINE=weasyprint`, install Pango/Cairo/GDK-Pixbuf in the
backend image. On Debian/Ubuntu-based hosts:

```bash
apt-get update && apt-get install -y \
  libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libcairo2
```

If the provider cannot install those libraries, use `CV_PDF_ENGINE=basic`
and verify the reduced renderer in staging.

## 2. Backend environment

Set these in the hosting provider's secret/environment manager, never in a
committed file:

```dotenv
DJANGO_SECRET_KEY=<unique random value of at least 50 characters>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=api.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
CSRF_TRUSTED_ORIGINS=https://api.example.com
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
DB_SSL_REQUIRED=True
CV_PDF_ENGINE=weasyprint
DJANGO_MEDIA_ROOT=/var/data/workforce-matching-media
DJANGO_SERVE_MEDIA=True
DJANGO_LOG_LEVEL=INFO
```

If the provider gives separate database fields, omit `DATABASE_URL` and set
`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT` instead.
`DATABASE_URL` takes precedence when both forms exist.

Production defaults already enable HTTPS redirects, secure session/CSRF
cookies, a one-hour HSTS policy, compressed manifest static files, connection
health checks, and baseline API throttling. Keep the application behind the
provider's trusted TLS proxy. Do not enable HSTS subdomains or preload until
every subdomain has been verified as HTTPS-only.

For a small single-instance defense deployment, `DJANGO_SERVE_MEDIA=True`
serves the mounted media directory through Django. The mount must survive
releases and restarts. For multiple instances or meaningful public traffic,
replace this with object storage/CDN; a local filesystem is not shared between
instances.

## 3. Backend build, release, and start commands

Run from the repository root on the hosting service.

Build:

```bash
python -m pip install -r requirements.txt
python backend/manage.py collectstatic --noinput
```

Release/bootstrap, in this order:

```bash
python backend/manage.py migrate --noinput
python backend/manage.py seed_taxonomy
```

`seed_taxonomy` is idempotent and loads the required 12-category structured
taxonomy. Never run `seed_demo` or pass its `--force` flag against production.

Start:

```bash
gunicorn --chdir backend config.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers 2 --threads 4 --timeout 120 \
  --access-logfile - --error-logfile -
```

The same start command is recorded in the root `Procfile`. Configure the
platform liveness probe as `/api/health/` and readiness probe as
`/api/readiness/`. Readiness returns `503` if a real `SELECT 1` database query
fails.

After the first release, open a secure one-off provider shell and run:

```bash
python backend/manage.py createsuperuser
```

Use a named administrator account with a unique password. Do not create or
retain the seeded `demo_admin` account in production.

## 4. Frontend build and publish

Set this non-secret build variable on the static-site service:

```dotenv
VITE_API_BASE_URL=https://api.example.com
```

It must be an origin only: no trailing `/api`, path, query string, or
credentials. The build now fails immediately when it is missing or malformed.

Build from `frontend/`:

```bash
npm ci
npm run build
```

Publish `frontend/dist`. Configure the host to rewrite every unknown route to
`/index.html` with status 200 so browser routes such as `/worker/profile` work
after refresh. `frontend/public/_redirects` and `_headers` provide these rules
for hosts that recognize that file format; configure equivalent SPA rewrites
and security headers in any other provider. The committed CSP is a portable
baseline; before a public launch, replace the broad `https:` values in
`connect-src` and `img-src` with the exact API and media origins in the
provider's header configuration.

After publishing, inspect the browser network panel and confirm API requests
go to the HTTPS production API—not `127.0.0.1`.

## 5. Pre-release verification gate

Run from a clean checkout before every release:

```bash
python -m pip install -r requirements.txt
python backend/manage.py check --settings=config.test_settings
python backend/manage.py makemigrations --check --dry-run --settings=config.test_settings
python backend/manage.py test --settings=config.test_settings

cd frontend
npm ci
npm run lint
npm test
VITE_API_BASE_URL=https://api.example.com npm run build
npm audit --audit-level=high
```

Also run Django's production check with the real staging environment:

```bash
python backend/manage.py check --deploy
```

Do not waive a warning without documenting why. HSTS subdomain/preload warnings
may remain intentionally disabled until the domain is ready; the core HTTPS,
cookie, host, secret, and debug checks must pass.

The committed GitHub Actions workflow runs the migration-drift check, complete
SQLite and PostgreSQL backend suites, dependency audit, production settings/
static/WSGI smoke checks, frontend suite, lint, and production frontend build
on every push and pull request.

## 6. Staging smoke test

Before promoting to production, verify all of these on the deployed URLs:

- health and readiness return `200` over HTTPS;
- React deep links work after a hard refresh;
- registration, login, refresh, and logout work without CORS errors;
- Worker and Employer route/permission boundaries return the expected 401/403;
- taxonomy categories and skills are populated;
- verified Employer can post/edit/close a job; pending Employer cannot post;
- Worker can browse, filter, apply, withdraw, and see recommendations;
- application status transitions reject illegal transitions;
- both rating directions work only after completion;
- profile-photo upload survives a service restart;
- CV preview and PDF download work and use the response filename;
- Django admin CSS loads and admin actions work;
- desktop and mobile layouts have no console errors.

## 7. Operations before real users

- Back up PostgreSQL and perform a test restore. Define rollback ownership.
- Put authoritative rate limits on login/register at the edge/WAF. Django's
  built-in baseline throttles are per process and are only defense in depth.
- The current refresh JWT is stored in browser `localStorage`. Keep the CSP
  and no-third-party-script policy intact for this release; before handling
  sensitive public accounts, migrate it to a rotated Secure/HttpOnly/SameSite
  cookie design with CSRF protection.
- Schedule `python backend/manage.py flushexpiredtokens` and
  `python backend/manage.py clearsessions` daily.
- Configure uptime monitoring, error alerts, log retention, and disk-usage
  alerts for media storage.
- Review consent, retention, access, and deletion policies for phone numbers,
  PAN/VAT, coordinates, profile photos, CVs, and ratings.
- Remove synthetic demo accounts/data from production and never capture real
  user information in a defense report.

## 8. Release and rollback discipline

Deploy the backend before a frontend that depends on new endpoints. Take a
database backup before migrations, review every migration, and prefer
backward-compatible schema changes. Keep the previous frontend artifact and
backend commit available. A code rollback does not automatically reverse a
database migration; use a reviewed migration plan rather than blindly running
`migrate <old-number>`.
