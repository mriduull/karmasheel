from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from .views import (
    EmployerOnlyView,
    LogoutView,
    MeView,
    RegisterView,
    WorkerOnlyView,
)


app_name = "accounts"


urlpatterns = [
    path(
        "register/",
        RegisterView.as_view(),
        name="register",
    ),
    path(
        "login/",
        TokenObtainPairView.as_view(),
        name="login",
    ),
    path(
        "token/refresh/",
        TokenRefreshView.as_view(),
        name="token_refresh",
    ),
    path(
        "logout/",
        LogoutView.as_view(),
        name="logout",
    ),
    path(
        "me/",
        MeView.as_view(),
        name="me",
    ),
    path(
        "worker-only/",
        WorkerOnlyView.as_view(),
        name="worker_only",
    ),
    path(
        "employer-only/",
        EmployerOnlyView.as_view(),
        name="employer_only",
    ),
]