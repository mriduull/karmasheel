from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from profiles.models import EmployerProfile, WorkerProfile


User = get_user_model()


class CurrentUserSerializer(serializers.ModelSerializer):
    """Safe account information returned by the /me/ endpoint."""

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


class RegisterSerializer(serializers.ModelSerializer):
    """Register a worker or employer account."""

    password = serializers.CharField(
        write_only=True,
        validators=[validate_password],
    )

    role = serializers.ChoiceField(
        choices=User.Role.choices,
    )

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "phone_number",
            "password",
            "role",
        )
        read_only_fields = ("id",)

    def validate_phone_number(self, value):
        if len(value) != 10 or not value.isascii() or not value.isdecimal():
            raise serializers.ValidationError(
                "Phone number must contain exactly 10 digits."
            )

        return value

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
