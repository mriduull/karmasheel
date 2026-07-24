from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from jobs.models import JobPost
from profiles.models import WorkerProfile


class Application(models.Model):
    """A worker's application to a job post."""

    class Status(models.TextChoices):
        APPLIED = "APPLIED", "Applied"
        SHORTLISTED = "SHORTLISTED", "Shortlisted"
        CONTACTED = "CONTACTED", "Contacted"
        HIRED = "HIRED", "Hired"
        REJECTED = "REJECTED", "Rejected"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    worker = models.ForeignKey(
        WorkerProfile,
        on_delete=models.CASCADE,
        related_name="applications",
    )

    job = models.ForeignKey(
        JobPost,
        on_delete=models.CASCADE,
        related_name="applications",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.APPLIED,
    )

    worker_note = models.TextField(blank=True)

    employer_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["worker", "job"],
                name="unique_application_per_worker_job",
            ),
        ]
        indexes = [models.Index(fields=["status"])]

    def __str__(self) -> str:
        return f"{self.worker.user.username} -> {self.job.title} ({self.status})"


class Rating(models.Model):
    """A rating one participant of a COMPLETED application leaves for the
    other. Exactly two directions are possible per application - the
    worker rating the employer, and the employer rating the worker -
    enforced by the unique constraint below plus the service-layer
    business rules in `applications.services.submit_rating`, which is the
    only supported way to create one.
    """

    class Direction(models.TextChoices):
        WORKER_TO_EMPLOYER = "WORKER_TO_EMPLOYER", "Worker rates employer"
        EMPLOYER_TO_WORKER = "EMPLOYER_TO_WORKER", "Employer rates worker"

    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name="ratings",
    )

    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ratings_given",
    )

    reviewed_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ratings_received",
    )

    direction = models.CharField(
        max_length=20,
        choices=Direction.choices,
    )

    score = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )

    review_text = models.CharField(max_length=1000, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["application", "direction"],
                name="unique_rating_per_application_direction",
            ),
            models.CheckConstraint(
                condition=models.Q(score__gte=1) & models.Q(score__lte=5),
                name="rating_score_between_1_and_5",
            ),
        ]
        indexes = [models.Index(fields=["reviewed_user"])]

    def __str__(self) -> str:
        return f"{self.get_direction_display()}: {self.score}/5 (application #{self.application_id})"
