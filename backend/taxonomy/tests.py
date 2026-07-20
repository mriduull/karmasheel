import json
from importlib import import_module

from django.apps import apps as global_apps
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Category, SkillAlias, SkillTag, Subcategory, UnmatchedSkillTerm
from .services import normalize_skill_phrase, normalize_skill_phrases, preprocess_skill_phrase


User = get_user_model()


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
    """Week 6 admin usability tests for the taxonomy app. Does not modify
    the existing resolve/reject UnmatchedSkillTerm behaviour - only
    verifies it still works as-is."""

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
