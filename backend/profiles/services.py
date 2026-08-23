"""Week 5 automatic worker CV generation.

The professional summary is deterministic and template-based - built
entirely from fields already stored on the worker profile and its user
account. No LLM, external text-generation service, employment history,
certificates, or ratings are invented.

WeasyPrint is imported lazily by ``render_worker_cv_pdf``. Its Python package
depends on operating-system libraries (Pango/GTK) that are not present on
every development machine, and importing it at module load time would
otherwise prevent *all* Django commands and non-PDF endpoints from starting.
ReportLab provides the portable, styled renderer used when those optional
HTML-to-PDF dependencies are unavailable.
"""

import base64
import binascii
import html
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.template.loader import render_to_string
from PIL import Image as PillowImage
from PIL import ImageDraw, ImageOps, UnidentifiedImageError
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    Flowable,
    HRFlowable,
    Image as ReportLabImage,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

MAX_SUMMARY_SKILLS = 6
_NOT_CHECKED = object()
_weasyprint_available = _NOT_CHECKED
_browser_executable = _NOT_CHECKED


def _profile_photo_data_uri(worker_profile):
    if not worker_profile.profile_photo:
        return None

    try:
        with worker_profile.profile_photo.open("rb") as photo:
            encoded = base64.b64encode(photo.read()).decode("ascii")
    except OSError:
        return None

    content_type = (
        mimetypes.guess_type(worker_profile.profile_photo.name)[0]
        or "image/jpeg"
    )
    return f"data:{content_type};base64,{encoded}"


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
        "profile_photo_data_uri": _profile_photo_data_uri(worker_profile),
        "professional_summary": generate_worker_summary(worker_profile),
        "skills": skills,
        "experience_years": worker_profile.experience_years,
        "is_available": worker_profile.is_available,
        "expected_wage": worker_profile.expected_wage,
        "preferred_travel_radius_km": worker_profile.preferred_travel_radius_km,
        "average_rating": average_rating,
        "rating_count": rating_count,
    }


def render_worker_cv_html(worker_profile):
    context = build_worker_cv_context(worker_profile)
    return render_to_string("profiles/worker_cv.html", context)


def _pdf_text(value):
    """Escape user-controlled text before ReportLab parses paragraph markup."""

    return html.escape(str(value), quote=False)


class _SkillChipsFlowable(Flowable):
    """A wrapping, page-splittable row of skill chips."""

    font_name = "Helvetica"
    font_size = 10
    minimum_font_size = 7
    horizontal_padding = 8
    vertical_padding = 5
    chip_height = 21
    horizontal_gap = 6
    vertical_gap = 6
    corner_radius = 3

    def __init__(self, skill_names):
        super().__init__()
        self.skill_names = [str(name) for name in skill_names]
        self._layout_width = 0
        self._layout_rows = []

    def _split_label(self, label, maximum_text_width, font_size):
        """Wrap even an unbroken max-length skill name inside the page."""

        if stringWidth(label, self.font_name, font_size) <= maximum_text_width:
            return [label]

        lines = []
        remaining = label
        while remaining:
            split_at = 0
            last_space = 0
            for index in range(1, len(remaining) + 1):
                candidate = remaining[:index]
                if stringWidth(candidate, self.font_name, font_size) > maximum_text_width:
                    break
                split_at = index
                if candidate[-1].isspace():
                    last_space = index

            if split_at == 0:
                # Defensive fallback for a glyph wider than the content area.
                split_at = 1
            elif split_at < len(remaining) and last_space:
                split_at = last_space

            lines.append(remaining[:split_at].rstrip())
            remaining = remaining[split_at:].lstrip()

        return lines

    def _chip(self, label, available_width):
        maximum_text_width = max(
            1,
            available_width - (2 * self.horizontal_padding),
        )
        font_size = self.font_size
        while (
            font_size > self.minimum_font_size
            and stringWidth(label, self.font_name, font_size) > maximum_text_width
        ):
            font_size -= 0.5

        lines = self._split_label(label, maximum_text_width, font_size)
        chip_width = min(
            available_width,
            max(stringWidth(line, self.font_name, font_size) for line in lines)
            + (2 * self.horizontal_padding),
        )
        line_height = font_size + 2
        chip_height = max(
            self.chip_height,
            (len(lines) * line_height) + (2 * self.vertical_padding),
        )
        return (label, lines, font_size, chip_width, chip_height)

    def _make_rows(self, available_width):
        rows = []
        current_row = []
        used_width = 0

        for label in self.skill_names:
            chip = self._chip(label, available_width)
            chip_width = chip[3]
            required_width = chip_width + (self.horizontal_gap if current_row else 0)

            if current_row and used_width + required_width > available_width:
                rows.append(current_row)
                current_row = []
                used_width = 0
                required_width = chip_width

            current_row.append(chip)
            used_width += required_width

            # Wrapped labels use the full row so adjacent chips cannot collide
            # with their additional lines.
            if len(chip[1]) > 1:
                rows.append(current_row)
                current_row = []
                used_width = 0

        if current_row:
            rows.append(current_row)

        return rows

    def wrap(self, available_width, available_height):
        self._layout_width = available_width
        self._layout_rows = self._make_rows(available_width)
        self.width = available_width
        row_heights = [max(chip[4] for chip in row) for row in self._layout_rows]
        self.height = sum(row_heights) + (
            max(0, len(row_heights) - 1) * self.vertical_gap
        )
        return self.width, self.height

    def split(self, available_width, available_height):
        rows = self._make_rows(available_width)
        if not rows:
            return []

        rows_that_fit = 0
        used_height = 0
        for row in rows:
            row_height = max(chip[4] for chip in row)
            required_height = row_height + (
                self.vertical_gap if rows_that_fit else 0
            )
            if used_height + required_height > available_height:
                break
            used_height += required_height
            rows_that_fit += 1

        if rows_that_fit < 1 or rows_that_fit >= len(rows):
            return []

        first_names = [item[0] for row in rows[:rows_that_fit] for item in row]
        remaining_names = [item[0] for row in rows[rows_that_fit:] for item in row]
        return [
            type(self)(first_names),
            type(self)(remaining_names),
        ]

    def draw(self):
        if not self._layout_rows:
            return

        self.canv.saveState()
        self.canv.setFillColor(colors.HexColor("#eef1f5"))

        y = self.height
        for row in self._layout_rows:
            row_height = max(chip[4] for chip in row)
            y -= row_height
            x = 0
            for label, lines, font_size, chip_width, chip_height in row:
                chip_y = y + ((row_height - chip_height) / 2)
                self.canv.roundRect(
                    x,
                    chip_y,
                    chip_width,
                    chip_height,
                    self.corner_radius,
                    fill=1,
                    stroke=0,
                )
                self.canv.setFillColor(colors.HexColor("#1a1a1a"))
                self.canv.setFont(self.font_name, font_size)
                line_height = font_size + 2
                text_height = len(lines) * line_height
                text_y = (
                    chip_y
                    + ((chip_height - text_height) / 2)
                    + text_height
                    - font_size
                    + 1
                )
                for line in lines:
                    self.canv.drawString(
                        x + self.horizontal_padding,
                        text_y,
                        line,
                    )
                    text_y -= line_height
                self.canv.setFillColor(colors.HexColor("#eef1f5"))
                x += chip_width + self.horizontal_gap
            y -= self.vertical_gap

        self.canv.restoreState()


