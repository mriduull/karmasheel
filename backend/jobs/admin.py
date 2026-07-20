from django.contrib import admin

from .models import JobPost


@admin.register(JobPost)
class JobPostAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "employer",
        "category",
        "subcategory",
        "status",
        "work_type",
        "wage_type",
        "wage_amount",
        "application_deadline",
        "created_at",
    )

    list_filter = ("status", "work_type", "wage_type", "category", "subcategory")

    search_fields = (
        "title",
        "description",
        "employer__organization_name",
        "employer__user__username",
    )

    ordering = ("-created_at",)

    date_hierarchy = "created_at"

    list_select_related = ("employer", "employer__user", "category", "subcategory")

    autocomplete_fields = (
        "employer",
        "category",
        "subcategory",
        "required_skills",
        "preferred_skills",
    )

    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        ("Ownership", {"fields": ("employer", "title", "status")}),
        ("Category", {"fields": ("category", "subcategory", "required_skills", "preferred_skills")}),
        ("Description", {"fields": ("description",)}),
        ("Location", {"fields": ("address", "latitude", "longitude")}),
        (
            "Terms",
            {
                "fields": (
                    "required_experience_years",
                    "wage_type",
                    "wage_amount",
                    "work_type",
                    "scheduled_datetime",
                    "duration_days",
                    "number_of_workers_required",
                    "application_deadline",
                )
            },
        ),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )
