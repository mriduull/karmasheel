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

    skill = models.ForeignKey(
        SkillTag,
        on_delete=models.CASCADE,
        related_name="aliases",
    )

    phrase = models.CharField(
        max_length=150,
        unique=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["phrase"]
        verbose_name_plural = "skill aliases"

    def __str__(self) -> str:
        return f"{self.phrase} → {self.skill.name}"