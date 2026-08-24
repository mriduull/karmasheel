from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from applications.models import Application
from applications.services import submit_rating
from profiles.models import EmployerProfile, WorkerProfile
from taxonomy.models import (
    Category,
    SkillAlias,
    SkillTag,
    Subcategory,
    UnmatchedSkillTerm,
)

from .models import JobPost
from .serializers import JobPostSerializer
from .services import haversine_distance_km

User = get_user_model()


class HaversineDistanceTests(TestCase):
    def test_distance_between_identical_points_is_zero(self):
        self.assertAlmostEqual(haversine_distance_km(27.7172, 85.3240, 27.7172, 85.3240), 0.0, places=6)

    def test_distance_between_kathmandu_and_pokhara_is_approximately_correct(self):
        # Kathmandu (27.7172, 85.3240) to Pokhara (28.2096, 83.9856) is
        # roughly 142 km as the crow flies.
        distance = haversine_distance_km(27.7172, 85.3240, 28.2096, 83.9856)
        self.assertAlmostEqual(distance, 142, delta=5)

    def test_distance_accepts_decimal_inputs(self):
        distance = haversine_distance_km(Decimal("27.700000"), Decimal("85.300000"), Decimal("27.710000"), Decimal("85.310000"))
        self.assertGreater(distance, 0)


