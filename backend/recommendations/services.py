"""Week 4 explainable hybrid recommendation engine.

Everything here is deterministic and formula-based - no machine
learning, embeddings, or pretrained models. All weights are read from
``settings.RECOMMENDATION_SETTINGS`` (never hard-coded) so they can be
tuned without touching this module.

Score components
-----------------
Each worker/job pair is scored on five 0-100 components:

- ``skill_score``: 70% required-skill coverage + 30% cosine similarity
  over binary standardized-skill vectors (weights configurable).
- ``distance_score``: linear falloff from 100 at 0 km to 0 at
  ``MAX_DISTANCE_KM``. ``None`` (never invented) when either party's
  coordinates are unavailable; a neutral score stands in for it inside
  the weighted formulas.
- ``experience_score``: worker experience vs. the job's required
  experience.
- ``availability_preference_score``: wage compatibility and travel-radius
  comfort, from fields that already exist on ``WorkerProfile``.
- ``reliability_verification_score``: a simplified, cold-start-safe
  signal from contact verification, employer verification status, and
  profile completeness. There is no rating or completed-job history yet
  (that is Week 5) - ``calculate_worker_reliability_score`` and
  ``calculate_employer_reliability_score`` are kept isolated so Week 5
  can extend them without touching the rest of this module.

``final_match_score`` is the weighted sum of those five components. Which
party's reliability score is used depends on recommendation direction:
ranking jobs for a worker uses the job's *employer* reliability (is this
employer trustworthy?); ranking workers for a job uses the *worker*
reliability (is this worker trustworthy?).

Reciprocal preference score
----------------------------
``employer_side_suitability`` and ``worker_side_suitability`` are plain
averages of the components each side would care about (skill/experience/
worker-reliability for the employer; distance/availability/employer-
reliability for the worker). ``reciprocal_preference_score`` combines
them 60/40. This is a separate, purely explanatory "mutual fit" metric -
it is deliberately NOT fed into ``final_match_score``, since doing so
would double-count the same underlying component scores that
``final_match_score`` already weights directly.
"""

import math
from dataclasses import dataclass, field

from django.conf import settings

from jobs.services import filter_active_jobs_for_worker, haversine_distance_km
from profiles.models import EmployerProfile, WorkerProfile


def _settings():
    return settings.RECOMMENDATION_SETTINGS


def clamp_score(value, low=0.0, high=100.0):
    return max(low, min(high, value))


# ---------------------------------------------------------------------
# Filtering (Section 2) - reuses Week 3 filters where practical.
# ---------------------------------------------------------------------

def filter_candidate_jobs_for_worker(worker_profile):
    """Active jobs suitable for recommending to a worker.

    Reuses the Week 3 filter for active status, application deadline,
    and the worker's preferred travel radius. An unavailable worker
    (``is_available=False``) is not looking for work, so they get no
    recommendations at all. Jobs are additionally narrowed to
    subcategories the worker has at least one skill in, when the worker
    has recorded any skills; a worker with no skills yet sees jobs across
    all subcategories, since compatibility can't be judged either way.
    """

    if not worker_profile.is_available:
        return []

    jobs = filter_active_jobs_for_worker(worker_profile)

    worker_subcategory_ids = set(worker_profile.skills.values_list("subcategory_id", flat=True))

    if not worker_subcategory_ids:
        return jobs

    return [job for job in jobs if job.subcategory_id in worker_subcategory_ids]


# ---------------------------------------------------------------------
# Section 3 - skill scoring
# ---------------------------------------------------------------------

def required_skill_coverage(worker_skill_ids, required_skill_ids):
    """matched_required_skills / total_required_skills * 100.

    A job with no required skills is treated as fully covered (100) -
    there is nothing the worker could be missing.
    """

    required = set(required_skill_ids)

    if not required:
        return 100.0

    matched = required & set(worker_skill_ids)
    return round(len(matched) / len(required) * 100, 2)


def build_skill_vectors(worker_skill_ids, required_skill_ids, preferred_skill_ids):
    """Binary vectors over the union of worker/required/preferred skill
    IDs, in a stable (sorted) order."""

    universe = sorted(set(worker_skill_ids) | set(required_skill_ids) | set(preferred_skill_ids))
    job_skill_ids = set(required_skill_ids) | set(preferred_skill_ids)

    worker_vector = [1 if skill_id in worker_skill_ids else 0 for skill_id in universe]
    job_vector = [1 if skill_id in job_skill_ids else 0 for skill_id in universe]

    return worker_vector, job_vector


