# Taxonomy Source Audit — Production-Quality Skill Taxonomy for Workforce Matching

Status: **research and design only**. No models, migrations, seed data, or
API behavior were changed to produce this document. Written by inspecting
the current repository (`backend/taxonomy/`, `docs/IMPLEMENTATION_PLAN.md`,
`docs/DEFERRED_SCOPE.md`, `docs/FRONTEND_CONTEXT.md`) and researching four
primary/authoritative classification sources: Nepal CTEVT/NSTB, ESCO,
O*NET, and ILO ISCO-08.

## 0. Where we start from today

The Week 2 taxonomy (`backend/taxonomy/management/commands/seed_taxonomy.py`)
is a deliberately small demo dataset, exactly as scoped in
`docs/IMPLEMENTATION_PLAN.md` §Week 2: **2 categories, 5 subcategories, ~20
standardized skills, ~40 English/Romanized-Nepali aliases** —
`Construction & Repair` (Electrical, Plumbing, Masonry) and
`Domestic & Local Services` (Cleaning, Cooking). It was never meant to be
the production taxonomy; this document is the research step toward that.

Models (`backend/taxonomy/models.py`), unchanged by this document:

| Model | Key fields |
|---|---|
| `Category` | `name` (unique) |
| `Subcategory` | `category` FK, `name` (unique per category) |
| `SkillTag` | `subcategory` FK, `name` (unique per subcategory), `is_active` |
| `SkillAlias` | `skill` FK, `phrase` (**globally** unique), `language` (`EN` / `NE_ROMANIZED` / `UNSPECIFIED`) |
| `UnmatchedSkillTerm` | admin-review queue for phrases the normalizer couldn't confidently match |

Matching (`backend/taxonomy/services.py`, `normalize_skill_phrase`):
preprocess → exact standardized-name match → exact alias match → RapidFuzz
fuzzy fallback (default threshold 85, `settings.SKILL_MATCH_THRESHOLD`) →
`UnmatchedSkillTerm`. This is deliberately simple string matching, per
engineering rule #6 (no embeddings/ML) and `DEFERRED_SCOPE.md`'s explicit
note that this is "by design," not a gap. **Nothing in this audit proposes
changing that matching approach** — only the size and quality of the
corpus it matches against.

Public API (`backend/taxonomy/views.py`, `urls.py`): four read-only,
unpaginated, `AllowAny` endpoints returning bare arrays —
`/api/taxonomy/categories/`, `/subcategories/?category=`,
`/skills/?subcategory=&search=`, `/tree/`. `docs/FRONTEND_CONTEXT.md`
confirms the frontend uses these for plain `<select>` dropdowns
(category/subcategory) and free-text skill entry with server-side
normalization (not a browsable skill picker) — so a large skill count is
fine; a large *subcategory* count per category needs to stay usable in a
plain dropdown.

## 1. Comparison of the four sources

| | **CTEVT / NSTB (Nepal)** | **ESCO** | **O\*NET** | **ISCO-08** |
|---|---|---|---|---|
| Maintained by | CTEVT (Nepal, under MoEST) / NSTB, its testing arm | European Commission, DG EMPL | US DOL/ETA | ILO |
| What it defines | Nepali trade occupations + National Occupational Skill Standards (NOSS), tested at Elementary/L1–L4 | Occupations (ISCO-based) **and** a separate Skills/Competences pillar (~13,900 skills) with essential/optional per occupation | Occupations (O*NET-SOC) with Tasks, Knowledge, Skills, Abilities, Tools & Technology | **Occupations only** — 10 major → 43 sub-major → 130 minor → 436 unit groups. No skill-level content at all. |
| Scale | ~237–311 occupations (sources conflict; no single canonical current count found) | 3,039 occupations / ~13,890 skills, 28 languages (no Nepali) | 1,016 O\*NET-SOC titles (923 with full data) | 436 unit groups (occupations, not skills) |
| Nepal-specific? | **Yes** — the only source with Nepal-specific trade names, levels, and locally recognized certification structure | No | No (US labor market) | No, but Nepal's own NSCO is ISCO-derived (confirmed ISCO-88-aligned; a 2017/18 update toward ISCO-08 is claimed by a secondary source but not confirmed against a primary NSO document) |
| Data format | **PDF and static web pages only** — no CSV/JSON/API found anywhere on ctevt.org.np / nstb.org.np / nvqs.org.np | CSV, JSON-LD, RDF, TTL, ODS, XML download; live REST API (`ec.europa.eu/esco/api`) | Excel/CSV/SQL/RDF download; REST API (needs free API key) | PDF (Vol.1/Vol.2) + one Excel structure file; **no API** |
| License | **Not stated** — site footers say "All Rights Reserved," no open-data or reuse terms found | **CC BY 4.0**, attribution required | **CC BY 4.0** on the O\*NET 30.3 database, specific attribution wording required, "O\*NET" must be used as adjective, not a product name | ILO copyright; short excerpts reproducible with source cited, full reproduction needs permission; CC BY 4.0 only applies to ILO knowledge products from 3 May 2023 onward, not confirmed retroactive to the 2012 ISCO-08 volume |
| Skill granularity | Practical, locally-phrased trade skills (per NOSS docs), but full text wasn't extractable from the PDFs we could fetch | Essential-skill lists of ~10–20 items per occupation — close to directly usable | Deep Task/Tools data (very concrete) but the "Skills" domain itself is generic/transversal (Critical Thinking, Active Listening) | N/A |

