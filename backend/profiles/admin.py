from django.contrib import admin

from .models import EmployerProfile, WorkerProfile


@admin.register(WorkerProfile)
class WorkerProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "is_available",
        "experience_years",
        "expected_wage",
        "created_at",
        "updated_at",
    )

    list_filter = ("is_available",)

    search_fields = (
        "user__username",
        "user__phone_number",
        "address",
    )

    filter_horizontal = ("skills",)


@admin.register(EmployerProfile)
class EmployerProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "organization_name",
        "pan_vat_number",
        "verification_status",
        "created_at",
    )

    list_filter = ("verification_status",)

    search_fields = (
        "organization_name",
        "user__username",
        "user__phone_number",
        "pan_vat_number",
    )