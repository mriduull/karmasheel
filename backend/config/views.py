from django.db import connections
from django.db.utils import DatabaseError
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET


@require_GET
@never_cache
def health(request):
    """Process-level liveness check used by the hosting platform."""
    return JsonResponse({"status": "ok"})


@require_GET
@never_cache
def readiness(request):
    """Readiness check that verifies the default database is reachable."""
    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except DatabaseError:
        return JsonResponse({"status": "unavailable"}, status=503)

    return JsonResponse({"status": "ready"})
