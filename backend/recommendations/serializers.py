"""Read-only serializers for the Week 4 recommendation endpoints.

Every recommendation is served straight off a
``recommendations.services.RecommendationResult`` dataclass rather than
a persisted model - it is computed fresh on each request.
"""

from rest_framework import serializers

from profiles.serializers import SkillTagSummarySerializer


class SkillScoreSerializer(serializers.Serializer):
    skill_score = serializers.FloatField()
    required_skill_coverage = serializers.FloatField()
    cosine_similarity_score = serializers.FloatField()
    matched_required_skills = SkillTagSummarySerializer(many=True)
    missing_required_skills = SkillTagSummarySerializer(many=True)
    matched_preferred_skills = SkillTagSummarySerializer(many=True)


class RecommendedJobSerializer(serializers.Serializer):
    """Public-safe job summary - no employer contact details or PAN/VAT."""

    id = serializers.IntegerField()
    title = serializers.CharField()
    category_name = serializers.CharField(source="category.name")
    subcategory_name = serializers.CharField(source="subcategory.name")
    employer_name = serializers.SerializerMethodField()
    address = serializers.CharField()
    required_experience_years = serializers.IntegerField()
    wage_type = serializers.CharField()
    wage_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    work_type = serializers.CharField()
    status = serializers.CharField()

    def get_employer_name(self, job):
        return job.employer.organization_name or "Employer"


class RecommendedWorkerSerializer(serializers.Serializer):
    """Restricted worker summary for an employer's candidate view - no
    phone number or other private contact details."""

    id = serializers.IntegerField()
    username = serializers.CharField(source="user.username")
    address = serializers.CharField()
    experience_years = serializers.IntegerField()
    is_available = serializers.BooleanField()
    expected_wage = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    preferred_travel_radius_km = serializers.IntegerField(allow_null=True)
    skills = SkillTagSummarySerializer(many=True)


class _BaseRecommendationSerializer(serializers.Serializer):
    final_score = serializers.FloatField()
    skill = SkillScoreSerializer()
    distance_km = serializers.FloatField(allow_null=True)
    distance_score = serializers.FloatField(allow_null=True)
    experience_score = serializers.FloatField()
    availability_preference_score = serializers.FloatField()
    availability_sub_scores = serializers.DictField()
    reliability_verification_score = serializers.FloatField()
    reliability_sub_scores = serializers.DictField()
    employer_side_suitability = serializers.FloatField()
    worker_side_suitability = serializers.FloatField()
    reciprocal_preference_score = serializers.FloatField()
    reasons = serializers.ListField(child=serializers.CharField())
    warnings = serializers.ListField(child=serializers.CharField())


class JobRecommendationSerializer(_BaseRecommendationSerializer):
    """One ranked job recommendation for a worker."""

    job = RecommendedJobSerializer()


class WorkerRecommendationSerializer(_BaseRecommendationSerializer):
    """One ranked worker candidate recommendation for an employer's job."""

    worker = RecommendedWorkerSerializer()


class NearMissJobSerializer(_BaseRecommendationSerializer):
    """One near-miss job recommendation, as returned by the Week 5
    opportunity-advisory endpoint."""

    job = RecommendedJobSerializer()


class MissingSkillAdvisorySerializer(serializers.Serializer):
    """One ranked missing-skill suggestion, with how many near-miss jobs
    it would help unlock."""

    skill = SkillTagSummarySerializer()
    missing_frequency = serializers.IntegerField()
    required_frequency = serializers.IntegerField()
    job_ids = serializers.ListField(child=serializers.IntegerField())


class OpportunityAdvisorySerializer(serializers.Serializer):
    near_miss_jobs = NearMissJobSerializer(many=True)
    missing_skills = MissingSkillAdvisorySerializer(many=True)
