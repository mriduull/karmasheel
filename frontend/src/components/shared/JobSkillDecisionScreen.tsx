import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { updateJob } from '@/api/endpoints/jobs'
import { ApiError, toBannerMessage } from '@/api/errors'
import { MY_JOBS_QUERY_KEY } from '@/hooks/useMyJobs'
import { ownerJobQueryKey } from '@/hooks/useOwnerJob'
import type { EmployerJobPost } from '@/types/job'
import type { SkillMatch } from '@/types/profile'
import type { SkillTagSummary } from '@/types/skill'
import { Button } from '@/components/primitives/Button'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { SkillMatchReview } from './SkillMatchReview'
import { UnmatchedTermNotice } from './UnmatchedTermNotice'

type SkillKind = 'required' | 'preferred'

interface JobSkillDecisionScreenProps {
  job: EmployerJobPost
  wasCreated: boolean
}

const reviewable = (matches: SkillMatch[]) =>
  matches.filter((match) => match.matched_skill !== null && match.method !== 'exact_name')

export function JobSkillDecisionScreen({ job: initialJob, wasCreated }: JobSkillDecisionScreenProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [job, setJob] = useState(initialJob)
  const [requiredNames, setRequiredNames] = useState(() => job.required_skills.map((skill) => skill.name))
  const [preferredNames, setPreferredNames] = useState(() => job.preferred_skills.map((skill) => skill.name))
  const [requiredMatches, setRequiredMatches] = useState(() => reviewable(job.required_skill_matches))
  const [preferredMatches, setPreferredMatches] = useState(() => reviewable(job.preferred_skill_matches))
  const [requiredReviews, setRequiredReviews] = useState<string[]>([])
  const [preferredReviews, setPreferredReviews] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const updateNames = (kind: SkillKind, updater: (names: string[]) => string[]) => {
    if (kind === 'required') setRequiredNames(updater)
    else setPreferredNames(updater)
  }
  const updateMatches = (kind: SkillKind, updater: (matches: SkillMatch[]) => SkillMatch[]) => {
    if (kind === 'required') setRequiredMatches(updater)
    else setPreferredMatches(updater)
  }

  const accept = (kind: SkillKind, match: SkillMatch) => {
    updateMatches(kind, (matches) => matches.filter((candidate) => candidate !== match))
  }

  const choose = (kind: SkillKind, match: SkillMatch, replacement: SkillTagSummary) => {
    const matchedName = match.matched_skill?.name
    updateNames(kind, (names) => {
      const withoutMatch = matchedName ? names.filter((name) => name !== matchedName) : names
      return withoutMatch.includes(replacement.name) ? withoutMatch : [...withoutMatch, replacement.name]
    })
    updateMatches(kind, (matches) => matches.filter((candidate) => candidate !== match))
  }

  const requestReview = (kind: SkillKind, match: SkillMatch) => {
    const matches = kind === 'required' ? requiredMatches : preferredMatches
    const matchedSkill = match.matched_skill
    const anotherPhraseKeepsSkill = Boolean(
      matchedSkill && matches.some((candidate) => candidate !== match && candidate.matched_skill?.id === matchedSkill.id),
    )
    if (matchedSkill && !anotherPhraseKeepsSkill) {
      updateNames(kind, (names) => names.filter((name) => name !== matchedSkill.name))
    }
    updateMatches(kind, (current) => current.filter((candidate) => candidate !== match))
    if (kind === 'required') {
      setRequiredReviews((terms) => terms.includes(match.input_term) ? terms : [...terms, match.input_term])
    } else {
      setPreferredReviews((terms) => terms.includes(match.input_term) ? terms : [...terms, match.input_term])
    }
  }

  const saveDecisions = async () => {
    setError(null)
    setIsSaving(true)
    try {
      const updated = await updateJob(job.id, {
        required_skills_input: requiredNames,
        preferred_skills_input: preferredNames,
        required_skills_review_input: requiredReviews,
        preferred_skills_review_input: preferredReviews,
      })
      setJob(updated)
      queryClient.setQueryData(ownerJobQueryKey(updated.id), updated)
      await queryClient.invalidateQueries({ queryKey: MY_JOBS_QUERY_KEY })
      setIsFinished(true)
    } catch (saveError) {
      setError(saveError instanceof ApiError ? toBannerMessage(saveError) : 'Could not save the skill decisions. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const cards: Array<{ kind: SkillKind; match: SkillMatch }> = [
    ...requiredMatches.map((match) => ({ kind: 'required' as const, match })),
    ...preferredMatches.map((match) => ({ kind: 'preferred' as const, match })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div role="status" className="rounded-md bg-success-bg p-4 text-success-text">
        <p className="font-semibold">{wasCreated ? 'Job published.' : 'Job updated.'}</p>
        {!isFinished && cards.length > 0 && <p className="mt-1 text-sm">Check the automatic skill matches below before continuing.</p>}
        {isFinished && <p className="mt-1 text-sm">Skill decisions saved.</p>}
      </div>
      {error && <ErrorBanner message={error} />}
      {!isFinished && cards.map(({ kind, match }) => (
        <div key={`${kind}-${match.input_term}-${match.matched_skill?.id ?? 'unmatched'}`} className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-text-primary">{kind === 'required' ? 'Required skill' : 'Preferred skill'}</p>
          <SkillMatchReview
            match={match}
            onAccept={() => accept(kind, match)}
            onChoose={(skill) => choose(kind, match, skill)}
            onRequestReview={() => requestReview(kind, match)}
          />
        </div>
      ))}
      <UnmatchedTermNotice terms={[...job.unmatched_required_terms, ...job.unmatched_preferred_terms]} />
      {!isFinished && (cards.length > 0 || requiredReviews.length > 0 || preferredReviews.length > 0) && (
        <Button type="button" onClick={saveDecisions} isLoading={isSaving} className="self-start">
          Save skill decisions
        </Button>
      )}
      <Button type="button" variant={isFinished || cards.length === 0 ? 'primary' : 'secondary'} onClick={() => navigate(`/employer/jobs/${job.id}`)} className="self-start">
        View Job
      </Button>
    </div>
  )
}
