# Karmasheel Design Constitution

**Status:** Permanent product and frontend design authority.
**Scope:** Public website, worker interface, employer interface, responsive layouts, reusable components, and interactive states.
**Precedence:** This document governs all future visual and UX redesign work. Where it conflicts with an ad-hoc decision made during implementation, this document wins unless a deliberate, documented deviation is recorded (see §57).

This is not a style guide alone — it defines *why* Karmasheel looks and behaves the way it does, so that future design and engineering decisions (human or AI-driven) stay coherent without needing to re-litigate first principles every time.

---

## Table of Contents

- Part I — Foundation: §1 Purpose · §2 Product Identity · §3 Internal Design Concept · §4 Core Product Narrative
- Part II — UX Philosophy & Information Architecture: §5 Primary UX Principle · §6 Worker Experience Model · §7 Worker IA · §8 Employer Experience Model · §9 Employer IA
- Part III — Signature Visual Concept: §10 Matchline
- Part IV — Explainability & Scoring: §11 Explainability · §12 Match Score · §13 Match vs. Mutual Fit · §14 Opportunity Advisor Identity
- Part V — Color System: §15 Prototype Palette · §16 Semantic Colors
- Part VI — Typography: §17 Typefaces · §18 Type Hierarchy
- Part VII — Layout Foundations: §19 Spacing · §20 Radius · §21 Shadows/Elevation · §22 Surface Philosophy · §23 Card Architecture
- Part VIII — Core Components: §24 Job Card · §25 Recommendation Card · §26 Worker Card · §27 Skills · §28 Buttons · §29 One Primary Action · §30 Forms · §31 Required/Preferred Skills · §32 Application Status · §33 Trust & Verification
- Part IX — Navigation: §34 Navigation Philosophy
- Part X — Responsive & Touch: §35 Responsive Philosophy · §36 Touch Interaction
- Part XI — Interactivity & Motion: §37 Interactivity · §38 Motion · §39 Motion Anti-Patterns
- Part XII — Public vs. Application UI: §40 Two Intensities · §41 Landing-Page Direction · §42 Photography & Imagery
- Part XIII — Density & System States: §43 Employer Density · §44 Loading States · §45 Empty States · §46 Error States
- Part XIV — Icons & Accessibility: §47 Icons · §48 Accessibility
- Part XV — Guardrails: §49 Anti-Pattern Blacklist
- Part XVI — System Philosophy: §50 Component-System Philosophy · §51 Relationship to Existing Architecture · §52 High-Risk Product Semantics
- Part XVII — Synthesis: §53 Interaction Triangle · §54 Definition of a Successful Screen · §55 Final Design Principle
- **Part XVIII — §56 Repository-Grounded Engineering Constraints**
- **Part XIX — §57 Implementation Guardrails for AI Coding Agents**

---

## Part I — Foundation

### §1. Purpose

This document defines the permanent product-design and frontend-design direction for Karmasheel. It must guide future redesign work across the public website, worker interface, employer interface, responsive layouts, reusable components, and interactive states.

The objective is not merely to make Karmasheel visually attractive. The frontend must become: modern, highly polished, interactive, trustworthy, human, practical, local, clearly workforce-oriented, and visually distinctive without becoming experimental at the expense of usability.

Karmasheel should feel comparable in quality to mature international workforce platforms while maintaining its own identity. International products such as Instawork, Wonolo, WorkWhile, and Qwick may be used as **category references** for interaction quality, workforce-specific information hierarchy, worker profiles, hiring workflows, trust signals, and operational UX. **Their branding, layouts, component styling, typography, visual identity, or page compositions must not be copied.**

### §2. Product Identity

Karmasheel is: *a modern, human workforce utility for finding suitable local work and suitable local workers through transparent matching.*

Five core personality traits: **Practical, Trustworthy, Approachable, Active, Local.**

Intended emotional combination: *reliable enough for employers, simple enough for workers, modern enough to feel credible, and fast enough for practical local employment.*

Karmasheel must **not** resemble: a generic corporate recruitment portal, enterprise HR software, a government portal, a generic SaaS dashboard, an AI startup landing page, or "LinkedIn with different colors."

### §3. Internal Design Concept

