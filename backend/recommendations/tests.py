from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from applications.models import Application
from applications.services import submit_rating
from jobs.models import JobPost
from profiles.models import EmployerProfile, WorkerProfile
from taxonomy.models import Category, SkillTag, Subcategory

from . import advisory, services

User = get_user_model()


def make_job(employer, category, subcategory, **overrides):
    defaults = dict(
        title="House wiring for new build",
        description="Wire a two-storey residential building.",
        address="Baneshwor, Kathmandu",
        latitude=Decimal("27.700000"),
        longitude=Decimal("85.330000"),
        required_experience_years=0,
        wage_amount=Decimal("1500.00"),
        status=JobPost.Status.ACTIVE,
    )
    defaults.update(overrides)
    return JobPost.objects.create(employer=employer, category=category, subcategory=subcategory, **defaults)


# ---------------------------------------------------------------------
# Pure scoring-function unit tests
# ---------------------------------------------------------------------

class RequiredSkillCoverageTests(TestCase):
    def test_full_coverage(self):
        self.assertEqual(services.required_skill_coverage({1, 2, 3}, {1, 2, 3}), 100.0)

    def test_partial_coverage(self):
        self.assertEqual(services.required_skill_coverage({1, 2}, {1, 2, 3, 4}), 50.0)

    def test_no_required_skills_is_full_coverage_not_division_by_zero(self):
        self.assertEqual(services.required_skill_coverage({1, 2}, set()), 100.0)

    def test_no_matching_skills(self):
        self.assertEqual(services.required_skill_coverage({9, 10}, {1, 2}), 0.0)


class CosineSimilarityTests(TestCase):
    def test_identical_skill_sets_score_100(self):
        score = services.cosine_similarity_score({1, 2, 3}, {1, 2, 3}, set())
        self.assertEqual(score, 100.0)

    def test_partial_overlap_scores_between_0_and_100(self):
        score = services.cosine_similarity_score({1, 2}, {2, 3}, set())
        self.assertGreater(score, 0.0)
        self.assertLess(score, 100.0)

    def test_disjoint_sets_score_0(self):
        score = services.cosine_similarity_score({1, 2}, {3, 4}, set())
        self.assertEqual(score, 0.0)

    def test_empty_vectors_do_not_crash(self):
        self.assertEqual(services.cosine_similarity_score(set(), set(), set()), 0.0)

    def test_worker_has_no_skills_scores_0(self):
        score = services.cosine_similarity_score(set(), {1, 2}, {3})
        self.assertEqual(score, 0.0)

    def test_considers_preferred_skills_too(self):
        score = services.cosine_similarity_score({1}, set(), {1})
        self.assertEqual(score, 100.0)


class DistanceScoreTests(TestCase):
    def test_zero_km_scores_100(self):
        self.assertEqual(services.calculate_distance_score(0), 100.0)

    def test_intermediate_distance_falls_off_linearly(self):
        # Default MAX_DISTANCE_KM is 20 -> 10km is the midpoint.
        self.assertEqual(services.calculate_distance_score(10), 50.0)

    def test_distance_at_max_scores_0(self):
        self.assertEqual(services.calculate_distance_score(20), 0.0)

    def test_distance_beyond_max_scores_0(self):
        self.assertEqual(services.calculate_distance_score(35), 0.0)

    def test_none_distance_returns_none(self):
        self.assertIsNone(services.calculate_distance_score(None))

    @override_settings(RECOMMENDATION_SETTINGS={**settings.RECOMMENDATION_SETTINGS, "MAX_DISTANCE_KM": 10.0})
    def test_max_distance_is_configurable(self):
        self.assertEqual(services.calculate_distance_score(5), 50.0)


class ExperienceScoreTests(TestCase):
    def test_no_experience_required_scores_100(self):
        self.assertEqual(services.calculate_experience_score(0, 0), 100.0)

    def test_worker_meets_requirement_scores_100(self):
        self.assertEqual(services.calculate_experience_score(5, 5), 100.0)

    def test_worker_exceeds_requirement_scores_100(self):
        self.assertEqual(services.calculate_experience_score(10, 5), 100.0)

    def test_worker_below_requirement_scores_proportionally(self):
        self.assertEqual(services.calculate_experience_score(2, 4), 50.0)

    def test_zero_worker_experience_below_requirement_scores_0(self):
        self.assertEqual(services.calculate_experience_score(0, 5), 0.0)


class ClampScoreTests(TestCase):
    def test_clamps_above_100(self):
        self.assertEqual(services.clamp_score(150), 100.0)

    def test_clamps_below_0(self):
        self.assertEqual(services.clamp_score(-20), 0.0)

    def test_leaves_in_range_value_untouched(self):
        self.assertEqual(services.clamp_score(42), 42)


