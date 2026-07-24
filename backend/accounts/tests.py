from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from profiles.models import EmployerProfile, WorkerProfile


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
                self.assertFalse(
                    User.objects.filter(username=f"invalidphone{index}").exists()
                )


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
