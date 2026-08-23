"""Analyze the local demo dataset and select the single best worker and
single best employer/job combination for a live progress-defense demo,
then (only with --apply) reset just those two accounts' passwords.

Read-only by default (`--analyze-only`, the implicit default when
`--apply` is omitted): prints a ranked table of every usable worker and
every usable employer/job combination, using the SAME service functions
the API uses (`recommendations.services.evaluate_match`,
`recommendations.advisory.build_opportunity_advisory`,
`jobs.services.filter_candidate_workers_for_job`) - never a reimplemented
approximation of the scoring logic.

Refuses to run at all when `settings.DEBUG` is False, matching
`seed_demo`'s existing safety rule - this command changes passwords and
must never run against a non-local database by accident.

Never prints a password hash. `--apply` requires the caller to supply
`--worker-password`/`--employer-password` explicitly (no default is
hard-coded here) and validates them through Django's own
`validate_password` before calling `set_password()` - never assigns
plaintext to the password field directly.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import ValidationError as PasswordValidationError
from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError

from applications.models import Application, Rating
from jobs.models import JobPost
from jobs.services import filter_candidate_workers_for_job
from profiles.models import EmployerProfile, WorkerProfile
from profiles.services import generate_worker_summary
from recommendations.advisory import build_opportunity_advisory, is_near_miss_score
from recommendations.services import evaluate_match, filter_candidate_jobs_for_worker

User = get_user_model()


def _settings():
    return settings.RECOMMENDATION_SETTINGS


def _normalize(value, low, high):
    """0-100 min-max normalization; a flat series (low == high) scores 0
    for everyone rather than dividing by zero or arbitrarily favoring one
    candidate."""

    if high <= low:
        return 0.0
    return max(0.0, min(100.0, (value - low) / (high - low) * 100))


def _looks_like_stray_test_account(username):
    """Presentation-clarity signal only - never used to exclude a
    candidate outright, only to penalize its realism score. Curated
    `seed_demo` accounts are deliberately named `demo_worker_*`/
    `demo_employer_*`; anything else on this dataset is leftover manual
    QA/dev testing (`curl_test_user_1`, `browser_reg_test_5174`,
    `backend_down_probe2`, bare `worker01`, etc.)."""

    lowered = username.lower()
    return not lowered.startswith(("demo_worker_", "demo_employer_"))


class WorkerCandidate:
    def __init__(self, worker_profile):
        self.worker = worker_profile
        self.user = worker_profile.user
        near_miss_max = _settings()["NEAR_MISS_MAX_SCORE"]

        jobs = filter_candidate_jobs_for_worker(worker_profile)
        self.results = [evaluate_match(worker_profile, job, direction="worker_to_job") for job in jobs]
        self.results.sort(key=lambda r: (-r.final_score, r.job.id))

        self.strong = [r for r in self.results if r.final_score > near_miss_max]
        self.near_miss = [r for r in self.results if is_near_miss_score(r.final_score)]
        self.categories = {r.job.category_id for r in self.results}
        self.employers = {r.job.employer_id for r in self.results}
        self.valid_distances = [r for r in self.results if r.distance_km is not None]

        self.advisory = build_opportunity_advisory(worker_profile)

        self.applications = list(Application.objects.filter(worker=worker_profile))
        self.ratings_received = list(Rating.objects.filter(reviewed_user=self.user))

        try:
            self.cv_summary = generate_worker_summary(worker_profile)
        except Exception:  # pragma: no cover - defensive only, never expected
            self.cv_summary = ""

        self.completeness_signals = [
            bool(worker_profile.address),
            worker_profile.latitude is not None and worker_profile.longitude is not None,
            worker_profile.skills.exists(),
            worker_profile.experience_years > 0,
            worker_profile.expected_wage is not None,
            worker_profile.preferred_travel_radius_km is not None,
            self.user.is_contact_verified,
        ]
        self.completeness = sum(self.completeness_signals) / len(self.completeness_signals) * 100

    @property
    def has_useful_evidence(self):
        return bool(self.applications) or bool(self.ratings_received) or bool(self.cv_summary)


class EmployerCandidate:
    """One employer, evaluated through its single BEST active job (not a
    sum across every job it owns) - an employer with one excellent,
    fully-staffed job post is a better demo than one with five thin ones.
    """

    def __init__(self, employer_profile):
        self.employer = employer_profile
        self.user = employer_profile.user

        self.best_job = None
        self.results = []
        self.strong = []

        best_score = -1
        for job in JobPost.objects.filter(employer=employer_profile, status=JobPost.Status.ACTIVE):
            workers = filter_candidate_workers_for_job(job)
            results = [evaluate_match(w, job, direction="job_to_worker") for w in workers]
            results.sort(key=lambda r: (-r.final_score, r.worker.id))
            strong = [r for r in results if r.final_score > _settings()["NEAR_MISS_MAX_SCORE"]]

            job_completeness = sum(
                [
                    bool(job.description),
                    job.required_skills.exists(),
                    job.preferred_skills.exists(),
                    job.scheduled_datetime is not None,
                    job.application_deadline is not None,
                ]
            )
            # Weighted so "has any strong worker matches at all" dominates
            # a merely-complete-looking job with no viable candidates.
            job_score = len(strong) * 100 + len(results) * 10 + job_completeness

            if job_score > best_score:
                best_score = job_score
                self.best_job = job
                self.results = results
                self.strong = strong

        applications_qs = Application.objects.filter(job__employer=employer_profile)
        self.applications = list(applications_qs)
        self.application_statuses = sorted({app.status for app in self.applications})
        self.ratings_received = list(Rating.objects.filter(reviewed_user=self.user))

        self.completeness_signals = [
            bool(employer_profile.organization_name),
            bool(employer_profile.address),
            employer_profile.latitude is not None and employer_profile.longitude is not None,
            bool(employer_profile.pan_vat_number),
            employer_profile.verification_status == EmployerProfile.VerificationStatus.VERIFIED,
        ]
        self.completeness = sum(self.completeness_signals) / len(self.completeness_signals) * 100

    @property
    def is_usable(self):
        return self.best_job is not None


def rank_workers():
    candidates = []
    for worker in WorkerProfile.objects.select_related("user").all():
        if not worker.user.is_active or worker.user.role != User.Role.WORKER:
            continue
        candidates.append(WorkerCandidate(worker))

    if not candidates:
        return []

    rec_counts = [len(c.results) for c in candidates]
    strong_counts = [len(c.strong) for c in candidates]
    advisory_scores = [len(c.advisory.near_miss_jobs) + len(c.advisory.missing_skills) for c in candidates]
    completeness_scores = [c.completeness for c in candidates]

    scored = []
    for c in candidates:
        recommendation_quality = _normalize(len(c.results), min(rec_counts), max(rec_counts)) * 0.5 + _normalize(
            len(c.valid_distances), 0, len(c.results) or 1
        ) * 0.5
        strong_quality = _normalize(len(c.strong), min(strong_counts), max(strong_counts))
        advisory_quality = _normalize(
            len(c.advisory.near_miss_jobs) + len(c.advisory.missing_skills),
            min(advisory_scores),
            max(advisory_scores),
        )
        completeness = _normalize(c.completeness, min(completeness_scores), max(completeness_scores))
        evidence = (
            (10 if c.applications else 0)
            + (10 if c.ratings_received else 0)
            + (5 if c.cv_summary else 0)
        )
        realism = 0 if _looks_like_stray_test_account(c.user.username) else 100

        total = (
            0.25 * recommendation_quality
            + 0.20 * strong_quality
            + 0.20 * advisory_quality
            + 0.15 * completeness
            + 0.10 * evidence
            + 0.10 * realism
        )
        scored.append((total, c))

    scored.sort(key=lambda pair: -pair[0])
    return scored


def rank_employers():
    candidates = []
    for employer in EmployerProfile.objects.select_related("user").all():
        if not employer.user.is_active or employer.user.role != User.Role.EMPLOYER:
            continue
        candidate = EmployerCandidate(employer)
        if candidate.is_usable:
            candidates.append(candidate)

    if not candidates:
        return []

    rec_counts = [len(c.results) for c in candidates]
    strong_counts = [len(c.strong) for c in candidates]
    completeness_scores = [c.completeness for c in candidates]

    scored = []
    for c in candidates:
        job_completeness_signals = [
            bool(c.best_job.description),
            c.best_job.required_skills.exists(),
            c.best_job.preferred_skills.exists(),
        ]
        recommendation_quality = _normalize(len(c.results), min(rec_counts), max(rec_counts))
        strong_quality = _normalize(len(c.strong), min(strong_counts), max(strong_counts))
        job_completeness = sum(job_completeness_signals) / len(job_completeness_signals) * 100
        evidence = (
            (10 if c.applications else 0)
            + (10 if len(c.application_statuses) > 1 else 0)
            + (5 if c.ratings_received else 0)
        )
        profile_completeness = _normalize(c.completeness, min(completeness_scores), max(completeness_scores))
        realism = 0 if _looks_like_stray_test_account(c.user.username) else 100

        total = (
            0.30 * recommendation_quality
            + 0.20 * strong_quality
            + 0.15 * job_completeness
            + 0.15 * evidence
            + 0.10 * profile_completeness
            + 0.10 * realism
        )
        scored.append((total, c))

    scored.sort(key=lambda pair: -pair[0])
    return scored


class Command(BaseCommand):
    help = (
        "Analyze demo worker/employer accounts and rank the best pair for a "
        "defense demo (read-only by default). Pass --apply --worker-id ID "
        "--employer-id ID --worker-password ... --employer-password ... to "
        "reset only those two accounts' passwords via set_password()."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="Reset the selected accounts' passwords. Off by default.")
        parser.add_argument("--worker-id", type=int, default=None)
        parser.add_argument("--employer-id", type=int, default=None)
        parser.add_argument("--worker-password", type=str, default=None)
        parser.add_argument("--employer-password", type=str, default=None)
        parser.add_argument("--top", type=int, default=5, help="How many ranked candidates to print per role.")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError(
                "Refusing to run: settings.DEBUG is False. This command is for local "
                "demo preparation only, never a non-local database."
            )

        top = options["top"]

        self.stdout.write(self.style.MIGRATE_HEADING("Ranked worker candidates"))
        ranked_workers = rank_workers()
        for rank, (score, c) in enumerate(ranked_workers[:top], start=1):
            self.stdout.write(
                f"  {rank}. {c.user.username} (user_id={c.user.id}, worker_profile_id={c.worker.id}) "
                f"score={score:.1f}  recs={len(c.results)}  strong={len(c.strong)}  "
                f"near_miss={len(c.near_miss)}  missing_skills={len(c.advisory.missing_skills)}  "
                f"applications={len(c.applications)}  ratings_received={len(c.ratings_received)}"
            )

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Ranked employer/job candidates"))
        ranked_employers = rank_employers()
        for rank, (score, c) in enumerate(ranked_employers[:top], start=1):
            job_label = c.best_job.title if c.best_job else "(no active job)"
            self.stdout.write(
                f"  {rank}. {c.user.username} (user_id={c.user.id}, employer_profile_id={c.employer.id}) "
                f"score={score:.1f}  job=\"{job_label}\" (job_id={c.best_job.id if c.best_job else None})  "
                f"recs={len(c.results)}  strong={len(c.strong)}  "
                f"applications={len(c.applications)}  statuses={c.application_statuses}  "
                f"verification={c.employer.verification_status}"
            )

        if not options["apply"]:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("Read-only analysis only - no passwords changed. Pass --apply to reset."))
            return

        worker_id = options["worker_id"]
        employer_id = options["employer_id"]
        worker_password = options["worker_password"]
        employer_password = options["employer_password"]

        if not worker_id or not employer_id or not worker_password or not employer_password:
            raise CommandError(
                "--apply requires --worker-id, --employer-id, --worker-password, and "
                "--employer-password all supplied explicitly."
            )

        worker_user = User.objects.filter(pk=worker_id, role=User.Role.WORKER, is_active=True).first()
        employer_user = User.objects.filter(pk=employer_id, role=User.Role.EMPLOYER, is_active=True).first()

        if worker_user is None:
            raise CommandError(f"No active worker user with id={worker_id}.")
        if employer_user is None:
            raise CommandError(f"No active employer user with id={employer_id}.")

        for label, user, password in (
            ("worker", worker_user, worker_password),
            ("employer", employer_user, employer_password),
        ):
            try:
                validate_password(password, user=user)
            except PasswordValidationError as exc:
                raise CommandError(f"{label} password rejected by validators: {'; '.join(exc.messages)}") from exc

        worker_user.set_password(worker_password)
        worker_user.save(update_fields=["password"])

        employer_user.set_password(employer_password)
        employer_user.save(update_fields=["password"])

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            f"Password RESET (not recovered) for worker '{worker_user.username}' (id={worker_user.id}) "
            f"and employer '{employer_user.username}' (id={employer_user.id})."
        ))