Internal direction: **Modern Human Utility.**

The interface should combine modern product-design quality, real workforce context, warm human presentation, strong information hierarchy, clear actions, meaningful interactivity, restrained visual styling, and transparent data presentation.

The product must remain recognizable as a workforce-matching platform. Uniqueness should come from Karmasheel's own product concepts rather than unusual decoration.

### §4. Core Product Narrative

Karmasheel revolves around three concepts: **WORK → MATCH → OPPORTUNITY**

- **Work** — the immediate employment marketplace: jobs, workers, applications, hiring, availability, work requirements.
- **Match** — the compatibility between a worker and a job: required/preferred skills, location and distance, availability, experience, work preferences, reliability, verification, reciprocal compatibility.
- **Opportunity** — what may become possible next: near-miss jobs, missing skills, skill improvement, additional nearby opportunities.

These three concepts should make the platform feel like one coherent system rather than a collection of independent modules.

---

## Part II — UX Philosophy & Information Architecture

### §5. Primary UX Principle

**Never expose technical architecture when a simpler user concept exists.** Frontend routes, backend models, and API endpoints do not determine the user-facing information architecture.

- Workers: instead of treating "Browse Jobs" and "Recommendations" as unrelated concepts, the product may present **Jobs → Recommended for You / Browse All**.
- Employers: instead of independently navigating "Job Detail," "Recommendations," "Applications," and "Candidate Pool" as separate technical modules, the interface should organize them around **Manage Hiring**.

The UX should reflect how users think about work, not how the software is internally divided.

### §6. Worker Experience Model

Primary worker journey: **FIND → UNDERSTAND → APPLY → TRACK → IMPROVE**

- **Find** — what suitable work is available?
- **Understand** — why is this job relevant to me?
- **Apply** — do I want to pursue it?
- **Track** — what is happening with my application?
- **Improve** — what could help me qualify for more opportunities?

The worker interface should prioritize simplicity, scanning, touch accessibility, and clear next actions.

### §7. Worker Information Architecture

Preferred conceptual hierarchy:

- **Home** — shows what deserves the worker's attention *now*: recommended work, active application progress, opportunity-advisory preview, profile readiness. Home must not merely be a directory of equally-weighted shortcut tiles.
- **Jobs** — conceptually contains **Recommended for You** and **Browse All**. Recommendations should feel integrated into job discovery, not like an unrelated technical feature.
- **Applications** — focus on current application state, what happened, what may happen next, and available actions.
- **Opportunities** — missing-skill suggestions, near-miss jobs, practical explanations of what could unlock additional opportunities.
- **Account / More** — secondary utilities: Profile, CV, Ratings, account actions. CV and Ratings should not compete visually with Jobs or Applications for primary navigation importance.

### §8. Employer Experience Model

Employer journey: **NEED → POST → DISCOVER → COMPARE → ACT → COMPLETE → REHIRE**

- **Need** — the employer needs workers. **Post** — describes the requirement. **Discover** — Karmasheel identifies suitable workers. **Compare** — reviews skills, distance, experience, availability, reliability, fit. **Act** — shortlists, contacts, or hires. **Complete** — the work outcome is recorded. **Rehire** — reliable workers may be reused where supported.

The employer interface may have slightly greater information density than the worker interface because employers need to compare multiple candidates and hiring states.

### §9. Employer Information Architecture

**The job is the main organizing object** for employer activity.

- **Home** — verification state, current hiring, active jobs, useful next actions.
- **Jobs** — active and previous job requirements. Each active job becomes a hiring workspace.
- **Manage Hiring** (inside a job) — Overview, Recommended Workers, Applicants, Other Suitable Workers / Candidate Pool. **Candidate and Applicant must remain conceptually distinct** — they represent different backend entities.
- **Post a Job** — normally a prominent action, not a permanent navigation category.
- **Account / More** — Employer Profile, Verification, Ratings, account actions.

Worker discovery should normally remain contextual to a job unless a future product requirement justifies global worker discovery.

---

## Part III — Signature Visual Concept

### §10. Matchline

Karmasheel's distinctive visual motif, internally named **Matchline**, represents two sides resolving into a transparent match:

`Worker ← compatibility factors → Job`

