#!/usr/bin/env python3
"""Non-destructive local development setup checker.

Verifies the pieces documented in docs/DEVELOPMENT_SETUP.md are in place
*before* a teammate tries to run migrations / seed data / start servers,
so a missing `.env` or an occupied port 5173 is reported with a clear
message up front instead of surfacing later as a confusing Django
KeyError, a CORS failure, or a "Cannot reach the server" banner in the
browser.

Stdlib only - no third-party imports, so it runs with nothing installed
yet (before `pip install -r requirements.txt` / `npm ci`).

This script:
  - never prints the *value* of any environment variable (only whether a
    variable name is present in a .env file);
  - never creates, modifies, or deletes any file;
  - never creates a database or connects to PostgreSQL;
  - never starts or stops a process.

Exit code 0: no blocking failures (warnings may still be present).
Exit code 1: at least one blocking failure.

Usage:
    python scripts/check_dev_setup.py
"""

from __future__ import annotations

import shutil
import socket
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_DIR = REPO_ROOT / "frontend"

# Read directly from backend/config/settings.py:
#   - os.environ[...] (hard-required, KeyError on startup if missing)
#   - os.getenv(..., default) (optional, but CORS_ALLOWED_ORIGINS
#     defaulting to empty silently blocks every frontend request, so it's
#     still worth a warning rather than being treated as fully optional)
ROOT_ENV_REQUIRED_VARS = ("DJANGO_SECRET_KEY", "DB_NAME", "DB_USER", "DB_PASSWORD")
ROOT_ENV_RECOMMENDED_VARS = ("DJANGO_DEBUG", "CORS_ALLOWED_ORIGINS")

# frontend/src/api/client.ts reads this at module load and logs (but does
# not crash) if it's unset - every API call is then silently broken.
FRONTEND_ENV_REQUIRED_VARS = ("VITE_API_BASE_URL",)

VITE_DEV_PORT = 5173


class Result:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.warnings: list[str] = []
        self.ok: list[str] = []

    def fail(self, message: str) -> None:
        self.failures.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def pass_(self, message: str) -> None:
        self.ok.append(message)


def read_env_var_names(env_path: Path) -> set[str] | None:
    """Returns the set of variable *names* defined in a .env file, or
    None if the file doesn't exist. Never returns or prints values."""

    if not env_path.is_file():
        return None

    names: set[str] = set()
    for raw_line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key = line.split("=", 1)[0].strip()
        if key:
            names.add(key)
    return names


def check_env_file(result: Result, *, label: str, env_path: Path, required: tuple[str, ...], recommended: tuple[str, ...] = ()) -> None:
    names = read_env_var_names(env_path)

    if names is None:
        result.fail(
            f"{label} does not exist ({env_path}). "
            f"Copy the tracked example next to it and fill in your own values "
            f"(see docs/DEVELOPMENT_SETUP.md)."
        )
        return

    result.pass_(f"{label} exists ({env_path}).")

    missing_required = [name for name in required if name not in names]
    if missing_required:
        result.fail(
            f"{label} is missing required variable name(s): {', '.join(missing_required)} "
            f"(values are never checked or printed by this script)."
        )
    else:
        result.pass_(f"{label} defines all required variable names.")

    missing_recommended = [name for name in recommended if name not in names]
    if missing_recommended:
        result.warn(
            f"{label} is missing recommended variable name(s): {', '.join(missing_recommended)} "
            f"— the project has a working default, but double-check it's what you want."
        )


def check_tool(result: Result, *, name: str, blocking: bool = True) -> None:
    path = shutil.which(name)
    if path:
        result.pass_(f"{name} is available ({path}).")
        return

    message = f"{name} was not found on PATH."
    if blocking:
        result.fail(message)
    else:
        result.warn(message)


def check_python_version(result: Result) -> None:
    major, minor = sys.version_info.major, sys.version_info.minor
    if (major, minor) >= (3, 12):
        result.pass_(f"Python {major}.{minor} meets the project's documented 3.12+ requirement.")
    else:
        result.warn(
            f"Running under Python {major}.{minor}; the project documents Python 3.12+ "
            f"(README.md / docs/DEVELOPMENT_SETUP.md). It may still work, but isn't the "
            f"tested version."
        )


def check_port_free(result: Result, port: int) -> None:
    """A closed connect() attempt (ECONNREFUSED) means nothing is
    listening; a successful connect() means something already is."""

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        in_use = sock.connect_ex(("127.0.0.1", port)) == 0

    if in_use:
        result.warn(
            f"Port {port} is already in use — `npm run dev` will fail immediately "
            f"(vite.config.ts sets strictPort: true, by design). See "
            f"'Identifying/freeing port {port}' in docs/DEVELOPMENT_SETUP.md."
        )
    else:
        result.pass_(f"Port {port} is free.")


def check_path_exists(result: Result, *, label: str, path: Path) -> None:
    if path.is_file():
        result.pass_(f"{label} exists ({path}).")
    else:
        result.fail(f"{label} is missing ({path}). Is this a full clone of the repository?")


def main() -> int:
    result = Result()

    check_path_exists(result, label="backend/manage.py", path=BACKEND_DIR / "manage.py")
    check_path_exists(result, label="frontend/package.json", path=FRONTEND_DIR / "package.json")

    check_env_file(
        result,
        label="Root .env",
        env_path=REPO_ROOT / ".env",
        required=ROOT_ENV_REQUIRED_VARS,
        recommended=ROOT_ENV_RECOMMENDED_VARS,
    )
    check_env_file(
        result,
        label="frontend/.env",
        env_path=FRONTEND_DIR / ".env",
        required=FRONTEND_ENV_REQUIRED_VARS,
    )

    check_python_version(result)
    check_tool(result, name="node", blocking=True)
    check_tool(result, name="npm", blocking=True)

    check_port_free(result, VITE_DEV_PORT)

    print("Karmasheel local development setup check")
    print("=" * 42)

    for message in result.ok:
        print(f"  [OK]   {message}")
    for message in result.warnings:
        print(f"  [WARN] {message}")
    for message in result.failures:
        print(f"  [FAIL] {message}")

    print()
    print(
        f"{len(result.ok)} passed, {len(result.warnings)} warning(s), "
        f"{len(result.failures)} failure(s)."
    )

    if result.failures:
        print("\nBlocking failures found — see docs/DEVELOPMENT_SETUP.md.")
        return 1

    if result.warnings:
        print("\nNo blocking failures. Review the warning(s) above.")
    else:
        print("\nSetup looks complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
