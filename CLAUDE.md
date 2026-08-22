# Workforce Matching Development Instructions

## Project

Workforce Matching is a Django REST Framework and PostgreSQL workforce-matching
platform for blue-collar and local-service workers.

The Week 1 foundation already exists and must be preserved.

## Existing technology

- Python
- Django
- Django REST Framework
- PostgreSQL
- Simple JWT
- RapidFuzz
- Git and GitHub

## Existing Django apps

Inspect the repository to confirm the exact structure, but the intended apps are:

- accounts
- profiles
- taxonomy
- jobs
- applications
- recommendations

## Current development scope

Implement all requirements from Weeks 2, 3 and 4 without omitting features.

### Week 2

- Worker profile CRUD
- Employer profile CRUD
- Structured taxonomy
- Categories
- Subcategories
- Standardized skills
- English synonyms
- Romanized-Nepali aliases
- Skill-normalization service
- Text preprocessing
- Exact standardized-name matching
- Exact alias matching
- RapidFuzz fallback
- Confidence thresholds
- Unmatched-term storage
- Admin-review support
- PAN/VAT format validation
- Seed taxonomy management command
- Permissions
- API tests
- Service tests

### Week 3

- Job-post CRUD
- Required and preferred skills stored separately
- Active and closed job statuses
- Employer ownership permissions
- Worker job browsing
- Worker-to-job filtering
- Job-to-worker filtering
- Category and subcategory filtering
- Availability filtering
- Haversine-distance filtering
- Application model
- Duplicate-application prevention
- Application-status state machine
- Worker withdrawal
- Employer shortlisting, rejection, hiring and completion
- Permissions
- API tests
- State-transition tests

### Week 4

- Required-skill coverage
- Binary standardized-skill vectors
- Cosine similarity
- Structured skill score:
  70% required-skill coverage and 30% cosine similarity
- Haversine-distance calculation
- Linear distance falloff to zero at 20 km
- Experience score
- Cold-start-safe reliability score
- Rating handling
- Completed-job handling
- Verification handling
- Configurable final-score weights
- Worker-to-job recommendation endpoint
- Job-to-worker recommendation endpoint
- Component-score breakdown
- Deterministic explanation reasons
- Boundary tests
- Recommendation API tests

## Engineering rules

1. Inspect existing code before modifying anything.
2. Preserve the custom User model and existing authentication.
3. Do not recreate the Django project.
4. Do not delete migrations.
5. Do not change unrelated modules.
6. Do not add Docker, Redis, Celery, Elasticsearch, embeddings or machine learning.
7. Keep business logic in service modules rather than serializers or views.
8. Keep serializers responsible for validation and representation.
9. Keep permissions explicit.
10. Use database constraints where appropriate.
11. Create migrations for model changes.
12. Add tests for successful and unsuccessful cases.
13. Run all checks before declaring a phase complete.
14. Never claim that tests passed without showing the real command output.
15. Stop after each requested implementation phase for review.
16. Report every changed file and important design decision.
17. Ask before changing an established Week 1 design.
