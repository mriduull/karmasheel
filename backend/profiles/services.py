"""Week 5 automatic worker CV generation.

The professional summary is deterministic and template-based - built
entirely from fields already stored on the worker profile and its user
account. No LLM, external text-generation service, employment history,
certificates, or ratings are invented.
"""

from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

MAX_SUMMARY_SKILLS = 6


def _join_with_and(items):
    if not items:
        return ""

    if len(items) == 1:
        return items[0]

    if len(items) == 2:
        return f"{items[0]} and {items[1]}"

    return f"{', '.join(items[:-1])} and {items[-1]}"


def _dominant_subcategory_phrase(skills):
    """The most common skill subcategory name among `skills`, lowercased
    for use in a sentence (e.g. "Electrical" -> "electrical"). `None` if
    the worker has no recorded skills."""

    if not skills:
        return None

    counts = {}
    order = []

    for skill in skills:
        name = skill.subcategory.name
        if name not in counts:
            order.append(name)
        counts[name] = counts.get(name, 0) + 1

    top_name = max(order, key=lambda name: counts[name])
    return top_name.lower()


def generate_worker_summary(worker_profile):
    """Rule-based, deterministic one-sentence professional summary, e.g.:

    "Worker with 4 years of experience in electrical work, skilled in
    House Wiring, Fan Installation and Fault Diagnosis, currently
    available for work."

    Handles incomplete profiles (no experience, no skills) gracefully by
    omitting the clauses that have nothing to report.
    """

    skills = list(worker_profile.skills.all())
    experience_years = worker_profile.experience_years

    sentence = "Worker"

    if experience_years > 0:
        year_word = "year" if experience_years == 1 else "years"
        subcategory_phrase = _dominant_subcategory_phrase(skills)

        if subcategory_phrase:
            sentence += f" with {experience_years} {year_word} of experience in {subcategory_phrase} work"
        else:
            sentence += f" with {experience_years} {year_word} of experience"

    if skills:
        skill_names = [skill.name for skill in skills[:MAX_SUMMARY_SKILLS]]
        sentence += f", skilled in {_join_with_and(skill_names)}"

    if worker_profile.is_available:
        sentence += ", currently available for work."
    else:
        sentence += ", currently not available for new work."

    return sentence


def build_worker_cv_context(worker_profile):
    """Template context for the worker CV - only information already
    stored on the worker profile and its own user account. Never
    includes PAN/VAT or any other employer-only data."""

    user = worker_profile.user
    skills = list(worker_profile.skills.order_by("name"))

    return {
        "full_name": user.get_full_name() or user.username,
        "username": user.username,
        "phone_number": user.phone_number,
        "is_contact_verified": user.is_contact_verified,
        "address": worker_profile.address,
        "professional_summary": generate_worker_summary(worker_profile),
        "skills": skills,
        "experience_years": worker_profile.experience_years,
        "is_available": worker_profile.is_available,
        "expected_wage": worker_profile.expected_wage,
        "preferred_travel_radius_km": worker_profile.preferred_travel_radius_km,
        "generated_at": timezone.now(),
    }


def render_worker_cv_html(worker_profile):
    context = build_worker_cv_context(worker_profile)
    return render_to_string("profiles/worker_cv.html", context)


def render_worker_cv_pdf(worker_profile):
    html_string = render_worker_cv_html(worker_profile)
    return HTML(string=html_string).write_pdf()
