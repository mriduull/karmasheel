from pathlib import Path

from rest_framework import serializers
from PIL import Image, UnidentifiedImageError

from taxonomy.models import SkillTag
from taxonomy.services import normalize_skill_phrases

from .models import EmployerProfile, WorkerProfile


class SkillTagSummarySerializer(serializers.ModelSerializer):
    """Read-only, minimal representation of a standardized skill."""

    subcategory = serializers.StringRelatedField()

    class Meta:
        model = SkillTag
        fields = ("id", "name", "subcategory")
        read_only_fields = fields


class WorkerProfileSerializer(serializers.ModelSerializer):
    """Retrieve/create/update serializer for a worker's own profile.

    Skills are set indirectly through `skill_input` - a list of raw skill
    phrases resolved via the skill-normalization service. Phrases that
    cannot be confidently matched are surfaced back in `unmatched_terms`
    and recorded for admin review, rather than silently dropped.
    """

    skills = SkillTagSummarySerializer(many=True, read_only=True)
    profile_photo_url = serializers.SerializerMethodField()

    skill_input = serializers.ListField(
        child=serializers.CharField(max_length=150),
        write_only=True,
        required=False,
    )

    unmatched_terms = serializers.SerializerMethodField()

    class Meta:
        model = WorkerProfile
        fields = (
            "id",
            "address",
            "profile_photo",
            "profile_photo_url",
            "latitude",
            "longitude",
            "experience_years",
            "is_available",
            "expected_wage",
            "preferred_travel_radius_km",
            "skills",
            "skill_input",
            "unmatched_terms",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "profile_photo_url", "skills", "unmatched_terms", "created_at", "updated_at")

    def get_profile_photo_url(self, instance):
        if not instance.profile_photo:
            return None

        request = self.context.get("request")
        url = instance.profile_photo.url
        return request.build_absolute_uri(url) if request else url

    def get_unmatched_terms(self, instance):
        return getattr(self, "_unmatched_terms", [])

    def validate_profile_photo(self, value):
        if value is None:
            return value

        if value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("Profile photo must be 2 MB or smaller.")

        content_type = getattr(value, "content_type", "")
        if content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise serializers.ValidationError("Upload a JPG, PNG, or WebP image.")

        try:
            image = Image.open(value)
            image_format = image.format
            width, height = image.size
            image.verify()
        except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
            raise serializers.ValidationError("The uploaded file is not a valid image.")
        finally:
            value.seek(0)

        format_content_types = {
            "JPEG": "image/jpeg",
            "PNG": "image/png",
            "WEBP": "image/webp",
        }
        if format_content_types.get(image_format) != content_type:
            raise serializers.ValidationError(
                "The image contents do not match the declared file type."
            )

        format_extensions = {
            "JPEG": {".jpg", ".jpeg"},
            "PNG": {".png"},
            "WEBP": {".webp"},
        }
        if Path(value.name).suffix.lower() not in format_extensions.get(
            image_format, set()
        ):
            raise serializers.ValidationError(
                "The image contents do not match the filename extension."
            )

        if width > 4096 or height > 4096 or width * height > 16_000_000:
            raise serializers.ValidationError(
                "Profile photo dimensions must not exceed 4096 px or 16 megapixels."
            )

        return value

    def _apply_skill_input(self, instance, skill_input):
        request = self.context.get("request")
        user = request.user if request else None

        matched_skills, unmatched_terms = normalize_skill_phrases(skill_input, user=user)

        instance.skills.set(matched_skills)
        self._unmatched_terms = unmatched_terms

    def create(self, validated_data):
        skill_input = validated_data.pop("skill_input", None)
        instance = super().create(validated_data)

        if skill_input is not None:
            self._apply_skill_input(instance, skill_input)

        return instance

    def update(self, instance, validated_data):
        skill_input = validated_data.pop("skill_input", None)
        instance = super().update(instance, validated_data)

        if skill_input is not None:
            self._apply_skill_input(instance, skill_input)

        return instance


class EmployerProfileSerializer(serializers.ModelSerializer):
    """Retrieve/create/update serializer for an employer's own profile."""

    class Meta:
        model = EmployerProfile
        fields = (
            "id",
            "organization_name",
            "address",
            "latitude",
            "longitude",
            "pan_vat_number",
            "verification_status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "verification_status", "created_at", "updated_at")

    def validate_pan_vat_number(self, value):
        if not value:
            return value

        queryset = EmployerProfile.objects.filter(pan_vat_number=value)

        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError("This PAN/VAT number is already registered.")

        return value