Factors: Skills, Distance, Availability, Experience, Preferences, Reliability.

Matchline may influence: the public landing-page hero, recommendation cards, recommendation details, candidate comparison, match breakdowns, matched/missing skill states, and opportunity-advisory surfaces.

**It must not become a decorative network diagram repeated everywhere.** The motif should be recognizable but restrained.

---

## Part IV — Explainability & Scoring

### §11. Explainability Is a Core Product Requirement

Recommendation scores must never appear without meaningful explanation when explanation data exists.

Do not present only: `87% Match`

Prefer:
```
87% Match
Matches 4 of 5 required skills
2.4 km away
Available on the required date
Relevant experience
```

The percentage is a summary. The explanation is what creates trust.

Recommendation presentation must preserve the semantic distinction between: **ranking score, match reasons, warnings, mutual fit, verification, ratings.** These concepts must never be visually or semantically conflated.

### §12. Match Score

Two visual levels may exist:

- **Compact Match Score** — suitable for cards (e.g. `87% Match`). It should remain clearly secondary to the job or worker identity.
- **Detailed Match Breakdown** — suitable for detailed recommendation surfaces; may visually explain skill fit, distance, experience, availability, preferences — **but only when those values are actually provided or legitimately represented by the backend.** Do not invent sub-scores client-side merely to make the UI more impressive.

### §13. Match Versus Mutual Fit

Match Score and Mutual Fit are different product concepts and must remain visually distinct.

Recommended conceptual semantics: **Match Score → orange / primary matching identity. Mutual Fit → teal / reciprocal-compatibility identity.**

The interface must not imply that Mutual Fit is merely another label for the overall match score.

### §14. Opportunity Advisor Identity

Opportunity advice must feel visually related to recommendations but conceptually different:

- **Orange** — "this fits you now."
- **Teal** — "this could fit you next."

Opportunity-advisory language should be encouraging and practical. Avoid: *"You lack Fault Diagnosis."* Prefer: *"Add Fault Diagnosis — this skill appears in several electrical jobs that are otherwise strong matches for your profile."*

Near-miss jobs should communicate "you are already close," never failure.

---

## Part V — Color System

### §15. Prototype Color System

The existing warm visual identity should **evolve**, not be replaced with generic blue/purple technology branding.

**Foundations**
| Token | Value | Purpose |
|---|---|---|
| Canvas | `#F7F6F2` | Warm page background |
| Surface | `#FFFFFF` | Cards, forms, important panels |
| Surface Subtle | ≈`#F1EFE9` | Secondary groupings, quiet surfaces |
| Ink | `#17211F` | Primary text and headings |
| Muted | `#68706C` | Secondary text |
| Border | ≈`#E3E1DA` | Default component borders/separators |

**Brand Primary — Work Orange** (work, action, primary CTA, active recommendation, active product state)
| Token | Value |
|---|---|
| Primary | ≈`#C2410C` |
| Primary Hover | ≈`#9A3412` |
| Accent | ≈`#F06A3C` |

**Brand Secondary — Opportunity Teal** (trust, opportunity, growth, reciprocal compatibility, selected secondary emphasis)
| Token | Value |
|---|---|
| Secondary | ≈`#0F766E` |
| Secondary Hover | ≈`#115E59` |

Exact hex values may be adjusted during prototype testing for visual balance and accessibility. **The semantic relationship between colors must remain more important than preserving a specific hex value.**

### §16. Semantic Colors

Brand colors and semantic status colors are separate concepts:

- **Green** — verified, completed, successful, confirmed.
- **Amber** — pending, attention, near-miss/caution states where appropriate.
- **Red** — rejection, error, dangerous/destructive actions.
- **Gray** — closed, inactive, neutral states.

**Never communicate state using color alone.** Use color + label, color + icon, or color + supporting text.

---

## Part VI — Typography

### §17. Typefaces

- **Application UI**: continue using **Inter** unless an explicit later design decision changes it. Appropriate for forms, dashboards, job cards, worker cards, recommendations, employer interfaces, filtering, and data-heavy product screens. Readability and clarity take priority over visual novelty inside the application.
- **Public Website**: a more distinctive display typeface may be explored for hero headings, major marketing statements, and large public-page titles.
- **Maximum two font families** across the entire product. Do not introduce multiple decorative fonts.

