from django.contrib import admin

from .models import Category, SkillAlias, SkillTag, Subcategory, UnmatchedSkillTerm


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)


@admin.register(Subcategory)
class SubcategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "created_at")
    list_filter = ("category",)
    search_fields = ("name", "category__name")


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


@admin.register(SkillAlias)
class SkillAliasAdmin(admin.ModelAdmin):
    list_display = ("phrase", "skill", "language", "created_at")
    list_filter = ("language",)
    search_fields = ("phrase", "skill__name")


@admin.action(description="Resolve using best candidate and create alias")
def resolve_using_best_candidate(modeladmin, request, queryset):
    resolved = 0

    for term in queryset.filter(best_candidate__isnull=False):
        SkillAlias.objects.get_or_create(
            phrase=term.normalized_term,
            defaults={"skill": term.best_candidate},
        )

        term.resolved_skill = term.best_candidate
        term.status = UnmatchedSkillTerm.Status.RESOLVED
        term.resolved_by = request.user
        term.save(update_fields=["resolved_skill", "status", "resolved_by", "updated_at"])
        resolved += 1

    modeladmin.message_user(request, f"Resolved {resolved} term(s).")


@admin.action(description="Reject selected unmatched terms")
def reject_unmatched_terms(modeladmin, request, queryset):
    updated = queryset.update(status=UnmatchedSkillTerm.Status.REJECTED, resolved_by=request.user)
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