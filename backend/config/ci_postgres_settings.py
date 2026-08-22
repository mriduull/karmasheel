"""CI-only settings that run the Django suite against PostgreSQL."""

import os

os.environ["DJANGO_DEBUG"] = "True"
os.environ.setdefault(
    "DJANGO_SECRET_KEY",
    "workforce-matching-ci-postgres-key-never-use-in-production-123456789",
)
os.environ.setdefault("DB_NAME", "workforce_matching_ci")
os.environ.setdefault("DB_USER", "postgres")
os.environ.setdefault("DB_PASSWORD", "postgres")
os.environ.setdefault("DB_HOST", "127.0.0.1")
os.environ.setdefault("DB_PORT", "5432")
os.environ["CV_PDF_ENGINE"] = "basic"

from .settings import *  # noqa: F401,F403


PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

SKILL_MATCH_THRESHOLD = 85.0
RECOMMENDATION_SETTINGS = {
    **RECOMMENDATION_SETTINGS,  # noqa: F405
    "MAX_DISTANCE_KM": 20.0,
    "NEAR_MISS_MIN_SCORE": 40.0,
    "NEAR_MISS_MAX_SCORE": 75.0,
}
CV_PDF_ENGINE = "basic"
