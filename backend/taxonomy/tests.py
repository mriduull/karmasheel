import json
import tempfile
from decimal import Decimal
from importlib import import_module
from unittest.mock import patch

from django.apps import apps as global_apps
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .management.commands.seed_taxonomy import (
    DEFAULT_DATA_FILE,
    TaxonomyDataError,
    load_taxonomy_data,
    validate_taxonomy_data,
)
from .models import Category, SkillAlias, SkillTag, Subcategory, UnmatchedSkillTerm
from .services import normalize_skill_phrase, normalize_skill_phrases, preprocess_skill_phrase


User = get_user_model()


def _write_json_tempfile(data):
    handle = tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    )
    json.dump(data, handle)
    handle.close()
    return handle.name


def _minimal_valid_dataset():
    """A tiny, self-consistent taxonomy dataset for validation/command
    tests that don't need the full curated v1 file."""

    return {
        "version": 1,
        "categories": [
            {
                "name": "Test Category",
                "existing": False,
                "subcategories": [
                    {
                        "name": "Test Subcategory",
                        "existing": False,
                        "skills": [
                            {
                                "name": "Test Skill One",
                                "existing": False,
                                "aliases": [
                                    {"phrase": "test skill synonym", "language": "EN"},
                                    {"phrase": "test skill nepali", "language": "NE_ROMANIZED"},
                                ],
                            },
                            {
                                "name": "Test Skill Two",
                                "existing": False,
                                "aliases": [],
                            },
                        ],
                    }
                ],
            }
        ],
    }


class PreprocessSkillPhraseTests(TestCase):
    def test_lowercases_and_trims(self):
        self.assertEqual(preprocess_skill_phrase("  House Wiring  "), "house wiring")

    def test_strips_punctuation(self):
        self.assertEqual(preprocess_skill_phrase("house-wiring!!"), "house wiring")

    def test_collapses_internal_whitespace(self):
        self.assertEqual(preprocess_skill_phrase("house    wiring"), "house wiring")

    def test_empty_input_returns_empty_string(self):
        self.assertEqual(preprocess_skill_phrase(""), "")
        self.assertEqual(preprocess_skill_phrase(None), "")


class NormalizeSkillPhraseTests(TestCase):
    """Service tests for the Week 2 skill-normalization pipeline."""

    def setUp(self):
        self.category = Category.objects.create(name="Construction & Repair")
        self.subcategory = Subcategory.objects.create(
            category=self.category,
            name="Electrical",
        )
        self.skill = SkillTag.objects.create(
            subcategory=self.subcategory,
            name="House Wiring",
        )
        self.alias = SkillAlias.objects.create(
            skill=self.skill,
            phrase="ghar wiring",
            language=SkillAlias.Language.NE_ROMANIZED,
        )

    def test_exact_standardized_name_match(self):
        result = normalize_skill_phrase("House Wiring")

        self.assertEqual(result.skill, self.skill)
        self.assertEqual(result.method, "exact_name")
        self.assertEqual(result.confidence, 100.0)

    def test_exact_standardized_name_match_is_case_insensitive(self):
        result = normalize_skill_phrase("house wiring")

        self.assertEqual(result.skill, self.skill)
        self.assertEqual(result.method, "exact_name")

    def test_exact_alias_match_romanized_nepali(self):
        """'ghar wiring' must resolve to 'House Wiring' (Week 2 demo requirement)."""

        result = normalize_skill_phrase("ghar wiring")

        self.assertEqual(result.skill, self.skill)
        self.assertEqual(result.method, "exact_alias")
        self.assertEqual(result.confidence, 100.0)

    def test_exact_alias_match_english_synonym(self):
        SkillAlias.objects.create(
            skill=self.skill,
            phrase="home wiring",
            language=SkillAlias.Language.ENGLISH,
        )

        result = normalize_skill_phrase("home wiring")

        self.assertEqual(result.skill, self.skill)
        self.assertEqual(result.method, "exact_alias")

    def test_fuzzy_match_above_threshold(self):
        # One character off from the standardized name; should be caught by
        # the RapidFuzz fallback rather than the exact-match branches.
        result = normalize_skill_phrase("House Wireing", threshold=80)

        self.assertEqual(result.skill, self.skill)
        self.assertEqual(result.method, "fuzzy")
        self.assertGreaterEqual(result.confidence, 80)

    def test_fuzzy_match_below_threshold_is_unmatched_and_recorded(self):
        result = normalize_skill_phrase("completely unrelated gibberish term", threshold=85)

        self.assertIsNone(result.skill)
        self.assertEqual(result.method, "unmatched")

        self.assertTrue(
            UnmatchedSkillTerm.objects.filter(
                normalized_term="completely unrelated gibberish term"
            ).exists()
        )

    def test_custom_threshold_overrides_default(self):
        # A near-miss that clears a lenient threshold but not a strict one.
        lenient = normalize_skill_phrase("House Wireing", threshold=50)
        strict = normalize_skill_phrase("House Wireing", threshold=99.9)

        self.assertIsNotNone(lenient.skill)
        self.assertIsNone(strict.skill)

    @override_settings(SKILL_MATCH_THRESHOLD=99.9)
    def test_default_threshold_is_read_from_settings(self):
        result = normalize_skill_phrase("House Wireing")

        self.assertIsNone(result.skill)
        self.assertEqual(result.method, "unmatched")

    def test_unmatched_term_occurrence_count_increments_on_repeat(self):
        normalize_skill_phrase("totally unknown skill", threshold=99.9)
        normalize_skill_phrase("Totally Unknown Skill!", threshold=99.9)

        term = UnmatchedSkillTerm.objects.get(normalized_term="totally unknown skill")
        self.assertEqual(term.occurrence_count, 2)

    def test_unmatched_term_records_best_candidate_and_score(self):
        normalize_skill_phrase("House Wireing", threshold=99.9)

        term = UnmatchedSkillTerm.objects.get(normalized_term="house wireing")
        self.assertEqual(term.best_candidate, self.skill)
        self.assertIsNotNone(term.best_candidate_score)
        self.assertLess(term.best_candidate_score, 99.9)

    def test_unmatched_term_defaults_to_pending_status(self):
        normalize_skill_phrase("totally unknown skill", threshold=99.9)

        term = UnmatchedSkillTerm.objects.get(normalized_term="totally unknown skill")
        self.assertEqual(term.status, UnmatchedSkillTerm.Status.PENDING)

    def test_record_unmatched_false_does_not_store_term(self):
        normalize_skill_phrase(
            "never stored gibberish",
            threshold=99.9,
            record_unmatched=False,
        )

        self.assertFalse(
            UnmatchedSkillTerm.objects.filter(normalized_term="never stored gibberish").exists()
        )

    def test_empty_phrase_is_unmatched_without_error(self):
        result = normalize_skill_phrase("   ")

        self.assertIsNone(result.skill)
        self.assertEqual(result.method, "unmatched")
        self.assertFalse(UnmatchedSkillTerm.objects.exists())

    def test_inactive_skill_is_not_matched(self):
        self.skill.is_active = False
        self.skill.save(update_fields=["is_active"])

        result = normalize_skill_phrase("House Wiring", threshold=99.9)

        self.assertIsNone(result.skill)

    def test_normalize_skill_phrases_splits_matched_and_unmatched(self):
        matched, unmatched = normalize_skill_phrases(
            ["House Wiring", "ghar wiring", "not a real skill"],
            threshold=99.9,
        )

        self.assertEqual(matched, [self.skill, self.skill])
        self.assertEqual(unmatched, ["not a real skill"])


