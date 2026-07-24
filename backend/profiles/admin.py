from django.contrib import admin

from .models import EmployerProfile, WorkerProfile


@admin.register(WorkerProfile)
class WorkerProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "address",
        "is_available",
        "experience_years",
        "expected_wage",
        "preferred_travel_radius_km",
        "created_at",
    )

    list_filter = ("is_available",)

    search_fields = (
        "user__username",
        "user__email",
        "user__phone_number",
        "address",
    )

    ordering = ("-created_at",)

    date_hierarchy = "created_at"

    list_select_related = ("user",)

    autocomplete_fields = ("user", "skills")

    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        ("Account", {"fields": ("user",)}),
        ("Location", {"fields": ("address", "latitude", "longitude")}),
        (
            "Work profile",
            {
                "fields": (
                    "skills",
                    "experience_years",
                    "is_available",
                    "expected_wage",
                    "preferred_travel_radius_km",
                )
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )


@admin.action(description="Mark selected employers as verified")
def mark_verified(modeladmin, request, queryset):
    updated = queryset.update(verification_status=EmployerProfile.VerificationStatus.VERIFIED)
    modeladmin.message_user(request, f"Marked {updated} employer(s) as verified.")


@admin.action(description="Mark selected employers as pending review")
def mark_pending(modeladmin, request, queryset):
    updated = queryset.update(verification_status=EmployerProfile.VerificationStatus.PENDING)
    modeladmin.message_user(request, f"Marked {updated} employer(s) as pending review.")


@admin.action(description="Mark selected employers as rejected")
def mark_rejected(modeladmin, request, queryset):
    updated = queryset.update(verification_status=EmployerProfile.VerificationStatus.REJECTED)
    modeladmin.message_user(request, f"Marked {updated} employer(s) as rejected.")


@admin.register(EmployerProfile)
class EmployerProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "organization_name",
        "address",
        "pan_vat_number",
        "verification_status",
        "created_at",
    )

    list_filter = ("verification_status",)

    search_fields = (
        "organization_name",
        "user__username",
        "user__email",
        "user__phone_number",
        "pan_vat_number",
    )

    ordering = ("-created_at",)

    date_hierarchy = "created_at"

    list_select_related = ("user",)

    autocomplete_fields = ("user",)

    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        ("Account", {"fields": ("user", "organization_name")}),
        ("Location", {"fields": ("address", "latitude", "longitude")}),
        ("Verification", {"fields": ("pan_vat_number", "verification_status")}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )

    actions = [mark_verified, mark_pending, mark_rejected]
