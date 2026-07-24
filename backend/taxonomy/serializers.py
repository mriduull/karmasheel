from rest_framework import serializers

from .models import Category, SkillTag, Subcategory


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