Full per-source findings (structure, example occupations, citations) are
preserved in this session's research notes and summarized in §2 and §6
below; see the Sources list at the end of this document for every URL
cited.

## 2. Recommended source hierarchy

No single source covers everything Workforce Matching needs, and none should be
imported wholesale. Recommendation — a **three-layer hierarchy**, each
source used for what it's actually best at:

1. **Occupation/category backbone → ISCO-08.** Use ISCO-08's major/
   sub-major/minor group structure (specifically the parts of Major Groups
   5, 6, 7, 8, 9 relevant to blue-collar/local-service work) as the
   *conceptual* skeleton for how Categories and Subcategories relate to
   each other — not as a literal 436-row import. It's free, stable,
   internationally standard, and Nepal's own NSCO is built on it, which
   gives external legitimacy to the grouping logic (e.g., "why is
   Security Guarding not under Facility Support" has a defensible answer).

2. **Standardized skill content → ESCO, primary; O\*NET, secondary.** For
   each target occupation, pull ESCO's essential-skill list as the first
   draft of that occupation's SkillTag set (CC BY 4.0, practically
   downloadable/queryable). Where ESCO's skill for an occupation is too
   abstract or thin, paraphrase concrete phrasing from O\*NET Task/Tools
   statements for the same or nearest O\*NET-SOC occupation (also CC BY
   4.0). Reject both sources' *transversal/soft-skill* layers (ESCO
   "communicate effectively," O\*NET "Active Listening") — Workforce Matching's
   skill matching is for hard, verifiable trade skills, not soft
   competencies (see §9).

3. **Nepal-specific practical trades and terminology → CTEVT/NSTB,
   validation/naming reference only, not verbatim import.** Their trade
   names (e.g., "Building Electrician," "Housekeeping Cleaner," "Homestay
   Operator") and level structure are the best signal for what a Nepali
   worker or employer would actually recognize and search for. Given the
   unresolved license status (§3), do **not** copy NOSS document text
   verbatim into the taxonomy or into this repository. Instead: use their
   occupation names as a checklist to validate our own independently
   authored Category/Subcategory/SkillTag names, and flag Nepal-specific
   gaps neither ESCO nor O\*NET would surface on their own.

English + Romanized Nepali aliases are authored locally regardless — none
of the four sources include Nepali-language content (ESCO: 28 languages,
no Nepali; O\*NET/ISCO: English/US-federal only; CTEVT/NSTB: trade names in
English/Nepali script on their sites, not a Romanized-Nepali alias table).

## 3. Licensing and attribution notes

- **ESCO — CC BY 4.0.** Free reuse including commercial use and
  adaptation, provided attribution to the European Commission/ESCO is
  given. Suggested form: *"Includes information from ESCO (European
  Commission), used under CC BY 4.0."* Safe to import selected skill
  names/structure into our own curated table.
