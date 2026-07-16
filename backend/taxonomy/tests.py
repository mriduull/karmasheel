from importlib import import_module

from django.apps import apps as global_apps
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings

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
