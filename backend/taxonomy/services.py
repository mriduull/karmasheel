"""Skill-normalization service (Week 2).

Matches free-text skill phrases (English or Romanized Nepali) to
standardized SkillTag records. Pipeline: text preprocessing, exact
standardized-name lookup, exact alias lookup, then a RapidFuzz fuzzy
fallback gated by a configurable confidence threshold. Phrases that
cannot be confidently matched are recorded in UnmatchedSkillTerm for
admin review, with occurrence_count incremented on repeat submissions
of the same normalized phrase.
"""

import re
from dataclasses import dataclass
from typing import Optional

from django.conf import settings
from django.db.models import Count, F
from rapidfuzz import fuzz, process

from .models import SkillAlias, SkillTag, UnmatchedSkillTerm

DEFAULT_SKILL_MATCH_THRESHOLD = 85.0


def preprocess_skill_phrase(phrase: str) -> str:
    """Lowercase, collapse whitespace, and strip punctuation for matching."""

    text = (phrase or "").strip().lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


@dataclass
class SkillMatchResult:
    """Outcome of matching a single free-text phrase to the taxonomy."""

    skill: Optional[SkillTag]
    method: str  # "exact_name" | "exact_alias" | "fuzzy" | "unmatched"
    confidence: float
    normalized_phrase: str


def _get_match_threshold(threshold=None):
    if threshold is not None:
        return threshold

    return getattr(settings, "SKILL_MATCH_THRESHOLD", DEFAULT_SKILL_MATCH_THRESHOLD)


def _active_skills_by_canonical_preference():
    """Active SkillTags ordered so the most-established record - the one
    with the most aliases, tie-broken by lowest id - wins whenever a name
    collides case-insensitively. The taxonomy is not supposed to contain
    same-name duplicates, but this keeps matching deterministic and safe
    if one is ever introduced by mistake (e.g. via the admin) instead of
    depending on incidental database ordering.
    """

    return (
        SkillTag.objects.filter(is_active=True)
        .annotate(alias_count=Count("aliases"))
        .order_by("-alias_count", "id")
    )


def _resolve_active_skill_by_name(normalized_phrase):
    return _active_skills_by_canonical_preference().filter(
        name__iexact=normalized_phrase
    ).first()


def _best_fuzzy_candidate(normalized_phrase):
    """Return (SkillTag or None, score) for the closest active skill name or alias."""

    lookup = {}

    for name, pk in _active_skills_by_canonical_preference().values_list("name", "pk"):
        lookup.setdefault(name.lower(), pk)

    for phrase, skill_id in SkillAlias.objects.filter(
        skill__is_active=True
    ).values_list("phrase", "skill_id"):
        lookup.setdefault(phrase.lower(), skill_id)

    if not lookup:
        return None, 0.0

    match = process.extractOne(normalized_phrase, lookup.keys(), scorer=fuzz.WRatio)

    if match is None:
        return None, 0.0

    matched_text, score, _ = match
    return SkillTag.objects.filter(pk=lookup[matched_text]).first(), float(score)


def _record_unmatched_term(*, raw_term, normalized_term, candidate, score, user):
    term, created = UnmatchedSkillTerm.objects.get_or_create(
        normalized_term=normalized_term,
        defaults={
            "raw_term": raw_term,
            "best_candidate": candidate,
            "best_candidate_score": score,
            "submitted_by": user,
        },
    )

    if not created:
        UnmatchedSkillTerm.objects.filter(pk=term.pk).update(
            occurrence_count=F("occurrence_count") + 1,
            raw_term=raw_term,
            best_candidate=candidate,
            best_candidate_score=score,
        )


def normalize_skill_phrase(
    phrase,
    *,
    threshold=None,
    user=None,
    record_unmatched=True,
) -> SkillMatchResult:
    """Resolve a free-text skill phrase to a standardized SkillTag.

    Pipeline: preprocessing -> exact standardized-name match -> exact
    alias match (English or Romanized Nepali) -> RapidFuzz fuzzy
    fallback against a configurable confidence threshold
    (settings.SKILL_MATCH_THRESHOLD, override via the `threshold` kwarg).
    Unmatched or below-threshold phrases are recorded in
    UnmatchedSkillTerm for admin review unless `record_unmatched=False`.
    """

    normalized = preprocess_skill_phrase(phrase)
    match_threshold = _get_match_threshold(threshold)

    if not normalized:
        return SkillMatchResult(None, "unmatched", 0.0, normalized)

    exact_skill = _resolve_active_skill_by_name(normalized)

    if exact_skill is not None:
        return SkillMatchResult(exact_skill, "exact_name", 100.0, normalized)

    alias = (
        SkillAlias.objects.select_related("skill")
        .filter(phrase__iexact=normalized, skill__is_active=True)
        .first()
    )

    if alias is not None:
        return SkillMatchResult(alias.skill, "exact_alias", 100.0, normalized)

    candidate, score = _best_fuzzy_candidate(normalized)

    if candidate is not None and score >= match_threshold:
        return SkillMatchResult(candidate, "fuzzy", score, normalized)

    if record_unmatched:
        _record_unmatched_term(
            raw_term=phrase,
            normalized_term=normalized,
            candidate=candidate,
            score=score,
            user=user,
        )

    return SkillMatchResult(None, "unmatched", score, normalized)


def normalize_skill_phrases(phrases, *, threshold=None, user=None):
    """Resolve multiple phrases; returns (matched_skills, unmatched_phrases)."""

    matched = []
    unmatched = []

    for phrase in phrases:
        result = normalize_skill_phrase(phrase, threshold=threshold, user=user)

        if result.skill is not None:
            matched.append(result.skill)
        else:
            unmatched.append(phrase)

    return matched, unmatched
