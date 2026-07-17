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

from .models import Application
from .services import transition_application_status

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
