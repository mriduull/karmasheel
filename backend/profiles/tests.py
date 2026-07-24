from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from applications.models import Application
from applications.services import submit_rating
from jobs.models import JobPost
from taxonomy.models import Category, SkillAlias, SkillTag, Subcategory, UnmatchedSkillTerm

from .models import EmployerProfile, WorkerProfile
from .services import generate_worker_summary, render_worker_cv_pdf


User = get_user_model()


class WorkerProfileAPITests(APITestCase):
    def setUp(self):
        self.worker_url = reverse("profiles:worker_me")
        self.employer_url = reverse("profiles:employer_me")

        self.worker = User.objects.create_user(
            username="worker1",
            phone_number="9811111111",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.worker_profile = WorkerProfile.objects.create(user=self.worker)

        self.employer = User.objects.create_user(
            username="employer1",
            phone_number="9822222222",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        EmployerProfile.objects.create(user=self.employer)

        category = Category.objects.create(name="Construction & Repair")
        subcategory = Subcategory.objects.create(category=category, name="Electrical")
        self.skill = SkillTag.objects.create(subcategory=subcategory, name="House Wiring")
        SkillAlias.objects.create(
            skill=self.skill,
            phrase="ghar wiring",
            language=SkillAlias.Language.NE_ROMANIZED,
        )

    def authenticate_as(self, user, password):
        login_response = self.client.post(
            reverse("accounts:login"),
            {"username": user.username, "password": password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")

    def test_unauthenticated_cannot_access(self):
        response = self.client.get(self.worker_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_employer_cannot_access_worker_profile_endpoint(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.get(self.worker_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_employer_cannot_delete_worker_profile(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.delete(self.worker_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(WorkerProfile.objects.filter(pk=self.worker_profile.pk).exists())

    def test_worker_can_retrieve_own_profile(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.get(self.worker_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.worker_profile.id)
        self.assertEqual(response.data["skills"], [])

    def test_missing_worker_profile_returns_404_not_500(self):
        self.worker_profile.delete()

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.get(self.worker_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_worker_can_create_profile_when_missing(self):
        self.worker_profile.delete()

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.post(
            self.worker_url,
            {"address": "Kathmandu", "is_available": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(WorkerProfile.objects.filter(user=self.worker).exists())

    def test_worker_can_delete_own_profile(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.delete(self.worker_url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(WorkerProfile.objects.filter(pk=self.worker_profile.pk).exists())
        self.assertTrue(User.objects.filter(pk=self.worker.pk).exists())

    def test_worker_profile_delete_preserves_application_and_rating_history(self):
        job = JobPost.objects.create(
            employer=self.employer.employer_profile,
            title="Historical electrical job",
            category=self.skill.subcategory.category,
            subcategory=self.skill.subcategory,
            description="Completed work that must remain auditable.",
            address="Kathmandu",
            latitude=Decimal("27.700000"),
            longitude=Decimal("85.330000"),
            wage_amount=Decimal("1500.00"),
        )
        application = Application.objects.create(
            worker=self.worker_profile,
            job=job,
            status=Application.Status.COMPLETED,
        )
        rating = submit_rating(application, reviewer=self.employer, score=5)

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.delete(self.worker_url)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("application history", response.data["detail"])
        self.assertTrue(
            WorkerProfile.objects.filter(pk=self.worker_profile.pk).exists()
        )
        self.assertTrue(Application.objects.filter(pk=application.pk).exists())
        self.assertTrue(type(rating).objects.filter(pk=rating.pk).exists())

    def test_delete_missing_worker_profile_returns_404(self):
        self.worker_profile.delete()
        self.authenticate_as(self.worker, "WorkerPassword123!")

        response = self.client.delete(self.worker_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_worker_cannot_create_duplicate_profile(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.post(self.worker_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_worker_can_update_scalar_fields(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {
                "address": "Pokhara",
                "latitude": "28.209700",
                "longitude": "83.985600",
                "experience_years": 5,
                "is_available": False,
                "expected_wage": "1500.00",
                "preferred_travel_radius_km": 15,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.worker_profile.refresh_from_db()
        self.assertEqual(self.worker_profile.address, "Pokhara")
        self.assertEqual(self.worker_profile.experience_years, 5)
        self.assertFalse(self.worker_profile.is_available)
        self.assertEqual(self.worker_profile.expected_wage, Decimal("1500.00"))
        self.assertEqual(self.worker_profile.preferred_travel_radius_km, 15)

    def test_worker_can_set_skills_via_skill_input_exact_match(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_input": ["House Wiring"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unmatched_terms"], [])

        self.worker_profile.refresh_from_db()
        self.assertIn(self.skill, self.worker_profile.skills.all())

    def test_worker_can_set_skills_via_romanized_nepali_alias(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_input": ["ghar wiring"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.worker_profile.refresh_from_db()
        self.assertIn(self.skill, self.worker_profile.skills.all())

    def test_unmatched_skill_input_is_reported_and_recorded(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_input": ["completely made up nonexistent skill"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["unmatched_terms"],
            ["completely made up nonexistent skill"],
        )
        self.assertTrue(
            UnmatchedSkillTerm.objects.filter(
                normalized_term="completely made up nonexistent skill"
            ).exists()
        )

    def test_worker_latitude_out_of_range_is_rejected(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(self.worker_url, {"latitude": "91"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("latitude", response.data)

    def test_worker_longitude_out_of_range_is_rejected(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(self.worker_url, {"longitude": "-181"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("longitude", response.data)

    def test_negative_experience_years_is_rejected(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(self.worker_url, {"experience_years": -1}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("experience_years", response.data)

    def test_negative_expected_wage_is_rejected(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(self.worker_url, {"expected_wage": "-100.00"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expected_wage", response.data)

    def test_negative_preferred_travel_radius_is_rejected(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url, {"preferred_travel_radius_km": -5}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("preferred_travel_radius_km", response.data)

    def test_zero_values_are_accepted_for_non_negative_fields(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {
                "experience_years": 0,
                "expected_wage": "0.00",
                "preferred_travel_radius_km": 0,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_worker_cannot_edit_another_workers_profile(self):
        other_worker = User.objects.create_user(
            username="worker2",
            phone_number="9833333333",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        other_profile = WorkerProfile.objects.create(user=other_worker, address="Untouched")

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(self.worker_url, {"address": "Hijacked"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        other_profile.refresh_from_db()
        self.assertEqual(other_profile.address, "Untouched")


class EmployerProfileAPITests(APITestCase):
    def setUp(self):
        self.employer_url = reverse("profiles:employer_me")
        self.worker_url = reverse("profiles:worker_me")

        self.employer = User.objects.create_user(
            username="employer1",
            phone_number="9822222222",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer_profile = EmployerProfile.objects.create(user=self.employer)

        self.worker = User.objects.create_user(
            username="worker1",
            phone_number="9811111111",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        WorkerProfile.objects.create(user=self.worker)

    def authenticate_as(self, user, password):
        login_response = self.client.post(
            reverse("accounts:login"),
            {"username": user.username, "password": password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")

    def test_worker_cannot_access_employer_profile_endpoint(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.get(self.employer_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_worker_cannot_delete_employer_profile(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.delete(self.employer_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(
            EmployerProfile.objects.filter(pk=self.employer_profile.pk).exists()
        )

    def test_missing_employer_profile_returns_404_not_500(self):
        self.employer_profile.delete()

        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.get(self.employer_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_employer_can_update_organization_and_pan_vat_number(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.patch(
            self.employer_url,
            {
                "organization_name": "Himalayan Builders",
                "address": "Lalitpur",
                "pan_vat_number": "123456789",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.employer_profile.refresh_from_db()
        self.assertEqual(self.employer_profile.organization_name, "Himalayan Builders")
        self.assertEqual(self.employer_profile.pan_vat_number, "123456789")

    def test_employer_can_delete_own_profile(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.delete(self.employer_url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            EmployerProfile.objects.filter(pk=self.employer_profile.pk).exists()
        )
        self.assertTrue(User.objects.filter(pk=self.employer.pk).exists())

    def test_employer_profile_delete_preserves_job_application_and_rating_history(self):
        category = Category.objects.create(name="Construction & Repair")
        subcategory = Subcategory.objects.create(
            category=category,
            name="Electrical",
        )
        job = JobPost.objects.create(
            employer=self.employer_profile,
            title="Historical electrical job",
            category=category,
            subcategory=subcategory,
            description="Completed work that must remain auditable.",
            address="Kathmandu",
            latitude=Decimal("27.700000"),
            longitude=Decimal("85.330000"),
            wage_amount=Decimal("1500.00"),
        )
        application = Application.objects.create(
            worker=self.worker.worker_profile,
            job=job,
            status=Application.Status.COMPLETED,
        )
        rating = submit_rating(application, reviewer=self.worker, score=5)

        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.delete(self.employer_url)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("job history", response.data["detail"])
        self.assertTrue(
            EmployerProfile.objects.filter(pk=self.employer_profile.pk).exists()
        )
        self.assertTrue(JobPost.objects.filter(pk=job.pk).exists())
        self.assertTrue(Application.objects.filter(pk=application.pk).exists())
        self.assertTrue(type(rating).objects.filter(pk=rating.pk).exists())

    def test_delete_missing_employer_profile_returns_404(self):
        self.employer_profile.delete()
        self.authenticate_as(self.employer, "EmployerPassword123!")

        response = self.client.delete(self.employer_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_pan_vat_number_format_is_rejected(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.patch(
            self.employer_url,
            {"pan_vat_number": "abc"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("pan_vat_number", response.data)

    def test_duplicate_pan_vat_number_is_rejected(self):
        other_employer = User.objects.create_user(
            username="employer2",
            phone_number="9844444444",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        EmployerProfile.objects.create(user=other_employer, pan_vat_number="111222333")

        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.patch(
            self.employer_url,
            {"pan_vat_number": "111222333"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("pan_vat_number", response.data)

    def test_blank_pan_vat_number_does_not_trigger_uniqueness_conflict(self):
        User.objects.create_user(
            username="employer3",
            phone_number="9855555555",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        # Two employers with no PAN/VAT set (blank) must coexist without error.
        second_employer = User.objects.create_user(
            username="employer4",
            phone_number="9866666666",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        EmployerProfile.objects.create(user=second_employer, pan_vat_number="")

        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.patch(self.employer_url, {"organization_name": "Test"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_verification_status_is_read_only(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.patch(
            self.employer_url,
            {"verification_status": EmployerProfile.VerificationStatus.VERIFIED},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.employer_profile.refresh_from_db()
        self.assertEqual(
            self.employer_profile.verification_status,
            EmployerProfile.VerificationStatus.UNVERIFIED,
        )

    def test_latitude_above_90_is_rejected(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.patch(self.employer_url, {"latitude": "90.5"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("latitude", response.data)

    def test_latitude_below_negative_90_is_rejected(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.patch(self.employer_url, {"latitude": "-90.5"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("latitude", response.data)

    def test_longitude_above_180_is_rejected(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.patch(self.employer_url, {"longitude": "180.5"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("longitude", response.data)

    def test_longitude_below_negative_180_is_rejected(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.patch(self.employer_url, {"longitude": "-180.5"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("longitude", response.data)

    def test_latitude_and_longitude_within_range_are_accepted(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.patch(
            self.employer_url,
            {"latitude": "27.700000", "longitude": "85.300000"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------
# Week 5 - automatic worker CV generation
# ---------------------------------------------------------------------

class WorkerSummaryServiceTests(TestCase):
    """Unit tests for the deterministic, template-based summary sentence."""

    def setUp(self):
        self.worker_user = User.objects.create_user(
            username="cvworker",
            phone_number="9800000030",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        category = Category.objects.create(name="Construction & Repair")
        self.subcategory = Subcategory.objects.create(category=category, name="Electrical")
        self.wiring_skill = SkillTag.objects.create(subcategory=self.subcategory, name="House Wiring")
        self.fan_skill = SkillTag.objects.create(subcategory=self.subcategory, name="Fan Installation")

    def test_no_experience_and_no_skills_omits_those_clauses(self):
        profile = WorkerProfile.objects.create(user=self.worker_user, is_available=True)
        summary = generate_worker_summary(profile)
        self.assertEqual(summary, "Worker, currently available for work.")

    def test_experience_without_skills_has_no_subcategory_phrase(self):
        profile = WorkerProfile.objects.create(
            user=self.worker_user, experience_years=4, is_available=True
        )
        summary = generate_worker_summary(profile)
        self.assertEqual(summary, "Worker with 4 years of experience, currently available for work.")

    def test_single_year_uses_singular_word(self):
        profile = WorkerProfile.objects.create(
            user=self.worker_user, experience_years=1, is_available=True
        )
        summary = generate_worker_summary(profile)
        self.assertIn("1 year of experience", summary)
        self.assertNotIn("1 years", summary)

    def test_experience_and_skills_include_subcategory_and_skill_list(self):
        profile = WorkerProfile.objects.create(
            user=self.worker_user, experience_years=4, is_available=True
        )
        profile.skills.set([self.wiring_skill, self.fan_skill])

        summary = generate_worker_summary(profile)

        self.assertEqual(
            summary,
            "Worker with 4 years of experience in electrical work, "
            "skilled in Fan Installation and House Wiring, currently available for work.",
        )

    def test_unavailable_worker_uses_not_available_phrasing(self):
        profile = WorkerProfile.objects.create(user=self.worker_user, is_available=False)
        summary = generate_worker_summary(profile)
        self.assertEqual(summary, "Worker, currently not available for new work.")

    def test_skill_list_is_truncated_to_max_summary_skills(self):
        profile = WorkerProfile.objects.create(user=self.worker_user, is_available=True)
        skills = [
            SkillTag.objects.create(subcategory=self.subcategory, name=f"Skill {i}") for i in range(8)
        ]
        profile.skills.set(skills)

        summary = generate_worker_summary(profile)

        for skill in skills[:6]:
            self.assertIn(skill.name, summary)

        for skill in skills[6:]:
            self.assertNotIn(skill.name, summary)


class WorkerCVAPITests(APITestCase):
    def setUp(self):
        self.preview_url = reverse("profiles:worker_cv_preview")
        self.pdf_url = reverse("profiles:worker_cv_pdf")

        self.worker = User.objects.create_user(
            username="cvworker2",
            phone_number="9800000031",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.worker_profile = WorkerProfile.objects.create(
            user=self.worker, experience_years=2, is_available=True
        )

        self.employer = User.objects.create_user(
            username="cvemployer",
            phone_number="9800000032",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        EmployerProfile.objects.create(user=self.employer)

    def authenticate_as(self, user, password):
        login_response = self.client.post(
            reverse("accounts:login"),
            {"username": user.username, "password": password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}")

    def test_unauthenticated_cannot_access_preview(self):
        response = self.client.get(self.preview_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_cannot_access_pdf(self):
        response = self.client.get(self.pdf_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_employer_cannot_access_worker_cv_preview(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.get(self.preview_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_employer_cannot_access_worker_cv_pdf(self):
        self.authenticate_as(self.employer, "EmployerPassword123!")
        response = self.client.get(self.pdf_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_worker_profile_returns_404_for_preview(self):
        self.worker_profile.delete()
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.get(self.preview_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_missing_worker_profile_returns_404_for_pdf(self):
        self.worker_profile.delete()
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.get(self.pdf_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_worker_can_preview_own_cv_as_html(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.get(self.preview_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/html", response["Content-Type"])
        content = response.content.decode()
        self.assertIn(self.worker.username, content)
        self.assertIn("Worker with 2 years of experience", content)
        self.assertIn("Not rated yet", content)

    def test_worker_cv_displays_received_average_rating(self):
        category = Category.objects.create(name="CV Services")
        subcategory = Subcategory.objects.create(
            category=category,
            name="CV Trade",
        )
        job = JobPost.objects.create(
            employer=self.employer.employer_profile,
            title="Completed CV job",
            category=category,
            subcategory=subcategory,
            description="A completed engagement used for CV rating evidence.",
            address="Kathmandu",
            latitude=Decimal("27.717200"),
            longitude=Decimal("85.324000"),
            wage_amount=Decimal("1500.00"),
        )
        application = Application.objects.create(
            worker=self.worker_profile,
            job=job,
            status=Application.Status.COMPLETED,
        )
        submit_rating(application, reviewer=self.employer, score=4)
        self.authenticate_as(self.worker, "WorkerPassword123!")

        response = self.client.get(self.preview_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("4.0/5 from 1", response.content.decode())
        self.assertContains(response, "rating")

    def test_worker_can_download_own_cv_as_pdf(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.get(self.pdf_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertIn(f"cv-{self.worker.username}.pdf", response["Content-Disposition"])
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn(b"xref", response.content)
        self.assertIn(b"trailer", response.content)
        self.assertIn(self.worker.username.encode("ascii"), response.content)
        self.assertTrue(response.content.endswith(b"%%EOF\n"))

    @override_settings(CV_PDF_ENGINE="weasyprint")
    @patch("profiles.services._render_pdf_with_browser")
    @patch(
        "profiles.services._render_pdf_with_weasyprint",
        return_value=b"%PDF-weasyprint",
    )
    def test_configured_weasyprint_renderer_is_preferred(
        self,
        weasyprint_renderer,
        browser_renderer,
    ):
        pdf = render_worker_cv_pdf(self.worker_profile)

        self.assertEqual(pdf, b"%PDF-weasyprint")
        weasyprint_renderer.assert_called_once()
        browser_renderer.assert_not_called()

    @override_settings(CV_PDF_ENGINE="browser")
    @patch("profiles.services._render_pdf_with_weasyprint", return_value=None)
    @patch("profiles.services._render_pdf_with_browser", return_value=None)
    def test_unavailable_optional_renderers_use_valid_basic_pdf(
        self,
        browser_renderer,
        weasyprint_renderer,
    ):
        pdf = render_worker_cv_pdf(self.worker_profile)

        browser_renderer.assert_called_once()
        weasyprint_renderer.assert_called_once()
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertTrue(pdf.endswith(b"%%EOF\n"))

    def test_cv_never_exposes_employer_only_data(self):
        # PAN/VAT is an employer-only field and must never leak through a
        # worker's own CV, even indirectly.
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.get(self.preview_url)
        self.assertNotIn("pan_vat", response.content.decode().lower())


class ProfileAdminTests(TestCase):
    """Week 6 admin usability and safety tests for WorkerProfile and
    EmployerProfile."""

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username="profilesadmin",
            phone_number="9800000101",
            password="AdminPassword123!",
        )

        self.worker_user = User.objects.create_user(
            username="adminworker",
            phone_number="9800000102",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        self.worker_profile = WorkerProfile.objects.create(
            user=self.worker_user,
            address="Baneshwor, Kathmandu",
        )

        self.employer_user = User.objects.create_user(
            username="adminemployer",
            phone_number="9800000103",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        self.employer_profile = EmployerProfile.objects.create(
            user=self.employer_user,
            organization_name="Everest Builders",
            verification_status=EmployerProfile.VerificationStatus.PENDING,
        )

    def test_superuser_can_access_worker_profile_changelist(self):
        self.client.force_login(self.superuser)

        response = self.client.get(reverse("admin:profiles_workerprofile_changelist"))

        self.assertEqual(response.status_code, 200)

    def test_superuser_can_access_employer_profile_changelist(self):
        self.client.force_login(self.superuser)

        response = self.client.get(reverse("admin:profiles_employerprofile_changelist"))

        self.assertEqual(response.status_code, 200)

    def test_worker_profile_search_by_address(self):
        self.client.force_login(self.superuser)

        response = self.client.get(
            reverse("admin:profiles_workerprofile_changelist"),
            {"q": "Baneshwor"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "adminworker")

    def test_employer_profile_verification_status_filter_loads(self):
        self.client.force_login(self.superuser)

        response = self.client.get(
            reverse("admin:profiles_employerprofile_changelist"),
            {"verification_status": EmployerProfile.VerificationStatus.PENDING},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Everest Builders")

    def test_mark_verified_action_sets_valid_status_and_reports_count(self):
        self.client.force_login(self.superuser)

        response = self.client.post(
            reverse("admin:profiles_employerprofile_changelist"),
            {
                "action": "mark_verified",
                "_selected_action": [str(self.employer_profile.pk)],
            },
            follow=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Marked 1 employer(s) as verified.")

        self.employer_profile.refresh_from_db()
        self.assertEqual(
            self.employer_profile.verification_status,
            EmployerProfile.VerificationStatus.VERIFIED,
        )

    def test_mark_rejected_action_uses_only_an_existing_status_value(self):
        self.client.force_login(self.superuser)

        self.client.post(
            reverse("admin:profiles_employerprofile_changelist"),
            {
                "action": "mark_rejected",
                "_selected_action": [str(self.employer_profile.pk)],
            },
            follow=True,
        )

        self.employer_profile.refresh_from_db()
        self.assertIn(
            self.employer_profile.verification_status,
            EmployerProfile.VerificationStatus.values,
        )
        self.assertEqual(
            self.employer_profile.verification_status,
            EmployerProfile.VerificationStatus.REJECTED,
        )

    def test_non_staff_user_cannot_access_profile_admin(self):
        self.client.force_login(self.worker_user)

        response = self.client.get(reverse("admin:profiles_workerprofile_changelist"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response.url)
