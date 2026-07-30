import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { MatchScoreBadge } from './MatchScoreBadge'
import { MutualFitBadge } from './MutualFitBadge'
import { ReasonsList } from './ReasonsList'
import { WarningsList } from './WarningsList'
import { ScoreBar } from './ScoreBar'
import { SkillChipList } from './SkillChipList'
import type { RecommendationResultBase } from '@/types/recommendation'

interface RecommendationCardProps {
  rank: number
  result: RecommendationResultBase
  /** Subject-specific identity block (job title + link, or worker
   * username + skills) — kept as a slot so this one card is reused
   * verbatim for worker-to-job, job-to-worker, and near-miss jobs
   * (design spec §11/§12/§19.2), each with a different subject shape. */
  header: ReactNode
  /** Subject-specific action row (e.g. the worker's Apply action) — omitted
   * entirely for subjects with no action (job-to-worker recommendations
   * have none; there is no "invite to apply" endpoint). */
  footer?: ReactNode
}

/**
 * One ranked recommendation, with an expandable "Why this match?" score
 * breakdown. Renders every component `evaluate_match` computes — never
 * just `final_score` alone, since "explainable" is the whole point of this
 * engine (recommendations/services.py, design spec §11).
 */
export function RecommendationCard({ rank, result, header, footer }: RecommendationCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="shrink-0 text-sm font-semibold text-text-secondary" aria-hidden="true">
            #{rank}
          </span>
          <div className="min-w-0 flex-1">{header}</div>
        </div>
        <MatchScoreBadge score={result.final_score} />
      </div>

      <p className="mt-2 text-sm text-text-secondary">
        {result.distance_km !== null ? `${result.distance_km.toFixed(1)} km away` : 'Distance unknown'}
      </p>

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="mt-3 inline-flex min-h-touch items-center gap-1 text-sm font-semibold text-brand-primary hover:underline"
      >
        {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        {expanded ? 'Hide details' : 'Why this match?'}
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-4 border-t border-text-secondary/10 pt-3">
          <div className="flex flex-col gap-3">
            <ScoreBar label="Skills" score={result.skill.skill_score} />
            <ScoreBar label="Distance" score={result.distance_score} />
            <ScoreBar label="Experience" score={result.experience_score} />
            <ScoreBar label="Availability & wage fit" score={result.availability_preference_score} />
            <ScoreBar label="Trust & reliability" score={result.reliability_verification_score} />
          </div>

          <div>
            <p className="text-sm font-semibold text-text-primary">
              Required skills matched: {result.skill.matched_required_skills.length} · coverage{' '}
              {Math.round(result.skill.required_skill_coverage)}%
            </p>
            {result.skill.matched_required_skills.length > 0 && (
              <div className="mt-1">
                <SkillChipList skills={result.skill.matched_required_skills} />
              </div>
            )}
            {result.skill.missing_required_skills.length > 0 && (
              <div className="mt-2">
                <p className="text-sm text-text-secondary">Missing required skills:</p>
                <SkillChipList skills={result.skill.missing_required_skills} />
              </div>
            )}
          </div>

          <MutualFitBadge score={result.reciprocal_preference_score} />
          <ReasonsList reasons={result.reasons} />
          <WarningsList warnings={result.warnings} />
        </div>
      )}

      {footer && <div className="mt-4">{footer}</div>}
    </div>
  )
}
