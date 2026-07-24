import { SkillChipList } from './SkillChipList'
import type { WorkerCandidate } from '@/types/job'

interface CandidateCardProps {
  candidate: WorkerCandidate
}

/**
 * Deliberately simpler than `RecommendationCard` — no score bars, no
 * ranking, no "why this match" breakdown, because `WorkerCandidateSerializer`
 * carries none of that (`jobs/views.py:JobCandidatesView` is a coarse,
 * unscored pre-filter, not a ranking). Never synthesize a score here.
 */
export function CandidateCard({ candidate }: CandidateCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
      <p className="text-lg font-semibold text-text-primary">{candidate.username}</p>
      <p className="text-sm text-text-secondary">{candidate.address || 'No address on file'}</p>
      <p className="text-sm text-text-secondary">
        {candidate.experience_years} year{candidate.experience_years === 1 ? '' : 's'} experience ·{' '}
        {candidate.is_available ? 'Available' : 'Not currently available'}
      </p>
      {candidate.expected_wage && (
        <p className="text-sm text-text-secondary">Expects Rs. {candidate.expected_wage}</p>
      )}
      <SkillChipList skills={candidate.skills} />
    </div>
  )
}
