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
