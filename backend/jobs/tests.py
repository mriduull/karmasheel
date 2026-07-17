from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from profiles.models import EmployerProfile, WorkerProfile
from taxonomy.models import Category, SkillAlias, SkillTag, Subcategory

from .models import JobPost
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

    def test_non_owner_employer_cannot_view_candidates(self):
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

    def test_public_browse_rejects_latitude_without_longitude(self):
        response = self.client.get(self.browse_url, {"latitude": "27.7"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_browse_rejects_out_of_range_latitude(self):
        response = self.client.get(self.browse_url, {"latitude": "200", "longitude": "85.3"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

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
