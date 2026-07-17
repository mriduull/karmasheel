from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from profiles.models import EmployerProfile
from taxonomy.models import Category, SkillTag, Subcategory


class JobPost(models.Model):
    """A job posting created by a verified employer."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        CLOSED = "CLOSED", "Closed"

    class WorkType(models.TextChoices):
        FULL_TIME = "FULL_TIME", "Full-time"
        PART_TIME = "PART_TIME", "Part-time"
        CONTRACT = "CONTRACT", "Contract"
        ONE_TIME = "ONE_TIME", "One-time"

    class WageType(models.TextChoices):
        HOURLY = "HOURLY", "Hourly"
        DAILY = "DAILY", "Daily"
        MONTHLY = "MONTHLY", "Monthly"
        FIXED = "FIXED", "Fixed"

    employer = models.ForeignKey(
        EmployerProfile,
        on_delete=models.CASCADE,
        related_name="job_posts",
    )

    title = models.CharField(max_length=150)

    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="job_posts",
    )

    subcategory = models.ForeignKey(
        Subcategory,
        on_delete=models.PROTECT,
        related_name="job_posts",
    )

    required_skills = models.ManyToManyField(
        SkillTag,
        blank=True,
        related_name="required_by_jobs",
    )

    preferred_skills = models.ManyToManyField(
        SkillTag,
        blank=True,
        related_name="preferred_by_jobs",
    )

    description = models.TextField()

    address = models.CharField(max_length=255)

    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )

    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )

    required_experience_years = models.PositiveSmallIntegerField(default=0)

    wage_type = models.CharField(
        max_length=20,
        choices=WageType.choices,
        default=WageType.DAILY,
    )

    wage_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )

    work_type = models.CharField(
        max_length=20,
        choices=WorkType.choices,
        default=WorkType.ONE_TIME,
    )

    scheduled_datetime = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Date/time the work is required to start, if applicable.",
    )

    duration_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Expected duration of the work in days, if applicable.",
    )

    number_of_workers_required = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
    )

    application_deadline = models.DateTimeField(null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["category", "subcategory"]),
        ]

    def __str__(self) -> str:
        return self.title
