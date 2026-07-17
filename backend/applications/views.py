from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsEmployer, IsWorker
from jobs.models import JobPost
from profiles.models import WorkerProfile

from .models import Application, Rating
from .serializers import (
    ApplicationCreateSerializer,
    ApplicationSerializer,
    ApplicationStatusUpdateSerializer,
    RatingCreateSerializer,
    RatingSerializer,
    RatingSummarySerializer,
)
from .services import get_rating_summary, submit_rating, transition_application_status


class ApplicationListCreateView(APIView):
    """A worker's own application history, and the endpoint used to apply
    to a job."""

    permission_classes = [IsAuthenticated, IsWorker]

    def get(self, request):
        worker_profile = WorkerProfile.objects.filter(user=request.user).first()

        if worker_profile is None:
            return Response(
                {"detail": "Worker profile not found. Create your worker profile first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        applications = Application.objects.filter(worker=worker_profile).select_related("job")
        serializer = ApplicationSerializer(applications, many=True)
        return Response(serializer.data)

    def post(self, request):
        worker_profile = WorkerProfile.objects.filter(user=request.user).first()

        if worker_profile is None:
            return Response(
                {"detail": "Worker profile not found. Create your worker profile first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ApplicationCreateSerializer(
            data=request.data, context={"worker_profile": worker_profile}
        )
        serializer.is_valid(raise_exception=True)
        application = serializer.save()
        return Response(ApplicationSerializer(application).data, status=status.HTTP_201_CREATED)


class ApplicationStatusUpdateView(APIView):
    """Controlled application-status updates. The applying worker may
    withdraw their own application; the job-owning employer may
    shortlist, contact, hire, reject, or complete it. All other users are
    forbidden. Legality of the requested transition itself is enforced by
    the Week 3 state-machine service, not this view."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        application = Application.objects.filter(pk=pk).select_related(
            "worker__user", "job__employer__user"
        ).first()

        if application is None:
            return Response({"detail": "Application not found."}, status=status.HTTP_404_NOT_FOUND)

        is_worker_party = application.worker.user_id == request.user.id
        is_employer_party = application.job.employer.user_id == request.user.id

        if not (is_worker_party or is_employer_party):
            return Response(
                {"detail": "You are not a participant in this application."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ApplicationStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_status = serializer.validated_data["status"]

        try:
            transition_application_status(application, new_status, actor=request.user)
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

        note_field = "worker_note" if is_worker_party else "employer_note"
        note = request.data.get(note_field)

        if note:
            setattr(application, note_field, note)
            application.save(update_fields=[note_field])

        return Response(ApplicationSerializer(application).data)


class JobApplicationsView(APIView):
    """Employer review of applications for one of their own job posts."""

    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request, job_id):
        job = JobPost.objects.filter(pk=job_id).select_related("employer").first()

        if job is None:
            return Response({"detail": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

        if job.employer.user_id != request.user.id:
            return Response(
                {"detail": "Only the owning employer can view applications for this job."},
                status=status.HTTP_403_FORBIDDEN,
            )

        applications = Application.objects.filter(job=job).select_related("worker__user")
        serializer = ApplicationSerializer(applications, many=True)
        return Response(serializer.data)


class ApplicationRatingView(APIView):
    """Week 5 ratings for one application. Both directions -
    worker-rates-employer and employer-rates-worker - live at this same
    endpoint; which one a POST creates depends on which side of the
    application the requester is on."""

    permission_classes = [IsAuthenticated]

    def _get_application_for_participant(self, request, pk):
        """Returns (application, error_response). Scoped to participants
        only, exactly like `ApplicationStatusUpdateView`."""

        application = Application.objects.filter(pk=pk).select_related(
            "worker__user", "job__employer__user"
        ).first()

        if application is None:
            return None, Response({"detail": "Application not found."}, status=status.HTTP_404_NOT_FOUND)

        is_worker_party = application.worker.user_id == request.user.id
        is_employer_party = application.job.employer.user_id == request.user.id

        if not (is_worker_party or is_employer_party):
            return None, Response(
                {"detail": "You are not a participant in this application."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return application, None

    def get(self, request, pk):
        application, error_response = self._get_application_for_participant(request, pk)

        if error_response is not None:
            return error_response

        ratings = Rating.objects.filter(application=application).select_related("reviewer", "reviewed_user")
        return Response(RatingSerializer(ratings, many=True).data)

    def post(self, request, pk):
        application, error_response = self._get_application_for_participant(request, pk)

        if error_response is not None:
            return error_response

        serializer = RatingCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            rating = submit_rating(
                application,
                reviewer=request.user,
                score=serializer.validated_data["score"],
                review_text=serializer.validated_data.get("review_text", ""),
            )
        except DjangoValidationError as exc:
            message = exc.messages[0] if hasattr(exc, "messages") else str(exc)
            return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

        return Response(RatingSerializer(rating).data, status=status.HTTP_201_CREATED)


class MyRatingSummaryView(APIView):
    """GET /api/applications/ratings/summary/

    The authenticated user's own aggregate rating - works for both
    workers and employers, since `Rating.reviewed_user` is a plain user
    FK regardless of role."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        average_rating, rating_count = get_rating_summary(request.user)
        return Response(
            RatingSummarySerializer(
                {"average_rating": average_rating, "rating_count": rating_count}
            ).data
        )
