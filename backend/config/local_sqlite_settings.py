"""Local-only SQLite settings for running this branch without PostgreSQL."""

import os

os.environ.setdefault(
    "DJANGO_SECRET_KEY",
    "workforce-matching-local-sqlite-secret-key-never-use-in-production",
)
os.environ.setdefault("DJANGO_DEBUG", "True")
os.environ.setdefault("DB_NAME", "unused-by-local-sqlite-settings")
os.environ.setdefault("DB_USER", "unused-by-local-sqlite-settings")
os.environ.setdefault("DB_PASSWORD", "unused-by-local-sqlite-settings")
os.environ.setdefault(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)

from .settings import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
    }
}
