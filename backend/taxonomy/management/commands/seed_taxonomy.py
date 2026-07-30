"""Seed the standardized taxonomy (categories, subcategories, skills, and
English/Romanized-Nepali aliases) from the curated, versioned data file at
``taxonomy/data/taxonomy_v1.json`` (see docs/TAXONOMY_SOURCE_AUDIT.md and
docs/TAXONOMY_ATTRIBUTION.md for how that file was designed and sourced).

Safe to run repeatedly (idempotent): every category/subcategory/skill is
matched case-insensitively within its parent scope, and every alias is
matched by its (globally unique) phrase, so re-running never creates a
duplicate - existing rows are reused and, where their descriptive fields
(name casing, is_active, alias language) differ from the curated data,
updated in place. Nothing present in the database but absent from the
JSON file is ever deleted - the loader only ever adds or updates.

The whole load runs inside one transaction: if the curated data fails
validation, or a database error occurs partway through, no partial
taxonomy is left behind.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from taxonomy.models import Category, SkillAlias, SkillTag, Subcategory

VALID_LANGUAGES = {choice for choice, _label in SkillAlias.Language.choices}

DEFAULT_DATA_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "taxonomy_v1.json"

# Overly broad / non-actionable phrases that must never appear as a
# standardized skill name - they would trivially inflate every worker's
# and job's required-skill coverage score without meaning anything
# specific. See docs/TAXONOMY_SOURCE_AUDIT.md §9 (deduplication rules).
GENERIC_SKILL_NAME_BLOCKLIST = {
    "general work",
    "general labor",
    "general labour",
    "manual labor",
    "manual labour",
    "hard worker",
    "hard working",
    "team player",
    "teamwork",
    "good communication",
    "communication skills",
    "problem solving",
    "any work",
    "all work",
    "willing to work",
}


class TaxonomyDataError(Exception):
    """Raised when the curated taxonomy JSON fails validation. Caught by
    the command and re-raised as a CommandError so it surfaces as a clean
    CLI error rather than a traceback, and so tests can assert on it
    without depending on Django's CommandError formatting."""


def _normalize(text):
    """Lowercase and collapse whitespace - used for name/phrase matching
    and equality checks throughout this module."""

    return " ".join((text or "").strip().lower().split())


def _normalize_punctuation_insensitive(text):
    """Like `_normalize`, but also strips punctuation, so 'Electrical Work'
    / 'electrical-work' / 'Electrical  Work!' are recognised as the same
    name for duplicate detection. Deliberately does not treat symbol/word
    equivalents (e.g. '&' vs 'and') as identical - that judgement call is
    made by a human during curation (see docs/TAXONOMY_SOURCE_AUDIT.md),
    not inferred automatically."""

    normalized = _normalize(text)
    # Punctuation becomes a word separator (space), not simply removed -
    # otherwise "test-subcategory" would collapse into one token
    # ("testsubcategory") instead of matching the two-token "test
    # subcategory", defeating the duplicate check entirely.
    despaced = "".join(ch if (ch.isalnum() or ch.isspace()) else " " for ch in normalized)
    return despaced.split()