def cosine_similarity_score(worker_skill_ids, required_skill_ids, preferred_skill_ids):
    """Cosine similarity between the worker's skill vector and the job's
    (required + preferred) skill vector, scaled to 0-100. Empty vectors
    (no skills recorded on either side) score 0 rather than raising."""

    worker_vector, job_vector = build_skill_vectors(worker_skill_ids, required_skill_ids, preferred_skill_ids)

    if not worker_vector:
        return 0.0

    dot_product = sum(w * j for w, j in zip(worker_vector, job_vector))
    worker_norm = math.sqrt(sum(w * w for w in worker_vector))
    job_norm = math.sqrt(sum(j * j for j in job_vector))

    if worker_norm == 0 or job_norm == 0:
        return 0.0

    return round((dot_product / (worker_norm * job_norm)) * 100, 2)


@dataclass
class SkillScoreResult:
    skill_score: float
    required_skill_coverage: float
    cosine_similarity_score: float
    matched_required_skills: list = field(default_factory=list)
    missing_required_skills: list = field(default_factory=list)
    matched_preferred_skills: list = field(default_factory=list)


def calculate_skill_score(worker_skills, required_skills, preferred_skills):
    """worker_skills / required_skills / preferred_skills: iterables of
    SkillTag instances (kept as objects, not just IDs, so matched/missing
    skills can be reported back for the explanation)."""

    worker_skills = list(worker_skills)
    required_skills = list(required_skills)
    preferred_skills = list(preferred_skills)

    worker_ids = {skill.id for skill in worker_skills}
    required_ids = {skill.id for skill in required_skills}
    preferred_ids = {skill.id for skill in preferred_skills}

    coverage = required_skill_coverage(worker_ids, required_ids)
    cosine = cosine_similarity_score(worker_ids, required_ids, preferred_ids)

    weights = _settings()
    combined = (
        weights["SKILL_WEIGHT_REQUIRED_COVERAGE"] * coverage
        + weights["SKILL_WEIGHT_COSINE_SIMILARITY"] * cosine
    )

    return SkillScoreResult(
        skill_score=round(clamp_score(combined), 2),
        required_skill_coverage=coverage,
        cosine_similarity_score=cosine,
        matched_required_skills=[s for s in required_skills if s.id in worker_ids],
        missing_required_skills=[s for s in required_skills if s.id not in worker_ids],
        matched_preferred_skills=[s for s in preferred_skills if s.id in worker_ids],
    )


# ---------------------------------------------------------------------
# Section 4 - distance scoring
# ---------------------------------------------------------------------

def calculate_distance_score(distance_km):
    """Linear falloff: 100 at 0 km, 0 at settings MAX_DISTANCE_KM (and
    beyond). ``distance_km=None`` returns ``None`` - callers decide how to
    fold an unknown distance into a weighted formula."""

    if distance_km is None:
        return None

    max_distance = _settings()["MAX_DISTANCE_KM"]

    if distance_km <= 0:
        return 100.0

    if distance_km >= max_distance:
        return 0.0

    return round((1 - distance_km / max_distance) * 100, 2)


def calculate_distance(worker_profile, job):
    """Returns (distance_km, distance_score). Both are ``None``/``None``
    substitute-free - ``distance_km`` is only ``None`` when the worker
    has no coordinates recorded (a JobPost always has coordinates); no
    coordinates are ever invented."""

    if worker_profile.latitude is None or worker_profile.longitude is None:
        return None, None

    distance_km = haversine_distance_km(
        worker_profile.latitude, worker_profile.longitude, job.latitude, job.longitude
    )
    distance_km = round(distance_km, 2)

    return distance_km, calculate_distance_score(distance_km)


# ---------------------------------------------------------------------
# Section 5 - experience scoring
# ---------------------------------------------------------------------

def calculate_experience_score(worker_experience_years, required_experience_years):
    if required_experience_years <= 0:
        return 100.0

    if worker_experience_years >= required_experience_years:
        return 100.0

    return round(clamp_score(worker_experience_years / required_experience_years * 100), 2)


