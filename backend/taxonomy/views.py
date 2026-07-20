from django.db.models import Prefetch
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny

from .models import Category, SkillTag, Subcategory
from .serializers import (
    CategorySerializer,
    CategoryTreeSerializer,
    SkillTagSerializer,
    SubcategorySerializer,
)


def _parse_int_query_param(request, name):
    """Return the int value of a query param, or None if absent.

    Raises a DRF ValidationError (400) if the param is present but not
    a valid integer, rather than letting the ORM raise on execution.
    """
    value = request.query_params.get(name)
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValidationError({name: "Must be an integer."})


class CategoryListView(generics.ListAPIView):
    """Public read-only list of all categories, alphabetical by name."""

    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    queryset = Category.objects.order_by("name")


class SubcategoryListView(generics.ListAPIView):
    """Public read-only list of subcategories, optionally filtered by
    ?category=<category_id>, alphabetical by name."""

    serializer_class = SubcategorySerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        queryset = Subcategory.objects.order_by("name", "id")
        category_id = _parse_int_query_param(self.request, "category")
        if category_id is not None:
            queryset = queryset.filter(category_id=category_id)
        return queryset


class SkillTagListView(generics.ListAPIView):
    """Public read-only list of active standardized skills, optionally
    filtered by ?subcategory=<subcategory_id> and/or ?search=<text>,
    alphabetical by name."""

    serializer_class = SkillTagSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        queryset = SkillTag.objects.filter(is_active=True).order_by("name", "id")

        subcategory_id = _parse_int_query_param(self.request, "subcategory")
        if subcategory_id is not None:
            queryset = queryset.filter(subcategory_id=subcategory_id)

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(name__icontains=search)

        return queryset


class TaxonomyTreeView(generics.ListAPIView):
    """Public read-only nested tree of categories -> subcategories ->
    active standardized skills, each level alphabetical by name.

    Uses Prefetch so the whole tree is fetched in three queries total,
    regardless of tree size.
    """

    serializer_class = CategoryTreeSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        skills_queryset = SkillTag.objects.filter(is_active=True).order_by(
            "name", "id"
        )
        subcategories_queryset = Subcategory.objects.order_by(
            "name", "id"
        ).prefetch_related(Prefetch("skills", queryset=skills_queryset))
        return Category.objects.order_by("name").prefetch_related(
            Prefetch("subcategories", queryset=subcategories_queryset)
        )