- **O\*NET — CC BY 4.0** on the O\*NET 30.3 database, with a specific
  required citation: *"This [page/product] includes information from the
  O\*NET 30.3 Database by the U.S. Department of Labor, Employment and
  Training Administration (USDOL/ETA). Used under the CC BY 4.0 license."*
  "O\*NET" must be used as an adjective, never as a standalone product
  name (it's a USDOL/ETA trademark). Safe to paraphrase task/skill
  language into our own table with this attribution kept somewhere in
  project documentation (not necessarily user-facing).
- **ISCO-08 — conservative use only.** Short excerpts (e.g., group titles/
  codes, which are short factual labels) may be reproduced with the
  source cited; full reproduction of ILO's definitional text requires
  permission from ILO Publications. We only need short group titles for
  structural inspiration, so this is low-risk, but we should **not**
  paste ISCO's longer group *definitions* into our own docs or database
  without attribution and, for full-text use, permission.
- **CTEVT/NSTB — do not treat as open-licensed.** No explicit reuse
  license found on ctevt.org.np, nstb.org.np, or nvqs.org.np; footers
  state "All Rights Reserved." Treat all NOSS PDFs and test-schedule
  documents as **reference-only, not redistributable source content**.
  Recommendation: never copy NOSS text verbatim into the repo; only use
  occupation/trade *names* (short factual labels, not creative content)
  as a naming checklist, and get an explicit legal/compliance sign-off
  before any deeper reuse (e.g., importing full competency-unit text) if
  that is ever desired.
- Every borrowed source name/skill should carry an internal note of
  provenance during curation (see §8) even though — per §10 — we are
  **not** adding a `source` field to the schema in this phase.

## 4. Proposed Workforce Matching taxonomy structure

Same four models, no schema change required for v1 (see §10). Target
scale, inside the ranges requested:

- **12 categories** (upper end of the 8–12 target — the brief's required
  coverage list has exactly 12 named areas, so one category per named
  area is the cleanest mapping and avoids force-merging distinct trades)
- **54 subcategories** (inside 30–60)
- **~340 standardized skills** (inside 250–500), with English synonyms for
  the majority and Romanized Nepali aliases prioritized for the
  highest-frequency, most worker-facing skills first (see §7)

This is a **target design**, not a literal migration plan for the
existing 2 categories — §10 and §12 cover how to get from today's 2/5/20
to this 12/54/~340 safely.

## 5. Proposed categories and occupations (subcategories)

| # | Category | Subcategories (occupations/trade groups) |
|---|---|---|
| 1 | Construction & Repair (general) | General Construction Labor, Carpentry, Welding & Metalwork, Tiling & Flooring, Roofing, Scaffolding & Formwork |
| 2 | Electrical Work | Residential Wiring, Industrial & Commercial Electrical, Electrical Maintenance & Repair, Solar & Renewable Installation |
| 3 | Plumbing | Pipe Installation & Fitting, Water Supply & Drainage, Sanitary Fixture Installation, Leak Detection & Repair |
| 4 | Painting & Masonry | Wall Painting, Decorative Finishing, Brickwork & Masonry, Plastering & Rendering, Stone & Tile Work |
| 5 | Cleaning & Domestic Services | House Cleaning, Deep & Commercial Cleaning, Laundry & Ironing, Gardening & Outdoor Maintenance, Pest Control |
| 6 | Hospitality & Food Services | Home & Restaurant Cooking, Waitstaff & Table Service, Hotel Housekeeping, Barista & Beverage Service, Catering & Event Food, Front Desk/Reception |
| 7 | Driving & Delivery | Two-Wheeler Delivery, Car/Taxi Driving, Heavy Vehicle/Truck Driving, Courier & Logistics |
| 8 | Security & Facility Support | Security Guarding, Facility/Building Maintenance, Fire Safety & Emergency Response, Parking & Access Control |
| 9 | Caregiving | Elderly Care, Child Care & Babysitting, Home Health Aide, Special Needs Support |
| 10 | Retail & Customer Service | Shop Sales Assistant, Cashier & Billing, Inventory & Stock Management, Customer Support |
| 11 | Office & Administrative Support | General Office Assistant, Data Entry, Reception & Front Office, Basic Bookkeeping Support |
| 12 | Event & Temporary Work | Event Setup & Logistics, Event Staffing (Ushering/Crowd Support), Sound & Basic AV Support, General Labor/Loading |

**54 subcategories total.** Full enumeration of all ~340 skills is
implementation work (§13), not this audit — §6 gives representative,
source-traced examples per category to validate the approach before that
work starts.

## 6. Example occupation-to-skill mappings

Each row shows the skill's likely primary source under §2's hierarchy.

| Subcategory (occupation) | Example standardized skills | Primary source |
|---|---|---|
| Residential Wiring | House Wiring, Circuit Breaker Installation, Switchboard Installation, Earthing/Grounding Installation | ESCO *Domestic electrician* essential skills; CTEVT "Building Electrician" for naming |
| Pipe Installation & Fitting | Pipe Fitting, PVC Pipe Jointing, Water Tank Installation, Valve Installation | ESCO *Plumber* essential skills |
| Brickwork & Masonry | Brick Laying, Concrete Mixing, Foundation Laying, Wall Alignment & Leveling | ESCO *Bricklayer* essential skills; O\*NET 47-2021.00 tasks for phrasing |
| Home & Restaurant Cooking | Home Cooking, Meal Preparation, Nepali Cuisine Cooking, Kitchen Sanitation | CTEVT "Nepali Cuisine Cook"; O\*NET 35-2014.00 tasks |
| House Cleaning | House Cleaning, Deep Cleaning, Floor Mopping, Bathroom Sanitation | O\*NET 37-2011.00 tasks (paraphrased); CTEVT "Housekeeping Cleaner" for naming |
| Security Guarding | Premises Patrolling, CCTV Monitoring, Visitor Log Management, Access Control | ESCO *Security guard* essential skills; O\*NET 33-9032.00 tasks |
| Elderly Care | Elderly Personal Care, Mobility Assistance, Medication Reminder Support, Vital Signs Monitoring | O\*NET 31-1121.00 (Home Health Aide) tasks; CTEVT "Caregiver (Personal & Home Care Aid), L1" for naming/legitimacy |
| Two-Wheeler Delivery | Two-Wheeler Riding, Parcel Handling, Route Navigation, Cash-on-Delivery Handling | Locally authored (none of the four sources cover gig-delivery directly); ISCO 8322 for occupation placement |
| Shop Sales Assistant | Customer Greeting & Assistance, Cash Billing, Product Display Arrangement, Basic Inventory Counting | ESCO/O\*NET *Retail Salesperson* (41-2031.00) tasks |
| Event Setup & Logistics | Stage/Tent Setup, Chair & Table Arrangement, Crowd Flow Management, Basic Sound Equipment Handling | Locally authored — no dedicated standard in any of the four sources (flagged gap, §12) |

## 7. Example English and Romanized Nepali aliases

Following the existing `SkillAlias` pattern (`phrase`, `language`), the
same style as today's seed data:

| Standardized skill | English synonym alias | Romanized Nepali alias |
|---|---|---|
| House Wiring | home wiring | ghar wiring |
| Circuit Breaker Installation | breaker installation | switch board jadan |
| Brick Laying | bricklaying work | itta thoknu |
| House Cleaning | home cleaning | ghar safai |
| Elderly Personal Care | old age care | budhesakal herchah |
| Premises Patrolling | site patrolling | ghumphir garne |
| Two-Wheeler Riding | motorbike delivery riding | motorsaikal chalaune |
| Cash Billing | billing / checkout | bill banaune |
| Nepali Cuisine Cooking | traditional Nepali cooking | nepali khana pakaune |
| Stage/Tent Setup | tent pitching | pandal banaune |

Priority order for authoring the full alias set (§13): start with the
skills most likely to be typed by a low-literacy or Romanized-Nepali-first
user during free-text skill entry (`skill_input`, per
`docs/FRONTEND_CONTEXT.md` §7) — i.e., the skills in the most commonly
posted job categories (Construction & Repair, Cleaning, Driving) — before
covering the long tail.

## 8. Import and update strategy

1. **Curate offline first, in a spreadsheet or a scratch JSON/YAML file
   outside the repo's runtime path**, not directly in `seed_taxonomy.py`.
   Columns: proposed category, subcategory, skill name, English aliases,
   Romanized Nepali aliases, source(s) consulted, and a one-line
   provenance note (e.g., "ESCO essential skill for Domestic electrician,
   phrase simplified"). This curation file is the actual deliverable of
   the *next* phase (§13), not this audit.
2. **No automated bulk import from any source's API/CSV directly into
   `SkillTag`/`SkillAlias`.** Every row is human-reviewed before entering
   the seed data, both for licensing hygiene (§3) and for the
   deduplication/safety rules in §9 — a script can *propose* candidate
   rows (e.g., "ESCO essential skills for occupation X"), but a person
   decides what's added.
3. **Seed via an updated, still-idempotent `seed_taxonomy.py`**, using the
   same `get_or_create`-by-case-insensitive-name pattern already in place
   — new categories/subcategories/skills are added; nothing already
   seeded is renamed or deleted by the same mechanism that seeds it.
4. **Version the curation file, not just the resulting seed command.**
   When ESCO or O\*NET publish a new release (ESCO is currently v1.2; new
   minor versions land periodically), re-run the curation review rather
   than auto-syncing — these are occupation standards that change slowly,
   and Workforce Matching's matching is a curated table, not a live sync target.
5. **CTEVT/NSTB content is read, never scraped/stored in bulk.** Given
   the unresolved license (§3), the practical workflow is: a person
   reads the relevant NOSS/trade list, writes down trade and skill
   *names* in the curation file with a citation URL, and does not copy
   NOSS body text into the repository.

## 9. Deduplication rules

1. **Canonical uniqueness stays subcategory-scoped in the schema** (as
   today), but curation must additionally check for **near-duplicate
   concepts across subcategories** before adding a row — e.g., don't
   create "Floor Cleaning" separately under both "House Cleaning" and
   "Hotel Housekeeping" if they mean the same task; put it under the one
   best-fit subcategory and let workers under other trades still add it
   via free text (it will match by name/alias regardless of which
   subcategory it lives under — subcategory is a grouping/browse
   convenience, not a matching constraint).
2. **`SkillAlias.phrase` is globally unique** (existing constraint) —
   curation must dedupe every candidate alias against the *entire*
   existing corpus, not just the skill being added. When a natural
   colloquial term is genuinely ambiguous between two skills (e.g. a
   generic "driving" could mean two-wheeler or car), prefer a more
   specific phrase for each ("motorbike driving" / "car driving") rather
   than letting one skill claim the ambiguous generic term.
3. **Exclude overly broad / soft skills.** No "Manual Labor," "Hard
   Worker," "Team Player," "Good Communication," or similarly generic
   entries — reject ESCO's transversal-skill tier and O\*NET's generic
   Skills domain (Critical Thinking, Active Listening, etc.) from
   `SkillTag`. Workforce Matching's required-skill coverage math (Week 4) needs
   specific, checkable hard skills; broad skills would trivially inflate
   every worker's and job's coverage score and make the matching
   meaningless.
4. **Exclude irrelevant/non-local skills.** Drop source skills tied to
   tools, software, or certifications that don't exist or aren't
   practically relevant in Nepal's informal blue-collar economy (e.g.
   AutoCAD, US CDL classes, enterprise ERP software) unless a Nepali
   equivalent genuinely applies.
5. **Screen for unsafe/unlicensed-trade implications.** Any candidate
   skill implying regulated, hazardous, or licensed work (e.g.
   high-voltage electrical work, gas-line work, structural work) should
   be phrased at a level consistent with supervised/certified trade
   practice, not phrased in a way that could read as inviting
   unqualified/unsafe self-certification. This is a light editorial
   guardrail for curation, not a new schema field or workflow.
6. **One occurrence per genuine skill, ever** — if the same skill would
   logically belong to two subcategories, that's a signal the
   subcategory boundaries need adjusting, not that the skill should be
   duplicated as two rows.

## 10. Impact on existing models and APIs

**Schema: no migration required for v1.** `Category`, `Subcategory`,
`SkillTag`, and `SkillAlias` as they exist today are structurally
sufficient to hold the proposed 12/54/~340 taxonomy — this is purely more
rows of the same shape, not a new shape.

**Source identifiers: deliberately deferred, not added now.** It would be
useful, eventually, to record provenance on `SkillTag`/`Subcategory` (e.g.
a nullable `source` choice field and a nullable `source_identifier`
string for an ESCO URI or O\*NET-SOC code) so a future re-sync against an
updated ESCO/O\*NET release could match existing rows automatically. This
audit recommends **not** adding those fields in this phase — no migration
is being created per the task's own scope, and adding speculative fields
before the curation data exists would violate engineering rule #7 (keep
business logic/data model additions tied to actual, current need). If a
future phase wants automated re-sync, propose the fields then, alongside
that concrete need.

