from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.contrib.staticfiles import finders
from django.db import DatabaseError, connections
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import resolve, reverse


@override_settings(DEBUG=True)
class FrontendSmokeTests(SimpleTestCase):
    """Small integration guard for the Week 6 Django-served demo UI."""

    def test_frontend_is_served_at_project_root(self):
        response = self.client.get(reverse("frontend"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Workforce Matching")
        self.assertContains(response, 'id="register-form"')
        self.assertContains(response, 'id="login-form"')
        self.assertContains(response, 'id="worker-profile-form"')
        self.assertContains(response, 'id="employer-profile-form"')
        self.assertContains(response, 'id="job-create-form"')
        self.assertContains(response, 'id="rating-summary"')
        self.assertContains(response, 'id="job-filter-latitude"')
        self.assertContains(response, 'id="job-filter-longitude"')
        self.assertContains(response, 'id="worker-recommendation-results"')
        self.assertContains(response, 'id="employer-recommendation-results"')

    def test_frontend_loads_versioned_project_static_assets(self):
        response = self.client.get(reverse("frontend"))

        self.assertContains(response, "/static/frontend/app.css")
        self.assertContains(response, "/static/frontend/app.js")
        self.assertIsNotNone(finders.find("frontend/app.css"))
        self.assertIsNotNone(finders.find("frontend/app.js"))

        script = Path(finders.find("frontend/app.js")).read_text(encoding="utf-8")
        self.assertIn("loadRatingSummary", script)
        self.assertIn("advice.reason", script)
        self.assertIn("application.can_rate", script)
        self.assertIn("application.has_rated", script)
        self.assertIn("result.warnings", script)
        self.assertIn("Distance unavailable", script)
        self.assertNotIn("subject.address", script)

    def test_existing_api_urls_are_not_shadowed_by_frontend(self):
        match = resolve("/api/taxonomy/tree/")

        self.assertEqual(match.view_name, "taxonomy:tree")
        self.assertNotEqual(match.view_name, "frontend")

    def test_api_root_returns_endpoint_index(self):
        response = self.client.get(reverse("api_root"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Workforce Matching API")
        self.assertEqual(response.json()["endpoints"]["job_browse"], "/api/jobs/browse/")

    def test_health_endpoint_is_public_and_not_cached(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertEqual(response.headers["Cache-Control"], "max-age=0, no-cache, no-store, must-revalidate, private")


class ProductionServiceRootTests(SimpleTestCase):
    @override_settings(DEBUG=False)
    def test_production_root_is_an_api_index_not_the_legacy_frontend(self):
        response = self.client.get(reverse("frontend"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Workforce Matching API")

    def test_cv_filename_header_is_exposed_to_the_cross_origin_frontend(self):
        self.assertIn("Content-Disposition", settings.CORS_EXPOSE_HEADERS)


class ReadinessTests(TestCase):
    def test_readiness_endpoint_checks_the_database(self):
        response = self.client.get(reverse("readiness"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ready"})

    def test_readiness_returns_503_when_the_database_is_unavailable(self):
        with patch.object(
            connections["default"],
            "cursor",
            side_effect=DatabaseError("database unavailable"),
        ):
            response = self.client.get(reverse("readiness"))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})
