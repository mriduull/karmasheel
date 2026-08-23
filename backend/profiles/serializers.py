from rest_framework import serializers

from taxonomy.models import SkillTag
from taxonomy.services import normalize_skill_phrases

from .models import EmployerProfile, WorkerProfile


def _validate_coordinate_pair(attrs, instance):
    """`latitude`/`longitude` must end up either both set or both unset —
    never one alone. Checks the FINAL state after `attrs` is applied on
    top of `instance` (so a PATCH that only touches `latitude` while
    `longitude` was already saved is still valid), not just the request
    body in isolation. `JobPost` doesn't need this: both fields are
    non-nullable there, so the database itself already forbids a
    half-set pair.
    """

    def resolve(field):
        if field in attrs:
            return attrs[field]
        return getattr(instance, field, None) if instance is not None else None

    latitude = resolve("latitude")
    longitude = resolve("longitude")

    if (latitude is None) != (longitude is None):
        # Both field names carry the error - the constraint is symmetric
        # (neither field is independently "wrong"), and the request may
        # have touched either one (a fresh single-field PATCH, or a PATCH
        # clearing one field while the other's previously-saved value
        # stands), so there's no single field to blame.
        message = "Latitude and longitude must be provided together."
        raise serializers.ValidationError({"latitude": message, "longitude": message})

    return attrs


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
        read_only_fields = ("id", "skills", "unmatched_terms", "created_at", "updated_at")

    def validate(self, attrs):
        return _validate_coordinate_pair(attrs, self.instance)

    def get_unmatched_terms(self, instance):
        return getattr(self, "_unmatched_terms", [])

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

    def validate(self, attrs):
        return _validate_coordinate_pair(attrs, self.instance)

    def validate_pan_vat_number(self, value):
        if not value:
            return value

        queryset = EmployerProfile.objects.filter(pan_vat_number=value)

        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError("This PAN/VAT number is already registered.")

        return value
