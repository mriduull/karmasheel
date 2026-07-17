from django.http import HttpResponse
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsEmployer, IsWorker

from .models import EmployerProfile, WorkerProfile
from .serializers import EmployerProfileSerializer, WorkerProfileSerializer
from .services import render_worker_cv_html, render_worker_cv_pdf


class WorkerProfileView(APIView):
    """Create, retrieve, or update the authenticated worker's own profile.

    Scoped entirely to `request.user`, so ownership is enforced
    structurally - there is no way to address another worker's profile
    through this endpoint.
    """

    permission_classes = [IsAuthenticated, IsWorker]

    def get_object(self):
        return WorkerProfile.objects.filter(user=self.request.user).first()

    def get(self, request):
        profile = self.get_object()

        if profile is None:
            return Response(
                {"detail": "Worker profile not found. Submit a POST request to create one."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = WorkerProfileSerializer(profile, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        if self.get_object() is not None:
            return Response(
                {"detail": "Worker profile already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = WorkerProfileSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _update(self, request, partial):
        profile = self.get_object()

        if profile is None:
            return Response(
                {"detail": "Worker profile not found. Submit a POST request to create one."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = WorkerProfileSerializer(
            profile,
            data=request.data,
            partial=partial,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def put(self, request):
        return self._update(request, partial=False)

    def patch(self, request):
        return self._update(request, partial=True)


class WorkerCVPreviewView(APIView):
    """HTML preview of the authenticated worker's own auto-generated CV.

    Scoped entirely to `request.user`, exactly like `WorkerProfileView` -
    there is no way to preview another worker's CV through this endpoint.
    """

    permission_classes = [IsAuthenticated, IsWorker]

    def get(self, request):
        profile = (
            WorkerProfile.objects.filter(user=request.user)
            .select_related("user")
            .prefetch_related("skills__subcategory")
            .first()
        )

        if profile is None:
            return Response(
                {"detail": "Worker profile not found. Create your worker profile first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        html = render_worker_cv_html(profile)
        return HttpResponse(html, content_type="text/html")


class WorkerCVPdfView(APIView):
    """PDF download of the authenticated worker's own auto-generated CV."""

    permission_classes = [IsAuthenticated, IsWorker]

    def get(self, request):
        profile = (
            WorkerProfile.objects.filter(user=request.user)
            .select_related("user")
            .prefetch_related("skills__subcategory")
            .first()
        )

        if profile is None:
            return Response(
                {"detail": "Worker profile not found. Create your worker profile first."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_bytes = render_worker_cv_pdf(profile)
        filename = f"cv-{slugify(profile.user.username) or profile.user.id}.pdf"

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class EmployerProfileView(APIView):
    """Create, retrieve, or update the authenticated employer's own profile.

    Scoped entirely to `request.user`, so ownership is enforced
    structurally - there is no way to address another employer's profile
    through this endpoint.
    """

    permission_classes = [IsAuthenticated, IsEmployer]

    def get_object(self):
        return EmployerProfile.objects.filter(user=self.request.user).first()

    def get(self, request):
        profile = self.get_object()

        if profile is None:
            return Response(
                {"detail": "Employer profile not found. Submit a POST request to create one."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = EmployerProfileSerializer(profile)
        return Response(serializer.data)

    def post(self, request):
        if self.get_object() is not None:
            return Response(
                {"detail": "Employer profile already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = EmployerProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _update(self, request, partial):
        profile = self.get_object()

        if profile is None:
            return Response(
                {"detail": "Employer profile not found. Submit a POST request to create one."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = EmployerProfileSerializer(profile, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def put(self, request):
        return self._update(request, partial=False)

    def patch(self, request):
        return self._update(request, partial=True)
