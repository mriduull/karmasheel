"""Week 3 application-status state machine, and Week 5 ratings.

Valid transitions are enforced here rather than trusting arbitrary
serializer input. Which transitions are legal depends on which side of
the application the acting user is on: the applying worker, or the
employer who owns the job.
"""

from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import Avg, Count

from .models import Application, Rating

WORKER_ALLOWED_TRANSITIONS = {
    Application.Status.APPLIED: {Application.Status.WITHDRAWN},
    Application.Status.SHORTLISTED: {Application.Status.WITHDRAWN},
    Application.Status.CONTACTED: {Application.Status.WITHDRAWN},
}

EMPLOYER_ALLOWED_TRANSITIONS = {
    Application.Status.APPLIED: {
        Application.Status.SHORTLISTED,
        Application.Status.CONTACTED,
        Application.Status.REJECTED,
    },
    Application.Status.SHORTLISTED: {
        Application.Status.CONTACTED,
        Application.Status.HIRED,
        Application.Status.REJECTED,
    },
    Application.Status.CONTACTED: {
        Application.Status.HIRED,
        Application.Status.REJECTED,
    },
    Application.Status.HIRED: {
        Application.Status.COMPLETED,
        Application.Status.CANCELLED,
    },
}


def transition_application_status(application, new_status, *, actor):
    """Move `application` to `new_status` on behalf of `actor`.

    Raises `django.core.exceptions.ValidationError` if `actor` is not a
    participant in the application, or if the transition is not legal for
    that participant from the application's current status.
    """

    current_status = application.status

    if actor.id == application.worker.user_id:
        allowed_targets = WORKER_ALLOWED_TRANSITIONS.get(current_status, set())
    elif actor.id == application.job.employer.user_id:
        allowed_targets = EMPLOYER_ALLOWED_TRANSITIONS.get(current_status, set())
    else:
        raise ValidationError("You are not a participant in this application.")

    if new_status not in allowed_targets:
        raise ValidationError(
            f"Cannot transition application from {current_status} to {new_status}."
        )

    application.status = new_status
    application.save(update_fields=["status", "updated_at"])
    return application


# ---------------------------------------------------------------------
# Week 5 - ratings
# ---------------------------------------------------------------------

def submit_rating(application, *, reviewer, score, review_text=""):
    """Create a `Rating` from `reviewer` for the other participant of
    `application`.

    Only allowed once an application has reached `COMPLETED` - there is
    no completed engagement to rate before then. `direction` and
    `reviewed_user` are derived from which side of the application
    `reviewer` is on, never taken from client input, so a participant can
    only ever rate the other side. Raises `ValidationError` if the
    application is not completed, if `reviewer` is not a participant, or
    if that direction has already been rated for this application (the
    `unique_rating_per_application_direction` constraint is the
    authoritative guard; the pre-check here just gives a friendlier
    error than an `IntegrityError`).
    """

    if application.status != Application.Status.COMPLETED:
        raise ValidationError("Only completed applications can be rated.")

    if reviewer.id == application.worker.user_id:
        direction = Rating.Direction.WORKER_TO_EMPLOYER
        reviewed_user = application.job.employer.user
    elif reviewer.id == application.job.employer.user_id:
        direction = Rating.Direction.EMPLOYER_TO_WORKER
        reviewed_user = application.worker.user
    else:
        raise ValidationError("You are not a participant in this application.")

    if Rating.objects.filter(application=application, direction=direction).exists():
        raise ValidationError("You have already rated this application.")

    try:
        return Rating.objects.create(
            application=application,
            reviewer=reviewer,
            reviewed_user=reviewed_user,
            direction=direction,
            score=score,
            review_text=review_text,
        )
    except IntegrityError:
        raise ValidationError("You have already rated this application.")


def get_rating_summary(user):
    """(average_rating, rating_count) across every rating `user` has
    received, in either direction. `average_rating` is `None` (never
    invented, e.g. as 0) when `user` has no ratings yet - this is the
    cold-start case `recommendations.services` keeps isolated from."""

    aggregate = Rating.objects.filter(reviewed_user=user).aggregate(
        average_rating=Avg("score"), rating_count=Count("id")
    )

    average_rating = aggregate["average_rating"]

    return (
        round(average_rating, 2) if average_rating is not None else None,
        aggregate["rating_count"],
    )
