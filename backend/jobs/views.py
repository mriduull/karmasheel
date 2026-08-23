import math

from django.db import transaction
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsEmployer
from profiles.models import EmployerProfile, WorkerProfile

from .permissions import IsVerifiedEmployer
from .serializers import JobPostSerializer, PublicJobPostSerializer, WorkerCandidateSerializer
from .services import filter_active_jobs, filter_active_jobs_for_worker, filter_candidate_workers_for_job
from .models import JobPost


def _parse_optional_float(request, param_name, *, min_value=None, max_value=None):
    """Returns (value, error_response). value is None if not supplied."""

    raw_value = request.query_params.get(param_name)

    if raw_value is None:
        return None, None

    try:
        value = float(raw_value)
    except ValueError:
        return None, Response(
            {"detail": f"{param_name} must be a number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not math.isfinite(value):
        return None, Response(
            {"detail": f"{param_name} must be a finite number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if min_value is not None and value < min_value:
        return None, Response(
            {"detail": f"{param_name} must be at least {min_value}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if max_value is not None and value > max_value:
        return None, Response(
            {"detail": f"{param_name} must be at most {max_value}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return value, None


def _parse_optional_int(request, param_name, *, min_value=None):
    """Return a validated integer query parameter and an optional error response."""

    raw_value = request.query_params.get(param_name)

    if raw_value in (None, ""):
        return None, None

    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return None, Response(
            {"detail": f"{param_name} must be an integer."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if min_value is not None and value < min_value:
        return None, Response(
            {"detail": f"{param_name} must be at least {min_value}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return value, None


class JobPostListCreateView(APIView):
    """List the authenticated employer's own jobs, or create a new one.

    Only verified employers may create jobs; any employer may list their
    own postings regardless of verification status.
    """

    permission_classes = [IsAuthenticated, IsEmployer]

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsEmployer(), IsVerifiedEmployer()]

        return super().get_permissions()

    def get(self, request):
        jobs = JobPost.objects.filter(employer__user=request.user)
        serializer = JobPostSerializer(jobs, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        employer_profile = EmployerProfile.objects.get(user=request.user)
        serializer = JobPostSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save(employer=employer_profile)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class JobPostDetailView(APIView):
    """Retrieve a single job, or update/close it as the owning employer.

    GET is public: anyone (including anonymous visitors) may retrieve an
    active job, using a public-safe representation. A closed job is only
    retrievable by its owning employer, who sees the full representation.
    Only the owning employer may update or close a job.
    """

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]

        return [IsAuthenticated(), IsEmployer()]

    def get_object(self, pk):
        return JobPost.objects.filter(pk=pk).select_related(
            "employer__user", "category", "subcategory"
        ).first()

    def _is_owner(self, request, job):
        return job.employer.user_id == request.user.id

    def get(self, request, pk):
        job = self.get_object(pk)

        if job is None:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        is_owner = request.user.is_authenticated and self._is_owner(request, job)

        if job.status != JobPost.Status.ACTIVE and not is_owner:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer_class = JobPostSerializer if is_owner else PublicJobPostSerializer
        serializer = serializer_class(job, context={"request": request})
        return Response(serializer.data)

    def _update(self, request, pk, partial):
        job = self.get_object(pk)

        if job is None:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        if not self._is_owner(request, job):
            return Response(
                {"detail": "Only the owning employer can update this job."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = JobPostSerializer(job, data=request.data, partial=partial, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def delete(self, request, pk):
        # Applications and their ratings cascade from JobPost at the model
        # layer. Keep deletion available for an unused posting, but never let
        # this ordinary endpoint erase hiring history. The row lock prevents
        # a concurrent application from appearing between the check and
        # deletion on databases that support SELECT FOR UPDATE.
        with transaction.atomic():
            job = (
                JobPost.objects.select_for_update()
                .filter(pk=pk)
                .select_related("employer__user")
                .first()
            )

            if job is None:
                return Response(
                    {"detail": "Job not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if not self._is_owner(request, job):
                return Response(
                    {"detail": "Only the owning employer can delete this job."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if job.applications.exists():
                return Response(
                    {
                        "detail": (
                            "Job cannot be deleted while application history "
                            "exists. Close the job instead."
                        )
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            job.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class ActiveJobBrowseView(APIView):
    """Public active-job browsing, filtered by category, subcategory, and
    work type. No authentication is required - a registered worker's own
    coordinates and travel radius are used for distance filtering when
    they are signed in and have a profile; anonymous visitors may instead
    supply `latitude`, `longitude`, and `max_distance_km` query
    parameters, or browse without any distance filtering at all.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        category_id, error_response = _parse_optional_int(
            request, "category", min_value=1
        )
        if error_response is not None:
            return error_response

        subcategory_id, error_response = _parse_optional_int(
            request, "subcategory", min_value=1
        )
        if error_response is not None:
            return error_response

        work_type = request.query_params.get("work_type")
        if work_type == "":
            work_type = None
        elif work_type is not None and work_type not in JobPost.WorkType.values:
            return Response(
                {"detail": "work_type is not a valid choice."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_distance_km, error_response = _parse_optional_float(request, "max_distance_km", min_value=0)
        if error_response is not None:
            return error_response

        latitude, error_response = _parse_optional_float(request, "latitude", min_value=-90, max_value=90)
        if error_response is not None:
            return error_response

        longitude, error_response = _parse_optional_float(request, "longitude", min_value=-180, max_value=180)
        if error_response is not None:
            return error_response

        if (latitude is None) != (longitude is None):
            return Response(
                {"detail": "latitude and longitude must be supplied together."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if latitude is not None and longitude is not None:
            jobs = filter_active_jobs(
                category_id=category_id,
                subcategory_id=subcategory_id,
                work_type=work_type,
                latitude=latitude,
                longitude=longitude,
                max_distance_km=max_distance_km,
            )
        else:
            worker_profile = (
                WorkerProfile.objects.filter(user=request.user).first()
                if request.user.is_authenticated
                else None
            )

            if max_distance_km is not None and (
                worker_profile is None
                or worker_profile.latitude is None
                or worker_profile.longitude is None
            ):
                return Response(
                    {
                        "detail": (
                            "max_distance_km requires latitude and longitude "
                            "query parameters or a worker profile with both "
                            "coordinates."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if worker_profile is not None:
                jobs = filter_active_jobs_for_worker(
                    worker_profile,
                    category_id=category_id,
                    subcategory_id=subcategory_id,
                    work_type=work_type,
                    max_distance_km=max_distance_km,
                )
            else:
                jobs = filter_active_jobs(
                    category_id=category_id,
                    subcategory_id=subcategory_id,
                    work_type=work_type,
                )

        serializer = PublicJobPostSerializer(jobs, many=True, context={"request": request})
        return Response(serializer.data)


class JobCandidatesView(APIView):
    """Available workers filtered for one of the requesting employer's own
    job posts, by subcategory, availability, and distance."""

    permission_classes = [IsAuthenticated, IsEmployer, IsVerifiedEmployer]

    def get(self, request, pk):
        job = JobPost.objects.filter(pk=pk).select_related("employer").first()

        if job is None:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        if job.employer.user_id != request.user.id:
            return Response(
                {"detail": "Only the owning employer can view candidates for this job."},
                status=status.HTTP_403_FORBIDDEN,
            )

        max_distance_km, error_response = _parse_optional_float(request, "max_distance_km", min_value=0)

        if error_response is not None:
            return error_response

        candidates = filter_candidate_workers_for_job(job, max_distance_km=max_distance_km)
        serializer = WorkerCandidateSerializer(candidates, many=True)
        return Response(serializer.data)
