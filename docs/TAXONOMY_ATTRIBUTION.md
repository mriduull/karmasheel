# Taxonomy Attribution — Karmasheel Standardized Skill Taxonomy v1

This document states, precisely, where the ideas behind Karmasheel's v1
skill taxonomy (`backend/taxonomy/data/taxonomy_v1.json`) came from, and
what it does and does not claim. It accompanies
[`docs/TAXONOMY_SOURCE_AUDIT.md`](TAXONOMY_SOURCE_AUDIT.md), which has the
full source comparison, licensing analysis, and design rationale — this
document is the shorter, canonical attribution statement.

## What this taxonomy is

**The Karmasheel taxonomy is a locally curated and adapted project
dataset**, authored specifically for this platform's blue-collar and
local-service worker/employer matching use case in Nepal. It is **not** a
direct export, copy, or complete reproduction of any single official
classification. Every category, subcategory, canonical skill name, and
alias in `taxonomy_v1.json` was written or selected by hand for this
project, informed by — but not mechanically generated from — the four
sources below.

## How each source informed the design

- **ISCO-08** (ILO's International Standard Classification of
  Occupations) informed the **broad occupational organization** — the
  general idea that categories should map to recognizable occupational
  groupings (trades/craft work, elementary/service work, personal-care
  and protective-service work, etc.), the way Nepal's own ISCO-derived
  National Standard Classification of Occupations does. No ISCO unit
  group codes, definitions, or structure tables were imported wholesale;
  only the organizing concept was used.
- **ESCO** (the EU's occupations and skills classification) informed
  **standardized skill concepts** — for each target trade, ESCO's
  essential-skill lists for the closest matching occupation(s) were used
  as a starting reference point for what a complete, practical skill set
  for that trade should look like. Skill *names* in this taxonomy were
  independently written in Karmasheel's own naming style (concise,
  Title-Case English phrases matching the existing Week 2 convention),
  not copy-pasted from ESCO's own skill labels.
- **O\*NET** (the US Department of Labor's occupational database)
  informed **selected task-oriented phrasing** — where a trade's
  practical, concrete activities needed clearer wording than an abstract
  skill concept alone would give, O\*NET's Task and Tools & Technology
  statements for the nearest O\*NET-SOC occupation were used as
  inspiration for how to phrase a specific, checkable skill.
- **CTEVT / NSTB** (Nepal's Council for Technical Education and
  Vocational Training / National Skill Testing Board) was used **only as
  a Nepal-context validation and naming reference** — to check that
  occupation and trade names in this taxonomy would be recognizable to a
  Nepali worker or employer, and to identify Nepal-specific trades (e.g.
  barbering, tailoring, caregiving) that the other three sources don't
  cover well. **No CTEVT/NSTB document text (National Occupational Skill
  Standard content, competency units, performance criteria, etc.) was
  copied into this taxonomy.** Their site publishes no explicit reuse
  license (see Licensing notes below), so only short, factual trade
  *names* were used as a naming checklist — nothing was reproduced from
  their PDFs.

## What is genuinely locally authored, with no direct source correspondence

Several categories/subcategories cover Nepal-relevant informal and gig
work that **none of the four sources address directly** — most notably
parts of **Driving & Delivery** (two-wheeler food/parcel delivery) and
**Event & Temporary Work** (event setup, ushering, general event labor).
These were authored from first-hand knowledge of how this work is
actually organized, not derived from ISCO/ESCO/O\*NET/CTEVT content. They
are flagged here explicitly so they are never mistaken for sourced
content later.

## English and Romanized Nepali aliases

**All English synonym aliases and all Romanized Nepali aliases in this
taxonomy were authored locally by the Karmasheel project**, following the
same style as the original Week 2 taxonomy (e.g. "ghar wiring" → "House
Wiring"). None of the four researched sources provide Nepali-language or
Romanized-Nepali content — ESCO covers 28 languages, none of them
Nepali; O\*NET and ISCO-08 are English-only; CTEVT/NSTB's trade names
appear in English and Nepali script on their own sites, not as a
Romanized-Nepali alias table usable here. The Romanized Nepali aliases in
this dataset are a good-faith, project-authored effort and — per
`docs/TAXONOMY_SOURCE_AUDIT.md` §13 — should still get a native-fluency
review pass before being treated as final/polished; they have not yet had
that review.

## No claim of complete or verbatim source reproduction

To be explicit about the boundary of this document's claims:

- This taxonomy does **not** claim to be a complete or official ISCO-08,
  ESCO, O\*NET, or CTEVT/NSTB dataset, or a subset selected by any
  official process from one of them.
- No individual taxonomy entry should be assumed to trace to a specific
  official source record unless this document or
  `docs/TAXONOMY_SOURCE_AUDIT.md` says so explicitly. The general
  provenance described above (ISCO → structure, ESCO → skill concepts,
  O\*NET → task phrasing, CTEVT/NSTB → Nepal-context naming, aliases →
  authored locally) describes the *overall design process*, not a
  per-entry citation trail.
- Where this document says a source "informed" part of the design, that
  means the source was consulted and adapted from, not imported.

## Licensing and attribution notes (source-by-source)

Full detail in `docs/TAXONOMY_SOURCE_AUDIT.md` §3; summarized here:

- **ESCO** — Creative Commons Attribution 4.0 International (CC BY 4.0).
  Attribution: *"Includes information from ESCO (European Commission),
  used under CC BY 4.0."* Free reuse and adaptation, including
  commercial use, with attribution.
- **O\*NET** — CC BY 4.0 on the O\*NET database. Required attribution
  wording: *"This [page/product] includes information from the O\*NET
  30.3 Database by the U.S. Department of Labor, Employment and Training
  Administration (USDOL/ETA). Used under the CC BY 4.0 license."*
  "O\*NET" must be used as an adjective, never as a standalone product
  name (O\*NET® is a USDOL/ETA trademark).
- **ISCO-08** — ILO copyright; short excerpts (e.g. group titles) may be
  reproduced with the source cited, full reproduction of ILO's
  definitional text requires permission from ILO Publications. This
  taxonomy only used short group-title-level structural concepts, not
  reproduced definitional text.
- **CTEVT / NSTB** — No explicit open-data or reuse license found on
  ctevt.org.np, nstb.org.np, or nvqs.org.np (footers state "All Rights
  Reserved"). Treated conservatively throughout: used only for trade
  *names* as a naming/validation reference, never for reproducing NOSS
  document text. Any deeper future use of CTEVT/NSTB content (e.g.
  importing full competency-unit text) should get explicit legal review
  first — this taxonomy does not do that.

## Attribution for this document itself

Written as part of Karmasheel's taxonomy v1 implementation, alongside
`backend/taxonomy/data/taxonomy_v1.json` and the extended
`python manage.py seed_taxonomy` loader. See
`docs/TAXONOMY_SOURCE_AUDIT.md` for the full research trail, including
every source URL consulted.
