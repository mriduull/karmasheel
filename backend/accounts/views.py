from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .permissions import IsEmployer, IsWorker
from .serializers import CurrentUserSerializer, RegisterSerializer


User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """Public endpoint for worker and employer registration."""

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class LogoutView(APIView):
    """Blacklist the authenticated user's refresh token."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")

        if not refresh_token:
            return Response(
                {"refresh": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)

            if str(token.get("user_id")) != str(request.user.pk):
                return Response(
                    {"detail": "This refresh token does not belong to the current user."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            token.blacklist()

        except TokenError:
            return Response(
                {"detail": "The refresh token is invalid, expired, or already blacklisted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Return the currently authenticated account."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = CurrentUserSerializer(request.user)
        return Response(serializer.data)


class WorkerOnlyView(APIView):
    """Simple endpoint used to verify worker authorization."""

    permission_classes = [IsAuthenticated, IsWorker]

    def get(self, request):
        return Response(
            {
                "message": "Worker endpoint accessed successfully.",
                "username": request.user.username,
                "role": request.user.role,
            }
        )


class EmployerOnlyView(APIView):
    """Simple endpoint used to verify employer authorization."""

    permission_classes = [IsAuthenticated, IsEmployer]

    def get(self, request):
        return Response(
            {
                "message": "Employer endpoint accessed successfully.",
                "username": request.user.username,
                "role": request.user.role,
            }
        )