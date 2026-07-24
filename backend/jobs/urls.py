from django.urls import path

from applications.views import JobApplicationsView

from .views import (
    ActiveJobBrowseView,
    JobCandidatesView,
    JobPostDetailView,
    JobPostListCreateView,
)

app_name = "jobs"

urlpatterns = [
    path("", JobPostListCreateView.as_view(), name="list_create"),
    path("browse/", ActiveJobBrowseView.as_view(), name="browse"),
    path("<int:pk>/", JobPostDetailView.as_view(), name="detail"),
    path("<int:pk>/candidates/", JobCandidatesView.as_view(), name="candidates"),
    path("<int:job_id>/applications/", JobApplicationsView.as_view(), name="job_applications"),
]
