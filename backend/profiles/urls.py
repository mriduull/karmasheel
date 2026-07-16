from django.urls import path

from .views import EmployerProfileView, WorkerProfileView


app_name = "profiles"


urlpatterns = [
    path(
        "worker/me/",
        WorkerProfileView.as_view(),
        name="worker_me",
    ),
    path(
        "employer/me/",
        EmployerProfileView.as_view(),
        name="employer_me",
    ),
]
