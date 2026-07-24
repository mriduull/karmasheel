from django.conf import settings
from django.db import models


class Category(models.Model):
    """Broad work category, such as Construction and Repair."""

    name = models.CharField(
        max_length=100,
        unique=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name


class Subcategory(models.Model):
    """Specific occupational area within a category."""

    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name="subcategories",
    )

    name = models.CharField(max_length=100)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["category__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["category", "name"],
                name="unique_subcategory_per_category",
            )
        ]

    def __str__(self) -> str:
        return f"{self.category.name} - {self.name}"


class SkillTag(models.Model):
    """Standardized skill used by worker profiles and job posts."""

    subcategory = models.ForeignKey(
        Subcategory,
        on_delete=models.CASCADE,
        related_name="skills",
    )

    name = models.CharField(max_length=100)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["subcategory__name", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["subcategory", "name"],
                name="unique_skill_per_subcategory",
            )
        ]

    def __str__(self) -> str:
        return self.name


class SkillAlias(models.Model):
    """Alternative English or Romanized Nepali phrase for a skill."""

    class Language(models.TextChoices):
        UNSPECIFIED = "UNSPECIFIED", "Unspecified"
        ENGLISH = "EN", "English"
        NE_ROMANIZED = "NE_ROMANIZED", "Romanized Nepali"

    skill = models.ForeignKey(
        SkillTag,
        on_delete=models.CASCADE,
        related_name="aliases",
    )

    phrase = models.CharField(
        max_length=150,
        unique=True,
    )

    language = models.CharField(
        max_length=20,
        choices=Language.choices,
        default=Language.UNSPECIFIED,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["phrase"]
        verbose_name_plural = "skill aliases"

    def __str__(self) -> str:
        return f"{self.phrase} → {self.skill.name}"


class UnmatchedSkillTerm(models.Model):
    """Free-text skill phrase that the normalization service could not
    confidently match, kept for admin review."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        RESOLVED = "RESOLVED", "Resolved"
        REJECTED = "REJECTED", "Rejected"

    raw_term = models.CharField(max_length=150)

    normalized_term = models.CharField(
        max_length=150,
        unique=True,
    )

    occurrence_count = models.PositiveIntegerField(default=1)

    best_candidate = models.ForeignKey(
        SkillTag,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="unmatched_candidates",
    )

    best_candidate_score = models.FloatField(null=True, blank=True)

    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="unmatched_skill_terms",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    resolved_skill = models.ForeignKey(
        SkillTag,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="resolved_from_unmatched",
    )

    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="resolved_unmatched_terms",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-occurrence_count", "-updated_at"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self) -> str:
        return self.normalized_term