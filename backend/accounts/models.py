from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom account model for workers, employers, and administrators."""

    class Role(models.TextChoices):
        WORKER = "WORKER", "Worker"
        EMPLOYER = "EMPLOYER", "Employer"

    phone_number = models.CharField(
        max_length=10,
        unique=True,
    )

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        blank=True,
        default="",
    )

    is_contact_verified = models.BooleanField(default=False)

    # createsuperuser will ask for a phone number in addition to username.
    REQUIRED_FIELDS = ["phone_number"]

    def __str__(self) -> str:
        return self.username

# Create your models here.
