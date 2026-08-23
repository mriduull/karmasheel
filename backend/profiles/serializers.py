from pathlib import Path

from rest_framework import serializers
from PIL import Image, UnidentifiedImageError

from taxonomy.models import SkillTag
from taxonomy.services import (
    get_similar_skill_suggestions,
    normalize_skill_phrase,
    preprocess_skill_phrase,
    record_skill_for_review,
)

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
        max_length=20,
        write_only=True,
        required=False,
    )
    skill_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        write_only=True,
        required=False,
    )
    skill_review_input = serializers.ListField(
        child=serializers.CharField(max_length=150),
        max_length=20,
        write_only=True,
        required=False,
    )

    unmatched_terms = serializers.SerializerMethodField()
    skill_matches = serializers.SerializerMethodField()

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
            "skill_ids",
            "skill_review_input",
            "unmatched_terms",
            "skill_matches",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "profile_photo_url",
            "skills",
            "unmatched_terms",
            "skill_matches",
            "created_at",
            "updated_at",
        )

    def get_profile_photo_url(self, instance):
        if not instance.profile_photo:
            return None

        request = self.context.get("request")
        url = instance.profile_photo.url
        return request.build_absolute_uri(url) if request else url

    def get_unmatched_terms(self, instance):
        return getattr(self, "_unmatched_terms", [])

    def get_skill_matches(self, instance):
        return getattr(self, "_skill_matches", [])

    def validate_skill_ids(self, value):
        unique_ids = list(dict.fromkeys(value))
        if len(unique_ids) > 500:
            raise serializers.ValidationError(
                "Select no more than 500 unique skill IDs."
            )

        skills_by_id = SkillTag.objects.filter(
            pk__in=unique_ids,
            is_active=True,
        ).in_bulk()
        invalid_ids = [
            skill_id for skill_id in unique_ids if skill_id not in skills_by_id
        ]
        if invalid_ids:
            raise serializers.ValidationError(
                f"Select valid active skill IDs. Invalid IDs: {invalid_ids}."
            )

        self._validated_skills_by_id = skills_by_id
        return unique_ids

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

    def _skill_summary(self, skill):
        if skill is None:
            return None

        return SkillTagSummarySerializer(skill).data

    def _skill_match_summary(self, phrase, result, *, selected_skill_ids):
        suggestions = []
        if result.method != "exact_name":
            candidate = result.skill or result.candidate
            subcategory_id = candidate.subcategory_id if candidate is not None else None
            for skill, confidence in get_similar_skill_suggestions(
                phrase,
                limit=5,
                subcategory_id=subcategory_id,
            ):
                suggestion = dict(self._skill_summary(skill))
                suggestion["confidence"] = round(confidence, 2)
                suggestions.append(suggestion)

        return {
            "input_term": phrase,
            "method": result.method,
            "confidence": round(result.confidence, 2),
            "matched_skill": self._skill_summary(result.skill),
            "matched_skill_was_selected": (
                result.skill is not None and result.skill.id in selected_skill_ids
            ),
            "suggestions": suggestions,
        }

    def _apply_skill_inputs(
        self,
        instance,
        *,
        skill_input=None,
        skill_ids=None,
        skill_review_input=None,
    ):
        request = self.context.get("request")
        user = request.user if request else None
        review_phrases = skill_review_input or []
        reviewed_normalized = {
            preprocess_skill_phrase(phrase) for phrase in review_phrases
        }
        unmatched_terms = []
        unmatched_normalized = set()

        def add_unmatched_term(phrase):
            normalized = preprocess_skill_phrase(phrase)
            if not normalized or normalized in unmatched_normalized:
                return
            unmatched_terms.append(phrase)
            unmatched_normalized.add(normalized)

        explicit_skills = []
        explicit_names = set()
        selected_skill_ids = set()
        if skill_ids is not None:
            skills_by_id = getattr(self, "_validated_skills_by_id", {})
            explicit_skills = [skills_by_id[skill_id] for skill_id in skill_ids]
            selected_skill_ids = set(skill_ids)
            explicit_names = {
                preprocess_skill_phrase(skill.name) for skill in explicit_skills
            }

        if skill_input is not None:
            matched_skills = list(explicit_skills)
            skill_matches = []

            for phrase in skill_input:
                if (
                    skill_ids is not None
                    and preprocess_skill_phrase(phrase) in explicit_names
                ):
                    continue

                is_reviewed = preprocess_skill_phrase(phrase) in reviewed_normalized
                result = normalize_skill_phrase(
                    phrase,
                    user=user,
                    record_unmatched=not is_reviewed,
                )
                skill_matches.append(
                    self._skill_match_summary(
                        phrase,
                        result,
                        selected_skill_ids=selected_skill_ids,
                    )
                )

                if result.skill is not None and not is_reviewed:
                    matched_skills.append(result.skill)
                else:
                    add_unmatched_term(phrase)

            instance.skills.set(matched_skills)
            self._skill_matches = skill_matches
        elif skill_ids is not None:
            instance.skills.set(explicit_skills)

        recorded_reviews = set()
        for phrase in review_phrases:
            normalized = preprocess_skill_phrase(phrase)
            if normalized in recorded_reviews:
                continue
            record_skill_for_review(phrase, user=user)
            recorded_reviews.add(normalized)
            add_unmatched_term(phrase)

        self._unmatched_terms = unmatched_terms

    def create(self, validated_data):
        skill_input = validated_data.pop("skill_input", None)
        skill_ids = validated_data.pop("skill_ids", None)
        skill_review_input = validated_data.pop("skill_review_input", None)
        instance = super().create(validated_data)

        if (
            skill_input is not None
            or skill_ids is not None
            or skill_review_input is not None
        ):
            self._apply_skill_inputs(
                instance,
                skill_input=skill_input,
                skill_ids=skill_ids,
                skill_review_input=skill_review_input,
            )

        return instance

    def update(self, instance, validated_data):
        skill_input = validated_data.pop("skill_input", None)
        skill_ids = validated_data.pop("skill_ids", None)
        skill_review_input = validated_data.pop("skill_review_input", None)
        instance = super().update(instance, validated_data)

        if (
            skill_input is not None
            or skill_ids is not None
            or skill_review_input is not None
        ):
            self._apply_skill_inputs(
                instance,
                skill_input=skill_input,
                skill_ids=skill_ids,
                skill_review_input=skill_review_input,
            )

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
