from decimal import Decimal
from io import BytesIO
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib import admin
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from PIL import Image

from applications.models import Application
from applications.services import submit_rating
from jobs.models import JobPost
from taxonomy.models import Category, SkillAlias, SkillTag, Subcategory, UnmatchedSkillTerm

from .models import EmployerProfile, WorkerProfile
from .services import (
    _SkillChipsFlowable,
    generate_worker_summary,
    render_worker_cv_pdf,
)


User = get_user_model()


def make_test_image_upload(name="profile.png", size=(2, 2), image_format="PNG"):
    buffer = BytesIO()
    Image.new("RGB", size, color="blue").save(buffer, format=image_format)
    content_type = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
    }[image_format]
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=content_type)


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
        self.assertEqual(response.data["skill_matches"], [])

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

    def test_worker_can_upload_profile_photo(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")

        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            response = self.client.patch(
                self.worker_url,
                {
                    "profile_photo": make_test_image_upload()
                },
                format="multipart",
            )

            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertIn("profile_photo_url", response.data)
            self.assertIn("/media/worker_profile_photos/", response.data["profile_photo_url"])

            self.worker_profile.refresh_from_db()
            self.assertTrue(self.worker_profile.profile_photo.name)

    def test_worker_profile_photo_rejects_non_image_upload(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")

        response = self.client.patch(
            self.worker_url,
            {
                "profile_photo": SimpleUploadedFile(
                    "profile.txt",
                    b"not an image",
                    content_type="text/plain",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("profile_photo", response.data)

    def test_worker_profile_photo_rejects_spoofed_image_content(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")

        response = self.client.patch(
            self.worker_url,
            {
                "profile_photo": SimpleUploadedFile(
                    "profile.png",
                    b"not actually a png",
                    content_type="image/png",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("profile_photo", response.data)

    def test_worker_profile_photo_rejects_mismatched_filename_extension(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")

        mismatches = (
            ("profile.png", "JPEG"),
            ("profile.jpg", "PNG"),
        )
        for filename, image_format in mismatches:
            with self.subTest(filename=filename, image_format=image_format):
                response = self.client.patch(
                    self.worker_url,
                    {
                        "profile_photo": make_test_image_upload(
                            name=filename,
                            image_format=image_format,
                        )
                    },
                    format="multipart",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("profile_photo", response.data)

    def test_worker_profile_photo_rejects_excessive_dimensions(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")

        response = self.client.patch(
            self.worker_url,
            {"profile_photo": make_test_image_upload(size=(4097, 1))},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("profile_photo", response.data)

    def test_worker_can_set_skills_via_skill_input_exact_match(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_input": ["House Wiring"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unmatched_terms"], [])
        self.assertEqual(len(response.data["skill_matches"]), 1)
        match = response.data["skill_matches"][0]
        self.assertEqual(
            set(match),
            {
                "input_term",
                "method",
                "confidence",
                "matched_skill",
                "matched_skill_was_selected",
                "suggestions",
            },
        )
        self.assertEqual(match["input_term"], "House Wiring")
        self.assertEqual(match["method"], "exact_name")
        self.assertEqual(match["confidence"], 100.0)
        self.assertEqual(
            match["matched_skill"],
            {
                "id": self.skill.id,
                "name": "House Wiring",
                "subcategory": "Construction & Repair - Electrical",
            },
        )
        self.assertFalse(match["matched_skill_was_selected"])
        self.assertEqual(match["suggestions"], [])

        self.worker_profile.refresh_from_db()
        self.assertIn(self.skill, self.worker_profile.skills.all())

    def test_worker_skill_input_lists_are_limited_to_twenty_items(self):
        self.worker_profile.address = "Original address"
        self.worker_profile.save(update_fields=["address"])
        self.authenticate_as(self.worker, "WorkerPassword123!")

        oversized_payloads = {
            "skill_input": [f"Skill phrase {index}" for index in range(21)],
            "skill_review_input": [f"Review phrase {index}" for index in range(21)],
        }
        for field, value in oversized_payloads.items():
            with self.subTest(field=field):
                response = self.client.patch(
                    self.worker_url,
                    {"address": "Must not be saved", field: value},
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)
                self.worker_profile.refresh_from_db()
                self.assertEqual(self.worker_profile.address, "Original address")

    def test_worker_can_save_more_than_twenty_explicit_skill_ids(self):
        explicit_skills = SkillTag.objects.bulk_create(
            [
                SkillTag(
                    subcategory=self.skill.subcategory,
                    name=f"Explicit Skill {index}",
                )
                for index in range(21)
            ]
        )

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_ids": [skill.id for skill in explicit_skills]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.worker_profile.refresh_from_db()
        self.assertEqual(self.worker_profile.skills.count(), 21)

    def test_more_than_five_hundred_unique_explicit_skill_ids_is_rejected_safely(self):
        self.worker_profile.address = "Original address"
        self.worker_profile.save(update_fields=["address"])
        self.worker_profile.skills.add(self.skill)

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {
                "address": "Must not be saved",
                "skill_ids": list(range(1, 502)),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("skill_ids", response.data)
        self.worker_profile.refresh_from_db()
        self.assertEqual(self.worker_profile.address, "Original address")
        self.assertEqual(
            set(self.worker_profile.skills.values_list("id", flat=True)),
            {self.skill.id},
        )

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
        match = response.data["skill_matches"][0]
        self.assertEqual(match["method"], "unmatched")
        self.assertIsNone(match["matched_skill"])

    def test_skill_matches_preserve_input_order_and_deduplicate_suggestions(self):
        SkillAlias.objects.create(skill=self.skill, phrase="residential wiring")
        panel_wiring = SkillTag.objects.create(
            subcategory=self.skill.subcategory,
            name="Electrical Panel Wiring",
        )
        SkillAlias.objects.create(skill=panel_wiring, phrase="panel wire setup")

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_input": ["ghar wiring", "panel wire setup"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["input_term"] for item in response.data["skill_matches"]],
            ["ghar wiring", "panel wire setup"],
        )
        for item in response.data["skill_matches"]:
            suggestion_ids = [suggestion["id"] for suggestion in item["suggestions"]]
            self.assertLessEqual(len(suggestion_ids), 5)
            self.assertEqual(len(suggestion_ids), len(set(suggestion_ids)))
            self.assertTrue(
                all(
                    suggestion["subcategory"]
                    == "Construction & Repair - Electrical"
                    for suggestion in item["suggestions"]
                )
            )

    def test_skill_suggestions_are_scoped_to_matched_skill_subcategory(self):
        other_subcategory = Subcategory.objects.create(
            category=self.skill.subcategory.category,
            name="Events",
        )
        SkillTag.objects.create(
            subcategory=other_subcategory,
            name="Cable And Wiring Setup For Events",
        )
        SkillTag.objects.create(
            subcategory=self.skill.subcategory,
            name="Electrical Panel Wiring",
        )

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_input": ["ghar wiring"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        suggestions = response.data["skill_matches"][0]["suggestions"]
        self.assertNotEqual(suggestions, [])
        self.assertTrue(
            all(
                suggestion["subcategory"] == "Construction & Repair - Electrical"
                for suggestion in suggestions
            )
        )

    def test_explicit_skill_id_disambiguates_duplicate_canonical_names(self):
        other_subcategory = Subcategory.objects.create(
            category=self.skill.subcategory.category,
            name="Building Maintenance",
        )
        selected_duplicate = SkillTag.objects.create(
            subcategory=other_subcategory,
            name="House Wiring",
        )

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {
                "skill_input": ["House Wiring"],
                "skill_ids": [selected_duplicate.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["skill_matches"], [])
        self.worker_profile.refresh_from_db()
        self.assertEqual(
            set(self.worker_profile.skills.values_list("id", flat=True)),
            {selected_duplicate.id},
        )

    def test_explicit_skill_ids_combine_with_nonduplicate_raw_phrases(self):
        selected_skill = SkillTag.objects.create(
            subcategory=self.skill.subcategory,
            name="Electrical Panel Wiring",
        )

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {
                "skill_input": ["ghar wiring"],
                "skill_ids": [selected_skill.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [match["input_term"] for match in response.data["skill_matches"]],
            ["ghar wiring"],
        )
        self.worker_profile.refresh_from_db()
        self.assertEqual(
            set(self.worker_profile.skills.values_list("id", flat=True)),
            {self.skill.id, selected_skill.id},
        )

    def test_skill_match_reports_when_matched_skill_was_explicitly_selected(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {
                "skill_input": ["ghar wiring"],
                "skill_ids": [self.skill.id],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["skill_matches"]), 1)
        self.assertTrue(
            response.data["skill_matches"][0]["matched_skill_was_selected"]
        )

    def test_explicit_skill_ids_alone_replace_confirmed_skills(self):
        selected_skill = SkillTag.objects.create(
            subcategory=self.skill.subcategory,
            name="Electrical Panel Wiring",
        )
        self.worker_profile.skills.add(self.skill)

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_ids": [selected_skill.id]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["skill_matches"], [])
        self.worker_profile.refresh_from_db()
        self.assertEqual(
            set(self.worker_profile.skills.values_list("id", flat=True)),
            {selected_skill.id},
        )

    def test_invalid_or_inactive_explicit_skill_ids_are_rejected_safely(self):
        inactive_skill = SkillTag.objects.create(
            subcategory=self.skill.subcategory,
            name="Inactive Wiring Skill",
            is_active=False,
        )
        self.worker_profile.address = "Original address"
        self.worker_profile.save(update_fields=["address"])
        self.worker_profile.skills.add(self.skill)

        self.authenticate_as(self.worker, "WorkerPassword123!")
        for rejected_id in (999_999, inactive_skill.id):
            with self.subTest(rejected_id=rejected_id):
                response = self.client.patch(
                    self.worker_url,
                    {
                        "address": "Must not be saved",
                        "skill_ids": [rejected_id],
                    },
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("skill_ids", response.data)
                self.worker_profile.refresh_from_db()
                self.assertEqual(self.worker_profile.address, "Original address")
                self.assertEqual(
                    set(self.worker_profile.skills.values_list("id", flat=True)),
                    {self.skill.id},
                )

    def test_worker_can_force_accepted_skill_phrase_into_admin_review(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_review_input": ["House Wireing"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["skill_matches"], [])
        self.assertEqual(response.data["unmatched_terms"], ["House Wireing"])
        self.assertNotIn(self.skill, self.worker_profile.skills.all())

        review_term = UnmatchedSkillTerm.objects.get(
            normalized_term="house wireing"
        )
        self.assertEqual(review_term.status, UnmatchedSkillTerm.Status.PENDING)
        self.assertEqual(review_term.best_candidate, self.skill)
        self.assertGreaterEqual(review_term.best_candidate_score, 85)
        self.assertEqual(review_term.submitted_by, self.worker)

    def test_review_only_patch_preserves_existing_confirmed_skills(self):
        retained_skill = SkillTag.objects.create(
            subcategory=self.skill.subcategory,
            name="Electrical Safety Inspection",
        )
        self.worker_profile.skills.add(retained_skill)

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_review_input": ["House Wiring"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unmatched_terms"], ["House Wiring"])
        self.worker_profile.refresh_from_db()
        self.assertEqual(list(self.worker_profile.skills.all()), [retained_skill])
        self.assertTrue(
            UnmatchedSkillTerm.objects.filter(
                normalized_term="house wiring",
                status=UnmatchedSkillTerm.Status.PENDING,
            ).exists()
        )

    def test_explicit_review_terms_are_deduplicated_in_response(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {
                "skill_input": [],
                "skill_review_input": ["House Wiring", "house-wiring!"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unmatched_terms"], ["House Wiring"])
        review_term = UnmatchedSkillTerm.objects.get(normalized_term="house wiring")
        self.assertEqual(review_term.occurrence_count, 1)

    def test_reviewed_phrase_in_skill_input_is_not_assigned(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {
                "skill_input": ["House Wiring"],
                "skill_review_input": ["house wiring"],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["unmatched_terms"], ["House Wiring"])
        self.worker_profile.refresh_from_db()
        self.assertNotIn(self.skill, self.worker_profile.skills.all())
        self.assertTrue(
            UnmatchedSkillTerm.objects.filter(
                normalized_term="house wiring",
                status=UnmatchedSkillTerm.Status.PENDING,
            ).exists()
        )

    def test_explicit_review_reopens_terminal_status_and_preserves_audit_fields(self):
        terminal_terms = [
            UnmatchedSkillTerm.objects.create(
                raw_term="House Wiring",
                normalized_term="house wiring",
                best_candidate=self.skill,
                best_candidate_score=100,
                submitted_by=self.employer,
                status=UnmatchedSkillTerm.Status.RESOLVED,
                resolved_skill=self.skill,
                resolved_by=self.employer,
            ),
            UnmatchedSkillTerm.objects.create(
                raw_term="House Wireing",
                normalized_term="house wireing",
                best_candidate=self.skill,
                best_candidate_score=90,
                submitted_by=self.employer,
                status=UnmatchedSkillTerm.Status.REJECTED,
                resolved_skill=self.skill,
                resolved_by=self.employer,
            ),
        ]

        self.authenticate_as(self.worker, "WorkerPassword123!")
        response = self.client.patch(
            self.worker_url,
            {"skill_review_input": ["House Wiring", "House Wireing"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for review_term in terminal_terms:
            review_term.refresh_from_db()
            self.assertEqual(review_term.status, UnmatchedSkillTerm.Status.PENDING)
            self.assertEqual(review_term.resolved_skill, self.skill)
            self.assertEqual(review_term.resolved_by, self.employer)
            self.assertEqual(review_term.submitted_by, self.employer)
            self.assertEqual(review_term.occurrence_count, 2)

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
        self.assertEqual(response["Cache-Control"], "private, no-store")
        content = response.content.decode()
        self.assertIn(self.worker.username, content)
        self.assertIn("Worker with 2 years of experience", content)
        self.assertIn("Not rated yet", content)
        self.assertNotIn("Generated on", content)
        self.assertNotIn("by Workforce Matching", content)

    def test_worker_cv_embeds_profile_photo_when_uploaded(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")

        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            self.worker_profile.profile_photo.save(
                "profile.png",
                SimpleUploadedFile(
                    "profile.png",
                    b"fake image bytes",
                    content_type="image/png",
                ),
            )

            response = self.client.get(self.preview_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('class="profile-photo"', response.content.decode())
        self.assertIn("data:image/png;base64,", response.content.decode())

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
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertIn(b"xref", response.content)
        self.assertIn(b"trailer", response.content)
        self.assertIn(self.worker.username.encode("ascii"), response.content)
        self.assertIn(b"PROFESSIONAL SUMMARY", response.content)
        self.assertIn(b"CONTACT", response.content)
        self.assertIn(b"SKILLS", response.content)
        self.assertIn(b"WORK DETAILS", response.content)
        self.assertNotIn(b"Username:", response.content)
        self.assertNotIn(b"/Subtype /Image", response.content)
        self.assertTrue(response.content.endswith(b"%%EOF\n"))

    def test_downloaded_cv_embeds_the_worker_profile_photo(self):
        self.authenticate_as(self.worker, "WorkerPassword123!")

        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            self.worker_profile.profile_photo.save(
                "profile.png",
                make_test_image_upload(size=(160, 90)),
            )
            response = self.client.get(self.pdf_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(b"/Subtype /Image", response.content)

    def test_downloaded_cv_paginates_a_long_skill_list(self):
        category = Category.objects.create(name="CV Pagination Services")
        subcategory = Subcategory.objects.create(
            category=category,
            name="CV Pagination Trade",
        )
        skills = [
            SkillTag.objects.create(
                subcategory=subcategory,
                name=f"Specialized installation and repair skill {index:02d}",
            )
            for index in range(80)
        ]
        self.worker_profile.skills.set(skills)
        self.authenticate_as(self.worker, "WorkerPassword123!")

        response = self.client.get(self.pdf_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # One `/Type /Pages` node plus at least two `/Type /Page` objects.
        self.assertGreaterEqual(response.content.count(b"/Type /Page"), 3)
        self.assertIn(b"Specialized installation and repair skill 79", response.content)

    def test_skill_chip_wraps_a_max_length_unbroken_name_within_page(self):
        available_width = 470
        rows = _SkillChipsFlowable(["W" * 100])._make_rows(available_width)
        chip = rows[0][0]

        self.assertGreater(len(chip[1]), 1)
        self.assertLessEqual(chip[3], available_width)

    def test_downloaded_cv_uses_full_name_without_a_separate_username_field(self):
        self.worker.first_name = "Ramesh"
        self.worker.last_name = "Shrestha"
        self.worker.save(update_fields=["first_name", "last_name"])
        self.authenticate_as(self.worker, "WorkerPassword123!")

        response = self.client.get(self.pdf_url)

        self.assertIn(b"Ramesh Shrestha", response.content)
        self.assertNotIn(self.worker.username.encode("ascii"), response.content)

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

    @override_settings(CV_PDF_ENGINE="auto")
    def test_auto_renderer_on_macos_skips_a_failed_browser_launch(self):
        with (
            patch("profiles.services.sys.platform", "darwin"),
            patch(
                "profiles.services._render_pdf_with_weasyprint",
                return_value=None,
            ) as weasyprint_renderer,
            patch("profiles.services._render_pdf_with_browser") as browser_renderer,
        ):
            pdf = render_worker_cv_pdf(self.worker_profile)

        weasyprint_renderer.assert_called_once()
        browser_renderer.assert_not_called()
        self.assertIn(b"PROFESSIONAL SUMMARY", pdf)

    @override_settings(CV_PDF_ENGINE="browser")
    @patch("profiles.services._render_pdf_with_weasyprint", return_value=None)
    @patch("profiles.services._render_pdf_with_browser", return_value=None)
    def test_unavailable_optional_renderers_use_valid_styled_pdf(
        self,
        browser_renderer,
        weasyprint_renderer,
    ):
        pdf = render_worker_cv_pdf(self.worker_profile)

        browser_renderer.assert_called_once()
        weasyprint_renderer.assert_called_once()
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertIn(b"PROFESSIONAL SUMMARY", pdf)
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

    def test_employer_profile_business_fields_are_editable_from_admin_list(self):
        model_admin = admin.site._registry[EmployerProfile]

        self.assertEqual(
            model_admin.list_editable,
            (
                "organization_name",
                "address",
                "pan_vat_number",
                "verification_status",
            ),
        )

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