def _reportlab_profile_photo(data_uri):
    """Return a circular ReportLab image for a validated profile data URI."""

    if not data_uri or "," not in data_uri:
        return None

    try:
        encoded = data_uri.split(",", 1)[1]
        image_bytes = base64.b64decode(encoded, validate=True)

        with PillowImage.open(BytesIO(image_bytes)) as source:
            oriented = ImageOps.exif_transpose(source)
            fitted = ImageOps.fit(
                oriented.convert("RGBA"),
                (320, 320),
                method=PillowImage.Resampling.LANCZOS,
            )

        # Browsers composite transparent profile photos over the white CV
        # page. Do the same before applying the circular crop so transparent
        # PNG/WebP uploads cannot acquire a black background in the PDF.
        square = PillowImage.new("RGBA", fitted.size, (255, 255, 255, 255))
        square.alpha_composite(fitted)

        mask = PillowImage.new("L", square.size, 0)
        ImageDraw.Draw(mask).ellipse((2, 2, 317, 317), fill=255)
        circular = PillowImage.new("RGBA", square.size, (255, 255, 255, 0))
        circular.paste(square, (0, 0), mask)
        ImageDraw.Draw(circular).ellipse(
            (2, 2, 317, 317),
            outline=(204, 204, 204, 255),
            width=3,
        )

        image_buffer = BytesIO()
        circular.save(image_buffer, format="PNG")
        image_buffer.seek(0)

        photo = ReportLabImage(
            image_buffer,
            width=69,
            height=69,
            mask="auto",
        )
        photo.hAlign = "RIGHT"
        # ReportLab reads file-like image sources lazily while building pages.
        photo._source_buffer = image_buffer
        return photo
    except (binascii.Error, OSError, UnidentifiedImageError, ValueError):
        return None


