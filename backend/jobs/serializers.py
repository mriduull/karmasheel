from django.utils import timezone
from rest_framework import serializers

from profiles.models import WorkerProfile
from profiles.serializers import SkillTagSummarySerializer
from taxonomy.services import normalize_skill_phrases

from .models import JobPost


class JobPostSerializer(serializers.ModelSerializer):
    """Retrieve/create/update serializer for a job post.

    Required and preferred skills are set indirectly through
    `required_skills_input` / `preferred_skills_input` - lists of raw
    phrases (either a standardized skill name or a free-text/aliased
    phrase) resolved via the Week 2 skill-normalization service, kept
    strictly separate per input list. Phrases that cannot be confidently
    matched are surfaced back rather than silently dropped.
    """

    required_skills = SkillTagSummarySerializer(many=True, read_only=True)
    preferred_skills = SkillTagSummarySerializer(many=True, read_only=True)

    required_skills_input = serializers.ListField(
        child=serializers.CharField(max_length=150),
        write_only=True,
        required=False,
    )

    preferred_skills_input = serializers.ListField(
        child=serializers.CharField(max_length=150),
        write_only=True,
        required=False,
    )

    unmatched_required_terms = serializers.SerializerMethodField()
    unmatched_preferred_terms = serializers.SerializerMethodField()

    category_name = serializers.CharField(source="category.name", read_only=True)
    subcategory_name = serializers.CharField(source="subcategory.name", read_only=True)
    employer_name = serializers.SerializerMethodField()

    class Meta:
        model = JobPost
        fields = (
            "id",
            "title",
            "category",
            "category_name",
            "subcategory",
            "subcategory_name",
            "employer_name",
            "required_skills",
            "preferred_skills",
            "required_skills_input",
            "preferred_skills_input",
            "unmatched_required_terms",
            "unmatched_preferred_terms",
            "description",
            "address",
            "latitude",
            "longitude",
            "required_experience_years",
            "wage_type",
            "wage_amount",
            "work_type",
            "scheduled_datetime",
            "duration_days",
            "number_of_workers_required",
            "application_deadline",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def get_employer_name(self, instance):
        return instance.employer.organization_name or instance.employer.user.username

    def get_unmatched_required_terms(self, instance):
        return getattr(self, "_unmatched_required_terms", [])

    def get_unmatched_preferred_terms(self, instance):
        return getattr(self, "_unmatched_preferred_terms", [])

    def validate(self, attrs):
        category = attrs.get("category") or getattr(self.instance, "category", None)
        subcategory = attrs.get("subcategory") or getattr(self.instance, "subcategory", None)

        if category and subcategory and subcategory.category_id != category.id:
            raise serializers.ValidationError(
                {"subcategory": "This subcategory does not belong to the selected category."}
            )

        return attrs

    def validate_application_deadline(self, value):
        if self.instance is None and value is not None and value < timezone.now():
            raise serializers.ValidationError("Application deadline cannot be in the past.")

        return value

    def validate_status(self, value):
        if self.instance is not None and self.instance.status == JobPost.Status.CLOSED and value == JobPost.Status.ACTIVE:
            raise serializers.ValidationError("A closed job cannot be reopened.")

        return value

    def _apply_skill_inputs(self, instance, required_input, preferred_input):
        request = self.context.get("request")
        user = request.user if request else None

        self._unmatched_required_terms = []
        self._unmatched_preferred_terms = []

        if required_input is not None:
            matched, unmatched = normalize_skill_phrases(required_input, user=user)
            instance.required_skills.set(matched)
            self._unmatched_required_terms = unmatched

        if preferred_input is not None:
            matched, unmatched = normalize_skill_phrases(preferred_input, user=user)
            instance.preferred_skills.set(matched)
            self._unmatched_preferred_terms = unmatched

    def create(self, validated_data):
        required_input = validated_data.pop("required_skills_input", None)
        preferred_input = validated_data.pop("preferred_skills_input", None)
        instance = super().create(validated_data)
        self._apply_skill_inputs(instance, required_input, preferred_input)
        return instance

    def update(self, instance, validated_data):
        required_input = validated_data.pop("required_skills_input", None)
        preferred_input = validated_data.pop("preferred_skills_input", None)
        instance = super().update(instance, validated_data)
        self._apply_skill_inputs(instance, required_input, preferred_input)
        return instance


class WorkerCandidateSerializer(serializers.ModelSerializer):
    """Read-only summary of a worker, used when an employer browses
    candidates filtered for one of their own job posts."""

    username = serializers.CharField(source="user.username", read_only=True)
    skills = SkillTagSummarySerializer(many=True, read_only=True)

    class Meta:
        model = WorkerProfile
        fields = (
            "id",
            "username",
            "address",
            "latitude",
            "longitude",
            "experience_years",
            "is_available",
            "expected_wage",
            "preferred_travel_radius_km",
            "skills",
        )
        read_only_fields = fields


class PublicJobPostSerializer(serializers.ModelSerializer):
    """Read-only, public-safe representation of a job post for anonymous
    browsing (GET /api/jobs/browse/ and GET /api/jobs/<id>/ on an active
    job). Deliberately excludes employer contact details, PAN/VAT number,
    internal verification records, applications and worker information -
    none of that is reachable through this serializer's fields at all."""

    required_skills = SkillTagSummarySerializer(many=True, read_only=True)
    preferred_skills = SkillTagSummarySerializer(many=True, read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    subcategory_name = serializers.CharField(source="subcategory.name", read_only=True)
    employer_name = serializers.SerializerMethodField()
    employer_verification_status = serializers.CharField(
        source="employer.verification_status", read_only=True
    )

    class Meta:
        model = JobPost
        fields = (
            "id",
            "title",
            "description",
            "category",
            "category_name",
            "subcategory",
            "subcategory_name",
            "employer_name",
            "employer_verification_status",
            "required_skills",
            "preferred_skills",
            "address",
            "latitude",
            "longitude",
            "required_experience_years",
            "wage_type",
            "wage_amount",
            "work_type",
            "scheduled_datetime",
            "duration_days",
            "number_of_workers_required",
            "application_deadline",
            "status",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_employer_name(self, instance):
        return instance.employer.organization_name or "Employer"
