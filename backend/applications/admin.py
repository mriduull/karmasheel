from django.contrib import admin

from .models import Application


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ("worker", "job", "status", "created_at", "updated_at")

    list_filter = ("status",)

    search_fields = (
        "worker__user__username",
        "job__title",
    )
