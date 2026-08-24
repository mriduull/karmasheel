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
from django.utils import timezone
from rapidfuzz import fuzz

from .models import SkillAlias, SkillTag, UnmatchedSkillTerm

DEFAULT_SKILL_MATCH_THRESHOLD = 85.0
DEFAULT_SKILL_MATCH_MIN_MARGIN = 5.0


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
    candidate: Optional[SkillTag] = None


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
    for skill in _active_skills_by_canonical_preference():
        if preprocess_skill_phrase(skill.name) == normalized_phrase:
            return skill
    return None


def _resolve_active_skill_by_alias(normalized_phrase):
    matching_skill_ids = {
        skill_id
        for phrase, skill_id in SkillAlias.objects.filter(
            skill__is_active=True
        ).values_list("phrase", "skill_id")
        if preprocess_skill_phrase(phrase) == normalized_phrase
    }
    if not matching_skill_ids:
        return None

    return _active_skills_by_canonical_preference().filter(
        pk__in=matching_skill_ids
    ).first()


def _best_fuzzy_candidate(normalized_phrase):
    """Return the best skill, its score, and its lead over the runner-up."""

    ranked = get_similar_skill_suggestions(normalized_phrase, limit=2)
    if not ranked:
        return None, 0.0, 0.0

    candidate, score = ranked[0]
    runner_up_score = ranked[1][1] if len(ranked) > 1 else 0.0
    return candidate, score, score - runner_up_score


def _record_unmatched_term(
    *,
    raw_term,
    normalized_term,
    candidate,
    score,
    user,
    reopen_for_review=False,
):
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
        updates = {
            "occurrence_count": F("occurrence_count") + 1,
            "raw_term": raw_term,
            "best_candidate": candidate,
            "best_candidate_score": score,
            "updated_at": timezone.now(),
        }
        if reopen_for_review:
            updates["status"] = UnmatchedSkillTerm.Status.PENDING

        UnmatchedSkillTerm.objects.filter(pk=term.pk).update(
            **updates,
        )

    return term


def get_similar_skill_suggestions(
    phrase,
    *,
    limit=5,
    subcategory_id=None,
):
    """Return the closest active standardized skills, deduplicated by skill.

    Canonical names and aliases both contribute to a skill's score, but each
    standardized skill appears only once with its best score. This makes the
    result suitable for a worker-facing "did you mean?" list without exposing
    duplicate alias rows.
    """

    normalized = preprocess_skill_phrase(phrase)
    if not normalized or limit <= 0:
        return []

    ranked = []
    skills = _active_skills_by_canonical_preference()
    if subcategory_id is not None:
        skills = skills.filter(subcategory_id=subcategory_id)
    skills = skills.select_related("subcategory__category").prefetch_related("aliases")

    for skill in skills:
        candidate_phrases = [skill.name]
        candidate_phrases.extend(alias.phrase for alias in skill.aliases.all())
        score = max(
            fuzz.ratio(normalized, preprocess_skill_phrase(candidate_phrase))
            for candidate_phrase in candidate_phrases
        )
        ranked.append((skill, float(score)))

    ranked.sort(
        key=lambda item: (
            -item[1],
            item[0].name.casefold(),
            item[0].pk,
        )
    )
    return ranked[:limit]


def record_skill_for_review(phrase, *, user=None):
    """Record a worker's request for explicit admin review.

    Unlike ordinary normalization, this records exact and high-confidence
    fuzzy matches too. An existing resolved or rejected term is made pending
    again so it is visible in the admin queue, while its prior resolution and
    submitter attribution remain intact as audit history.
    """

    normalized = preprocess_skill_phrase(phrase)
    if not normalized:
        return None

    result = normalize_skill_phrase(
        phrase,
        user=user,
        record_unmatched=False,
    )
    candidate = result.candidate
    score = result.confidence

    return _record_unmatched_term(
        raw_term=phrase,
        normalized_term=normalized,
        candidate=candidate,
        score=score,
        user=user,
        reopen_for_review=True,
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
        return SkillMatchResult(
            exact_skill,
            "exact_name",
            100.0,
            normalized,
            candidate=exact_skill,
        )

    alias_skill = _resolve_active_skill_by_alias(normalized)

    if alias_skill is not None:
        return SkillMatchResult(
            alias_skill,
            "exact_alias",
            100.0,
            normalized,
            candidate=alias_skill,
        )

    candidate, score, score_margin = _best_fuzzy_candidate(normalized)

    if (
        candidate is not None
        and score >= match_threshold
        and score_margin >= DEFAULT_SKILL_MATCH_MIN_MARGIN
    ):
        return SkillMatchResult(
            candidate,
            "fuzzy",
            score,
            normalized,
            candidate=candidate,
        )

    if record_unmatched:
        _record_unmatched_term(
            raw_term=phrase,
            normalized_term=normalized,
            candidate=candidate,
            score=score,
            user=user,
        )

    return SkillMatchResult(
        None,
        "unmatched",
        score,
        normalized,
        candidate=candidate,
    )


def normalize_skill_phrases(
    phrases,
    *,
    threshold=None,
    user=None,
    record_unmatched=True,
):
    """Resolve multiple phrases; return ``(matched_skills, unmatched_phrases)``.

    ``record_unmatched=False`` provides a side-effect-free validation pass.
    The default preserves the profile/job save behaviour of storing unknown
    terms for later admin review.
    """

    matched = []
    unmatched = []

    for phrase in phrases:
        result = normalize_skill_phrase(
            phrase,
            threshold=threshold,
            user=user,
            record_unmatched=record_unmatched,
        )

        if result.skill is not None:
            matched.append(result.skill)
        else:
            unmatched.append(phrase)

    return matched, unmatched
