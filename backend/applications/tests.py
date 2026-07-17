from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from jobs.models import JobPost
from profiles.models import EmployerProfile, WorkerProfile
from taxonomy.models import Category, Subcategory

from .models import Application, Rating
from .services import get_rating_summary, submit_rating, transition_application_status

User = get_user_model()


def make_job(employer, category, subcategory, **overrides):
    defaults = dict(
        title="House wiring for new build",
        description="Wire a two-storey residential building.",
        address="Baneshwor, Kathmandu",
        latitude=Decimal("27.700000"),
        longitude=Decimal("85.330000"),
        wage_amount=Decimal("1500.00"),
        status=JobPost.Status.ACTIVE,
    )
    defaults.update(overrides)
    return JobPost.objects.create(employer=employer, category=category, subcategory=subcategory, **defaults)


class ApplicationStatusStateMachineTests(TestCase):
    """Service-layer tests for the Week 3 status state machine."""

    def setUp(self):
        category = Category.objects.create(name="Construction & Repair")
        subcategory = Subcategory.objects.create(category=category, name="Electrical")

        self.employer_user = User.objects.create_user(
            username="employer1",
            phone_number="9800000010",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer = EmployerProfile.objects.create(
            user=self.employer_user,
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
        )

        self.other_employer_user = User.objects.create_user(
            username="employer2",
            phone_number="9800000011",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )

        self.worker_user = User.objects.create_user(
            username="worker1",
            phone_number="9800000012",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.worker = WorkerProfile.objects.create(user=self.worker_user)

        self.other_worker_user = User.objects.create_user(
            username="worker2",
            phone_number="9800000013",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )

        self.job = make_job(self.employer, category, subcategory)
        self.application = Application.objects.create(worker=self.worker, job=self.job)

    def test_worker_can_withdraw_from_applied(self):
        transition_application_status(self.application, Application.Status.WITHDRAWN, actor=self.worker_user)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, Application.Status.WITHDRAWN)

    def test_employer_can_shortlist_from_applied(self):
        transition_application_status(self.application, Application.Status.SHORTLISTED, actor=self.employer_user)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, Application.Status.SHORTLISTED)

    def test_employer_cannot_hire_directly_from_applied(self):
        with self.assertRaises(ValidationError):
            transition_application_status(self.application, Application.Status.HIRED, actor=self.employer_user)

        self.application.refresh_from_db()
        self.assertEqual(self.application.status, Application.Status.APPLIED)

    def test_full_happy_path_shortlist_contact_hire_complete(self):
        transition_application_status(self.application, Application.Status.SHORTLISTED, actor=self.employer_user)
        transition_application_status(self.application, Application.Status.CONTACTED, actor=self.employer_user)
        transition_application_status(self.application, Application.Status.HIRED, actor=self.employer_user)
        transition_application_status(self.application, Application.Status.COMPLETED, actor=self.employer_user)

        self.application.refresh_from_db()
        self.assertEqual(self.application.status, Application.Status.COMPLETED)

    def test_hired_application_can_be_cancelled(self):
        transition_application_status(self.application, Application.Status.SHORTLISTED, actor=self.employer_user)
        transition_application_status(self.application, Application.Status.HIRED, actor=self.employer_user)
        transition_application_status(self.application, Application.Status.CANCELLED, actor=self.employer_user)

        self.application.refresh_from_db()
        self.assertEqual(self.application.status, Application.Status.CANCELLED)

    def test_worker_cannot_shortlist_own_application(self):
        with self.assertRaises(ValidationError):
            transition_application_status(self.application, Application.Status.SHORTLISTED, actor=self.worker_user)

    def test_employer_cannot_withdraw_application(self):
        with self.assertRaises(ValidationError):
            transition_application_status(self.application, Application.Status.WITHDRAWN, actor=self.employer_user)

    def test_terminal_status_rejects_further_transitions(self):
        transition_application_status(self.application, Application.Status.REJECTED, actor=self.employer_user)

        with self.assertRaises(ValidationError):
            transition_application_status(self.application, Application.Status.SHORTLISTED, actor=self.employer_user)

    def test_non_participant_cannot_transition_status(self):
        with self.assertRaises(ValidationError):
            transition_application_status(
                self.application, Application.Status.WITHDRAWN, actor=self.other_worker_user
            )

        with self.assertRaises(ValidationError):
            transition_application_status(
                self.application, Application.Status.SHORTLISTED, actor=self.other_employer_user
            )


