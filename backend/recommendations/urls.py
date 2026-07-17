from django.urls import path

from .views import JobWorkerRecommendationsView, WorkerJobRecommendationsView

app_name = "recommendations"

urlpatterns = [
    path("jobs/", WorkerJobRecommendationsView.as_view(), name="worker_job_recommendations"),
    path("jobs/<int:job_id>/workers/", JobWorkerRecommendationsView.as_view(), name="job_worker_recommendations"),
]