class SkillAliasLanguageTests(TestCase):
    def test_default_language_is_unspecified(self):
        category = Category.objects.create(name="Domestic & Local Services")
        subcategory = Subcategory.objects.create(category=category, name="Cleaning")
        skill = SkillTag.objects.create(subcategory=subcategory, name="House Cleaning")

        alias = SkillAlias.objects.create(skill=skill, phrase="ghar safai")

        self.assertEqual(alias.language, SkillAlias.Language.UNSPECIFIED)


class SeedTaxonomyCaseInsensitiveReuseTests(TestCase):
    """Regression test for the House Wiring/House wiring duplication bug:
    seed_taxonomy must reuse an existing, differently-capitalized
    category/subcategory/skill tag instead of creating a duplicate."""

    def test_seed_reuses_existing_differently_cased_skill_tag(self):
        category = Category.objects.create(name="Construction & Repair")
        subcategory = Subcategory.objects.create(category=category, name="Electrical")
        pre_existing = SkillTag.objects.create(subcategory=subcategory, name="house wiring")

        call_command("seed_taxonomy")
        call_command("seed_taxonomy")

        matches = SkillTag.objects.filter(name__iexact="house wiring")
        self.assertEqual(matches.count(), 1)

        canonical = matches.first()
        self.assertEqual(canonical.id, pre_existing.id)

        result = normalize_skill_phrase("ghar wiring")
        self.assertEqual(result.skill, canonical)
        self.assertEqual(result.method, "exact_alias")

    def test_seed_run_twice_creates_no_duplicate_categories_or_subcategories(self):
        call_command("seed_taxonomy")
        call_command("seed_taxonomy")

        self.assertEqual(Category.objects.filter(name__iexact="Construction & Repair").count(), 1)
        self.assertEqual(
            Subcategory.objects.filter(
                category__name__iexact="Construction & Repair",
                name__iexact="Electrical",
            ).count(),
            1,
        )
        self.assertEqual(SkillTag.objects.filter(name__iexact="House Wiring").count(), 1)


