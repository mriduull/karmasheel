"""Week 6 Phase 4 - reproducible end-to-end demo dataset.

Builds a coherent, idempotent demonstration dataset on top of the
standardized taxonomy (reusing `seed_taxonomy` rather than duplicating
it): a superuser, three verified employers and one pending employer, ten
workers with deliberately different skills/experience/location/
availability/wage/reliability profiles, a dozen active jobs spanning
electrical, plumbing, masonry, painting, cleaning, cooking, hospitality,
driving/delivery and caregiving work, applications covering every legal
status in the application state machine (including one full
worker-to-job hire), a completed application rated in both directions,
and one deliberately unmatched skill phrase for admin review.

The original four workers (Ramesh, Sita, Hari, Gita) and five jobs keep
their exact original field values so the scores already documented in
docs/DEMO_SCRIPT.md keep working; everything else is additive.

Safe to run repeatedly: every record is looked up by a natural key
(username, employer+title, worker+job, etc.) via get_or_create/
update_or_create, so reruns update the same rows instead of duplicating
them. Application status changes go through
`applications.services.transition_application_status` and
`submit_rating` - the same state machine and rules the API enforces -
never by writing `status` directly, and reruns skip transitions already
applied so an already-COMPLETED demo application is never re-transitioned.

Refuses to run when `settings.DEBUG` is `False` (the local/production
signal already used elsewhere in this project), unless `--force` is
passed - this is synthetic local-development data and must never land in
a production database by accident.
"""

from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from applications.models import Application, Rating
from applications.services import submit_rating, transition_application_status
from jobs.models import JobPost
from profiles.models import EmployerProfile, WorkerProfile
from taxonomy.models import Category, SkillTag, Subcategory, UnmatchedSkillTerm
from taxonomy.services import normalize_skill_phrase

User = get_user_model()

DEMO_PASSWORD = "DemoPass123!"


