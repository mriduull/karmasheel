# Demo Script

A practical, ~15-20 minute walkthrough of Workforce Matching using the dataset built
by `python manage.py seed_demo`. Every request below can be run with
`curl`, Postman (see `docs/postman/`), or any HTTP client.

## Demo credentials

Password for **every** account below is `DemoPass123!`.

| Username | Role |
|---|---|
| `demo_admin` | Superuser (Django admin) |
| `demo_employer_verified` | Employer - VERIFIED (home-repair services) |
| `demo_employer_hospitality` | Employer - VERIFIED (hospitality/events) |
| `demo_employer_retail` | Employer - VERIFIED (retail/delivery/facility) |
| `demo_employer_pending` | Employer - PENDING (admin-review demonstration) |
| `demo_worker_electrician` | Worker - Electrical skills, strong match |
| `demo_worker_sita` | Worker - Cleaning skills, strong match |
| `demo_worker_hari` | Worker - Masonry, partial/near-miss match |
| `demo_worker_gita` | Worker - Cooking, partial/near-miss match, no location on file |
| `demo_worker_bimal` | Worker - Plumbing skills, strong match |
| `demo_worker_kamal` | Worker - Electrical/masonry/painting, moderate, never top |
| `demo_worker_maya` | Worker - Waitstaff/table service, strong match |
| `demo_worker_sunita` | Worker - Elderly-care skills, strong match |
| `demo_worker_deepak` | Worker - Two-wheeler delivery skills, strong match |
| `demo_worker_suresh` | Worker - Same electrical skills as Lead electrician, but far away (distance demo) |

## Recovery note (read first)

Every step below is safe to repeat. If you've already run through this
script once, or partway through, `python manage.py seed_demo` is
idempotent and will report `already up to date` for everything it finds
unchanged - you do not need to reset the database between demo runs. The
one exception: if a live demo audience manually transitions an application
further than its seeded state (e.g. rejects Sita's shortlisted
application), that change sticks - rerunning `seed_demo` will not revert it
back, only skip past it. That's expected; if you want a pristine dataset
again for a repeat demo, use a fresh database (`migrate` on an empty
database, then `seed_demo`).

---

## Step 1 - Start the backend and prepare demo data

```bash
cd backend
python manage.py runserver
```

In a second terminal:

```bash
cd backend
python manage.py seed_demo
```

**Expected result:** the command prints `Demo dataset ready.`, a list of
demo credentials, and a created/already-up-to-date summary for every
account, job, application, and rating. The API is now live at
`http://127.0.0.1:8000/`.

---

## Step 2 - Admin verification and taxonomy review

Log in at `http://127.0.0.1:8000/admin/` as `demo_admin` / `DemoPass123!`.

- Open **Profiles > Employer profiles**. Confirm `demo_employer_verified`
  shows `VERIFIED` and `demo_employer_pending` shows `PENDING`. Select
  `demo_employer_pending` and try the **"Mark selected employers as
  verified"** action to show the review workflow live (this is
  reversible - reselect it and use **"Mark selected employers as pending
  review"** afterward if you want to keep the pending-employer demo case
  for a future run).
- Open **Taxonomy > Unmatched skill terms**. `cnc machine operation`
  appears with `status = PENDING` - this was recorded automatically when
  `seed_demo` fed the deliberately-unrelated phrase "CNC Machine
  Operation" through the skill-normalization pipeline. Demonstrate
  **"Resolve using best candidate and create alias"** or **"Reject
  selected unmatched terms"**.
- Open **Taxonomy > Skill tags** to browse the seeded categories,
  subcategories, and 20 standardized skills with their English/Romanized-
  Nepali aliases (e.g. search "ghar wiring" to find it aliased to
  "House Wiring").

**Expected result:** admin list/filter/search all work; both actions show
a confirmation message and update the underlying record.

---

## Step 3 - Worker login, profile, and CV

```bash
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "demo_worker_electrician", "password": "DemoPass123!"}'
```

Copy the `access` token from the response, then:

```bash
TOKEN="<paste access token>"
curl http://127.0.0.1:8000/api/profiles/worker/me/ -H "Authorization: Bearer $TOKEN"
curl http://127.0.0.1:8000/api/profiles/worker/me/cv/preview/ -H "Authorization: Bearer $TOKEN"
curl http://127.0.0.1:8000/api/profiles/worker/me/cv/pdf/ -H "Authorization: Bearer $TOKEN" -o electrician_cv.pdf
```

**Expected result:** the profile shows 6 years' experience, three
Electrical skills, `is_available: true`, an expected wage of 1200. The CV
preview's generated summary reads: *"Worker with 6 years of experience in
electrical work, skilled in Circuit Breaker Installation, Electrical
Repair and House Wiring, currently available for work."* `electrician_cv.pdf`
downloads and opens as a one-page PDF CV.

---

## Step 4 - Job browsing, recommendations, and opportunity advisory

Public browsing (no auth required):

```bash
curl http://127.0.0.1:8000/api/jobs/browse/
```

As `demo_worker_electrician` (reuse `$TOKEN` from Step 3):

```bash
curl http://127.0.0.1:8000/api/recommendations/jobs/ -H "Authorization: Bearer $TOKEN"
```

**Expected result:** Lead electrician gets at least three ranked recommendations.
"House Wiring for New Apartment Block" ranks first with `final_score`
around **98**, `reasons` including "Matches 2 of 2 required skills",
"Located ~2 km from the job", "Meets the required experience", "Employer
profile is verified". The next two results are meaningfully different but
still genuinely suitable - each matches at least one required skill:
"Electrical Rewiring for Old Bungalow" scores lower because Lead electrician's 6
years of experience fall short of the 8 required, and "Switchboard and
Panel Upgrade for Retail Outlet" scores lowest because Lead electrician matches
only one of its two required skills (House Wiring, but not Switchboard
Installation) and, like the rewiring job, requires 8 years of experience
against his 6.

