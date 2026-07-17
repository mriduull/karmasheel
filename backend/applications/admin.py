from django.contrib import admin

from .models import Application, Rating


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ("worker", "job", "status", "created_at", "updated_at")

    list_filter = ("status",)

    search_fields = (
        "worker__user__username",
        "job__title",
    )


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    list_display = (
        "application",
        "direction",
        "reviewer",
        "reviewed_user",
        "score",
        "created_at",
    )

    list_filter = ("direction", "score")

    search_fields = (
        "reviewer__username",
        "reviewed_user__username",
        "application__id",
    )
