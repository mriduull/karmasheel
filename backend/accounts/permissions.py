from rest_framework.permissions import BasePermission

from .models import User


class IsWorker(BasePermission):
    """Allow access only to authenticated workers."""

    message = "Only workers can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.WORKER
        )


class IsEmployer(BasePermission):
    """Allow access only to authenticated employers."""

    message = "Only employers can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.EMPLOYER
        )