class ConsolidateDuplicateSkillTagsMigrationTests(TestCase):
    """Regression test for the one-time data migration that merges
    pre-existing cross-tree duplicate SkillTags differing only by
    capitalization (e.g. seeded under different subcategories)."""

    def setUp(self):
        self.migration_module = import_module(
            "taxonomy.migrations.0003_consolidate_duplicate_skill_tags"
        )

    def test_migration_merges_duplicate_and_reassigns_all_references(self):
        from profiles.models import WorkerProfile

        # Redundant, pre-existing record under an unrelated category tree.
        category_a = Category.objects.create(name="Construction and Repair")
        subcategory_a = Subcategory.objects.create(category=category_a, name="Electrical Work")
        redundant = SkillTag.objects.create(subcategory=subcategory_a, name="House wiring")
        redundant_alias = SkillAlias.objects.create(
            skill=redundant, phrase="bijuli taar milaune"
        )

        # Canonical, properly seeded record.
        category_b = Category.objects.create(name="Construction & Repair")
        subcategory_b = Subcategory.objects.create(category=category_b, name="Electrical")
        canonical = SkillTag.objects.create(subcategory=subcategory_b, name="House Wiring")
        SkillAlias.objects.create(
            skill=canonical,
            phrase="ghar wiring",
            language=SkillAlias.Language.NE_ROMANIZED,
        )
        SkillAlias.objects.create(
            skill=canonical,
            phrase="home wiring",
            language=SkillAlias.Language.ENGLISH,
        )

        worker_user = User.objects.create_user(
            username="preexistingworker",
            phone_number="9877777777",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        worker_profile = WorkerProfile.objects.create(user=worker_user)
        worker_profile.skills.add(redundant)

        unmatched = UnmatchedSkillTerm.objects.create(
            raw_term="house wireing",
            normalized_term="house wireing",
            best_candidate=redundant,
            best_candidate_score=90.0,
        )

        self.migration_module.consolidate_duplicate_skill_tags(global_apps, None)

        matches = SkillTag.objects.filter(name__iexact="house wiring")
        self.assertEqual(matches.count(), 1)
        self.assertEqual(matches.first().id, canonical.id)
        self.assertFalse(SkillTag.objects.filter(id=redundant.id).exists())

        redundant_alias.refresh_from_db()
        self.assertEqual(redundant_alias.skill_id, canonical.id)

        worker_profile.refresh_from_db()
        self.assertIn(canonical, worker_profile.skills.all())

        unmatched.refresh_from_db()
        self.assertEqual(unmatched.best_candidate_id, canonical.id)

        result = normalize_skill_phrase("ghar wiring")
        self.assertEqual(result.skill, canonical)
        self.assertEqual(result.method, "exact_alias")

    def test_migration_is_a_no_op_when_no_duplicates_exist(self):
        category = Category.objects.create(name="Construction & Repair")
        subcategory = Subcategory.objects.create(category=category, name="Electrical")
        skill = SkillTag.objects.create(subcategory=subcategory, name="House Wiring")

        self.migration_module.consolidate_duplicate_skill_tags(global_apps, None)

        self.assertTrue(SkillTag.objects.filter(id=skill.id).exists())
        self.assertEqual(SkillTag.objects.filter(name__iexact="house wiring").count(), 1)


class TaxonomyPublicAPITests(APITestCase):
    """Week 6 read-only taxonomy API: /api/taxonomy/categories|subcategories|skills|tree/."""

    def setUp(self):
        # Created out of alphabetical order deliberately, to prove
        # ordering is enforced by the API rather than accidental.
        self.cat_domestic = Category.objects.create(name="Domestic & Local Services")
        self.cat_construction = Category.objects.create(name="Construction & Repair")

        self.sub_plumbing = Subcategory.objects.create(
            category=self.cat_construction, name="Plumbing"
        )
        self.sub_electrical = Subcategory.objects.create(
            category=self.cat_construction, name="Electrical"
        )
        self.sub_cleaning = Subcategory.objects.create(
            category=self.cat_domestic, name="Cleaning"
        )

        self.skill_wiring_repair = SkillTag.objects.create(
            subcategory=self.sub_electrical, name="Wiring Repair"
        )
        self.skill_house_wiring = SkillTag.objects.create(
            subcategory=self.sub_electrical, name="House Wiring"
        )
        self.skill_inactive = SkillTag.objects.create(
            subcategory=self.sub_electrical, name="Deprecated Skill", is_active=False
        )
        self.skill_house_cleaning = SkillTag.objects.create(
            subcategory=self.sub_cleaning, name="House Cleaning"
        )

        SkillAlias.objects.create(skill=self.skill_house_wiring, phrase="ghar wiring")
        UnmatchedSkillTerm.objects.create(
            raw_term="totally weird term",
            normalized_term="totally weird term",
            best_candidate=self.skill_house_wiring,
        )

    # --- categories/ ---

    def test_category_list_is_public(self):
        response = self.client.get(reverse("taxonomy:categories"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_category_list_alphabetical_order(self):
        response = self.client.get(reverse("taxonomy:categories"))

        names = [item["name"] for item in response.data]
        self.assertEqual(
            names, ["Construction & Repair", "Domestic & Local Services"]
        )

    def test_category_fields_are_minimal(self):
        response = self.client.get(reverse("taxonomy:categories"))

        self.assertEqual(set(response.data[0].keys()), {"id", "name"})

    # --- subcategories/ ---

    def test_subcategory_list_is_public_and_alphabetical(self):
        response = self.client.get(reverse("taxonomy:subcategories"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [item["name"] for item in response.data]
        self.assertEqual(names, sorted(names))

    def test_subcategory_filter_by_category(self):
        response = self.client.get(
            reverse("taxonomy:subcategories"), {"category": self.cat_construction.id}
        )

        names = [item["name"] for item in response.data]
        self.assertEqual(names, ["Electrical", "Plumbing"])

    def test_subcategory_filter_by_unknown_category_returns_empty_list(self):
        response = self.client.get(
            reverse("taxonomy:subcategories"), {"category": 999999}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_subcategory_filter_by_non_integer_category_is_bad_request(self):
        response = self.client.get(
            reverse("taxonomy:subcategories"), {"category": "not-a-number"}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # --- skills/ ---

    def test_skill_list_is_public_alphabetical_and_active_only(self):
        response = self.client.get(reverse("taxonomy:skills"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [item["name"] for item in response.data]
        self.assertEqual(names, sorted(names))
        self.assertNotIn("Deprecated Skill", names)

    def test_skill_filter_by_subcategory(self):
        response = self.client.get(
            reverse("taxonomy:skills"), {"subcategory": self.sub_electrical.id}
        )

        names = [item["name"] for item in response.data]
        self.assertEqual(names, ["House Wiring", "Wiring Repair"])

    def test_skill_filter_by_subcategory_excludes_inactive(self):
        response = self.client.get(
            reverse("taxonomy:skills"), {"subcategory": self.sub_electrical.id}
        )

        names = [item["name"] for item in response.data]
        self.assertNotIn("Deprecated Skill", names)

    def test_skill_search_matches_partial_case_insensitive(self):
        response = self.client.get(reverse("taxonomy:skills"), {"search": "wiring"})

        names = {item["name"] for item in response.data}
        self.assertEqual(names, {"House Wiring", "Wiring Repair"})

        response = self.client.get(reverse("taxonomy:skills"), {"search": "HOUSE"})
        names = {item["name"] for item in response.data}
        self.assertEqual(names, {"House Wiring", "House Cleaning"})

    def test_skill_search_combined_with_subcategory_filter(self):
        response = self.client.get(
            reverse("taxonomy:skills"),
            {"search": "house", "subcategory": self.sub_cleaning.id},
        )

        names = [item["name"] for item in response.data]
        self.assertEqual(names, ["House Cleaning"])

    def test_skill_filter_by_non_integer_subcategory_is_bad_request(self):
        response = self.client.get(reverse("taxonomy:skills"), {"subcategory": "abc"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # --- tree/ ---

    def test_tree_is_public(self):
        response = self.client.get(reverse("taxonomy:tree"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_tree_structure_is_nested_and_alphabetical_at_every_level(self):
        response = self.client.get(reverse("taxonomy:tree"))
        data = response.data

        category_names = [c["name"] for c in data]
        self.assertEqual(
            category_names, ["Construction & Repair", "Domestic & Local Services"]
        )

        construction = next(c for c in data if c["name"] == "Construction & Repair")
        subcategory_names = [s["name"] for s in construction["subcategories"]]
        self.assertEqual(subcategory_names, ["Electrical", "Plumbing"])

        electrical = next(
            s for s in construction["subcategories"] if s["name"] == "Electrical"
        )
        skill_names = [sk["name"] for sk in electrical["skills"]]
        self.assertEqual(skill_names, ["House Wiring", "Wiring Repair"])

    def test_tree_excludes_inactive_skills(self):
        response = self.client.get(reverse("taxonomy:tree"))

        all_skill_names = [
            sk["name"]
            for c in response.data
            for s in c["subcategories"]
            for sk in s["skills"]
        ]
        self.assertNotIn("Deprecated Skill", all_skill_names)

    def test_tree_uses_a_bounded_number_of_queries(self):
        # One query for categories, one for subcategories (prefetched),
        # one for skills (nested prefetch) - independent of tree size.
        with self.assertNumQueries(3):
            self.client.get(reverse("taxonomy:tree"))

    def test_no_admin_or_review_fields_leak_into_any_public_response(self):
        forbidden_keys = {
            "is_active",
            "created_at",
            "occurrence_count",
            "best_candidate",
            "best_candidate_score",
            "submitted_by",
            "status",
            "resolved_skill",
            "resolved_by",
            "normalized_term",
            "raw_term",
        }

        for url_name in (
            "taxonomy:categories",
            "taxonomy:subcategories",
            "taxonomy:skills",
            "taxonomy:tree",
        ):
            response = self.client.get(reverse(url_name))
            body = json.dumps(response.data)
            for forbidden in forbidden_keys:
                self.assertNotIn(
                    f'"{forbidden}"',
                    body,
                    msg=f"{forbidden!r} leaked into {url_name} response",
                )

    def test_unmatched_term_text_never_appears_in_public_responses(self):
        for url_name in (
            "taxonomy:categories",
            "taxonomy:subcategories",
            "taxonomy:skills",
            "taxonomy:tree",
        ):
            response = self.client.get(reverse(url_name))
            self.assertNotIn("totally weird term", json.dumps(response.data))


class TaxonomyAdminTests(TestCase):
    """Admin usability and safe unmatched-term review tests."""

    def setUp(self):
        self.superuser = User.objects.create_superuser(
            username="taxonomyadmin",
            phone_number="9800000201",
            password="AdminPassword123!",
        )

        self.category = Category.objects.create(name="Construction & Repair")
        self.subcategory = Subcategory.objects.create(category=self.category, name="Electrical")
        self.skill = SkillTag.objects.create(subcategory=self.subcategory, name="House Wiring")
        self.alias = SkillAlias.objects.create(
            skill=self.skill,
            phrase="ghar wiring",
            language=SkillAlias.Language.NE_ROMANIZED,
        )

        self.other_skill = SkillTag.objects.create(subcategory=self.subcategory, name="Fan Installation")
        self.unmatched_term = UnmatchedSkillTerm.objects.create(
            raw_term="fan lagaune",
            normalized_term="fan lagaune",
            best_candidate=self.other_skill,
            best_candidate_score=92.0,
        )

    def _get(self, url_name, params=None):
        self.client.force_login(self.superuser)
        return self.client.get(reverse(url_name), params or {})

    def test_every_taxonomy_changelist_is_accessible_to_superuser(self):
        for url_name in (
            "admin:taxonomy_category_changelist",
            "admin:taxonomy_subcategory_changelist",
            "admin:taxonomy_skilltag_changelist",
            "admin:taxonomy_skillalias_changelist",
            "admin:taxonomy_unmatchedskillterm_changelist",
        ):
            with self.subTest(url_name=url_name):
                response = self._get(url_name)
                self.assertEqual(response.status_code, 200)

    def test_skill_tag_search_by_name(self):
        response = self._get("admin:taxonomy_skilltag_changelist", {"q": "House Wiring"})
        self.assertContains(response, "House Wiring")

    def test_skill_alias_search_by_phrase(self):
        response = self._get("admin:taxonomy_skillalias_changelist", {"q": "ghar wiring"})
        self.assertContains(response, "ghar wiring")

    def test_skill_tag_subcategory_filter_loads(self):
        response = self._get(
            "admin:taxonomy_skilltag_changelist",
            {"subcategory__id__exact": self.subcategory.pk},
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "House Wiring")

    def test_unmatched_term_status_filter_loads(self):
        response = self._get(
            "admin:taxonomy_unmatchedskillterm_changelist",
            {"status": UnmatchedSkillTerm.Status.PENDING},
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "fan lagaune")

    def test_resolve_using_best_candidate_action_still_creates_alias_and_resolves_term(self):
        self.client.force_login(self.superuser)

        response = self.client.post(
            reverse("admin:taxonomy_unmatchedskillterm_changelist"),
            {
                "action": "resolve_using_best_candidate",
                "_selected_action": [str(self.unmatched_term.pk)],
            },
            follow=True,
        )

        self.assertEqual(response.status_code, 200)

        self.unmatched_term.refresh_from_db()
        self.assertEqual(self.unmatched_term.status, UnmatchedSkillTerm.Status.RESOLVED)
        self.assertEqual(self.unmatched_term.resolved_skill, self.other_skill)
        self.assertTrue(
            SkillAlias.objects.filter(phrase="fan lagaune", skill=self.other_skill).exists()
        )

    def test_resolve_action_does_not_misreport_conflicting_existing_alias(self):
        SkillAlias.objects.create(
            phrase=self.unmatched_term.normalized_term,
            skill=self.skill,
        )
        self.client.force_login(self.superuser)

        response = self.client.post(
            reverse("admin:taxonomy_unmatchedskillterm_changelist"),
            {
                "action": "resolve_using_best_candidate",
                "_selected_action": [str(self.unmatched_term.pk)],
            },
            follow=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Skipped 1 alias conflict")
        self.unmatched_term.refresh_from_db()
        self.assertEqual(
            self.unmatched_term.status, UnmatchedSkillTerm.Status.PENDING
        )
        self.assertIsNone(self.unmatched_term.resolved_skill)
        self.assertEqual(
            SkillAlias.objects.get(
                phrase=self.unmatched_term.normalized_term
            ).skill,
            self.skill,
        )

    def test_reject_unmatched_terms_action_only_uses_an_existing_status_value(self):
        self.client.force_login(self.superuser)

        self.client.post(
            reverse("admin:taxonomy_unmatchedskillterm_changelist"),
            {
                "action": "reject_unmatched_terms",
                "_selected_action": [str(self.unmatched_term.pk)],
            },
            follow=True,
        )

        self.unmatched_term.refresh_from_db()
        self.assertIn(self.unmatched_term.status, UnmatchedSkillTerm.Status.values)
        self.assertEqual(self.unmatched_term.status, UnmatchedSkillTerm.Status.REJECTED)

    def test_reject_action_does_not_rewrite_resolved_term(self):
        self.unmatched_term.status = UnmatchedSkillTerm.Status.RESOLVED
        self.unmatched_term.resolved_skill = self.other_skill
        self.unmatched_term.save(
            update_fields=["status", "resolved_skill", "updated_at"]
        )
        self.client.force_login(self.superuser)

        self.client.post(
            reverse("admin:taxonomy_unmatchedskillterm_changelist"),
            {
                "action": "reject_unmatched_terms",
                "_selected_action": [str(self.unmatched_term.pk)],
            },
            follow=True,
        )

        self.unmatched_term.refresh_from_db()
        self.assertEqual(
            self.unmatched_term.status, UnmatchedSkillTerm.Status.RESOLVED
        )
        self.assertEqual(self.unmatched_term.resolved_skill, self.other_skill)

    def test_non_staff_user_cannot_access_taxonomy_admin(self):
        worker = User.objects.create_user(
            username="taxonomynonstaff",
            phone_number="9800000202",
            password="WorkerPassword123!",
        )
        self.client.force_login(worker)

        response = self.client.get(reverse("admin:taxonomy_category_changelist"))

        self.assertEqual(response.status_code, 302)
        self.assertIn("/admin/login/", response.url)


class TaxonomyDataValidationTests(TestCase):
    """Unit tests for the curated-data validation used by
    `seed_taxonomy` (Week 6 taxonomy v1), independent of the real data
    file - each test builds its own minimal fixture so a bug in the big
    curated dataset can never mask a bug in the validation logic itself.
    """

    def test_valid_minimal_dataset_passes(self):
        validate_taxonomy_data(_minimal_valid_dataset()["categories"])

    def test_empty_category_name_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["name"] = "   "

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_empty_subcategory_name_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"][0]["name"] = ""

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_empty_skill_name_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"][0]["skills"][0]["name"] = ""

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_duplicate_category_name_case_variant_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"].append({
            "name": "test category",
            "existing": False,
            "subcategories": data["categories"][0]["subcategories"],
        })

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_duplicate_subcategory_punctuation_or_case_variant_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"].append({
            "name": "test-subcategory!",
            "existing": False,
            "skills": [{"name": "Another Skill", "existing": False, "aliases": []}],
        })

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_duplicate_skill_within_subcategory_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"][0]["skills"].append(
            {"name": "test skill one", "existing": False, "aliases": []}
        )

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_generic_overly_broad_skill_name_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"][0]["skills"][0]["name"] = "General Labor"

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_alias_with_invalid_language_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"][0]["skills"][0]["aliases"] = [
            {"phrase": "bad language alias", "language": "FRENCH"}
        ]

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_alias_repeating_its_own_skill_name_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"][0]["skills"][0]["aliases"] = [
            {"phrase": "Test Skill One", "language": "EN"}
        ]

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_alias_matching_a_different_skills_canonical_name_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"][0]["skills"][0]["aliases"] = [
            {"phrase": "Test Skill Two", "language": "EN"}
        ]

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_same_normalized_alias_pointing_to_two_different_skills_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"][0]["skills"][0]["aliases"] = [
            {"phrase": "shared alias phrase", "language": "EN"}
        ]
        data["categories"][0]["subcategories"][0]["skills"][1]["aliases"] = [
            {"phrase": "Shared Alias Phrase", "language": "EN"}
        ]

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(data["categories"])

    def test_alias_colliding_with_a_different_skill_already_in_database_is_rejected(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"][0]["skills"][0]["aliases"] = [
            {"phrase": "already taken phrase", "language": "EN"}
        ]

        with self.assertRaises(TaxonomyDataError):
            validate_taxonomy_data(
                data["categories"],
                existing_alias_owner=lambda phrase: (
                    "Some Other Existing Skill" if phrase == "already taken phrase" else None
                ),
            )

    def test_alias_matching_database_owner_of_the_same_skill_is_accepted(self):
        data = _minimal_valid_dataset()
        data["categories"][0]["subcategories"][0]["skills"][0]["aliases"] = [
            {"phrase": "already taken phrase", "language": "EN"}
        ]

        validate_taxonomy_data(
            data["categories"],
            existing_alias_owner=lambda phrase: (
                "Test Skill One" if phrase == "already taken phrase" else None
            ),
        )

    def test_missing_categories_key_is_rejected_at_load_time(self):
        path = _write_json_tempfile({"not_categories": []})

        with self.assertRaises(TaxonomyDataError):
            load_taxonomy_data(path)

    def test_malformed_json_is_rejected_at_load_time(self):
        handle = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        handle.write("{not valid json")
        handle.close()

        with self.assertRaises(TaxonomyDataError):
            load_taxonomy_data(handle.name)

    def test_missing_file_is_rejected_at_load_time(self):
        with self.assertRaises(TaxonomyDataError):
            load_taxonomy_data("/nonexistent/path/does-not-exist.json")


class SeedTaxonomyTransactionRollbackTests(TestCase):
    """Invalid curated data must never leave partial rows behind (Week 6
    taxonomy v1 requirement)."""

    def test_invalid_data_raises_command_error_and_writes_nothing(self):
        path = _write_json_tempfile({
            "categories": [
                {
                    "name": "Broken Category",
                    "subcategories": [
                        {
                            "name": "Broken Subcategory",
                            "skills": [
                                {
                                    "name": "Skill A",
                                    "aliases": [{"phrase": "shared phrase", "language": "EN"}],
                                },
                                {
                                    "name": "Skill B",
                                    "aliases": [{"phrase": "shared phrase", "language": "EN"}],
                                },
                            ],
                        }
                    ],
                }
            ]
        })

        with self.assertRaises(CommandError):
            call_command("seed_taxonomy", file=path)

        self.assertEqual(Category.objects.count(), 0)
        self.assertEqual(Subcategory.objects.count(), 0)
        self.assertEqual(SkillTag.objects.count(), 0)
        self.assertEqual(SkillAlias.objects.count(), 0)

    def test_malformed_json_raises_command_error_and_writes_nothing(self):
        handle = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        handle.write("{this is not json")
        handle.close()

        with self.assertRaises(CommandError):
            call_command("seed_taxonomy", file=handle.name)

        self.assertEqual(Category.objects.count(), 0)

    def test_db_level_failure_partway_through_rolls_back_everything(self):
        """Even data that passes validation must not leave partial rows
        if something fails while writing it - proves the load runs
        inside one real database transaction, not just that validation
        happens to catch bad input upfront."""

        with patch(
            "taxonomy.management.commands.seed_taxonomy._get_or_create_alias",
            side_effect=RuntimeError("simulated failure partway through the load"),
        ):
            with self.assertRaises(RuntimeError):
                call_command("seed_taxonomy", file=str(DEFAULT_DATA_FILE))

        # The very first skill processed ("House Wiring") already has
        # aliases, so the category/subcategory/skill rows for it are
        # created and then the mocked failure fires on its first alias.
        # If the load were not wrapped in one real transaction, that
        # category/subcategory/skill would still be present here.
        self.assertEqual(Category.objects.count(), 0)
        self.assertEqual(Subcategory.objects.count(), 0)
        self.assertEqual(SkillTag.objects.count(), 0)


class SeedTaxonomyV1CommandTests(TestCase):
    """Tests against the real curated v1 dataset
    (taxonomy/data/taxonomy_v1.json), run once per class via
    setUpTestData since a full load touches several hundred rows."""

    @classmethod
    def setUpTestData(cls):
        call_command("seed_taxonomy")

    def test_meets_minimum_category_count(self):
        self.assertGreaterEqual(Category.objects.count(), 12)

    def test_meets_minimum_subcategory_count(self):
        self.assertGreaterEqual(Subcategory.objects.count(), 45)

    def test_meets_minimum_standardized_skill_count(self):
        self.assertGreaterEqual(SkillTag.objects.count(), 300)

    def test_meets_minimum_alias_count(self):
        self.assertGreaterEqual(SkillAlias.objects.count(), 200)

    def test_required_occupational_areas_are_present(self):
        expected_categories = {
            "Construction & Repair",
            "Domestic & Local Services",
            "Hospitality & Food Services",
            "Driving & Delivery",
            "Security Services",
            "Facility & Property Maintenance",
            "Caregiving & Personal Support",
            "Retail & Customer Service",
            "Office & Administrative Support",
            "Event & Temporary Work",
        }
        actual_categories = set(Category.objects.values_list("name", flat=True))
        self.assertTrue(expected_categories.issubset(actual_categories))

    def test_existing_week2_categories_are_not_duplicated(self):
        self.assertEqual(
            Category.objects.filter(name__iexact="Construction & Repair").count(), 1
        )
        self.assertEqual(
            Category.objects.filter(name__iexact="Domestic & Local Services").count(), 1
        )

    def test_existing_week2_subcategories_are_reused_under_the_same_category(self):
        construction = Category.objects.get(name="Construction & Repair")
        for name in ("Electrical", "Plumbing", "Masonry"):
            self.assertEqual(
                Subcategory.objects.filter(category=construction, name__iexact=name).count(),
                1,
                msg=f"{name} should exist exactly once under Construction & Repair",
            )

    def test_existing_week2_alias_still_resolves_to_the_same_skill(self):
        result = normalize_skill_phrase("ghar wiring")

        self.assertIsNotNone(result.skill)
        self.assertEqual(result.skill.name, "House Wiring")
        self.assertEqual(result.method, "exact_alias")

    def test_new_v1_alias_resolves_to_its_intended_skill(self):
        result = normalize_skill_phrase("budhesakal herchah")

        self.assertIsNotNone(result.skill)
        self.assertEqual(result.skill.name, "Elderly Personal Care")
        self.assertEqual(result.method, "exact_alias")

    def test_english_alias_normalization_is_case_insensitive(self):
        lower = normalize_skill_phrase("home wiring")
        mixed_case = normalize_skill_phrase("Home WIRING")

        self.assertEqual(lower.skill, mixed_case.skill)
        self.assertEqual(mixed_case.method, "exact_alias")

    def test_romanized_nepali_alias_normalization_is_case_insensitive(self):
        lower = normalize_skill_phrase("ghar wiring")
        mixed_case = normalize_skill_phrase("Ghar Wiring")

        self.assertEqual(lower.skill, mixed_case.skill)
        self.assertEqual(mixed_case.method, "exact_alias")

    def test_rerun_creates_no_duplicates_and_leaves_counts_unchanged(self):
        category_count = Category.objects.count()
        subcategory_count = Subcategory.objects.count()
        skill_count = SkillTag.objects.count()
        alias_count = SkillAlias.objects.count()

        call_command("seed_taxonomy")

        self.assertEqual(Category.objects.count(), category_count)
        self.assertEqual(Subcategory.objects.count(), subcategory_count)
        self.assertEqual(SkillTag.objects.count(), skill_count)
        self.assertEqual(SkillAlias.objects.count(), alias_count)

    def test_api_tree_endpoint_query_count_stays_bounded_at_v1_scale(self):
        client = APITestCase.client_class()

        with self.assertNumQueries(3):
            response = client.get(reverse("taxonomy:tree"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_api_response_shapes_are_unchanged_at_v1_scale(self):
        client = APITestCase.client_class()

        categories_response = client.get(reverse("taxonomy:categories"))
        self.assertEqual(categories_response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(categories_response.data[0].keys()), {"id", "name"})

        subcategories_response = client.get(reverse("taxonomy:subcategories"))
        self.assertEqual(subcategories_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(subcategories_response.data[0].keys()), {"id", "name", "category"}
        )

        skills_response = client.get(reverse("taxonomy:skills"))
        self.assertEqual(skills_response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(skills_response.data[0].keys()), {"id", "name", "subcategory"})

        tree_response = client.get(reverse("taxonomy:tree"))
        self.assertEqual(tree_response.status_code, status.HTTP_200_OK)
        first_category = tree_response.data[0]
        self.assertEqual(set(first_category.keys()), {"id", "name", "subcategories"})
        first_subcategory = first_category["subcategories"][0]
        self.assertEqual(set(first_subcategory.keys()), {"id", "name", "skills"})
        if first_subcategory["skills"]:
            self.assertEqual(set(first_subcategory["skills"][0].keys()), {"id", "name"})


class SeedTaxonomyPreservesExistingRelationshipsTests(TestCase):
    """Worker and job skill relationships must survive an idempotent
    re-run of seed_taxonomy untouched (Week 6 taxonomy v1 requirement)."""

    def setUp(self):
        call_command("seed_taxonomy")

        self.electrical_skill = SkillTag.objects.get(
            name="House Wiring", subcategory__name="Electrical"
        )
        self.cleaning_skill = SkillTag.objects.get(
            name="House Cleaning", subcategory__name="Cleaning"
        )

        worker_user = User.objects.create_user(
            username="taxonomyworker",
            phone_number="9800000301",
            password="WorkerPassword123!",
            role=User.Role.WORKER,
        )
        from profiles.models import WorkerProfile

        self.worker_profile = WorkerProfile.objects.create(user=worker_user)
        self.worker_profile.skills.add(self.electrical_skill)

        from profiles.models import EmployerProfile

        employer_user = User.objects.create_user(
            username="taxonomyemployer",
            phone_number="9800000302",
            password="EmployerPassword123!",
            role=User.Role.EMPLOYER,
        )
        employer_profile = EmployerProfile.objects.create(
            user=employer_user,
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
        )

        from jobs.models import JobPost

        self.job = JobPost.objects.create(
            employer=employer_profile,
            title="Test Wiring Job",
            category=self.electrical_skill.subcategory.category,
            subcategory=self.electrical_skill.subcategory,
            description="Test job for relationship-preservation coverage.",
            address="Kathmandu",
            latitude=Decimal("27.700000"),
            longitude=Decimal("85.300000"),
            wage_amount=Decimal("1000.00"),
        )
        self.job.required_skills.add(self.electrical_skill)
        self.job.preferred_skills.add(self.cleaning_skill)

    def test_worker_skill_relationship_survives_rerun(self):
        call_command("seed_taxonomy")

        self.worker_profile.refresh_from_db()
        self.assertIn(self.electrical_skill, self.worker_profile.skills.all())
        self.assertEqual(self.worker_profile.skills.get().id, self.electrical_skill.id)

    def test_job_required_and_preferred_skills_survive_rerun(self):
        call_command("seed_taxonomy")

        self.job.refresh_from_db()
        self.assertIn(self.electrical_skill, self.job.required_skills.all())
        self.assertIn(self.cleaning_skill, self.job.preferred_skills.all())

    def test_skill_ids_are_unchanged_after_rerun(self):
        electrical_id_before = self.electrical_skill.id

        call_command("seed_taxonomy")

        electrical_after = SkillTag.objects.get(
            name="House Wiring", subcategory__name="Electrical"
        )
        self.assertEqual(electrical_after.id, electrical_id_before)


class SeedTaxonomyReusesArbitraryExistingRecordsTests(TestCase):
    """General reuse-not-duplicate coverage beyond the two Week 2
    hardcoded regression tests above - a differently-cased pre-existing
    row anywhere in the curated tree must be reused, not duplicated."""

    def test_differently_cased_new_v1_category_is_reused(self):
        pre_existing = Category.objects.create(name="hospitality & food services")

        call_command("seed_taxonomy")

        matches = Category.objects.filter(name__iexact="Hospitality & Food Services")
        self.assertEqual(matches.count(), 1)
        self.assertEqual(matches.first().id, pre_existing.id)
        self.assertEqual(matches.first().name, "Hospitality & Food Services")

    def test_differently_cased_new_v1_subcategory_is_reused(self):
        category = Category.objects.create(name="Driving & Delivery")
        pre_existing = Subcategory.objects.create(category=category, name="car & taxi driving")

        call_command("seed_taxonomy")

        matches = Subcategory.objects.filter(category=category, name__iexact="Car & Taxi Driving")
        self.assertEqual(matches.count(), 1)
        self.assertEqual(matches.first().id, pre_existing.id)

    def test_differently_cased_new_v1_skill_is_reused(self):
        category = Category.objects.create(name="Security Services")
        subcategory = Subcategory.objects.create(category=category, name="Security Guarding")
        pre_existing = SkillTag.objects.create(subcategory=subcategory, name="premises patrolling")

        call_command("seed_taxonomy")

        matches = SkillTag.objects.filter(subcategory=subcategory, name__iexact="Premises Patrolling")
        self.assertEqual(matches.count(), 1)
        self.assertEqual(matches.first().id, pre_existing.id)
