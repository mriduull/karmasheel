"""Week 5 opportunity-advisory service.

Reuses the Week 4 recommendation engine (`evaluate_match` and
`filter_candidate_jobs_for_worker`) rather than recomputing any scoring
itself. A "near miss" is a job whose `final_match_score` for a worker
falls in a configurable, inclusive range (`NEAR_MISS_MIN_SCORE` -
`NEAR_MISS_MAX_SCORE`) - close enough that a worker could plausibly reach
it, but not already a good match. The advisory then ranks the required
skills missing across those near-miss jobs, so a worker knows what to
learn next to open up the most opportunities.
"""

from dataclasses import dataclass, field

from django.conf import settings

from .services import evaluate_match, filter_candidate_jobs_for_worker

MAX_SUGGESTED_SKILLS = 3


def _settings():
    return settings.RECOMMENDATION_SETTINGS


def is_near_miss_score(final_score):
    """Whether `final_score` falls in the configured inclusive near-miss
    range."""

    weights = _settings()
    return weights["NEAR_MISS_MIN_SCORE"] <= final_score <= weights["NEAR_MISS_MAX_SCORE"]


def find_near_miss_jobs(worker_profile):
    """Ranked `RecommendationResult`s for jobs that are a near miss for
    `worker_profile`, using the same candidate pool and scoring as the
    Week 4 worker-to-job recommendation endpoint."""

    jobs = filter_candidate_jobs_for_worker(worker_profile)
    results = [evaluate_match(worker_profile, job, direction="worker_to_job") for job in jobs]
    near_misses = [result for result in results if is_near_miss_score(result.final_score)]
    near_misses.sort(key=lambda result: (-result.final_score, result.job.id))
    return near_misses


@dataclass
class MissingSkillAdvisory:
    skill: object  # taxonomy.SkillTag
    missing_frequency: int
    required_frequency: int
    reason: str
    job_ids: list = field(default_factory=list)


def rank_missing_skills(near_miss_results):
    """Required skills missing across `near_miss_results`, ranked by how
    many near-miss jobs would open up if learned.

    Sort order: `missing_frequency` (how many near-miss jobs are missing
    this skill) descending, then `required_frequency` (how many near-miss
    jobs require this skill at all, matched or not - a broader demand
    signal) descending, then the skill's id and name for a fully
    deterministic tie-break.
    """

    missing_frequency = {}
    required_frequency = {}
    job_ids_by_skill = {}
    skills_by_id = {}

    for result in near_miss_results:
        required_ids = {skill.id for skill in result.skill.matched_required_skills}
        required_ids |= {skill.id for skill in result.skill.missing_required_skills}

        for skill in result.skill.missing_required_skills:
            skills_by_id[skill.id] = skill
            missing_frequency[skill.id] = missing_frequency.get(skill.id, 0) + 1
            job_ids_by_skill.setdefault(skill.id, []).append(result.job.id)

        for skill_id in required_ids:
            required_frequency[skill_id] = required_frequency.get(skill_id, 0) + 1

    ranked_ids = sorted(
        missing_frequency,
        key=lambda skill_id: (
            -missing_frequency[skill_id],
            -required_frequency.get(skill_id, 0),
            skill_id,
        ),
    )

    return [
        MissingSkillAdvisory(
            skill=skills_by_id[skill_id],
            missing_frequency=missing_frequency[skill_id],
            required_frequency=required_frequency.get(skill_id, 0),
            reason=(
                f"Learning {skills_by_id[skill_id].name} could strengthen your match for "
                + (
                    "1 near-miss job that requires it."
                    if missing_frequency[skill_id] == 1
                    else f"{missing_frequency[skill_id]} near-miss jobs that require it."
                )
            ),
            job_ids=job_ids_by_skill[skill_id],
        )
        for skill_id in ranked_ids
    ]


@dataclass
class OpportunityAdvisory:
    near_miss_jobs: list
    missing_skills: list


def build_opportunity_advisory(worker_profile):
    near_miss_jobs = find_near_miss_jobs(worker_profile)
    missing_skills = rank_missing_skills(near_miss_jobs)[:MAX_SUGGESTED_SKILLS]
    return OpportunityAdvisory(near_miss_jobs=near_miss_jobs, missing_skills=missing_skills)
