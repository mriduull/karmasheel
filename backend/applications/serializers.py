from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import serializers

from jobs.models import JobPost

from .models import Application, Rating


class ApplicationSerializer(serializers.ModelSerializer):
    """Requester-aware read representation of an application.

    Rating state is always derived from the authenticated participant and
    the persisted per-direction Rating record. Clients therefore do not need
    to guess whether a completed application can still be rated, and cannot
    confuse the other participant's rating with their own.
    """

    job_title = serializers.CharField(source="job.title", read_only=True)
    worker_username = serializers.CharField(source="worker.user.username", read_only=True)
    requester_rating_direction = serializers.SerializerMethodField()
    has_rated = serializers.SerializerMethodField()
    can_rate = serializers.SerializerMethodField()

    def _get_rating_state(self, application):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        user_id = getattr(user, "id", None)
        cache_key = (application.pk, user_id)

        if not hasattr(self, "_rating_state_cache"):
            self._rating_state_cache = {}
        if cache_key in self._rating_state_cache:
            return self._rating_state_cache[cache_key]

        direction = None
        if user_id is not None and application.worker.user_id == user_id:
            direction = Rating.Direction.WORKER_TO_EMPLOYER
        elif user_id is not None and application.job.employer.user_id == user_id:
            direction = Rating.Direction.EMPLOYER_TO_WORKER

        has_rated = False
        if direction is not None:
            # List endpoints prefetch `ratings`, so this is constant-query for
            # histories while still working for one-off create/update
            # responses where the relation has not been prefetched.
            has_rated = any(
                rating.direction == direction
                for rating in application.ratings.all()
            )

        state = {
            "direction": direction,
            "has_rated": has_rated,
            "can_rate": (
                direction is not None
                and application.status == Application.Status.COMPLETED
                and not has_rated
            ),
        }
        self._rating_state_cache[cache_key] = state
        return state

    def get_requester_rating_direction(self, application):
        return self._get_rating_state(application)["direction"]

    def get_has_rated(self, application):
        return self._get_rating_state(application)["has_rated"]

    def get_can_rate(self, application):
        return self._get_rating_state(application)["can_rate"]

    class Meta:
        model = Application
        fields = (
            "id",
            "job",
            "job_title",
            "worker_username",
            "status",
            "worker_note",
            "employer_note",
            "requester_rating_direction",
            "has_rated",
            "can_rate",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "job_title",
            "worker_username",
            "status",
            "requester_rating_direction",
            "has_rated",
            "can_rate",
            "created_at",
            "updated_at",
        )


class ApplicationCreateSerializer(serializers.ModelSerializer):
    """Serializer used by a worker to apply to a job. `worker` is taken
    from the request context, never from client input."""

    class Meta:
        model = Application
        fields = ("id", "job", "worker_note", "status", "created_at")
        read_only_fields = ("id", "status", "created_at")

    def validate_job(self, job):
        if job.status != JobPost.Status.ACTIVE:
            raise serializers.ValidationError("This job is not currently accepting applications.")

        if job.application_deadline is not None and job.application_deadline <= timezone.now():
            raise serializers.ValidationError("The application deadline for this job has passed.")

        return job

    def validate(self, attrs):
        worker_profile = self.context["worker_profile"]
        job = attrs["job"]

        if Application.objects.filter(worker=worker_profile, job=job).exists():
            raise serializers.ValidationError({"job": "You have already applied to this job."})

        return attrs

    def create(self, validated_data):
        validated_data["worker"] = self.context["worker_profile"]

        try:
            with transaction.atomic():
                return super().create(validated_data)
        except IntegrityError:
            # The database constraint is authoritative under concurrent
            # requests; convert its race-path failure into the same stable API
            # error as the friendly pre-check above.
            raise serializers.ValidationError(
                {"job": "You have already applied to this job."}
            )


class ApplicationStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Application.Status.choices)


class RatingSerializer(serializers.ModelSerializer):
    """Read representation of a submitted rating."""

    reviewer_username = serializers.CharField(source="reviewer.username", read_only=True)
    reviewed_username = serializers.CharField(source="reviewed_user.username", read_only=True)

    class Meta:
        model = Rating
        fields = (
            "id",
            "application",
            "direction",
            "reviewer_username",
            "reviewed_username",
            "score",
            "review_text",
            "created_at",
        )
        read_only_fields = fields


class RatingCreateSerializer(serializers.Serializer):
    """Input for submitting a rating. `reviewer`, `reviewed_user`, and
    `direction` are derived server-side by
    `applications.services.submit_rating` - never taken from client
    input - so a participant can only rate the other side of their own
    application."""

    score = serializers.IntegerField(min_value=1, max_value=5)
    review_text = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class RatingSummarySerializer(serializers.Serializer):
    average_rating = serializers.FloatField(allow_null=True)
    rating_count = serializers.IntegerField()
