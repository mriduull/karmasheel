from django.contrib import admin

from .models import Application, Rating


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    """`status` is only ever safe to change through
    `applications.services.transition_application_status`, which enforces
    the Week 3 state machine based on which participant (worker or
    employer) is acting. The admin form has no such actor, so editing an
    existing application's `worker`, `job`, or `status` directly here
    would silently bypass that state machine - those fields are locked
    once the application exists. They stay editable only when creating a
    brand-new record from the admin, mirroring the `APPLIED` starting
    state new applications are created in.
    """

    list_display = ("worker", "job", "status", "created_at", "updated_at")

    list_filter = ("status",)

    search_fields = (
        "worker__user__username",
        "job__title",
    )

    ordering = ("-created_at",)

    date_hierarchy = "created_at"

    list_select_related = ("worker", "worker__user", "job")

    autocomplete_fields = ("worker", "job")

    def get_readonly_fields(self, request, obj=None):
        if obj is None:
            return ("created_at", "updated_at")

        return ("worker", "job", "status", "created_at", "updated_at")


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    """Ratings are only ever created through `applications.services.submit_rating`,
    which derives `direction` and `reviewed_user` from the acting
    participant and enforces the completed-application and
    one-rating-per-direction rules. There is no legitimate admin workflow
    for creating or editing a rating directly, so this admin is
    inspect-and-moderate only: every field is read-only and adding new
    ratings is disabled. Deletion (e.g. of an abusive review) remains
    available via the standard admin delete action/permission.
    """

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

    ordering = ("-created_at",)

    date_hierarchy = "created_at"

    list_select_related = ("application", "reviewer", "reviewed_user")

    readonly_fields = (
        "application",
        "reviewer",
        "reviewed_user",
        "direction",
        "score",
        "review_text",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False
