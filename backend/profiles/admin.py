from django.contrib import admin

from .models import EmployerProfile, WorkerProfile


@admin.register(WorkerProfile)
class WorkerProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "created_at",
        "updated_at",
    )

    search_fields = (
        "user__username",
        "user__phone_number",
    )

    filter_horizontal = ("skills",)


@admin.register(EmployerProfile)
class EmployerProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "organization_name",
        "verification_status",
        "created_at",
    )

    list_filter = ("verification_status",)

    search_fields = (
        "organization_name",
        "user__username",
        "user__phone_number",
    )