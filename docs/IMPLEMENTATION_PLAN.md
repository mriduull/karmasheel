# Karmasheel Implementation Plan

## Project purpose

Karmasheel is a web-based workforce-matching and opportunity-advisory
platform for blue-collar and local-service workers in Nepal.

The system connects workers and employers using structured skills,
location, availability, experience, preferences, and reliability
indicators. Recommendations must remain explainable.

## Technology

- Python
- Django
- Django REST Framework
- PostgreSQL
- JWT authentication
- RapidFuzz for lightweight fuzzy skill matching

## Six-week scope

### Week 1 — Setup, authentication and initial schema

- Django REST Framework and PostgreSQL
- Apps: accounts, profiles, taxonomy, jobs, applications,
  recommendations
- Custom User model
- Initial WorkerProfile and EmployerProfile
- Initial taxonomy models
- JWT registration, login and logout
- Role-based permissions
- Manual contact verification through Django admin

### Week 2 — Profiles and skill normalization

- Complete worker and employer profile CRUD
- Skills, location, wage and availability
- PAN/VAT format validation
- Seed 2 categories, 5 subcategories, approximately 20 standardized
  skills and approximately 40 English/Romanized-Nepali aliases
- Implement normalize_skill_phrase()
- Preprocessing, exact lookup, alias lookup, RapidFuzz matching and
  unmatched-term review
- Demonstrate that "ghar wiring" maps to "House wiring"

### Week 3 — Jobs, filtering and applications

- JobPost with normalized required and preferred skills
- Worker-to-job and job-to-worker filtering
- Category and distance filtering
- Application model
- Enforced application-status state machine

### Week 4 — Hybrid recommendation engine

- Required-skill coverage and cosine similarity
- Haversine-distance scoring
- Experience and simplified reliability scoring
- Weighted final score
- Template-based recommendation reasons

### Week 5 — CV, ratings and opportunity advisory

- HTML CV template and PDF export
- Ratings linked to completed work
- Average-rating calculation
- Near-miss job detection
- Missing-skill ranking

### Week 6 — Integration and demonstration

- Register models in Django admin
- Full end-to-end testing
- Minimal HTML frontend
- Fix integration problems
- Prepare demonstration workflow
- No major new features

## Scope rule

Complete only the requested week. Do not begin later-week functionality
unless explicitly instructed.

Do not recreate models or features that already exist. Extend the current
implementation safely.

The first version uses transparent, rule-based and lightweight algorithms.
Do not add deep-learning models, embeddings, Faiss or unnecessary AI
infrastructure.