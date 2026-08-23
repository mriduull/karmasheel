from rest_framework import serializers

from .models import Category, SkillTag, Subcategory


class JobTaxonomyInferenceRequestSerializer(serializers.Serializer):
    """Bound public inference input before running taxonomy-wide matching."""

    title = serializers.CharField(max_length=150, allow_blank=True, default="")
    description = serializers.CharField(max_length=5000, allow_blank=True, default="")
    required_skills = serializers.ListField(
        child=serializers.CharField(max_length=150),
        max_length=20,
        allow_empty=True,
        default=list,
    )
    preferred_skills = serializers.ListField(
        child=serializers.CharField(max_length=150),
        max_length=20,
        allow_empty=True,
        default=list,
    )


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name"]


class SubcategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Subcategory
        fields = ["id", "name", "category"]


class SkillTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = SkillTag
        fields = ["id", "name", "subcategory"]


class SkillTagTreeSerializer(serializers.ModelSerializer):
    """Nested skill representation for the taxonomy tree endpoint.

    Deliberately excludes is_active/created_at and any admin-review
    fields (SkillAlias, UnmatchedSkillTerm) - the tree is a public,
    onboarding-facing view of standardized skills only.
    """

    class Meta:
        model = SkillTag
        fields = ["id", "name"]


class SubcategoryTreeSerializer(serializers.ModelSerializer):
    skills = SkillTagTreeSerializer(many=True, read_only=True)

    class Meta:
        model = Subcategory
        fields = ["id", "name", "skills"]


class CategoryTreeSerializer(serializers.ModelSerializer):
    subcategories = SubcategoryTreeSerializer(many=True, read_only=True)

    class Meta:
        model = Category
        fields = ["id", "name", "subcategories"]