class RecommendationWeightValidationTests(TestCase):
    def test_default_weights_are_valid(self):
        services.validate_recommendation_settings()

    @override_settings(RECOMMENDATION_SETTINGS={**settings.RECOMMENDATION_SETTINGS, "FINAL_WEIGHT_SKILL": 0.9})
    def test_raises_when_final_weights_do_not_sum_to_one(self):
        with self.assertRaises(AssertionError):
            services.validate_recommendation_weights()

    @override_settings(
        RECOMMENDATION_SETTINGS={**settings.RECOMMENDATION_SETTINGS, "SKILL_WEIGHT_REQUIRED_COVERAGE": 0.9}
    )
    def test_raises_when_skill_weights_do_not_sum_to_one(self):
        with self.assertRaises(AssertionError):
            services.validate_recommendation_weights()

    def test_rejects_offsetting_out_of_range_weights_even_when_sum_is_one(self):
        invalid_settings = {
            **settings.RECOMMENDATION_SETTINGS,
            "FINAL_WEIGHT_SKILL": -0.1,
            "FINAL_WEIGHT_DISTANCE": 0.7,
        }
        with override_settings(RECOMMENDATION_SETTINGS=invalid_settings):
            with self.assertRaises(AssertionError):
                services.validate_recommendation_settings()

    def test_rejects_non_finite_weight(self):
        invalid_settings = {
            **settings.RECOMMENDATION_SETTINGS,
            "FINAL_WEIGHT_SKILL": float("nan"),
        }
        with override_settings(RECOMMENDATION_SETTINGS=invalid_settings):
            with self.assertRaises(AssertionError):
                services.validate_recommendation_settings()

    def test_rejects_non_positive_or_non_finite_max_distance(self):
        for value in (0, -1, float("nan"), float("inf")):
            with self.subTest(value=value):
                invalid_settings = {
                    **settings.RECOMMENDATION_SETTINGS,
                    "MAX_DISTANCE_KM": value,
                }
                with override_settings(RECOMMENDATION_SETTINGS=invalid_settings):
                    with self.assertRaises(AssertionError):
                        services.validate_recommendation_settings()

    def test_rejects_invalid_neutral_score(self):
        for value in (-0.01, 100.01, float("nan"), float("inf")):
            with self.subTest(value=value):
                invalid_settings = {
                    **settings.RECOMMENDATION_SETTINGS,
                    "NEUTRAL_SCORE_WHEN_UNKNOWN": value,
                }
                with override_settings(RECOMMENDATION_SETTINGS=invalid_settings):
                    with self.assertRaises(AssertionError):
                        services.validate_recommendation_settings()

    def test_rejects_inverted_or_out_of_range_near_miss_band(self):
        invalid_updates = (
            {"NEAR_MISS_MIN_SCORE": 76.0, "NEAR_MISS_MAX_SCORE": 75.0},
            {"NEAR_MISS_MIN_SCORE": -0.01},
            {"NEAR_MISS_MAX_SCORE": 100.01},
            {"NEAR_MISS_MIN_SCORE": float("nan")},
            {"NEAR_MISS_MAX_SCORE": float("inf")},
        )
        for updates in invalid_updates:
            with self.subTest(updates=updates):
                invalid_settings = {
                    **settings.RECOMMENDATION_SETTINGS,
                    **updates,
                }
                with override_settings(RECOMMENDATION_SETTINGS=invalid_settings):
                    with self.assertRaises(AssertionError):
                        services.validate_recommendation_settings()

    def test_equal_near_miss_bounds_are_valid(self):
        valid_settings = {
            **settings.RECOMMENDATION_SETTINGS,
            "NEAR_MISS_MIN_SCORE": 50.0,
            "NEAR_MISS_MAX_SCORE": 50.0,
        }
        with override_settings(RECOMMENDATION_SETTINGS=valid_settings):
            services.validate_recommendation_settings()

    def test_rejects_invalid_result_limits(self):
        invalid_updates = (
            {"DEFAULT_RESULT_LIMIT": 0},
            {"MAX_RESULT_LIMIT": 0},
            {"DEFAULT_RESULT_LIMIT": True},
            {"DEFAULT_RESULT_LIMIT": 51, "MAX_RESULT_LIMIT": 50},
        )
        for updates in invalid_updates:
            with self.subTest(updates=updates):
                invalid_settings = {
                    **settings.RECOMMENDATION_SETTINGS,
                    **updates,
                }
                with override_settings(RECOMMENDATION_SETTINGS=invalid_settings):
                    with self.assertRaises(AssertionError):
                        services.validate_recommendation_settings()

    def test_rejects_invalid_skill_match_threshold(self):
        for value in (-0.01, 100.01, float("nan"), float("inf"), True):
            with self.subTest(value=value):
                with override_settings(SKILL_MATCH_THRESHOLD=value):
                    with self.assertRaises(AssertionError):
                        services.validate_recommendation_settings()


# ---------------------------------------------------------------------
# Tests needing model instances (skill/job/profile scoring, explanations)
# ---------------------------------------------------------------------