# ---------------------------------------------------------------------
# Section 6 - availability / worker-preference scoring
# ---------------------------------------------------------------------

def calculate_availability_preference_score(worker_profile, job, distance_km):
    """Average of wage compatibility and travel-radius comfort, built
    only from fields that already exist on WorkerProfile/JobPost. Returns
    (score, sub_scores) so the individual sub-results are always
    available for the explanation output."""

    neutral = _settings()["NEUTRAL_SCORE_WHEN_UNKNOWN"]

    if worker_profile.expected_wage is None:
        wage_score = 100.0  # no expectation stated, nothing to disappoint
    elif job.wage_amount >= worker_profile.expected_wage:
        wage_score = 100.0
    else:
        wage_score = clamp_score(float(job.wage_amount) / float(worker_profile.expected_wage) * 100)

    if distance_km is None or worker_profile.preferred_travel_radius_km is None:
        radius_score = neutral
    elif worker_profile.preferred_travel_radius_km <= 0:
        radius_score = 100.0 if distance_km == 0 else 0.0
    else:
        ratio = distance_km / worker_profile.preferred_travel_radius_km
        radius_score = 100.0 if ratio <= 1 else clamp_score(100 - (ratio - 1) * 100)

    score = (wage_score + radius_score) / 2

    sub_scores = {
        "is_available": worker_profile.is_available,
        "wage_compatibility_score": round(wage_score, 2),
        "travel_radius_compatibility_score": round(radius_score, 2),
    }

    return round(clamp_score(score), 2), sub_scores


# ---------------------------------------------------------------------
# Section 7 - cold-start-safe reliability / verification scoring
# ---------------------------------------------------------------------

EMPLOYER_VERIFICATION_STATUS_SCORES = {
    EmployerProfile.VerificationStatus.VERIFIED: 100.0,
    EmployerProfile.VerificationStatus.PENDING: 40.0,
    EmployerProfile.VerificationStatus.UNVERIFIED: 20.0,
    EmployerProfile.VerificationStatus.REJECTED: 0.0,
}


def _worker_profile_completeness(worker_profile):
    signals = [
        bool(worker_profile.address),
        worker_profile.latitude is not None and worker_profile.longitude is not None,
        worker_profile.expected_wage is not None,
        worker_profile.preferred_travel_radius_km is not None,
        worker_profile.skills.exists(),
    ]
    return round(sum(signals) / len(signals) * 100, 2)


def calculate_worker_reliability_score(worker_profile):
    """Simplified, cold-start-safe reliability score: no ratings or
    completed-job history exist yet (Week 5). Uses only contact
    verification and profile completeness. Kept isolated so Week 5 can
    extend it (e.g. blend in ratings) without touching callers."""

    contact_verified = worker_profile.user.is_contact_verified
    completeness = _worker_profile_completeness(worker_profile)

    score = 0.5 * (100.0 if contact_verified else 0.0) + 0.5 * completeness

    sub_scores = {
        "contact_verified": contact_verified,
        "profile_completeness": completeness,
    }

    return round(clamp_score(score), 2), sub_scores


def _employer_profile_completeness(employer_profile):
    signals = [
        bool(employer_profile.organization_name),
        bool(employer_profile.address),
        employer_profile.latitude is not None and employer_profile.longitude is not None,
        bool(employer_profile.pan_vat_number),
    ]
    return round(sum(signals) / len(signals) * 100, 2)


def calculate_employer_reliability_score(employer_profile):
    """Simplified, cold-start-safe reliability score for an employer:
    manual verification status (Week 1 admin review), contact
    verification, and profile completeness. Kept isolated so Week 5 can
    extend it without touching callers."""

    verification_component = EMPLOYER_VERIFICATION_STATUS_SCORES[employer_profile.verification_status]
    contact_component = 100.0 if employer_profile.user.is_contact_verified else 0.0
    completeness = _employer_profile_completeness(employer_profile)

    score = 0.5 * verification_component + 0.3 * contact_component + 0.2 * completeness

    sub_scores = {
        "verification_status": employer_profile.verification_status,
        "contact_verified": employer_profile.user.is_contact_verified,
        "profile_completeness": completeness,
    }

    return round(clamp_score(score), 2), sub_scores


