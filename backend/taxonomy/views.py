from django.db.models import Prefetch
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, SkillAlias, SkillTag, Subcategory
from .serializers import (
    CategorySerializer,
    CategoryTreeSerializer,
    SkillTagSerializer,
    SubcategorySerializer,
)
from .services import normalize_skill_phrase, preprocess_skill_phrase


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


class JobTaxonomyInferenceView(APIView):
    """Infer the best category/subcategory from job text and skill phrases.

    This is side-effect free: unlike profile/job saves, unmatched phrases are
    never recorded for admin review here. Explicit skill chips are weighted
    more heavily than title/description text because they are cleaner intent
    signals from the employer.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        required_skills = request.data.get("required_skills") or []
        preferred_skills = request.data.get("preferred_skills") or []
        title = request.data.get("title") or ""
        description = request.data.get("description") or ""

        scores = {}
        matched_terms = []

        def add_score(skill, weight, term, source, confidence):
            subcategory = skill.subcategory
            scores[subcategory.id] = scores.get(subcategory.id, 0) + weight
            matched_terms.append(
                {
                    "term": term,
                    "source": source,
                    "skill_id": skill.id,
                    "skill_name": skill.name,
                    "subcategory": subcategory.id,
                    "subcategory_name": subcategory.name,
                    "category": subcategory.category_id,
                    "category_name": subcategory.category.name,
                    "confidence": confidence,
                }
            )

        for phrase in required_skills:
            result = normalize_skill_phrase(phrase, record_unmatched=False)
            if result.skill is not None:
                add_score(result.skill, 3, phrase, "required_skill", result.confidence)

        for phrase in preferred_skills:
            result = normalize_skill_phrase(phrase, record_unmatched=False)
            if result.skill is not None:
                add_score(result.skill, 2, phrase, "preferred_skill", result.confidence)

        normalized_text = preprocess_skill_phrase(f"{title} {description}")
        if normalized_text:
            skills = SkillTag.objects.filter(is_active=True).select_related("subcategory__category")
            for skill in skills:
                normalized_name = preprocess_skill_phrase(skill.name)
                if normalized_name and normalized_name in normalized_text:
                    add_score(skill, 1, skill.name, "job_text", 100.0)

            aliases = SkillAlias.objects.filter(skill__is_active=True).select_related(
                "skill__subcategory__category"
            )
            for alias in aliases:
                normalized_alias = preprocess_skill_phrase(alias.phrase)
                if normalized_alias and normalized_alias in normalized_text:
                    add_score(alias.skill, 1, alias.phrase, "job_text", 100.0)

        if not scores:
            return Response(
                {
                    "category": None,
                    "category_name": None,
                    "subcategory": None,
                    "subcategory_name": None,
                    "matched_terms": [],
                    "confidence": 0,
                }
            )

        best_subcategory_id = max(scores, key=scores.get)
        best_subcategory = Subcategory.objects.select_related("category").get(pk=best_subcategory_id)
        total_score = sum(scores.values())

        return Response(
            {
                "category": best_subcategory.category_id,
                "category_name": best_subcategory.category.name,
                "subcategory": best_subcategory.id,
                "subcategory_name": best_subcategory.name,
                "matched_terms": matched_terms,
                "confidence": round((scores[best_subcategory_id] / total_score) * 100, 2),
            }
        )