**APIs: no contract change needed.** `/api/taxonomy/categories/`,
`/subcategories/`, `/skills/`, `/tree/` all already return exactly `id`/
`name`(/`subcategory`/`category`) with no pagination — more rows flow
through the same shape. The one thing worth flagging to the frontend team
(no code changed here, just noting for later): 54 subcategories across 12
categories is still small enough for a plain `<select>`, and ~340 skills
is irrelevant to the UI since skill entry is free-text with server-side
normalization, not a rendered list.

**`WorkerProfile.skills` / `JobPost.required_skills` / `preferred_skills`
(M2M to `SkillTag`):** purely additive — new `SkillTag` rows don't affect
any existing FK/M2M row. No existing worker or job loses or gains a skill
association just because the corpus grows.

**Recommendation engine (`recommendations/`):** the binary skill-vector
scoring is keyed by which `SkillTag` rows a worker/job actually has, not
by the total corpus size. Adding more skills doesn't change any existing
score, since existing workers/jobs simply don't reference the new rows
until someone chooses them. The one indirect effect worth testing (§11):
a larger alias/name corpus gives RapidFuzz more candidates to fuzzy-match
against, which could very rarely change which candidate an *ambiguous*
free-text phrase resolves to — this is a fuzzy-matching regression risk,
not a recommendation-scoring risk.