# ---------------------------------------------------------------------
# Section 8 - reciprocal and final hybrid score
# ---------------------------------------------------------------------

def calculate_employer_side_suitability(skill_score, experience_score, worker_reliability_score):
    """Plain average of the components an employer would judge a worker
    candidate on. Deliberately a simple average - not a re-use of the
    final-score weights - so it stays a distinct, separately
    interpretable "mutual fit" metric rather than a hidden restatement of
    final_match_score."""

    return round(clamp_score((skill_score + experience_score + worker_reliability_score) / 3), 2)


def calculate_worker_side_suitability(distance_score, availability_score, employer_reliability_score):
    """Plain average of the components a worker would judge a job on."""

    distance_component = distance_score if distance_score is not None else _settings()["NEUTRAL_SCORE_WHEN_UNKNOWN"]
    return round(
        clamp_score((distance_component + availability_score + employer_reliability_score) / 3), 2
    )


def calculate_reciprocal_preference_score(employer_side_suitability, worker_side_suitability):
    weights = _settings()
    score = (
        weights["RECIPROCAL_WEIGHT_EMPLOYER_SIDE"] * employer_side_suitability
        + weights["RECIPROCAL_WEIGHT_WORKER_SIDE"] * worker_side_suitability
    )
    return round(clamp_score(score), 2)


def calculate_final_match_score(
    skill_score, distance_score, experience_score, availability_score, reliability_score
):
    weights = _settings()
    distance_component = distance_score if distance_score is not None else weights["NEUTRAL_SCORE_WHEN_UNKNOWN"]

    score = (
        weights["FINAL_WEIGHT_SKILL"] * skill_score
        + weights["FINAL_WEIGHT_DISTANCE"] * distance_component
        + weights["FINAL_WEIGHT_EXPERIENCE"] * experience_score
        + weights["FINAL_WEIGHT_AVAILABILITY"] * availability_score
        + weights["FINAL_WEIGHT_RELIABILITY"] * reliability_score
    )

    return round(clamp_score(score), 2)


def validate_recommendation_weights():
    """Raises AssertionError if any configurable weight group does not
    sum to 1.0. Called at app-startup (recommendations.apps) so a
    misconfiguration is caught immediately rather than silently skewing
    every recommendation."""

    weights = _settings()

    groups = {
        "SKILL_WEIGHT_*": weights["SKILL_WEIGHT_REQUIRED_COVERAGE"] + weights["SKILL_WEIGHT_COSINE_SIMILARITY"],
        "RECIPROCAL_WEIGHT_*": weights["RECIPROCAL_WEIGHT_EMPLOYER_SIDE"] + weights["RECIPROCAL_WEIGHT_WORKER_SIDE"],
        "FINAL_WEIGHT_*": (
            weights["FINAL_WEIGHT_SKILL"]
            + weights["FINAL_WEIGHT_DISTANCE"]
            + weights["FINAL_WEIGHT_EXPERIENCE"]
            + weights["FINAL_WEIGHT_AVAILABILITY"]
            + weights["FINAL_WEIGHT_RELIABILITY"]
        ),
    }

    for name, total in groups.items():
        if not math.isclose(total, 1.0, abs_tol=1e-6):
            raise AssertionError(
                f"settings.RECOMMENDATION_SETTINGS {name} weights must sum to 1.0, got {total}."
            )


# ---------------------------------------------------------------------
# Explanation (Section 9)
# ---------------------------------------------------------------------

