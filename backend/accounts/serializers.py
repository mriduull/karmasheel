from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from profiles.models import EmployerProfile, WorkerProfile


User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    """Validate registration data and create the correct role profile."""

    password = serializers.CharField(
        write_only=True,
        min_length=8,
        style={"input_type": "password"},
    )

    role = serializers.ChoiceField(
        choices=User.Role.choices,
        required=True,
    )

class CurrentUserSerializer(serializers.ModelSerializer):
    """Return safe information about the authenticated user."""

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "phone_number",
            "role",
            "is_contact_verified",
        )
        read_only_fields = fields

    class Meta:
        model = User

        fields = (
            "id",
            "username",
            "email",
            "phone_number",
            "password",
            "role",
            "is_contact_verified",
        )

        read_only_fields = (
            "id",
            "is_contact_verified",
        )

        extra_kwargs = {
            "email": {
                "required": False,
                "allow_blank": True,
            },
        }

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password")

        user = User.objects.create_user(
            password=password,
            **validated_data,
        )

        if user.role == User.Role.WORKER:
            WorkerProfile.objects.create(user=user)

        elif user.role == User.Role.EMPLOYER:
            EmployerProfile.objects.create(user=user)

        return user