from django.contrib.auth import get_user_model
from rest_framework import generics
from rest_framework.permissions import AllowAny

from .serializers import RegisterSerializer


User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """Public endpoint for worker and employer registration."""

    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]