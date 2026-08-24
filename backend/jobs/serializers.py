from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from profiles.models import WorkerProfile
from profiles.serializers import SkillTagSummarySerializer
from taxonomy.services import (
    get_similar_skill_suggestions,
    normalize_skill_phrase,
    normalize_skill_phrases,
    preprocess_skill_phrase,
    record_skill_for_review,
)

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

    required_skills_review_input = serializers.ListField(
        child=serializers.CharField(max_length=150),
        write_only=True,
        required=False,
    )
    preferred_skills_review_input = serializers.ListField(
        child=serializers.CharField(max_length=150),
        write_only=True,
        required=False,
    )

    unmatched_required_terms = serializers.SerializerMethodField()
    unmatched_preferred_terms = serializers.SerializerMethodField()
    required_skill_matches = serializers.SerializerMethodField()
    preferred_skill_matches = serializers.SerializerMethodField()

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
            "required_skills_review_input",
            "preferred_skills_review_input",
            "unmatched_required_terms",
            "unmatched_preferred_terms",
            "required_skill_matches",
            "preferred_skill_matches",
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

    def get_required_skill_matches(self, instance):
        return getattr(self, "_required_skill_matches", [])

    def get_preferred_skill_matches(self, instance):
        return getattr(self, "_preferred_skill_matches", [])

    def _skill_match_summary(self, phrase, result):
        suggestions = []
        if result.method != "exact_name":
            candidate = result.skill or result.candidate
            subcategory_id = candidate.subcategory_id if candidate is not None else None
            for skill, confidence in get_similar_skill_suggestions(
                phrase,
                limit=5,
                subcategory_id=subcategory_id,
            ):
                suggestion = dict(SkillTagSummarySerializer(skill).data)
                suggestion["confidence"] = round(confidence, 2)
                suggestions.append(suggestion)

        return {
            "input_term": phrase,
            "method": result.method,
            "confidence": round(result.confidence, 2),
            "matched_skill": (
                SkillTagSummarySerializer(result.skill).data
                if result.skill is not None
                else None
            ),
            "matched_skill_was_selected": result.skill is not None,
            "suggestions": suggestions,
        }

    def validate(self, attrs):
        category = attrs.get("category") or getattr(self.instance, "category", None)
        subcategory = attrs.get("subcategory") or getattr(self.instance, "subcategory", None)

        if category and subcategory and subcategory.category_id != category.id:
            raise serializers.ValidationError(
                {"subcategory": "This subcategory does not belong to the selected category."}
            )

        skill_input_fields = (
            ("required_skills_input", "required_skills"),
            ("preferred_skills_input", "preferred_skills"),
        )
        skill_errors = {}

        for input_field, relation_name in skill_input_fields:
            if input_field in attrs:
                # Serializer validation must remain free of database side
                # effects. Unmatched terms are recorded only after every
                # field has validated and the job is actually being saved.
                matched, _ = normalize_skill_phrases(
                    attrs[input_field],
                    record_unmatched=False,
                )
                invalid_skills = [
                    skill for skill in matched if subcategory and skill.subcategory_id != subcategory.id
                ]

                if invalid_skills:
                    invalid_names = ", ".join(sorted({skill.name for skill in invalid_skills}))
                    skill_errors[input_field] = (
                        "Every job skill must belong to the selected subcategory. "
                        f"Invalid skill(s): {invalid_names}."
                    )
                    continue
            elif self.instance is not None and subcategory is not None:
                # Changing a job's subcategory without replacing its skills
                # must not leave previously normalized skills attached to the
                # wrong taxonomy branch.
                if getattr(self.instance, relation_name).exclude(
                    subcategory_id=subcategory.id
                ).exists():
                    skill_errors[input_field] = (
                        "Supply a replacement skill list when changing the "
                        "subcategory because existing skills belong elsewhere."
                    )

        if skill_errors:
            raise serializers.ValidationError(skill_errors)

        return attrs

    def validate_application_deadline(self, value):
        if value is not None and value <= timezone.now():
            raise serializers.ValidationError("Application deadline cannot be in the past.")

        return value

    def validate_status(self, value):
        if self.instance is not None and self.instance.status == JobPost.Status.CLOSED and value == JobPost.Status.ACTIVE:
            raise serializers.ValidationError("A closed job cannot be reopened.")

        return value

    def _resolve_skill_input(self, phrases, review_phrases, *, user):
        review_phrases = review_phrases or []
        reviewed = {preprocess_skill_phrase(phrase) for phrase in review_phrases}
        matched = []
        unmatched = []
        matches = []

        for phrase in phrases or []:
            is_reviewed = preprocess_skill_phrase(phrase) in reviewed
            result = normalize_skill_phrase(
                phrase,
                user=user,
                record_unmatched=not is_reviewed,
            )
            matches.append(self._skill_match_summary(phrase, result))
            if result.skill is not None and not is_reviewed:
                matched.append(result.skill)
            else:
                unmatched.append(phrase)

        recorded = set()
        for phrase in review_phrases:
            normalized = preprocess_skill_phrase(phrase)
            if not normalized or normalized in recorded:
                continue
            record_skill_for_review(phrase, user=user)
            recorded.add(normalized)
            if normalized not in {preprocess_skill_phrase(term) for term in unmatched}:
                unmatched.append(phrase)

        return matched, unmatched, matches

    def _apply_skill_inputs(
        self,
        instance,
        required_input,
        preferred_input,
        required_review_input=None,
        preferred_review_input=None,
    ):
        request = self.context.get("request")
        user = request.user if request else None

        self._unmatched_required_terms = []
        self._unmatched_preferred_terms = []
        self._required_skill_matches = []
        self._preferred_skill_matches = []

        if required_input is not None or required_review_input is not None:
            matched, unmatched, matches = self._resolve_skill_input(
                required_input or [], required_review_input, user=user
            )
            instance.required_skills.set(matched)
            self._unmatched_required_terms = unmatched
            self._required_skill_matches = matches

        if preferred_input is not None or preferred_review_input is not None:
            matched, unmatched, matches = self._resolve_skill_input(
                preferred_input or [], preferred_review_input, user=user
            )
            instance.preferred_skills.set(matched)
            self._unmatched_preferred_terms = unmatched
            self._preferred_skill_matches = matches

    @transaction.atomic
    def create(self, validated_data):
        required_input = validated_data.pop("required_skills_input", None)
        preferred_input = validated_data.pop("preferred_skills_input", None)
        required_review_input = validated_data.pop("required_skills_review_input", None)
        preferred_review_input = validated_data.pop("preferred_skills_review_input", None)
        instance = super().create(validated_data)
        self._apply_skill_inputs(
            instance,
            required_input,
            preferred_input,
            required_review_input,
            preferred_review_input,
        )
        return instance

    @transaction.atomic
    def update(self, instance, validated_data):
        required_input = validated_data.pop("required_skills_input", None)
        preferred_input = validated_data.pop("preferred_skills_input", None)
        required_review_input = validated_data.pop("required_skills_review_input", None)
        preferred_review_input = validated_data.pop("preferred_skills_review_input", None)
        instance = super().update(instance, validated_data)
        self._apply_skill_inputs(
            instance,
            required_input,
            preferred_input,
            required_review_input,
            preferred_review_input,
        )
        return instance


class WorkerCandidateSerializer(serializers.ModelSerializer):
    """Privacy-safe worker summary for a verified employer's own job.

    Exact worker address and coordinates are matching inputs, not candidate
    directory fields. They are deliberately omitted so browsing candidates
    cannot be used to collect workers' precise locations.
    """

    username = serializers.CharField(source="user.username", read_only=True)
    skills = SkillTagSummarySerializer(many=True, read_only=True)

    class Meta:
        model = WorkerProfile
        fields = (
            "id",
            "username",
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