class RecommendationServiceTestsBase(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Construction & Repair")
        self.subcategory = Subcategory.objects.create(category=self.category, name="Electrical")
        self.other_subcategory = Subcategory.objects.create(category=self.category, name="Plumbing")

        self.wiring_skill = SkillTag.objects.create(subcategory=self.subcategory, name="House Wiring")
        self.breaker_skill = SkillTag.objects.create(subcategory=self.subcategory, name="Circuit Breaker Installation")
        self.panel_skill = SkillTag.objects.create(subcategory=self.subcategory, name="Panel Upgrades")

        self.employer_user = User.objects.create_user(
            username="employer1",
            phone_number="9800000001",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer = EmployerProfile.objects.create(
            user=self.employer_user,
            organization_name="Kathmandu Electrical Co",
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
        )

        self.worker_user = User.objects.create_user(
            username="worker1",
            phone_number="9800000002",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
            is_contact_verified=True,
        )
        self.worker = WorkerProfile.objects.create(
            user=self.worker_user,
            address="Baneshwor, Kathmandu",
            latitude=Decimal("27.700000"),
            longitude=Decimal("85.330000"),
            experience_years=3,
            is_available=True,
            expected_wage=Decimal("1000.00"),
            preferred_travel_radius_km=15,
        )
        self.worker.skills.set([self.wiring_skill, self.breaker_skill])

        self.job = make_job(
            self.employer,
            self.category,
            self.subcategory,
            required_experience_years=2,
            wage_amount=Decimal("1500.00"),
            latitude=Decimal("27.710000"),
            longitude=Decimal("85.340000"),
        )
        self.job.required_skills.set([self.wiring_skill])
        self.job.preferred_skills.set([self.breaker_skill])


class SkillScoreCalculationTests(RecommendationServiceTestsBase):
    def test_worker_with_all_required_and_preferred_skills(self):
        result = services.calculate_skill_score(
            self.worker.skills.all(), self.job.required_skills.all(), self.job.preferred_skills.all()
        )
        self.assertEqual(result.required_skill_coverage, 100.0)
        self.assertEqual(result.matched_required_skills, [self.wiring_skill])
        self.assertEqual(result.missing_required_skills, [])
        self.assertEqual(result.matched_preferred_skills, [self.breaker_skill])
        self.assertEqual(result.skill_score, round(0.70 * 100 + 0.30 * result.cosine_similarity_score, 2))

    def test_worker_missing_required_skill(self):
        self.worker.skills.set([self.breaker_skill])
        result = services.calculate_skill_score(
            self.worker.skills.all(), self.job.required_skills.all(), self.job.preferred_skills.all()
        )
        self.assertEqual(result.required_skill_coverage, 0.0)
        self.assertEqual(result.missing_required_skills, [self.wiring_skill])

    def test_job_with_no_required_skills_treats_worker_as_fully_covered(self):
        self.job.required_skills.clear()
        result = services.calculate_skill_score(
            self.worker.skills.all(), self.job.required_skills.all(), self.job.preferred_skills.all()
        )
        self.assertEqual(result.required_skill_coverage, 100.0)


class DistanceCalculationTests(RecommendationServiceTestsBase):
    def test_known_coordinates_produce_distance_and_score(self):
        distance_km, distance_score = services.calculate_distance(self.worker, self.job)
        self.assertIsNotNone(distance_km)
        self.assertGreater(distance_km, 0)
        self.assertIsNotNone(distance_score)

    def test_missing_worker_coordinates_returns_none_without_crashing(self):
        self.worker.latitude = None
        self.worker.longitude = None
        distance_km, distance_score = services.calculate_distance(self.worker, self.job)
        self.assertIsNone(distance_km)
        self.assertIsNone(distance_score)


class AvailabilityPreferenceScoreTests(RecommendationServiceTestsBase):
    def test_wage_meets_expectation_and_within_radius_scores_high(self):
        score, sub_scores = services.calculate_availability_preference_score(self.worker, self.job, 5.0)
        self.assertEqual(sub_scores["wage_compatibility_score"], 100.0)
        self.assertEqual(sub_scores["travel_radius_compatibility_score"], 100.0)
        self.assertEqual(score, 100.0)

    def test_wage_below_expectation_lowers_score(self):
        self.job.wage_amount = Decimal("500.00")
        score, sub_scores = services.calculate_availability_preference_score(self.worker, self.job, 5.0)
        self.assertLess(sub_scores["wage_compatibility_score"], 100.0)

    def test_outside_travel_radius_lowers_score(self):
        score, sub_scores = services.calculate_availability_preference_score(self.worker, self.job, 30.0)
        self.assertLess(sub_scores["travel_radius_compatibility_score"], 100.0)

    def test_missing_wage_expectation_is_neutral_not_penalized(self):
        self.worker.expected_wage = None
        score, sub_scores = services.calculate_availability_preference_score(self.worker, self.job, 5.0)
        self.assertEqual(sub_scores["wage_compatibility_score"], 100.0)

    def test_missing_distance_or_radius_falls_back_to_neutral(self):
        score, sub_scores = services.calculate_availability_preference_score(self.worker, self.job, None)
        self.assertEqual(
            sub_scores["travel_radius_compatibility_score"], settings.RECOMMENDATION_SETTINGS["NEUTRAL_SCORE_WHEN_UNKNOWN"]
        )


class ReliabilityScoreTests(RecommendationServiceTestsBase):
    def _create_completed_application(self):
        return Application.objects.create(
            worker=self.worker,
            job=self.job,
            status=Application.Status.COMPLETED,
        )

    def test_no_history_preserves_cold_start_score(self):
        worker_score, worker_sub_scores = services.calculate_worker_reliability_score(self.worker)
        employer_score, employer_sub_scores = services.calculate_employer_reliability_score(self.employer)

        self.assertEqual(worker_score, worker_sub_scores["base_reliability_score"])
        self.assertEqual(employer_score, employer_sub_scores["base_reliability_score"])
        self.assertIsNone(worker_sub_scores["average_rating"])
        self.assertEqual(worker_sub_scores["rating_count"], 0)
        self.assertEqual(worker_sub_scores["completed_job_count"], 0)

    def test_verified_contact_scores_higher_than_unverified(self):
        verified_score, _ = services.calculate_worker_reliability_score(self.worker)

        self.worker_user.is_contact_verified = False
        self.worker_user.save()
        unverified_score, _ = services.calculate_worker_reliability_score(self.worker)

        self.assertGreater(verified_score, unverified_score)

    def test_incomplete_worker_profile_scores_lower(self):
        complete_score, _ = services.calculate_worker_reliability_score(self.worker)

        sparse_worker = WorkerProfile.objects.create(
            user=User.objects.create_user(
                username="sparseworker",
                phone_number="9800000099",
                password="WorkerPassword123!",
                role=User.Role.WORKER,
            )
        )
        sparse_score, _ = services.calculate_worker_reliability_score(sparse_worker)

        self.assertGreater(complete_score, sparse_score)

    def test_verified_employer_scores_higher_than_unverified(self):
        verified_score, _ = services.calculate_employer_reliability_score(self.employer)

        self.employer.verification_status = EmployerProfile.VerificationStatus.UNVERIFIED
        unverified_score, _ = services.calculate_employer_reliability_score(self.employer)

        self.assertGreater(verified_score, unverified_score)

    def test_completed_job_history_improves_worker_and_employer_reliability(self):
        self.worker_user.is_contact_verified = False
        self.worker_user.save(update_fields=["is_contact_verified"])

        worker_before, _ = services.calculate_worker_reliability_score(self.worker)
        employer_before, _ = services.calculate_employer_reliability_score(self.employer)
        self._create_completed_application()
        worker_after, worker_sub_scores = services.calculate_worker_reliability_score(self.worker)
        employer_after, employer_sub_scores = services.calculate_employer_reliability_score(self.employer)

        self.assertGreater(worker_after, worker_before)
        self.assertGreater(employer_after, employer_before)
        self.assertEqual(worker_sub_scores["completed_job_count"], 1)
        self.assertEqual(employer_sub_scores["completed_job_count"], 1)

    def test_low_worker_rating_lowers_reliability_without_overriding_verification(self):
        application = self._create_completed_application()
        score_before, _ = services.calculate_worker_reliability_score(self.worker)
        submit_rating(application, reviewer=self.employer_user, score=1)
        score_after, sub_scores = services.calculate_worker_reliability_score(self.worker)

        self.assertLess(score_after, score_before)
        self.assertGreater(score_after, 0)
        self.assertEqual(sub_scores["average_rating"], 1.0)
        self.assertEqual(sub_scores["rating_score"], 20.0)
        self.assertEqual(sub_scores["rating_count"], 1)

    def test_high_employer_rating_improves_reliability_and_is_explained(self):
        application = self._create_completed_application()
        score_before, _ = services.calculate_employer_reliability_score(self.employer)
        submit_rating(application, reviewer=self.worker_user, score=5)
        score_after, sub_scores = services.calculate_employer_reliability_score(self.employer)
        result = services.evaluate_match(self.worker, self.job, direction="worker_to_job")

        self.assertGreater(score_after, score_before)
        self.assertEqual(sub_scores["average_rating"], 5.0)
        self.assertIn("Employer has completed 1 job through Karmasheel.", result.reasons)
        self.assertIn("Employer has an average rating of 5/5 from 1 rating.", result.reasons)


class FinalMatchScoreTests(TestCase):
    def test_final_score_is_weighted_combination(self):
        score = services.calculate_final_match_score(
            skill_score=100, distance_score=100, experience_score=100, availability_score=100, reliability_score=100
        )
        self.assertEqual(score, 100.0)

    def test_final_score_of_all_zero_components_is_zero(self):
        score = services.calculate_final_match_score(
            skill_score=0, distance_score=0, experience_score=0, availability_score=0, reliability_score=0
        )
        self.assertEqual(score, 0.0)

    def test_missing_distance_uses_neutral_component(self):
        score = services.calculate_final_match_score(
            skill_score=0, distance_score=None, experience_score=0, availability_score=0, reliability_score=0
        )
        weights = settings.RECOMMENDATION_SETTINGS
        expected = weights["FINAL_WEIGHT_DISTANCE"] * weights["NEUTRAL_SCORE_WHEN_UNKNOWN"]
        self.assertEqual(score, round(expected, 2))


class EvaluateMatchExplanationTests(RecommendationServiceTestsBase):
    def test_worker_to_job_reports_matched_and_missing_skills_and_reasons(self):
        result = services.evaluate_match(self.worker, self.job, direction="worker_to_job")

        self.assertIn("Matches 1 of 1 required skills.", result.reasons)
        self.assertIn("Also matches 1 preferred skills.", result.reasons)
        self.assertIn("Meets the required experience.", result.reasons)
        self.assertIn("Available for work.", result.reasons)
        self.assertIn("Job wage meets the worker's expected wage.", result.reasons)
        self.assertIn("Employer profile is verified.", result.reasons)
        self.assertEqual(result.warnings, [])

    def test_missing_required_skill_produces_warning(self):
        self.worker.skills.set([self.breaker_skill])
        result = services.evaluate_match(self.worker, self.job, direction="worker_to_job")
        self.assertTrue(any("Missing required skill" in warning for warning in result.warnings))

    def test_insufficient_experience_produces_warning(self):
        self.worker.experience_years = 0
        result = services.evaluate_match(self.worker, self.job, direction="worker_to_job")
        self.assertTrue(any("less experience" in warning for warning in result.warnings))

    def test_missing_worker_location_produces_warning_not_crash(self):
        self.worker.latitude = None
        self.worker.longitude = None
        result = services.evaluate_match(self.worker, self.job, direction="worker_to_job")
        self.assertIsNone(result.distance_km)
        self.assertIn("Worker location is unavailable; distance could not be calculated.", result.warnings)

    def test_wage_below_expectation_produces_warning(self):
        self.job.wage_amount = Decimal("500.00")
        result = services.evaluate_match(self.worker, self.job, direction="worker_to_job")
        self.assertIn("Offered wage is below the worker's expected wage.", result.warnings)

    def test_outside_travel_radius_produces_warning(self):
        self.job.latitude = Decimal("28.500000")
        self.job.longitude = Decimal("86.500000")
        result = services.evaluate_match(self.worker, self.job, direction="worker_to_job")
        self.assertIn("Worker is outside the preferred travel radius.", result.warnings)

    def test_job_to_worker_uses_worker_verification_reason(self):
        result = services.evaluate_match(self.worker, self.job, direction="job_to_worker")
        self.assertIn("Worker's contact is verified.", result.reasons)

    def test_reciprocal_score_does_not_equal_final_score_in_general(self):
        result = services.evaluate_match(self.worker, self.job, direction="worker_to_job")
        # Not a hard mathematical law, but for this deliberately mixed
        # fixture the two formulas should diverge, proving reciprocal
        # isn't silently just a re-derivation of the final score.
        self.job.wage_amount = Decimal("400.00")
        divergent_result = services.evaluate_match(self.worker, self.job, direction="worker_to_job")
        self.assertNotEqual(divergent_result.final_score, divergent_result.reciprocal_preference_score)


# ---------------------------------------------------------------------
# Ranking-behavior tests
# ---------------------------------------------------------------------

class RankingBehaviorTests(RecommendationServiceTestsBase):
    def setUp(self):
        super().setUp()
        self.weak_worker_user = User.objects.create_user(
            username="weakworker",
            phone_number="9800000003",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.weak_worker = WorkerProfile.objects.create(
            user=self.weak_worker_user,
            latitude=self.worker.latitude,
            longitude=self.worker.longitude,
            experience_years=0,
        )

    def test_stronger_skill_match_ranks_higher_when_other_factors_equal(self):
        strong = services.evaluate_match(self.worker, self.job, direction="worker_to_job")
        weak = services.evaluate_match(self.weak_worker, self.job, direction="worker_to_job")
        self.assertGreater(strong.skill.skill_score, weak.skill.skill_score)
        self.assertGreater(strong.final_score, weak.final_score)

    def test_closer_worker_ranks_higher_when_skills_equal(self):
        self.weak_worker.skills.set([self.wiring_skill, self.breaker_skill])
        self.weak_worker.experience_years = self.worker.experience_years
        self.weak_worker.expected_wage = self.worker.expected_wage
        self.weak_worker.preferred_travel_radius_km = self.worker.preferred_travel_radius_km

        far_worker = self.weak_worker
        far_worker.latitude = Decimal("28.500000")
        far_worker.longitude = Decimal("86.500000")
        far_worker.save()

        near_result = services.evaluate_match(self.worker, self.job, direction="worker_to_job")
        far_result = services.evaluate_match(far_worker, self.job, direction="worker_to_job")

        self.assertLess(near_result.distance_km, far_result.distance_km)
        self.assertGreater(near_result.final_score, far_result.final_score)

    def test_sufficient_experience_improves_ranking(self):
        under_experienced = services.evaluate_match(self.weak_worker, self.job, direction="worker_to_job")

        self.weak_worker.experience_years = self.job.required_experience_years
        sufficiently_experienced = services.evaluate_match(self.weak_worker, self.job, direction="worker_to_job")

        self.assertGreater(sufficiently_experienced.experience_score, under_experienced.experience_score)
        self.assertGreaterEqual(sufficiently_experienced.final_score, under_experienced.final_score)

    def test_deterministic_secondary_ordering_for_tied_scores(self):
        results = [
            services.evaluate_match(self.worker, self.job, direction="worker_to_job"),
            services.evaluate_match(self.weak_worker, self.job, direction="worker_to_job"),
        ]
        # Force a tie to exercise the sort's secondary key.
        for result in results:
            result.final_score = 50.0

        results.sort(key=lambda result: (-result.final_score, result.worker.id))
        self.assertEqual([r.worker.id for r in results], sorted(r.worker.id for r in results))

    def test_closed_jobs_are_excluded_from_worker_recommendations(self):
        self.job.status = JobPost.Status.CLOSED
        self.job.save()
        jobs = services.filter_candidate_jobs_for_worker(self.worker)
        self.assertNotIn(self.job, jobs)

    def test_expired_jobs_are_excluded_from_worker_recommendations(self):
        from django.utils import timezone

        self.job.application_deadline = timezone.now() - timezone.timedelta(days=1)
        self.job.save()
        jobs = services.filter_candidate_jobs_for_worker(self.worker)
        self.assertNotIn(self.job, jobs)

    def test_unavailable_worker_gets_no_job_recommendations(self):
        self.worker.is_available = False
        self.worker.save()
        jobs = services.filter_candidate_jobs_for_worker(self.worker)
        self.assertEqual(jobs, [])

    def test_job_already_applied_to_is_excluded_from_worker_recommendations(self):
        Application.objects.create(worker=self.worker, job=self.job)

        jobs = services.filter_candidate_jobs_for_worker(self.worker)

        self.assertNotIn(self.job, jobs)

    def test_applied_job_is_excluded_even_when_worker_has_no_skills(self):
        self.worker.skills.clear()
        Application.objects.create(worker=self.worker, job=self.job)

        jobs = services.filter_candidate_jobs_for_worker(self.worker)

        self.assertNotIn(self.job, jobs)

    def test_unavailable_worker_excluded_from_job_candidates(self):
        from jobs.services import filter_candidate_workers_for_job

        self.worker.is_available = False
        self.worker.save()
        candidates = filter_candidate_workers_for_job(self.job)
        self.assertNotIn(self.worker, candidates)


# ---------------------------------------------------------------------
# Endpoint and permission tests
# ---------------------------------------------------------------------

class RecommendationEndpointTestsBase(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Construction & Repair")
        self.subcategory = Subcategory.objects.create(category=self.category, name="Electrical")

        self.wiring_skill = SkillTag.objects.create(subcategory=self.subcategory, name="House Wiring")
        self.breaker_skill = SkillTag.objects.create(subcategory=self.subcategory, name="Circuit Breaker Installation")

        self.employer_user = User.objects.create_user(
            username="employer1",
            phone_number="9800000001",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer = EmployerProfile.objects.create(
            user=self.employer_user,
            organization_name="Kathmandu Electrical Co",
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
        )

        self.other_employer_user = User.objects.create_user(
            username="employer2",
            phone_number="9800000004",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.other_employer = EmployerProfile.objects.create(
            user=self.other_employer_user,
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
        )

        self.worker_user = User.objects.create_user(
            username="worker1",
            phone_number="9800000002",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
            is_contact_verified=True,
        )
        self.worker = WorkerProfile.objects.create(
            user=self.worker_user,
            latitude=Decimal("27.700000"),
            longitude=Decimal("85.330000"),
            experience_years=3,
            expected_wage=Decimal("1000.00"),
            preferred_travel_radius_km=15,
        )
        self.worker.skills.set([self.wiring_skill])

        self.job = make_job(
            self.employer,
            self.category,
            self.subcategory,
            latitude=Decimal("27.710000"),
            longitude=Decimal("85.340000"),
        )
        self.job.required_skills.set([self.wiring_skill])
        self.job.preferred_skills.set([self.breaker_skill])

    def authenticate_as(self, user, password):
        login_response = self.client.post(
            reverse("accounts:login"),
            {"username": user.username, "password": password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")


class WorkerJobRecommendationEndpointTests(RecommendationEndpointTestsBase):
    def test_worker_receives_ranked_jobs_with_explanation(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(reverse("recommendations:worker_job_recommendations"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]
        self.assertIn("final_score", item)
        self.assertIn("skill", item)
        self.assertIn("reasons", item)
        self.assertIn("warnings", item)
        self.assertEqual(item["job"]["id"], self.job.id)

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(reverse("recommendations:worker_job_recommendations"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_employer_cannot_access_worker_recommendation_endpoint(self):
        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.get(reverse("recommendations:worker_job_recommendations"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_worker_profile_is_handled_safely(self):
        profileless_user = User.objects.create_user(
            username="noprofileworker",
            phone_number="9800000005",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.authenticate_as(profileless_user, "WorkerPassword123!")
        response = self.client.get(reverse("recommendations:worker_job_recommendations"))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_closed_job_is_excluded(self):
        self.job.status = JobPost.Status.CLOSED
        self.job.save()
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(reverse("recommendations:worker_job_recommendations"))
        self.assertEqual(response.data, [])

    def test_job_already_applied_to_is_excluded(self):
        Application.objects.create(worker=self.worker, job=self.job)
        self.authenticate_as(self.worker_user, "WorkerPassword123!")

        response = self.client.get(
            reverse("recommendations:worker_job_recommendations")
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_limit_parameter_restricts_result_count(self):
        make_job(
            self.employer, self.category, self.subcategory, title="Second job",
            latitude=Decimal("27.710000"), longitude=Decimal("85.340000"),
        )
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(reverse("recommendations:worker_job_recommendations"), {"limit": 1})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_invalid_limit_is_rejected(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(reverse("recommendations:worker_job_recommendations"), {"limit": "abc"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class JobWorkerRecommendationEndpointTests(RecommendationEndpointTestsBase):
    def test_verified_job_owner_receives_ranked_workers(self):
        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.get(
            reverse("recommendations:job_worker_recommendations", kwargs={"job_id": self.job.id})
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        item = response.data[0]
        self.assertEqual(item["worker"]["id"], self.worker.id)
        self.assertIn("final_score", item)
        self.assertIn("reasons", item)

    def test_sensitive_worker_information_is_not_exposed(self):
        self.worker.address = "Exact private home address"
        self.worker.save(update_fields=["address"])
        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.get(
            reverse("recommendations:job_worker_recommendations", kwargs={"job_id": self.job.id})
        )
        worker_payload = response.data[0]["worker"]
        self.assertNotIn("phone_number", worker_payload)
        self.assertNotIn("address", worker_payload)
        self.assertNotIn("latitude", worker_payload)
        self.assertNotIn("longitude", worker_payload)
        self.assertNotIn("Exact private home address", str(worker_payload))
        self.assertIn("distance_km", response.data[0])

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(
            reverse("recommendations:job_worker_recommendations", kwargs={"job_id": self.job.id})
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_worker_cannot_access_job_worker_recommendation_endpoint(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(
            reverse("recommendations:job_worker_recommendations", kwargs={"job_id": self.job.id})
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_employer_cannot_access_another_employers_job_recommendations(self):
        self.authenticate_as(self.other_employer_user, "EmployerPassword123!")
        response = self.client.get(
            reverse("recommendations:job_worker_recommendations", kwargs={"job_id": self.job.id})
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unverified_employer_is_rejected(self):
        unverified_user = User.objects.create_user(
            username="unverifiedemployer",
            phone_number="9800000006",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        EmployerProfile.objects.create(user=unverified_user)
        self.authenticate_as(unverified_user, "EmployerPassword123!")
        response = self.client.get(
            reverse("recommendations:job_worker_recommendations", kwargs={"job_id": self.job.id})
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_job_returns_404(self):
        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.get(
            reverse("recommendations:job_worker_recommendations", kwargs={"job_id": 999999})
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------
# Week 5 - opportunity advisory
# ---------------------------------------------------------------------

class NearMissScoreTests(TestCase):
    """Boundary tests for the configurable inclusive near-miss range."""

    def test_score_below_min_is_excluded(self):
        self.assertFalse(advisory.is_near_miss_score(39.99))

    def test_score_at_min_is_included(self):
        self.assertTrue(advisory.is_near_miss_score(40.0))

    def test_score_at_max_is_included(self):
        self.assertTrue(advisory.is_near_miss_score(75.0))

    def test_score_above_max_is_excluded(self):
        self.assertFalse(advisory.is_near_miss_score(75.01))

    def test_midpoint_is_included(self):
        self.assertTrue(advisory.is_near_miss_score(57.5))

    @override_settings(
        RECOMMENDATION_SETTINGS={
            **settings.RECOMMENDATION_SETTINGS,
            "NEAR_MISS_MIN_SCORE": 50.0,
            "NEAR_MISS_MAX_SCORE": 60.0,
        }
    )
    def test_range_is_configurable(self):
        self.assertFalse(advisory.is_near_miss_score(45.0))
        self.assertTrue(advisory.is_near_miss_score(50.0))
        self.assertTrue(advisory.is_near_miss_score(60.0))
        self.assertFalse(advisory.is_near_miss_score(65.0))


class MissingSkillRankingTests(TestCase):
    def setUp(self):
        category = Category.objects.create(name="Construction & Repair")
        subcategory = Subcategory.objects.create(category=category, name="Electrical")
        self.skill_a = SkillTag.objects.create(subcategory=subcategory, name="Skill A")
        self.skill_b = SkillTag.objects.create(subcategory=subcategory, name="Skill B")
        self.skill_c = SkillTag.objects.create(subcategory=subcategory, name="Skill C")

    def _result(self, job_id, *, matched=(), missing=()):
        skill_result = SimpleNamespace(
            matched_required_skills=list(matched), missing_required_skills=list(missing)
        )
        job = SimpleNamespace(id=job_id)
        return SimpleNamespace(job=job, skill=skill_result)

    def test_no_near_miss_jobs_yields_no_missing_skills(self):
        self.assertEqual(advisory.rank_missing_skills([]), [])

    def test_skill_never_missing_is_excluded(self):
        results = [self._result(1, matched=[self.skill_c], missing=[])]
        self.assertEqual(advisory.rank_missing_skills(results), [])

    def test_ranks_by_missing_frequency_first(self):
        # skill_a missing from 2 jobs, skill_c missing from 1 job.
        results = [
            self._result(1, missing=[self.skill_a]),
            self._result(2, missing=[self.skill_a]),
            self._result(3, missing=[self.skill_c]),
        ]
        ranked = advisory.rank_missing_skills(results)
        self.assertEqual([entry.skill for entry in ranked], [self.skill_a, self.skill_c])
        self.assertEqual(ranked[0].missing_frequency, 2)
        self.assertEqual(ranked[1].missing_frequency, 1)

    def test_required_frequency_breaks_ties_on_missing_frequency(self):
        # skill_a and skill_b are both missing from exactly 2 jobs, but
        # skill_b is additionally *required* (and already matched) in a
        # third job, so it represents broader demand and should rank first.
        results = [
            self._result(1, missing=[self.skill_a, self.skill_b]),
            self._result(2, missing=[self.skill_a]),
            self._result(3, missing=[self.skill_b]),
            self._result(4, matched=[self.skill_b]),
        ]
        ranked = advisory.rank_missing_skills(results)
        self.assertEqual(ranked[0].skill, self.skill_b)
        self.assertEqual(ranked[0].missing_frequency, 2)
        self.assertEqual(ranked[0].required_frequency, 3)
        self.assertEqual(ranked[1].skill, self.skill_a)
        self.assertEqual(ranked[1].missing_frequency, 2)
        self.assertEqual(ranked[1].required_frequency, 2)

    def test_full_tie_breaks_deterministically_by_skill_id(self):
        results = [
            self._result(1, missing=[self.skill_b]),
            self._result(2, missing=[self.skill_a]),
        ]
        ranked = advisory.rank_missing_skills(results)
        expected_order = sorted([self.skill_a, self.skill_b], key=lambda skill: skill.id)
        self.assertEqual([entry.skill for entry in ranked], expected_order)

    def test_job_ids_are_tracked_per_skill(self):
        results = [
            self._result(1, missing=[self.skill_a]),
            self._result(2, missing=[self.skill_a]),
        ]
        ranked = advisory.rank_missing_skills(results)
        self.assertEqual(ranked[0].job_ids, [1, 2])

    def test_suggestion_has_deterministic_plain_english_reason(self):
        ranked = advisory.rank_missing_skills(
            [
                self._result(1, missing=[self.skill_a]),
                self._result(2, missing=[self.skill_a]),
            ]
        )

        self.assertEqual(
            ranked[0].reason,
            "Learning Skill A could strengthen your match for 2 near-miss jobs that require it.",
        )

    def test_single_job_suggestion_uses_singular_grammar(self):
        ranked = advisory.rank_missing_skills(
            [self._result(1, missing=[self.skill_a])]
        )

        self.assertEqual(
            ranked[0].reason,
            "Learning Skill A could strengthen your match for 1 near-miss job that requires it.",
        )

    def test_opportunity_advisory_caps_suggestions_at_three(self):
        skill_d = SkillTag.objects.create(
            subcategory=self.skill_a.subcategory,
            name="Skill D",
        )
        near_misses = [
            self._result(1, missing=[self.skill_a]),
            self._result(2, missing=[self.skill_b]),
            self._result(3, missing=[self.skill_c]),
            self._result(4, missing=[skill_d]),
        ]

        with patch.object(advisory, "find_near_miss_jobs", return_value=near_misses):
            result = advisory.build_opportunity_advisory(SimpleNamespace())

        self.assertEqual(len(result.missing_skills), advisory.MAX_SUGGESTED_SKILLS)
        self.assertEqual(
            [entry.skill for entry in result.missing_skills],
            [self.skill_a, self.skill_b, self.skill_c],
        )


class OpportunityAdvisoryEndpointTests(RecommendationEndpointTestsBase):
    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(reverse("recommendations:opportunity_advisory"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_employer_cannot_access_endpoint(self):
        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.get(reverse("recommendations:opportunity_advisory"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_worker_profile_returns_404(self):
        profileless_user = User.objects.create_user(
            username="noprofileworker3",
            phone_number="9800000007",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.authenticate_as(profileless_user, "WorkerPassword123!")
        response = self.client.get(reverse("recommendations:opportunity_advisory"))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_near_miss_job_and_its_missing_skill_are_surfaced(self):
        # Add a second required skill the worker lacks, so self.job is no
        # longer a full match. The near-miss window is pinned exactly to
        # this job's real, formula-computed score so the test exercises
        # actual boundary inclusion rather than a guessed range.
        advanced_skill = SkillTag.objects.create(subcategory=self.subcategory, name="Advanced Panel Work")
        self.job.required_skills.add(advanced_skill)

        score = services.evaluate_match(self.worker, self.job, direction="worker_to_job").final_score

        with override_settings(
            RECOMMENDATION_SETTINGS={
                **settings.RECOMMENDATION_SETTINGS,
                "NEAR_MISS_MIN_SCORE": score,
                "NEAR_MISS_MAX_SCORE": score,
            }
        ):
            self.authenticate_as(self.worker_user, "WorkerPassword123!")
            response = self.client.get(reverse("recommendations:opportunity_advisory"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        job_ids = [entry["job"]["id"] for entry in response.data["near_miss_jobs"]]
        self.assertIn(self.job.id, job_ids)

        missing_skill_ids = [entry["skill"]["id"] for entry in response.data["missing_skills"]]
        self.assertIn(advanced_skill.id, missing_skill_ids)
        advanced_suggestion = next(
            entry
            for entry in response.data["missing_skills"]
            if entry["skill"]["id"] == advanced_skill.id
        )
        self.assertIn("Learning Advanced Panel Work", advanced_suggestion["reason"])

    def test_job_already_applied_to_is_excluded_from_advisory(self):
        advanced_skill = SkillTag.objects.create(
            subcategory=self.subcategory,
            name="Applied Job Skill",
        )
        self.job.required_skills.add(advanced_skill)
        score = services.evaluate_match(
            self.worker,
            self.job,
            direction="worker_to_job",
        ).final_score
        Application.objects.create(worker=self.worker, job=self.job)

        with override_settings(
            RECOMMENDATION_SETTINGS={
                **settings.RECOMMENDATION_SETTINGS,
                "NEAR_MISS_MIN_SCORE": score,
                "NEAR_MISS_MAX_SCORE": score,
            }
        ):
            self.authenticate_as(self.worker_user, "WorkerPassword123!")
            response = self.client.get(
                reverse("recommendations:opportunity_advisory")
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["near_miss_jobs"], [])
        self.assertEqual(response.data["missing_skills"], [])

    def test_job_scoring_just_below_the_window_is_excluded(self):
        advanced_skill = SkillTag.objects.create(subcategory=self.subcategory, name="Advanced Panel Work")
        self.job.required_skills.add(advanced_skill)

        score = services.evaluate_match(self.worker, self.job, direction="worker_to_job").final_score

        with override_settings(
            RECOMMENDATION_SETTINGS={
                **settings.RECOMMENDATION_SETTINGS,
                "NEAR_MISS_MIN_SCORE": score + 0.01,
                "NEAR_MISS_MAX_SCORE": 100.0,
            }
        ):
            self.authenticate_as(self.worker_user, "WorkerPassword123!")
            response = self.client.get(reverse("recommendations:opportunity_advisory"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["near_miss_jobs"], [])
        self.assertEqual(response.data["missing_skills"], [])

    def test_full_match_job_with_default_thresholds_is_not_a_near_miss(self):
        # self.job's only required skill (wiring_skill) is already on the
        # worker, so with the default 40-75 window it should score above
        # the near-miss range and not appear as a near miss.
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(reverse("recommendations:opportunity_advisory"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        job_ids = [entry["job"]["id"] for entry in response.data["near_miss_jobs"]]
        self.assertNotIn(self.job.id, job_ids)
