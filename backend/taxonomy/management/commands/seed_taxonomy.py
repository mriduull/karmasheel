"""Seed the standardized taxonomy: categories, subcategories, skills, and
English/Romanized-Nepali aliases. Safe to run repeatedly (idempotent) -
existing rows are matched by their unique key and left in place or updated,
never duplicated.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from taxonomy.models import Category, SkillAlias, SkillTag, Subcategory

EN = SkillAlias.Language.ENGLISH
NE = SkillAlias.Language.NE_ROMANIZED

TAXONOMY = {
    "Construction & Repair": {
        "Electrical": [
            {
                "name": "House Wiring",
                "aliases": [("home wiring", EN), ("ghar wiring", NE)],
            },
            {
                "name": "Circuit Breaker Installation",
                "aliases": [("breaker installation", EN), ("switch board installation", NE)],
            },
            {
                "name": "Electrical Repair",
                "aliases": [("electric repair", EN), ("bijuli repair", NE)],
            },
            {
                "name": "Ceiling Fan Installation",
                "aliases": [("fan installation", EN), ("pankha jadan", NE)],
            },
        ],
        "Plumbing": [
            {
                "name": "Pipe Fitting",
                "aliases": [("pipe fixing", EN), ("pipe milaune", NE)],
            },
            {
                "name": "Leak Repair",
                "aliases": [("water leak fixing", EN), ("chuhawat thik garne", NE)],
            },
            {
                "name": "Bathroom Fitting Installation",
                "aliases": [("bathroom fixture installation", EN), ("bathroom jadan", NE)],
            },
            {
                "name": "Water Tank Installation",
                "aliases": [("tank installation", EN), ("tanki jadan", NE)],
            },
        ],
        "Masonry": [
            {
                "name": "Brick Laying",
                "aliases": [("bricklaying work", EN), ("itta thoknu", NE)],
            },
            {
                "name": "Plastering",
                "aliases": [("wall plastering", EN), ("plaster garne", NE)],
            },
            {
                "name": "Tile Installation",
                "aliases": [("tile fitting", EN), ("tile jadan", NE)],
            },
            {
                "name": "Concrete Mixing",
                "aliases": [("cement mixing", EN), ("dhalan misaune", NE)],
            },
        ],
    },
    "Domestic & Local Services": {
        "Cleaning": [
            {
                "name": "House Cleaning",
                "aliases": [("home cleaning", EN), ("ghar safai", NE)],
            },
            {
                "name": "Deep Cleaning",
                "aliases": [("thorough cleaning", EN), ("gahiro safai", NE)],
            },
            {
                "name": "Window Cleaning",
                "aliases": [("glass cleaning", EN), ("jhyal safai", NE)],
            },
            {
                "name": "Carpet Cleaning",
                "aliases": [("rug cleaning", EN), ("carpet safai", NE)],
            },
        ],
        "Cooking": [
            {
                "name": "Home Cooking",
                "aliases": [("household cooking", EN), ("ghar khana pakaune", NE)],
            },
            {
                "name": "Catering Assistance",
                "aliases": [("catering help", EN), ("bhoj sahayog", NE)],
            },
            {
                "name": "Meal Preparation",
                "aliases": [("food preparation", EN), ("khana taiyari", NE)],
            },
            {
                "name": "Kitchen Helper",
                "aliases": [("kitchen assistant", EN), ("bhansa sahayak", NE)],
            },
        ],
    },
}


def get_or_create_category(name):
    """Case-insensitive get-or-create so re-seeding never creates a
    same-name-different-capitalization duplicate category."""

    category = Category.objects.filter(name__iexact=name).first()

    if category is not None:
        return category

    return Category.objects.create(name=name)


def get_or_create_subcategory(category, name):
    """Case-insensitive get-or-create scoped to the parent category."""

    subcategory = Subcategory.objects.filter(
        category=category, name__iexact=name
    ).first()

    if subcategory is not None:
        return subcategory

    return Subcategory.objects.create(category=category, name=name)


def get_or_create_skill_tag(subcategory, name):
    """Case-insensitive get-or-create scoped to the parent subcategory."""

    skill = SkillTag.objects.filter(subcategory=subcategory, name__iexact=name).first()

    if skill is not None:
        return skill

    return SkillTag.objects.create(subcategory=subcategory, name=name)


class Command(BaseCommand):
    help = (
        "Seed the standardized taxonomy (categories, subcategories, skills, "
        "and aliases). Safe to run repeatedly - existing categories, "
        "subcategories, and skill tags are matched case-insensitively "
        "within their parent relationship, so re-seeding never creates a "
        "duplicate merely because capitalization differs."
    )

    @transaction.atomic
    def handle(self, *args, **options):
        category_count = 0
        subcategory_count = 0
        skill_count = 0
        alias_count = 0

        for category_name, subcategories in TAXONOMY.items():
            category = get_or_create_category(category_name)
            category_count += 1

            for subcategory_name, skills in subcategories.items():
                subcategory = get_or_create_subcategory(category, subcategory_name)
                subcategory_count += 1

                for skill_data in skills:
                    skill = get_or_create_skill_tag(subcategory, skill_data["name"])
                    skill_count += 1

                    for phrase, language in skill_data["aliases"]:
                        SkillAlias.objects.update_or_create(
                            phrase=phrase,
                            defaults={"skill": skill, "language": language},
                        )
                        alias_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {category_count} categories, {subcategory_count} "
                f"subcategories, {skill_count} skills, {alias_count} aliases."
            )
        )
