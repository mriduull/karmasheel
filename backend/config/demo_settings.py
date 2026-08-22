"""Zero-configuration settings for the local Week 6 demonstration.

The primary ``config.settings`` module remains the PostgreSQL configuration
used by development and deployment.  This module provides an intentionally
local SQLite database so reviewers can run the complete demo on a fresh
checkout without first provisioning database credentials:

    python manage.py migrate --settings=config.demo_settings
    python manage.py runserver --settings=config.demo_settings

Never use these settings in production.
"""

import os

# The base settings read these variables during import.  Values here are
# isolated to this settings module and are deliberately non-production.
os.environ.setdefault(
    "DJANGO_SECRET_KEY",
    "workforce-matching-local-demo-secret-key-never-use-in-production",
)
os.environ.setdefault("DB_NAME", "unused-by-demo-settings")
os.environ.setdefault("DB_USER", "unused-by-demo-settings")
os.environ.setdefault("DB_PASSWORD", "unused-by-demo-settings")

from .settings import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",  # noqa: F405
    }
}