**`seed_demo.py`:** this is the **one place with a hard dependency** on
today's exact category/subcategory names — it calls
`Category.objects.get(name="Construction & Repair")` and
`Subcategory.objects.get(category=..., name="Electrical")` (etc., twice,
for jobs and workers). Everything else that touches taxonomy in tests
(`recommendations/tests.py`, `profiles/tests.py`, `applications/tests.py`,
`jobs/tests.py`, `taxonomy/tests.py`) **builds its own isolated
`Category`/`Subcategory`/`SkillTag` fixtures in `setUp()`** rather than
depending on `seed_taxonomy.py`'s output — confirmed by inspection, not
assumption. So: as long as v1 of the new taxonomy is **additive** (keeps
the existing `Construction & Repair` → Electrical/Plumbing/Masonry and
`Domestic & Local Services` → Cleaning/Cooking names and skills exactly as
they are today, and adds the other 10 categories alongside them rather
than restructuring the first 2), `seed_demo.py` needs zero changes and
every existing test keeps passing untouched.

**If a future phase instead wants the "clean" 12-category structure in
§5 literally** — i.e. splitting today's `Construction & Repair` into
separate `Construction & Repair (general)` / `Electrical Work` /
`Plumbing` / `Painting & Masonry` categories, re-parenting its existing
subcategories/skills — that is a **breaking, data-migration-requiring
change**: existing `Subcategory`/`SkillTag` rows would need to be
re-pointed at new `Category` rows (via a data migration, preserving
their IDs so `WorkerProfile.skills`/`JobPost.required_skills` FKs never
break), and `seed_demo.py`'s two `Category.objects.get(name=...)` calls
would need updating in the same change. This is flagged as a deferred,
separately-planned migration in §12 — not something to do incidentally
while adding the other 10 categories.