def _build_reportlab_pdf(context):
    """Build a styled, portable PDF matching the canonical HTML CV preview."""

    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        pageCompression=0,
        title=f"{context['full_name']} - CV",
        author="Workforce Matching",
    )

    body_style = ParagraphStyle(
        "CVBody",
        fontName="Helvetica",
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#1a1a1a"),
        spaceAfter=0,
    )
    name_style = ParagraphStyle(
        "CVName",
        parent=body_style,
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
    )
    subtitle_style = ParagraphStyle(
        "CVSubtitle",
        parent=body_style,
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#555555"),
        spaceBefore=2,
    )
    section_style = ParagraphStyle(
        "CVSection",
        parent=body_style,
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        tracking=0.4,
        keepWithNext=True,
    )
    label_style = ParagraphStyle(
        "CVLabel",
        parent=body_style,
        textColor=colors.HexColor("#555555"),
    )
    verified_badge_style = ParagraphStyle(
        "CVVerifiedBadge",
        parent=body_style,
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#1c6b41"),
    )
    unverified_badge_style = ParagraphStyle(
        "CVUnverifiedBadge",
        parent=body_style,
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#8a5a1c"),
    )

    def paragraph(value, style=body_style):
        return Paragraph(_pdf_text(value), style)

    def section_heading(label):
        rule = HRFlowable(
            width="100%",
            thickness=0.7,
            color=colors.HexColor("#cccccc"),
            spaceBefore=3,
            spaceAfter=7,
        )
        rule.keepWithNext = True
        return [
            Spacer(1, 14),
            paragraph(label.upper(), section_style),
            rule,
        ]

    story = []
    identity = [
        paragraph(context["full_name"], name_style),
        paragraph(context["address"] or "Location not provided", subtitle_style),
    ]
    photo = _reportlab_profile_photo(context["profile_photo_data_uri"])
    if photo is not None:
        header = Table(
            [[identity, photo]],
            colWidths=[document.width - 85, 69],
            hAlign="LEFT",
        )
    else:
        header = Table([[identity]], colWidths=[document.width], hAlign="LEFT")
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(header)

    story.extend(section_heading("Professional Summary"))
    story.append(paragraph(context["professional_summary"]))

    story.extend(section_heading("Contact"))
    verification_text = "Verified" if context["is_contact_verified"] else "Unverified"
    verification_style = (
        verified_badge_style if context["is_contact_verified"] else unverified_badge_style
    )
    verification_background = (
        colors.HexColor("#d9f2e3")
        if context["is_contact_verified"]
        else colors.HexColor("#f2e5d9")
    )
    verification_badge = Table(
        [[paragraph(verification_text, verification_style)]],
        colWidths=[stringWidth(verification_text, "Helvetica", 9) + 12],
        hAlign="LEFT",
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), verification_background),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        ),
    )
    contact_table = Table(
        [
            [paragraph("Phone", label_style), paragraph(context["phone_number"])],
            [paragraph("Contact verification", label_style), verification_badge],
        ],
        colWidths=[document.width * 0.35, document.width * 0.65],
        hAlign="LEFT",
    )
    contact_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(contact_table)

    story.extend(section_heading("Skills"))
    if context["skills"]:
        story.append(_SkillChipsFlowable([skill.name for skill in context["skills"]]))
    else:
        story.append(paragraph("No standardized skills recorded yet."))

    story.extend(section_heading("Work Details"))
    experience_years = context["experience_years"]
    year_word = "year" if experience_years == 1 else "years"
    if context["average_rating"] is None:
        rating_text = "Not rated yet"
    else:
        rating_count = context["rating_count"]
        rating_word = "rating" if rating_count == 1 else "ratings"
        rating_text = (
            f"{context['average_rating']}/5 from {rating_count} {rating_word}"
        )

    work_details = [
        ("Experience", f"{experience_years} {year_word}"),
        ("Average rating", rating_text),
        (
            "Availability",
            "Available for work"
            if context["is_available"]
            else "Not currently available",
        ),
    ]
    if context["expected_wage"] is not None:
        work_details.append(("Expected wage", f"NPR {context['expected_wage']}"))
    if context["preferred_travel_radius_km"] is not None:
        work_details.append(
            (
                "Preferred travel radius",
                f"{context['preferred_travel_radius_km']} km",
            )
        )

    work_table = Table(
        [
            [paragraph(label, label_style), paragraph(value)]
            for label, value in work_details
        ],
        colWidths=[document.width * 0.35, document.width * 0.65],
        hAlign="LEFT",
        repeatRows=0,
    )
    work_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(work_table)

    document.build(story)
    return output.getvalue()


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
        with tempfile.TemporaryDirectory(prefix="workforce-matching-cv-") as temp_dir:
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
        return _build_reportlab_pdf(context)

    if engine == "browser":
        renderers = (_render_pdf_with_browser, _render_pdf_with_weasyprint)
    elif engine == "weasyprint":
        renderers = (_render_pdf_with_weasyprint, _render_pdf_with_browser)
    elif sys.platform == "win32":
        # A standard Edge installation is far more common on Windows than
        # WeasyPrint's separately installed GTK runtime.
        renderers = (_render_pdf_with_browser, _render_pdf_with_weasyprint)
    elif sys.platform == "darwin":
        # On macOS, headless Chromium can fail inside a web-server process
        # despite working interactively. Prefer the native-library check, then
        # move directly to the portable renderer rather than delaying every
        # download with a doomed browser launch.
        renderers = (_render_pdf_with_weasyprint,)
    else:
        renderers = (_render_pdf_with_weasyprint, _render_pdf_with_browser)

    for renderer in renderers:
        pdf_bytes = renderer(html_string)
        if pdf_bytes is not None:
            return pdf_bytes

    return _build_reportlab_pdf(context)
