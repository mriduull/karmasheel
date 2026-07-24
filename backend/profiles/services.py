"""Week 5 automatic worker CV generation.

The professional summary is deterministic and template-based - built
entirely from fields already stored on the worker profile and its user
account. No LLM, external text-generation service, employment history,
certificates, or ratings are invented.

WeasyPrint is imported lazily by ``render_worker_cv_pdf``.  Its Python
package depends on operating-system libraries (Pango/GTK) that are not
present on every development machine, and importing it at module load time
would otherwise prevent *all* Django commands and non-PDF endpoints from
starting.  A small standards-compliant PDF fallback keeps the CV download
usable in those environments while WeasyPrint remains the preferred renderer.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone

MAX_SUMMARY_SKILLS = 6
_NOT_CHECKED = object()
_weasyprint_available = _NOT_CHECKED
_browser_executable = _NOT_CHECKED


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

    # Local import avoids a profiles -> applications -> jobs -> profiles
    # import cycle during Django startup.
    from applications.services import get_rating_summary

    user = worker_profile.user
    skills = list(worker_profile.skills.order_by("name"))
    average_rating, rating_count = get_rating_summary(user)

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
        "average_rating": average_rating,
        "rating_count": rating_count,
        "generated_at": timezone.now(),
    }


def render_worker_cv_html(worker_profile):
    context = build_worker_cv_context(worker_profile)
    return render_to_string("profiles/worker_cv.html", context)


def _escape_pdf_text(value):
    """Encode text safely for a PDF literal string using built-in fonts."""

    text = str(value).encode("latin-1", errors="replace").decode("latin-1")
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_fallback_pdf(context):
    """Build a compact, valid one-page CV PDF without native dependencies.

    This is deliberately a last-resort renderer for Latin-script content, not
    a second template engine. Unicode-capable WeasyPrint or Chromium rendering
    is attempted first in normal operation.
    """

    skill_names = ", ".join(skill.name for skill in context["skills"]) or "Not specified"
    lines = [
        context["full_name"],
        context["professional_summary"],
        "",
        f"Username: {context['username']}",
        f"Phone: {context['phone_number']}",
        f"Contact verified: {'Yes' if context['is_contact_verified'] else 'No'}",
        f"Address: {context['address'] or 'Not specified'}",
        f"Experience: {context['experience_years']} year(s)",
        f"Skills: {skill_names}",
        (
            f"Average rating: {context['average_rating']}/5 "
            f"({context['rating_count']} rating(s))"
            if context["average_rating"] is not None
            else "Average rating: Not rated yet"
        ),
        f"Availability: {'Available' if context['is_available'] else 'Not available'}",
        (
            f"Expected wage: {context['expected_wage']}"
            if context["expected_wage"] is not None
            else "Expected wage: Not specified"
        ),
        (
            f"Preferred travel radius: {context['preferred_travel_radius_km']} km"
            if context["preferred_travel_radius_km"] is not None
            else "Preferred travel radius: Not specified"
        ),
        "",
        f"Generated: {context['generated_at']:%Y-%m-%d %H:%M %Z}",
    ]

    wrapped_lines = []
    for line in lines:
        wrapped_lines.extend(textwrap.wrap(str(line), width=82) or [""])

    commands = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL"]
    for index, line in enumerate(wrapped_lines):
        if index:
            commands.append("T*")
        commands.append(f"({_escape_pdf_text(line)}) Tj")
    commands.append("ET")
    content_stream = "\n".join(commands).encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        ),
        (
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica "
            b"/Encoding /WinAnsiEncoding >>"
        ),
        (
            f"<< /Length {len(content_stream)} >>\nstream\n".encode("ascii")
            + content_stream
            + b"\nendstream"
        ),
    ]

    document = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for object_number, object_body in enumerate(objects, start=1):
        offsets.append(len(document))
        document.extend(f"{object_number} 0 obj\n".encode("ascii"))
        document.extend(object_body)
        document.extend(b"\nendobj\n")

    xref_offset = len(document)
    document.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    document.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        document.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    document.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    return bytes(document)


def _render_pdf_with_weasyprint(html_string):
    """Return WeasyPrint output, or ``None`` when native support is absent."""

    global _weasyprint_available

    if _weasyprint_available is False:
        return None

    try:
        # Importing WeasyPrint can raise OSError when optional Pango/GTK
        # libraries are missing. Cache that outcome so a long-running server
        # does not repeat an expensive import or warning on every download.
        from weasyprint import HTML

        pdf_bytes = HTML(string=html_string).write_pdf()
        _weasyprint_available = True
        return pdf_bytes
    except (ImportError, OSError):
        _weasyprint_available = False
        return None


def _find_chromium_browser():
    """Find an installed Chromium-family browser without shell lookup."""

    global _browser_executable

    if _browser_executable is not _NOT_CHECKED:
        return _browser_executable

    candidates = []
    if sys.platform == "win32":
        for env_name in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
            root = os.environ.get(env_name)
            if not root:
                continue
            candidates.extend(
                [
                    Path(root) / "Microsoft/Edge/Application/msedge.exe",
                    Path(root) / "Google/Chrome/Application/chrome.exe",
                ]
            )
    elif sys.platform == "darwin":
        candidates.extend(
            [
                Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
                Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
                Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
            ]
        )
    else:
        for name in (
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
            "microsoft-edge",
        ):
            executable = shutil.which(name)
            if executable:
                candidates.append(Path(executable))

    _browser_executable = next(
        (str(candidate) for candidate in candidates if candidate.is_file()),
        None,
    )
    return _browser_executable


def _render_pdf_with_browser(html_string):
    """Use headless Edge/Chrome as a Unicode-capable local PDF renderer."""

    executable = _find_chromium_browser()
    if executable is None:
        return None

    try:
        with tempfile.TemporaryDirectory(prefix="karmasheel-cv-") as temp_dir:
            temp_path = Path(temp_dir)
            html_path = temp_path / "cv.html"
            pdf_path = temp_path / "cv.pdf"
            browser_profile_path = temp_path / "browser-profile"
            html_path.write_text(html_string, encoding="utf-8")

            result = subprocess.run(
                [
                    executable,
                    "--headless=new",
                    "--disable-background-networking",
                    "--disable-extensions",
                    "--disable-gpu",
                    "--disable-sync",
                    "--no-first-run",
                    "--no-pdf-header-footer",
                    f"--user-data-dir={browser_profile_path}",
                    f"--print-to-pdf={pdf_path}",
                    html_path.as_uri(),
                ],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=30,
            )

            if result.returncode == 0 and pdf_path.is_file():
                pdf_bytes = pdf_path.read_bytes()
                if pdf_bytes.startswith(b"%PDF"):
                    return pdf_bytes
    except (OSError, subprocess.SubprocessError):
        return None

    return None


def render_worker_cv_pdf(worker_profile):
    context = build_worker_cv_context(worker_profile)
    html_string = render_to_string("profiles/worker_cv.html", context)
    engine = getattr(settings, "CV_PDF_ENGINE", "auto")

    if engine == "basic":
        return _build_fallback_pdf(context)

    if engine == "browser":
        renderers = (_render_pdf_with_browser, _render_pdf_with_weasyprint)
    elif engine == "weasyprint":
        renderers = (_render_pdf_with_weasyprint, _render_pdf_with_browser)
    elif sys.platform == "win32":
        # A standard Edge installation is far more common on Windows than
        # WeasyPrint's separately installed GTK runtime.
        renderers = (_render_pdf_with_browser, _render_pdf_with_weasyprint)
    else:
        renderers = (_render_pdf_with_weasyprint, _render_pdf_with_browser)

    for renderer in renderers:
        pdf_bytes = renderer(html_string)
        if pdf_bytes is not None:
            return pdf_bytes

    return _build_fallback_pdf(context)
