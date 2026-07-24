from django.contrib import admin

from .models import Category, SkillAlias, SkillTag, Subcategory, UnmatchedSkillTerm


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)
    ordering = ("name",)
    readonly_fields = ("created_at",)


@admin.register(Subcategory)
class SubcategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "created_at")
    list_filter = ("category",)
    search_fields = ("name", "category__name")
    ordering = ("category__name", "name")
    list_select_related = ("category",)
    autocomplete_fields = ("category",)
    readonly_fields = ("created_at",)


class SkillAliasInline(admin.TabularInline):
    """Lets an admin inspect and add aliases while viewing a skill,
    without duplicating SkillAlias's own standalone admin page (which
    stays useful for searching/filtering aliases across all skills)."""

    model = SkillAlias
    extra = 0
    fields = ("phrase", "language")


@admin.register(SkillTag)
class SkillTagAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "subcategory",
        "is_active",
        "created_at",
    )

    list_filter = (
        "is_active",
        "subcategory__category",
        "subcategory",
    )

    search_fields = (
        "name",
        "subcategory__name",
        "subcategory__category__name",
    )

    ordering = ("subcategory__name", "name")

    list_select_related = ("subcategory", "subcategory__category")

    autocomplete_fields = ("subcategory",)

    readonly_fields = ("created_at",)

    inlines = [SkillAliasInline]


@admin.register(SkillAlias)
class SkillAliasAdmin(admin.ModelAdmin):
    list_display = ("phrase", "skill", "language", "created_at")
    list_filter = ("language",)
    search_fields = ("phrase", "skill__name")
    ordering = ("phrase",)
    list_select_related = ("skill",)
    autocomplete_fields = ("skill",)
    readonly_fields = ("created_at",)


@admin.action(description="Resolve using best candidate and create alias")
def resolve_using_best_candidate(modeladmin, request, queryset):
    resolved = 0
    conflicts = 0

    for term in queryset.filter(best_candidate__isnull=False):
        existing_alias = SkillAlias.objects.filter(
            phrase__iexact=term.normalized_term
        ).first()

        if (
            existing_alias is not None
            and existing_alias.skill_id != term.best_candidate_id
        ):
            # Do not claim the term was resolved to one skill when the
            # normalization service will continue resolving that phrase to a
            # different existing alias. Leave it pending for explicit review.
            conflicts += 1
            continue

        if existing_alias is None:
            SkillAlias.objects.create(
                phrase=term.normalized_term,
                skill=term.best_candidate,
            )

        term.resolved_skill = term.best_candidate
        term.status = UnmatchedSkillTerm.Status.RESOLVED
        term.resolved_by = request.user
        term.save(update_fields=["resolved_skill", "status", "resolved_by", "updated_at"])
        resolved += 1

    message = f"Resolved {resolved} term(s)."
    if conflicts:
        message += (
            f" Skipped {conflicts} alias conflict(s); those terms remain "
            "pending for review."
        )
    modeladmin.message_user(request, message)


@admin.action(description="Reject selected unmatched terms")
def reject_unmatched_terms(modeladmin, request, queryset):
    updated = queryset.filter(status=UnmatchedSkillTerm.Status.PENDING).update(
        status=UnmatchedSkillTerm.Status.REJECTED,
        resolved_by=request.user,
    )
    modeladmin.message_user(request, f"Rejected {updated} term(s).")


@admin.register(UnmatchedSkillTerm)
class UnmatchedSkillTermAdmin(admin.ModelAdmin):
    list_display = (
        "normalized_term",
        "occurrence_count",
        "best_candidate",
        "best_candidate_score",
        "status",
        "updated_at",
    )

    list_filter = ("status",)

    search_fields = ("raw_term", "normalized_term")

    date_hierarchy = "updated_at"

    list_select_related = ("best_candidate", "resolved_skill", "submitted_by", "resolved_by")

    autocomplete_fields = ("best_candidate", "resolved_skill")

    readonly_fields = (
        "raw_term",
        "normalized_term",
        "occurrence_count",
        "best_candidate",
        "best_candidate_score",
        "submitted_by",
        "created_at",
        "updated_at",
    )

    actions = [resolve_using_best_candidate, reject_unmatched_terms]