Now log in as `demo_worker_hari` and `demo_worker_gita` in turn and call
the opportunity advisory endpoint:

```bash
curl http://127.0.0.1:8000/api/recommendations/opportunities/ -H "Authorization: Bearer $HARI_TOKEN"
curl http://127.0.0.1:8000/api/recommendations/opportunities/ -H "Authorization: Bearer $GITA_TOKEN"
```

**Expected result:** for Hari, `near_miss_jobs` contains "Bathroom & Tile
Renovation" (`final_score` around **67**) and "Floor Tiling and Masonry
Repair for Guest House" - `missing_skills` lists "Tile Installation" with
`job_ids` covering both, showing the same missing skill recurring across
several nearby jobs. For Gita, `near_miss_jobs` contains "Home Cooking for
Family Event" (`final_score` around **65**) and `missing_skills` lists
"Kitchen Helper" - her `warnings` also note her location is unavailable,
since her profile has no coordinates on file (a deliberate cold-start
demonstration).

---

## Step 5 - Employer login and job management

```bash
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "demo_employer_verified", "password": "DemoPass123!"}'
```

```bash
EMPLOYER_TOKEN="<paste access token>"
curl http://127.0.0.1:8000/api/jobs/ -H "Authorization: Bearer $EMPLOYER_TOKEN"
```

Find the id of "House Wiring for New Apartment Block" in the response,
then:

```bash
curl http://127.0.0.1:8000/api/jobs/<job_id>/candidates/ -H "Authorization: Bearer $EMPLOYER_TOKEN"
curl http://127.0.0.1:8000/api/recommendations/jobs/<job_id>/workers/ -H "Authorization: Bearer $EMPLOYER_TOKEN"
```

**Expected result:** the recommendation endpoint returns at least three
candidates - `demo_worker_electrician` ranked first (close by, full skill
match), `demo_worker_kamal` and `demo_worker_suresh` ranked lower
(Kamal is missing a required skill and has less experience; Suresh has
the same skills and experience as Lead electrician but is based in Pokhara, so
distance alone pushes him down the ranking) - each with a full score
breakdown. The candidates endpoint shows three applicants in different
states: Lead electrician (`COMPLETED`), Suresh (`SHORTLISTED`), Kamal (`REJECTED`).

Optionally, also try the other two verified employers:
`demo_employer_hospitality` owns "Waitstaff for Wedding Reception" (top
candidate `demo_worker_maya`), and `demo_employer_retail` owns "Motorbike
Delivery Rider for Grocery App" (top candidate `demo_worker_deepak`) and
"Elderly Care Companion - Daytime Shift" (top candidate
`demo_worker_sunita`).

Finally, log in as `demo_employer_pending` and attempt `POST /api/jobs/`
and `GET /api/recommendations/jobs/<job_id>/workers/` - both return
`403 Forbidden`, demonstrating `IsVerifiedEmployer` gating unverified
employers out of job creation and worker recommendations.

---

## Step 6 - Applications and valid state transitions

As `demo_worker_sita`, list her applications:

```bash
curl http://127.0.0.1:8000/api/applications/ -H "Authorization: Bearer $SITA_TOKEN"
```

**Expected result:** her application to "Deep Cleaning for Office Space"
shows `status: "SHORTLISTED"`.

As `demo_employer_verified`, advance it further:

```bash
curl -X PATCH http://127.0.0.1:8000/api/applications/<application_id>/status/ \
  -H "Authorization: Bearer $EMPLOYER_TOKEN" -H "Content-Type: application/json" \
  -d '{"status": "CONTACTED"}'
```

Then try an illegal transition to show the state machine rejecting it:

```bash
curl -X PATCH http://127.0.0.1:8000/api/applications/<application_id>/status/ \
  -H "Authorization: Bearer $SITA_TOKEN" -H "Content-Type: application/json" \
  -d '{"status": "COMPLETED"}'
```

**Expected result:** the first request succeeds (`200`, new status
`CONTACTED`). The second is rejected with `400 Bad Request` - a worker
cannot mark their own application completed, and `CONTACTED -> COMPLETED`
is not a worker-side transition at all.

---

## Step 7 - Completed work and ratings

As `demo_worker_electrician`, show the already-completed engagement and its
ratings:

```bash
curl http://127.0.0.1:8000/api/applications/ -H "Authorization: Bearer $ELECTRICIAN_TOKEN"
curl http://127.0.0.1:8000/api/applications/<application_id>/rating/ -H "Authorization: Bearer $ELECTRICIAN_TOKEN"
curl http://127.0.0.1:8000/api/applications/ratings/summary/ -H "Authorization: Bearer $ELECTRICIAN_TOKEN"
```

**Expected result:** the application for "House Wiring for New Apartment
Block" shows `status: "COMPLETED"`; the ratings endpoint returns two
entries (`WORKER_TO_EMPLOYER` score 5, `EMPLOYER_TO_WORKER` score 5); the
summary endpoint shows `average_rating: 5.0`, `rating_count: 1` for
Lead electrician. Attempting `POST` a second rating on the same application/direction
returns `400 Bad Request` ("You have already rated this application.").

---

## Step 8 - Deferred scope

Close by pointing to [`DEFERRED_SCOPE.md`](DEFERRED_SCOPE.md): everything
demonstrated above is implemented and tested end to end, but complaints/
disputes, trusted-worker rehiring, notifications, advanced analytics, file
uploads, embeddings/NLP, and production deployment are intentionally out
of scope - see that document for the full, honest breakdown of what's
implemented, partial, and deferred.
