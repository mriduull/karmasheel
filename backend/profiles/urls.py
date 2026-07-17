from django.urls import path

from .views import (
    EmployerProfileView,
    WorkerCVPdfView,
    WorkerCVPreviewView,
    WorkerProfileView,
)


app_name = "profiles"


urlpatterns = [
    path(
        "worker/me/",
        WorkerProfileView.as_view(),
        name="worker_me",
    ),
    path(
        "worker/me/cv/preview/",
        WorkerCVPreviewView.as_view(),
        name="worker_cv_preview",
    ),
    path(
        "worker/me/cv/pdf/",
        WorkerCVPdfView.as_view(),
        name="worker_cv_pdf",
    ),
    path(
        "employer/me/",
        EmployerProfileView.as_view(),
        name="employer_me",
    ),
]
