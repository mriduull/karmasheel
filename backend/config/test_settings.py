"""Test-only Django settings.

Only used via `--settings=config.test_settings` when running the test
suite. It overrides PASSWORD_HASHERS with a fast, intentionally
insecure hasher so User.objects.create_user() in test fixtures does
not pay real PBKDF2 cost on every call (measured at ~3.3s/call on this
machine with the default hasher, which multiplied across hundreds of
test-fixture users makes the suite impractically slow).

Development and production settings (config/settings.py) are
untouched - this module only adds an override on top of them and must
never be referenced outside test runs.

The test suite is intentionally self-contained: it must not require a
developer's ``.env`` file or a running PostgreSQL instance.  Production and
development continue to use PostgreSQL through ``config.settings``; tests use
an in-memory SQLite database so a fresh checkout can be verified immediately.
"""

import os

# ``config.settings`` validates these values while it is imported.  Supplying
# test-only defaults here keeps test execution independent from local secrets.
os.environ.setdefault(
    "DJANGO_SECRET_KEY",
    "karmasheel-test-only-secret-key-never-use-in-production",
)
os.environ.setdefault("DB_NAME", "unused-in-tests")
os.environ.setdefault("DB_USER", "unused-in-tests")
os.environ.setdefault("DB_PASSWORD", "unused-in-tests")
os.environ["SKILL_MATCH_THRESHOLD"] = "85"
os.environ["RECOMMENDATION_MAX_DISTANCE_KM"] = "20"
os.environ["RECOMMENDATION_NEAR_MISS_MIN_SCORE"] = "40"
os.environ["RECOMMENDATION_NEAR_MISS_MAX_SCORE"] = "75"
os.environ["CV_PDF_ENGINE"] = "basic"

from .settings import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Pin every environment-tunable value that affects deterministic assertions.
# A developer's shell or .env must not silently change test outcomes.
SKILL_MATCH_THRESHOLD = 85.0
RECOMMENDATION_SETTINGS = {
    **RECOMMENDATION_SETTINGS,  # noqa: F405
    "MAX_DISTANCE_KM": 20.0,
    "NEAR_MISS_MIN_SCORE": 40.0,
    "NEAR_MISS_MAX_SCORE": 75.0,
}

# Exercise the deterministic dependency-free branch in the unit suite. The
# browser and WeasyPrint renderers are covered by runtime smoke checks where
# those optional system dependencies are available.
CV_PDF_ENGINE = "basic"

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
