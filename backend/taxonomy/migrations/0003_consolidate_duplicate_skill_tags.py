"""Data migration: consolidate SkillTag records that differ only by
capitalization (e.g. a pre-existing "House wiring" alongside a seeded
"House Wiring"). These represent the same canonical standardized skill
and must not remain as separate rows.

For each group of active SkillTags sharing a case-insensitive name, the
record with the most aliases (tie-broken by lowest id) is kept as
canonical; every other record in the group has its aliases, worker-skill
relationships, and UnmatchedSkillTerm references reassigned to the
canonical record before being deleted.
"""

from django.db import migrations
from django.db.models import Count
from django.db.models.functions import Lower


def consolidate_duplicate_skill_tags(apps, schema_editor):
    SkillTag = apps.get_model("taxonomy", "SkillTag")
    SkillAlias = apps.get_model("taxonomy", "SkillAlias")
    UnmatchedSkillTerm = apps.get_model("taxonomy", "UnmatchedSkillTerm")
    WorkerProfile = apps.get_model("profiles", "WorkerProfile")

    duplicate_lower_names = (
        SkillTag.objects.annotate(lower_name=Lower("name"))
        .values("lower_name")
        .annotate(row_count=Count("id"))
        .filter(row_count__gt=1)
        .values_list("lower_name", flat=True)
    )

    for lower_name in duplicate_lower_names:
        group = list(SkillTag.objects.annotate(lower_name=Lower("name")).filter(lower_name=lower_name))

        # Canonical = most aliases attached, tie-broken by lowest id
        # (the earliest / most-established record).
        group.sort(key=lambda skill: (-skill.aliases.count(), skill.id))
        canonical = group[0]
        redundant_records = group[1:]

        for redundant in redundant_records:
            SkillAlias.objects.filter(skill=redundant).update(skill=canonical)

            for worker_profile in WorkerProfile.objects.filter(skills=redundant):
                worker_profile.skills.remove(redundant)
                worker_profile.skills.add(canonical)

            UnmatchedSkillTerm.objects.filter(best_candidate=redundant).update(
                best_candidate=canonical
            )
            UnmatchedSkillTerm.objects.filter(resolved_skill=redundant).update(
                resolved_skill=canonical
            )

            redundant.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("taxonomy", "0002_skillalias_language_unmatchedskillterm"),
        ("profiles", "0002_employerprofile_address_employerprofile_latitude_and_more"),
    ]

    operations = [
        migrations.RunPython(consolidate_duplicate_skill_tags, migrations.RunPython.noop),
    ]
