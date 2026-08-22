from pathlib import Path

from django.contrib.staticfiles import finders
from django.test import SimpleTestCase
from django.urls import resolve, reverse


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
