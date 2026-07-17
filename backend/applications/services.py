"""Week 3 application-status state machine.

Valid transitions are enforced here rather than trusting arbitrary
serializer input. Which transitions are legal depends on which side of
the application the acting user is on: the applying worker, or the
employer who owns the job.
"""

from django.core.exceptions import ValidationError

from .models import Application

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