def load_taxonomy_data(path):
    """Read and structurally parse the curated JSON file. Raises
    TaxonomyDataError with a clear message on any structural problem -
    never lets a raw JSONDecodeError/KeyError escape to the caller."""

    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError as exc:
        raise TaxonomyDataError(f"Taxonomy data file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise TaxonomyDataError(f"Taxonomy data file is not valid JSON: {exc}") from exc

    if not isinstance(raw, dict) or "categories" not in raw:
        raise TaxonomyDataError(
            "Taxonomy data must be a JSON object with a top-level 'categories' list."
        )

    categories = raw["categories"]

    if not isinstance(categories, list) or not categories:
        raise TaxonomyDataError("'categories' must be a non-empty list.")

    return categories


def validate_taxonomy_data(categories, *, existing_alias_owner=None):
    """Validate the full curated dataset before any database mutation.

    Checks (see docs/TAXONOMY_SOURCE_AUDIT.md §9 and this task's own
    validation requirements):
      - every category/subcategory/skill name is non-empty
      - categories are not duplicated by case
      - subcategories are not duplicated by case/punctuation within a
        category
      - canonical skill names are unique within their subcategory
        (matches the SkillTag DB constraint)
      - skill names are not on the generic/overly-broad blocklist
      - every alias has a valid language and a non-empty phrase
      - an alias phrase never repeats its own skill's canonical name
      - an alias phrase never equals a *different* skill's canonical name
      - one normalized alias phrase never points at two different skills,
        either within the file or against the live database

    `existing_alias_owner`: optional callable(normalized_phrase) ->
    existing skill name currently owning that phrase in the database, or
    None if unowned. Omit (or pass None) to skip the database
    cross-check, e.g. when validating a fixture in isolation.

    Raises TaxonomyDataError on the first problem found. Returns nothing;
    the caller re-walks the (now known-valid) data to write it.
    """

    if existing_alias_owner is None:
        existing_alias_owner = lambda _phrase: None  # noqa: E731

    seen_category_keys = {}
    all_skill_names_by_key = {}  # normalized skill name -> display name (whole file)
    all_alias_phrases_by_key = {}  # normalized phrase -> owning skill display name (whole file)

    # First pass: collect every canonical skill name so alias-vs-
    # different-skill-name collisions can be detected regardless of
    # declaration order.
    for category in categories:
        for subcategory in _require_list(category, "subcategories", context=_category_label(category)):
            for skill in _require_list(
                subcategory, "skills", context=_subcategory_label(category, subcategory)
            ):
                skill_name = skill.get("name") if isinstance(skill, dict) else None
                if isinstance(skill_name, str) and skill_name.strip():
                    all_skill_names_by_key[_normalize(skill_name)] = skill_name

    for cat_index, category in enumerate(categories):
        cat_name = _require_name(category, f"Category at index {cat_index}")
        cat_key = _normalize(cat_name)

        if cat_key in seen_category_keys:
            raise TaxonomyDataError(
                f"Duplicate category '{cat_name}' collides with "
                f"'{seen_category_keys[cat_key]}' (case variant)."
            )
        seen_category_keys[cat_key] = cat_name

        subcategories = _require_list(category, "subcategories", context=cat_name)
        seen_subcat_keys = {}

        for sub_index, subcategory in enumerate(subcategories):
            sub_name = _require_name(
                subcategory, f"Subcategory at index {sub_index} under '{cat_name}'"
            )
            sub_punct_key = tuple(_normalize_punctuation_insensitive(sub_name))

            if sub_punct_key in seen_subcat_keys:
                raise TaxonomyDataError(
                    f"Subcategory '{sub_name}' under '{cat_name}' duplicates "
                    f"'{seen_subcat_keys[sub_punct_key]}' (punctuation/case variant)."
                )
            seen_subcat_keys[sub_punct_key] = sub_name

            skills = _require_list(
                subcategory, "skills", context=f"{cat_name} / {sub_name}"
            )
            seen_skill_keys_local = {}

            for skill_index, skill in enumerate(skills):
                skill_name = _require_name(
                    skill, f"Skill at index {skill_index} under '{cat_name} / {sub_name}'"
                )
                skill_key = _normalize(skill_name)

                if skill_key in GENERIC_SKILL_NAME_BLOCKLIST:
                    raise TaxonomyDataError(
                        f"Skill '{skill_name}' under '{cat_name} / {sub_name}' is too broad/generic "
                        "to be a standardized skill (see docs/TAXONOMY_SOURCE_AUDIT.md §9)."
                    )

                if skill_key in seen_skill_keys_local:
                    raise TaxonomyDataError(
                        f"Duplicate skill '{skill_name}' under '{cat_name} / {sub_name}'."
                    )
                seen_skill_keys_local[skill_key] = skill_name

                aliases = skill.get("aliases", [])
                if not isinstance(aliases, list):
                    raise TaxonomyDataError(f"Aliases for skill '{skill_name}' must be a list.")

                seen_alias_keys_local = set()

                for alias in aliases:
                    if not isinstance(alias, dict):
                        raise TaxonomyDataError(f"Malformed alias entry for skill '{skill_name}'.")

                    phrase = alias.get("phrase")
                    language = alias.get("language")

                    if not isinstance(phrase, str) or not phrase.strip():
                        raise TaxonomyDataError(f"Empty alias phrase for skill '{skill_name}'.")

                    if language not in VALID_LANGUAGES:
                        raise TaxonomyDataError(
                            f"Alias '{phrase}' for skill '{skill_name}' has an invalid language "
                            f"{language!r}; must be one of {sorted(VALID_LANGUAGES)}."
                        )

                    phrase_key = _normalize(phrase)

                    if phrase_key == skill_key:
                        raise TaxonomyDataError(
                            f"Alias '{phrase}' for skill '{skill_name}' unnecessarily repeats "
                            "its own canonical skill name."
                        )

                    if phrase_key in all_skill_names_by_key and phrase_key != skill_key:
                        raise TaxonomyDataError(
                            f"Alias '{phrase}' for skill '{skill_name}' is ambiguous - it is also "
                            f"the canonical name of a different skill, "
                            f"'{all_skill_names_by_key[phrase_key]}'."
                        )

                    if phrase_key in seen_alias_keys_local:
                        raise TaxonomyDataError(
                            f"Duplicate alias phrase '{phrase}' repeated for skill '{skill_name}'."
                        )
                    seen_alias_keys_local.add(phrase_key)

                    if (
                        phrase_key in all_alias_phrases_by_key
                        and all_alias_phrases_by_key[phrase_key] != skill_name
                    ):
                        raise TaxonomyDataError(
                            f"Alias '{phrase}' is assigned to both "
                            f"'{all_alias_phrases_by_key[phrase_key]}' and '{skill_name}' - one "
                            "normalized alias cannot point to multiple canonical skills."
                        )
                    all_alias_phrases_by_key[phrase_key] = skill_name

                    owner = existing_alias_owner(phrase_key)
                    if owner is not None and owner != skill_name:
                        raise TaxonomyDataError(
                            f"Alias '{phrase}' already belongs to the existing skill '{owner}' in "
                            f"the database; the curated data assigns it to '{skill_name}' instead."
                        )


def _category_label(category):
    name = category.get("name") if isinstance(category, dict) else None
    return name if isinstance(name, str) and name.strip() else "<unnamed category>"


def _subcategory_label(category, subcategory):
    sub_name = subcategory.get("name") if isinstance(subcategory, dict) else None
    sub_name = sub_name if isinstance(sub_name, str) and sub_name.strip() else "<unnamed subcategory>"
    return f"{_category_label(category)} / {sub_name}"


def _require_name(node, context):
    name = node.get("name") if isinstance(node, dict) else None
    if not isinstance(name, str) or not name.strip():
        raise TaxonomyDataError(f"{context} has an empty or missing name.")
    return name


def _require_list(node, key, *, context):
    value = node.get(key) if isinstance(node, dict) else None
    if not isinstance(value, list) or not value:
        raise TaxonomyDataError(f"'{context}' must have a non-empty '{key}' list.")
    return value


class _Counters:
    """Created/updated/unchanged tallies for one model, for the summary."""

    def __init__(self):
        self.created = 0
        self.updated = 0
        self.unchanged = 0

    def __str__(self):
        return f"{self.created} created, {self.updated} updated, {self.unchanged} unchanged"


def _get_or_create_category(name, counters):
    category = Category.objects.filter(name__iexact=name).first()

    if category is None:
        counters.created += 1
        return Category.objects.create(name=name)

    if category.name != name:
        category.name = name
        category.save(update_fields=["name"])
        counters.updated += 1
    else:
        counters.unchanged += 1

    return category


def _get_or_create_subcategory(category, name, counters):
    subcategory = Subcategory.objects.filter(category=category, name__iexact=name).first()

    if subcategory is None:
        counters.created += 1
        return Subcategory.objects.create(category=category, name=name)

    if subcategory.name != name:
        subcategory.name = name
        subcategory.save(update_fields=["name"])
        counters.updated += 1
    else:
        counters.unchanged += 1

    return subcategory


def _get_or_create_skill(subcategory, name, counters):
    skill = SkillTag.objects.filter(subcategory=subcategory, name__iexact=name).first()

    if skill is None:
        counters.created += 1
        return SkillTag.objects.create(subcategory=subcategory, name=name)

    update_fields = []
    if skill.name != name:
        skill.name = name
        update_fields.append("name")
    if not skill.is_active:
        skill.is_active = True
        update_fields.append("is_active")

    if update_fields:
        skill.save(update_fields=update_fields)
        counters.updated += 1
    else:
        counters.unchanged += 1

    return skill


def _get_or_create_alias(skill, phrase, language, counters):
    alias = SkillAlias.objects.filter(phrase__iexact=phrase).first()

    if alias is None:
        counters.created += 1
        return SkillAlias.objects.create(skill=skill, phrase=phrase, language=language)

    update_fields = []
    if alias.skill_id != skill.id:
        alias.skill = skill
        update_fields.append("skill")
    if alias.language != language:
        alias.language = language
        update_fields.append("language")
    if alias.phrase != phrase:
        alias.phrase = phrase
        update_fields.append("phrase")

    if update_fields:
        alias.save(update_fields=update_fields)
        counters.updated += 1
    else:
        counters.unchanged += 1

    return alias


def _existing_alias_owner_lookup():
    """One query building a normalized-phrase -> owning-skill-name map of
    every SkillAlias already in the database, for the cross-check in
    validate_taxonomy_data. A plain dict lookup, not a per-alias query."""

    owners = {
        _normalize(phrase): skill_name
        for phrase, skill_name in SkillAlias.objects.values_list("phrase", "skill__name")
    }
    return lambda phrase_key: owners.get(phrase_key)


class Command(BaseCommand):
    help = (
        "Seed the standardized taxonomy from the curated, versioned data file "
        "at taxonomy/data/taxonomy_v1.json (categories, subcategories, skills, "
        "and English/Romanized-Nepali aliases). Safe to run repeatedly - "
        "existing categories, subcategories, skill tags, and aliases are "
        "matched by natural key and reused or updated in place, never "
        "duplicated or deleted."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            dest="file",
            default=str(DEFAULT_DATA_FILE),
            help=(
                "Path to the curated taxonomy JSON file. Defaults to "
                "taxonomy/data/taxonomy_v1.json. Overridable for tests."
            ),
        )

    def handle(self, *args, **options):
        data_path = options["file"]

        try:
            categories = load_taxonomy_data(data_path)
            validate_taxonomy_data(
                categories, existing_alias_owner=_existing_alias_owner_lookup()
            )
        except TaxonomyDataError as exc:
            raise CommandError(str(exc)) from exc

        category_counters = _Counters()
        subcategory_counters = _Counters()
        skill_counters = _Counters()
        alias_counters = _Counters()

        with transaction.atomic():
            for category_data in categories:
                category = _get_or_create_category(category_data["name"], category_counters)

                for subcategory_data in category_data["subcategories"]:
                    subcategory = _get_or_create_subcategory(
                        category, subcategory_data["name"], subcategory_counters
                    )

                    for skill_data in subcategory_data["skills"]:
                        skill = _get_or_create_skill(
                            subcategory, skill_data["name"], skill_counters
                        )

                        for alias_data in skill_data.get("aliases", []):
                            _get_or_create_alias(
                                skill,
                                alias_data["phrase"],
                                alias_data["language"],
                                alias_counters,
                            )

        self.stdout.write(self.style.SUCCESS("\nTaxonomy seed complete."))
        self.stdout.write(f"Categories:    {category_counters}")
        self.stdout.write(f"Subcategories: {subcategory_counters}")
        self.stdout.write(f"Skills:        {skill_counters}")
        self.stdout.write(f"Aliases:       {alias_counters}")