### §18. Typography Hierarchy

| Level | Size | Weight |
|---|---|---|
| Page title | 28–34 px | Strong |
| Section title | 20–24 px | Semibold |
| Card title | 16–18 px | Semibold |
| Body | 16 px | Regular |
| Supporting text | 14 px | Regular |
| Metadata | 12–14 px | Only when truly secondary |

Important information — wage, distance, availability, application status — **must not** be rendered as tiny, low-contrast text.

---

## Part VII — Layout Foundations

### §19. Spacing System

Preserve the existing systematic spacing philosophy. Preferred scale (px): **4, 8, 12, 16, 24, 32, 48, 64.**

New arbitrary spacing values should not be introduced when existing tokens can solve the layout. Whitespace should improve hierarchy, not create oversized, empty SaaS layouts.

Worker interfaces should generally use **medium-light density**; employer interfaces may use **medium density**.

### §20. Radius

Use moderate rounding:

| Element | Radius |
|---|---|
| Small controls | 8 px |
| Inputs | 8–10 px |
| Buttons | 8–10 px |
| Cards | 12 px |
| Large surfaces | up to ≈16 px |

Pill shapes are reserved for things that are semantically chips, tags, statuses, or compact selectors. Do not make every element excessively rounded.

### §21. Shadows and Elevation

Shadows should be restrained. A standard card should generally use clear surface separation, a subtle border, and minimal resting shadow. Desktop hover may introduce a slightly stronger border/shadow and ≈1–2 px vertical movement.

Avoid: huge diffuse shadows, dramatic card scaling, floating every interface element above the page.

Dialogs and dropdowns may use stronger elevation because they actually float above content.

### §22. Surface Philosophy

Not every section should be inside a card. Cards are appropriate for meaningful independent objects: jobs, workers, applications, recommendations, opportunities, independently actionable groups.

Simple page headings, explanatory text, and section headings should often use open layout, whitespace, and dividers rather than unnecessary containers.

### §23. Card Architecture

A generic `Card` primitive may eventually provide background, border, radius, standard spacing, and common hover/elevation behavior — **but domain components must remain separate.**

Examples: `JobCard`, `EmployerJobCard`, `CandidateCard`, `ApplicantCard`, `ApplicationCard`, `RecommendationCard`. They share a visual shell but represent different product concepts and backend data contracts. **Do not combine them into one overly generic component merely because they look similar.**

---

## Part VIII — Core Components

### §24. Job Card

A normal job card should prioritize: job title, employer identity and verification (where available), location and distance, timing, wage, relevant skill preview, and a clear next action.

A normal browse-result card **must not** display recommendation semantics unless recommendation data actually exists.

### §25. Recommendation Card

Recommendation surfaces should have a recognizable Matchline treatment, surfacing: recommendation state, job or worker identity, overall match score, practical work information, match reasons, warnings/missing requirements (when available), relevant mutual-fit information, and an action.

The visual design may change substantially. **The underlying recommendation semantics must not.**

A thin, restrained accent may distinguish a recommendation card from an ordinary browse card. Do not use giant colored panels, glowing borders, or excessive visual effects.

### §26. Worker Card

A worker card should quickly answer: Who is this worker? What type of work do they do? Can they perform this work? Are they available? Are they geographically practical? What experience do they have? What trust signals exist?

Possible hierarchy: name → category/role → verification → experience → distance/location → availability → important skills → rating/completed work (where available) → recommendation score only where recommendation context exists.

A worker profile should feel like a professional work identity, not an academic résumé compressed into a card.

### §27. Skills

Support clear semantic states:

- Normal: `House Wiring`
- Matched: `✓ House Wiring`
- Missing: `△ Fault Diagnosis`

Required and preferred skills must remain distinguishable where that distinction matters. Do not create excessive chip colors. Tooltip/tap/supporting text may clarify matched-required, missing-required, and matched-preferred states.

### §28. Buttons

Button hierarchy must remain obvious:

