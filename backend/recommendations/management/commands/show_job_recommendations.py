"""Read-only: print the top N job-to-worker recommendations for a job in
a screenshot-friendly terminal format.

Calls the exact same code path as `GET /api/recommendations/jobs/<id>/
workers/` (`recommendations.views.JobWorkerRecommendationsView`):
`jobs.services.filter_candidate_workers_for_job` to build the candidate
pool, `recommendations.services.evaluate_match(..., direction=
"job_to_worker")` to score each one, then the real
`WorkerRecommendationSerializer` to shape the response - never a
reimplemented approximation of the scoring or serialization.

Read-only: makes no writes of any kind. Does not print tokens, password
hashes, API keys, environment variables, or raw JSON.
"""

from django.core.management.base import BaseCommand, CommandError

from jobs.models import JobPost
from jobs.services import filter_candidate_workers_for_job
from profiles.models import EmployerProfile
from recommendations.serializers import WorkerRecommendationSerializer
from recommendations.services import evaluate_match

LINE = "=" * 60
RULE = "-" * 60


def _skill_names(skill_dicts):
    names = [skill["name"] for skill in skill_dicts]
    return ", ".join(names) if names else "None"


def _format_distance(distance_km):
    if distance_km is None:
        return "Not available"
    return f"{distance_km} km"


def _format_availability(sub_scores):
    if not sub_scores:
        return "Not available"
    is_available = sub_scores.get("is_available")
    wage = sub_scores.get("wage_compatibility_score")
    radius = sub_scores.get("travel_radius_compatibility_score")
    status = "Available" if is_available else "Not available for work"
    return f"{status} (wage fit {wage}/100, travel-radius fit {radius}/100)"


def _format_reliability(score, sub_scores):
    if not sub_scores:
        return f"{score}/100"
    verified = sub_scores.get("contact_verified")
    completeness = sub_scores.get("profile_completeness")
    return f"{score}/100 (contact verified: {verified}, profile {completeness}% complete)"


class Command(BaseCommand):
    help = (
        "Read-only: show the top N job-to-worker recommendations for a job, "
        "using the real recommendation service (same logic as GET "
        "/api/recommendations/jobs/<id>/workers/). Makes no database changes."
    )

    def add_arguments(self, parser):
        parser.add_argument("job_id", type=int)
        parser.add_argument("--limit", type=int, default=3)

    def handle(self, *args, **options):
        job_id = options["job_id"]
        limit = options["limit"]

        job = (
            JobPost.objects.filter(pk=job_id)
            .select_related("employer__user", "category", "subcategory")
            .first()
        )

        if job is None:
            raise CommandError(f"Job {job_id} does not exist.")

        employer = job.employer

        if employer.verification_status != EmployerProfile.VerificationStatus.VERIFIED:
            self.stderr.write(
                self.style.WARNING(
                    f"Note: employer '{employer.user.username}' is not VERIFIED - the "
                    "real API endpoint would reject this request with 403 "
                    "(IsVerifiedEmployer). Showing results anyway for inspection."
                )
            )

        # Identical candidate pool + scoring the real endpoint uses.
        candidate_workers = filter_candidate_workers_for_job(job)
        results = [evaluate_match(worker, job, direction="job_to_worker") for worker in candidate_workers]
        results.sort(key=lambda result: (-result.final_score, result.worker.id))
        limited = results[:limit]

        serialized = WorkerRecommendationSerializer(limited, many=True).data

        self._print(job, employer, len(candidate_workers), serialized, limited)

    def _print(self, job, employer, considered_count, serialized, raw_results):
        w = self.stdout.write

        w(LINE)
        w("EXPLAINABLE JOB-TO-WORKER RECOMMENDATION")
        w(LINE)
        w(f"Employer : {employer.organization_name or employer.user.username}")
        w(f"Job      : {job.title}")
        w(f"Job ID   : {job.id}")
        w(f"Workers considered after filtering: {considered_count}")
        w(f"Recommendations returned: {len(serialized)}")
        w(RULE)

        if not serialized:
            w("")
            w("No candidate workers matched this job after filtering.")
            return

        for rank, (entry, result) in enumerate(zip(serialized, raw_results), start=1):
            worker_data = entry["worker"]
            skill_data = entry["skill"]

            w("")
            w(f"RANK {rank}")
            w(f"Worker             : {worker_data['username']}")
            w(f"Final match score  : {entry['final_score']}/100")
            w(f"Matched skills     : {_skill_names(skill_data['matched_required_skills'])}")
            w(f"Missing skills     : {_skill_names(skill_data['missing_required_skills'])}")
            w(f"Distance           : {_format_distance(entry['distance_km'])}")
            w(
                f"Experience         : {result.worker.experience_years} yrs "
                f"(required {job.required_experience_years} yrs) - score {entry['experience_score']}/100"
            )
            w(f"Availability       : {_format_availability(entry['availability_sub_scores'])}")
            w(f"Trust/Reliability  : {_format_reliability(entry['reliability_verification_score'], entry['reliability_sub_scores'])}")
            w("")
            w("Reasons:")
            for reason in entry["reasons"]:
                w(f"- {reason}")
            w("")
            w("Warnings:")
            if entry["warnings"]:
                for warning in entry["warnings"]:
                    w(f"- {warning}")
            else:
                w("- None")
            w(RULE)
