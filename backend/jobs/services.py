"""Week 3 job/worker matching filters.

Coarse, rule-based filtering only (category/subcategory, active status,
availability, schedule, and Haversine distance against a travel radius).
The weighted recommendation score is out of scope until Week 4.
"""

import math

from django.db.models import Q
from django.utils import timezone

from profiles.models import WorkerProfile

from .models import JobPost

EARTH_RADIUS_KM = 6371.0


def haversine_distance_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in kilometres between two lat/long points."""

    lat1, lon1, lat2, lon2 = (float(value) for value in (lat1, lon1, lat2, lon2))

    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )

    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def filter_active_jobs(
    *,
    category_id=None,
    subcategory_id=None,
    work_type=None,
    latitude=None,
    longitude=None,
    max_distance_km=None,
):
    """Active jobs, filtered by category/subcategory/work type and,
    optionally, distance from an arbitrary (latitude, longitude) origin.

    This has no dependency on any worker account, so it is safe to use
    for anonymous public browsing. Distance filtering is only applied
    when an origin (`latitude` and `longitude`) and `max_distance_km` are
    all supplied; otherwise jobs are not excluded by distance. Jobs whose
    application deadline has already passed are excluded ("job schedule
    where practical").
    """

    queryset = JobPost.objects.filter(status=JobPost.Status.ACTIVE).select_related(
        "category", "subcategory", "employer"
    )

    if category_id:
        queryset = queryset.filter(category_id=category_id)

    if subcategory_id:
        queryset = queryset.filter(subcategory_id=subcategory_id)

    if work_type:
        queryset = queryset.filter(work_type=work_type)

    queryset = queryset.filter(
        Q(application_deadline__isnull=True) | Q(application_deadline__gte=timezone.now())
    )

    if latitude is None or longitude is None or max_distance_km is None:
        return list(queryset)

    return [
        job
        for job in queryset
        if haversine_distance_km(latitude, longitude, job.latitude, job.longitude) <= max_distance_km
    ]


def filter_active_jobs_for_worker(worker_profile, *, category_id=None, subcategory_id=None, work_type=None, max_distance_km=None):
    """Active jobs a worker may plausibly apply to.

    Distance filtering uses `max_distance_km` if given, otherwise the
    worker's own `preferred_travel_radius_km`. If neither is available, or
    the worker has no coordinates set, distance is not used to exclude
    jobs.
    """

    radius = max_distance_km if max_distance_km is not None else worker_profile.preferred_travel_radius_km

    return filter_active_jobs(
        category_id=category_id,
        subcategory_id=subcategory_id,
        work_type=work_type,
        latitude=worker_profile.latitude,
        longitude=worker_profile.longitude,
        max_distance_km=radius if worker_profile.latitude is not None and worker_profile.longitude is not None else None,
    )


def filter_candidate_workers_for_job(job, *, max_distance_km=None):
    """Available workers who plausibly match a job's category/subcategory.

    Distance filtering uses `max_distance_km` if given (an employer-chosen
    search radius), otherwise each worker's own
    `preferred_travel_radius_km`. Workers without coordinates, or without
    any applicable radius, are not excluded by distance.
    """

    queryset = (
        WorkerProfile.objects.filter(is_available=True, skills__subcategory=job.subcategory)
        .select_related("user")
        .distinct()
    )

    candidates = []

    for worker in queryset:
        if worker.latitude is None or worker.longitude is None:
            candidates.append(worker)
            continue

        radius = max_distance_km if max_distance_km is not None else worker.preferred_travel_radius_km

        if radius is None:
            candidates.append(worker)
            continue

        distance = haversine_distance_km(job.latitude, job.longitude, worker.latitude, worker.longitude)

        if distance <= radius:
            candidates.append(worker)

    return candidates