| Type | Treatment | Examples |
|---|---|---|
| Primary | Primary orange | Apply, Post Job, Save Changes, Hire |
| Secondary | Neutral surface/border | View Details, Edit, Preview, Back |
| Opportunity/Secondary Brand | Teal, used selectively | Explore Opportunities — must not compete constantly with the primary orange CTA |
| Destructive | Clear red semantic styling | Close Job, Withdraw, Reject, Delete |
| Text Action | Low-emphasis navigation | View all → |

### §29. One Primary Action Per Local Context

Avoid presenting many actions with equal visual weight (e.g. `Apply | Save | Share | Message | View | More` all equally prominent). Prefer a clear relationship, e.g. `View Details` (secondary) + `Apply` (primary). The interface should help users identify the next most important action immediately.

### §30. Forms

Existing validation and data-handling behavior must remain **independent of** visual redesign.

Visually, forms should have: persistent visible labels, concise explanations, meaningful grouping, clear inline validation, obvious required/preferred distinctions, and obvious submit/save states.

Do not rely on placeholder text as the only field label. Long forms may remain one page when good grouping provides adequate clarity — do not automatically convert every form into a multi-step wizard.

### §31. Required and Preferred Skills

Job posting must clearly differentiate **Required Skills** (workers should satisfy these) from **Preferred Skills** (helpful but not mandatory). This distinction is important to the recommendation methodology and must remain visually understandable.

### §32. Application Status

Compact list views may use a clear status chip. Detailed application views may use a progress representation such as `Applied → Shortlisted → Contacted → Hired`, with the current stage clearly identified.

The interface should answer "what happened?" and "what happens next?" **Visual redesign must never alter the underlying allowed status transitions.**

### §33. Trust and Verification

Verification is a trust signal (e.g. `✓ Verified Employer`, `✓ Verified Worker`). It should be noticeable without becoming visually dominant, and must not look like a recommendation score, mutual fit, rating, or achievement badge — these concepts mean different things.

---

## Part IX — Navigation

### §34. Navigation Philosophy

Navigation must prioritize user concepts rather than exposing every route.

**Worker Desktop — target concept:** `Home · Jobs · Applications · Opportunities`, with an account menu containing `Profile · My CV · Ratings · Sign Out`.

**Worker Mobile — target concept:** approximately `Home · Jobs · Apps · Advice · More`, where `More` exposes `Profile · CV · Ratings · account actions`. **The current problem where important secondary destinations disappear because the mobile bar has limited items must be resolved deliberately.**

**Employer Desktop — target concept:** `Home · Jobs · [prominent + Post a Job action] · organization/account menu`, with the account menu containing `Employer Profile · Verification · Ratings · Sign Out`.

Worker discovery should normally occur inside job context. Do not add a global "Workers" section unless product requirements justify it.

---

## Part X — Responsive & Touch

### §35. Responsive Design Philosophy

Core rule: **Recompose. Never merely shrink.**

Mobile layouts must deliberately reconsider information order, action placement, navigation, card density, filters, form layouts, and interaction targets.

Example: a desktop job detail may use a `Job information | Apply panel` split. Mobile should not simply stack the apply panel after an extremely long description — a sticky or readily accessible mobile action may be appropriate.

Responsive design must consider **task priority**, not only screen width.

### §36. Touch Interaction

Maintain a minimum touch-target philosophy of approximately **44 × 44 px** for important interactive controls. Do not sacrifice touch accessibility to make a design visually tighter — this matters because the platform may be used extensively on mobile devices and in practical work environments.

---

## Part XI — Interactivity & Motion

### §37. Interactivity

Karmasheel should feel highly interactive, but interactivity must communicate meaning. An interaction should usually answer: What can I do? What changed? Why? What happens next?

Appropriate interactions: subtle card hover, active-state changes, tabs, expandable match explanations, accordions, tooltips, removable filter chips, application progress visualization, contextual dropdowns, bottom sheets, modal transitions, result updates, skeleton-to-content transition, success feedback.

### §38. Motion

- Normal microinteraction duration: ≈150–250 ms.
- Larger sheet/dialog transitions: ≈200–300 ms.

Motion should feel responsive rather than theatrical. **Respect reduced-motion preferences.**

### §39. Motion Anti-Patterns