## 11. Testing strategy

1. **Unit tests for any new/changed `seed_taxonomy.py` content**, mirroring
   the existing pattern in `taxonomy/tests.py`
   (`SeedTaxonomyCaseInsensitiveReuseTests`): re-running the seed command
   twice must not create duplicates, and case-insensitive reuse must hold
   for every new category/subcategory/skill.
2. **Alias collision test** — before merging any curated batch, run a
   script/test asserting no two proposed `SkillAlias.phrase` values
   collide with each other or with the existing corpus (the DB unique
   constraint would catch it at seed time, but a pre-merge check gives a
   readable diff instead of an `IntegrityError`).
3. **Fuzzy-match regression suite** — extend
   `NormalizeSkillPhraseTests` with cases built from the *final* larger
   corpus: known-good exact/alias matches must still resolve correctly,
   and a sample of intentionally ambiguous or nonsense phrases must still
   land as `unmatched` rather than being pulled into an unrelated match
   now that there are more candidates. This directly tests the
   fuzzy-matching risk noted in §10.
4. **Public API tests** (extend `TaxonomyPublicAPITests`) — re-run the
   existing alphabetical-ordering, filtering, and "no admin fields leak"
   assertions against the larger dataset; add an assertion on response
   size/shape staying bounded (still 3 queries for `/tree/`, per the
   existing `assertNumQueries(3)` test, regardless of corpus size — that
   test's Prefetch-based query plan should hold, but re-verify explicitly
   once the tree has ~340 skills instead of ~20).
