# Karmasheel API - Postman Walkthrough

This collection exercises the complete Week 1-5 API surface end to end
against a locally running Karmasheel backend: public taxonomy browsing,
worker/employer authentication, profiles (including CV generation),
jobs, applications (status state machine), ratings, and the explainable
recommendation engine.

## Files

- `Karmasheel_API.postman_collection.json` - the collection (10 folders,
  72 requests).
- `Karmasheel_Local.postman_environment.json` - the environment. All
  credentials in it are clearly-labelled, local-only demo values (e.g.
  `demo_worker_local` / `Local-Only-Demo-Pass-1!`) - never real
  passwords or production data. Change them if you want, but keep them
  local-only.
- This file.

## Setup

1. Start the backend against your local dev database:
   ```
   cd backend
   python manage.py runserver
   ```
2. In Postman, import both JSON files (`File > Import`).
3. Select the **Karmasheel Local** environment in the top-right
   environment picker.
4. Confirm `base_url` in the environment matches your server
   (`http://127.0.0.1:8000` by default).

## Run order

Folders are numbered/lettered in the order they must run, because later
folders depend on IDs and tokens captured by earlier ones (via each
request's **Tests** tab, which calls `pm.environment.set(...)`).

**A -> B -> C -> D -> E -> F -> G -> H -> I -> Z**

Run each folder with Postman's "Run folder" (or run the whole
collection with the Collection Runner, top to bottom) rather than
individual requests out of order.

**All of the setup registration requests must stay selected/enabled
for a complete run** - not just the primary "Register Worker" and
"Register Employer" requests in folders B and C, but also the
`(Setup)`-prefixed registration requests in folders F and G
("(Setup) Register Second Employer (Stays Unverified)" and
"(Setup) Register Second Worker"). Every one of these is immediately
followed by a login request that depends on the account it creates
(`Login Worker`, `Login Employer`, `(Setup) Login Second Employer`,
`(Setup) Login Second Worker`). If a registration request is
deselected or a partial run skips past it, the matching login request
has nothing to authenticate and returns `401`, which then cascades
into failures throughout the rest of the collection.

### A fresh database requires one manual step before folder F

Job creation requires the employer account to already be **manually
verified** (`EmployerProfile.verification_status = VERIFIED`) - this is
enforced by `IsVerifiedEmployer` and is deliberately not something the
API lets an employer do to themselves (see folder E, "Client Cannot
Self-Verify"). Manual review is the intended Week 1 design.

On a fresh database (no `demo_employer_local` user yet), after running
folder C (which registers `demo_employer_local`), verify it through one
of:

- **Django admin** (recommended - this is what Phase 2 built it for):
  log in as a superuser at `/admin/`, open
  Profiles > Employer profiles, select the demo employer, and either
  edit `verification_status` to `VERIFIED` directly or use the
  **"Mark selected employers as verified"** bulk action.
- **Management shell** (equivalent, faster for repeated local runs):
  ```
  python manage.py shell -c "
  from profiles.models import EmployerProfile
  ep = EmployerProfile.objects.get(user__username='demo_employer_local')
  ep.verification_status = EmployerProfile.VerificationStatus.VERIFIED
  ep.save(update_fields=['verification_status'])
  "
  ```

Only then run folder F onward. On later runs against a database that
already has a verified `demo_employer_local`, this step is not needed
again - see the next section.

### Subsequent runs are safely rerunnable

Every registration request in the collection (`Register Worker`,
`Register Employer`, `(Setup) Register Second Employer (Stays
Unverified)`, `(Setup) Register Second Worker`) accepts either outcome
as a pass:

- **`201 Created`** - a fresh local demo account was created (first run
  against an empty database, or after the cleanup step below).
- **`400 Bad Request`**, but only when the error body is limited to the
  `username`/`email`/`phone_number` fields and at least one of those
  errors says the value "already exists" - i.e. the expected demo
  account from a previous run is still there. Any other `400` (a
  password-policy rejection, an invalid role, a malformed email, etc.)
  still fails the test, so a real validation regression is not masked.

This means you can run the whole collection again on the same database
without first deleting the `demo_`-prefixed users (see Cleanup below):
the registration requests will each report a passing test whether they
create the accounts or find them already present, and the login
requests that follow use the exact same username/password variables as
their corresponding registration request either way.

### Re-authentication after logout

Folders B and C each end with a logout request that blacklists the
refresh token. If you re-run folder B or C standalone later in the same
session, re-run "Login Worker" / "Login Employer" again before using
folders D-I, since the tokens captured after logout are no longer
valid.

## What each folder covers

| Folder | Covers |
|---|---|
| A. Public and Taxonomy | Category/subcategory/skill listing and filtering, skill search, nested tree, public active-job browsing, invalid-filter 400 |
| B. Worker Authentication | Registration, login, `/me/`, token refresh, logout, invalid login, unauthorized/forbidden access |
| C. Employer Authentication | Same as B, for the employer role |
| D. Worker Profile | Retrieve/update own profile, skill assignment via `skill_input` (standardized name, alias, and an intentionally-unmatched phrase), ownership/role restrictions, CV HTML preview, CV PDF download |
| E. Employer Profile | Retrieve/update own profile, verification-status visibility, confirms the field is read-only to the employer themselves, role restriction |
| F. Jobs | Verified-employer job creation, owned-job listing, public browse/detail, owner update, ownership rejection, candidate-worker listing (no phone-number leak), unverified-employer rejection |
| G. Applications | Apply, duplicate-prevention, worker/employer listing views, invalid transition (skip-state) rejection, non-participant rejection, the full `APPLIED -> SHORTLISTED -> HIRED -> COMPLETED` path, illegal withdrawal-after-hire rejection, and a second application carried through to withdrawal |
| H. Ratings | Rejection before completion, both rating directions after completion, duplicate-direction rejection, both participants' rating summaries |
| I. Recommendations | Worker job recommendations, employer worker recommendations (no phone-number leak), role restriction, opportunity advisory - each checks that `reasons` and every score component are present |
| Z. CORS Verification | Confirms `Access-Control-Allow-Origin` is echoed back for the two allowed local origins and absent for an unrecognized origin - no wildcard |

## Automated vs. manual execution

Every request above ran successfully end-to-end during Phase 3 via an
equivalent scripted walkthrough (Python + `urllib`, since Newman/Postman
were not available in this environment and installing them was outside
this phase's scope). That scripted run is what the Phase 3 report's
test results are drawn from - it is not committed to the repo, since it
would just duplicate this Postman collection.

**Still requiring manual Postman execution / confirmation:**
- Actually opening the two JSON files in the Postman desktop/web app to
  confirm they import cleanly (they were validated as well-formed JSON
  and against the general Postman v2.1 collection/environment shape,
  but only Postman's own importer can fully confirm compatibility).
- Visual confirmation of the Postman-native touches: the CV PDF binary
  response rendering correctly in Postman's response viewer, and the
  `pm.test` results appearing green in the Postman **Test Results**
  tab.
- Running the CORS folder from an actual browser-based frontend (the Z
  folder confirms the header server-side from Postman, which does not
  itself enforce CORS the way a browser does).

## Cleanup

This walkthrough creates `demo_`-prefixed users, one job post, two
applications, and two ratings. To remove them after a local run:

```
python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
User.objects.filter(username__startswith='demo_').delete()
"
```

Deleting these users cascades to their profiles, job posts,
applications, and ratings. This does not touch any other data in your
development database.
