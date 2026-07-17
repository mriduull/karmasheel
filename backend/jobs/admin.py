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
        "created_at",
    )

    list_filter = ("status", "work_type", "wage_type", "category", "subcategory")

    search_fields = (
        "title",
        "description",
        "employer__organization_name",
        "employer__user__username",
    )

    filter_horizontal = ("required_skills", "preferred_skills")
