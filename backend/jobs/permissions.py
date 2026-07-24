from rest_framework.permissions import BasePermission

from profiles.models import EmployerProfile


class IsVerifiedEmployer(BasePermission):
    """Allow access only to authenticated employers whose profile has been
    manually verified through the admin. Unverified employers must not be
    able to post jobs."""

    message = "Only verified employers can perform this action."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        return EmployerProfile.objects.filter(
            user=request.user,
            verification_status=EmployerProfile.VerificationStatus.VERIFIED,
        ).exists()