class Command(BaseCommand):
    help = (
        "Seed a coherent, idempotent demo dataset (taxonomy, superuser, "
        "employers, workers, jobs, applications, ratings) for local "
        "development and demonstration. Refuses to run when DEBUG=False "
        "unless --force is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Allow the command to run even when settings.DEBUG is False.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "seed_demo creates obviously-synthetic local-development data "
                "and refuses to run with DEBUG=False. Pass --force if you are "
                "certain this is not a production database."
            )

        with transaction.atomic():
            self.summary = {}

            self.stdout.write("Seeding taxonomy...")
            call_command("seed_taxonomy")

            self._seed_superuser()
            self._seed_employers()
            self._seed_workers()
            self._seed_jobs()
            self._seed_applications_and_ratings()
            self._seed_unmatched_skill_term()

        self._print_summary()

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------

    def _get_or_update_user(self, username, *, phone_number, email, role, is_contact_verified, is_staff=False, is_superuser=False):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "phone_number": phone_number,
                "email": email,
                "role": role,
                "is_contact_verified": is_contact_verified,
                "is_staff": is_staff,
                "is_superuser": is_superuser,
            },
        )

        user.phone_number = phone_number
        user.email = email
        user.role = role
        user.is_contact_verified = is_contact_verified
        user.is_staff = is_staff
        user.is_superuser = is_superuser
        user.set_password(DEMO_PASSWORD)
        user.save()

        return user, created

    def _seed_superuser(self):
        user, created = self._get_or_update_user(
            "demo_admin",
            phone_number="9811100000",
            email="demo_admin@karmasheel.local",
            role="",
            is_contact_verified=True,
            is_staff=True,
            is_superuser=True,
        )
        self.summary["superuser"] = (user.username, created)

    # ------------------------------------------------------------------
    # Employers
    # ------------------------------------------------------------------

    def _seed_employers(self):
        verified_user, verified_created = self._get_or_update_user(
            "demo_employer_verified",
            phone_number="9811100001",
            email="demo_employer_verified@karmasheel.local",
            role=User.Role.EMPLOYER,
            is_contact_verified=True,
        )
        self.verified_employer, _ = EmployerProfile.objects.update_or_create(
            user=verified_user,
            defaults={
                "organization_name": "Kathmandu Home Services Pvt. Ltd.",
                "address": "Baneshwor, Kathmandu",
                "latitude": Decimal("27.693800"),
                "longitude": Decimal("85.335500"),
                "pan_vat_number": "100200300",
                "verification_status": EmployerProfile.VerificationStatus.VERIFIED,
            },
        )

        pending_user, pending_created = self._get_or_update_user(
            "demo_employer_pending",
            phone_number="9811100002",
            email="demo_employer_pending@karmasheel.local",
            role=User.Role.EMPLOYER,
            is_contact_verified=False,
        )
        self.pending_employer, _ = EmployerProfile.objects.update_or_create(
            user=pending_user,
            defaults={
                "organization_name": "Pending Facility Works",
                "address": "Lalitpur",
                "latitude": Decimal("27.667400"),
                "longitude": Decimal("85.323900"),
                "pan_vat_number": "200300400",
                "verification_status": EmployerProfile.VerificationStatus.PENDING,
            },
        )

        # Second verified employer: a hospitality/event company, so
        # recommendation demos are not all rooted at one employer.
        hospitality_user, hospitality_created = self._get_or_update_user(
            "demo_employer_hospitality",
            phone_number="9811100003",
            email="demo_employer_hospitality@karmasheel.local",
            role=User.Role.EMPLOYER,
            is_contact_verified=True,
        )
        self.employer_hospitality, _ = EmployerProfile.objects.update_or_create(
            user=hospitality_user,
            defaults={
                "organization_name": "Everest Hospitality & Events Pvt. Ltd.",
                "address": "Lazimpat, Kathmandu",
                "latitude": Decimal("27.717000"),
                "longitude": Decimal("85.317000"),
                "pan_vat_number": "300400500",
                "verification_status": EmployerProfile.VerificationStatus.VERIFIED,
            },
        )

        # Third verified employer: a retail/delivery/facility-service
        # company, covering the driving-delivery and caregiving jobs.
        retail_user, retail_created = self._get_or_update_user(
            "demo_employer_retail",
            phone_number="9811100004",
            email="demo_employer_retail@karmasheel.local",
            role=User.Role.EMPLOYER,
            is_contact_verified=True,
        )
        self.employer_retail, _ = EmployerProfile.objects.update_or_create(
            user=retail_user,
            defaults={
                "organization_name": "Valley Retail & Facility Services Pvt. Ltd.",
                "address": "Koteshwor, Kathmandu",
                "latitude": Decimal("27.677500"),
                "longitude": Decimal("85.347000"),
                "pan_vat_number": "400500600",
                "verification_status": EmployerProfile.VerificationStatus.VERIFIED,
            },
        )

        self.summary["employers"] = [
            (verified_user.username, "VERIFIED", verified_created),
            (hospitality_user.username, "VERIFIED", hospitality_created),
            (retail_user.username, "VERIFIED", retail_created),
            (pending_user.username, "PENDING", pending_created),
        ]

    # ------------------------------------------------------------------
    # Workers
    # ------------------------------------------------------------------

    def _skill(self, subcategory_name, skill_name, category_name):
        category = Category.objects.get(name=category_name)
        subcategory = Subcategory.objects.get(category=category, name=subcategory_name)
        return SkillTag.objects.get(subcategory=subcategory, name=skill_name)

    def _seed_workers(self):
        construction = "Construction & Repair"
        domestic = "Domestic & Local Services"

        # Ramesh: strong all-round match for the electrical job below -
        # every required/preferred skill, plenty of experience, close by,
        # verified contact, wage expectation comfortably met.
        ramesh_user, ramesh_created = self._get_or_update_user(
            "demo_worker_ramesh",
            phone_number="9811100011",
            email="demo_worker_ramesh@karmasheel.local",
            role=User.Role.WORKER,
            is_contact_verified=True,
        )
        self.worker_ramesh, _ = WorkerProfile.objects.update_or_create(
            user=ramesh_user,
            defaults={
                "address": "Koteshwor, Kathmandu",
                "latitude": Decimal("27.677800"),
                "longitude": Decimal("85.348800"),
                "experience_years": 6,
                "is_available": True,
                "expected_wage": Decimal("1200.00"),
                "preferred_travel_radius_km": 15,
            },
        )
        self.worker_ramesh.skills.set([
            self._skill("Electrical", "House Wiring", construction),
            self._skill("Electrical", "Circuit Breaker Installation", construction),
            self._skill("Electrical", "Electrical Repair", construction),
        ])

        # Sita: strong match for the cleaning job, moderate experience,
        # close by, verified contact.
        sita_user, sita_created = self._get_or_update_user(
            "demo_worker_sita",
            phone_number="9811100012",
            email="demo_worker_sita@karmasheel.local",
            role=User.Role.WORKER,
            is_contact_verified=True,
        )
        self.worker_sita, _ = WorkerProfile.objects.update_or_create(
            user=sita_user,
            defaults={
                "address": "Patan, Lalitpur",
                "latitude": Decimal("27.673100"),
                "longitude": Decimal("85.325000"),
                "experience_years": 2,
                "is_available": True,
                "expected_wage": Decimal("800.00"),
                "preferred_travel_radius_km": 10,
            },
        )
        self.worker_sita.skills.set([
            self._skill("Cleaning", "House Cleaning", domestic),
            self._skill("Cleaning", "Deep Cleaning", domestic),
        ])

        # Hari: only one of the two required masonry skills, less
        # experience than required, contact unverified, no stated wage or
        # travel-radius preference - lands in the near-miss band and
        # surfaces "Tile Installation" as a missing-skill opportunity.
        hari_user, hari_created = self._get_or_update_user(
            "demo_worker_hari",
            phone_number="9811100013",
            email="demo_worker_hari@karmasheel.local",
            role=User.Role.WORKER,
            is_contact_verified=False,
        )
        self.worker_hari, _ = WorkerProfile.objects.update_or_create(
            user=hari_user,
            defaults={
                "address": "Bhaktapur",
                "latitude": Decimal("27.671800"),
                "longitude": Decimal("85.428800"),
                "experience_years": 1,
                "is_available": True,
                "expected_wage": None,
                "preferred_travel_radius_km": None,
            },
        )
        self.worker_hari.skills.set([
            self._skill("Masonry", "Brick Laying", construction),
        ])

        # Gita: no recorded location (exercises the "distance unknown"
        # code path) and missing "Kitchen Helper" for the cooking job -
        # a second, independent missing-skill opportunity signal.
        gita_user, gita_created = self._get_or_update_user(
            "demo_worker_gita",
            phone_number="9811100014",
            email="demo_worker_gita@karmasheel.local",
            role=User.Role.WORKER,
            is_contact_verified=False,
        )
        self.worker_gita, _ = WorkerProfile.objects.update_or_create(
            user=gita_user,
            defaults={
                "address": "",
                "latitude": None,
                "longitude": None,
                "experience_years": 0,
                "is_available": True,
                "expected_wage": None,
                "preferred_travel_radius_km": None,
            },
        )
        self.worker_gita.skills.set([
            self._skill("Cooking", "Home Cooking", domestic),
            self._skill("Cooking", "Meal Preparation", domestic),
        ])

        hospitality = "Hospitality & Food Services"
        driving = "Driving & Delivery"
        caregiving = "Caregiving & Personal Support"

        # Bimal: strong plumbing match - every required/preferred skill
        # for the plumbing job below, close by, experienced, verified.
        bimal_user, bimal_created = self._get_or_update_user(
            "demo_worker_bimal",
            phone_number="9811100015",
            email="demo_worker_bimal@karmasheel.local",
            role=User.Role.WORKER,
            is_contact_verified=True,
        )
        self.worker_bimal, _ = WorkerProfile.objects.update_or_create(
            user=bimal_user,
            defaults={
                "address": "Jawalakhel, Lalitpur",
                "latitude": Decimal("27.671500"),
                "longitude": Decimal("85.314200"),
                "experience_years": 5,
                "is_available": True,
                "expected_wage": Decimal("900.00"),
                "preferred_travel_radius_km": 12,
            },
        )
        self.worker_bimal.skills.set([
            self._skill("Plumbing", "Pipe Fitting", construction),
            self._skill("Plumbing", "Water Tank Installation", construction),
            self._skill("Plumbing", "Leak Repair", construction),
        ])

        # Kamal: multi-skilled across electrical, masonry and painting,
        # but only ever partially matches each job's required skills, with
        # moderate experience - useful for several jobs without ever being
        # the top candidate on any of them.
        kamal_user, kamal_created = self._get_or_update_user(
            "demo_worker_kamal",
            phone_number="9811100016",
            email="demo_worker_kamal@karmasheel.local",
            role=User.Role.WORKER,
            is_contact_verified=True,
        )
        self.worker_kamal, _ = WorkerProfile.objects.update_or_create(
            user=kamal_user,
            defaults={
                "address": "Chabahil, Kathmandu",
                "latitude": Decimal("27.717800"),
                "longitude": Decimal("85.345500"),
                "experience_years": 3,
                "is_available": True,
                "expected_wage": Decimal("1000.00"),
                "preferred_travel_radius_km": 20,
            },
        )
        self.worker_kamal.skills.set([
            self._skill("Electrical", "House Wiring", construction),
            self._skill("Masonry", "Brick Laying", construction),
            self._skill("Masonry", "Plastering", construction),
            self._skill("Painting", "Wall Painting", construction),
        ])

        # Maya: strong hospitality/waitstaff match.
        maya_user, maya_created = self._get_or_update_user(
            "demo_worker_maya",
            phone_number="9811100017",
            email="demo_worker_maya@karmasheel.local",
            role=User.Role.WORKER,
            is_contact_verified=True,
        )
        self.worker_maya, _ = WorkerProfile.objects.update_or_create(
            user=maya_user,
            defaults={
                "address": "Thamel, Kathmandu",
                "latitude": Decimal("27.715000"),
                "longitude": Decimal("85.310000"),
                "experience_years": 2,
                "is_available": True,
                "expected_wage": Decimal("800.00"),
                "preferred_travel_radius_km": 10,
            },
        )
        self.worker_maya.skills.set([
            self._skill("Waitstaff & Table Service", "Table Service", hospitality),
            self._skill("Waitstaff & Table Service", "Order Taking", hospitality),
        ])

        # Sunita: strong elderly-caregiving match.
        sunita_user, sunita_created = self._get_or_update_user(
            "demo_worker_sunita",
            phone_number="9811100018",
            email="demo_worker_sunita@karmasheel.local",
            role=User.Role.WORKER,
            is_contact_verified=True,
        )
        self.worker_sunita, _ = WorkerProfile.objects.update_or_create(
            user=sunita_user,
            defaults={
                "address": "Battisputali, Kathmandu",
                "latitude": Decimal("27.700000"),
                "longitude": Decimal("85.340000"),
                "experience_years": 4,
                "is_available": True,
                "expected_wage": Decimal("1100.00"),
                "preferred_travel_radius_km": 15,
            },
        )
        self.worker_sunita.skills.set([
            self._skill("Elderly Care", "Elderly Personal Care", caregiving),
            self._skill("Elderly Care", "Companionship Care", caregiving),
        ])

        # Deepak: strong two-wheeler delivery match.
        deepak_user, deepak_created = self._get_or_update_user(
            "demo_worker_deepak",
            phone_number="9811100019",
            email="demo_worker_deepak@karmasheel.local",
            role=User.Role.WORKER,
            is_contact_verified=True,
        )
        self.worker_deepak, _ = WorkerProfile.objects.update_or_create(
            user=deepak_user,
            defaults={
                "address": "Koteshwor, Kathmandu",
                "latitude": Decimal("27.678500"),
                "longitude": Decimal("85.349000"),
                "experience_years": 2,
                "is_available": True,
                "expected_wage": Decimal("700.00"),
                "preferred_travel_radius_km": 15,
            },
        )
        self.worker_deepak.skills.set([
            self._skill("Two-Wheeler Delivery", "Motorbike Food Delivery", driving),
            self._skill("Two-Wheeler Delivery", "Parcel Delivery", driving),
        ])

        # Suresh: the same electrical skills and experience as Ramesh -
        # otherwise an equally strong candidate - but based far away in
        # Pokhara with no stated travel radius, so distance (not skill or
        # experience) is what pushes him below Ramesh in the rankings.
        suresh_user, suresh_created = self._get_or_update_user(
            "demo_worker_suresh",
            phone_number="9811100020",
            email="demo_worker_suresh@karmasheel.local",
            role=User.Role.WORKER,
            is_contact_verified=True,
        )
        self.worker_suresh, _ = WorkerProfile.objects.update_or_create(
            user=suresh_user,
            defaults={
                "address": "Lakeside, Pokhara",
                "latitude": Decimal("28.209600"),
                "longitude": Decimal("83.985600"),
                "experience_years": 6,
                "is_available": True,
                "expected_wage": Decimal("1200.00"),
                "preferred_travel_radius_km": None,
            },
        )
        self.worker_suresh.skills.set([
            self._skill("Electrical", "House Wiring", construction),
            self._skill("Electrical", "Circuit Breaker Installation", construction),
            self._skill("Electrical", "Electrical Repair", construction),
        ])

        self.summary["workers"] = [
            (ramesh_user.username, ramesh_created),
            (sita_user.username, sita_created),
            (hari_user.username, hari_created),
            (gita_user.username, gita_created),
            (bimal_user.username, bimal_created),
            (kamal_user.username, kamal_created),
            (maya_user.username, maya_created),
            (sunita_user.username, sunita_created),
            (deepak_user.username, deepak_created),
            (suresh_user.username, suresh_created),
        ]

    # ------------------------------------------------------------------
    # Jobs
    # ------------------------------------------------------------------

    def _job(self, *, title, category_name, subcategory_name, required, preferred, description, address, latitude, longitude, required_experience_years, wage_type, wage_amount, work_type, number_of_workers_required=1, employer=None):
        category = Category.objects.get(name=category_name)
        subcategory = Subcategory.objects.get(category=category, name=subcategory_name)

        job, created = JobPost.objects.update_or_create(
            employer=employer or self.verified_employer,
            title=title,
            defaults={
                "category": category,
                "subcategory": subcategory,
                "description": description,
                "address": address,
                "latitude": Decimal(latitude),
                "longitude": Decimal(longitude),
                "required_experience_years": required_experience_years,
                "wage_type": wage_type,
                "wage_amount": Decimal(wage_amount),
                "work_type": work_type,
                "number_of_workers_required": number_of_workers_required,
                "application_deadline": timezone.now() + timezone.timedelta(days=30),
                "status": JobPost.Status.ACTIVE,
            },
        )

        job.required_skills.set([
            self._skill(subcategory_name, name, category_name) for name in required
        ])
        job.preferred_skills.set([
            self._skill(subcategory_name, name, category_name) for name in preferred
        ])

        return job, created

    def _seed_jobs(self):
        construction = "Construction & Repair"
        domestic = "Domestic & Local Services"

        self.job_wiring, wiring_created = self._job(
            title="House Wiring for New Apartment Block",
            category_name=construction,
            subcategory_name="Electrical",
            required=["House Wiring", "Circuit Breaker Installation"],
            preferred=["Electrical Repair"],
            description="Complete wiring and breaker installation for a new four-unit apartment block.",
            address="Baneshwor, Kathmandu",
            latitude="27.693800",
            longitude="85.335500",
            required_experience_years=3,
            wage_type=JobPost.WageType.DAILY,
            wage_amount="1300.00",
            work_type=JobPost.WorkType.CONTRACT,
            number_of_workers_required=2,
        )

        self.job_cleaning, cleaning_created = self._job(
            title="Deep Cleaning for Office Space",
            category_name=domestic,
            subcategory_name="Cleaning",
            required=["House Cleaning", "Deep Cleaning"],
            preferred=["Window Cleaning"],
            description="One-time deep clean of a small office ahead of reopening.",
            address="Patan, Lalitpur",
            latitude="27.673100",
            longitude="85.325000",
            required_experience_years=1,
            wage_type=JobPost.WageType.DAILY,
            wage_amount="900.00",
            work_type=JobPost.WorkType.ONE_TIME,
        )

        self.job_masonry, masonry_created = self._job(
            title="Bathroom & Tile Renovation",
            category_name=construction,
            subcategory_name="Masonry",
            required=["Brick Laying", "Tile Installation"],
            preferred=["Plastering"],
            description="Renovate a bathroom: brickwork repairs and new tile installation.",
            address="Thimi, Bhaktapur",
            latitude="27.680000",
            longitude="85.400000",
            required_experience_years=2,
            wage_type=JobPost.WageType.DAILY,
            wage_amount="1000.00",
            work_type=JobPost.WorkType.CONTRACT,
        )

        self.job_cooking, cooking_created = self._job(
            title="Home Cooking for Family Event",
            category_name=domestic,
            subcategory_name="Cooking",
            required=["Home Cooking", "Kitchen Helper"],
            preferred=["Catering Assistance"],
            description="Prepare and serve meals for a one-day family event.",
            address="New Baneshwor, Kathmandu",
            latitude="27.688000",
            longitude="85.340000",
            required_experience_years=0,
            wage_type=JobPost.WageType.FIXED,
            wage_amount="700.00",
            work_type=JobPost.WorkType.ONE_TIME,
        )

        self.job_plumbing, plumbing_created = self._job(
            title="Water Tank Installation & Pipe Fitting",
            category_name=construction,
            subcategory_name="Plumbing",
            required=["Pipe Fitting", "Water Tank Installation"],
            preferred=["Leak Repair"],
            description="Install a new rooftop water tank and fit supply piping.",
            address="Jawalakhel, Lalitpur",
            latitude="27.670000",
            longitude="85.313000",
            required_experience_years=1,
            wage_type=JobPost.WageType.DAILY,
            wage_amount="950.00",
            work_type=JobPost.WorkType.ONE_TIME,
        )

        hospitality = "Hospitality & Food Services"
        driving = "Driving & Delivery"
        caregiving = "Caregiving & Personal Support"

        # A second electrical job Ramesh fully matches on skills but only
        # partially on experience (required_experience_years exceeds his
        # 6 years) and is slightly further away than the wiring job -
        # gives the worker-to-job demo a second, meaningfully-different
        # result and demonstrates experience/distance affecting score.
        self.job_wiring2, wiring2_created = self._job(
            title="Electrical Rewiring for Old Bungalow",
            category_name=construction,
            subcategory_name="Electrical",
            required=["House Wiring", "Electrical Repair"],
            preferred=["Circuit Breaker Installation"],
            description="Full rewiring of an older two-storey bungalow ahead of resale.",
            address="Kirtipur, Kathmandu",
            latitude="27.677400",
            longitude="85.282000",
            required_experience_years=8,
            wage_type=JobPost.WageType.DAILY,
            wage_amount="1250.00",
            work_type=JobPost.WorkType.CONTRACT,
        )

        # A third electrical job Ramesh only partially matches - he has
        # one of the two required skills (House Wiring) but not the other
        # (Switchboard Installation), and the required experience exceeds
        # his 6 years - two real, explainable reasons this is a weaker,
        # but still genuinely suitable, third recommendation.
        self.job_switchboard, switchboard_created = self._job(
            title="Switchboard and Panel Upgrade for Retail Outlet",
            category_name=construction,
            subcategory_name="Electrical",
            required=["House Wiring", "Switchboard Installation"],
            preferred=["Electrical Panel Wiring"],
            description="Upgrade the switchboard and rewire several branch circuits for a retail shop unit.",
            address="Koteshwor, Kathmandu",
            latitude="27.680000",
            longitude="85.350000",
            required_experience_years=8,
            wage_type=JobPost.WageType.DAILY,
            wage_amount="1100.00",
            work_type=JobPost.WorkType.CONTRACT,
            employer=self.employer_retail,
        )

        # A second masonry job requiring "Tile Installation" alongside
        # the original one, near Hari, so the missing-skill advisory
        # surfaces it as recurring across several near-miss jobs.
        self.job_masonry2, masonry2_created = self._job(
            title="Floor Tiling and Masonry Repair for Guest House",
            category_name=construction,
            subcategory_name="Masonry",
            required=["Brick Laying", "Tile Installation"],
            preferred=["Plastering"],
            description="Repair brickwork and lay new floor tiles for a small guest house.",
            address="Suryabinayak, Bhaktapur",
            latitude="27.665000",
            longitude="85.430000",
            required_experience_years=2,
            wage_type=JobPost.WageType.DAILY,
            wage_amount="1050.00",
            work_type=JobPost.WorkType.CONTRACT,
        )

        self.job_painting, painting_created = self._job(
            title="Exterior Wall Painting for Apartment Complex",
            category_name=construction,
            subcategory_name="Painting",
            required=["Wall Painting", "Surface Primer Application"],
            preferred=["Ceiling Painting"],
            description="Prime and paint the exterior walls of a four-storey apartment complex.",
            address="Baneshwor, Kathmandu",
            latitude="27.695000",
            longitude="85.337000",
            required_experience_years=1,
            wage_type=JobPost.WageType.DAILY,
            wage_amount="900.00",
            work_type=JobPost.WorkType.CONTRACT,
        )

        self.job_waitstaff, waitstaff_created = self._job(
            title="Waitstaff for Wedding Reception",
            category_name=hospitality,
            subcategory_name="Waitstaff & Table Service",
            required=["Table Service", "Order Taking"],
            preferred=["Guest Seating Assistance"],
            description="Serve guests at a one-evening wedding reception for around 200 people.",
            address="Lazimpat, Kathmandu",
            latitude="27.717000",
            longitude="85.317000",
            required_experience_years=1,
            wage_type=JobPost.WageType.DAILY,
            wage_amount="850.00",
            work_type=JobPost.WorkType.ONE_TIME,
            number_of_workers_required=4,
            employer=self.employer_hospitality,
        )

        self.job_delivery, delivery_created = self._job(
            title="Motorbike Delivery Rider for Grocery App",
            category_name=driving,
            subcategory_name="Two-Wheeler Delivery",
            required=["Motorbike Food Delivery", "Parcel Delivery"],
            preferred=["Route Navigation"],
            description="Same-day grocery delivery rider for a local delivery app.",
            address="Old Baneshwor, Kathmandu",
            latitude="27.689000",
            longitude="85.336000",
            required_experience_years=1,
            wage_type=JobPost.WageType.DAILY,
            wage_amount="800.00",
            work_type=JobPost.WorkType.PART_TIME,
            employer=self.employer_retail,
        )

        self.job_caregiving, caregiving_created = self._job(
            title="Elderly Care Companion - Daytime Shift",
            category_name=caregiving,
            subcategory_name="Elderly Care",
            required=["Elderly Personal Care", "Companionship Care"],
            preferred=["Mobility Assistance"],
            description="Daytime companionship and personal care for an elderly family member.",
            address="Battisputali, Kathmandu",
            latitude="27.701000",
            longitude="85.339000",
            required_experience_years=2,
            wage_type=JobPost.WageType.MONTHLY,
            wage_amount="22000.00",
            work_type=JobPost.WorkType.PART_TIME,
            employer=self.employer_retail,
        )

        self.summary["jobs"] = [
            (self.job_wiring.title, wiring_created),
            (self.job_cleaning.title, cleaning_created),
            (self.job_masonry.title, masonry_created),
            (self.job_cooking.title, cooking_created),
            (self.job_plumbing.title, plumbing_created),
            (self.job_wiring2.title, wiring2_created),
            (self.job_switchboard.title, switchboard_created),
            (self.job_masonry2.title, masonry2_created),
            (self.job_painting.title, painting_created),
            (self.job_waitstaff.title, waitstaff_created),
            (self.job_delivery.title, delivery_created),
            (self.job_caregiving.title, caregiving_created),
        ]

    # ------------------------------------------------------------------
    # Applications and ratings
    # ------------------------------------------------------------------

    # Forward progress order for the main application path. Used only to
    # decide whether a demo application has already passed a given step -
    # never to force a transition backward. SHORTLISTED and CONTACTED sit
    # at the same stage (either is a legal predecessor of HIRED).
    _STATUS_ORDER = {
        Application.Status.APPLIED: 0,
        Application.Status.SHORTLISTED: 1,
        Application.Status.CONTACTED: 1,
        Application.Status.HIRED: 2,
        Application.Status.COMPLETED: 3,
    }

    # Statuses a demo presenter could reach by hand while walking through
    # DEMO_SCRIPT.md (e.g. rejecting or withdrawing a demo application
    # live). None of these are ever a legal transition source again, so a
    # rerun must not try to route back through the main path.
    _TERMINAL_SIDE_STATUSES = {
        Application.Status.REJECTED,
        Application.Status.WITHDRAWN,
        Application.Status.CANCELLED,
    }

    def _advance_application(self, worker_profile, job, steps):
        """`steps`: ordered list of (target_status, actor_user) to reach
        past the default APPLIED starting state.

        Idempotent even if a demo presenter has manually moved the
        application further (or sideways, e.g. REJECTED) since the last
        run: each step is skipped, rather than attempted, once the
        application has already reached or passed it, so a rerun never
        calls `transition_application_status` with a target that is no
        longer a legal transition from the application's current status.
        """

        application, created = Application.objects.get_or_create(worker=worker_profile, job=job)

        for target_status, actor in steps:
            if application.status == target_status:
                continue

            if application.status in self._TERMINAL_SIDE_STATUSES:
                break

            # Terminal side-statuses (REJECTED/WITHDRAWN/CANCELLED) have no
            # rank in _STATUS_ORDER - they are a legal transition away from
            # any non-terminal status on the main path, not a point along
            # it, so the rank check only applies to main-path targets.
            if target_status in self._STATUS_ORDER:
                current_rank = self._STATUS_ORDER.get(application.status, -1)
                target_rank = self._STATUS_ORDER[target_status]

                if current_rank >= target_rank:
                    continue

            transition_application_status(application, target_status, actor=actor)

        return application, created

    def _ensure_rating(self, application, *, reviewer, score, review_text):
        if application.status != Application.Status.COMPLETED:
            return False

        if reviewer.id == application.worker.user_id:
            direction = Rating.Direction.WORKER_TO_EMPLOYER
        else:
            direction = Rating.Direction.EMPLOYER_TO_WORKER

        if Rating.objects.filter(application=application, direction=direction).exists():
            return False

        submit_rating(application, reviewer=reviewer, score=score, review_text=review_text)
        return True

    def _seed_applications_and_ratings(self):
        employer_user = self.verified_employer.user

        # Ramesh: full hire-through-completion, then rated in both
        # directions.
        completed_app, completed_created = self._advance_application(
            self.worker_ramesh,
            self.job_wiring,
            steps=[
                (Application.Status.SHORTLISTED, employer_user),
                (Application.Status.HIRED, employer_user),
                (Application.Status.COMPLETED, employer_user),
            ],
        )

        worker_rated = self._ensure_rating(
            completed_app,
            reviewer=self.worker_ramesh.user,
            score=5,
            review_text="Paid on time and the site was well organized.",
        )
        employer_rated = self._ensure_rating(
            completed_app,
            reviewer=employer_user,
            score=5,
            review_text="Excellent, tidy wiring work - would hire again.",
        )

        # Sita: shortlisted, still in progress.
        shortlisted_app, shortlisted_created = self._advance_application(
            self.worker_sita,
            self.job_cleaning,
            steps=[(Application.Status.SHORTLISTED, employer_user)],
        )

        # Hari: freshly applied, no employer action yet.
        applied_app, applied_created = self._advance_application(
            self.worker_hari,
            self.job_masonry,
            steps=[],
        )

        # Gita: applied, then withdrew.
        withdrawn_app, withdrawn_created = self._advance_application(
            self.worker_gita,
            self.job_cooking,
            steps=[(Application.Status.WITHDRAWN, self.worker_gita.user)],
        )

        # House Wiring for New Apartment Block gets two more applicants
        # besides Ramesh, so the job-to-worker demo job also demonstrates
        # "several applicants" in different states: Suresh is shortlisted
        # despite being far away, Kamal is rejected for lacking the second
        # required skill.
        suresh_shortlisted_app, suresh_shortlisted_created = self._advance_application(
            self.worker_suresh,
            self.job_wiring,
            steps=[(Application.Status.SHORTLISTED, employer_user)],
        )
        kamal_rejected_app, kamal_rejected_created = self._advance_application(
            self.worker_kamal,
            self.job_wiring,
            steps=[(Application.Status.REJECTED, employer_user)],
        )

        # Bimal: contacted for the plumbing job (demonstrates CONTACTED).
        bimal_contacted_app, bimal_contacted_created = self._advance_application(
            self.worker_bimal,
            self.job_plumbing,
            steps=[(Application.Status.CONTACTED, employer_user)],
        )

        # Maya: hired for the wedding waitstaff job, not yet completed
        # (demonstrates HIRED as a distinct in-progress state).
        maya_hired_app, maya_hired_created = self._advance_application(
            self.worker_maya,
            self.job_waitstaff,
            steps=[
                (Application.Status.SHORTLISTED, self.employer_hospitality.user),
                (Application.Status.HIRED, self.employer_hospitality.user),
            ],
        )

        # Sunita: shortlisted for the caregiving job.
        sunita_shortlisted_app, sunita_shortlisted_created = self._advance_application(
            self.worker_sunita,
            self.job_caregiving,
            steps=[(Application.Status.SHORTLISTED, self.employer_retail.user)],
        )

        # Deepak: freshly applied to the delivery job, no employer action
        # yet (a second plain-APPLIED example alongside Hari's).
        deepak_applied_app, deepak_applied_created = self._advance_application(
            self.worker_deepak,
            self.job_delivery,
            steps=[],
        )

        self.summary["applications"] = [
            (completed_app.id, completed_app.status, completed_created),
            (shortlisted_app.id, shortlisted_app.status, shortlisted_created),
            (applied_app.id, applied_app.status, applied_created),
            (withdrawn_app.id, withdrawn_app.status, withdrawn_created),
            (suresh_shortlisted_app.id, suresh_shortlisted_app.status, suresh_shortlisted_created),
            (kamal_rejected_app.id, kamal_rejected_app.status, kamal_rejected_created),
            (bimal_contacted_app.id, bimal_contacted_app.status, bimal_contacted_created),
            (maya_hired_app.id, maya_hired_app.status, maya_hired_created),
            (sunita_shortlisted_app.id, sunita_shortlisted_app.status, sunita_shortlisted_created),
            (deepak_applied_app.id, deepak_applied_app.status, deepak_applied_created),
        ]
        self.summary["ratings_created"] = worker_rated or employer_rated

    # ------------------------------------------------------------------
    # Unmatched skill term (admin-review demonstration)
    # ------------------------------------------------------------------

    def _seed_unmatched_skill_term(self):
        # Deliberately unrelated to any seeded skill or alias, so this
        # reliably lands below the fuzzy-match threshold and is recorded
        # in UnmatchedSkillTerm for admin review, demonstrating that
        # Week 2 workflow end to end.
        before = UnmatchedSkillTerm.objects.count()
        normalize_skill_phrase("CNC Machine Operation", user=self.verified_employer.user)
        after = UnmatchedSkillTerm.objects.count()
        self.summary["unmatched_skill_term_created"] = after > before

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def _print_summary(self):
        write = self.stdout.write
        style = self.style

        write(style.SUCCESS("\nDemo dataset ready."))

        write("\nDemo credentials (password for every account below is "
              f"'{DEMO_PASSWORD}'):")
        write(f"  Superuser (Django admin):  {self.summary['superuser'][0]}")
        for username, verification, _ in self.summary["employers"]:
            write(f"  Employer ({verification.lower()}): {username}")
        for username, _ in self.summary["workers"]:
            write(f"  Worker: {username}")

        def _line(label, created):
            return f"  - {label}: {'created' if created else 'already up to date'}"

        write("\nAccounts:")
        write(_line(f"superuser {self.summary['superuser'][0]}", self.summary["superuser"][1]))
        for username, verification, created in self.summary["employers"]:
            write(_line(f"employer {username} ({verification})", created))
        for username, created in self.summary["workers"]:
            write(_line(f"worker {username}", created))

        write("\nJobs:")
        for title, created in self.summary["jobs"]:
            write(_line(title, created))

        write("\nApplications (id, status):")
        for app_id, status_value, created in self.summary["applications"]:
            write(_line(f"application #{app_id} -> {status_value}", created))

        write(_line(
            "ratings for the completed House Wiring application",
            self.summary["ratings_created"],
        ))
        write(_line(
            "unmatched skill term 'CNC Machine Operation' (admin review demo)",
            self.summary["unmatched_skill_term_created"],
        ))

        write("\nDemo scenario pointers:")
        write("  - Worker-to-job recommendations: log in as demo_worker_ramesh and "
              "GET /api/recommendations/jobs/ - 'House Wiring for New Apartment Block' "
              "ranks first, with two more electrical jobs completing the top three.")
        write("  - Opportunity advisory (near-miss + missing skills): log in as "
              "demo_worker_hari and GET /api/recommendations/opportunities/ - "
              "'Tile Installation' is missing across two nearby masonry jobs.")
        write(f"  - Job-to-worker recommendations: log in as demo_employer_verified "
              f"and GET /api/recommendations/jobs/{self.job_wiring.id}/workers/ - job "
              f"#{self.job_wiring.id} ('{self.job_wiring.title}') has three candidates "
              f"(Ramesh, Suresh, Kamal) with a clear top pick.")
        write(f"  - Application-status walkthrough: job #{self.job_wiring.id} "
              f"('{self.job_wiring.title}') has three applicants in three different "
              f"states (COMPLETED, SHORTLISTED, REJECTED).")
        write(f"  - Completed-job ratings: application #{self.summary['applications'][0][0]} "
              "(demo_worker_ramesh on the House Wiring job) is COMPLETED and rated in "
              "both directions.")
        write("  - Restricted pending employer: log in as demo_employer_pending and "
              "POST /api/jobs/ - returns 403 Forbidden until an admin verifies it.")

        write(style.SUCCESS(
            "\nRun again any time - this command is idempotent and safe to rerun."
        ))
