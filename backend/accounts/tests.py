from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from applications.models import Application, Rating
from jobs.models import JobPost
from profiles.models import EmployerProfile, WorkerProfile
from taxonomy.models import UnmatchedSkillTerm


User = get_user_model()


class RegistrationAPITests(APITestCase):
    """Tests for worker and employer account registration."""

    def setUp(self):
        self.register_url = reverse("accounts:register")

    def test_worker_registration_creates_worker_profile(self):
        payload = {
            "username": "newworker",
            "email": "newworker@example.com",
            "phone_number": "9811111111",
            "password": "SecurePassword123!",
            "role": User.Role.WORKER,
        }

        response = self.client.post(
            self.register_url,
            payload,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        worker = User.objects.get(username="newworker")

        self.assertEqual(worker.role, User.Role.WORKER)
        self.assertFalse(worker.is_contact_verified)
        self.assertFalse(worker.is_staff)
        self.assertFalse(worker.is_superuser)

        self.assertTrue(worker.check_password("SecurePassword123!"))

        self.assertTrue(
            WorkerProfile.objects.filter(user=worker).exists()
        )

        self.assertFalse(
            EmployerProfile.objects.filter(user=worker).exists()
        )

        self.assertNotIn("password", response.data)

    def test_employer_registration_creates_employer_profile(self):
        payload = {
            "username": "newemployer",
            "email": "newemployer@example.com",
            "phone_number": "9822222222",
            "password": "SecurePassword123!",
            "role": User.Role.EMPLOYER,
        }

        response = self.client.post(
            self.register_url,
            payload,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        employer = User.objects.get(username="newemployer")

        self.assertEqual(employer.role, User.Role.EMPLOYER)
        self.assertFalse(employer.is_contact_verified)

        self.assertTrue(
            EmployerProfile.objects.filter(user=employer).exists()
        )

        self.assertFalse(
            WorkerProfile.objects.filter(user=employer).exists()
        )

    def test_registration_rejects_admin_role(self):
        payload = {
            "username": "fakeadmin",
            "phone_number": "9833333333",
            "password": "SecurePassword123!",
            "role": "ADMIN",
        }

        response = self.client.post(
            self.register_url,
            payload,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertFalse(
            User.objects.filter(username="fakeadmin").exists()
        )

    def test_registration_rejects_duplicate_phone_number(self):
        User.objects.create_user(
            username="existinguser",
            phone_number="9844444444",
            password="SecurePassword123!",
            role=User.Role.WORKER,
        )

        payload = {
            "username": "anotheruser",
            "phone_number": "9844444444",
            "password": "SecurePassword123!",
            "role": User.Role.WORKER,
        }

        response = self.client.post(
            self.register_url,
            payload,
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertIn("phone_number", response.data)

    def test_registration_rejects_phone_number_that_is_not_ten_ascii_digits(self):
        for index, phone_number in enumerate(
            ("981111111", "98111111111", "98111abcde", "९८११११११११"),
            start=1,
        ):
            with self.subTest(phone_number=phone_number):
                response = self.client.post(
                    self.register_url,
                    {
                        "username": f"invalidphone{index}",
                        "phone_number": phone_number,
                        "password": "SecurePassword123!",
                        "role": User.Role.WORKER,
                    },
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("phone_number", response.data)


class AuthenticationAPITests(APITestCase):
    """Tests for JWT authentication, permissions, and logout."""

    worker_password = "WorkerPassword123!"
    employer_password = "EmployerPassword123!"

    def setUp(self):
        self.login_url = reverse("accounts:login")
        self.refresh_url = reverse("accounts:token_refresh")
        self.logout_url = reverse("accounts:logout")
        self.me_url = reverse("accounts:me")
        self.worker_only_url = reverse("accounts:worker_only")
        self.employer_only_url = reverse("accounts:employer_only")

        self.worker = User.objects.create_user(
            username="testworker",
            email="testworker@example.com",
            phone_number="9855555555",
            password=self.worker_password,
            role=User.Role.WORKER,
        )

        WorkerProfile.objects.create(user=self.worker)

        self.employer = User.objects.create_user(
            username="testemployer",
            email="testemployer@example.com",
            phone_number="9866666666",
            password=self.employer_password,
            role=User.Role.EMPLOYER,
        )

        EmployerProfile.objects.create(
            user=self.employer,
            organization_name="Test Employer",
        )

    def login(self, username, password):
        """Return the response from the JWT login endpoint."""

        return self.client.post(
            self.login_url,
            {
                "username": username,
                "password": password,
            },
            format="json",
        )

    def authenticate_with(self, access_token):
        """Attach an access token to subsequent API requests."""

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {access_token}"
        )

    def test_valid_login_returns_access_and_refresh_tokens(self):
        response = self.login(
            self.worker.username,
            self.worker_password,
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_incorrect_password_is_rejected(self):
        response = self.login(
            self.worker.username,
            "IncorrectPassword123!",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)

    def test_me_endpoint_returns_authenticated_worker(self):
        login_response = self.login(
            self.worker.username,
            self.worker_password,
        )

        access_token = login_response.data["access"]
        self.authenticate_with(access_token)

        response = self.client.get(self.me_url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            response.data["username"],
            self.worker.username,
        )

        self.assertEqual(
            response.data["role"],
            User.Role.WORKER,
        )

        self.assertNotIn("password", response.data)

    def test_unauthenticated_user_cannot_access_protected_endpoint(self):
        response = self.client.get(self.worker_only_url)

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_worker_can_access_only_worker_endpoint(self):
        login_response = self.login(
            self.worker.username,
            self.worker_password,
        )

        self.authenticate_with(login_response.data["access"])

        worker_response = self.client.get(self.worker_only_url)
        employer_response = self.client.get(self.employer_only_url)

        self.assertEqual(
            worker_response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            employer_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_employer_can_access_only_employer_endpoint(self):
        login_response = self.login(
            self.employer.username,
            self.employer_password,
        )

        self.authenticate_with(login_response.data["access"])

        employer_response = self.client.get(self.employer_only_url)
        worker_response = self.client.get(self.worker_only_url)

        self.assertEqual(
            employer_response.status_code,
            status.HTTP_200_OK,
        )

        self.assertEqual(
            worker_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_valid_refresh_token_returns_new_access_token(self):
        login_response = self.login(
            self.worker.username,
            self.worker_password,
        )

        refresh_token = login_response.data["refresh"]

        response = self.client.post(
            self.refresh_url,
            {"refresh": refresh_token},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.assertIn("access", response.data)

    def test_logout_blacklists_refresh_token(self):
        login_response = self.login(
            self.worker.username,
            self.worker_password,
        )

        access_token = login_response.data["access"]
        refresh_token = login_response.data["refresh"]

        self.authenticate_with(access_token)

        logout_response = self.client.post(
            self.logout_url,
            {"refresh": refresh_token},
            format="json",
        )

        self.assertEqual(
            logout_response.status_code,
            status.HTTP_204_NO_CONTENT,
        )

        # Remove the Authorization header before checking refresh.
        self.client.credentials()

        refresh_response = self.client.post(
            self.refresh_url,
            {"refresh": refresh_token},
            format="json",
        )

        self.assertEqual(
            refresh_response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_logout_requires_refresh_token(self):
        login_response = self.login(
            self.worker.username,
            self.worker_password,
        )

        self.authenticate_with(login_response.data["access"])

        response = self.client.post(
            self.logout_url,
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertIn("refresh", response.data)

    def test_user_cannot_blacklist_another_users_refresh_token(self):
        worker_login = self.login(
            self.worker.username,
            self.worker_password,
        )

        employer_login = self.login(
            self.employer.username,
            self.employer_password,
        )

        worker_refresh = worker_login.data["refresh"]
        employer_access = employer_login.data["access"]

        self.authenticate_with(employer_access)

        response = self.client.post(
            self.logout_url,
            {"refresh": worker_refresh},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )


class UserAdminTests(TestCase):
    """Week 6 admin usability and safety tests for accounts.User."""

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username="siteadmin",
            phone_number="9800000001",
            password="AdminPassword123!",
            email="siteadmin@example.com",
        )

        self.worker = User.objects.create_user(
            username="adminviewworker",
            phone_number="9800000002",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
            email="adminviewworker@example.com",
        )

    def test_superuser_can_access_user_changelist(self):
        self.client.force_login(self.superuser)

        response = self.client.get(reverse("admin:accounts_user_changelist"))

        self.assertEqual(response.status_code, 200)

    def test_changelist_search_by_username_finds_user(self):
        self.client.force_login(self.superuser)

        response = self.client.get(
            reverse("admin:accounts_user_changelist"),
            {"q": "adminviewworker"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "adminviewworker")

    def test_changelist_role_filter_loads(self):
        self.client.force_login(self.superuser)

        response = self.client.get(
            reverse("admin:accounts_user_changelist"),
            {"role": User.Role.WORKER},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "adminviewworker")

    def test_mark_contact_verified_action_verifies_selected_user(self):
        self.client.force_login(self.superuser)

        response = self.client.post(
            reverse("admin:accounts_user_changelist"),
            {
                "action": "mark_contact_verified",
                "_selected_action": [str(self.worker.pk)],
            },
            follow=True,
        )

        self.assertEqual(response.status_code, 200)

        self.worker.refresh_from_db()
        self.assertTrue(self.worker.is_contact_verified)

    def test_mark_contact_verified_action_does_not_touch_staff_role_or_password(self):
        original_password_hash = self.worker.password

        self.client.force_login(self.superuser)

        self.client.post(
            reverse("admin:accounts_user_changelist"),
            {
                "action": "mark_contact_verified",
                "_selected_action": [str(self.worker.pk)],
            },
            follow=True,
        )

        self.worker.refresh_from_db()
        self.assertFalse(self.worker.is_staff)
        self.assertFalse(self.worker.is_superuser)
        self.assertEqual(self.worker.role, User.Role.WORKER)
        self.assertEqual(self.worker.password, original_password_hash)

    def test_mark_contact_unverified_action_reverses_verification(self):
        self.worker.is_contact_verified = True
        self.worker.save(update_fields=["is_contact_verified"])

        self.client.force_login(self.superuser)

        self.client.post(
            reverse("admin:accounts_user_changelist"),
            {
                "action": "mark_contact_unverified",
                "_selected_action": [str(self.worker.pk)],
            },
            follow=True,
        )

        self.worker.refresh_from_db()
        self.assertFalse(self.worker.is_contact_verified)

    def test_non_staff_user_cannot_access_admin(self):
        self.client.force_login(self.worker)

        response = self.client.get(reverse("admin:accounts_user_changelist"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response.url)

    def test_anonymous_user_cannot_access_admin(self):
        response = self.client.get(reverse("admin:accounts_user_changelist"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response.url)


@override_settings(DEBUG=True)
class SeedDemoCommandTests(TestCase):
    """Week 6 Phase 4 tests for `python manage.py seed_demo`.

    Class-level `DEBUG=True` mirrors normal local-development settings -
    Django's test runner otherwise forces `DEBUG=False` for every test,
    which would trip the command's own production-safety guard before
    any of these tests could exercise its actual seeding behaviour. The
    two tests of that guard itself override `DEBUG=False` again locally.
    """

    def test_command_runs_successfully(self):
        out = StringIO()
        call_command("seed_demo", stdout=out)

        self.assertIn("Demo dataset ready.", out.getvalue())
        self.assertTrue(User.objects.filter(username="demo_employer_verified").exists())

    def test_rerunning_does_not_duplicate_key_records(self):
        call_command("seed_demo", stdout=StringIO())

        user_count = User.objects.filter(username__startswith="demo_").count()
        job_count = JobPost.objects.filter(employer__user__username="demo_employer_verified").count()
        application_count = Application.objects.filter(
            worker__user__username__startswith="demo_worker"
        ).count()
        rating_count = Rating.objects.count()
        unmatched_count = UnmatchedSkillTerm.objects.count()

        call_command("seed_demo", stdout=StringIO())

        self.assertEqual(
            User.objects.filter(username__startswith="demo_").count(), user_count
        )
        self.assertEqual(
            JobPost.objects.filter(employer__user__username="demo_employer_verified").count(),
            job_count,
        )
        self.assertEqual(
            Application.objects.filter(worker__user__username__startswith="demo_worker").count(),
            application_count,
        )
        self.assertEqual(Rating.objects.count(), rating_count)
        self.assertEqual(UnmatchedSkillTerm.objects.count(), unmatched_count)

    def test_verified_employer_exists(self):
        call_command("seed_demo", stdout=StringIO())

        employer = EmployerProfile.objects.get(user__username="demo_employer_verified")
        self.assertEqual(employer.verification_status, EmployerProfile.VerificationStatus.VERIFIED)

    def test_pending_employer_exists_for_admin_demonstration(self):
        call_command("seed_demo", stdout=StringIO())

        employer = EmployerProfile.objects.get(user__username="demo_employer_pending")
        self.assertEqual(employer.verification_status, EmployerProfile.VerificationStatus.PENDING)

    def test_jobs_workers_and_applications_exist(self):
        call_command("seed_demo", stdout=StringIO())

        self.assertGreaterEqual(
            JobPost.objects.filter(employer__user__username="demo_employer_verified").count(), 5
        )
        self.assertGreaterEqual(
            WorkerProfile.objects.filter(user__username__startswith="demo_worker").count(), 8
        )
        self.assertGreaterEqual(
            Application.objects.filter(worker__user__username__startswith="demo_worker").count(), 4
        )

    def test_at_least_three_verified_employers(self):
        call_command("seed_demo", stdout=StringIO())

        self.assertGreaterEqual(
            EmployerProfile.objects.filter(
                user__username__startswith="demo_employer",
                verification_status=EmployerProfile.VerificationStatus.VERIFIED,
            ).count(),
            3,
        )

    def test_at_least_ten_active_jobs_across_multiple_verified_employers(self):
        call_command("seed_demo", stdout=StringIO())

        active_demo_jobs = JobPost.objects.filter(
            employer__user__username__startswith="demo_employer",
            status=JobPost.Status.ACTIVE,
        )
        self.assertGreaterEqual(active_demo_jobs.count(), 10)

        employer_usernames = set(
            active_demo_jobs.values_list("employer__user__username", flat=True)
        )
        self.assertGreaterEqual(len(employer_usernames), 2)

    def test_job_with_several_applicants_in_different_states(self):
        call_command("seed_demo", stdout=StringIO())

        job = JobPost.objects.get(
            title="House Wiring for New Apartment Block", employer__user__username="demo_employer_verified"
        )
        applications = Application.objects.filter(job=job)
        self.assertGreaterEqual(applications.count(), 3)
        self.assertGreaterEqual(
            len(set(applications.values_list("status", flat=True))), 2
        )

    def test_completed_application_has_ratings_in_both_directions(self):
        call_command("seed_demo", stdout=StringIO())

        application = Application.objects.get(
            worker__user__username="demo_worker_ramesh",
            job__title="House Wiring for New Apartment Block",
        )
        self.assertEqual(application.status, Application.Status.COMPLETED)

        ratings = Rating.objects.filter(application=application)
        self.assertEqual(ratings.count(), 2)
        self.assertEqual(
            set(ratings.values_list("direction", flat=True)),
            {Rating.Direction.WORKER_TO_EMPLOYER, Rating.Direction.EMPLOYER_TO_WORKER},
        )

    def test_unmatched_skill_term_created_for_admin_review(self):
        call_command("seed_demo", stdout=StringIO())

        self.assertTrue(
            UnmatchedSkillTerm.objects.filter(normalized_term="cnc machine operation").exists()
        )

    def test_rerun_after_manual_status_change_does_not_crash(self):
        """A demo presenter following DEMO_SCRIPT.md may manually reject or
        withdraw a demo application mid-walkthrough. Rerunning `seed_demo`
        afterwards must not try to route that application back through
        its original path (which would no longer be a legal transition)."""

        from applications.services import transition_application_status

        call_command("seed_demo", stdout=StringIO())

        application = Application.objects.get(
            worker__user__username="demo_worker_sita",
            job__title="Deep Cleaning for Office Space",
        )
        self.assertEqual(application.status, Application.Status.SHORTLISTED)

        employer_user = User.objects.get(username="demo_employer_verified")
        transition_application_status(application, Application.Status.REJECTED, actor=employer_user)

        call_command("seed_demo", stdout=StringIO())

        application.refresh_from_db()
        self.assertEqual(application.status, Application.Status.REJECTED)

    def test_refuses_to_run_with_debug_false_and_no_force(self):
        with override_settings(DEBUG=False):
            with self.assertRaises(CommandError):
                call_command("seed_demo", stdout=StringIO())

    def test_force_flag_allows_running_with_debug_false(self):
        with override_settings(DEBUG=False):
            call_command("seed_demo", "--force", stdout=StringIO())

        self.assertTrue(User.objects.filter(username="demo_admin").exists())


@override_settings(DEBUG=True)
class SeedDemoRecommendationEndpointTests(APITestCase):
    """The seeded dataset must actually feed the Week 4/5 recommendation
    and opportunity-advisory endpoints, not just exist in the database.

    Class-level `DEBUG=True` for the same reason as `SeedDemoCommandTests`.
    """

    def setUp(self):
        call_command("seed_demo", stdout=StringIO())

    def test_worker_job_recommendations_endpoint_has_demo_data(self):
        worker_user = User.objects.get(username="demo_worker_ramesh")
        self.client.force_authenticate(user=worker_user)

        response = self.client.get(reverse("recommendations:worker_job_recommendations"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 3)
        self.assertIn("reasons", response.data[0])

    def test_worker_job_recommendations_are_ordered_by_score_descending(self):
        worker_user = User.objects.get(username="demo_worker_ramesh")
        self.client.force_authenticate(user=worker_user)

        response = self.client.get(reverse("recommendations:worker_job_recommendations"))

        scores = [result["final_score"] for result in response.data]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_primary_worker_top_three_recommendations_each_match_a_required_skill(self):
        """Every job in Ramesh's top three worker-to-job recommendations
        must be a genuinely suitable suggestion, not just a subcategory
        match with a zero-skill-overlap score."""

        worker_user = User.objects.get(username="demo_worker_ramesh")
        self.client.force_authenticate(user=worker_user)

        response = self.client.get(reverse("recommendations:worker_job_recommendations"))

        self.assertGreaterEqual(len(response.data), 3)
        for result in response.data[:3]:
            self.assertGreaterEqual(len(result["skill"]["matched_required_skills"]), 1)

    def test_job_worker_recommendations_endpoint_has_demo_data(self):
        employer_user = User.objects.get(username="demo_employer_verified")
        job = JobPost.objects.get(
            title="House Wiring for New Apartment Block", employer__user=employer_user
        )
        self.client.force_authenticate(user=employer_user)

        response = self.client.get(
            reverse("recommendations:job_worker_recommendations", args=[job.id])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 3)

    def test_job_worker_recommendations_are_ordered_by_score_descending(self):
        employer_user = User.objects.get(username="demo_employer_verified")
        job = JobPost.objects.get(
            title="House Wiring for New Apartment Block", employer__user=employer_user
        )
        self.client.force_authenticate(user=employer_user)

        response = self.client.get(
            reverse("recommendations:job_worker_recommendations", args=[job.id])
        )

        scores = [result["final_score"] for result in response.data]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_opportunity_advisory_endpoint_has_near_miss_and_missing_skill_demo_data(self):
        worker_user = User.objects.get(username="demo_worker_hari")
        self.client.force_authenticate(user=worker_user)

        response = self.client.get(reverse("recommendations:opportunity_advisory"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data["near_miss_jobs"]), 0)
        self.assertGreater(len(response.data["missing_skills"]), 0)

    def test_opportunity_advisory_missing_skill_recurs_across_several_jobs(self):
        worker_user = User.objects.get(username="demo_worker_hari")
        self.client.force_authenticate(user=worker_user)

        response = self.client.get(reverse("recommendations:opportunity_advisory"))

        tile_installation = next(
            entry for entry in response.data["missing_skills"]
            if entry["skill"]["name"] == "Tile Installation"
        )
        self.assertGreaterEqual(len(tile_installation["job_ids"]), 2)

    def test_pending_employer_cannot_request_worker_recommendations(self):
        pending_user = User.objects.get(username="demo_employer_pending")
        job = JobPost.objects.get(title="House Wiring for New Apartment Block")
        self.client.force_authenticate(user=pending_user)

        response = self.client.get(
            reverse("recommendations:job_worker_recommendations", args=[job.id])
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pending_employer_cannot_create_job_post(self):
        pending_user = User.objects.get(username="demo_employer_pending")
        self.client.force_authenticate(user=pending_user)

        response = self.client.post(reverse("jobs:list_create"), data={}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_worker_cv_preview_has_meaningful_demo_content(self):
        worker_user = User.objects.get(username="demo_worker_ramesh")
        self.client.force_authenticate(user=worker_user)

        response = self.client.get(reverse("profiles:worker_cv_preview"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(b"House Wiring", response.content)
