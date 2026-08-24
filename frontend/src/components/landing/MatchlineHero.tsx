import { useEffect, useId, useState } from 'react'
import { ArrowDown, ArrowRight, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { MatchScoreBadge } from '@/components/shared/MatchScoreBadge'

interface MatchFactor {
  id: string
  label: string
  explanation: string
}

/**
 * Fixed, illustrative example content only — never backend data. Mirrors
 * the real `RecommendationResultBase` factors (types/recommendation.ts) in
 * spirit (skills, distance, availability, experience) without importing
 * that type, since this is a marketing example, not a live recommendation.
 */
const MATCH_FACTORS: MatchFactor[] = [
  {
    id: 'skills',
    label: 'Skills',
    explanation: 'Ram’s wiring and panel-repair skills match what this job requires.',
  },
  {
    id: 'distance',
    label: 'Distance',
    explanation: 'Only 1.8 km from Ram’s saved location in Patan.',
  },
  {
    id: 'availability',
    label: 'Availability',
    explanation: 'Ram is free tomorrow — exactly when this job needs to start.',
  },
  {
    id: 'experience',
    label: 'Experience',
    explanation: '4 years of electrical work, above what this job asks for.',
  },
]

const EXAMPLE_SCORE = 87

const FACTOR_DELAY_CLASSES = ['delay-0', 'delay-150', 'delay-300', 'delay-500']

/**
 * The hero's interactive Matchline demonstration — a fixed, clearly
 * labeled example (Ram Bahadur / Electrician Required), not a live
 * recommendation; no query, no auth, no network call. Factors resolve
 * once on mount via CSS `transition-delay` (never a JS `setTimeout`
 * chain), so `motion-reduce:` utilities below fully cover reduced-motion
 * behavior with no extra branching. Each factor is independently
 * expandable to show why it matches — the same "Why this match?"
 * convention `RecommendationCard` uses lower on the page — and the score
 * reuses the real `MatchScoreBadge` atom, so this demo and the real
 * explained-match example later on the page share one visual language.
 */
export function MatchlineHero() {
  const [resolved, setResolved] = useState(false)
  const [expandedFactor, setExpandedFactor] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const headingId = useId()

  useEffect(() => {
    const frame = requestAnimationFrame(() => setResolved(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!resolved) return
    setAnnouncement(
      `Example match resolved: ${EXAMPLE_SCORE} out of 100 match between Ram Bahadur and Electrician Required.`,
    )
  }, [resolved])

  return (
    <div role="group" aria-labelledby={headingId}>
      <p id={headingId} className="sr-only">
        Example of how Karmasheel explains a match
      </p>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:gap-4 lg:gap-6">
        <div className="flex-1 rounded-md border border-text-secondary/10 bg-surface p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Worker</p>
          <p className="mt-1 font-display text-xl font-semibold text-text-primary">Ram Bahadur</p>
          <p className="text-base text-text-secondary">Electrician &middot; Patan</p>
          <p className="mt-2 text-sm font-semibold text-brand-secondary">Available tomorrow</p>
        </div>

        <Connector />

        <div className="flex-1 rounded-md border border-dashed border-text-secondary/20 bg-surface-muted p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Match factors
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {MATCH_FACTORS.map((factor, index) => (
              <FactorItem
                key={factor.id}
                factor={factor}
                delayClass={FACTOR_DELAY_CLASSES[index] ?? 'delay-0'}
                resolved={resolved}
                expanded={expandedFactor === factor.id}
                onToggle={() =>
                  setExpandedFactor((current) => (current === factor.id ? null : factor.id))
                }
              />
            ))}
          </ul>
          <div
            className={`mt-3 flex justify-center transition-all delay-700 duration-500 motion-reduce:delay-0 motion-reduce:duration-0 ${
              resolved ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <MatchScoreBadge score={EXAMPLE_SCORE} />
          </div>
        </div>

        <Connector />

        <div className="flex-1 rounded-md border border-text-secondary/10 bg-surface p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Job</p>
          <p className="mt-1 font-display text-xl font-semibold text-text-primary">
            Electrician Required
          </p>
          <p className="text-base text-text-secondary">Patan &middot; Tomorrow</p>
          <p className="mt-2 text-sm font-semibold text-brand-primary">Rs. 1,500 / day</p>
        </div>
      </div>

      <p className="mt-4 text-center text-sm text-text-secondary">
        Example match &mdash; illustrative, not a live recommendation.
      </p>
    </div>
  )
}

function Connector() {
  return (
    <div className="flex shrink-0 items-center justify-center text-text-secondary/50" aria-hidden="true">
      <ArrowDown size={22} className="md:hidden" />
      <ArrowRight size={22} className="hidden md:block" />
    </div>
  )
}

function FactorItem({
  factor,
  delayClass,
  resolved,
  expanded,
  onToggle,
}: {
  factor: MatchFactor
  delayClass: string
  resolved: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const explanationId = useId()

  return (
    <li
      className={`transition-all duration-500 ${delayClass} motion-reduce:duration-0 motion-reduce:delay-0 ${
        resolved ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={explanationId}
        className="flex min-h-touch w-full items-center justify-between gap-2 rounded-sm px-2 text-left text-base font-medium text-text-primary hover:bg-surface"
      >
        <span className="flex items-center gap-2">
          <CheckCircle2 size={18} className="shrink-0 text-success-text" aria-hidden="true" />
          {factor.label}
        </span>
        {expanded ? (
          <ChevronUp size={16} aria-hidden="true" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </button>
      {expanded && (
        <p id={explanationId} className="px-2 pb-1 text-sm text-text-secondary">
          {factor.explanation}
        </p>
      )}
    </li>
  )
}