def _build_reasons_and_warnings(*, worker_profile, job, skill_result, distance_km, direction):
    reasons = []
    warnings = []

    total_required = len(skill_result.matched_required_skills) + len(skill_result.missing_required_skills)

    if total_required > 0:
        reasons.append(f"Matches {len(skill_result.matched_required_skills)} of {total_required} required skills.")

        if skill_result.missing_required_skills:
            missing_names = ", ".join(skill.name for skill in skill_result.missing_required_skills)
            warnings.append(f"Missing required skill(s): {missing_names}.")

    if skill_result.matched_preferred_skills:
        reasons.append(f"Also matches {len(skill_result.matched_preferred_skills)} preferred skills.")

    if distance_km is not None:
        reasons.append(f"Located {distance_km} km from the job.")
    else:
        warnings.append("Worker location is unavailable; distance could not be calculated.")

    if job.required_experience_years <= 0 or worker_profile.experience_years >= job.required_experience_years:
        reasons.append("Meets the required experience.")
    else:
        warnings.append(
            f"Worker has less experience ({worker_profile.experience_years} yr) "
            f"than required ({job.required_experience_years} yr)."
        )

    if worker_profile.is_available:
        reasons.append("Available for work.")

    if worker_profile.expected_wage is not None:
        if job.wage_amount >= worker_profile.expected_wage:
            reasons.append("Job wage meets the worker's expected wage.")
        else:
            warnings.append("Offered wage is below the worker's expected wage.")

    if (
        distance_km is not None
        and worker_profile.preferred_travel_radius_km is not None
        and distance_km > worker_profile.preferred_travel_radius_km
    ):
        warnings.append("Worker is outside the preferred travel radius.")

    if direction == "worker_to_job":
        if job.employer.verification_status == EmployerProfile.VerificationStatus.VERIFIED:
            reasons.append("Employer profile is verified.")
    else:
        if worker_profile.user.is_contact_verified:
            reasons.append("Worker's contact is verified.")

    return reasons, warnings


# ---------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------

@dataclass
class RecommendationResult:
    worker: WorkerProfile
    job: object  # JobPost - left untyped to avoid a jobs<->recommendations import cycle in type hints
    final_score: float
    skill: SkillScoreResult
    distance_km: object
    distance_score: object
    experience_score: float
    availability_preference_score: float
    availability_sub_scores: dict
    reliability_verification_score: float
    reliability_sub_scores: dict
    employer_side_suitability: float
    worker_side_suitability: float
    reciprocal_preference_score: float
    reasons: list
    warnings: list


def evaluate_match(worker_profile, job, *, direction):
    """Compute every component score, the final hybrid score, and the
    explanation for one (worker, job) pair.

    ``direction`` is ``"worker_to_job"`` (ranking jobs for a worker - the
    job's employer reliability feeds into reliability_verification_score)
    or ``"job_to_worker"`` (ranking worker candidates for a job - the
    worker's own reliability feeds into reliability_verification_score).
    """

    worker_skills = list(worker_profile.skills.all())
    required_skills = list(job.required_skills.all())
    preferred_skills = list(job.preferred_skills.all())

    skill_result = calculate_skill_score(worker_skills, required_skills, preferred_skills)
    distance_km, distance_score = calculate_distance(worker_profile, job)
    experience_score = calculate_experience_score(worker_profile.experience_years, job.required_experience_years)
    availability_score, availability_sub_scores = calculate_availability_preference_score(
        worker_profile, job, distance_km
    )

    worker_reliability_score, worker_reliability_sub_scores = calculate_worker_reliability_score(worker_profile)
    employer_reliability_score, employer_reliability_sub_scores = calculate_employer_reliability_score(job.employer)

    if direction == "worker_to_job":
        reliability_score, reliability_sub_scores = employer_reliability_score, employer_reliability_sub_scores
    else:
        reliability_score, reliability_sub_scores = worker_reliability_score, worker_reliability_sub_scores

    final_score = calculate_final_match_score(
        skill_result.skill_score, distance_score, experience_score, availability_score, reliability_score
    )

    employer_side = calculate_employer_side_suitability(
        skill_result.skill_score, experience_score, worker_reliability_score
    )
    worker_side = calculate_worker_side_suitability(distance_score, availability_score, employer_reliability_score)
    reciprocal_score = calculate_reciprocal_preference_score(employer_side, worker_side)

    reasons, warnings = _build_reasons_and_warnings(
        worker_profile=worker_profile,
        job=job,
        skill_result=skill_result,
        distance_km=distance_km,
        direction=direction,
    )

    return RecommendationResult(
        worker=worker_profile,
        job=job,
        final_score=final_score,
        skill=skill_result,
        distance_km=distance_km,
        distance_score=distance_score,
        experience_score=experience_score,
        availability_preference_score=availability_score,
        availability_sub_scores=availability_sub_scores,
        reliability_verification_score=reliability_score,
        reliability_sub_scores=reliability_sub_scores,
        employer_side_suitability=employer_side,
        worker_side_suitability=worker_side,
        reciprocal_preference_score=reciprocal_score,
        reasons=reasons,
        warnings=warnings,
    )