5. **`seed_demo` regression** — re-run `seed_demo` end-to-end after any
   taxonomy change and confirm the existing demo accounts/jobs/
   applications/ratings still seed correctly (this is already how
   `seed_demo.py` is designed to be validated — idempotent, safe to
   rerun).
6. **Recommendation engine regression** — re-run
   `recommendations/tests.py` unchanged; since its fixtures are
   self-contained (§10), this mainly guards against an accidental
   shared-state or ordering assumption rather than a taxonomy-content
   assumption, but it's a cheap, high-value check to include in the same
   pass.

## 12. Risks and deferred scope

- **CTEVT/NSTB licensing is unresolved.** No open-data terms were found;
  treat as all-rights-reserved. Risk: using their content beyond
  trade-name inspiration without legal review. Mitigation: §3/§8's rule
  of never copying NOSS text verbatim; get explicit sign-off before any
  deeper use.
- **Occupation-count conflicts in CTEVT's own materials** (237 vs.
  304–311 across their own pages) — there is no single canonical current
  list to cross-check against; curation should treat individual NOSS/
  test-schedule documents as the source of truth for specific trade
  names, not any summary count.
- **ISCO-08's CC BY 4.0 status is not confirmed retroactive** to the 2012
  Vol. 1 document — treat it under the older "cite the source, don't
  reproduce full text" rule until/unless ILO explicitly confirms
  otherwise.
- **Restructuring the existing 2 categories into the "clean" 12-category
  shape (§5) is a breaking change**, deferred out of this phase (§10).
  Doing it later requires a data migration (re-parent, not
  delete-and-recreate) plus a `seed_demo.py` update, and should be its
  own reviewed change, not bundled with additive taxonomy growth.