Do not use: repeated fade-up-on-scroll animation on every section, exaggerated spring effects, major card scaling, parallax inside application dashboards, constantly moving gradients, meaningless animated counters, decorative loading animations, or confetti for routine actions.

Motion must communicate state, hierarchy, causality, or progress.

---

## Part XII — Public Website vs. Application UI

### §40. Two Levels of Visual Intensity

Karmasheel has one brand but two levels of visual intensity.

- **Public Website** may be more expressive, more photographic, more spacious, more strongly branded, more narrative, more animated, more typographically distinctive.
- **Product Application** should be calmer, information-first, faster to scan, appropriately dense, interactive through meaningful microinteractions, and less decorative.

The landing page and dashboard should clearly belong to the same product without looking identical.

### §41. Landing-Page Direction

The landing page should **not** use the default SaaS formula of a giant generic headline, gradient background, floating dashboard screenshot, and abstract blobs.

The hero should ideally communicate Karmasheel's two-sided matching concept: worker information on one side, job requirement on the other, with relevant compatibility factors converging toward a transparent match. The visual story should help the visitor understand what Karmasheel does before reading a long explanation.

Primary public CTAs should clearly support the two marketplace sides: **"I am looking for work"** and **"I need workers."**

### §42. Photography and Imagery

Public imagery should emphasize *real people doing real work* — electricians, plumbers, hospitality workers, cleaners, delivery workers, drivers, technicians, repair workers, helpers, caregivers, local businesses. Where feasible, imagery should feel relevant to Nepal and Karmasheel's intended users.

Avoid: skyscraper-office handshakes, unrelated corporate stock imagery, robots, AI brain graphics, random abstract 3D objects.

---

## Part XIII — Density & System States

### §43. Employer Product Density

Worker interfaces should emphasize rapid comprehension and lower cognitive load. Employer interfaces may be moderately denser (candidates, skills, availability, experience, application states, hiring status) — but Karmasheel should never become visually equivalent to dense enterprise HR software.

### §44. Loading States

Use structure-aware skeletons where practical (job-card skeletons for job results, recommendation-card skeletons for recommendations, profile-layout skeletons for profiles). Avoid generic full-screen spinners when the surrounding structure can remain visible. Loading messages should remain honest — do not imply complex AI processing when the frontend is merely waiting for an API response.

### §45. Empty States

Every meaningful empty state should communicate what happened, why this state matters, and what the user can do next.

- **Worker, no applications**: "You haven't applied yet. Explore jobs that match your skills, location, and availability." → *Find Jobs*
- **Employer, no jobs**: "No jobs yet. Post your first requirement to start finding suitable workers." → *Post a Job*
- **No strong recommendations**: "No strong matches right now. Complete your profile or explore opportunities you are close to qualifying for." → *Complete Profile* / *See Opportunities*

### §46. Error States

Avoid generic messages such as "Error." Prefer specific but honest language, e.g. "We couldn't load your recommendations," with a useful recovery action such as *Try Again*. **Do not invent the cause of an error when the frontend does not know the cause.**

---

## Part XIV — Icons & Accessibility

### §47. Icons

Continue using one consistent icon family — currently **Lucide**. Icons should support meaning rather than decorate empty space (e.g. `MapPin` → location, `Calendar` → date, `Clock` → time, `BadgeCheck` → verification, `Briefcase` → work/experience). Important unfamiliar actions should have visible labels. Do not introduce random sparkle icons simply because a feature involves recommendation logic.

### §48. Accessibility

Accessibility is part of the design system, not a later cleanup task. New frontend work must preserve or improve: visible keyboard focus, keyboard navigation, appropriate semantic elements, explicit form labels, adequate color contrast, minimum touch targets, meaningful heading hierarchy, reduced-motion behavior, accessible dialogs, accessible dropdowns, and status information that is not communicated by color alone.

**A visually impressive redesign that weakens accessibility is not an improvement.**

---

## Part XV — Guardrails

### §49. Design Anti-Pattern Blacklist

Future frontend work must avoid the following unless explicitly justified:

