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
"""

from .settings import *  # noqa: F401,F403

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]
