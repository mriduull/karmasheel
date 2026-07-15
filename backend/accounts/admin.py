from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """Admin configuration for the custom Karmasheel user model."""

    fieldsets = UserAdmin.fieldsets + (
        (
            "Karmasheel fields",
            {
                "fields": (
                    "phone_number",
                    "role",
                    "is_contact_verified",
                )
            },
        ),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        (
            "Karmasheel fields",
            {
                "fields": (
                    "phone_number",
                    "role",
                    "is_contact_verified",
                )
            },
        ),
    )

    list_display = (
        "username",
        "email",
        "phone_number",
        "role",
        "is_contact_verified",
        "is_staff",
        "is_active",
    )

    list_filter = (
        "role",
        "is_contact_verified",
        "is_staff",
        "is_active",
    )

    search_fields = (
        "username",
        "email",
        "phone_number",
    )