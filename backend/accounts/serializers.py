import re

from django.contrib.auth import get_user_model
from django.utils.text import slugify
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from profiles.models import EmployerProfile, WorkerProfile


User = get_user_model()
FULL_NAME_PATTERN = re.compile(r"^[A-Za-z\s]+$")


class CurrentUserSerializer(serializers.ModelSerializer):
    """Safe account information returned by the /me/ endpoint."""

    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "full_name",
            "email",
            "phone_number",
            "role",
            "is_contact_verified",
        )
        read_only_fields = fields

    def get_full_name(self, instance):
        return instance.get_full_name()


class PhoneOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Accept the existing username credential or the user's phone number."""

    def validate(self, attrs):
        identifier = attrs.get(self.username_field)

        if identifier:
            user = User.objects.filter(phone_number=identifier).first()
            if user is not None:
                attrs[self.username_field] = user.get_username()

        return super().validate(attrs)


class RegisterSerializer(serializers.ModelSerializer):
    """Register a worker or employer account."""

    full_name = serializers.CharField(write_only=True, max_length=150)

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
            "full_name",
            "email",
            "phone_number",
            "password",
            "role",
        )
        read_only_fields = ("id", "username")

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation["full_name"] = instance.get_full_name()
        return representation

    def validate_phone_number(self, value):
        if len(value) != 10 or not value.isascii() or not value.isdecimal():
            raise serializers.ValidationError(
                "Phone number must contain exactly 10 digits."
            )

        return value

    def validate_full_name(self, value):
        normalized = " ".join(value.split())

        if not normalized:
            raise serializers.ValidationError("Full name is required.")

        if not FULL_NAME_PATTERN.fullmatch(normalized):
            raise serializers.ValidationError(
                "Name should only contain letters and spaces."
            )

        return normalized

    def _generate_username(self, phone_number):
        base = slugify(f"user-{phone_number}") or f"user-{phone_number}"
        username = base
        suffix = 1

        while User.objects.filter(username=username).exists():
            username = f"{base}-{suffix}"
            suffix += 1

        return username

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop("password")
        full_name = validated_data.pop("full_name")

        user = User.objects.create_user(
            username=self._generate_username(validated_data["phone_number"]),
            first_name=full_name,
            password=password,
            **validated_data,
        )

        if user.role == User.Role.WORKER:
            WorkerProfile.objects.create(user=user)

        elif user.role == User.Role.EMPLOYER:
            EmployerProfile.objects.create(user=user)

        return user