class ApplicationAPITests(APITestCase):
    def setUp(self):
        category = Category.objects.create(name="Construction & Repair")
        subcategory = Subcategory.objects.create(category=category, name="Electrical")

        self.employer_user = User.objects.create_user(
            username="employer1",
            phone_number="9800000020",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer = EmployerProfile.objects.create(
            user=self.employer_user,
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
        )

        self.other_employer_user = User.objects.create_user(
            username="employer2",
            phone_number="9800000021",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        EmployerProfile.objects.create(
            user=self.other_employer_user,
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
        )

        self.worker_user = User.objects.create_user(
            username="worker1",
            phone_number="9800000022",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.worker_profile = WorkerProfile.objects.create(user=self.worker_user)

        self.other_worker_user = User.objects.create_user(
            username="worker2",
            phone_number="9800000023",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.other_worker_profile = WorkerProfile.objects.create(user=self.other_worker_user)

        self.active_job = make_job(self.employer, category, subcategory)
        self.closed_job = make_job(self.employer, category, subcategory, status=JobPost.Status.CLOSED)

        self.applications_url = reverse("applications:list_create")

    def authenticate_as(self, user, password):
        login_response = self.client.post(
            reverse("accounts:login"),
            {"username": user.username, "password": password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")

    def status_url(self, application):
        return reverse("applications:status_update", args=[application.id])

    def test_worker_can_apply_to_active_job(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.post(self.applications_url, {"job": self.active_job.id}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Application.objects.count(), 1)
        application = Application.objects.get()
        self.assertEqual(application.worker, self.worker_profile)
        self.assertEqual(application.status, Application.Status.APPLIED)

    def test_worker_cannot_apply_twice_to_same_job(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        self.client.post(self.applications_url, {"job": self.active_job.id}, format="json")
        response = self.client.post(self.applications_url, {"job": self.active_job.id}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Application.objects.count(), 1)

    def test_cannot_apply_to_closed_job(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.post(self.applications_url, {"job": self.closed_job.id}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Application.objects.count(), 0)

    def test_employer_cannot_apply_to_a_job(self):
        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.post(self.applications_url, {"job": self.active_job.id}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_worker_history_only_returns_own_applications(self):
        Application.objects.create(worker=self.worker_profile, job=self.active_job)
        Application.objects.create(worker=self.other_worker_profile, job=self.closed_job)

        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.applications_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["job"], self.active_job.id)

    def test_employer_can_view_applications_for_own_job(self):
        Application.objects.create(worker=self.worker_profile, job=self.active_job)
        url = reverse("jobs:job_applications", args=[self.active_job.id])

        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_non_owner_employer_cannot_view_applications_for_job(self):
        Application.objects.create(worker=self.worker_profile, job=self.active_job)
        url = reverse("jobs:job_applications", args=[self.active_job.id])

        self.authenticate_as(self.other_employer_user, "EmployerPassword123!")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_worker_can_withdraw_own_application(self):
        application = Application.objects.create(worker=self.worker_profile, job=self.active_job)

        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.patch(
            self.status_url(application), {"status": Application.Status.WITHDRAWN}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.assertEqual(application.status, Application.Status.WITHDRAWN)

    def test_worker_cannot_withdraw_another_workers_application(self):
        application = Application.objects.create(worker=self.other_worker_profile, job=self.active_job)

        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.patch(
            self.status_url(application), {"status": Application.Status.WITHDRAWN}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_employer_can_shortlist_application_for_owned_job(self):
        application = Application.objects.create(worker=self.worker_profile, job=self.active_job)

        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.patch(
            self.status_url(application), {"status": Application.Status.SHORTLISTED}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.assertEqual(application.status, Application.Status.SHORTLISTED)

    def test_employer_cannot_hire_directly_from_applied_via_api(self):
        application = Application.objects.create(worker=self.worker_profile, job=self.active_job)

        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.patch(
            self.status_url(application), {"status": Application.Status.HIRED}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        application.refresh_from_db()
        self.assertEqual(application.status, Application.Status.APPLIED)

    def test_non_owner_employer_cannot_update_application_status(self):
        application = Application.objects.create(worker=self.worker_profile, job=self.active_job)

        self.authenticate_as(self.other_employer_user, "EmployerPassword123!")
        response = self.client.patch(
            self.status_url(application), {"status": Application.Status.SHORTLISTED}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_update_application_status(self):
        application = Application.objects.create(worker=self.worker_profile, job=self.active_job)
        response = self.client.patch(
            self.status_url(application), {"status": Application.Status.WITHDRAWN}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------
# Week 5 - ratings
# ---------------------------------------------------------------------

class RatingServiceTests(TestCase):
    """Service-layer tests for `applications.services.submit_rating`."""

    def setUp(self):
        category = Category.objects.create(name="Construction & Repair")
        subcategory = Subcategory.objects.create(category=category, name="Electrical")

        self.employer_user = User.objects.create_user(
            username="ratingemployer1",
            phone_number="9800000040",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer = EmployerProfile.objects.create(
            user=self.employer_user,
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
        )

        self.other_user = User.objects.create_user(
            username="ratingoutsider",
            phone_number="9800000041",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )

        self.worker_user = User.objects.create_user(
            username="ratingworker1",
            phone_number="9800000042",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.worker = WorkerProfile.objects.create(user=self.worker_user)

        self.job = make_job(self.employer, category, subcategory)
        self.application = Application.objects.create(
            worker=self.worker, job=self.job, status=Application.Status.COMPLETED
        )

    def test_cannot_rate_non_completed_application(self):
        self.application.status = Application.Status.APPLIED
        self.application.save(update_fields=["status"])

        with self.assertRaises(ValidationError):
            submit_rating(self.application, reviewer=self.worker_user, score=5)

    def test_worker_rating_employer_sets_correct_direction_and_target(self):
        rating = submit_rating(
            self.application, reviewer=self.worker_user, score=4, review_text="Good work"
        )

        self.assertEqual(rating.direction, Rating.Direction.WORKER_TO_EMPLOYER)
        self.assertEqual(rating.reviewer, self.worker_user)
        self.assertEqual(rating.reviewed_user, self.employer_user)
        self.assertEqual(rating.score, 4)

    def test_employer_rating_worker_sets_correct_direction_and_target(self):
        rating = submit_rating(self.application, reviewer=self.employer_user, score=5)

        self.assertEqual(rating.direction, Rating.Direction.EMPLOYER_TO_WORKER)
        self.assertEqual(rating.reviewer, self.employer_user)
        self.assertEqual(rating.reviewed_user, self.worker_user)

    def test_non_participant_cannot_rate(self):
        with self.assertRaises(ValidationError):
            submit_rating(self.application, reviewer=self.other_user, score=3)

    def test_duplicate_rating_same_direction_is_rejected(self):
        submit_rating(self.application, reviewer=self.worker_user, score=4)

        with self.assertRaises(ValidationError):
            submit_rating(self.application, reviewer=self.worker_user, score=2)

        self.assertEqual(Rating.objects.filter(application=self.application).count(), 1)

    def test_both_directions_can_coexist_on_same_application(self):
        submit_rating(self.application, reviewer=self.worker_user, score=4)
        submit_rating(self.application, reviewer=self.employer_user, score=5)

        self.assertEqual(Rating.objects.filter(application=self.application).count(), 2)


class RatingSummaryServiceTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Construction & Repair")
        self.subcategory = Subcategory.objects.create(category=self.category, name="Electrical")

        self.employer_user = User.objects.create_user(
            username="summaryemployer",
            phone_number="9800000043",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer = EmployerProfile.objects.create(
            user=self.employer_user, verification_status=EmployerProfile.VerificationStatus.VERIFIED
        )

        self.worker_user = User.objects.create_user(
            username="summaryworker",
            phone_number="9800000044",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.worker = WorkerProfile.objects.create(user=self.worker_user)

    def test_no_ratings_returns_none_average_not_zero(self):
        average, count = get_rating_summary(self.worker_user)
        self.assertIsNone(average)
        self.assertEqual(count, 0)

    def test_average_and_count_reflect_received_ratings(self):
        job_a = make_job(self.employer, self.category, self.subcategory)
        application_a = Application.objects.create(
            worker=self.worker, job=job_a, status=Application.Status.COMPLETED
        )
        job_b = make_job(self.employer, self.category, self.subcategory, title="Second job")
        application_b = Application.objects.create(
            worker=self.worker, job=job_b, status=Application.Status.COMPLETED
        )

        submit_rating(application_a, reviewer=self.employer_user, score=5)
        submit_rating(application_b, reviewer=self.employer_user, score=3)

        average, count = get_rating_summary(self.worker_user)
        self.assertEqual(average, 4.0)
        self.assertEqual(count, 2)


class RatingAPITests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Construction & Repair")
        self.subcategory = Subcategory.objects.create(category=self.category, name="Electrical")

        self.employer_user = User.objects.create_user(
            username="apiratingemployer",
            phone_number="9800000045",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer = EmployerProfile.objects.create(
            user=self.employer_user, verification_status=EmployerProfile.VerificationStatus.VERIFIED
        )

        self.other_employer_user = User.objects.create_user(
            username="apiratingemployer2",
            phone_number="9800000046",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )

        self.worker_user = User.objects.create_user(
            username="apiratingworker",
            phone_number="9800000047",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.worker_profile = WorkerProfile.objects.create(user=self.worker_user)

        self.job = make_job(self.employer, self.category, self.subcategory)
        self.completed_application = Application.objects.create(
            worker=self.worker_profile, job=self.job, status=Application.Status.COMPLETED
        )

        self.applied_job = make_job(self.employer, self.category, self.subcategory, title="Still open job")
        self.applied_application = Application.objects.create(
            worker=self.worker_profile, job=self.applied_job, status=Application.Status.APPLIED
        )

    def authenticate_as(self, user, password):
        login_response = self.client.post(
            reverse("accounts:login"),
            {"username": user.username, "password": password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")

    def rating_url(self, application):
        return reverse("applications:rating", args=[application.id])

    def test_unauthenticated_cannot_submit_rating(self):
        response = self.client.post(self.rating_url(self.completed_application), {"score": 5}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_worker_can_rate_completed_application(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.post(
            self.rating_url(self.completed_application),
            {"score": 5, "review_text": "Great employer"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["direction"], Rating.Direction.WORKER_TO_EMPLOYER)
        self.assertTrue(
            Rating.objects.filter(application=self.completed_application, reviewer=self.worker_user).exists()
        )

    def test_employer_can_rate_completed_application(self):
        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.post(self.rating_url(self.completed_application), {"score": 4}, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["direction"], Rating.Direction.EMPLOYER_TO_WORKER)

    def test_non_participant_cannot_rate(self):
        self.authenticate_as(self.other_employer_user, "EmployerPassword123!")
        response = self.client.post(self.rating_url(self.completed_application), {"score": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_rate_non_completed_application(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.post(self.rating_url(self.applied_application), {"score": 3}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_rating_is_rejected_via_api(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        self.client.post(self.rating_url(self.completed_application), {"score": 5}, format="json")
        response = self.client.post(self.rating_url(self.completed_application), {"score": 1}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_score_out_of_range_is_rejected(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.post(self.rating_url(self.completed_application), {"score": 6}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_application_returns_404(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.post(reverse("applications:rating", args=[999999]), {"score": 5}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_participant_can_list_ratings_for_application(self):
        submit_rating(self.completed_application, reviewer=self.worker_user, score=5)

        self.authenticate_as(self.employer_user, "EmployerPassword123!")
        response = self.client.get(self.rating_url(self.completed_application))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_non_participant_cannot_list_ratings(self):
        self.authenticate_as(self.other_employer_user, "EmployerPassword123!")
        response = self.client.get(self.rating_url(self.completed_application))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class RatingSummaryEndpointTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Construction & Repair")
        self.subcategory = Subcategory.objects.create(category=self.category, name="Electrical")

        self.employer_user = User.objects.create_user(
            username="summaryendpointemployer",
            phone_number="9800000048",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer = EmployerProfile.objects.create(
            user=self.employer_user, verification_status=EmployerProfile.VerificationStatus.VERIFIED
        )

        self.worker_user = User.objects.create_user(
            username="summaryendpointworker",
            phone_number="9800000049",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.worker_profile = WorkerProfile.objects.create(user=self.worker_user)

        self.summary_url = reverse("applications:rating_summary")

    def authenticate_as(self, user, password):
        login_response = self.client.post(
            reverse("accounts:login"),
            {"username": user.username, "password": password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")

    def test_unauthenticated_cannot_access_summary(self):
        response = self.client.get(self.summary_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_worker_with_no_ratings_sees_null_average(self):
        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.summary_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["average_rating"])
        self.assertEqual(response.data["rating_count"], 0)

    def test_worker_summary_reflects_received_rating(self):
        job = make_job(self.employer, self.category, self.subcategory)
        application = Application.objects.create(
            worker=self.worker_profile, job=job, status=Application.Status.COMPLETED
        )
        submit_rating(application, reviewer=self.employer_user, score=5)

        self.authenticate_as(self.worker_user, "WorkerPassword123!")
        response = self.client.get(self.summary_url)

        self.assertEqual(response.data["average_rating"], 5.0)
        self.assertEqual(response.data["rating_count"], 1)
