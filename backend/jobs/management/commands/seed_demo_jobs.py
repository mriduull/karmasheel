"""Idempotent demo marketplace dataset: 24 fictional employers and 60
active job posts (exactly 5 per current top-level taxonomy category), so
Browse Jobs, recommendations, employer pages, filters, categories, and the
public landing page's "Recently posted" section look like a real, varied
Kathmandu Valley workforce marketplace.

Reuses `seed_taxonomy` (never modifies taxonomy data itself) and drives
every job through the same `JobPostSerializer` the real API uses, so
seeded jobs are guaranteed to satisfy exactly the same validation rules a
real employer's job post would - deadline-not-in-the-past, subcategory
belonging to the selected category, and every required/preferred skill
belonging to that subcategory. Nothing here relaxes or bypasses those
rules; `JobPostSerializer` needs no HTTP request context to run (its one
optional use of `request` is only to attribute an unmatched free-text
skill phrase to a user for admin review - irrelevant here since every
skill below is an exact existing SkillTag name, never a phrase needing
fuzzy matching).

Safe to run repeatedly. Every employer is looked up by a dedicated
username prefix (`demo_marketplace_employer_`) never used anywhere else
in this project, and every job by the natural key (employer, title) -
exactly the same pattern `accounts.management.commands.seed_demo` already
uses. Reruns update the same 24 employers and 60 jobs in place; nothing
outside that fixed set of usernames/titles is ever read, written, or
deleted, so real accounts, manually created jobs, and `seed_demo`'s own
separate demo data are structurally unreachable by this command.

Refuses to run against a non-DEBUG database unless `--force` is passed
(matching `seed_demo`'s existing safety convention) - this still creates
obviously-synthetic data, and `--force` exists only because the Render
demo deployment's database also needs seeding eventually.
"""

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from jobs.models import JobPost
from jobs.serializers import JobPostSerializer
from profiles.models import EmployerProfile
from taxonomy.models import Category, Subcategory

User = get_user_model()

DEMO_PASSWORD = "DemoMarket123!"

# Dedicated, unambiguous namespace for every record this command owns -
# distinct from seed_demo's own "demo_employer_*" usernames so the two
# commands' data can never collide or be mistaken for one another.
USERNAME_PREFIX = "demo_marketplace_employer_"
PHONE_NUMBER_START = 9822200001

# Deterministic Kathmandu Valley locality -> (latitude, longitude, city).
# Locality-level approximations (a neighbourhood centroid), never an exact
# residential address, and never 0,0 or another placeholder value. Fixed
# here rather than generated, so the same locality always resolves to the
# same coordinates on every run.
LOCATIONS = {
    # Kathmandu
    "Dhumbarahi": (Decimal("27.728600"), Decimal("85.333600"), "Kathmandu"),
    "Hadigaun": (Decimal("27.719500"), Decimal("85.334600"), "Kathmandu"),
    "Chabahil": (Decimal("27.718600"), Decimal("85.346700"), "Kathmandu"),
    "Maharajgunj": (Decimal("27.736100"), Decimal("85.332000"), "Kathmandu"),
    "Baluwatar": (Decimal("27.728000"), Decimal("85.328800"), "Kathmandu"),
    "Maitidevi": (Decimal("27.706200"), Decimal("85.333600"), "Kathmandu"),
    "Baneshwor": (Decimal("27.693900"), Decimal("85.335500"), "Kathmandu"),
    "New Baneshwor": (Decimal("27.689300"), Decimal("85.342100"), "Kathmandu"),
    "Sankhamul": (Decimal("27.690700"), Decimal("85.328000"), "Kathmandu"),
    "Thapathali": (Decimal("27.693900"), Decimal("85.317200"), "Kathmandu"),
    "Maitighar": (Decimal("27.694700"), Decimal("85.322600"), "Kathmandu"),
    "Durbarmarg": (Decimal("27.713400"), Decimal("85.317000"), "Kathmandu"),
    "Putalisadak": (Decimal("27.705700"), Decimal("85.322600"), "Kathmandu"),
    "Bagbazar": (Decimal("27.703800"), Decimal("85.315900"), "Kathmandu"),
    "Tripureshwor": (Decimal("27.693900"), Decimal("85.312200"), "Kathmandu"),
    "Kalanki": (Decimal("27.693900"), Decimal("85.280300"), "Kathmandu"),
    "Kuleshwor": (Decimal("27.689000"), Decimal("85.294000"), "Kathmandu"),
    "Koteshwor": (Decimal("27.677500"), Decimal("85.348800"), "Kathmandu"),
    "Sinamangal": (Decimal("27.701300"), Decimal("85.355600"), "Kathmandu"),
    "Boudha": (Decimal("27.721500"), Decimal("85.362000"), "Kathmandu"),
    "Gaushala": (Decimal("27.711800"), Decimal("85.345300"), "Kathmandu"),
    "Gongabu": (Decimal("27.735000"), Decimal("85.318100"), "Kathmandu"),
    # Lalitpur
    "Chyasal": (Decimal("27.674000"), Decimal("85.320000"), "Lalitpur"),
    "Kupandole": (Decimal("27.697000"), Decimal("85.314000"), "Lalitpur"),
    "Jawalakhel": (Decimal("27.676400"), Decimal("85.313000"), "Lalitpur"),
    "Pulchowk": (Decimal("27.679000"), Decimal("85.317000"), "Lalitpur"),
    "Patan Dhoka": (Decimal("27.676000"), Decimal("85.322000"), "Lalitpur"),
    "Lagankhel": (Decimal("27.668500"), Decimal("85.321000"), "Lalitpur"),
    "Satdobato": (Decimal("27.662400"), Decimal("85.324500"), "Lalitpur"),
    "Ekantakuna": (Decimal("27.669000"), Decimal("85.307000"), "Lalitpur"),
    "Sanepa": (Decimal("27.683000"), Decimal("85.307000"), "Lalitpur"),
    "Bhaisepati": (Decimal("27.657000"), Decimal("85.299000"), "Lalitpur"),
    "Imadol": (Decimal("27.672000"), Decimal("85.340000"), "Lalitpur"),
    "Gwarko": (Decimal("27.665000"), Decimal("85.335000"), "Lalitpur"),
    "Balkumari": (Decimal("27.668900"), Decimal("85.335000"), "Lalitpur"),
    # Bhaktapur
    "Suryabinayak": (Decimal("27.672000"), Decimal("85.433000"), "Bhaktapur"),
    "Sallaghari": (Decimal("27.681000"), Decimal("85.427000"), "Bhaktapur"),
    "Thimi": (Decimal("27.682000"), Decimal("85.396000"), "Bhaktapur"),
    "Lokanthali": (Decimal("27.687000"), Decimal("85.370000"), "Bhaktapur"),
}