class JobPostAPITestsBase(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Construction & Repair")
        self.subcategory = Subcategory.objects.create(category=self.category, name="Electrical")
        self.other_subcategory = Subcategory.objects.create(category=self.category, name="Plumbing")

        self.skill = SkillTag.objects.create(subcategory=self.subcategory, name="House Wiring")
        SkillAlias.objects.create(skill=self.skill, phrase="ghar wiring", language=SkillAlias.Language.NE_ROMANIZED)

        self.preferred_skill = SkillTag.objects.create(subcategory=self.subcategory, name="Circuit Breaker Installation")

        self.verified_employer_user = User.objects.create_user(
            username="verifiedemployer",
            phone_number="9800000001",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.verified_employer = EmployerProfile.objects.create(
            user=self.verified_employer_user,
            organization_name="Kathmandu Electrical Co",
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
        )

        self.unverified_employer_user = User.objects.create_user(
            username="unverifiedemployer",
            phone_number="9800000002",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.unverified_employer = EmployerProfile.objects.create(user=self.unverified_employer_user)

        self.worker_user = User.objects.create_user(
            username="worker1",
            phone_number="9800000003",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.worker_profile = WorkerProfile.objects.create(user=self.worker_user)

        self.valid_payload = {
            "title": "House wiring for new build",
            "category": self.category.id,
            "subcategory": self.subcategory.id,
            "description": "Wire a two-storey residential building.",
            "address": "Baneshwor, Kathmandu",
            "latitude": "27.700000",
            "longitude": "85.330000",
            "required_experience_years": 2,
            "wage_type": JobPost.WageType.DAILY,
            "wage_amount": "1500.00",
            "work_type": JobPost.WorkType.ONE_TIME,
            "number_of_workers_required": 2,
            "required_skills_input": ["ghar wiring"],
            "preferred_skills_input": ["Circuit Breaker Installation"],
        }

    def authenticate_as(self, user, password):
        login_response = self.client.post(
            reverse("accounts:login"),
            {"username": user.username, "password": password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")

    def create_job(self, employer, **overrides):
        payload = {**self.valid_payload, **overrides}
        payload.pop("required_skills_input", None)
        payload.pop("preferred_skills_input", None)

        return JobPost.objects.create(
            employer=employer,
            title=payload["title"],
            category_id=payload["category"],
            subcategory_id=payload["subcategory"],
            description=payload["description"],
            address=payload["address"],
            latitude=Decimal(payload["latitude"]),
            longitude=Decimal(payload["longitude"]),
            required_experience_years=payload["required_experience_years"],
            wage_type=payload["wage_type"],
            wage_amount=Decimal(payload["wage_amount"]),
            work_type=payload["work_type"],
            number_of_workers_required=payload["number_of_workers_required"],
            status=overrides.get("status", JobPost.Status.ACTIVE),
        )


class JobPostCreationTests(JobPostAPITestsBase):
    def setUp(self):
        super().setUp()
        self.list_create_url = reverse("jobs:list_create")

    def test_verified_employer_can_create_job(self):
        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        response = self.client.post(self.list_create_url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(JobPost.objects.count(), 1)
        job = JobPost.objects.get()
        self.assertEqual(job.employer, self.verified_employer)

    def test_unverified_employer_cannot_create_job(self):
        self.authenticate_as(self.unverified_employer_user, "EmployerPassword123!")
        response = self.client.post(self.list_create_url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(JobPost.objects.count(), 0)

    def test_worker_cannot_create_job(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.post(self.list_create_url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_create_job(self):
        response = self.client.post(self.list_create_url, self.valid_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_required_and_preferred_skills_are_normalized_and_kept_separate(self):
        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        response = self.client.post(self.list_create_url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        job = JobPost.objects.get()

        # "ghar wiring" resolves via exact-alias match to House Wiring.
        self.assertEqual(list(job.required_skills.all()), [self.skill])
        self.assertEqual(list(job.preferred_skills.all()), [self.preferred_skill])

        required_ids = set(job.required_skills.values_list("id", flat=True))
        preferred_ids = set(job.preferred_skills.values_list("id", flat=True))
        self.assertEqual(required_ids & preferred_ids, set())

    def test_unmatched_skill_phrase_is_reported_and_not_stored_as_a_skill(self):
        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        payload = {**self.valid_payload, "required_skills_input": ["completely unrelated gibberish"]}
        response = self.client.post(self.list_create_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["unmatched_required_terms"], ["completely unrelated gibberish"])
        job = JobPost.objects.get()
        self.assertEqual(job.required_skills.count(), 0)

    def test_subcategory_must_belong_to_category(self):
        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        other_category = Category.objects.create(name="Domestic & Local Services")
        payload = {**self.valid_payload, "category": other_category.id}
        response = self.client.post(self.list_create_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("subcategory", response.data)

    def test_job_rejects_skill_from_another_subcategory(self):
        plumbing_skill = SkillTag.objects.create(
            subcategory=self.other_subcategory,
            name="Pipe Fitting",
        )
        self.authenticate_as(
            self.verified_employer_user, "EmployerPassword123!"
        )
        payload = {
            **self.valid_payload,
            "required_skills_input": [
                plumbing_skill.name,
                "totally unknown rejected-request skill",
            ],
        }

        response = self.client.post(
            self.list_create_url, payload, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("required_skills_input", response.data)
        self.assertEqual(JobPost.objects.count(), 0)
        self.assertFalse(
            UnmatchedSkillTerm.objects.filter(
                normalized_term="totally unknown rejected request skill"
            ).exists()
        )

    def test_job_rejects_past_application_deadline_on_create(self):
        self.authenticate_as(
            self.verified_employer_user, "EmployerPassword123!"
        )
        payload = {
            **self.valid_payload,
            "application_deadline": (
                timezone.now() - timedelta(minutes=1)
            ).isoformat(),
        }

        response = self.client.post(
            self.list_create_url, payload, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("application_deadline", response.data)
        self.assertEqual(JobPost.objects.count(), 0)


class JobPostListDetailTests(JobPostAPITestsBase):
    def setUp(self):
        super().setUp()
        self.list_create_url = reverse("jobs:list_create")
        self.own_job = self.create_job(self.verified_employer)
        self.other_job = self.create_job(self.unverified_employer)

    def detail_url(self, job):
        return reverse("jobs:detail", args=[job.id])

    def test_employer_list_only_returns_own_jobs(self):
        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        response = self.client.get(self.list_create_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        job_ids = {job["id"] for job in response.data}
        self.assertEqual(job_ids, {self.own_job.id})

    def test_owner_can_update_job(self):
        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        response = self.client.patch(self.detail_url(self.own_job), {"title": "Updated title"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.own_job.refresh_from_db()
        self.assertEqual(self.own_job.title, "Updated title")

    def test_non_owner_employer_cannot_update_job(self):
        self.authenticate_as(self.unverified_employer_user, "EmployerPassword123!")
        response = self.client.patch(self.detail_url(self.own_job), {"title": "Hijacked"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.own_job.refresh_from_db()
        self.assertNotEqual(self.own_job.title, "Hijacked")

    def test_owner_can_delete_job(self):
        job_id = self.own_job.id
        self.authenticate_as(
            self.verified_employer_user, "EmployerPassword123!"
        )

        response = self.client.delete(self.detail_url(self.own_job))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(JobPost.objects.filter(pk=job_id).exists())

    def test_owner_cannot_delete_job_with_application_and_rating_history(self):
        application = Application.objects.create(
            worker=self.worker_profile,
            job=self.own_job,
            status=Application.Status.COMPLETED,
        )
        rating = submit_rating(
            application,
            reviewer=self.verified_employer_user,
            score=5,
        )
        self.authenticate_as(
            self.verified_employer_user,
            "EmployerPassword123!",
        )

        response = self.client.delete(self.detail_url(self.own_job))

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("application history", response.data["detail"])
        self.assertTrue(JobPost.objects.filter(pk=self.own_job.pk).exists())
        self.assertTrue(Application.objects.filter(pk=application.pk).exists())
        self.assertTrue(type(rating).objects.filter(pk=rating.pk).exists())

    def test_non_owner_employer_cannot_delete_job(self):
        self.authenticate_as(
            self.unverified_employer_user, "EmployerPassword123!"
        )

        response = self.client.delete(self.detail_url(self.own_job))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(JobPost.objects.filter(pk=self.own_job.pk).exists())

    def test_delete_missing_job_returns_404(self):
        missing_url = self.detail_url(self.own_job)
        self.own_job.delete()
        self.authenticate_as(
            self.verified_employer_user, "EmployerPassword123!"
        )

        response = self.client.delete(missing_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_worker_cannot_delete_job(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")

        response = self.client.delete(self.detail_url(self.own_job))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(JobPost.objects.filter(pk=self.own_job.pk).exists())

    def test_owner_can_close_job(self):
        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        response = self.client.patch(
            self.detail_url(self.own_job), {"status": JobPost.Status.CLOSED}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.own_job.refresh_from_db()
        self.assertEqual(self.own_job.status, JobPost.Status.CLOSED)

    def test_closed_job_cannot_be_reopened(self):
        self.own_job.status = JobPost.Status.CLOSED
        self.own_job.save(update_fields=["status"])

        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        response = self.client.patch(
            self.detail_url(self.own_job), {"status": JobPost.Status.ACTIVE}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_application_deadline_cannot_be_patched_into_the_past(self):
        self.authenticate_as(
            self.verified_employer_user, "EmployerPassword123!"
        )
        response = self.client.patch(
            self.detail_url(self.own_job),
            {
                "application_deadline": (
                    timezone.now() - timedelta(minutes=1)
                ).isoformat()
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("application_deadline", response.data)

    def test_subcategory_change_requires_replacement_skills(self):
        self.own_job.required_skills.add(self.skill)
        self.authenticate_as(
            self.verified_employer_user, "EmployerPassword123!"
        )

        response = self.client.patch(
            self.detail_url(self.own_job),
            {
                "subcategory": self.other_subcategory.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("required_skills_input", response.data)

    def test_worker_can_retrieve_active_job_detail(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.detail_url(self.own_job))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.own_job.id)

    def test_closed_job_detail_hidden_from_non_owner(self):
        self.own_job.status = JobPost.Status.CLOSED
        self.own_job.save(update_fields=["status"])

        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.detail_url(self.own_job))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_closed_job_detail_visible_to_owner(self):
        self.own_job.status = JobPost.Status.CLOSED
        self.own_job.save(update_fields=["status"])

        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        response = self.client.get(self.detail_url(self.own_job))

        self.assertEqual(response.status_code, status.HTTP_200_OK)


class ActiveJobBrowseFilterTests(JobPostAPITestsBase):
    def setUp(self):
        super().setUp()
        self.browse_url = reverse("jobs:browse")

        self.worker_profile.latitude = Decimal("27.700000")
        self.worker_profile.longitude = Decimal("85.330000")
        self.worker_profile.preferred_travel_radius_km = 20
        self.worker_profile.save()

        # Nearby, matching category, active.
        self.nearby_job = self.create_job(
            self.verified_employer,
            latitude="27.710000",
            longitude="85.340000",
        )

        # Far away (roughly 148km), active.
        self.far_job = self.create_job(
            self.verified_employer,
            latitude="28.209600",
            longitude="83.985600",
        )

        # Nearby but in a different subcategory.
        self.other_subcategory_job = self.create_job(
            self.verified_employer,
            subcategory=self.other_subcategory.id,
            latitude="27.710000",
            longitude="85.340000",
        )

        # Nearby but closed.
        self.closed_job = self.create_job(
            self.verified_employer,
            latitude="27.710000",
            longitude="85.340000",
            status=JobPost.Status.CLOSED,
        )
        self.other_subcategory_job.category = self.category
        self.other_subcategory_job.save()

    def test_browse_only_returns_active_jobs_within_radius(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.browse_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        job_ids = {job["id"] for job in response.data}
        self.assertIn(self.nearby_job.id, job_ids)
        self.assertIn(self.other_subcategory_job.id, job_ids)
        self.assertNotIn(self.far_job.id, job_ids)
        self.assertNotIn(self.closed_job.id, job_ids)

    def test_browse_filters_by_subcategory(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.browse_url, {"subcategory": self.subcategory.id})

        job_ids = {job["id"] for job in response.data}
        self.assertEqual(job_ids, {self.nearby_job.id})

    def test_max_distance_km_query_param_overrides_profile_radius(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.browse_url, {"max_distance_km": 500})

        job_ids = {job["id"] for job in response.data}
        self.assertIn(self.far_job.id, job_ids)

    def test_invalid_max_distance_km_is_rejected(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.browse_url, {"max_distance_km": "not-a-number"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_authenticated_employer_can_also_browse_active_jobs(self):
        # Browse is public (AllowAny); an authenticated employer is not
        # blocked from it either, only from the owner-only endpoints.
        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        response = self.client.get(self.browse_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)


class JobCandidatesFilterTests(JobPostAPITestsBase):
    def setUp(self):
        super().setUp()
        self.job = self.create_job(self.verified_employer, latitude="27.700000", longitude="85.330000")
        self.job.required_skills.add(self.skill)

        self.worker_profile.skills.add(self.skill)
        self.worker_profile.is_available = True
        self.worker_profile.latitude = Decimal("27.710000")
        self.worker_profile.longitude = Decimal("85.340000")
        self.worker_profile.preferred_travel_radius_km = 20
        self.worker_profile.save()

        unavailable_user = User.objects.create_user(
            username="worker2",
            phone_number="9800000004",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.unavailable_worker = WorkerProfile.objects.create(
            user=unavailable_user, is_available=False
        )
        self.unavailable_worker.skills.add(self.skill)

        other_subcategory_skill = SkillTag.objects.create(subcategory=self.other_subcategory, name="Pipe Fitting")

        wrong_skill_user = User.objects.create_user(
            username="worker3",
            phone_number="9800000005",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.wrong_skill_worker = WorkerProfile.objects.create(user=wrong_skill_user, is_available=True)
        self.wrong_skill_worker.skills.add(other_subcategory_skill)

        far_user = User.objects.create_user(
            username="worker4",
            phone_number="9800000006",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.far_worker = WorkerProfile.objects.create(
            user=far_user,
            is_available=True,
            latitude=Decimal("28.209600"),
            longitude=Decimal("83.985600"),
            preferred_travel_radius_km=5,
        )
        self.far_worker.skills.add(self.skill)

        self.candidates_url = reverse("jobs:candidates", args=[self.job.id])

    def test_owner_sees_available_matching_nearby_workers_only(self):
        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        response = self.client.get(self.candidates_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        worker_ids = {worker["id"] for worker in response.data}

        self.assertIn(self.worker_profile.id, worker_ids)
        self.assertNotIn(self.unavailable_worker.id, worker_ids)
        self.assertNotIn(self.wrong_skill_worker.id, worker_ids)
        self.assertNotIn(self.far_worker.id, worker_ids)

    def test_candidate_response_does_not_expose_precise_worker_location(self):
        self.worker_profile.address = "Exact private home address"
        self.worker_profile.save(update_fields=["address"])
        self.authenticate_as(
            self.verified_employer_user,
            "EmployerPassword123!",
        )

        response = self.client.get(self.candidates_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        candidate = next(
            item for item in response.data if item["id"] == self.worker_profile.id
        )
        self.assertNotIn("address", candidate)
        self.assertNotIn("latitude", candidate)
        self.assertNotIn("longitude", candidate)
        self.assertNotIn("Exact private home address", str(candidate))

    def test_owner_loses_candidate_access_when_verification_is_revoked(self):
        self.verified_employer.verification_status = (
            EmployerProfile.VerificationStatus.REJECTED
        )
        self.verified_employer.save(update_fields=["verification_status"])
        self.authenticate_as(
            self.verified_employer_user,
            "EmployerPassword123!",
        )

        response = self.client.get(self.candidates_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_explicit_distance_filter_excludes_worker_without_coordinates(self):
        no_location_user = User.objects.create_user(
            username="worker-without-location",
            phone_number="9800000007",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        no_location_worker = WorkerProfile.objects.create(
            user=no_location_user,
            is_available=True,
        )
        no_location_worker.skills.add(self.skill)
        self.authenticate_as(
            self.verified_employer_user, "EmployerPassword123!"
        )

        response = self.client.get(
            self.candidates_url, {"max_distance_km": 20}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        worker_ids = {worker["id"] for worker in response.data}
        self.assertNotIn(no_location_worker.id, worker_ids)

    def test_non_owner_employer_cannot_view_candidates(self):
        # Keep this account verified so the request reaches the ownership
        # check rather than failing the endpoint-wide verification boundary.
        self.unverified_employer.verification_status = (
            EmployerProfile.VerificationStatus.VERIFIED
        )
        self.unverified_employer.save(update_fields=["verification_status"])
        self.authenticate_as(self.unverified_employer_user, "EmployerPassword123!")
        response = self.client.get(self.candidates_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_worker_cannot_view_candidates(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.candidates_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class PublicJobAccessTests(JobPostAPITestsBase):
    """Anonymous visitors may browse and retrieve active jobs through a
    public-safe representation, but nothing else."""

    def setUp(self):
        super().setUp()

        self.verified_employer_user.email = "employer@example.com"
        self.verified_employer_user.save(update_fields=["email"])

        self.verified_employer.pan_vat_number = "123456789"
        self.verified_employer.organization_name = "Kathmandu Electrical Co"
        self.verified_employer.save(update_fields=["pan_vat_number", "organization_name"])

        self.active_job = self.create_job(self.verified_employer)
        self.active_job.required_skills.add(self.skill)
        self.active_job.preferred_skills.add(self.preferred_skill)

        self.closed_job = self.create_job(self.verified_employer, status=JobPost.Status.CLOSED)

        self.browse_url = reverse("jobs:browse")
        self.list_create_url = reverse("jobs:list_create")

    def detail_url(self, job):
        return reverse("jobs:detail", args=[job.id])

    def test_anonymous_can_browse_active_jobs(self):
        response = self.client.get(self.browse_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        job_ids = {job["id"] for job in response.data}
        self.assertIn(self.active_job.id, job_ids)
        self.assertNotIn(self.closed_job.id, job_ids)

    def test_anonymous_can_retrieve_active_job_detail(self):
        response = self.client.get(self.detail_url(self.active_job))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.active_job.id)

    def test_anonymous_cannot_retrieve_closed_job(self):
        response = self.client.get(self.detail_url(self.closed_job))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_owner_can_still_retrieve_own_closed_job(self):
        self.authenticate_as(self.verified_employer_user, "EmployerPassword123!")
        response = self.client.get(self.detail_url(self.closed_job))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.closed_job.id)

    def test_anonymous_cannot_create_job(self):
        jobs_before = JobPost.objects.count()
        response = self.client.post(self.list_create_url, self.valid_payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(JobPost.objects.count(), jobs_before)

    def test_anonymous_cannot_update_job(self):
        response = self.client.patch(self.detail_url(self.active_job), {"title": "Hijacked"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.active_job.refresh_from_db()
        self.assertNotEqual(self.active_job.title, "Hijacked")

    def test_anonymous_cannot_delete_job(self):
        response = self.client.delete(self.detail_url(self.active_job))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(JobPost.objects.filter(pk=self.active_job.pk).exists())

    def test_anonymous_cannot_view_employer_owned_job_list(self):
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_anonymous_cannot_view_candidates(self):
        response = self.client.get(reverse("jobs:candidates", args=[self.active_job.id]))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_anonymous_cannot_apply_to_job(self):
        response = self.client.post(
            reverse("applications:list_create"), {"job": self.active_job.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_public_browse_response_excludes_sensitive_employer_fields(self):
        response = self.client.get(self.browse_url)
        job_data = next(job for job in response.data if job["id"] == self.active_job.id)

        serialized_text = str(job_data)
        self.assertNotIn(self.verified_employer_user.email, serialized_text)
        self.assertNotIn(self.verified_employer_user.phone_number, serialized_text)
        self.assertNotIn(self.verified_employer.pan_vat_number, serialized_text)
        self.assertNotIn("applications", job_data)
        self.assertNotIn("worker", job_data)

        self.assertEqual(job_data["employer_name"], "Kathmandu Electrical Co")
        self.assertEqual(job_data["employer_verification_status"], EmployerProfile.VerificationStatus.VERIFIED)

    def test_public_detail_response_excludes_sensitive_employer_fields(self):
        response = self.client.get(self.detail_url(self.active_job))

        serialized_text = str(response.data)
        self.assertNotIn(self.verified_employer_user.email, serialized_text)
        self.assertNotIn(self.verified_employer_user.phone_number, serialized_text)
        self.assertNotIn(self.verified_employer.pan_vat_number, serialized_text)

    def test_public_browse_supports_category_and_work_type_filters(self):
        other_category = Category.objects.create(name="Domestic & Local Services")
        other_subcategory = Subcategory.objects.create(category=other_category, name="Cleaning")
        unrelated_job = self.create_job(
            self.verified_employer,
            category=other_category.id,
            subcategory=other_subcategory.id,
        )

        response = self.client.get(self.browse_url, {"category": self.category.id})

        job_ids = {job["id"] for job in response.data}
        self.assertIn(self.active_job.id, job_ids)
        self.assertNotIn(unrelated_job.id, job_ids)

    def test_public_browse_with_explicit_coordinates_filters_by_distance(self):
        far_job = self.create_job(
            self.verified_employer,
            latitude="28.209600",
            longitude="83.985600",
        )

        response = self.client.get(
            self.browse_url,
            {"latitude": "27.700000", "longitude": "85.330000", "max_distance_km": 20},
        )

        job_ids = {job["id"] for job in response.data}
        self.assertIn(self.active_job.id, job_ids)
        self.assertNotIn(far_job.id, job_ids)

    def test_public_browse_without_coordinates_applies_no_distance_filter(self):
        far_job = self.create_job(
            self.verified_employer,
            latitude="28.209600",
            longitude="83.985600",
        )

        response = self.client.get(self.browse_url)

        job_ids = {job["id"] for job in response.data}
        self.assertIn(far_job.id, job_ids)

    def test_public_browse_rejects_distance_without_an_origin(self):
        response = self.client.get(
            self.browse_url, {"max_distance_km": 20}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_browse_rejects_latitude_without_longitude(self):
        response = self.client.get(self.browse_url, {"latitude": "27.7"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_browse_rejects_out_of_range_latitude(self):
        response = self.client.get(self.browse_url, {"latitude": "200", "longitude": "85.3"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_browse_rejects_non_integer_taxonomy_filters(self):
        for parameter in ("category", "subcategory"):
            with self.subTest(parameter=parameter):
                response = self.client.get(
                    self.browse_url, {parameter: "not-an-integer"}
                )
                self.assertEqual(
                    response.status_code, status.HTTP_400_BAD_REQUEST
                )

    def test_public_browse_rejects_invalid_work_type(self):
        response = self.client.get(
            self.browse_url, {"work_type": "NOT_A_WORK_TYPE"}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_browse_rejects_non_finite_numbers(self):
        for parameter in ("latitude", "longitude", "max_distance_km"):
            with self.subTest(parameter=parameter):
                query = {
                    "latitude": "27.7",
                    "longitude": "85.3",
                    "max_distance_km": "20",
                }
                query[parameter] = "nan"
                response = self.client.get(self.browse_url, query)
                self.assertEqual(
                    response.status_code, status.HTTP_400_BAD_REQUEST
                )

    def test_authenticated_worker_browse_behavior_unchanged(self):
        self.worker_profile.latitude = Decimal("27.700000")
        self.worker_profile.longitude = Decimal("85.330000")
        self.worker_profile.preferred_travel_radius_km = 20
        self.worker_profile.save()

        far_job = self.create_job(
            self.verified_employer,
            latitude="28.209600",
            longitude="83.985600",
        )

        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.browse_url)

        job_ids = {job["id"] for job in response.data}
        self.assertIn(self.active_job.id, job_ids)
        self.assertNotIn(far_job.id, job_ids)


class JobPostAdminTests(TestCase):
    """Week 6 admin usability tests for jobs.JobPost."""

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username="jobsadmin",
            phone_number="9800000301",
            password="AdminPassword123!",
        )

        self.category = Category.objects.create(name="Construction & Repair")
        self.subcategory = Subcategory.objects.create(category=self.category, name="Electrical")

        self.employer_user = User.objects.create_user(
            username="jobsadminemployer",
            phone_number="9800000302",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer = EmployerProfile.objects.create(
            user=self.employer_user,
            organization_name="Sagarmatha Electricals",
        )

        self.job = JobPost.objects.create(
            employer=self.employer,
            title="House wiring for new build",
            category=self.category,
            subcategory=self.subcategory,
            description="Wire a two-storey residential building.",
            address="Baneshwor, Kathmandu",
            latitude=Decimal("27.700000"),
            longitude=Decimal("85.330000"),
            wage_amount=Decimal("1500.00"),
            status=JobPost.Status.ACTIVE,
        )

    def test_superuser_can_access_job_post_changelist(self):
        self.client.force_login(self.superuser)

        response = self.client.get(reverse("admin:jobs_jobpost_changelist"))

        self.assertEqual(response.status_code, 200)

    def test_job_post_search_by_title(self):
        self.client.force_login(self.superuser)

        response = self.client.get(
            reverse("admin:jobs_jobpost_changelist"),
            {"q": "House wiring"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "House wiring for new build")

    def test_job_post_status_filter_loads(self):
        self.client.force_login(self.superuser)

        response = self.client.get(
            reverse("admin:jobs_jobpost_changelist"),
            {"status": JobPost.Status.ACTIVE},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "House wiring for new build")

    def test_non_staff_user_cannot_access_job_admin(self):
        self.client.force_login(self.employer_user)

        response = self.client.get(reverse("admin:jobs_jobpost_changelist"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response.url)


@override_settings(DEBUG=True)
class SeedDemoJobsCommandTests(APITestCase):
    """Targeted tests for jobs.management.commands.seed_demo_jobs.

    Class-level `DEBUG=True` mirrors normal local-development settings -
    Django's test runner otherwise forces `DEBUG=False` for every test,
    which would trip the command's own production-safety guard before any
    of these tests could exercise its actual seeding behaviour (same
    pattern as `accounts.tests.SeedDemoCommandTests`). The one test of
    that guard itself overrides `DEBUG=False` again locally.
    """

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo_jobs")

    def _demo_jobs(self):
        from jobs.management.commands.seed_demo_jobs import USERNAME_PREFIX

        return JobPost.objects.filter(
            employer__user__username__startswith=USERNAME_PREFIX
        )

    def _demo_employers(self):
        from jobs.management.commands.seed_demo_jobs import USERNAME_PREFIX

        return EmployerProfile.objects.filter(
            user__username__startswith=USERNAME_PREFIX
        )

    def test_creates_exactly_sixty_demo_jobs(self):
        self.assertEqual(self._demo_jobs().count(), 60)

    def test_exactly_five_jobs_per_top_level_category_and_all_categories_covered(self):
        from jobs.management.commands.seed_demo_jobs import DEMO_MARKETPLACE

        self.assertEqual(len(DEMO_MARKETPLACE), 12)

        for category_block in DEMO_MARKETPLACE:
            category = Category.objects.get(name=category_block["category"])
            count = self._demo_jobs().filter(category=category).count()
            self.assertEqual(
                count, 5, f"{category_block['category']} has {count} demo jobs, expected 5"
            )

    def test_every_job_references_real_taxonomy_records(self):
        for job in self._demo_jobs().select_related("category", "subcategory"):
            # Subcategory must genuinely belong to the job's category - the
            # same invariant JobPostSerializer.validate() enforces for a
            # real employer's job post.
            self.assertEqual(job.subcategory.category_id, job.category_id)

            for skill in list(job.required_skills.all()) + list(job.preferred_skills.all()):
                self.assertEqual(skill.subcategory_id, job.subcategory_id)

            self.assertGreaterEqual(job.required_skills.count(), 1)

    def test_seeded_jobs_satisfy_job_post_serializer_validation(self):
        # Independent confirmation, not just trusting the command's own use
        # of the serializer at creation time: re-validate a sample of
        # already-saved jobs as if they were being freshly submitted.
        for job in self._demo_jobs().order_by("id")[:10]:
            payload = {
                "title": job.title,
                "category": job.category_id,
                "subcategory": job.subcategory_id,
                "description": job.description,
                "address": job.address,
                "latitude": str(job.latitude),
                "longitude": str(job.longitude),
                "required_experience_years": job.required_experience_years,
                "wage_type": job.wage_type,
                "wage_amount": str(job.wage_amount),
                "work_type": job.work_type,
                "number_of_workers_required": job.number_of_workers_required,
                "application_deadline": job.application_deadline.isoformat(),
                "required_skills_input": [skill.name for skill in job.required_skills.all()],
                "preferred_skills_input": [skill.name for skill in job.preferred_skills.all()],
            }
            serializer = JobPostSerializer(data=payload)
            self.assertTrue(
                serializer.is_valid(), f"{job.title} failed serializer validation: {serializer.errors}"
            )

    def test_seeded_employers_are_valid_verified_employers(self):
        employers = self._demo_employers()
        self.assertEqual(employers.count(), 24)

        for employer in employers:
            self.assertEqual(employer.verification_status, EmployerProfile.VerificationStatus.VERIFIED)
            self.assertEqual(employer.user.role, User.Role.EMPLOYER)
            self.assertTrue(employer.user.is_contact_verified)
            self.assertTrue(employer.organization_name)
            self.assertRegex(employer.user.phone_number, r"^\d{10}$")

    def test_job_dates_are_valid(self):
        now = timezone.now()

        for job in self._demo_jobs():
            self.assertIsNotNone(job.application_deadline)
            self.assertGreater(job.application_deadline, now)

            if job.scheduled_datetime is not None:
                self.assertGreater(job.scheduled_datetime, job.application_deadline)

    def test_wages_are_valid(self):
        for job in self._demo_jobs():
            self.assertIn(job.wage_type, JobPost.WageType.values)
            self.assertGreater(job.wage_amount, Decimal("0"))
            # Sanity bounds - demo wages must look believable, never absurd.
            self.assertLess(job.wage_amount, Decimal("100000"))

    def test_locations_are_valid_kathmandu_valley_coordinates(self):
        for job in self._demo_jobs():
            self.assertNotEqual((job.latitude, job.longitude), (Decimal("0"), Decimal("0")))
            self.assertTrue(Decimal("27.0") < job.latitude < Decimal("28.0"))
            self.assertTrue(Decimal("85.0") < job.longitude < Decimal("86.0"))
            self.assertTrue(job.address)

        for employer in self._demo_employers():
            self.assertNotEqual((employer.latitude, employer.longitude), (Decimal("0"), Decimal("0")))

    def test_rerun_does_not_create_duplicates(self):
        from django.core.management import call_command

        call_command("seed_demo_jobs")
        call_command("seed_demo_jobs")

        self.assertEqual(self._demo_jobs().count(), 60)
        self.assertEqual(self._demo_employers().count(), 24)

    def test_rerun_preserves_a_still_valid_existing_deadline(self):
        from django.core.management import call_command

        job = self._demo_jobs().first()
        original_deadline = job.application_deadline

        call_command("seed_demo_jobs")

        job.refresh_from_db()
        self.assertEqual(job.application_deadline, original_deadline)

    def test_refresh_dates_flag_forces_new_deadlines(self):
        from django.core.management import call_command

        job = self._demo_jobs().first()
        original_deadline = job.application_deadline

        call_command("seed_demo_jobs", "--refresh-dates")

        job.refresh_from_db()
        self.assertGreaterEqual(job.application_deadline, original_deadline)

    def test_rerun_does_not_modify_genuine_non_demo_records(self):
        from django.core.management import call_command

        genuine_user = User.objects.create_user(
            username="a_real_employer",
            phone_number="9800099999",
            password="RealPassword123!",
            role=User.Role.EMPLOYER,
        )
        genuine_employer = EmployerProfile.objects.create(
            user=genuine_user,
            organization_name="A Genuine Real Business",
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
            latitude=Decimal("27.700000"),
            longitude=Decimal("85.300000"),
        )
        category = Category.objects.get(name="Construction & Repair")
        subcategory = Subcategory.objects.filter(category=category).first()
        genuine_job = JobPost.objects.create(
            employer=genuine_employer,
            title="A Genuine Real Job Post",
            category=category,
            subcategory=subcategory,
            description="Created directly by a real employer, not by any seed command.",
            address="Somewhere Real, Kathmandu",
            latitude=Decimal("27.700000"),
            longitude=Decimal("85.300000"),
            wage_amount=Decimal("999.99"),
            application_deadline=timezone.now() + timedelta(days=30),
        )

        call_command("seed_demo_jobs")

        genuine_user.refresh_from_db()
        genuine_employer.refresh_from_db()
        genuine_job.refresh_from_db()

        self.assertEqual(genuine_employer.organization_name, "A Genuine Real Business")
        self.assertEqual(genuine_job.title, "A Genuine Real Job Post")
        self.assertEqual(genuine_job.wage_amount, Decimal("999.99"))
        self.assertTrue(User.objects.filter(pk=genuine_user.pk).exists())
        self.assertTrue(JobPost.objects.filter(pk=genuine_job.pk).exists())

    def test_command_refuses_to_run_without_debug_or_force(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError

        with override_settings(DEBUG=False):
            with self.assertRaises(CommandError):
                call_command("seed_demo_jobs")

    def test_browse_api_returns_seeded_jobs(self):
        response = self.client.get(reverse("jobs:browse"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {job["title"] for job in response.data}
        self.assertIn("Residential Electrician", titles)
        self.assertGreaterEqual(len(response.data), 60)

    def test_browse_api_can_filter_to_a_demo_category(self):
        category = Category.objects.get(name="Beauty & Personal Care Services")

        response = self.client.get(reverse("jobs:browse"), {"category": category.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 5)