- Using purple/blue AI gradients as the Karmasheel identity.
- Using glassmorphism as the default surface language.
- Putting every section inside a card.
- Using enormous rounded corners everywhere.
- Creating huge empty spaces that reduce useful information density.
- Introducing many competing shadows.
- Using arbitrary styling values when existing design tokens can represent the decision.
- Introducing another icon family without strong reason.
- Hand-building new button styles when the shared Button system applies.
- Displaying recommendation scores without explanations when explanations are available.
- Conflating Match Score, Mutual Fit, Verification, Ratings, or Application Status.
- Inventing statistics or backend data.
- Hiding essential actions behind hover-only interactions.
- Making mobile a compressed desktop layout.
- Modifying backend-integrated logic as part of an unrelated visual redesign.
- Adding animation solely to make a screen appear interactive.
- Using unrelated corporate stock photography.
- Imitating Instawork, Wonolo, WorkWhile, Qwick, LinkedIn, Indeed, or another platform's exact visual identity.
- Making the product look like generic AI SaaS software.
- Using decorative charts unless they communicate real and useful information.

---

## Part XVI — System Philosophy

### §50. Component-System Philosophy

**Karmasheel's design system is the authority. An external component library is only an implementation tool.**

If shadcn/ui or another primitive library is introduced later: adoption should be selective; existing Karmasheel component contracts should be preserved where appropriate; the external library must adapt to Karmasheel's visual language; Karmasheel must not be redesigned to look like the component library's default theme.

Potential future primitive-library uses may include `Select`, `DropdownMenu`, `Tabs`, `Sheet`, `Dialog` — when they solve a concrete accessibility or implementation problem. **Do not perform a wholesale component-library migration without an explicit architectural decision.**

### §51. Relationship to Existing Frontend Architecture

The redesign is primarily a UX and visual-system evolution. **Do not assume the existing frontend must be rewritten.**

Existing strengths — separation of API code, data hooks, application state, validation, reusable primitives, shared domain components, centralized design tokens, responsive navigation infrastructure, test coverage — should be preserved unless a deliberate implementation plan identifies a genuine reason to change them.

**Visual redesign and business-logic refactoring should normally be separate tasks.**

### §52. High-Risk Product Semantics

Visual changes must **not** silently alter: authentication behavior, role authorization, verification gating, application status transitions, recommendation meaning, score calculations, reasons/warnings, reciprocal/mutual-fit meaning, CV security behavior, job/worker API contracts, profile PATCH behavior, or location/geocoding behavior.

For high-risk components: **Reskin heavily. Reinterpret never.**

---

## Part XVII — Synthesis

### §53. Karmasheel Interaction Triangle

Major workflows should generally reinforce: **DISCOVER → MATCH → ACT**

- **Discover** — find jobs or workers.
- **Match** — understand suitability.
- **Act** — apply, shortlist, hire, or continue the workflow.

This should guide information hierarchy on major product pages.

### §54. Definition of a Successful Karmasheel Screen

A first-time user should be able to answer within several seconds: Where am I? What is most important here? What can I do next? What does this status mean? If this is a recommendation, why am I seeing it?

A successful design should look recognizably like a modern workforce marketplace while remaining recognizably Karmasheel. The intended reaction is *"This clearly belongs to the workforce-matching category,"* followed by *"But I have not seen this exact product before."*

### §55. Final Design Principle

Karmasheel's uniqueness should not come from visual gimmicks. It should come from making the platform's actual strengths visible: two-sided workforce matching, practical local factors, transparent recommendation reasons, location awareness, structured skills, availability, employer/worker trust, application progress, and opportunity improvement.

The interface should make the logic of Karmasheel understandable without making the system feel technical.

> **Recognizably workforce-oriented. Unmistakably Karmasheel.**

---

## Part XVIII — Repository-Grounded Engineering Constraints

### §56. Constraints Verified Against the Current Codebase

The following constraints come from a direct read-only audit of the existing `frontend/` codebase (not from the product-design brief above) and are binding regardless of how the visual redesign evolves. They exist to protect behavior that is already correct, tested, and aligned with the Django backend.

