from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.action(description="Mark selected users as contact verified")
def mark_contact_verified(modeladmin, request, queryset):
    updated = queryset.update(is_contact_verified=True)
    modeladmin.message_user(request, f"Marked {updated} user(s) as contact verified.")


@admin.action(description="Mark selected users as contact unverified")
def mark_contact_unverified(modeladmin, request, queryset):
    updated = queryset.update(is_contact_verified=False)
    modeladmin.message_user(request, f"Marked {updated} user(s) as contact unverified.")


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
        "is_superuser",
        "is_active",
        "date_joined",
    )

    list_filter = (
        "role",
        "is_contact_verified",
        "is_staff",
        "is_superuser",
        "is_active",
    )

    search_fields = (
        "username",
        "email",
        "phone_number",
    )

    ordering = ("-date_joined",)

    date_hierarchy = "date_joined"

    readonly_fields = ("last_login", "date_joined")

    actions = [mark_contact_verified, mark_contact_unverified]
