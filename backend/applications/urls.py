from django.urls import path

from .views import (
    ApplicationListCreateView,
    ApplicationRatingView,
    ApplicationStatusUpdateView,
    MyRatingSummaryView,
)

app_name = "applications"

urlpatterns = [
    path("", ApplicationListCreateView.as_view(), name="list_create"),
    path("<int:pk>/status/", ApplicationStatusUpdateView.as_view(), name="status_update"),
    path("<int:pk>/rating/", ApplicationRatingView.as_view(), name="rating"),
    path("ratings/summary/", MyRatingSummaryView.as_view(), name="rating_summary"),
]