1. **Preserve the existing API/hooks/state/validation/types separation.** Network calls live only in `src/api/endpoints/`, cache/query logic only in `src/hooks/`, client state only in `src/state/`, business rules only in `src/lib/`/`src/validation/`. Redesign work must not push fetch calls or business logic back into components.
2. **Preserve the single `NavShell` architecture** (`src/components/layout/NavShell.tsx`) unless a later explicit redesign task deliberately changes its information architecture. Its breakpoint-driven behavior (desktop full bar / tablet "More" overflow / mobile bottom tab bar) and its single-landmark accessibility contract must survive a re-skin.
3. **Preserve the recommendation explainability contract**: score, reasons, warnings, and mutual-fit semantics (`RecommendationCard`, `ScoreBar`, `ReasonsList`, `WarningsList`, `MutualFitBadge`, `MatchScoreBadge`) must remain distinct concepts, both visually and in code — this directly reinforces §11 and §13 above.
4. **Preserve application-transition rules and backend-aligned gating** (`src/lib/applicationTransitions.ts`, `ApplicationTransitionActions.tsx`) — this is a hand-maintained mirror of the backend's allowed-transition tables; redesign must not change which transitions the UI offers.
5. **Preserve `CVPreviewFrame` sandboxing/security behavior** — the CV preview renders through a sandboxed `<iframe sandbox="">`, never `dangerouslySetInnerHTML`. This is a deliberate XSS mitigation, not a styling choice.
6. **Preserve verification route gating** (`routes/guards.tsx`'s `RequireVerifiedEmployer`, `EmployerLayout.tsx`'s conditional "Post a Job" nav item, `useEmployerVerificationStatus`) — the frontend gate must stay in lockstep with the backend's `IsVerifiedEmployer` permission.
7. **Preserve existing accessibility strengths**, including the 44px touch-target minimum (`min-h-touch`/`min-w-touch`), `ConfirmDialog`'s focus-trap/Escape/focus-restore handling, and the `prefers-reduced-motion` override already defined in `src/index.css`.
8. **Continue using the existing centralized CSS-variable/Tailwind token architecture** — tokens are defined once in `src/index.css` and surfaced through `tailwind.config.ts`. Any palette evolution (§15–§16 above) should update these tokens at their source, not introduce a parallel styling mechanism.
9. **Do not introduce raw arbitrary colors or spacing when a design token should exist.** The current codebase has near-zero arbitrary Tailwind values (`[...]` syntax) and near-zero raw hex outside the token system — this discipline must be maintained as new UI is built.
10. **If `shadcn/ui` (or another primitive library) is introduced later, adoption must be selective and must serve the Karmasheel design system rather than dictate it** — consistent with §50 above. No wholesale migration without an explicit, separate architectural decision.

---

## Part XIX — Implementation Guardrails for AI Coding Agents

### §57. Guardrails for AI Coding Agents

Any AI coding agent (or human contributor) performing frontend redesign work on Karmasheel must:

- **Read this document before starting any visual or frontend redesign work.** This constitution takes precedence over ad-hoc stylistic judgment calls made mid-implementation.
- **Inspect existing component and API contracts before changing any JSX.** Before modifying a component, read its current props, the hook(s) it calls, and the endpoint(s) those hooks wrap, so the redesign doesn't silently drop or misrepresent data the backend actually returns.
- **Separate visual refactoring from business-logic changes.** A redesign task should not also alter validation rules, state-machine transitions, permission gating, or query/cache behavior in the same change — these are different classes of work with different review needs (see §51–§52).
- **Never invent backend data, statistics, or sub-scores.** If a value isn't provided by the API, it must not appear in the UI, even to make a screen look more complete or impressive (see §12, §46, §49).
- **Reuse existing components where appropriate** rather than hand-building new equivalents of `Button`, `ConfirmDialog`, `StatusBadge`, or the other shared primitives/domain components already in `src/components/primitives/` and `src/components/shared/`. Extending or restyling an existing component is preferred over duplicating it.
- **Document any deliberate deviation from this constitution.** If a redesign task has a genuine, considered reason to diverge from a rule in this document (e.g. a specific token value, an information-architecture change, an exception to an anti-pattern), that deviation and its rationale must be written down at the point of change (commit message, PR description, or an inline comment) rather than silently applied.

---

*This document supersedes ad-hoc styling preference in all future Karmasheel frontend work. It should be revised deliberately and explicitly, not incrementally reinterpreted.*
