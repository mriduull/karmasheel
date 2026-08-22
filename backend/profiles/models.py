from django.conf import settings
from django.core.validators import FileExtensionValidator, MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models


pan_vat_number_validator = RegexValidator(
    regex=r"^\d{9}$",
    message="PAN/VAT number must be exactly 9 digits.",
)


class WorkerProfile(models.Model):
    """Role-specific profile for a worker account."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="worker_profile",
    )

    skills = models.ManyToManyField(
        "taxonomy.SkillTag",
        blank=True,
        related_name="workers",
    )

    address = models.CharField(
        max_length=255,
        blank=True,
    )

    profile_photo = models.FileField(
        upload_to="worker_profile_photos/",
        null=True,
        blank=True,
        validators=[FileExtensionValidator(["jpg", "jpeg", "png", "webp"])],
    )

    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )

    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )

    experience_years = models.PositiveSmallIntegerField(default=0)

    is_available = models.BooleanField(default=True)

    expected_wage = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
    )

    preferred_travel_radius_km = models.PositiveIntegerField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Worker profile: {self.user.username}"


class EmployerProfile(models.Model):
    """Role-specific profile for an employer account."""

    class VerificationStatus(models.TextChoices):
        UNVERIFIED = "UNVERIFIED", "Unverified"
        PENDING = "PENDING", "Pending"
        VERIFIED = "VERIFIED", "Verified"
        REJECTED = "REJECTED", "Rejected"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="employer_profile",
    )

    organization_name = models.CharField(
        max_length=150,
        blank=True,
    )

    address = models.CharField(
        max_length=255,
        blank=True,
    )

    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )

    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )

    pan_vat_number = models.CharField(
        max_length=9,
        blank=True,
        validators=[pan_vat_number_validator],
    )

    verification_status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.UNVERIFIED,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["pan_vat_number"],
                condition=~models.Q(pan_vat_number=""),
                name="unique_pan_vat_number_when_set",
            ),
        ]

    def __str__(self) -> str:
        if self.organization_name:
            return self.organization_name

        return f"Employer profile: {self.user.username}"