- **Nepal-specific gig/informal trades have no standard anywhere.**
  Two-wheeler delivery, event/temporary staffing, and general laborer
  ("majdur") work are thinly or not covered by any of the four sources
  (confirmed absent from CTEVT/NSTB's occupation lists; ESCO/O\*NET have
  no Nepal-relevant equivalents either). These subcategories (§5 #7, #12)
  will be **locally authored from scratch**, validated only by common
  sense and, ideally, a review pass with someone familiar with Nepal's
  informal labor market — not traceable to a primary source. Flag this
  explicitly wherever the taxonomy is documented, so it isn't mistaken
  for sourced content later.
- **Fuzzy-match precision at scale is unverified** until the larger
  corpus actually exists — §11's regression suite is the mitigation, but
  until it's run, treat "will RapidFuzz still behave well at ~340 skills
  vs. ~20" as an open question, not a settled one.
- **Full ESCO/O\*NET dataset download and detailed per-skill sourcing was
  intentionally not done in this phase** (task scope: audit only). The
  next phase (§13) is where specific skill lists get pulled and reviewed
  occupation-by-occupation.
- **Source-identifier fields were considered and deliberately deferred**
  (§10) — revisit only if a concrete re-sync need arises.

## 13. Implementation plan for the next step

This is a precise, sequenced plan for the phase *after* this audit —
still no code in this phase, listed here so the next phase has a clear
starting point:

1. **Build the curation spreadsheet/file** (outside the Django app) for
   all 12 categories × 54 subcategories from §5, using the source
   hierarchy in §2: pull ESCO essential skills per matched occupation,
   supplement with O\*NET task-derived phrasing where thin, validate
   trade names against CTEVT/NSTB, and apply the dedup/exclusion rules in
   §9 as each row is added. Target ~340 skills, prioritizing the
   categories most likely to be used first (Construction & Repair,
   Electrical, Plumbing, Cleaning, Hospitality, Driving — the trades
   already implied by the existing demo data and most likely to have
   real early users).
2. **Author English + Romanized Nepali aliases** for at least the
   highest-priority skills identified in that pass (§7's priority order),
   reviewed by someone with Nepali fluency for naturalness — not just
   direct English transliteration.
3. **Write the curated content into an updated `seed_taxonomy.py`**,
   additive-only (§10): keep every existing category/subcategory/skill/
   alias name exactly as-is, add the other 10 categories and their
   subcategories/skills/aliases alongside them.
4. **Extend `taxonomy/tests.py`** per §11 (idempotency, alias-collision,
   fuzzy-match regression, public-API shape) before considering the
   change done.
5. **Run the full existing test suite** (`applications`, `jobs`,
   `profiles`, `recommendations`, `taxonomy`) to confirm the "additive
   only, `seed_demo` untouched" assumption in §10 actually holds, not
   just in theory.
6. **Run `seed_demo` and manually spot-check** the taxonomy tree via
   `/api/taxonomy/tree/` and the frontend's category/subcategory
   dropdowns and skill free-text entry, to confirm the larger corpus is
   still usable end-to-end (per `docs/FRONTEND_CONTEXT.md` §7's
   `skill_input` flow).
7. **Only after that lands and is stable**, separately propose (as its
   own reviewed change, not bundled in) whether to pursue the "clean"
   12-category restructuring of the original 2 categories (§10's
   breaking-change path) and/or the deferred `source`/`source_identifier`
   fields (§10) — both explicitly out of scope for step 1–6.

## Sources consulted

**CTEVT / NSTB**
- https://ctevt.org.np/introduction
- https://ctevt.org.np/nstb
- https://www.nstb.org.np/
- https://nvqs.org.np/ and https://nvqs.org.np/introduction
- https://www.nstb.org.np/wp-content/uploads/2025/09/Revised-test-schedule-20820531-1.pdf
- https://www.nstb.org.np/wp-content/uploads/2018/12/Library-AssistantNOSS-L-2-Final-FEB-07.pdf
- https://www.collegenp.com/news/ctevt-nstb-call-skill-test-application-form-notice-2082 (secondary, trade-name cross-check only)

**ESCO**
- https://esco.ec.europa.eu/en/about-esco/what-esco
- https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/occupations-pillar
- https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/international-standard-classification-occupations-isco
- https://esco.ec.europa.eu/en/classification/skill_main
- https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/skill-reusability-level
- https://esco.ec.europa.eu/en/about-esco/faq
- https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/esco-v12
- https://esco.ec.europa.eu/en/use-esco/download
- https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/esco-api
- https://ec.europa.eu/esco/api (live REST API)
- https://esco.ec.europa.eu/en/copyright-notice-esco-skills-competences
- https://esco.ec.europa.eu/en/about-esco/escopedia/escopedia/esco-languages

**O\*NET**
- https://www.onetcenter.org/overview.html
- https://www.onetcenter.org/content.html
- https://www.onetcenter.org/database.html
- https://www.onetcenter.org/license_db.html
- https://services.onetcenter.org/about
- https://www.onetcenter.org/taxonomy.html
- Occupation summaries (onetonline.org/link/summary/): 47-2111.00, 47-2152.00, 47-2021.00, 37-2011.00, 35-2014.00, 53-3032.00, 33-9032.00, 31-1121.00, 41-2031.00, 43-9061.00

**ISCO-08 / ILO**
- https://webapps.ilo.org/ilostat-files/ISCO/newdocs-08-2021/ISCO-08/ISCO-08%20EN%20Vol%201.pdf
- https://webapps.ilo.org/ilostat-files/ISCO/newdocs-08-2021/ISCO-08/ISCO-08%20EN%20Structure%20and%20definitions.xlsx
- https://isco.ilo.org/en/isco-08
- https://www.ilo.org/rights-and-permissions
- https://microdata.nsonepal.gov.np/index.php/catalog/2/download/10 (Nepal NSCO, Annex D)

**Project context (this repository)**
- `backend/taxonomy/models.py`, `services.py`, `serializers.py`,
  `views.py`, `urls.py`, `admin.py`, `tests.py`
- `backend/taxonomy/management/commands/seed_taxonomy.py`
- `backend/accounts/management/commands/seed_demo.py`
- `docs/IMPLEMENTATION_PLAN.md`, `docs/DEFERRED_SCOPE.md`,
  `docs/FRONTEND_CONTEXT.md`
- `README.md`
