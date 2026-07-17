from rest_framework import serializers

from jobs.models import JobPost

from .models import Application, Rating


class ApplicationSerializer(serializers.ModelSerializer):
    """Read representation of an application, used for listing/history
    and returned after status changes."""

    job_title = serializers.CharField(source="job.title", read_only=True)
    worker_username = serializers.CharField(source="worker.user.username", read_only=True)

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
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "job_title",
            "worker_username",
            "status",
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

        return job

    def validate(self, attrs):
        worker_profile = self.context["worker_profile"]
        job = attrs["job"]

        if Application.objects.filter(worker=worker_profile, job=job).exists():
            raise serializers.ValidationError({"job": "You have already applied to this job."})

        return attrs

    def create(self, validated_data):
        validated_data["worker"] = self.context["worker_profile"]
        return super().create(validated_data)


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
