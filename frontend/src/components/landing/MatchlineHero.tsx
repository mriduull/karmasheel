import { useEffect, useId, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
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
 * A delivery rider example (distinct from the hero's electrician imagery)
 * so the landing page represents more than one occupation.
 */
const MATCH_FACTORS: MatchFactor[] = [
  {
    id: 'skills',
    label: 'Skills',
    explanation: 'Suman’s two-wheeler delivery and route navigation skills match what this job requires.',
  },
  {
    id: 'distance',
    label: 'Distance',
    explanation: 'Only 1.8 km from Suman’s saved location in Patan.',
  },
  {
    id: 'availability',
    label: 'Availability',
    explanation: 'Suman is free tomorrow — exactly when this job needs to start.',
  },
  {
    id: 'experience',
    label: 'Experience',
    explanation: '3 years of delivery riding experience, above what this job asks for.',
  },
]

const EXAMPLE_SCORE = 87

const FACTOR_DELAY_CLASSES = ['delay-0', 'delay-150', 'delay-300', 'delay-500']

/**
 * A clean, reference-style image+text promotional section — "Don't just
 * see the score. See why." — built around a fixed, clearly labeled
 * example (Suman Thapa / Delivery Rider Required), not a live
 * recommendation; no query, no auth, no network call. The interactive
 * per-factor expand/collapse behavior (each factor independently toggled
 * to show why it matches, same "Why this match?" convention
 * `RecommendationCard` uses lower on the page) is preserved exactly —
 * only the surrounding presentation changed from a three-box diagram to
 * this two-column promo composition. The score reuses the real
 * `MatchScoreBadge` atom, so this demo and the real explained-match
 * example later on the page share one visual language.
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
      `Example match resolved: ${EXAMPLE_SCORE} out of 100 match between Suman Thapa and Delivery Rider Required.`,
    )
  }, [resolved])

  return (
    <div role="group" aria-labelledby={headingId} className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <img
        src="/images/landing/delivery-match.png"
        alt="Delivery rider on a motorcycle in an urban work setting"
        className="h-64 w-full rounded-md object-cover lg:h-80"
      />

      <div>
        <h2 id={headingId} className="font-display text-2xl font-semibold text-text-primary">
          Don&rsquo;t just see the score. See why.
        </h2>
        <p className="mt-2 text-base text-text-secondary">
          <span className="font-semibold text-text-primary">Suman Thapa</span> &harr;{' '}
          <span className="font-semibold text-text-primary">Delivery Rider Required</span>
        </p>

        <div className="mt-4 flex items-center gap-4">
          <MatchScoreBadge score={EXAMPLE_SCORE} />
          <ul className="flex flex-1 flex-col gap-1.5">
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
        </div>

        <p className="mt-4 text-sm text-text-secondary">
          Example match &mdash; illustrative, not a live recommendation.
        </p>
      </div>
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
        className="flex min-h-touch w-full items-center justify-between gap-2 rounded-sm px-2 text-left text-base font-medium text-text-primary hover:bg-surface-muted"
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
