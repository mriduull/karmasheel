import { Link } from 'react-router-dom'
import type { MissingSkillAdvisory } from '@/types/recommendation'

interface MissingSkillRowProps {
  advisory: MissingSkillAdvisory
  /** Job titles for `advisory.job_ids`, built once from the same
   * `near_miss_jobs` array the advisory response already returned — no
   * extra request per row. Falls back to "Job #<id>" only if a job id
   * somehow isn't present in that map (shouldn't happen in practice, since
   * `job_ids` is always derived from `near_miss_jobs` server-side). */
  jobTitleById: Map<number, string>
}

/** One ranked missing-skill suggestion, phrased as a sentence rather than a
 * table cell (design spec §12): "**Skill** — needed for N job(s) you're
 * close to qualifying for," with links to the specific jobs it would help
 * unlock. */
export function MissingSkillRow({ advisory, jobTitleById }: MissingSkillRowProps) {
  return (
    <div className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
      <p className="text-base text-text-primary">
        <span className="font-semibold">{advisory.skill.name}</span> — needed for{' '}
        {advisory.missing_frequency} job{advisory.missing_frequency === 1 ? '' : 's'} you're close to
        qualifying for.
      </p>
      {advisory.job_ids.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {advisory.job_ids.map((jobId) => (
            <Link
              key={jobId}
              to={`/jobs/${jobId}`}
              className="text-sm font-semibold text-brand-primary hover:underline"
            >
              {jobTitleById.get(jobId) ?? `Job #${jobId}`}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