def _skill_names(category_name, subcategory_name, required, preferred):
    return {
        "category": category_name,
        "subcategory": subcategory_name,
        "required": required,
        "preferred": preferred,
    }


# Every (category, employer, job) below was picked directly from the real
# seeded taxonomy (backend/taxonomy/data/taxonomy_v1.json) - subcategory and
# skill names here must match that file exactly, and the test suite asserts
# this rather than trusting it by inspection alone.
#
# `deadline_days`: application_deadline = now + this many days (7-21).
# `start_offset_days`: scheduled_datetime = deadline + this many days, or
# None for an ongoing role with no fixed start date.
DEMO_MARKETPLACE = [
    {
        "category": "Construction & Repair",
        "employers": [
            {
                "org": "Kathmandu Repair Works",
                "locality": "Baneshwor",
                "pan_vat": "910200301",
                "jobs": [
                    dict(
                        title="Residential Electrician",
                        subcategory="Electrical",
                        required=["House Wiring", "Circuit Breaker Installation"],
                        preferred=["Electrical Repair"],
                        description=(
                            "Wiring and breaker-panel work for residential apartments in the "
                            "Baneshwor area. Must know current safety codes and be comfortable "
                            "working in occupied homes. Tools provided; own basic hand tools a plus."
                        ),
                        locality="Dhumbarahi",
                        experience_years=3,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1400.00",
                        work_type=JobPost.WorkType.CONTRACT,
                        number_of_workers_required=2,
                        duration_days=20,
                        deadline_days=14,
                        start_offset_days=5,
                    ),
                    dict(
                        title="Plumber for Apartment Maintenance",
                        subcategory="Plumbing",
                        required=["Pipe Fitting", "Leak Repair"],
                        preferred=["Bathroom Fitting Installation"],
                        description=(
                            "Ongoing plumbing maintenance across a set of managed apartment "
                            "buildings. Includes leak repairs, fitting replacements, and routine "
                            "inspection visits. Nepali and basic Hindi communication preferred."
                        ),
                        locality="Chabahil",
                        experience_years=2,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1200.00",
                        work_type=JobPost.WorkType.CONTRACT,
                        number_of_workers_required=1,
                        duration_days=15,
                        deadline_days=10,
                        start_offset_days=4,
                    ),
                    dict(
                        title="Construction Mason",
                        subcategory="Masonry",
                        required=["Brick Laying", "Plastering"],
                        preferred=["Tile Installation"],
                        description=(
                            "Brick laying and plastering for a boundary wall and outbuilding "
                            "extension. Site is on a slope, so experience with foundation work "
                            "is helpful. Meals provided on working days."
                        ),
                        locality="Sallaghari",
                        experience_years=4,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1300.00",
                        work_type=JobPost.WorkType.CONTRACT,
                        number_of_workers_required=3,
                        duration_days=25,
                        deadline_days=18,
                        start_offset_days=7,
                    ),
                ],
            },
            {
                "org": "Valley Construction Crew",
                "locality": "Lokanthali",
                "pan_vat": "910200302",
                "jobs": [
                    dict(
                        title="Carpenter — Furniture & Fittings",
                        subcategory="Carpentry",
                        required=["Furniture Making", "Wood Cutting And Shaping"],
                        preferred=["Furniture Repair"],
                        description=(
                            "Built-in wardrobes and kitchen cabinetry for a small housing "
                            "project. Own basic tools required; power tools supplied on site. "
                            "Steady one-off project, not ongoing employment."
                        ),
                        locality="Lokanthali",
                        experience_years=3,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1250.00",
                        work_type=JobPost.WorkType.ONE_TIME,
                        number_of_workers_required=1,
                        duration_days=12,
                        deadline_days=12,
                        start_offset_days=6,
                    ),
                    dict(
                        title="House Painter",
                        subcategory="Painting",
                        required=["Wall Painting", "Surface Primer Application"],
                        preferred=["Ceiling Painting"],
                        description=(
                            "Interior and exterior repainting for a two-storey family home. "
                            "Includes surface prep and primer coats before final paint. "
                            "Ladder work required; own safety gear preferred."
                        ),
                        locality="Sanepa",
                        experience_years=2,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1000.00",
                        work_type=JobPost.WorkType.ONE_TIME,
                        number_of_workers_required=2,
                        duration_days=8,
                        deadline_days=9,
                        start_offset_days=3,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Domestic & Local Services",
        "employers": [
            {
                "org": "Sajilo Household Services",
                "locality": "Maitidevi",
                "pan_vat": "910200303",
                "jobs": [
                    dict(
                        title="House Cleaning Worker",
                        subcategory="Cleaning",
                        required=["House Cleaning", "Deep Cleaning"],
                        preferred=["Kitchen Cleaning"],
                        description=(
                            "Twice-weekly cleaning for a family home - living areas, kitchen, "
                            "and two bathrooms. Cleaning supplies provided. Reliable timing "
                            "matters more than speed."
                        ),
                        locality="Baluwatar",
                        experience_years=1,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="900.00",
                        work_type=JobPost.WorkType.PART_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=15,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Home Cook — Daily Meals",
                        subcategory="Cooking",
                        required=["Home Cooking", "Meal Preparation"],
                        preferred=["Nepali Cuisine Cooking"],
                        description=(
                            "Daily lunch and dinner preparation for a household of five. "
                            "Nepali home cooking style preferred; some flexibility for dietary "
                            "requests. Kitchen fully stocked, ingredients provided."
                        ),
                        locality="Maitidevi",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="18000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=14,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Laundry & Ironing Helper",
                        subcategory="Laundry & Ironing",
                        required=["Clothes Washing", "Ironing"],
                        preferred=["Laundry Folding And Sorting"],
                        description=(
                            "Laundry and ironing for a guesthouse's linens and staff uniforms. "
                            "Machine washing plus hand-ironing for shirts and bedsheets. "
                            "Six days a week, mornings only."
                        ),
                        locality="Gaushala",
                        experience_years=1,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="800.00",
                        work_type=JobPost.WorkType.PART_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=11,
                        start_offset_days=None,
                    ),
                ],
            },
            {
                "org": "Valley HomeCare Services",
                "locality": "Bhaisepati",
                "pan_vat": "910200304",
                "jobs": [
                    dict(
                        title="Gardener — Residential Property",
                        subcategory="Gardening & Outdoor Maintenance",
                        required=["Lawn Mowing", "Plant Care"],
                        preferred=["Hedge Trimming"],
                        description=(
                            "Weekly upkeep of a private garden - mowing, watering, and hedge "
                            "trimming. Basic gardening tools provided; experience with seasonal "
                            "planting is a plus."
                        ),
                        locality="Bhaisepati",
                        experience_years=2,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="950.00",
                        work_type=JobPost.WorkType.PART_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=16,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Pest Control Technician",
                        subcategory="Pest Control",
                        required=["General Pest Spraying", "Termite Treatment"],
                        preferred=["Rodent Control"],
                        description=(
                            "One-time termite and general pest treatment for a residential "
                            "compound. Must follow safe chemical-handling practices and brief "
                            "the household on post-treatment precautions."
                        ),
                        locality="Imadol",
                        experience_years=2,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1100.00",
                        work_type=JobPost.WorkType.ONE_TIME,
                        number_of_workers_required=1,
                        duration_days=2,
                        deadline_days=8,
                        start_offset_days=3,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Hospitality & Food Services",
        "employers": [
            {
                "org": "Lalitpur Hospitality House",
                "locality": "Jawalakhel",
                "pan_vat": "910200305",
                "jobs": [
                    dict(
                        title="Experienced Cook — Restaurant Kitchen",
                        subcategory="Restaurant Cooking",
                        required=["Restaurant Line Cooking", "Food Plating"],
                        preferred=["Grill Cooking"],
                        description=(
                            "Line cooking for a mid-sized restaurant kitchen serving lunch and "
                            "dinner service. Comfortable working under pressure during peak "
                            "hours. Staff meals included."
                        ),
                        locality="Jawalakhel",
                        experience_years=3,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="22000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=17,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Waiter / Table Service Staff",
                        subcategory="Waitstaff & Table Service",
                        required=["Table Service", "Order Taking"],
                        preferred=["Table Setting"],
                        description=(
                            "Front-of-house table service for a busy dinner restaurant. "
                            "Friendly with guests, comfortable carrying full trays, and able "
                            "to work weekend evenings."
                        ),
                        locality="Pulchowk",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="16000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=2,
                        duration_days=None,
                        deadline_days=12,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Hotel Housekeeping Staff",
                        subcategory="Hotel Housekeeping",
                        required=["Guest Room Cleaning", "Bed Making"],
                        preferred=["Linen Change"],
                        description=(
                            "Daily guest-room turnover for a boutique hotel - cleaning, bed "
                            "making, and linen changes to hotel standard. Rotating shift "
                            "schedule, six days a week."
                        ),
                        locality="Lagankhel",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="15000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=2,
                        duration_days=None,
                        deadline_days=13,
                        start_offset_days=None,
                    ),
                ],
            },
            {
                "org": "Boudha Cafe & Catering Services",
                "locality": "Boudha",
                "pan_vat": "910200306",
                "jobs": [
                    dict(
                        title="Barista — Cafe Beverage Counter",
                        subcategory="Barista & Beverage Service",
                        required=["Coffee Brewing", "Tea Preparation"],
                        preferred=["Cash Handling At Counter"],
                        description=(
                            "Coffee and tea counter service for a busy neighbourhood cafe. "
                            "Training given on the espresso machine; prior counter experience "
                            "still preferred. Morning shift."
                        ),
                        locality="Boudha",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="17000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=10,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Catering Helper — Event Food Service",
                        subcategory="Catering & Event Food",
                        required=["Bulk Food Preparation", "Buffet Setup"],
                        preferred=["Event Catering Service"],
                        description=(
                            "Food prep and buffet setup support for weekend catering bookings. "
                            "Physically active work; must be comfortable with early-morning "
                            "prep and late-evening pack-down."
                        ),
                        locality="Chabahil",
                        experience_years=1,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1000.00",
                        work_type=JobPost.WorkType.ONE_TIME,
                        number_of_workers_required=3,
                        duration_days=1,
                        deadline_days=9,
                        start_offset_days=2,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Driving & Delivery",
        "employers": [
            {
                "org": "Metro Delivery Services",
                "locality": "New Baneshwor",
                "pan_vat": "910200307",
                "jobs": [
                    dict(
                        title="Delivery Rider — Own Motorcycle Preferred",
                        subcategory="Two-Wheeler Delivery",
                        required=["Motorbike Food Delivery", "Route Navigation"],
                        preferred=["Delivery App Navigation"],
                        description=(
                            "Food delivery rider covering the New Baneshwor and Koteshwor "
                            "area. Own motorcycle preferred (fuel allowance provided); valid "
                            "licence required. Flexible shift hours."
                        ),
                        locality="New Baneshwor",
                        experience_years=1,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1000.00",
                        work_type=JobPost.WorkType.PART_TIME,
                        number_of_workers_required=3,
                        duration_days=None,
                        deadline_days=7,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Parcel Delivery Rider",
                        subcategory="Two-Wheeler Delivery",
                        required=["Parcel Delivery", "Cash-On-Delivery Handling"],
                        preferred=["Two-Wheeler Maintenance Basics"],
                        description=(
                            "Parcel delivery rider handling cash-on-delivery orders across "
                            "Koteshwor and Sinamangal. Must keep accurate delivery and "
                            "collection records each shift."
                        ),
                        locality="Koteshwor",
                        experience_years=1,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="950.00",
                        work_type=JobPost.WorkType.PART_TIME,
                        number_of_workers_required=2,
                        duration_days=None,
                        deadline_days=8,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Warehouse & Courier Logistics Helper",
                        subcategory="Courier & Logistics",
                        required=["Parcel Sorting", "Warehouse Loading"],
                        preferred=["Package Tracking"],
                        description=(
                            "Sorting and loading parcels at a local courier hub ahead of daily "
                            "delivery routes. Early-morning shift; physically active warehouse "
                            "work."
                        ),
                        locality="Sinamangal",
                        experience_years=1,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="900.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=2,
                        duration_days=None,
                        deadline_days=11,
                        start_offset_days=None,
                    ),
                ],
            },
            {
                "org": "Valley Cargo & Transport",
                "locality": "Balkumari",
                "pan_vat": "910200308",
                "jobs": [
                    dict(
                        title="Car & Taxi Driver",
                        subcategory="Car & Taxi Driving",
                        required=["Car Driving", "Taxi Driving"],
                        preferred=["Airport Pickup And Drop"],
                        description=(
                            "Company car driver covering airport transfers and city trips. "
                            "Clean driving record required; familiarity with Kathmandu Valley "
                            "routes expected."
                        ),
                        locality="Gongabu",
                        experience_years=3,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="25000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=15,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Truck Driver — Goods Transport",
                        subcategory="Heavy Vehicle & Truck Driving",
                        required=["Truck Driving", "Vehicle Safety Check"],
                        preferred=["Long Route Driving"],
                        description=(
                            "Goods transport driver for inter-city delivery routes. Heavy "
                            "vehicle licence required; responsible for pre-trip safety checks "
                            "and basic fuel logging."
                        ),
                        locality="Balkumari",
                        experience_years=4,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="30000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=19,
                        start_offset_days=None,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Security Services",
        "employers": [
            {
                "org": "Valley Protection Services",
                "locality": "Maharajgunj",
                "pan_vat": "910200309",
                "jobs": [
                    dict(
                        title="Security Guard — Residential Complex",
                        subcategory="Security Guarding",
                        required=["Premises Patrolling", "Gate Duty"],
                        preferred=["Visitor Log Management"],
                        description=(
                            "Day-shift security for a gated residential complex - gate duty, "
                            "visitor logging, and periodic patrols. Uniform provided; prior "
                            "guarding experience preferred."
                        ),
                        locality="Maharajgunj",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="16000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=2,
                        duration_days=None,
                        deadline_days=12,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Night Watchman — Commercial Building",
                        subcategory="Security Guarding",
                        required=["Night Watch Duty", "Incident Reporting"],
                        preferred=["Frisking And Bag Checking"],
                        description=(
                            "Overnight security for a commercial office building. Responsible "
                            "for rounds, incident logging, and coordinating with the day-shift "
                            "handover."
                        ),
                        locality="Tripureshwor",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="17000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=14,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Security Guard — Office Premises",
                        subcategory="Security Guarding",
                        required=["Gate Duty", "Visitor Identity Verification"],
                        preferred=["Premises Patrolling"],
                        description=(
                            "Reception-area and gate security for a small office park. Day "
                            "shift, six days a week. Basic spoken English useful for visitor "
                            "handling."
                        ),
                        locality="Kalanki",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="16000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=10,
                        start_offset_days=None,
                    ),
                ],
            },
            {
                "org": "Kathmandu Safety Solutions",
                "locality": "Putalisadak",
                "pan_vat": "910200310",
                "jobs": [
                    dict(
                        title="Fire Safety Assistant",
                        subcategory="Fire Safety & Emergency Response",
                        required=["Fire Extinguisher Handling", "Fire Alarm Monitoring"],
                        preferred=["First Aid Response"],
                        description=(
                            "Fire-safety monitoring for a mixed-use commercial building - "
                            "extinguisher checks, alarm monitoring, and basic first-response "
                            "duties. Certification training provided."
                        ),
                        locality="Putalisadak",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="18000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=16,
                        start_offset_days=None,
                    ),
                    dict(
                        title="CCTV & Access Control Operator",
                        subcategory="Access Control & Surveillance",
                        required=["CCTV Monitoring", "Entry Gate Control"],
                        preferred=["Access Card Management"],
                        description=(
                            "Control-room operator monitoring CCTV feeds and managing entry "
                            "gate access for a corporate building. Attention to detail and "
                            "basic computer literacy required."
                        ),
                        locality="Durbarmarg",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="19000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=13,
                        start_offset_days=None,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Facility & Property Maintenance",
        "employers": [
            {
                "org": "Valley Maintenance Group",
                "locality": "Kuleshwor",
                "pan_vat": "910200311",
                "jobs": [
                    dict(
                        title="Facility Maintenance Technician",
                        subcategory="General Facility Maintenance",
                        required=["Building Maintenance", "Minor Repair Work"],
                        preferred=["Furniture Assembly"],
                        description=(
                            "General maintenance technician for a residential building - minor "
                            "repairs, fixture upkeep, and monthly inspection rounds. Own basic "
                            "tools required."
                        ),
                        locality="Kuleshwor",
                        experience_years=3,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="20000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=15,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Building Maintenance Helper",
                        subcategory="General Facility Maintenance",
                        required=["Facility Inspection Rounds", "Preventive Maintenance Checks"],
                        preferred=["Light Fixture Replacement"],
                        description=(
                            "Assists the senior technician with routine inspection rounds and "
                            "preventive maintenance checks across a small apartment complex. "
                            "Entry-level role, training provided."
                        ),
                        locality="Sankhamul",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="15000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=11,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Parking Attendant",
                        subcategory="Parking & Building Support",
                        required=["Parking Attendant Duty", "Vehicle Parking Management"],
                        preferred=["Common Area Upkeep"],
                        description=(
                            "Manages vehicle parking and common-area upkeep for an office "
                            "building's basement parking. Day shift, courteous manner with "
                            "visitors expected."
                        ),
                        locality="Thapathali",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="14000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=2,
                        duration_days=None,
                        deadline_days=9,
                        start_offset_days=None,
                    ),
                ],
            },
            {
                "org": "Kathmandu Cooling Services",
                "locality": "Baneshwor",
                "pan_vat": "910200312",
                "jobs": [
                    dict(
                        title="AC & Refrigeration Technician",
                        subcategory="HVAC & Refrigeration Support",
                        required=["AC Servicing", "Refrigerator Repair Assistance"],
                        preferred=["Gas Refilling Assistance"],
                        description=(
                            "Servicing and repair calls for residential and small-office AC "
                            "and refrigeration units. Own basic tools required; company "
                            "provides refrigerant and parts."
                        ),
                        locality="Baneshwor",
                        experience_years=3,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1500.00",
                        work_type=JobPost.WorkType.CONTRACT,
                        number_of_workers_required=1,
                        duration_days=20,
                        deadline_days=17,
                        start_offset_days=5,
                    ),
                    dict(
                        title="Cooling System Maintenance Helper",
                        subcategory="HVAC & Refrigeration Support",
                        required=["Cooling System Cleaning", "Ventilation System Maintenance"],
                        preferred=["Water Cooler Maintenance"],
                        description=(
                            "Assists with routine cleaning and maintenance of cooling and "
                            "ventilation systems across several office tenants. Entry-level, "
                            "on-the-job training given."
                        ),
                        locality="Maitighar",
                        experience_years=2,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1200.00",
                        work_type=JobPost.WorkType.CONTRACT,
                        number_of_workers_required=1,
                        duration_days=14,
                        start_offset_days=4,
                        deadline_days=10,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Caregiving & Personal Support",
        "employers": [
            {
                "org": "Himal Home Care & Caregiving",
                "locality": "Hadigaun",
                "pan_vat": "910200313",
                "jobs": [
                    dict(
                        title="Elderly Care Assistant",
                        subcategory="Elderly Care",
                        required=["Elderly Personal Care", "Companionship Care"],
                        preferred=["Mobility Assistance"],
                        description=(
                            "Daytime companion and personal-care support for an elderly "
                            "resident. Patient, caring manner required; light housekeeping "
                            "also expected."
                        ),
                        locality="Hadigaun",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="19000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=13,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Home Care Assistant — Elderly Support",
                        subcategory="Elderly Care",
                        required=["Elderly Meal Assistance", "Vital Signs Monitoring"],
                        preferred=["Medication Reminder Support"],
                        description=(
                            "Meal assistance and basic vitals monitoring for an elderly client "
                            "with mobility limitations. Prior caregiving experience strongly "
                            "preferred."
                        ),
                        locality="Dhumbarahi",
                        experience_years=3,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="21000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=16,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Home Health Aide — Patient Support",
                        subcategory="Home Health Aide",
                        required=["Bedridden Patient Care", "Basic Nursing Support"],
                        preferred=["Wheelchair Assistance"],
                        description=(
                            "In-home support for a bedridden patient recovering from surgery - "
                            "hygiene assistance, basic nursing support, and mobility help. "
                            "Some nursing background preferred."
                        ),
                        locality="Chabahil",
                        experience_years=3,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="23000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=18,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Special Needs Support Worker",
                        subcategory="Special Needs Support",
                        required=["Disability Support Assistance", "Physical Therapy Assistance"],
                        preferred=["Mobility Equipment Handling"],
                        description=(
                            "Daily support for a young adult with mobility needs - assisted "
                            "exercises, equipment handling, and general companionship. Patience "
                            "and reliability essential."
                        ),
                        locality="Maharajgunj",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="20000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=15,
                        start_offset_days=None,
                    ),
                ],
            },
            {
                "org": "Little Steps Childcare Services",
                "locality": "Sanepa",
                "pan_vat": "910200314",
                "jobs": [
                    dict(
                        title="Babysitter / Child Care Helper",
                        subcategory="Child Care & Babysitting",
                        required=["Babysitting", "Child Supervision"],
                        preferred=["Homework Assistance"],
                        description=(
                            "After-school childcare for two primary-school-age children - "
                            "supervision, snacks, and light homework help until parents return "
                            "in the evening."
                        ),
                        locality="Sanepa",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="17000.00",
                        work_type=JobPost.WorkType.PART_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=12,
                        start_offset_days=None,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Retail & Customer Service",
        "employers": [
            {
                "org": "Sajilo Retail Mart",
                "locality": "Putalisadak",
                "pan_vat": "910200315",
                "jobs": [
                    dict(
                        title="Shop Sales Assistant",
                        subcategory="Shop Sales Assistant",
                        required=["Customer Greeting And Assistance", "Sales Counter Assistance"],
                        preferred=["Product Display Arrangement"],
                        description=(
                            "Sales floor assistant for a neighbourhood general store - greeting "
                            "customers, restocking displays, and handling the sales counter "
                            "during busy hours."
                        ),
                        locality="Putalisadak",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="16000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=11,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Retail Floor Assistant",
                        subcategory="Shop Sales Assistant",
                        required=["Product Demonstration", "Customer Greeting And Assistance"],
                        preferred=["Upselling Assistance"],
                        description=(
                            "Floor assistant for a household-goods shop, helping customers find "
                            "products and demonstrating how items work. Friendly, outgoing "
                            "manner preferred."
                        ),
                        locality="Bagbazar",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="15000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=9,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Cashier — Retail Billing Counter",
                        subcategory="Cashier & Billing",
                        required=["Cash Billing", "Point Of Sale Terminal Handling"],
                        preferred=["Receipt Management"],
                        description=(
                            "Billing counter cashier for a retail shop - handling cash and "
                            "card payments, issuing receipts, and keeping the till balanced "
                            "each shift."
                        ),
                        locality="Kalanki",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="16000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=13,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Inventory & Stock Assistant",
                        subcategory="Inventory & Stock Management",
                        required=["Stock Counting", "Shelf Restocking"],
                        preferred=["Barcode Scanning"],
                        description=(
                            "Back-of-store stock assistant - receiving deliveries, counting "
                            "inventory, and keeping shelves restocked. Early-morning shift "
                            "before the shop opens."
                        ),
                        locality="Koteshwor",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="15500.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=10,
                        start_offset_days=None,
                    ),
                ],
            },
            {
                "org": "Valley Customer Care Solutions",
                "locality": "Sinamangal",
                "pan_vat": "910200316",
                "jobs": [
                    dict(
                        title="Customer Support Representative",
                        subcategory="Customer Support",
                        required=["Customer Query Handling", "Phone Customer Support"],
                        preferred=["Complaint Handling"],
                        description=(
                            "Phone-based customer support for a small retail chain, handling "
                            "order queries and complaints. Clear spoken Nepali and English "
                            "required; training provided."
                        ),
                        locality="Sinamangal",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="19000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=14,
                        start_offset_days=None,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Office & Administrative Support",
        "employers": [
            {
                "org": "Himalayan Trade Solutions",
                "locality": "Durbarmarg",
                "pan_vat": "910200317",
                "jobs": [
                    dict(
                        title="Office Assistant — General Support",
                        subcategory="General Office Assistant",
                        required=["Office Filing", "Photocopying And Scanning"],
                        preferred=["Office Supply Management"],
                        description=(
                            "General office support for a small trading company - filing, "
                            "photocopying, and keeping supplies stocked. Tidy, organized "
                            "working style expected."
                        ),
                        locality="Durbarmarg",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="16000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=12,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Admin Support Helper",
                        subcategory="General Office Assistant",
                        required=["Meeting Room Setup", "Document Binding And Printing"],
                        preferred=["Courier Handling"],
                        description=(
                            "Administrative helper covering meeting-room setup, document "
                            "printing/binding, and courier handling for a small office. Entry "
                            "level, on-the-job training given."
                        ),
                        locality="Maitighar",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="15000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=8,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Data Entry Operator",
                        subcategory="Data Entry",
                        required=["Data Entry", "Spreadsheet Data Handling"],
                        preferred=["Typing And Transcription"],
                        description=(
                            "Data entry for inventory and sales records into a shared "
                            "spreadsheet system. Accurate typing and attention to detail "
                            "required; basic Excel skills expected."
                        ),
                        locality="Putalisadak",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="17000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=11,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Bookkeeping Assistant",
                        subcategory="Basic Bookkeeping Support",
                        required=["Basic Bookkeeping", "Invoice Preparation"],
                        preferred=["Expense Recording"],
                        description=(
                            "Bookkeeping support for a small trading business - invoice "
                            "preparation, expense recording, and basic ledger upkeep. Some "
                            "prior bookkeeping experience required."
                        ),
                        locality="Baneshwor",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="20000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=17,
                        start_offset_days=None,
                    ),
                ],
            },
            {
                "org": "Valley Front Desk Services",
                "locality": "Dhumbarahi",
                "pan_vat": "910200318",
                "jobs": [
                    dict(
                        title="Receptionist — Front Office",
                        subcategory="Reception & Front Office",
                        required=["Visitor Reception", "Telephone Call Handling"],
                        preferred=["Appointment Scheduling"],
                        description=(
                            "Front-desk receptionist for a small clinic - greeting visitors, "
                            "answering calls, and scheduling appointments. Pleasant phone "
                            "manner and basic computer skills required."
                        ),
                        locality="Dhumbarahi",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="17000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=10,
                        start_offset_days=None,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Event & Temporary Work",
        "employers": [
            {
                "org": "Patan Event Support",
                "locality": "Ekantakuna",
                "pan_vat": "910200319",
                "jobs": [
                    dict(
                        title="Event Setup Helper",
                        subcategory="Event Setup & Logistics",
                        required=["Stage Setup", "Chair And Table Arrangement"],
                        preferred=["Tent And Pandal Setup"],
                        description=(
                            "Setup crew for a weekend wedding function - stage assembly, "
                            "seating arrangement, and tent setup ahead of the event. Physically "
                            "active, one-day booking."
                        ),
                        locality="Ekantakuna",
                        experience_years=1,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1000.00",
                        work_type=JobPost.WorkType.ONE_TIME,
                        number_of_workers_required=4,
                        duration_days=1,
                        deadline_days=7,
                        start_offset_days=2,
                    ),
                    dict(
                        title="Decoration & Setup Crew Member",
                        subcategory="Event Setup & Logistics",
                        required=["Decoration Setup", "Backdrop And Banner Setup"],
                        preferred=["Event Equipment Transport"],
                        description=(
                            "Decoration crew for a corporate event - backdrop assembly, banner "
                            "hanging, and general decor setup the day before the function."
                        ),
                        locality="Gwarko",
                        experience_years=1,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="950.00",
                        work_type=JobPost.WorkType.ONE_TIME,
                        number_of_workers_required=3,
                        duration_days=1,
                        deadline_days=8,
                        start_offset_days=1,
                    ),
                    dict(
                        title="Event Usher / Guest Coordinator",
                        subcategory="Event Staffing & Ushering",
                        required=["Guest Ushering", "Registration Desk Assistance"],
                        preferred=["Crowd Flow Management"],
                        description=(
                            "Guest coordination for a conference - registration desk support, "
                            "ushering attendees to sessions, and general crowd-flow "
                            "assistance. Presentable, well-spoken."
                        ),
                        locality="Satdobato",
                        experience_years=1,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="900.00",
                        work_type=JobPost.WorkType.ONE_TIME,
                        number_of_workers_required=3,
                        duration_days=1,
                        deadline_days=9,
                        start_offset_days=2,
                    ),
                    dict(
                        title="General Event Helper — Loading Crew",
                        subcategory="General Labor & Loading",
                        required=["Event Material Loading", "Manual Loading And Unloading"],
                        preferred=["Cleanup After Events"],
                        description=(
                            "Loading and unloading crew for event equipment transport, plus "
                            "post-event cleanup. Physically demanding, single-day booking."
                        ),
                        locality="Chyasal",
                        experience_years=1,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="850.00",
                        work_type=JobPost.WorkType.ONE_TIME,
                        number_of_workers_required=4,
                        duration_days=1,
                        deadline_days=7,
                        start_offset_days=1,
                    ),
                ],
            },
            {
                "org": "Valley Sound & AV Services",
                "locality": "Kupandole",
                "pan_vat": "910200320",
                "jobs": [
                    dict(
                        title="Sound & AV Setup Technician",
                        subcategory="Sound & Basic AV Support",
                        required=["Sound System Setup", "Microphone Handling"],
                        preferred=["Basic Lighting Setup"],
                        description=(
                            "Sound and basic AV setup for a conference hall booking - speakers, "
                            "microphones, and simple stage lighting. Prior AV handling "
                            "experience required."
                        ),
                        locality="Kupandole",
                        experience_years=2,
                        wage_type=JobPost.WageType.DAILY,
                        wage_amount="1400.00",
                        work_type=JobPost.WorkType.ONE_TIME,
                        number_of_workers_required=2,
                        duration_days=1,
                        deadline_days=10,
                        start_offset_days=3,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Beauty & Personal Care Services",
        "employers": [
            {
                "org": "Lalitpur Style Studio",
                "locality": "Patan Dhoka",
                "pan_vat": "910200321",
                "jobs": [
                    dict(
                        title="Barber — Men's Hair & Grooming",
                        subcategory="Barbering",
                        required=["Haircutting", "Beard Trimming"],
                        preferred=["Hair Styling"],
                        description=(
                            "Barber for a neighbourhood men's salon - haircuts, beard "
                            "trimming, and basic styling. Steady walk-in clientele; six days "
                            "a week."
                        ),
                        locality="Patan Dhoka",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="18000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=12,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Hair Stylist Assistant",
                        subcategory="Barbering",
                        required=["Hair Styling", "Shaving Service"],
                        preferred=["Head Massage"],
                        description=(
                            "Assistant stylist supporting the senior barber - shaving service, "
                            "basic styling, and head massage add-ons. Good opportunity to build "
                            "salon experience."
                        ),
                        locality="Jawalakhel",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="15000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=9,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Beautician — Salon Services",
                        subcategory="Beautician Services",
                        required=["Facial Treatment", "Threading"],
                        preferred=["Waxing"],
                        description=(
                            "Beautician for a women's salon - facials, threading, and waxing "
                            "services. Certificate in beauty services preferred but not "
                            "required with enough experience."
                        ),
                        locality="Kupandole",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="19000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=14,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Bridal Makeup Assistant",
                        subcategory="Beautician Services",
                        required=["Basic Makeup Application", "Eyebrow Shaping"],
                        preferred=["Bridal Makeup"],
                        description=(
                            "Assists the senior bridal artist during wedding-season bookings - "
                            "everyday makeup application plus supporting on full bridal looks. "
                            "Weekend availability important."
                        ),
                        locality="Pulchowk",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="20000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=16,
                        start_offset_days=None,
                    ),
                ],
            },
            {
                "org": "Valley Spa & Wellness",
                "locality": "Sanepa",
                "pan_vat": "910200322",
                "jobs": [
                    dict(
                        title="Massage Therapist — Spa Services",
                        subcategory="Spa & Massage Therapy",
                        required=["Body Massage", "Foot Reflexology"],
                        preferred=["Spa Treatment Assistance"],
                        description=(
                            "Massage therapist for a wellness spa - full-body massage and foot "
                            "reflexology sessions. Certified training preferred; steady client "
                            "bookings."
                        ),
                        locality="Sanepa",
                        experience_years=3,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="24000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=18,
                        start_offset_days=None,
                    ),
                ],
            },
        ],
    },
    {
        "category": "Tailoring & Garment Work",
        "employers": [
            {
                "org": "Kathmandu Tailoring House",
                "locality": "Bagbazar",
                "pan_vat": "910200323",
                "jobs": [
                    dict(
                        title="Tailor — Garment Stitching",
                        subcategory="Tailoring & Stitching",
                        required=["Garment Stitching", "Pattern Cutting"],
                        preferred=["Hand Stitching"],
                        description=(
                            "General tailoring for everyday and formal wear - stitching from "
                            "customer measurements and pattern cutting. Own basic tools "
                            "preferred; sewing machines provided."
                        ),
                        locality="Bagbazar",
                        experience_years=3,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="19000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=13,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Tailor — Kurta & Suit Stitching",
                        subcategory="Tailoring & Stitching",
                        required=["Suit Stitching", "Kurta Stitching"],
                        preferred=["Machine Embroidery"],
                        description=(
                            "Specialist tailor for suits and kurtas ahead of the festival "
                            "season. Precision fitting work; experience with formal wear "
                            "required."
                        ),
                        locality="Maitidevi",
                        experience_years=3,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="20000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=15,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Alterations Specialist",
                        subcategory="Alterations & Repair",
                        required=["Clothing Alteration", "Hemming"],
                        preferred=["Zipper Repair"],
                        description=(
                            "Alterations counter for a busy tailoring shop - hemming, resizing, "
                            "and zipper repairs while customers wait. Quick, precise work "
                            "expected."
                        ),
                        locality="Gaushala",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="16000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=10,
                        start_offset_days=None,
                    ),
                ],
            },
            {
                "org": "Valley Garment Works",
                "locality": "Thimi",
                "pan_vat": "910200324",
                "jobs": [
                    dict(
                        title="Garment Cutting Operator",
                        subcategory="Garment Fabrication",
                        required=["Garment Cutting", "Fabric Measuring"],
                        preferred=["Sewing Machine Handling"],
                        description=(
                            "Cutting-floor operator for a small garment workshop - measuring "
                            "and cutting fabric to pattern ahead of bulk stitching. Steady, "
                            "accurate hand required."
                        ),
                        locality="Thimi",
                        experience_years=2,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="17000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=1,
                        duration_days=None,
                        deadline_days=12,
                        start_offset_days=None,
                    ),
                    dict(
                        title="Sewing Machine Operator — Bulk Production",
                        subcategory="Garment Fabrication",
                        required=["Sewing Machine Handling", "Bulk Garment Production"],
                        preferred=["Garment Finishing"],
                        description=(
                            "Machine operator for bulk garment production runs - sewing, "
                            "basic finishing, and quality checks before packing. Experience "
                            "with industrial machines preferred."
                        ),
                        locality="Suryabinayak",
                        experience_years=1,
                        wage_type=JobPost.WageType.MONTHLY,
                        wage_amount="15000.00",
                        work_type=JobPost.WorkType.FULL_TIME,
                        number_of_workers_required=2,
                        duration_days=None,
                        deadline_days=9,
                        start_offset_days=None,
                    ),
                ],
            },
        ],
    },
]


class Command(BaseCommand):
    help = (
        "Seed 24 fictional demo employers and 60 active demo job posts "
        "(5 per current top-level taxonomy category) for a realistic "
        "Kathmandu Valley marketplace demo. Safe to run repeatedly. "
        "Refuses to run when settings.DEBUG is False unless --force is "
        "passed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Allow the command to run even when settings.DEBUG is False.",
        )
        parser.add_argument(
            "--refresh-dates",
            action="store_true",
            help=(
                "Force every seeded job's application_deadline/scheduled_datetime "
                "to be recomputed from today, even if the existing stored deadline "
                "has not expired yet. Without this flag, a still-valid existing "
                "deadline is left untouched on rerun."
            ),
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "seed_demo_jobs creates obviously-synthetic demo marketplace data "
                "and refuses to run with DEBUG=False. Pass --force if you are "
                "certain this is the intended target database."
            )

        if not settings.DEBUG:
            self.stdout.write(
                self.style.WARNING(
                    "WARNING: Seeding demo marketplace data into a non-DEBUG database."
                )
            )

        self.refresh_dates = options["refresh_dates"]
        self.employers_created = 0
        self.employers_updated = 0
        self.employers_unchanged = 0
        self.jobs_created = 0
        self.jobs_updated = 0
        self.jobs_unchanged = 0
        self.category_counts = {}

        with transaction.atomic():
            self.stdout.write("Ensuring taxonomy is seeded...")
            call_command("seed_taxonomy")

            for category_block in DEMO_MARKETPLACE:
                category_name = category_block["category"]
                category = Category.objects.get(name=category_name)
                job_count_for_category = 0

                for employer_block in category_block["employers"]:
                    employer_profile = self._seed_employer(employer_block)

                    for job_spec in employer_block["jobs"]:
                        self._seed_job(
                            employer_profile,
                            category,
                            job_spec,
                        )
                        job_count_for_category += 1

                self.category_counts[category_name] = job_count_for_category

        self._print_summary()

    # ------------------------------------------------------------------
    # Employers
    # ------------------------------------------------------------------

    def _slugify(self, org_name):
        return "".join(
            char if char.isalnum() else "_"
            for char in org_name.lower()
        ).strip("_").replace("__", "_")

    def _seed_employer(self, employer_block):
        org_name = employer_block["org"]
        username = f"{USERNAME_PREFIX}{self._slugify(org_name)}"

        # Deterministic per-username phone number, offset from the fixed
        # starting block - stable across reruns since it only depends on
        # this fixed employer list's order, never on when the command runs.
        index = [
            block["org"] for category in DEMO_MARKETPLACE for block in category["employers"]
        ].index(org_name)
        phone_number = str(PHONE_NUMBER_START + index)

        user, user_created = User.objects.get_or_create(
            username=username,
            defaults={
                "phone_number": phone_number,
                "email": f"{username}@workforce-matching.local",
                "role": User.Role.EMPLOYER,
                "is_contact_verified": True,
            },
        )
        user.phone_number = phone_number
        user.email = f"{username}@workforce-matching.local"
        user.role = User.Role.EMPLOYER
        user.is_contact_verified = True
        user.set_password(DEMO_PASSWORD)
        user.save()

        latitude, longitude, city = LOCATIONS[employer_block["locality"]]
        address = f"{employer_block['locality']}, {city}"

        employer_profile, employer_created = EmployerProfile.objects.get_or_create(
            user=user,
            defaults={
                "organization_name": org_name,
                "address": address,
                "latitude": latitude,
                "longitude": longitude,
                "pan_vat_number": employer_block["pan_vat"],
                "verification_status": EmployerProfile.VerificationStatus.VERIFIED,
            },
        )

        changed = False
        for field, value in (
            ("organization_name", org_name),
            ("address", address),
            ("latitude", latitude),
            ("longitude", longitude),
            ("pan_vat_number", employer_block["pan_vat"]),
            ("verification_status", EmployerProfile.VerificationStatus.VERIFIED),
        ):
            if getattr(employer_profile, field) != value:
                setattr(employer_profile, field, value)
                changed = True

        if not employer_created and changed:
            employer_profile.full_clean()
            employer_profile.save()

        if employer_created or user_created:
            self.employers_created += 1
        elif changed:
            self.employers_updated += 1
        else:
            self.employers_unchanged += 1

        return employer_profile

    # ------------------------------------------------------------------
    # Jobs
    # ------------------------------------------------------------------

    def _resolve_dates(self, existing_job, deadline_days, start_offset_days):
        """Idempotent date handling (requirement 4, option A): a still-valid
        existing deadline is preserved on rerun rather than being bumped
        forward just because time has passed; an expired or missing
        deadline is refreshed. --refresh-dates forces a refresh regardless.
        """

        now = timezone.now()

        if existing_job is not None and not self.refresh_dates:
            current_deadline = existing_job.application_deadline
            if current_deadline is not None and current_deadline > now:
                return current_deadline, existing_job.scheduled_datetime

        deadline = now + timedelta(days=deadline_days)
        scheduled = (
            deadline + timedelta(days=start_offset_days)
            if start_offset_days is not None
            else None
        )
        return deadline, scheduled

    def _seed_job(self, employer_profile, category, job_spec):
        subcategory = Subcategory.objects.get(
            category=category, name=job_spec["subcategory"]
        )

        existing_job = JobPost.objects.filter(
            employer=employer_profile, title=job_spec["title"]
        ).first()

        deadline, scheduled = self._resolve_dates(
            existing_job, job_spec["deadline_days"], job_spec["start_offset_days"]
        )

        latitude, longitude, city = LOCATIONS[job_spec["locality"]]
        address = f"{job_spec['locality']}, {city}"

        payload = {
            "title": job_spec["title"],
            "category": category.id,
            "subcategory": subcategory.id,
            "description": job_spec["description"],
            "address": address,
            "latitude": str(latitude),
            "longitude": str(longitude),
            "required_experience_years": job_spec["experience_years"],
            "wage_type": job_spec["wage_type"],
            "wage_amount": job_spec["wage_amount"],
            "work_type": job_spec["work_type"],
            "number_of_workers_required": job_spec["number_of_workers_required"],
            "application_deadline": deadline.isoformat(),
            "required_skills_input": job_spec["required"],
            "preferred_skills_input": job_spec["preferred"],
        }

        if job_spec["duration_days"] is not None:
            payload["duration_days"] = job_spec["duration_days"]
        if scheduled is not None:
            payload["scheduled_datetime"] = scheduled.isoformat()

        # Every job is driven through the real JobPostSerializer - the exact
        # validation a live employer's job post goes through (deadline not
        # in the past, subcategory belongs to category, every skill belongs
        # to that subcategory). No HTTP request context is required: the
        # serializer's only optional use of `request` is to attribute an
        # unmatched free-text skill phrase for admin review, and every
        # skill name here is an exact existing SkillTag name.
        serializer = JobPostSerializer(instance=existing_job, data=payload)
        serializer.is_valid(raise_exception=True)

        if existing_job is None:
            serializer.save(employer=employer_profile)
            self.jobs_created += 1
        else:
            before = {
                field: getattr(existing_job, field)
                for field in (
                    "description",
                    "address",
                    "latitude",
                    "longitude",
                    "required_experience_years",
                    "wage_type",
                    "wage_amount",
                    "work_type",
                    "number_of_workers_required",
                    "application_deadline",
                    "scheduled_datetime",
                    "duration_days",
                    "subcategory_id",
                )
            }
            before_skills = (
                set(existing_job.required_skills.values_list("id", flat=True)),
                set(existing_job.preferred_skills.values_list("id", flat=True)),
            )

            serializer.save()

            existing_job.refresh_from_db()
            after = {field: getattr(existing_job, field) for field in before}
            after_skills = (
                set(existing_job.required_skills.values_list("id", flat=True)),
                set(existing_job.preferred_skills.values_list("id", flat=True)),
            )

            if before != after or before_skills != after_skills:
                self.jobs_updated += 1
            else:
                self.jobs_unchanged += 1

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def _print_summary(self):
        total_jobs = sum(self.category_counts.values())
        categories_used = sum(1 for count in self.category_counts.values() if count > 0)
        locations_used = len({
            job_spec["locality"]
            for category_block in DEMO_MARKETPLACE
            for employer_block in category_block["employers"]
            for job_spec in employer_block["jobs"]
        })

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Demo workforce marketplace seed complete."))
        self.stdout.write("")
        self.stdout.write(
            f"Employers:       {self.employers_created} created, "
            f"{self.employers_updated} updated, {self.employers_unchanged} unchanged"
        )
        self.stdout.write(
            f"Jobs:            {self.jobs_created} created, "
            f"{self.jobs_updated} updated, {self.jobs_unchanged} unchanged"
        )
        self.stdout.write(f"Categories used: {categories_used}/{len(DEMO_MARKETPLACE)}")
        self.stdout.write(f"Locations used:  {locations_used}")
        self.stdout.write("")

        name_width = max(len(name) for name in self.category_counts) + 1
        for name, count in self.category_counts.items():
            dots = "." * (name_width - len(name) + 8)
            self.stdout.write(f"{name} {dots} {count}")

        total_dots = "." * (name_width - len("TOTAL") + 8)
        self.stdout.write(f"TOTAL{total_dots} {total_jobs}")
