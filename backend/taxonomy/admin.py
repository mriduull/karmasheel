from django.contrib import admin

from .models import Category, SkillAlias, SkillTag, Subcategory


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
    list_display = ("phrase", "skill", "created_at")
    search_fields = ("phrase", "skill__name")