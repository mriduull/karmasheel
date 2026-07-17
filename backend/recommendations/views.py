from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsEmployer, IsWorker
from jobs.models import JobPost
from jobs.permissions import IsVerifiedEmployer
from jobs.services import filter_candidate_workers_for_job
from profiles.models import WorkerProfile

from .advisory import build_opportunity_advisory
from .serializers import (
    JobRecommendationSerializer,
    OpportunityAdvisorySerializer,
    WorkerRecommendationSerializer,
)
from .services import evaluate_match, filter_candidate_jobs_for_worker


def _parse_limit(request):
    """Returns (limit, error_response). Falls back to the configured
    default when not supplied, and rejects anything outside the
    configured safe range."""

    recommendation_settings = settings.RECOMMENDATION_SETTINGS
    raw_limit = request.query_params.get("limit")

    if raw_limit is None:
        return recommendation_settings["DEFAULT_RESULT_LIMIT"], None

    try:
        limit = int(raw_limit)
    except ValueError:
        return None, Response({"detail": "limit must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

    max_limit = recommendation_settings["MAX_RESULT_LIMIT"]

    if limit < 1 or limit > max_limit:
        return None, Response(
            {"detail": f"limit must be between 1 and {max_limit}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return limit, None


class WorkerJobRecommendationsView(APIView):
    """GET /api/recommendations/jobs/

    Ranked, explainable job recommendations for the authenticated
    worker's own profile. A worker can never address another worker's
    recommendations - the worker profile is always taken from
    ``request.user``, never from a URL parameter.
    """

    permission_classes = [IsAuthenticated, IsWorker]

    def get(self, request):
        worker_profile = WorkerProfile.objects.filter(user=request.user).select_related("user").first()

        if worker_profile is None:
            return Response(
                {"detail": "Worker profile not found. Create your worker profile first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        limit, error_response = _parse_limit(request)

        if error_response is not None:
            return error_response

        jobs = filter_candidate_jobs_for_worker(worker_profile)

        results = [evaluate_match(worker_profile, job, direction="worker_to_job") for job in jobs]
        results.sort(key=lambda result: (-result.final_score, result.job.id))
        results = results[:limit]

        serializer = JobRecommendationSerializer(results, many=True)
        return Response(serializer.data)


class JobWorkerRecommendationsView(APIView):
    """GET /api/recommendations/jobs/<job_id>/workers/

    Ranked, explainable worker-candidate recommendations for one of the
    requesting employer's own job posts. Only the verified, owning
    employer may request recommendations for a given job.
    """

    permission_classes = [IsAuthenticated, IsEmployer, IsVerifiedEmployer]

    def get(self, request, job_id):
        job = JobPost.objects.filter(pk=job_id).select_related(
            "employer__user", "category", "subcategory"
        ).first()

        if job is None:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        if job.employer.user_id != request.user.id:
            return Response(
                {"detail": "Only the owning employer can view recommendations for this job."},
                status=status.HTTP_403_FORBIDDEN,
            )

        limit, error_response = _parse_limit(request)

        if error_response is not None:
            return error_response

        workers = filter_candidate_workers_for_job(job)

        results = [evaluate_match(worker, job, direction="job_to_worker") for worker in workers]
        results.sort(key=lambda result: (-result.final_score, result.worker.id))
        results = results[:limit]

        serializer = WorkerRecommendationSerializer(results, many=True)
        return Response(serializer.data)


class OpportunityAdvisoryView(APIView):
    """GET /api/recommendations/opportunities/

    Week 5 opportunity advisory for the authenticated worker's own
    profile: jobs that are a "near miss" (final_match_score in the
    configurable inclusive range), and the required skills missing
    across those jobs, ranked by how many opportunities learning each
    one would unlock.
    """

    permission_classes = [IsAuthenticated, IsWorker]

    def get(self, request):
        worker_profile = WorkerProfile.objects.filter(user=request.user).select_related("user").first()

        if worker_profile is None:
            return Response(
                {"detail": "Worker profile not found. Create your worker profile first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        advisory = build_opportunity_advisory(worker_profile)
        serializer = OpportunityAdvisorySerializer(advisory)
        return Response(serializer.data)
