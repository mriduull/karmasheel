# Workforce Matching end-to-end demo

This walkthrough demonstrates the complete six-week pipeline through the
Django-served frontend and, separately, through the importable Postman
collection. All usernames, passwords and phone numbers below are disposable
local-demo values.

## 1. Start from a fresh local database

From the repository root:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python backend\manage.py migrate --settings=config.demo_settings
python backend\manage.py seed_taxonomy --settings=config.demo_settings
python backend\manage.py createsuperuser --settings=config.demo_settings
python backend\manage.py runserver --settings=config.demo_settings
```

The demo settings use `backend/db.sqlite3`, set `DEBUG=True`, and accept only
local/test hosts. Use the PostgreSQL-backed default settings for normal
development; never deploy `config.demo_settings`.

Open:

- frontend: `http://127.0.0.1:8000/`
- interim admin dashboard: `http://127.0.0.1:8000/admin/`

## 2. Frontend demonstration script

### Employer setup

1. Register an employer:
   - username: `demo_employer`
   - phone: `9800000901`
   - password: `DemoEmployer2026!`
2. Complete the employer profile with an organization, address, coordinates
   and a nine-digit PAN/VAT number.
3. In `/admin/`, open **Accounts → Users**, select the employer and run
   **Mark selected users as contact verified**.
4. Open **Profiles → Employer profiles**, select the employer and run
   **Mark selected employers as verified**.

This manual checkpoint is intentional: real OTP and automated organization
verification are deferred. Before verification the job-create endpoint
returns `403`, which is the expected permission boundary.

### Worker setup and normalization

1. Log out and register a worker:
   - username: `demo_worker`
   - phone: `9800000902`
   - password: `DemoWorker2026!`
2. Set Kathmandu-area coordinates, an expected wage, travel radius and
   availability.
3. Enter `ghar wiring, fan installation` in **Skills** and save.
4. Confirm the profile now displays standardized **House Wiring** and
   **Ceiling Fan Installation** skills.
5. Optionally mark the worker contact verified in admin.

This demonstrates preprocessing, alias lookup and persisted standardized
tags. Low-confidence phrases are returned to the UI and stored under
**Taxonomy → Unmatched skill terms** for review.

### Job creation and matching

1. Log in as `demo_employer`.
2. Create an active **Residential electrician** job in
   **Construction & Repair → Electrical** near the worker's coordinates.
3. Use `House Wiring` as required and `Ceiling Fan Installation` as
   preferred. Enter a wage and required experience.
4. Click **Rank workers**. Confirm the result has a final score, six visible
   components and deterministic reasons.
5. Log in as `demo_worker`, browse the job, then click **Rank jobs for me**.
   Confirm the reverse ranked result and apply.

### Application, completion and ratings

1. Log in as the employer and choose **Applications** on the job.
2. Move the worker through:
   `APPLIED → SHORTLISTED → HIRED → COMPLETED`.
3. Attempts to skip an illegal transition return `400`; the service-layer
   state machine remains authoritative.
4. Once completed, rate the worker.
5. Log in as the worker, observe `COMPLETED`, and rate the employer.

Duplicate applications and duplicate same-direction ratings are rejected.
Only the worker and the job-owning employer can view or mutate this
application.

### CV and opportunity advisory

1. As the worker, use **Preview CV** and **Download PDF**.
2. Confirm the CV contains only worker/account facts, its rule-based summary
   and the completed-work average rating.
3. Create two nearby Electrical jobs with **Circuit Breaker Installation**
   and **Electrical Repair** as their respective required skills, and
   **House Wiring** as a preferred skill. Keep their wage/experience terms
   reachable, then choose **Show skill opportunities**.
4. Those jobs fall inside the configured near-miss score band. Confirm the
   two missing skills are ranked, capped to at most three suggestions, and
   each includes a concrete learning reason.

The recommendation UI deliberately shows scores and reasons; it does not
present opaque “AI-selected” results.

## 3. Postman walkthrough

Import [`Workforce_Matching.postman_collection.json`](Workforce_Matching.postman_collection.json)
into Postman. The collection contains these variables:

| Variable | Purpose |
| --- | --- |
| `base_url` | API origin; defaults to `http://127.0.0.1:8000` |
| `access`, `refresh` | currently active JWT pair |
| `worker_access`, `worker_refresh` | saved worker JWT pair |
| `employer_access`, `employer_refresh` | saved employer JWT pair |
| `category_id`, `subcategory_id` | populated by the taxonomy request |
| `job_id`, `application_id` | populated as the workflow creates resources |

Run requests in collection order against a freshly migrated/seeded demo
database:

1. **Public setup** loads the taxonomy and stores the Electrical IDs.
2. **Employer onboarding** registers, logs in and updates the employer.
3. Pause and verify that employer/contact in Django admin.
4. **Worker onboarding** registers, logs in and updates the worker with
   `ghar wiring`.
5. **Employer job pipeline** publishes the primary job, stores only its
   `job_id`, then creates two additional near-miss jobs for advisory evidence.
6. **Worker matching** ranks jobs and applies, storing `application_id`.
7. **Employer review** ranks workers and performs every valid status change.
8. **Completed work** submits both rating directions, gets the rating
   summary, previews/downloads the CV, and verifies the opportunity advisory
   returns no more than three missing skills with reasons.

Login requests automatically store role-specific tokens. Authenticated
requests copy the relevant role token into `access`/`refresh` before sending,
so the collection remains inspectable and requests can be rerun
individually after the corresponding login.

If demo users already exist, reset the disposable SQLite database or change
the collection's demo usernames/phone numbers. Never replace the sample
credentials with real credentials in a committed collection.

## 4. Focused verification checklist

```powershell
python backend\manage.py check --settings=config.test_settings
python backend\manage.py makemigrations --check --dry-run --settings=config.test_settings
python backend\manage.py test accounts profiles taxonomy jobs applications recommendations config --settings=config.test_settings
```

For a PostgreSQL verification, create `.env` from `.env.example`, provision
the database, and repeat without `--settings=config.test_settings`.

Manual browser checks:

- `/` loads CSS and JavaScript with no external frontend dependencies.
- anonymous users can browse jobs and taxonomy but cannot mutate data.
- both role registrations automatically create their matching blank profile.
- JWT refresh keeps a live tab signed in; logout blacklists the refresh token.
- admin actions verify contacts/employers and safely review taxonomy terms.
- worker/employer ownership and role boundaries return `401`/`403`.
- the CV endpoints work even when native WeasyPrint libraries are absent.

## Deferred scope and defense note

The demonstrable scope ends at a stable, explainable workforce-matching
prototype. The following are deliberately deferred:

- real OTP/SMS/email verification and automated PAN/VAT verification
- payments, escrow, wage enforcement, attendance and dispute handling
- chat, notifications, background queues and scheduled jobs
- certification/document verification and work-history imports
- map tiles, geocoding, routing-time distance and live location
- native mobile applications and offline synchronization
- multilingual UI copy beyond stored English/Romanized-Nepali skill aliases
- embeddings, vector databases, deep learning or opaque ranking models

Those features require external providers, operational policies, sensitive
data handling or larger product decisions. For this defense, manual admin
verification and a Haversine/rule-based scoring engine keep every decision
auditable, testable and within the stated six-week scope.
