# Workforce Matching end-to-end UI demo

This is the current browser walkthrough for the React/Vite frontend. Use only
the synthetic local dataset; never perform a defense demo against production.
For API/curl detail, see [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md). For report figures,
use [`DEFENSE_SCREENSHOTS.md`](DEFENSE_SCREENSHOTS.md).

## 1. Prepare and run

From the repository root on Windows PowerShell:

```powershell
Set-Location backend
..\venv\Scripts\python.exe manage.py migrate --settings=config.local_sqlite_settings
..\venv\Scripts\python.exe manage.py seed_demo --settings=config.local_sqlite_settings
..\venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --settings=config.local_sqlite_settings
```

In a second terminal:

```powershell
Set-Location frontend
npm run dev
```

Open:

- React UI: `http://localhost:5173/` (canonical frontend)
- API: `http://127.0.0.1:8000/api/`
- Admin: `http://127.0.0.1:8000/admin/`

All seeded accounts use the local demo password printed by `seed_demo`.

## 2. Public discovery

1. Open the landing page without logging in.
2. Choose **Browse Jobs**.
3. Filter by category, subcategory, and work type.
4. Open a job and show structured required/preferred skills, location, wage,
   experience, and application deadline.

Point out that browsing is public while applying is role/auth protected.

## 3. Worker profile and normalized skills

1. Log in as `demo_worker_electrician`.
2. Open **Profile** and show experience, availability, travel radius, expected
   wage, coordinates, and canonical Electrical skill chips.
3. Explain that input such as `ghar wiring` is stored as **House Wiring**;
   low-confidence phrases are retained for admin review rather than silently
   accepted.
4. Show profile-photo upload only with a synthetic image.

## 4. Explainable recommendations

1. Open **Recommended Jobs**.
2. Expand **Why this match?** on the top result.
3. Show matched/missing skills and the skill, distance, experience,
   availability/preference, and reliability component bars.
4. Compare with a lower result. The completed House Wiring engagement is not
   recommended again because duplicate applications are impossible.

The ranking is a deterministic weighted formula, not a black-box model.

## 5. Opportunity advisory

1. Log in as `demo_worker_hari`.
2. Open **Opportunities**.
3. Show two actionable nearby masonry near-misses and the recurring missing
   **Tile Installation** skill.

Explain that the advisory reuses the same match engine and recommends at most
three missing skills based on recurring demand.

## 6. Applications, completion, ratings, and CV

1. Return as `demo_worker_electrician` and open **Applications**.
2. Show the completed House Wiring engagement and its rating state.
3. Open **Ratings** to show received aggregate reputation.
4. Open **CV**, preview it, and download the PDF.

The CV is generated from stored account/profile/work-history facts. It is not
an uploaded résumé or generated text from an external AI service.

## 7. Employer workflow

1. Log in as `demo_employer_verified`.
2. Show the verified banner and **My Jobs**.
3. Open the House Wiring job's applications: the seeded candidates demonstrate
   completed, shortlisted, and rejected states.
4. Show that only legal next transitions are offered.
5. Open **Recommended Workers**, expand explanations, and compare the close
   electrician with the far-away candidate to demonstrate distance scoring.
6. Open **Post a Job** and show required/preferred skill separation and
   category/subcategory inference. Do not submit unless the demo requires a
   disposable extra job.

Then log in as `demo_employer_pending` and show the verification boundary: job
posting/recommendation actions remain blocked by both UI guards and backend
permissions.

## 8. Admin moderation

Log in locally as `demo_admin`:

- **Profiles → Employer profiles** shows verified and pending decisions.
- **Taxonomy → Unmatched skill terms** contains the seeded
  `cnc machine operation` review case.
- **Accounts → Users** contains manual contact-verification actions.

Do not resolve the pending cases before their screenshots or live segment.

## 9. Defense close

Show the automated test/build evidence and state the boundaries honestly:
manual contact/Employer verification, no password-reset/notification/dispute
flow, unpaginated demo-scale lists, and single-instance media storage. The
repository includes production configuration and CI, while domains, provider
provisioning, backups, monitoring, privacy policy, and edge rate limiting are
operational tasks documented in [`DEPLOYMENT.md`](DEPLOYMENT.md).

If a live state was changed, restore a fresh demo database before the next
rehearsal. `seed_demo` is idempotent but intentionally does not move completed
or manually advanced applications backward.
