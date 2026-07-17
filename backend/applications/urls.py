from django.urls import path

from .views import ApplicationListCreateView, ApplicationStatusUpdateView

app_name = "applications"

urlpatterns = [
    path("", ApplicationListCreateView.as_view(), name="list_create"),
    path("<int:pk>/status/", ApplicationStatusUpdateView.as_view(), name="status_update"),
]
