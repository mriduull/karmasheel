"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.contrib import admin
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import include, path, re_path
from django.views.static import serve as serve_media

from .views import health, readiness


admin.site.site_header = "Workforce Matching Administration"
admin.site.site_title = "Workforce Matching Administration"
admin.site.index_title = "Workforce Matching Administration"


def api_root(request):
    return JsonResponse(
        {
            "name": "Workforce Matching API",
            "endpoints": {
                "auth": "/api/auth/",
                "profiles": "/api/profiles/",
                "taxonomy": "/api/taxonomy/",
                "taxonomy_infer_job_category": "/api/taxonomy/infer-job-category/",
                "jobs": "/api/jobs/",
                "job_browse": "/api/jobs/browse/",
                "applications": "/api/applications/",
                "recommendations": "/api/recommendations/",
            },
        }
    )


def service_root(request):
    """Show the local demo in debug mode and an API index in production."""
    if settings.DEBUG:
        return render(request, "frontend/index.html")

    return api_root(request)


urlpatterns = [
    path("", service_root, name="frontend"),

    path("admin/", admin.site.urls),

    path("api/health/", health, name="health"),
    path("api/readiness/", readiness, name="readiness"),

    path("api/", api_root, name="api_root"),

    path(
        "api/auth/",
        include("accounts.urls"),
    ),

    path(
        "api/profiles/",
        include("profiles.urls"),
    ),

    path(
        "api/taxonomy/",
        include("taxonomy.urls"),
    ),

    path(
        "api/jobs/",
        include("jobs.urls"),
    ),

    path(
        "api/applications/",
        include("applications.urls"),
    ),

    path(
        "api/recommendations/",
        include("recommendations.urls"),
    ),
]

if settings.SERVE_MEDIA:
    urlpatterns += [
        re_path(
            r"^media/(?P<path>.*)$",
            serve_media,
            {"document_root": settings.MEDIA_ROOT},
            name="media",
        ),
    ]
